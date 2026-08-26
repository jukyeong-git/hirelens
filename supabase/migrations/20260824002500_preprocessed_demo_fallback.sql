-- Deterministic, synthetic-only offline demo evidence. The installer is
-- service-role-only, idempotent, and uses the same validated persistence RPC
-- as the live worker. It never deletes or resets Alpha data.

create function public.install_preprocessed_demo_evidence()
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  target_application constant uuid := '50000000-0000-0000-0000-000000000001';
  target_resume constant uuid := '60000000-0000-0000-0000-000000000001';
  target_run constant uuid := '70000000-0000-0000-0000-000000000001';
  target_page constant uuid := '80000000-0000-0000-0000-000000000001';
  target_scorecard constant uuid := '20000000-0000-0000-0000-000000000001';
  source_text constant text := 'Operated a production backend service and led deployments and incident response for a synthetic commerce platform.';
  source_hash text := encode(extensions.digest(source_text, 'sha256'), 'hex');
  required_criterion uuid;
  human_only_criterion uuid;
begin
  perform public.require_worker_service_role();

  if exists (select 1 from public.processing_runs where id = target_run) then
    return target_run;
  end if;
  if not exists (
    select 1 from public.scorecard_versions
    where id = target_scorecard and approved_at is not null
      and status in ('APPROVED'::public.scorecard_status, 'SUPERSEDED'::public.scorecard_status)
  ) then
    raise exception 'preprocessed fallback requires the approved synthetic scorecard'
      using errcode = '55000';
  end if;

  select id into required_criterion from public.criteria
  where scorecard_version_id = target_scorecard and client_id = 'criterion-draft-1';
  select id into human_only_criterion from public.criteria
  where scorecard_version_id = target_scorecard and client_id = 'criterion-draft-2';
  if required_criterion is null or human_only_criterion is null then
    raise exception 'preprocessed fallback criteria are missing' using errcode = '55000';
  end if;

  insert into public.resume_files (
    id, application_id, storage_path, original_filename, mime_type, byte_size, sha256,
    intake_status, synthetic_or_anonymized_attested, attested_by, attested_at
  ) values (
    target_resume, target_application, 'synthetic-fallback/preprocessed-demo.pdf',
    'synthetic-preprocessed-demo.pdf', 'application/pdf', 1024, repeat('d', 64),
    'UPLOADED', true, '00000000-0000-0000-0000-000000000001', now()
  ) on conflict (id) do nothing;

  insert into public.processing_runs (
    id, application_id, resume_file_id, scorecard_version_id, pipeline_version,
    status, attempt_count
  ) values (
    target_run, target_application, target_resume, target_scorecard,
    'evidence-pipeline-v1-preprocessed', 'ANALYZING', 1
  );
  insert into public.resume_pages (
    id, resume_file_id, processing_run_id, page_number, raw_text, normalized_text,
    raw_text_sha256, normalized_text_sha256
  ) values (
    target_page, target_resume, target_run, 1, source_text, source_text,
    source_hash, source_hash
  );

  perform public.mark_evidence_validating(
    target_run, 'evidence-extraction-prompt-v1', 'evidence-extraction-schema-v1',
    'PREPROCESSED_SYNTHETIC', null, 0, 0, 0, 0, 0
  );
  perform public.persist_validated_evidence(
    target_run,
    jsonb_build_array(
      jsonb_build_object(
        'criterion_id', required_criterion,
        'status', 'SUPPORTED',
        'evidence', jsonb_build_array(jsonb_build_object(
          'page_number', 1,
          'exact_quote', source_text,
          'source_quote_hash', source_hash,
          'source_page_hash', source_hash
        )),
        'interpretation', '운영 서비스의 배포와 장애 대응 책임이 제출 자료에 직접 명시되어 있습니다.',
        'uncertainty', '서비스 규모와 담당 범위는 인터뷰에서 추가 확인이 필요합니다.',
        'suggested_interview_question', '가장 복잡했던 장애에서 본인이 맡은 대응 범위를 설명해 주세요.'
      ),
      jsonb_build_object(
        'criterion_id', human_only_criterion,
        'status', 'HUMAN_ONLY',
        'evidence', '[]'::jsonb,
        'interpretation', '커뮤니케이션 방식은 이력서만으로 판단하지 않습니다.',
        'uncertainty', '면접에서 사람이 확인해야 합니다.',
        'suggested_interview_question', '복잡한 기술 결정을 팀에 설명했던 사례를 말해 주세요.'
      )
    )
  );
  return target_run;
end
$$;

revoke execute on function public.install_preprocessed_demo_evidence() from public, anon, authenticated;
grant execute on function public.install_preprocessed_demo_evidence() to service_role;
