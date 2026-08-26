begin;

select plan(13);

select ok(
  to_regprocedure('public.create_scorecard_revision(uuid,integer,public.scorecard_status,text)') is not null,
  'framework revision RPC exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_scorecard_revision(uuid,integer,public.scorecard_status,text)',
    'EXECUTE'
  ),
  'authenticated users may invoke the guarded revision RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_scorecard_revision(uuid,integer,public.scorecard_status,text)',
    'EXECUTE'
  ),
  'anonymous users cannot invoke the revision RPC'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.create_scorecard_revision(uuid,integer,public.scorecard_status,text)',
    'EXECUTE'
  ),
  'worker credentials cannot create a framework revision'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);

insert into public.jobs (
  id, title, department, hiring_need, raw_job_description, recruiter_id, hiring_manager_id
) values (
  '10000000-0000-0000-0000-000000000096',
  'Calibration Engineer',
  'Engineering',
  'Synthetic calibration test',
  'Operate reliable Kubernetes services.',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003'
);

select set_config(
  'hirelens.source_version_id',
  public.create_scorecard_draft(
    '10000000-0000-0000-0000-000000000096',
    repeat('b', 64),
    'review-framework-manual-v1',
    'review-framework-manual-v1',
    'HUMAN_AUTHORED',
    '[]'::jsonb,
    '[{"client_id":"criterion-1","name":"Kubernetes operations","type":"REQUIRED","definition":"Operated production Kubernetes services","accepted_evidence":["Production operations"],"alternative_evidence":[],"partial_evidence_guidance":"Personal projects do not establish production scope","resume_assessable":true,"evidence_fields":[],"source_phrase":null,"ambiguity_note":null,"ambiguity_status":"CLEAR","suggested_interview_question":"What production incidents did you handle?","display_order":0}]'::jsonb
  )::text,
  true
);
select set_config(
  'hirelens.source_content_revision',
  (select content_revision::text from public.scorecard_versions
   where id = current_setting('hirelens.source_version_id')::uuid),
  true
);

select public.approve_scorecard(
  current_setting('hirelens.source_version_id')::uuid,
  1,
  'DRAFT',
  current_setting('hirelens.source_content_revision')::integer,
  null
);

select lives_ok(
  format(
    $$select set_config('hirelens.revision_id', public.create_scorecard_revision(%L, 1, 'APPROVED', 'Confirmed interview mismatch')::text, true)$$,
    current_setting('hirelens.source_version_id')
  ),
  'assigned Hiring Manager can create a reasoned revision draft'
);

select is(
  (select status::text from public.scorecard_versions
   where id = current_setting('hirelens.source_version_id')::uuid),
  'APPROVED',
  'creating a revision does not change the active approved version'
);
select is(
  (select status::text || ':' || version_number::text
   from public.scorecard_versions
   where id = current_setting('hirelens.revision_id')::uuid),
  'DRAFT:2',
  'revision is a separate version two draft'
);
select ok(
  not exists (
    select 1
    from public.criteria source
    join public.criteria revision on revision.client_id = source.client_id
    where source.scorecard_version_id = current_setting('hirelens.source_version_id')::uuid
      and revision.scorecard_version_id = current_setting('hirelens.revision_id')::uuid
      and (
        revision.lineage_id <> source.lineage_id
        or revision.lineage_origin <> 'REVISED_FROM'
      )
  ),
  'revision criteria inherit lineage and identify their revised origin'
);
select ok(
  exists (
    select 1 from public.audit_events
    where event_type = 'SCORECARD_REVISION_CREATED'
      and version_ref = current_setting('hirelens.revision_id')
      and safe_metadata::text not like '%Kubernetes%'
  ),
  'revision appends a content-safe audit event'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select throws_ok(
  format(
    $$select public.create_scorecard_revision(%L, 1, 'APPROVED', 'Recruiter attempt')$$,
    current_setting('hirelens.source_version_id')
  ),
  '42501',
  'not authorized to create scorecard revision',
  'Recruiter cannot create a revision'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select set_config(
  'hirelens.revision_lineage_id',
  (select lineage_id::text from public.criteria
   where scorecard_version_id = current_setting('hirelens.revision_id')::uuid),
  true
);
select set_config(
  'hirelens.revision_content_revision',
  (select content_revision::text from public.scorecard_versions
   where id = current_setting('hirelens.revision_id')::uuid),
  true
);
select lives_ok(
  format(
    $$select public.update_scorecard_draft(%L, 2, 'DRAFT', %s, null, '[]'::jsonb,
      '[{"client_id":"criterion-1","name":"Production Kubernetes operations","type":"REQUIRED","definition":"Owned production Kubernetes operations","accepted_evidence":["Production incidents"],"alternative_evidence":[],"partial_evidence_guidance":"Learning-only usage is partial","resume_assessable":true,"evidence_fields":[],"source_phrase":null,"ambiguity_note":null,"ambiguity_status":"CLEAR","suggested_interview_question":"Which incidents did you own?","display_order":0}]'::jsonb)$$,
    current_setting('hirelens.revision_id'),
    current_setting('hirelens.revision_content_revision')
  ),
  'revision draft remains editable'
);
select is(
  (select lineage_id::text from public.criteria
   where scorecard_version_id = current_setting('hirelens.revision_id')::uuid),
  current_setting('hirelens.revision_lineage_id'),
  'editing a revision draft preserves criterion lineage'
);
reset role;
select throws_ok(
  format(
    $$update public.criteria set definition = 'tampered' where scorecard_version_id = %L::uuid$$,
    current_setting('hirelens.source_version_id')
  ),
  '55000',
  'approved scorecard criteria are immutable',
  'source approved criteria remain immutable'
);

select * from finish();
rollback;
