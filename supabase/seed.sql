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
  );

insert into auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  created_at,
  updated_at
)
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
  );

insert into public.profiles (id, display_name, role)
values
  ('00000000-0000-0000-0000-000000000001', 'Demo Admin', 'ADMIN'),
  ('00000000-0000-0000-0000-000000000002', 'Demo Recruiter', 'RECRUITER'),
  ('00000000-0000-0000-0000-000000000003', 'Demo Hiring Manager', 'HIRING_MANAGER'),
  ('00000000-0000-0000-0000-000000000004', 'Demo Platform Hiring Manager', 'HIRING_MANAGER');

insert into public.jobs (
  id,
  title,
  department,
  raw_job_description,
  status,
  recruiter_id,
  hiring_manager_id
)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'Backend Engineer',
    'Engineering',
    'Build and operate reliable backend services for the synthetic HireLens demo.',
    'DRAFT',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000003'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'Platform Engineer',
    'Infrastructure',
    'Improve deployment tooling and observability for the synthetic HireLens demo.',
    'DRAFT',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000004'
  );

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
);

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
  );

insert into public.candidates (id, demo_label)
values ('40000000-0000-0000-0000-000000000001', 'Synthetic Backend Candidate');

insert into public.applications (id, candidate_id, job_id, source, workflow_state)
values (
  '50000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'DEMO_SEED',
  'NEW'
);

insert into public.review_assignments (application_id, assigned_to, assigned_by)
values (
  '50000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001'
);
