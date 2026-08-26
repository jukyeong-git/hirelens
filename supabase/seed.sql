-- Synthetic-only demo seed. Passwords and email addresses are not real credentials.

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'admin@demo.hirelens.example',
    extensions.crypt('DemoPass123!', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Demo Admin"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'recruiter@demo.hirelens.example',
    extensions.crypt('DemoPass123!', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Demo Recruiter"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'hiring-manager@demo.hirelens.example',
    extensions.crypt('DemoPass123!', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Demo Hiring Manager"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000004',
    'authenticated',
    'authenticated',
    'second-manager@demo.hirelens.example',
    extensions.crypt('DemoPass123!', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Demo Platform Hiring Manager"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000005',
    'authenticated',
    'authenticated',
    'requisition-approver@demo.hirelens.example',
    extensions.crypt('DemoPass123!', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Demo Requisition Approver"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
on conflict do nothing;

insert into auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  created_at,
  updated_at
)
select
  seed.provider_id,
  seed.user_id::uuid,
  seed.identity_data,
  seed.provider,
  seed.created_at,
  seed.updated_at
from (
  values
    (
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000001',
      '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@demo.hirelens.example"}'::jsonb,
      'email',
      now(),
      now()
    ),
    (
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000002',
      '{"sub":"00000000-0000-0000-0000-000000000002","email":"recruiter@demo.hirelens.example"}'::jsonb,
      'email',
      now(),
      now()
    ),
    (
      '00000000-0000-0000-0000-000000000003',
      '00000000-0000-0000-0000-000000000003',
      '{"sub":"00000000-0000-0000-0000-000000000003","email":"hiring-manager@demo.hirelens.example"}'::jsonb,
      'email',
      now(),
      now()
    ),
    (
      '00000000-0000-0000-0000-000000000004',
      '00000000-0000-0000-0000-000000000004',
      '{"sub":"00000000-0000-0000-0000-000000000004","email":"second-manager@demo.hirelens.example"}'::jsonb,
      'email',
      now(),
      now()
    ),
    (
      '00000000-0000-0000-0000-000000000005',
      '00000000-0000-0000-0000-000000000005',
      '{"sub":"00000000-0000-0000-0000-000000000005","email":"requisition-approver@demo.hirelens.example"}'::jsonb,
      'email',
      now(),
      now()
    )
) as seed (
  provider_id, user_id, identity_data, provider, created_at, updated_at
)
-- A demo account recreated outside the seed keeps its own id, so the
-- matching user row is skipped above. Only link identities that resolve.
where exists (select 1 from auth.users u where u.id = seed.user_id::uuid)
on conflict do nothing;

insert into public.profiles (id, display_name, role)
select seed.id::uuid, seed.display_name, seed.role::public.app_role
from (
  values
    ('00000000-0000-0000-0000-000000000001', 'Admin', 'ADMIN'),
    ('00000000-0000-0000-0000-000000000002', 'Recruiter', 'RECRUITER'),
    ('00000000-0000-0000-0000-000000000003', 'Hiring Manager', 'HIRING_MANAGER'),
    ('00000000-0000-0000-0000-000000000004', 'Platform Hiring Manager', 'HIRING_MANAGER'),
    ('00000000-0000-0000-0000-000000000005', 'Requisition Approver', 'REQUISITION_APPROVER')
) as seed (id, display_name, role)
-- A demo account recreated outside the seed keeps its own id, so the matching
-- auth user is skipped above and this profile would break its foreign key.
where exists (select 1 from auth.users u where u.id = seed.id::uuid)
on conflict do nothing;

-- The Requisition Approver workflow is deferred from the MVP
-- (20260825000500) and `requisition_approver_id` is nullable. Resolve it
-- by role instead of a fixed id so a demo account recreated outside the
-- seed does not block the whole fixture.
insert into public.jobs (
  id,
  title,
  department,
  raw_job_description,
  status,
  recruiter_id,
  hiring_manager_id,
  requisition_approver_id,
  is_synthetic_demo
)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'Backend Engineer',
    'Engineering',
    'Build and operate reliable backend services for HireLens.',
    'DRAFT',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000003',
    (select profile.id from public.profiles profile
     where profile.role = 'REQUISITION_APPROVER'::public.app_role limit 1),
    true
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'Platform Engineer',
    'Infrastructure',
    'Improve deployment tooling and observability for HireLens.',
    'DRAFT',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000004',
    (select profile.id from public.profiles profile
     where profile.role = 'REQUISITION_APPROVER'::public.app_role limit 1),
    true
  )
on conflict do nothing;

insert into public.scorecard_versions (
  id,
  job_id,
  version_number,
  status,
  source_job_description_hash,
  prompt_version,
  schema_version,
  model_id,
  ambiguous_phrases,
  created_by
)
values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  1,
  'DRAFT',
  '844f648bb5bb9a9c5e630aafed83e94b99bf8284009483528449fc9191363261',
  'scorecard-v1',
  'scorecard-v1',
  'gpt-5.6-luna',
  '[{"source_phrase":"Good communication skills","ambiguity_note":"이력서만으로 일관되게 검증하기 어려운 표현","ambiguity_status":"HUMAN_ONLY","suggested_interview_question":"복잡한 장애나 설계 결정을 팀에 설명했던 상황을 설명해 주세요."}]'::jsonb,
  '00000000-0000-0000-0000-000000000002'
)
on conflict do nothing;

insert into public.criteria (
  scorecard_version_id,
  client_id,
  name,
  type,
  definition,
  accepted_evidence,
  alternative_evidence,
  resume_assessable,
  evidence_fields,
  source_phrase,
  ambiguity_note,
  ambiguity_status,
  suggested_interview_question,
  display_order
)
values
  (
    '20000000-0000-0000-0000-000000000001',
    'criterion-draft-1',
    '운영 환경 백엔드 개발 경험',
    'REQUIRED',
    '운영 서비스에서 백엔드 시스템을 개발하고 운영한 경험',
    '["운영 서비스 책임 범위가 명시됨","배포 또는 장애 대응 사례가 명시됨"]'::jsonb,
    '["유사한 고가용성 서비스 운영 경험"]'::jsonb,
    true,
    '[{"field_name":"operational_scope","description":"운영 서비스 책임 범위"},{"field_name":"incident_response","description":"배포 또는 장애 대응 사례"}]'::jsonb,
    'Build and operate reliable backend services',
    null,
    'CLEAR',
    null,
    0
  ),
  (
    '20000000-0000-0000-0000-000000000001',
    'criterion-draft-2',
    '커뮤니케이션 방식',
    'INTERVIEW_ONLY',
    '협업 상황에서 기술적 맥락과 의사결정을 설명하는 방식',
    '[]'::jsonb,
    '[]'::jsonb,
    false,
    '[]'::jsonb,
    'Good communication skills',
    '이력서만으로 일관되게 검증하기 어려운 표현',
    'HUMAN_ONLY',
    '복잡한 장애나 설계 결정을 팀에 설명했던 상황을 설명해 주세요.',
    1
  )
on conflict do nothing;

-- A separate published synthetic fixture makes the public Career Site
-- demonstrable without mutating the recruiter-workflow draft fixture above.
update public.jobs
set requisition_status = 'APPROVED',
    submitted_at = now(),
    approval_reason = 'Synthetic public Career Site fixture.',
    approved_or_returned_at = now()
where id = '10000000-0000-0000-0000-000000000002';

insert into public.scorecard_versions (
  id,
  job_id,
  version_number,
  status,
  source_job_description_hash,
  prompt_version,
  schema_version,
  model_id,
  ambiguous_phrases,
  created_by
)
values (
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000002',
  1,
  'DRAFT',
  '955c3c5a3ca7b6e3a7c4a4204a86f4e67bc21e4a7e4a0a2c4c2a6c8b0c3d1e9f',
  'seed-review-framework-v1',
  'review-framework-v1',
  'HUMAN_AUTHORED',
  '[]'::jsonb,
  '00000000-0000-0000-0000-000000000003'
)
on conflict do nothing;

insert into public.criteria (
  scorecard_version_id,
  client_id,
  name,
  type,
  definition,
  accepted_evidence,
  alternative_evidence,
  resume_assessable,
  evidence_fields,
  ambiguity_status,
  display_order
)
values
  (
    '20000000-0000-0000-0000-000000000002',
    'seed-platform-criterion-1',
    'Platform operations experience',
    'REQUIRED',
    'Experience improving deployment tooling or observability.',
    '["Deployment or observability example"]'::jsonb,
    '[]'::jsonb,
    true,
    '[{"field_name":"case","description":"Deployment or observability example"}]'::jsonb,
    'CLEAR',
    0
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    'seed-platform-criterion-2',
    'Incident response ownership',
    'PREFERRED',
    'Experience owning a production incident response.',
    '["Production incident response example"]'::jsonb,
    '[]'::jsonb,
    true,
    '[{"field_name":"incident","description":"Production incident response example"}]'::jsonb,
    'CLEAR',
    1
  )
on conflict do nothing;

-- Approve after the criteria exist. `criteria_protect_immutable` rejects any
-- insert under an already-approved version, so the seed cannot create the
-- version in its final state.
update public.scorecard_versions
set status = 'APPROVED',
    approved_by = '00000000-0000-0000-0000-000000000003',
    approved_at = now()
where id = '20000000-0000-0000-0000-000000000002'
  and status = 'DRAFT';

insert into public.job_postings (
  id,
  job_id,
  status,
  public_slug,
  public_title,
  public_summary,
  public_responsibilities,
  public_requirements,
  public_preferred_qualifications,
  public_location,
  public_employment_type,
  created_by,
  published_by,
  published_at
)
values (
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'PUBLISHED',
  'deadbeefdeadbeefdeadbeefdeadbeef',
  'Platform Engineer',
  'Improve deployment tooling and observability for HireLens.',
  'Improve deployment workflows and make service health easier to understand.\nCollaborate with backend teams on reliable operations.',
  'Experience with cloud platforms, deployment automation, or observability tooling.\nComfort working with engineers to document operational practices.',
  'Experience operating production services or improving developer infrastructure.',
  'Singapore · Hybrid',
  'Full-time',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000002',
  now()
)
on conflict do nothing;

do $seed$
begin
  if not exists (
    select 1 from public.job_posting_status_history
    where job_posting_id = '30000000-0000-0000-0000-000000000001'
  ) then
  insert into public.job_posting_status_history (
    job_posting_id,
    job_id,
    actor_id,
    actor_role,
    prior_status,
    new_status
  )
  values (
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    'RECRUITER',
    null,
    'DRAFT'
  ), (
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    'RECRUITER',
    'DRAFT',
    'PUBLISHED'
  );
  end if;
end $seed$;

insert into public.candidates (id, demo_label)
values ('40000000-0000-0000-0000-000000000001', 'Synthetic Backend Candidate')
on conflict do nothing;

insert into public.applications (id, candidate_id, job_id, source, workflow_state)
values (
  '50000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'DEMO_SEED',
  'NEW'
)
on conflict do nothing;

do $seed$
begin
  if not exists (
    select 1 from public.review_assignments
    where application_id = '50000000-0000-0000-0000-000000000001'
  ) then
  insert into public.review_assignments (application_id, assigned_to, assigned_by)
  values (
    '50000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001'
  );
  end if;
end $seed$;

-- Deterministic criterion-calibration history for the synthetic Platform
-- Engineer fixture: four level mismatches, one match, and one excluded false
-- claim. All text and identities are synthetic.
do $$
declare
  ordinal integer;
  candidate_id uuid;
  application_id uuid;
  resume_file_id uuid;
  run_id uuid;
  page_id uuid;
  session_id uuid;
  review_id uuid;
  criterion_id uuid;
  criterion_lineage_id uuid;
  source_text text;
begin
  select id, lineage_id into criterion_id, criterion_lineage_id
  from public.criteria
  where scorecard_version_id = '20000000-0000-0000-0000-000000000002'
    and client_id = 'seed-platform-criterion-1';

  for ordinal in 1..7 loop
    candidate_id := (
      '40000000-0000-0000-0000-' || lpad((100 + ordinal)::text, 12, '0')
    )::uuid;
    application_id := (
      '50000000-0000-0000-0000-' || lpad((100 + ordinal)::text, 12, '0')
    )::uuid;
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

    -- Re-running the seed must not duplicate this candidate. Review
    -- assignments and interview progressions carry generated keys, so
    -- `on conflict` cannot deduplicate them; skip the whole chain instead.
    if exists (select 1 from public.applications where id = application_id) then
      continue;
    end if;

    insert into public.candidates (id, demo_label)
    values (candidate_id, 'Synthetic Calibration Candidate ' || ordinal);
    insert into public.applications (
      id, candidate_id, job_id, source, workflow_state
    ) values (
      application_id,
      candidate_id,
      '10000000-0000-0000-0000-000000000002',
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
      '20000000-0000-0000-0000-000000000002',
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
      repeat('a', 64),
      'UPLOADED',
      true,
      '00000000-0000-0000-0000-000000000001',
      now()
    );
    insert into public.processing_runs (
      id, application_id, resume_file_id, scorecard_version_id, pipeline_version,
      status, attempt_count, completed_at
    ) values (
      run_id,
      application_id,
      resume_file_id,
      '20000000-0000-0000-0000-000000000002',
      'calibration-seed-v1',
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
      repeat('b', 64),
      repeat('b', 64)
    );
    insert into public.evidence_items (
      processing_run_id, criterion_id, status, source_ordinal, resume_page_id,
      exact_quote, interpretation, uncertainty, source_quote_hash, source_page_hash
    ) values (
      run_id,
      criterion_id,
      'SUPPORTED',
      1,
      page_id,
      source_text,
      'Synthetic source-validated platform evidence.',
      'Production scope requires human confirmation.',
      repeat('c', 64),
      repeat('b', 64)
    );
    if ordinal <= 6 then
      insert into public.interview_observation_sessions (
        id, application_id, scorecard_version_id, reviewer_id
      ) values (
        session_id,
        application_id,
        '20000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000004'
      );
      insert into public.interview_observations (
        interview_observation_session_id, application_id, criterion_id,
        criterion_lineage_id, verdict, weakness_type, source, confirmed_at, observer_id
      ) values (
        session_id,
        application_id,
        criterion_id,
        criterion_lineage_id,
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
      );
      insert into public.human_reviews (
        id, application_id, scorecard_version_id, reviewer_id, decision,
        reason_code, reason_detail, confidence, observation_session_id
      ) values (
        review_id,
        application_id,
        '20000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000004',
        (case when ordinal = 5 then 'PROCEED' else 'HOLD' end)::public.human_decision,
        'EVIDENCE_REVIEW',
        'Synthetic post-interview calibration decision.',
        'MEDIUM'::public.review_confidence,
        session_id
      );
    end if;
  end loop;
end;
$$;
