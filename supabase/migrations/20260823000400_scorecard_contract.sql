-- HL-021: scorecard draft contract and analysis-readiness guard.
-- Rollback note: do not edit this migration after application. Use a forward
-- migration to change the contract or permissions.

create type public.scorecard_status as enum (
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'SUPERSEDED'
);

create type public.criterion_type as enum (
  'REQUIRED',
  'PREFERRED',
  'INTERVIEW_ONLY'
);

create type public.ambiguity_status as enum (
  'CLEAR',
  'AMBIGUOUS',
  'HUMAN_ONLY'
);

create table public.scorecard_versions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete restrict,
  version_number integer not null check (version_number > 0),
  status public.scorecard_status not null default 'DRAFT',
  source_job_description_hash text not null check (source_job_description_hash ~ '^[0-9a-f]{64}$'),
  prompt_version text not null check (length(trim(prompt_version)) > 0),
  schema_version text not null check (length(trim(schema_version)) > 0),
  model_id text not null check (length(trim(model_id)) > 0),
  ambiguous_phrases jsonb not null default '[]'::jsonb
    check (jsonb_typeof(ambiguous_phrases) = 'array'),
  created_by uuid not null references public.profiles (id),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (job_id, version_number),
  check (
    (status = 'APPROVED' and approved_by is not null and approved_at is not null)
    or (status <> 'APPROVED' and approved_by is null and approved_at is null)
  )
);

create table public.criteria (
  id uuid primary key default gen_random_uuid(),
  scorecard_version_id uuid not null references public.scorecard_versions (id) on delete restrict,
  client_id text not null check (length(trim(client_id)) > 0),
  name text not null check (length(trim(name)) > 0),
  type public.criterion_type not null,
  definition text not null check (length(trim(definition)) > 0),
  accepted_evidence jsonb not null default '[]'::jsonb
    check (jsonb_typeof(accepted_evidence) = 'array'),
  alternative_evidence jsonb not null default '[]'::jsonb
    check (jsonb_typeof(alternative_evidence) = 'array'),
  resume_assessable boolean not null,
  evidence_fields jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence_fields) = 'array'),
  source_phrase text,
  ambiguity_note text,
  ambiguity_status public.ambiguity_status not null default 'CLEAR',
  suggested_interview_question text,
  display_order integer not null check (display_order >= 0),
  created_at timestamptz not null default now(),
  unique (scorecard_version_id, client_id),
  check (type <> 'INTERVIEW_ONLY' or resume_assessable = false),
    check (ambiguity_status <> 'HUMAN_ONLY' or resume_assessable = false)
);

create index scorecard_versions_job_status_idx
  on public.scorecard_versions (job_id, status, version_number desc);
create index criteria_scorecard_version_order_idx
  on public.criteria (scorecard_version_id, display_order);

create or replace function public.validate_job_scorecard_readiness()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'READY_FOR_INTAKE'::public.job_status
     and not exists (
       select 1
       from public.scorecard_versions
       where job_id = new.id
         and status = 'APPROVED'::public.scorecard_status
     ) then
    raise exception 'job requires an approved scorecard before intake' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger jobs_validate_scorecard_readiness
before insert or update on public.jobs
for each row execute function public.validate_job_scorecard_readiness();

create or replace function public.write_scorecard_audit()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
begin
  insert into public.audit_events (
    event_type,
    actor_type,
    actor_id,
    aggregate_type,
    aggregate_id,
    safe_metadata,
    after_data,
    source,
    result,
    version_ref
  )
  values (
    'SCORECARD_DRAFT_CREATED',
    case when actor is null then 'SYSTEM' else 'USER' end,
    actor,
    'job',
    new.job_id,
    jsonb_build_object(
      'scorecard_status', new.status::text,
      'version_number', new.version_number,
      'source_job_description_hash', new.source_job_description_hash,
      'prompt_version', new.prompt_version,
      'schema_version', new.schema_version,
      'model_id', new.model_id
    ),
    jsonb_build_object(
      'scorecard_version_id', new.id,
      'status', new.status::text,
      'version_number', new.version_number
    ),
    'database_trigger',
    'SUCCESS',
    new.id::text
  );

  return new;
end;
$$;

create trigger scorecard_versions_write_audit
after insert on public.scorecard_versions
for each row execute function public.write_scorecard_audit();

