begin;

select plan(10);

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002',
  true
);

select throws_ok(
  $$
    select public.review_scorecard_ambiguity(
      '20000000-0000-0000-0000-000000000001',
      (select id from public.criteria where scorecard_version_id = '20000000-0000-0000-0000-000000000001' and client_id = 'criterion-draft-2'),
      '{
        "type":"INTERVIEW_ONLY",
        "definition":"협업 상황에서 기술적 맥락과 의사결정을 설명하는 방식",
        "accepted_evidence":[],
        "alternative_evidence":[],
        "resume_assessable":false,
        "ambiguity_status":"HUMAN_ONLY",
        "suggested_interview_question":"복잡한 장애나 설계 결정을 팀에 설명했던 상황을 설명해 주세요."
      }'::jsonb,
      'INTERVIEW_ONLY',
      'INTERVIEW_ONLY',
      '협업 상황에서 기술적 맥락과 의사결정을 설명하는 방식',
      '[]'::jsonb,
      '[]'::jsonb,
      false,
      '복잡한 장애나 설계 결정을 팀에 설명했던 상황을 설명해 주세요.',
      'Recruiter는 사람의 scorecard 검토를 수행하지 않음'
    )
  $$,
  '42501',
  'not authorized to review scorecard ambiguity',
  'Recruiter cannot resolve scorecard ambiguity'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001',
  true
);

select lives_ok(
  $$
    select public.review_scorecard_ambiguity(
      '20000000-0000-0000-0000-000000000001',
      (select id from public.criteria where scorecard_version_id = '20000000-0000-0000-0000-000000000001' and client_id = 'criterion-draft-2'),
      '{
        "type":"INTERVIEW_ONLY",
        "definition":"협업 상황에서 기술적 맥락과 의사결정을 설명하는 방식",
        "accepted_evidence":[],
        "alternative_evidence":[],
        "resume_assessable":false,
        "ambiguity_status":"HUMAN_ONLY",
        "suggested_interview_question":"복잡한 장애나 설계 결정을 팀에 설명했던 상황을 설명해 주세요."
      }'::jsonb,
      'INTERVIEW_ONLY',
      'INTERVIEW_ONLY',
      '협업 상황에서 기술적 맥락과 의사결정을 설명하는 방식',
      '[]'::jsonb,
      '[]'::jsonb,
      false,
      '복잡한 장애나 설계 결정을 팀에 설명했던 상황을 설명해 주세요.',
      'AI가 표시한 모호성을 면접 검증 항목으로 확인함'
    )
  $$,
  'Admin can resolve ambiguity without changing the AI phrase record'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000003',
  true
);

select lives_ok(
  $$
    select public.review_scorecard_ambiguity(
      '20000000-0000-0000-0000-000000000001',
      (select id from public.criteria where scorecard_version_id = '20000000-0000-0000-0000-000000000001' and client_id = 'criterion-draft-2'),
      '{
        "type":"INTERVIEW_ONLY",
        "definition":"협업 상황에서 기술적 맥락과 의사결정을 설명하는 방식",
        "accepted_evidence":[],
        "alternative_evidence":[],
        "resume_assessable":false,
        "ambiguity_status":"HUMAN_ONLY",
        "suggested_interview_question":"복잡한 장애나 설계 결정을 팀에 설명했던 상황을 설명해 주세요."
      }'::jsonb,
      'CLARIFY',
      'PREFERRED',
      '협업 상황에서 기술적 맥락과 의사결정을 문서와 사례로 설명한 경험',
      '["장애나 설계 결정을 설명한 사례"]'::jsonb,
      '["문서화와 협업 산출물"]'::jsonb,
      true,
      '복잡한 장애나 설계 결정을 팀에 설명했던 상황을 설명해 주세요.',
      '이력서에서 확인할 수 있는 협업 산출물과 사례로 기준을 구체화함'
    )
  $$,
  'Assigned Hiring Manager can clarify an ambiguous criterion'
);

