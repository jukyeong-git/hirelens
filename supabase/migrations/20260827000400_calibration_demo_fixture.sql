-- Deterministic synthetic FW-2 fixture for hosted Alpha. Installation is an
-- explicit service-role action and never deletes or resets shared data.

create function public.install_criterion_calibration_demo_fixture()
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  target_job constant uuid := '10000000-0000-0000-0000-000000000002';
  target_scorecard constant uuid := '20000000-0000-0000-0000-000000000002';
  criterion_1 constant uuid := '21000000-0000-0000-0000-000000000021';
  criterion_2 constant uuid := '21000000-0000-0000-0000-000000000022';
  lineage_1 constant uuid := '22000000-0000-0000-0000-000000000021';
  lineage_2 constant uuid := '22000000-0000-0000-0000-000000000022';
  ordinal integer;
  candidate_id uuid;
  application_id uuid;
  resume_file_id uuid;
  run_id uuid;
  page_id uuid;
  session_id uuid;
  review_id uuid;
  source_text text;
  source_hash text;
begin
  perform public.require_worker_service_role();

  if not exists (
    select 1 from public.profiles
    where id in (
      '00000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000002'::uuid,
      '00000000-0000-0000-0000-000000000004'::uuid
    )
    having count(*) = 3
  ) then
    raise exception 'synthetic demo profiles are required' using errcode = '55000';
  end if;

  if not exists (select 1 from public.jobs where id = target_job) then
    insert into public.jobs (
      id, title, department, hiring_need, raw_job_description,
      recruiter_id, hiring_manager_id, is_synthetic_demo
    ) values (
      target_job,
      'Platform Engineer',
      'Infrastructure',
      'Improve deployment tooling and observability for HireLens.',
      'Build and operate reliable synthetic platform services.',
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000004',
      true
    );
  end if;

  if not exists (
    select 1 from public.scorecard_versions where id = target_scorecard
  ) then
    insert into public.scorecard_versions (
      id, job_id, version_number, status, source_job_description_hash,
      prompt_version, schema_version, model_id, ambiguous_phrases, created_by
    ) values (
      target_scorecard,
      target_job,
      1,
      'DRAFT',
      repeat('9', 64),
      'review-framework-manual-v1',
      'review-framework-manual-v1',
      'HUMAN_AUTHORED',
      '[]'::jsonb,
      '00000000-0000-0000-0000-000000000004'
    );
    insert into public.criteria (
      id, scorecard_version_id, client_id, name, type, definition,
      accepted_evidence, alternative_evidence, partial_evidence_guidance,
      resume_assessable, evidence_fields, ambiguity_status, lineage_id,
      lineage_origin, display_order
    ) values
      (
        criterion_1,
        target_scorecard,
        'seed-platform-criterion-1',
        'Platform operations experience',
        'REQUIRED',
        'Experience improving deployment tooling or observability.',
        '["Deployment or observability example"]'::jsonb,
        '[]'::jsonb,
        'Learning-only use does not establish production scope.',
        true,
        '[{"field_name":"case","description":"Deployment or observability example"}]'::jsonb,
        'CLEAR',
        lineage_1,
        'ORIGINAL',
        0
      ),
      (
        criterion_2,
        target_scorecard,
        'seed-platform-criterion-2',
        'Incident response ownership',
        'PREFERRED',
        'Experience owning a production incident response.',
        '["Production incident response example"]'::jsonb,
        '[]'::jsonb,
        null,
        true,
        '[{"field_name":"incident","description":"Production incident response example"}]'::jsonb,
        'CLEAR',
        lineage_2,
        'ORIGINAL',
        1
      );
    update public.scorecard_versions
    set status = 'APPROVED',
        approved_by = '00000000-0000-0000-0000-000000000004',
        approved_at = now()
    where id = target_scorecard;
    update public.jobs
    set status = 'READY_FOR_INTAKE'
    where id = target_job;
  end if;

  if not exists (
    select 1 from public.criteria
    where id in (criterion_1, criterion_2)
    having count(*) = 2
  ) then
    raise exception 'synthetic calibration criteria are incomplete' using errcode = '55000';
  end if;

  for ordinal in 1..7 loop
    candidate_id := (
      '40000000-0000-0000-0000-' || lpad((100 + ordinal)::text, 12, '0')
    )::uuid;
    application_id := (
      '50000000-0000-0000-0000-' || lpad((100 + ordinal)::text, 12, '0')
    )::uuid;
    if exists (select 1 from public.applications where id = application_id) then
      continue;
    end if;
    resume_file_id := (
      '60000000-0000-0000-0000-' || lpad((100 + ordinal)::text, 12, '0')
    )::uuid;
    run_id := (
      '70000000-0000-0000-0000-' || lpad((100 + ordinal)::text, 12, '0')
    )::uuid;
    page_id := (
      '80000000-0000-0000-0000-' || lpad((100 + ordinal)::text, 12, '0')
    )::uuid;
    session_id := (
      '90000000-0000-0000-0000-' || lpad((100 + ordinal)::text, 12, '0')
    )::uuid;
    review_id := (
      'a0000000-0000-0000-0000-' || lpad((100 + ordinal)::text, 12, '0')
    )::uuid;
    source_text := case
      when ordinal = 5 then
        'Operated production deployment tooling and led incident response.'
      else
        'Used deployment tooling for a synthetic personal learning project.'
    end;
    source_hash := encode(extensions.digest(source_text, 'sha256'), 'hex');

    insert into public.candidates (id, demo_label)
    values (candidate_id, 'Synthetic Calibration Candidate ' || ordinal);
    insert into public.applications (
      id, candidate_id, job_id, source, workflow_state
    ) values (
      application_id,
      candidate_id,
      target_job,
      'DEMO_SEED',
      case when ordinal = 7 then 'INTERVIEW_SELECTED' else 'INTERVIEW_COMPLETED' end
    );
    insert into public.review_assignments (
      application_id, assigned_to, assigned_by, status
    ) values (
      application_id,
      '00000000-0000-0000-0000-000000000004',
      '00000000-0000-0000-0000-000000000002',
      'ACTIVE'
    );
    insert into public.interview_progression_reviews (
      application_id, scorecard_version_id, reviewer_id, outcome, reason
    ) values (
      application_id,
      target_scorecard,
      '00000000-0000-0000-0000-000000000004',
      'INTERVIEW',
      'Synthetic interview progression'
    );
    insert into public.resume_files (
      id, application_id, storage_path, original_filename, mime_type, byte_size,
      sha256, intake_status, synthetic_or_anonymized_attested, attested_by, attested_at
    ) values (
      resume_file_id,
      application_id,
      'synthetic-calibration/' || resume_file_id || '.pdf',
      'synthetic-calibration-' || ordinal || '.pdf',
      'application/pdf',
      1024,
      source_hash,
      'UPLOADED',
      true,
      '00000000-0000-0000-0000-000000000001',
      now()
    );
    insert into public.processing_runs (
      id, application_id, resume_file_id, scorecard_version_id, pipeline_version,
      prompt_version, schema_version, model_id, status, attempt_count, completed_at
    ) values (
      run_id,
      application_id,
      resume_file_id,
      target_scorecard,
      'calibration-seed-v1',
      'calibration-seed-v1',
      'calibration-seed-v1',
      'PREPROCESSED_SYNTHETIC',
      'COMPLETED',
      1,
      now()
    );
    insert into public.resume_pages (
      id, resume_file_id, processing_run_id, page_number, raw_text,
      normalized_text, raw_text_sha256, normalized_text_sha256
    ) values (
      page_id,
      resume_file_id,
      run_id,
      1,
      source_text,
      source_text,
      source_hash,
      source_hash
    );
    insert into public.evidence_items (
      processing_run_id, criterion_id, status, source_ordinal, resume_page_id,
      exact_quote, interpretation, uncertainty, source_quote_hash, source_page_hash
    ) values
      (
        run_id,
        criterion_1,
        'SUPPORTED',
        1,
        page_id,
        source_text,
        'Synthetic source-validated platform evidence.',
        'Production scope requires human confirmation.',
        source_hash,
        source_hash
      ),
      (
        run_id,
        criterion_2,
        'NOT_FOUND',
        0,
        null,
        null,
        'No supporting evidence was found in the submitted synthetic material.',
        'Interview confirmation remains available.',
        null,
        null
      );

    if ordinal <= 6 then
      insert into public.interview_observation_sessions (
        id, application_id, scorecard_version_id, reviewer_id
      ) values (
        session_id,
        application_id,
        target_scorecard,
        '00000000-0000-0000-0000-000000000004'
      );
      insert into public.interview_observations (
        interview_observation_session_id, application_id, criterion_id,
        criterion_lineage_id, verdict, weakness_type, source, confirmed_at, observer_id
      ) values
        (
          session_id,
          application_id,
          criterion_1,
          lineage_1,
          (
            case when ordinal = 5 then 'MATCHED' else 'WEAKER' end
          )::public.interview_criterion_verdict,
          case
            when ordinal between 1 and 4 then 'LEVEL_INSUFFICIENT'
            when ordinal = 6 then 'FALSE_CLAIM'
            else null
          end::public.interview_weakness_type,
          'FORM',
          now(),
          '00000000-0000-0000-0000-000000000004'
        ),
        (
          session_id,
          application_id,
          criterion_2,
          lineage_2,
          'NOT_ASKED',
          null,
          'FORM',
          now(),
          '00000000-0000-0000-0000-000000000004'
        );
      insert into public.human_reviews (
        id, application_id, scorecard_version_id, reviewer_id, decision,
        reason_code, reason_detail, confidence, observation_session_id
      ) values (
        review_id,
        application_id,
        target_scorecard,
        '00000000-0000-0000-0000-000000000004',
        case when ordinal = 5 then 'PROCEED' else 'HOLD' end::public.human_decision,
        'EVIDENCE_REVIEW',
        'Synthetic post-interview calibration decision.',
        'MEDIUM',
        session_id
      );
    end if;
  end loop;

  return target_job;
end;
$$;
revoke execute on function public.install_criterion_calibration_demo_fixture()
  from public, anon, authenticated;
grant execute on function public.install_criterion_calibration_demo_fixture()
  to service_role;
