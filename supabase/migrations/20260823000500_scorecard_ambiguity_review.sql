-- HL-022: human review of ambiguous scorecard criteria.
-- Rollback note: do not edit this migration after application. Revoke the RPC
-- or add a forward migration if the review contract must change.

create or replace function public.review_scorecard_ambiguity(
  target_scorecard_version_id uuid,
  target_criterion_id uuid,
  expected_snapshot jsonb,
  resolution text,
  new_type public.criterion_type,
  new_definition text,
  new_accepted_evidence jsonb,
  new_alternative_evidence jsonb,
  new_resume_assessable boolean,
  new_suggested_interview_question text,
  reason text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  target_job_id uuid;
  assigned_hiring_manager_id uuid;
  scorecard_state public.scorecard_status;
  current_type public.criterion_type;
  current_definition text;
  current_accepted_evidence jsonb;
  current_alternative_evidence jsonb;
  current_resume_assessable boolean;
  current_ambiguity_status public.ambiguity_status;
  current_suggested_interview_question text;
  current_snapshot jsonb;
  next_ambiguity_status public.ambiguity_status;
  normalized_reason text := trim(coalesce(reason, ''));
  normalized_definition text := trim(coalesce(new_definition, ''));
  normalized_question text := nullif(trim(coalesce(new_suggested_interview_question, '')), '');
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if expected_snapshot is null or jsonb_typeof(expected_snapshot) <> 'object' then
    raise exception 'expected_snapshot must be an object' using errcode = '22023';
  end if;

  select
    scorecard.job_id,
    scorecard.status,
    job.hiring_manager_id,
    criterion.type,
    criterion.definition,
    criterion.accepted_evidence,
    criterion.alternative_evidence,
    criterion.resume_assessable,
    criterion.ambiguity_status,
    criterion.suggested_interview_question
  into
    target_job_id,
    scorecard_state,
    assigned_hiring_manager_id,
    current_type,
    current_definition,
    current_accepted_evidence,
    current_alternative_evidence,
    current_resume_assessable,
    current_ambiguity_status,
    current_suggested_interview_question
  from public.scorecard_versions scorecard
  join public.jobs job on job.id = scorecard.job_id
  join public.criteria criterion on criterion.scorecard_version_id = scorecard.id
  where scorecard.id = target_scorecard_version_id
    and criterion.id = target_criterion_id
  for update of scorecard, criterion;

  if not found then
    raise exception 'scorecard criterion not found' using errcode = 'P0002';
  end if;

  if scorecard_state <> 'DRAFT'::public.scorecard_status then
    raise exception 'only draft scorecards can be reviewed' using errcode = '55000';
  end if;

  select role into actor_role
  from public.profiles
  where id = actor;

  if actor_role is distinct from 'ADMIN'::public.app_role
     and not (
       actor_role = 'HIRING_MANAGER'::public.app_role
       and assigned_hiring_manager_id = actor
     ) then
    raise exception 'not authorized to review scorecard ambiguity' using errcode = '42501';
  end if;

  if resolution not in ('CLARIFY', 'INTERVIEW_ONLY') then
    raise exception 'unsupported ambiguity resolution' using errcode = '22023';
  end if;

  if normalized_reason = '' then
    raise exception 'review reason is required' using errcode = '22023';
  end if;

  if length(normalized_reason) > 1000 then
    raise exception 'review reason is too long' using errcode = '22023';
  end if;

  if normalized_definition = '' then
    raise exception 'criterion definition is required' using errcode = '22023';
  end if;

  if new_accepted_evidence is null or jsonb_typeof(new_accepted_evidence) <> 'array' then
    raise exception 'accepted evidence must be an array' using errcode = '22023';
  end if;

  if new_alternative_evidence is null or jsonb_typeof(new_alternative_evidence) <> 'array' then
    raise exception 'alternative evidence must be an array' using errcode = '22023';
  end if;

  if resolution = 'CLARIFY' and new_type = 'INTERVIEW_ONLY'::public.criterion_type then
    raise exception 'clarify resolution cannot use INTERVIEW_ONLY' using errcode = '22023';
  end if;

  if resolution = 'INTERVIEW_ONLY' then
    if new_type <> 'INTERVIEW_ONLY'::public.criterion_type then
      raise exception 'interview-only resolution requires INTERVIEW_ONLY' using errcode = '22023';
    end if;
    next_ambiguity_status := 'HUMAN_ONLY'::public.ambiguity_status;
  else
    if new_type = 'INTERVIEW_ONLY'::public.criterion_type then
      raise exception 'clarified criteria cannot use INTERVIEW_ONLY' using errcode = '22023';
    end if;
    next_ambiguity_status := 'CLEAR'::public.ambiguity_status;
  end if;

  if new_type = 'INTERVIEW_ONLY'::public.criterion_type and new_resume_assessable then
    raise exception 'INTERVIEW_ONLY criteria cannot be resume-assessable' using errcode = '22023';
  end if;

  if new_resume_assessable and jsonb_array_length(new_accepted_evidence) = 0 then
    raise exception 'resume-assessable criteria require accepted evidence' using errcode = '22023';
  end if;

  current_snapshot := jsonb_build_object(
    'type', current_type::text,
    'definition', current_definition,
    'accepted_evidence', current_accepted_evidence,
    'alternative_evidence', current_alternative_evidence,
    'resume_assessable', current_resume_assessable,
    'ambiguity_status', current_ambiguity_status::text,
    'suggested_interview_question', current_suggested_interview_question
  );

  if current_snapshot is distinct from expected_snapshot then
    raise exception 'scorecard changed; reload before reviewing' using errcode = '40001';
  end if;

  if current_ambiguity_status = 'CLEAR'::public.ambiguity_status then
    raise exception 'criterion ambiguity is already resolved' using errcode = '22023';
  end if;

  update public.criteria
  set type = new_type,
      definition = normalized_definition,
      accepted_evidence = new_accepted_evidence,
      alternative_evidence = new_alternative_evidence,
      resume_assessable = new_resume_assessable,
      ambiguity_status = next_ambiguity_status,
      suggested_interview_question = normalized_question
  where id = target_criterion_id;

  insert into public.audit_events (
    event_type,
    actor_type,
    actor_id,
    aggregate_type,
    aggregate_id,
    correlation_id,
    safe_metadata,
    before_data,
    after_data,
    reason,
    source,
    result,
    version_ref
  )
  values (
    'SCORECARD_AMBIGUITY_REVIEWED',
    'USER',
    actor,
    'job',
    target_job_id,
    gen_random_uuid(),
    jsonb_build_object(
      'scorecard_version_id', target_scorecard_version_id,
      'criterion_id', target_criterion_id,
      'actor_role', actor_role::text,
      'resolution', resolution,
      'before_status', current_ambiguity_status::text,
      'after_status', next_ambiguity_status::text,
      'before_type', current_type::text,
      'after_type', new_type::text
    ),
    jsonb_build_object(
      'ambiguity_status', current_ambiguity_status::text,
      'type', current_type::text,
      'resume_assessable', current_resume_assessable
    ),
    jsonb_build_object(
      'ambiguity_status', next_ambiguity_status::text,
      'type', new_type::text,
      'resume_assessable', new_resume_assessable
    ),
    normalized_reason,
    'scorecard_ambiguity_review',
    'SUCCESS',
    target_scorecard_version_id::text
  );
end;
$$;

grant execute on function public.review_scorecard_ambiguity(
  uuid,
  uuid,
  jsonb,
  text,
  public.criterion_type,
  text,
  jsonb,
  jsonb,
  boolean,
  text,
  text
) to authenticated;

revoke execute on function public.review_scorecard_ambiguity(
  uuid,
  uuid,
  jsonb,
  text,
  public.criterion_type,
  text,
  jsonb,
  jsonb,
  boolean,
  text,
  text
) from anon;
