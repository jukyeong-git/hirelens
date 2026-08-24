# START HERE — Codex 실행 가이드

## 1. 코딩 전에 확정할 네 가지

다음 항목은 출제 자료에서 정해지지 않았으므로 팀이 결정해야 합니다.

1. **데모 로그인 방식:** 실제 OAuth 또는 시드된 데모 사용자 전환
2. **PDF 범위:** 텍스트 PDF만 P0로 지원할지, OCR까지 포함할지
3. **AI 모델:** 환경변수로 지정하되 어떤 모델을 데모 기준으로 사용할지
4. **성공 목표값:** 검토율·처리 시간·판단 기록률의 목표값

권장 기본값:

- 데모 로그인: 시드된 `Recruiter`, `Hiring Manager`, `Admin`
- PDF: 텍스트 PDF만 지원, 이미지 PDF는 `NEEDS_OCR`
- 모델: 코드에 하드코딩하지 않고 `OPENAI_MODEL`
- 성공 목표: 수치는 고객 인터뷰 후 확정, 데모에서는 기능 게이트로 검증

## 2. Codex에게 주는 첫 번째 프롬프트

```text
Read the repository instructions and product docs before changing files.

Use product_guardian and code_mapper in parallel.
Do not implement yet.

Validate that the proposed MVP preserves these invariants:
- final hiring decisions are human-only,
- AI outputs evidence, not hiring verdicts,
- NOT_FOUND means evidence was not found in the submitted resume,
- every AI result is tied to scorecard, prompt, and model versions,
- demo data is synthetic.

Then propose the smallest vertical slice that proves the product thesis.
```

## 3. 권장 구현 순서

### Turn 1 — 저장소 스캐폴딩

```text
Use $vertical-slice for Phase 0 in docs/08_IMPLEMENTATION_PLAN.md.
Create the pnpm workspace, Next.js web app, worker app, shared packages,
test commands, and environment validation.
Do not add product features yet.
Run lint, unit tests, and build.
```

### Turn 2 — 데이터와 권한

```text
Use $supabase-safe-change.
Implement the P0 schema, migrations, RLS policies, synthetic seed users,
and append-only audit event constraints from docs/04_DATA_MODEL.md.
Add tests that prove unauthorized reads and writes fail.
```

### Turn 3 — Requisition과 서류 검토 기준

```text
Use $scorecard-contract, $supabase-safe-change, and $vertical-slice.
Implement Hiring Manager requisition creation, screening-criteria draft and
approval, and designated Requisition Approver approval/return with reasons.
Admin must not approve requisitions. Do not allow a draft screening criteria
version to analyze resumes.
```

### Turn 4 — 공고 게시와 지원서 접수

```text
Use $supabase-safe-change and $vertical-slice.
Implement Recruiter posting publish/close, narrow public careers route, and
PDF submission through a private server-side path without content classification.
```

### Turn 5 — 이력서 처리와 Recruiter 사전 검토

```text
Use $evidence-pipeline.
Implement multi-PDF upload, per-file processing state, page text extraction,
queueing, idempotent worker behavior, recoverable failures, and Recruiter
evidence triage with a Hiring Manager review request. Use synthetic fixtures
only.
```

### Turn 6 — AI 근거 추출과 Hiring Manager 인터뷰 게이트

```text
Use $ai-contract-change and $vertical-slice.
Implement structured evidence extraction and source validation.
Then implement the evidence-first candidate detail page and the assigned Hiring
Manager's `INTERVIEW`, `HOLD`, or `MORE_INFORMATION_REQUIRED` outcome with a
reason. No automatic acceptance, rejection, interview progression, or global
fit score.
```

### Turn 7 — 최종 인사결정과 품질 게이트

```text
Have security_reviewer and product_guardian review in parallel.
After their reports, have qa_engineer implement missing tests.
Then use $demo-readiness and report blockers only.
```

## 4. 서브에이전트 운영 원칙

- **병렬 실행 권장:** `product_guardian`, `code_mapper`, `security_reviewer`
- **순차 실행 권장:** `frontend_builder`, `backend_builder`, `ai_evidence_engineer`, `qa_engineer`
- 같은 파일 영역을 수정하는 쓰기 에이전트를 동시에 실행하지 않습니다.
- 읽기 에이전트 결과를 받은 뒤 한 개의 쓰기 에이전트가 구현합니다.
- 구현 후 보안·제품·테스트 검토를 분리합니다.

## 5. 스킬 호출 예시

```text
$vertical-slice
$scorecard-contract
$evidence-pipeline
$ai-contract-change
$supabase-safe-change
$ats-ui
$privacy-gate
$demo-readiness
```

Codex가 스킬을 자동 선택할 수도 있지만, MVP 초기에는 이름을 명시적으로 호출하는 편이 안정적입니다.

## 6. P0 완료 조건

- [ ] 승인된 평가 기준 버전 없이는 분석이 시작되지 않는다.
- [ ] 합성 PDF 20건을 일괄 업로드할 수 있다.
- [ ] 각 PDF의 처리 상태와 실패 원인이 표시된다.
- [ ] 기준별 상태, 원문 인용, 페이지, 불확실성이 표시된다.
- [ ] 원문에 존재하지 않는 인용은 저장되지 않는다.
- [ ] 사람만 `PROCEED`, `HOLD`, `DO_NOT_PROCEED`를 저장할 수 있다.
- [ ] 미진행 결정에는 사유가 필수다.
- [ ] 모든 결정은 기준·프롬프트·모델 버전과 함께 감사 로그에 남는다.
- [ ] 실제 개인정보와 비밀키가 저장소 및 로그에 없다.
- [ ] lint, unit, integration, E2E, build가 통과한다.
