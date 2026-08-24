begin;

select plan(32);

insert into public.candidates (id, demo_label) values ('40000000-0000-0000-0000-000000000010', 'SQL synthetic candidate');
insert into public.applications (id, candidate_id, job_id) values ('50000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001');
insert into public.review_assignments (application_id, assigned_to, assigned_by) values ('50000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001');
insert into public.scorecard_versions (id, job_id, version_number, status, source_job_description_hash, prompt_version, schema_version, model_id, ambiguous_phrases, created_by, approved_by, approved_at)
values ('20000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', 10, 'APPROVED', '844f648bb5bb9a9c5e630aafed83e94b99bf8284009483528449fc9191363261', 'test', 'test', 'test', '[]', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', now());
insert into public.scorecard_versions (id, job_id, version_number, status, source_job_description_hash, prompt_version, schema_version, model_id, ambiguous_phrases, created_by)
values ('20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000002', 1, 'DRAFT', '844f648bb5bb9a9c5e630aafed83e94b99bf8284009483528449fc9191363261', 'test', 'test', 'test', '[]', '00000000-0000-0000-0000-000000000001');
insert into public.notifications (recipient_id, event_type, aggregate_type, aggregate_id, relevant_version, safe_metadata)
values ('00000000-0000-0000-0000-000000000003', 'REVIEW_ASSIGNMENT', 'application', '50000000-0000-0000-0000-000000000010', 'v1', '{}'::jsonb);
insert into public.notifications (recipient_id, event_type, aggregate_type, aggregate_id, relevant_version, safe_metadata)
values ('00000000-0000-0000-0000-000000000004', 'SCORECARD_APPROVAL_REQUEST', 'job', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000011', '{}'::jsonb)
on conflict (recipient_id, event_type, aggregate_id, relevant_version) do nothing;

set local role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select lives_ok($$ select public.create_human_review('50000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000010', 'PROCEED', 'EVIDENCE_REVIEWED', 'Human reviewed the submitted evidence.', 'HIGH') $$, 'Assigned Hiring Manager can create a reasoned decision');
select throws_ok($$ select public.create_human_review('50000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000010', 'HOLD', '', '', 'LOW') $$, '22023', 'reason code and detail are required', 'Decision reason is mandatory');
select lives_ok($$ select public.create_human_review('50000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000010', 'HOLD', 'INTERVIEW_REQUIRED', 'Need clarification in interview.', 'MEDIUM') $$, 'Hiring Manager can change a decision by event');
select is((select count(*)::integer from public.human_reviews where application_id = '50000000-0000-0000-0000-000000000010'), 2, 'Decision history is append-only');
select ok((select supersedes_review_id is not null from public.human_reviews where application_id = '50000000-0000-0000-0000-000000000010 order by created_at desc limit 1), 'Changed decision supersedes the prior event');
select throws_ok($$ insert into public.human_reviews (application_id, scorecard_version_id, reviewer_id, decision, reason_code, reason_detail, confidence) values ('50000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000010', auth.uid(), 'PROCEED', 'X', 'X', 'LOW') $$, '42501', 'permission denied for table human_reviews', 'Direct review writes are revoked');
select throws_ok($$ select public.append_safe_audit('FORGED', 'application', '50000000-0000-0000-0000-000000000010', '{}'::jsonb, null, null, 'forged', 'test') $$, '42501', 'permission denied for function append_safe_audit', 'Application roles cannot forge audit events');
select throws_ok($$ update public.review_note_versions set body = 'tampered' where note_id = (select id from public.review_notes where author_id = auth.uid() limit 1) $$, '42501', 'permission denied for table review_note_versions', 'Direct note-version updates are revoked');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select throws_ok($$ select public.create_human_review('50000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000010', 'PROCEED', 'X', 'X', 'LOW') $$, '42501', 'not authorized to create human review', 'Recruiter cannot write a decision');
select lives_ok($$ select public.create_review_note('50000000-0000-0000-0000-000000000010', 'Private working note') $$, 'Recruiter can create own note');
select lives_ok($$ select public.update_review_note((select id from public.review_notes where author_id = auth.uid() limit 1), 'Edited private working note') $$, 'Recruiter can edit own note as a new version');
select is((select count(*)::integer from public.review_note_versions), 2, 'Note versions are immutable history');
select lives_ok($$ select public.set_review_note_deleted((select id from public.review_notes where author_id = auth.uid() limit 1), true, 'No longer relevant') $$, 'Recruiter can soft delete own note with reason');
select lives_ok($$ select public.set_review_note_deleted((select id from public.review_notes where author_id = auth.uid() limit 1), false, 'Relevant again') $$, 'Recruiter can restore own note with reason');
select ok(not exists (select 1 from public.audit_events where event_type like 'REVIEW_NOTE%' and safe_metadata::text like '%Private working note%'), 'Note bodies are never copied to audit metadata');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select throws_ok($$ select public.create_human_review('50000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000010', 'PROCEED', 'EVIDENCE_REVIEWED', 'Unassigned manager attempt.', 'HIGH') $$, '42501', 'not authorized to create human review', 'Unassigned Hiring Manager cannot create a decision');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select throws_ok($$ select public.create_human_review('50000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000001', 'PROCEED', 'EVIDENCE_REVIEWED', 'Draft scorecard attempt.', 'HIGH') $$, '22023', 'review requires the active approved scorecard for the application job', 'Draft scorecard cannot be used for a decision');
select throws_ok($$ select public.create_review_note('50000000-0000-0000-0000-000000000010', 'Manager note attempt') $$, '42501', 'not authorized to create review note', 'Hiring Manager cannot create a recruiter note');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select lives_ok($$ select public.set_review_note_deleted((select id from public.review_notes where author_id = auth.uid() limit 1), true, 'Temporarily remove') $$, 'Recruiter can delete an own note before visibility check');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select is((select count(*)::integer from public.review_notes where application_id = '50000000-0000-0000-0000-000000000010'), 0, 'Hiring Manager cannot read soft-deleted notes');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select lives_ok($$ select public.set_review_note_deleted((select id from public.review_notes where author_id = auth.uid() limit 1), false, 'Restore after visibility check') $$, 'Recruiter can restore own note after visibility check');
select is((select count(*)::integer from public.notifications), 0, 'Non-recipient cannot list another user notifications');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select lives_ok($$ select public.create_human_review('50000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000010', 'HOLD', 'BUSINESS_CONTEXT', 'Admin reviewed the current hiring plan.', 'MEDIUM') $$, 'Admin can change a decision');
select is((select recipient_id from public.notifications where event_type = 'SCORECARD_APPROVAL_REQUEST' and aggregate_id = '10000000-0000-0000-0000-000000000002' limit 1), '00000000-0000-0000-0000-000000000004'::uuid, 'Draft notification recipient is the assigned Hiring Manager');
select is((select count(*)::integer from public.notifications where event_type = 'SCORECARD_APPROVAL_REQUEST' and aggregate_id = '10000000-0000-0000-0000-000000000002' and relevant_version = '20000000-0000-0000-0000-000000000011'), 1, 'Repeated scorecard notification delivery is idempotent');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select is((select count(*)::integer from public.review_notes where application_id = '50000000-0000-0000-0000-000000000010'), 1, 'Assigned Hiring Manager sees active recruiter notes');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select lives_ok($$ select public.mark_notification_read((select id from public.notifications where event_type = 'REVIEW_ASSIGNMENT' limit 1)) $$, 'Recipient can mark own notification read');
select is((select count(*)::integer from public.audit_events where event_type = 'NOTIFICATION_READ'), 0, 'Notification reads do not write audit events');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select throws_ok($$ select public.mark_notification_read((select id from public.notifications where event_type = 'REVIEW_ASSIGNMENT' limit 1)) $$, '42501', 'notification not found or not recipient', 'Non-recipient cannot mark notification read');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select is((select count(*)::integer from public.notifications where event_type = 'SCORECARD_APPROVAL_REQUEST' and aggregate_id = '10000000-0000-0000-0000-000000000002' and relevant_version = '20000000-0000-0000-0000-000000000011'), 1, 'Draft scorecard notification is created once per recipient/version');
select ok(exists (select 1 from public.audit_events where event_type = 'HUMAN_DECISION_CHANGED' and aggregate_id = '50000000-0000-0000-0000-000000000010'), 'Decision change writes a safe audit event');
select ok(not exists (select 1 from public.audit_events where event_type = 'HUMAN_DECISION_CHANGED' and reason = 'Need clarification in interview.'), 'Decision detail is not copied to audit history');

select * from finish();
rollback;