create or replace function public.create_scorecard_draft(
  target_job_id uuid,
  source_job_description_hash text,
  prompt_version text,
  schema_version text,
  model_id text,
  ambiguous_phrases jsonb,
  draft_criteria jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  target_recruiter_id uuid;
  next_version integer;
  scorecard_id uuid;
  criterion jsonb;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select role into actor_role from public.profiles where id = actor;
  select recruiter_id into target_recruiter_id
  from public.jobs
  where id = target_job_id
  for update;

  if target_recruiter_id is null then
    raise exception 'job not found' using errcode = 'P0002';
  end if;

  if actor_role is distinct from 'ADMIN'::public.app_role
     and not (
       actor_role = 'RECRUITER'::public.app_role
       and target_recruiter_id = actor
     ) then
    raise exception 'not authorized to create scorecard draft' using errcode = '42501';
  end if;

  if source_job_description_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid job description hash' using errcode = '22023';
  end if;

  if jsonb_typeof(ambiguous_phrases) <> 'array' then
    raise exception 'ambiguous_phrases must be an array' using errcode = '22023';
  end if;

  if jsonb_typeof(draft_criteria) <> 'array' or jsonb_array_length(draft_criteria) = 0 then
    raise exception 'draft_criteria must be a non-empty array' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(draft_criteria) item
    group by item->>'client_id'
    having count(*) > 1
  ) then
    raise exception 'criterion client_id values must be unique' using errcode = '22023';
  end if;

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.scorecard_versions
  where job_id = target_job_id;

  insert into public.scorecard_versions (
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
    target_job_id,
    next_version,
    'DRAFT'::public.scorecard_status,
    source_job_description_hash,
    prompt_version,
    schema_version,
    model_id,
    ambiguous_phrases,
    actor
  )
  returning id into scorecard_id;

  for criterion in select * from jsonb_array_elements(draft_criteria)
  loop
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
    values (
      scorecard_id,
      criterion->>'client_id',
      criterion->>'name',
      (criterion->>'type')::public.criterion_type,
      criterion->>'definition',
      coalesce(criterion->'accepted_evidence', '[]'::jsonb),
      coalesce(criterion->'alternative_evidence', '[]'::jsonb),
      (criterion->>'resume_assessable')::boolean,
      coalesce(criterion->'evidence_fields', '[]'::jsonb),
      nullif(criterion->>'source_phrase', ''),
      nullif(criterion->>'ambiguity_note', ''),
      coalesce((criterion->>'ambiguity_status')::public.ambiguity_status, 'CLEAR'::public.ambiguity_status),
      nullif(criterion->>'suggested_interview_question', ''),
      (criterion->>'display_order')::integer
    );
  end loop;

  update public.jobs
  set status = 'SCORECARD_PENDING_APPROVAL'::public.job_status
  where id = target_job_id
    and status = 'DRAFT'::public.job_status;

  return scorecard_id;
end;
$$;

alter table public.scorecard_versions enable row level security;
alter table public.criteria enable row level security;

create policy scorecard_versions_select on public.scorecard_versions
for select to authenticated
using (public.is_admin() or public.can_access_job(job_id));

create policy criteria_select on public.criteria
for select to authenticated
using (
  exists (
    select 1
    from public.scorecard_versions visible_scorecard
    where visible_scorecard.id = criteria.scorecard_version_id
      and (public.is_admin() or public.can_access_job(visible_scorecard.job_id))
  )
);

grant select on public.scorecard_versions, public.criteria to authenticated;
grant execute on function public.create_scorecard_draft(
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb
) to authenticated;
revoke insert, update, delete on public.scorecard_versions, public.criteria from anon, authenticated;

-- Existing hosted Alpha data is synthetic and already seeded. This fixture is
-- skipped on a clean local reset because seed.sql runs after migrations.
do $$
declare
  seeded_job uuid := '10000000-0000-0000-0000-000000000001';
  seeded_recruiter uuid := '00000000-0000-0000-0000-000000000002';
  seeded_scorecard uuid := '20000000-0000-0000-0000-000000000001';
begin
  if exists (select 1 from public.jobs where id = seeded_job)
     and exists (select 1 from public.profiles where id = seeded_recruiter)
     and not exists (select 1 from public.scorecard_versions where id = seeded_scorecard) then
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
      seeded_scorecard,
      seeded_job,
      1,
      'DRAFT',
      '844f648bb5bb9a9c5e630aafed83e94b99bf8284009483528449fc9191363261',
      'scorecard-v1',
      'scorecard-v1',
      'gpt-5.6-luna',
      '[{"source_phrase":"Good communication skills","ambiguity_note":"이력서만으로 일관되게 검증하기 어려운 표현","ambiguity_status":"HUMAN_ONLY","suggested_interview_question":"복잡한 장애나 설계 결정을 팀에 설명했던 상황을 설명해 주세요."}]'::jsonb,
      seeded_recruiter
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
        seeded_scorecard,
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
        seeded_scorecard,
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
  end if;
end;
$$;