select is(
  (select type::text from public.criteria where scorecard_version_id = '20000000-0000-0000-0000-000000000001' and client_id = 'criterion-draft-2'),
  'PREFERRED',
  'Human clarification updates the criterion type'
);

select is(
  (select ambiguity_status::text from public.criteria where scorecard_version_id = '20000000-0000-0000-0000-000000000001' and client_id = 'criterion-draft-2'),
  'CLEAR',
  'Human clarification resolves the ambiguity status'
);

select is(
  (select status::text from public.scorecard_versions where id = '20000000-0000-0000-0000-000000000001'),
  'DRAFT',
  'Ambiguity review does not approve the scorecard'
);

select throws_ok(
  $$
    select public.review_scorecard_ambiguity(
      '20000000-0000-0000-0000-000000000001',
      (select id from public.criteria where scorecard_version_id = '20000000-0000-0000-0000-000000000001' and client_id = 'criterion-draft-2'),
      '{
        "type":"INTERVIEW_ONLY",
        "definition":"협업 상황에서 기술적 맥락과 의사결정을 설명하는 방식",
        "accepted_evidence":[],
        "alternative_evidence":[],
        "resume_assessable":false,
        "ambiguity_status":"HUMAN_ONLY",
        "suggested_interview_question":"복잡한 장애나 설계 결정을 팀에 설명했던 상황을 설명해 주세요."
      }'::jsonb,
      'CLARIFY',
      'PREFERRED',
      '오래된 기준',
      '["오래된 근거"]'::jsonb,
      '[]'::jsonb,
      true,
      null,
      '오래된 화면의 저장 시도'
    )
  $$,
  '40001',
  'scorecard changed; reload before reviewing',
  'Stale ambiguity review is rejected'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000004',
  true
);

select throws_ok(
  $$
    select public.review_scorecard_ambiguity(
      '20000000-0000-0000-0000-000000000001',
      (select id from public.criteria where scorecard_version_id = '20000000-0000-0000-0000-000000000001' and client_id = 'criterion-draft-2'),
      '{
        "type":"PREFERRED",
        "definition":"협업 상황에서 기술적 맥락과 의사결정을 문서와 사례로 설명한 경험",
        "accepted_evidence":["장애나 설계 결정을 설명한 사례"],
        "alternative_evidence":["문서화와 협업 산출물"],
        "resume_assessable":true,
        "ambiguity_status":"CLEAR",
        "suggested_interview_question":"복잡한 장애나 설계 결정을 팀에 설명했던 상황을 설명해 주세요."
      }'::jsonb,
      'INTERVIEW_ONLY',
      'INTERVIEW_ONLY',
      '협업 상황에서 기술적 맥락과 의사결정을 설명하는 방식',
      '[]'::jsonb,
      '[]'::jsonb,
      false,
      '복잡한 장애나 설계 결정을 팀에 설명했던 상황을 설명해 주세요.',
      '다른 Job에 할당된 Hiring Manager의 저장 시도'
    )
  $$,
  '42501',
  'not authorized to review scorecard ambiguity',
  'Unassigned Hiring Manager cannot resolve ambiguity'
);

select ok(
  exists (
    select 1
    from public.audit_events
    where event_type = 'SCORECARD_AMBIGUITY_REVIEWED'
      and aggregate_id = '10000000-0000-0000-0000-000000000001'
      and safe_metadata ? 'criterion_id'
      and before_data ? 'ambiguity_status'
      and after_data ? 'ambiguity_status'
  ),
  'Ambiguity review writes actor-safe before/after audit metadata'
);

select ok(
  not exists (
    select 1
    from public.audit_events
    where event_type = 'SCORECARD_AMBIGUITY_REVIEWED'
      and safe_metadata::text like '%협업 상황에서%'
  ),
  'Ambiguity review audit metadata excludes criterion text'
);

select * from finish();
rollback;
