# Purpose

Append-only record of user inputs and assistant outputs for this working directory.

## Recording rules

- Record every user request before acting on it and every final response immediately before sending it.
- Include a local timestamp with timezone for each input/output pair.
- Preserve meaning and wording whenever practical.
- Never record secrets or sensitive personal data verbatim; replace them with `[REDACTED]`.
- Summarize large tool output, build logs, binaries, and generated artifacts.
- Do not rewrite or delete prior entries.

## Input — 2026-08-23 23:14:40 +0800 (+08)

HireLens HL-021의 AI 계약만 구현해줘. 너는 다른 에이전트와 같은 저장소를 공유하므로 기존 변경을 되돌리거나 다른 파일을 수정하지 말고, 소유 파일은 packages/ai/** 및 필요 시 packages/ai/package.json으로 제한해줘. strict Zod runtime schema와 OpenAI Responses API용 JSON Schema를 함께 정의하고, scorecard draft 전용 prompt/adapter contract를 추가해줘. 반드시 모델/prompt/schema 버전을 노출하고, draft-only를 보장하며 fit score, hiring decision, protected-trait inference 필드를 허용하지 않아야 해. source_phrase, ambiguity_note, ambiguity_status, suggested_interview_question, criterion type, evidence fields, resume_assessable을 계약에 포함해줘. 실제 API 호출은 입력으로 apiKey/model을 받아 server-only에서 사용할 수 있도록 하되 테스트는 네트워크 없이 실행 가능하게 만들어줘. 기존 패키지 스타일을 따르고, 패키지 단위 unit tests/fixture를 추가해줘. 파일을 수정한 뒤 변경 파일과 테스트 결과만 요약해줘.

## Input — 2026-08-23 23:19:53 +0800 (+08)

현재 진행 상황을 요약해줘. packages/ai 파일만 수정하고, 가능한 한 빨리 완료해줘.

## Output — 2026-08-23 23:23:55 +0800 (+08)

HL-021 AI 계약을 `packages/ai` 범위에서 완료했습니다.

변경 파일: `packages/ai/package.json`, `packages/ai/tsconfig.json`, `packages/ai/fixtures/scorecard-draft.valid.json`, `packages/ai/src/adapter.test.ts`, `adapter.ts`, `evidence.test.ts`, `evidence.ts`, `index.ts`, `prompt.ts`, `scorecard-draft.test.ts`, `scorecard-draft.ts`, `server.ts`, `versions.ts`. 필수 append-only 운영 기록으로 `.codex/records/RECORD.md`도 갱신했습니다.

구현: strict Zod/JSON Schema, draft-only discriminator, 모델·prompt·schema·pipeline 버전 노출, ambiguity/criterion/evidence/source phrase 필드, scorecard draft prompt, server-only Responses adapter, `store:false`, page/criterion/quote 검증, 네트워크 없는 fixture/unit tests.

검증: `pnpm --filter @hirelens/ai typecheck` 통과; `pnpm test` 5개 파일/15개 테스트 통과; `pnpm exec prettier --check packages/ai` 통과. `pnpm eval:ai`는 저장소의 예약된 placeholder만 실행되어 golden 비교는 아직 불가했습니다. 전체 `pnpm typecheck`는 범위 밖 `apps/web`의 기존 누락 `requestScorecardDraftAction` 오류로 실패했습니다.

## Input — 2026-08-23 08:51:28 +0800 (+08)

Read AGENTS.md, START_HERE.md, docs/00_PRODUCT_BRIEF.md, and docs/01_PRD.md.
Spawn product_guardian and code_mapper in parallel.
Do not write code yet.
Return:
1) unresolved product decisions,
2) the smallest P0 vertical slice,
3) a repository scaffolding plan,
4) risks that can invalidate the demo.
Wait for both agents and consolidate their findings.

## Output — 2026-08-23 08:54:59 +0800 (+08)

Read `AGENTS.md`, `START_HERE.md`, `docs/00_PRODUCT_BRIEF.md`, and `docs/01_PRD.md`. Spawned and waited for `product_guardian` and `code_mapper` in parallel. No code was written; only this required append-only record was created.

The repository is a documentation-only starter on `main`: the web/worker directories contain only guidance, and the workspace packages, Supabase migrations, fixtures, tests, and executable tooling are missing.

### 1. Unresolved product decisions

- Demo authentication: use seeded `Recruiter`, `Hiring Manager`, and `Admin` users; defer OAuth.
- Decision authority: resolve the PRD/RLS mismatch by allowing only the authorized hiring manager to write `PROCEED`, `HOLD`, or `DO_NOT_PROCEED`; recruiters may review, annotate, and assign.
- Workflow model: separate processing state from human-review/decision state and define transitions such as `PROCEED` to interview and `DO_NOT_PROCEED` to closed.
- Decision history: persist prior decision, new decision, reason, actor, and timestamp for every change; do not rely only on `supersedes_review_id`.
- Evidence traceability: define that `NOT_FOUND` and `HUMAN_ONLY` link to the processed source/run but do not fabricate a quote/page; only evidence-bearing results require page quotes.
- Criteria: customer still needs to define the first pilot role, approved criteria, operational-experience threshold, and resume-assessable versus human-only criteria. Demo default: one synthetic backend-engineer scorecard approved by the hiring manager.
- Model/fallback: use `OPENAI_MODEL` without hardcoding; disclose and test a preprocessed synthetic fallback.
- Success targets and real-data policy remain customer questions; use functional/quality gates and synthetic data for the demo.

### 2. Smallest P0 vertical slice

`Seeded recruiter creates one backend-engineer job → AI drafts criteria → hiring manager edits and approves an immutable scorecard → recruiter uploads 20 synthetic text PDFs → worker extracts page text and criterion evidence → recruiter reviews/assigns → hiring manager reviews one candidate → manager saves a reasoned human decision → audit timeline shows the complete record.`

Required gates: no analysis before approval; independent visible per-file states; exact normalized quote/page validation with quarantine; criterion status, interpretation, uncertainty, and follow-up question; careful `NOT_FOUND` wording; no global fit score; complete scorecard/prompt/schema/model/run/source references; authorized human-only decision writes; append-only decision history and audit events without raw resume text; deterministic reset; and unit, integration/RLS, E2E, and AI-eval coverage.

Exclude OCR implementation, Slack, Calendar, email, CSV, external recruiting integrations, operations dashboards, predictions, sensitive-trait inference, automatic decisions, vector search, microservices, Kubernetes, and business-impact claims beyond demo observations.

### 3. Repository scaffolding plan

1. Foundation: root `package.json`, `pnpm-workspace.yaml`, strict TypeScript configs, `apps/web` Next.js shell, `apps/worker` entry point, environment validation, and the documented `pnpm`/database/test commands.
2. Shared contracts: `packages/domain` for enums, state machines, permissions, decision-reason validation, and idempotency keys; `packages/database` for typed repositories and append-only audit writes; `packages/pdf` for page extraction/normalization/quote matching; `packages/ai` for versioned schemas, prompts, model adapter, and `store: false` requests.
3. Data/access: Supabase migrations for the documented P0 tables, private storage, indexes, queues, RLS, immutable scorecard versions, worker restrictions, synthetic seed users/data, and guarded deterministic reset.
4. Processing: upload records, per-application queue tasks, idempotent worker claims, page extraction, `NEEDS_OCR` handling, bounded retries, quarantine, and visible progress/failure states.
5. Review/UI: evidence-first candidate list/detail, source-page links, separate AI/source/human presentation, role-aware assignment and decision actions, and audit timeline.
6. Verification: PDF and quote-validator unit tests, AI golden evals, RLS denial tests, worker idempotency/retry tests, privacy checks, partial-batch fixtures, and Playwright happy-path/negative-path coverage.

### 4. Demo-invalidating risks

- Blocker: no runnable application, worker, database, migrations, storage, or tests exist yet.
- Blocker: AI, worker, recruiter, or RLS path could write a hiring decision; prevent with decision-free AI schemas, hiring-manager-only server/database authorization, and negative tests.
- Blocker: fabricated or mislocated evidence; enforce normalized exact-substring/page validation and quarantine, with a 100% eval gate.
- Blocker: resume/audit exposure through public storage, weak RLS, or raw-text logs; use private opaque paths, assignment checks, synthetic fixtures, and PII-safe telemetry.
- High: queue/model/reset nondeterminism, stalls, or duplicates; use deterministic reset, bounded retry classes, visible per-file states, idempotency keys, and a disclosed fallback.
- High: draft or mutable scorecards used for analysis; enforce immutable approved-version references and a draft-blocking E2E test.
- High: overclaiming outcomes from 20 synthetic resumes; report captured demo observations only and keep business targets TBD.
- Medium: missing controlled fixtures for `SUPPORTED`, `PARTIAL`, `NOT_FOUND`, `HUMAN_ONLY`, failed documents, quarantine, and `NEEDS_OCR`; seed them explicitly.

## Input — 2026-08-23 08:56:25 +0800 (+08)

한글로 번역해줘.

## Output — 2026-08-23 08:56:31 +0800 (+08)

[AGENTS.md](/Users/jukyeong.kim/.vscode/projects/hirelens/AGENTS.md), [START_HERE.md](/Users/jukyeong.kim/.vscode/projects/hirelens/START_HERE.md), [00_PRODUCT_BRIEF.md](/Users/jukyeong.kim/.vscode/projects/hirelens/docs/00_PRODUCT_BRIEF.md), [01_PRD.md](/Users/jukyeong.kim/.vscode/projects/hirelens/docs/01_PRD.md)를 읽었습니다. 두 에이전트의 작업이 완료되었으며 코드는 작성하지 않았습니다.

### 1. 해결되지 않은 제품 결정

- 데모 인증은 시드된 `Recruiter`, `Hiring Manager`, `Admin` 사용자를 사용하고 OAuth는 이후로 미룹니다.
- PRD와 RLS 간 불일치를 해결해야 합니다. 최종 결정은 hiring manager만 작성할 수 있도록 하는 것이 안전합니다.
- 처리 상태와 사람의 검토·결정 상태를 분리하고 상태 전이를 정의해야 합니다.
- 결정 변경 시 이전 결정, 새 결정, 사유, 행위자, 시각을 저장해야 합니다.
- `NOT_FOUND`와 `HUMAN_ONLY`의 추적성을 정의해야 합니다. 원본 처리 실행에는 연결하되 인용문이나 페이지를 조작해서는 안 됩니다.
- 파일럿 직무, 승인된 기준, 운영 경험의 판단 기준, 이력서로 평가 가능한 기준을 확정해야 합니다.
- `OPENAI_MODEL`을 사용하고, 사전에 처리된 합성 데이터 기반의 대체 경로를 공개해야 합니다.
- 비즈니스 목표와 실제 데이터 정책은 TBD로 유지하고, 데모에서는 기능 품질 게이트를 사용합니다.

### 2. 가장 작은 P0 수직 슬라이스

`Recruiter가 백엔드 엔지니어 직무를 생성 → AI가 평가 기준 초안을 작성 → hiring manager가 불변 scorecard를 승인 → Recruiter가 합성 텍스트 PDF 20개를 업로드 → worker가 페이지 텍스트와 근거를 추출 → Recruiter가 검토·할당 → hiring manager가 후보자 1명을 검토 → 사유가 포함된 사람의 결정을 저장 → 감사 타임라인에 전체 기록 표시`

필수 게이트:

- 승인된 scorecard 없이는 분석을 시작할 수 없습니다.
- 모든 파일에 대해 독립적이고 확인 가능한 처리 상태가 표시되어야 합니다.
- 정규화된 인용문과 페이지를 정확히 검증하고, 잘못된 결과는 격리해야 합니다.
- 기준별 상태, 해석, 불확실성, 후속 질문이 표시되어야 합니다.
- `NOT_FOUND`는 “제출된 자료에서 뒷받침되는 근거를 찾지 못함”으로 표시해야 합니다.
- 전체 적합도 점수나 자동 채용 결정은 사용하지 않습니다.
- 근거에는 scorecard, prompt, schema, model, processing run, source 참조가 포함되어야 합니다.
- 승인된 사람의 역할만 결정을 저장할 수 있어야 합니다.
- 감사 기록은 추가 전용이며 원본 이력서 텍스트를 포함하지 않아야 합니다.
- 결정적(deterministic) 리셋과 unit, RLS/integration, E2E, AI 평가 테스트가 필요합니다.

OCR 구현, Slack, Calendar, 이메일, CSV, 외부 채용 플랫폼 연동, 예측, 민감 특성 추론, 벡터 검색, 마이크로서비스, Kubernetes는 제외합니다.

### 3. 저장소 스캐폴딩 계획

현재 저장소는 `main` 브랜치의 문서 중심 스타터입니다. workspace 설정, 실행 가능한 앱, 패키지, 마이그레이션, fixture, 테스트가 아직 없습니다.

1. pnpm workspace, 엄격한 TypeScript 설정, Next.js 웹 앱, worker 진입점, 환경 변수 검증, 문서에 정의된 pnpm·데이터베이스·테스트 명령을 추가합니다.
2. 다음 공통 패키지를 추가합니다.

   - `packages/domain` — enum, 상태 머신, 권한, 결정.
   - `packages/database` — 타입이 지정된 repository와 추가 전용 감사 기록.
   - `packages/pdf` — 페이지 추출, 정규화, 인용문 매칭.
   - `packages/ai` — 버전 관리 schema, prompt, model adapter, 평가 fixture.

3. Supabase 마이그레이션, 비공개 스토리지, RLS, 인덱스, queue 설정, 불변 scorecard 버전, worker 제한, 합성 seed 데이터, 보호된 결정적 리셋을 추가합니다.
4. 업로드, 멱등적 처리, 페이지 추출, `NEEDS_OCR`, 재시도, 격리, 진행·실패 상태 표시를 구현합니다.
5. 근거 중심 후보자 검토, 원본 페이지 링크, AI·원본·사람 데이터의 분리 표시, 역할 기반 할당과 결정, 감사 타임라인을 구현합니다.
6. PDF/AI unit 테스트, RLS 거부 테스트, worker 멱등성 테스트, 개인정보 점검, 부분 batch fixture, Playwright 테스트를 추가합니다.

### 4. 데모를 무효화할 수 있는 위험

- **차단 요인:** 아직 실행 가능한 제품, worker, 데이터베이스, 마이그레이션, 스토리지, 테스트가 없습니다.
- **차단 요인:** AI, worker, Recruiter 또는 RLS 경로가 채용 결정을 작성할 수 있는 위험이 있습니다.
- **차단 요인:** 조작되었거나 잘못된 페이지를 가리키는 근거가 저장될 수 있습니다.
- **차단 요인:** 공개 스토리지, 취약한 RLS, 원본 텍스트 로그로 이력서가 노출될 수 있습니다.
- **높은 위험:** queue, model, reset의 비결정성으로 처리가 멈추거나 중복될 수 있습니다.
- **높은 위험:** 초안 또는 변경 가능한 scorecard가 분석에 사용될 수 있습니다.
- **높은 위험:** 합성 이력서 20개만으로 실제 비즈니스 효과를 과장할 수 있습니다.
- **중간 위험:** `SUPPORTED`, `PARTIAL`, `NOT_FOUND`, `HUMAN_ONLY`, 실패 문서, 격리, `NEEDS_OCR`에 대한 통제된 fixture가 없습니다.

필수 추가 전용 기록은 [.codex/records/RECORD.md](/Users/jukyeong.kim/.vscode/projects/hirelens/.codex/records/RECORD.md)에 생성되어 있습니다.

## Input — 2026-08-23 09:08:12 +0800 (+08)

아래 해결해야 하는 내용을 이해하기 쉽게 설명 해줘. 그리고 결정해야 하는 포인트가 뭔지 알려줘.

"1. 해결되지 않은 제품 결정

- 데모 인증은 시드된 `Recruiter`, `Hiring Manager`, `Admin` 사용자를 사용하고 OAuth는 이후로 미룹니다.
- 최종 결정은 hiring manager만 작성할 수 있도록 PRD와 RLS 정책을 정리해야 합니다.
- 처리 상태와 사람의 검토·결정 상태를 분리하고 상태 전이를 정의해야 합니다.
- 결정 변경 시 이전 결정, 새 결정, 사유, 행위자, 시각을 저장해야 합니다.
- `NOT_FOUND`와 `HUMAN_ONLY`는 원본 처리 실행에 연결하되, 인용문이나 페이지를 조작해서는 안 됩니다.
- 파일럿 직무, 승인 기준, 운영 경험의 판단 기준, 이력서로 평가 가능한 기준을 확정해야 합니다.
- `OPENAI_MODEL`을 사용하고, 사전 처리된 합성 데이터 기반의 대체 경로를 공개해야 합니다.
- 비즈니스 목표와 실제 데이터 정책은 TBD로 유지하고, 데모에서는 기능 품질 게이트를 사용합니다."

## Output — 2026-08-23 09:08:35 +0800 (+08)

쉽게 말하면, 이 목록은 “데모를 만들기 전에 로그인 방식, 역할별 권한, 상태, 감사 기록, 근거의 의미, 평가 기준, AI 사용 방식, 성공 판정 기준을 정하자”는 내용입니다.

### 항목별 의미와 결정할 내용

1. **데모 인증**

   실제 Google 로그인이나 OAuth를 연결하지 않고 미리 만들어 둔 합성 사용자로 로그인한다는 뜻입니다.

   - 결정할 내용: 데모에서 역할을 어떻게 전환할지, 각 역할의 접근 범위는 어디까지인지.
   - 권장안: `Recruiter`, `Hiring Manager`, `Admin` 계정을 미리 만들고, Recruiter는 업로드·검토·할당, Hiring Manager는 최종 결정, Admin은 조회·리셋만 담당.

2. **최종 결정은 hiring manager만 작성**

   AI나 Recruiter가 후보자를 합격·보류·탈락시키면 안 되고, hiring manager가 직접 `PROCEED`, `HOLD`, `DO_NOT_PROCEED`를 저장해야 한다는 뜻입니다. RLS는 데이터베이스 차원의 접근 제어 정책입니다.

   - 결정할 내용: Admin이 결정을 수정할 수 있는지, Recruiter가 임시 의견을 남길 수 있는지, 최종 결정 변경 권한을 누구에게 줄지.
   - 권장안: 최종 결정 저장은 hiring manager만 허용하고, Admin은 감사·리셋만 수행하며, Recruiter는 검토·메모·할당만 허용.

3. **처리 상태와 사람의 검토 상태 분리**

   PDF 처리가 실패한 것과 사람이 아직 검토하지 않은 것은 전혀 다른 상태입니다. 하나의 상태 값에 섞으면 “AI 처리가 실패해서 탈락했다”처럼 잘못 해석될 수 있습니다.

   - 처리 상태 예: `UPLOADED`, `EXTRACTING`, `ANALYZING`, `COMPLETED`, `FAILED`, `NEEDS_OCR`.
   - 검토 상태 예: `NOT_REVIEWED`, `ASSIGNED`, `IN_REVIEW`, `DECISION_SAVED`.
   - 결정할 내용: 정확한 상태 목록과 상태 간 전이 규칙. 예를 들어 분석 실패가 사람의 탈락 결정으로 이어지지 않도록 해야 합니다.

4. **결정 변경 이력 저장**

   기존 결정을 덮어쓰지 않고, 변경할 때마다 새 기록을 추가해야 한다는 뜻입니다.

   - 저장할 내용: 이전 결정, 새 결정, 변경 사유, 변경한 사람, 변경 시각.
   - 결정할 내용: 첫 결정에도 사유를 필수로 할지, 변경 시 사유를 필수로 할지.
   - 권장안: 모든 결정에 구조화된 사유를 요구하고, 변경은 항상 추가 전용 이벤트로 저장.

5. **`NOT_FOUND`와 `HUMAN_ONLY`의 의미**

   - `NOT_FOUND`: 제출된 이력서에서 해당 역량을 뒷받침하는 근거를 찾지 못했다는 뜻입니다. “그 역량이 없다”는 뜻이 아닙니다.
   - `HUMAN_ONLY`: 이력서만으로 판단하면 안 되고 인터뷰나 사람의 검토가 필요한 기준이라는 뜻입니다.

   두 상태에는 근거가 없으므로 가짜 인용문이나 페이지 번호를 만들면 안 됩니다. 대신 어떤 PDF 처리 실행에서 나온 결과인지는 추적할 수 있어야 합니다.

   - 결정할 내용: 화면에 표시할 문구, 원본 실행 링크 방식, 인터뷰 질문을 자동 제안할지 여부.

6. **파일럿 직무와 평가 기준**

   AI가 무엇을 평가해도 되는지 먼저 사람이 정해야 한다는 뜻입니다.

   - 결정할 내용: 첫 대상 직무, 필수(`REQUIRED`) 기준, 우대(`PREFERRED`) 기준, 이력서로 평가하지 않고 인터뷰에서 확인할 기준(`INTERVIEW_ONLY`), 각 기준에서 인정할 증거 수준, scorecard 승인자.
   - 권장안: 합성 백엔드 엔지니어 직무 하나를 사용하고, hiring manager가 기준을 승인한 뒤에만 이력서 분석을 허용.

7. **AI 모델과 대체 경로**

   모델 이름을 코드에 고정하지 않고 `OPENAI_MODEL` 환경 변수로 설정한다는 뜻입니다. API 장애나 네트워크 문제로 데모가 멈추지 않도록 사전에 처리한 합성 결과를 대체 경로로 준비합니다.

   - 결정할 내용: 데모에서 사용할 실제 모델, API 실패 시 대체 방식, 대체 결과를 관람자에게 어떻게 공개할지.
   - 권장안: 모델은 환경 변수로 지정하고, 라이브 AI 결과와 사전 처리된 합성 결과를 화면에서 명확히 구분.

8. **비즈니스 목표와 데모 품질 기준**

   현재 문서의 “검토율을 얼마까지 높일지”, “처리 시간을 얼마나 줄일지”는 고객 확인 전에는 정하지 말자는 뜻입니다. 대신 데모가 기술적으로 제대로 작동하는지는 별도의 품질 게이트로 판단합니다.

   - 비즈니스 목표: 검토율, 처리 시간, 사유가 있는 결정 비율 등. 고객 인터뷰 후 확정.
   - 데모 품질 게이트: 20개 파일의 상태 표시, 인용문 검증, 승인 전 분석 차단, 권한 없는 접근 차단, 사람만 결정 저장, 감사 기록, 결정적 리셋, 핵심 E2E 통과.
   - 데이터 결정: 데모는 합성 데이터만 사용하고, 실제 이력서 사용 정책은 별도로 승인받기.

### 지금 결정해야 하는 핵심 포인트

우선순위는 다음과 같습니다.

1. 데모 로그인 방식과 역할별 권한
2. 최종 결정 작성자와 Admin의 예외 권한 여부
3. 처리 상태·검토 상태·결정 상태의 정확한 목록과 전이 규칙
4. 결정 변경 이력과 사유 필수 여부
5. `NOT_FOUND`·`HUMAN_ONLY`의 화면 문구와 추적 방식
6. 첫 직무와 승인할 scorecard 기준
7. 데모 모델 및 AI 실패 시 대체 경로
8. 데모 품질 게이트의 통과 기준

반대로 고객 인터뷰가 필요한 비즈니스 목표와 실제 데이터 사용 정책은 지금 숫자를 억지로 정하기보다 TBD로 두되, 데모에서는 합성 데이터만 사용하도록 제한하는 것이 안전합니다.

## Input — 2026-08-23 09:17:44 +0800 (+08)

1. `Recruiter`: 업로드·검토·할당, `Hiring Manager`: 최종 결정, `Admin`: 조회·데모 리셋
2. Admin이 결정을 수정할 수 있게 변경, Recruiter가 임시 의견을 남길 수 있게 남김
3. 예시든 것 기준으로 만들어줘
4. 첫 결정에도 사유를 필수 기입, 결정 변경 시 사유를 필수, Admin이 결정 변경을 허용
5. 결정할 내용을 제안 해줘
6. 권장안 기준대로 사용 해줘
7. 데모에서 사용할 실제 모델: OpenAI, API 실패 시 대체 방식: 한번더 재처리 이후 실패 알림 노티, 라이브 AI 결과와 사전 처리 결과를 관람자에게 어떻게 공개할지: 명확히 구분하여 나눠줘
8. 권장안을 제안해줘

## Output — 2026-08-23 09:18:07 +0800 (+08)

좋습니다. 아래처럼 확정하고 진행하면 됩니다.

### 1. 역할과 권한

| 역할 | 허용 작업 | 금지 또는 제한 작업 |
|---|---|---|
| `Recruiter` | PDF 업로드, 처리 결과 검토, 후보자 할당, 임시 의견 작성 | 최종 결정 저장·변경 |
| `Hiring Manager` | scorecard 승인, 후보자 검토, 최초 및 최종 결정 저장·변경 | 없음. 단, 모든 결정에 사유 필수 |
| `Admin` | 전체 조회, 데모 리셋, 기존 결정 변경 | 최초 결정을 대신 생성하지 않음. 변경 사유 필수 |

Recruiter의 임시 의견은 최종 결정과 별도의 `review_note`로 저장합니다. 화면에서도 “Recruiter 의견”과 “최종 사람의 결정”을 분리해서 표시합니다.

### 2. 상태 모델

처리 상태와 검토 상태를 별도 값으로 둡니다.

처리 상태:

`UPLOADED → QUEUED → EXTRACTING → ANALYZING → COMPLETED`

- 이미지 PDF: `NEEDS_OCR`
- 처리 중 오류: `FAILED`
- `FAILED`에는 실패 사유, 재시도 횟수, 재시도 가능 여부를 별도 저장합니다.

검토 상태:

`NOT_REVIEWED → ASSIGNED → IN_REVIEW → DECISION_SAVED`

결정이 변경되면 검토 상태를 다시 `IN_REVIEW`로 표시할 수 있지만, 이전 결정은 삭제하지 않고 새 결정 이벤트를 추가합니다.

핵심 원칙은 PDF 처리가 실패해도 후보자가 자동 탈락하지 않는 것입니다. AI를 사용할 수 없는 경우에도 사람은 PDF를 보고 판단할 수 있어야 합니다.

### 3. `NOT_FOUND`와 `HUMAN_ONLY` 제안

`NOT_FOUND` 화면 문구:

> 제출된 자료에서 이 기준을 뒷받침하는 근거를 찾지 못했습니다. 이는 해당 역량이 없다는 의미가 아닙니다.

`HUMAN_ONLY` 화면 문구:

> 이 기준은 이력서만으로 평가하지 않습니다. 인터뷰 또는 사람의 검토가 필요합니다.

두 상태 모두 다음 정보는 저장합니다.

- `criterion_id`
- `scorecard_version_id`
- `processing_run_id`
- `resume_file_id`
- 상태와 생성 시각

다만 근거를 찾지 못했으므로 `quote`와 `source_page`는 `null`로 저장합니다. 가짜 인용문이나 임의의 페이지를 만들지 않습니다.

후속 질문은 다음처럼 처리하는 것을 권장합니다.

- `NOT_FOUND`: 해당 기준의 경험을 확인하는 질문을 제안
- `HUMAN_ONLY`: scorecard에 미리 승인된 인터뷰 질문 표시
- AI가 질문을 제안하더라도 채용 결정을 대신하지 않으며, 사람의 검토용으로만 표시

### 4. scorecard

권장안대로 첫 데모는 **합성 백엔드 엔지니어 직무 하나**만 사용합니다.

- AI가 scorecard 초안을 작성
- hiring manager가 기준을 수정·검토
- hiring manager가 승인
- 승인된 버전은 불변으로 유지
- 승인 전에는 이력서 분석을 시작할 수 없음

기준은 `REQUIRED`, `PREFERRED`, `INTERVIEW_ONLY`로 구분하고, 각 기준에 인정되는 증거 수준을 정의합니다. 구체적인 기준 목록은 실제 데모용 직무 설명에서 만들되, 최종 사용 전 hiring manager가 승인해야 합니다.

### 5. OpenAI와 실패 처리

- AI 제공자는 OpenAI를 사용합니다.
- 모델명은 코드에 하드코딩하지 않고 `OPENAI_MODEL` 환경 변수로 설정합니다.
- 일시적인 API 오류, timeout, 5xx 오류만 한 번 재처리합니다.
- 한 번 재처리한 뒤에도 실패하면 해당 파일을 `FAILED`로 바꾸고 인앱 실패 알림을 표시합니다.
- 정책 거절, 잘못된 schema, 조작된 인용문은 네트워크 오류처럼 무조건 재시도하지 않고 격리·검토 대상으로 둡니다.
- 실패했다고 사전 처리 결과를 몰래 대신 표시하지 않습니다.

화면에는 결과 출처를 명확히 구분합니다.

- `LIVE_AI`: “OpenAI 실시간 분석 결과”
- `PREPROCESSED_DEMO`: “사전 처리된 합성 데모 결과 — 실시간 AI 호출 아님”
- `FAILED_AFTER_RETRY`: “재처리 후 실패 — 결과 없음”

사전 처리 결과는 통제된 합성 fixture를 보여줄 때만 사용하고, 라이브 OpenAI 결과인 것처럼 표시하지 않습니다.

### 6. 데모 품질 게이트 권장안

다음 조건을 모두 통과해야 데모 준비 완료로 봅니다.

1. 20개 합성 PDF가 모두 업로드되고 각각의 처리 상태가 표시됩니다.
2. 승인되지 않은 scorecard로는 분석이 시작되지 않습니다.
3. 저장된 모든 인용문이 실제 페이지 텍스트와 일치합니다.
4. 잘못된 인용문, 잘못된 페이지, 알 수 없는 기준 ID는 저장되지 않고 격리됩니다.
5. Recruiter는 최종 결정을 저장할 수 없고, hiring manager만 최초 결정을 저장할 수 있습니다.
6. Admin은 기존 결정을 변경할 수 있지만 반드시 변경 사유를 남겨야 합니다.
7. 최초 결정과 모든 변경 결정에 사유, 행위자, 시각, 이전 값이 기록됩니다.
8. `NOT_FOUND`와 `HUMAN_ONLY`가 역량 부족으로 오해되지 않는 문구로 표시됩니다.
9. API 실패는 한 번만 재처리되고, 이후 실패 알림이 표시됩니다.
10. 데모 리셋 후 항상 동일한 합성 데이터와 상태가 복원됩니다.
11. 실제 개인정보, 비밀키, 원본 이력서 텍스트가 로그와 fixture에 없습니다.
12. lint, typecheck, unit, integration/RLS, E2E, build가 통과합니다.

### 7. 아직 남은 세부 결정

- `OPENAI_MODEL`에 실제로 사용할 구체적인 모델명
- Admin이 기존 결정만 변경할지, 최초 결정도 예외적으로 생성할지
  - 권장: 최초 결정은 hiring manager만, Admin은 기존 결정 변경만 허용
- Recruiter의 임시 의견을 수정·삭제할 수 있는지
  - 권장: 최종 결정과 분리해 수정 가능하게 하되, 작성자와 수정 시각은 남김
- 실패 알림 방식
  - 권장 P0: 앱 내부 알림과 처리 목록의 실패 상태
  - Slack·이메일 알림은 P1

## Input — 2026-08-23 09:27:08 +0800 (+08)

1. `OPENAI_MODEL`에 사용할 구체적인 모델명: 현재 사용할 수 있는 모델이 뭐가 있고, 가격이 제일 저렴한게 무엇인지 알려줘.
2. Admin이 기존 결정만 변경할지, 최초 결정도 생성할지: Admin 이 모든 것을 할 수 있도록 결정하고, 이건 뿐만아니라 SCIM 로그 형태로 남겨야 하는 것들은 모두 로그를 남겨줘.
3. Recruiter 임시 의견 수정·삭제 여부: 권장안 그래도 해줘. 그리고 히스토리 이력을 남겨줘.
4. 실패 알림 방식: 앱 내부 알림과 처리 목록의 실패 상태, Slack·이메일 알림에 알려줘

## Output — 2026-08-23 09:27:48 +0800 (+08)

공식 OpenAI 문서 기준 결론:

- 절대적으로 가장 저렴한 모델은 `gpt-5-nano`입니다: 입력 $0.05 / 출력 $0.40 per 1M tokens.
- 새 비용 민감·대량 처리 작업에 대한 공식 권장과 HireLens의 Structured Outputs 요구를 함께 고려하면 `gpt-5.6-luna`를 권장합니다: 입력 $0.20 / 출력 $1.20 per 1M tokens.
- 따라서 기본값은 `OPENAI_MODEL=gpt-5.6-luna`로 정하고, 모델명은 환경 변수로 유지합니다. `gpt-5.6` alias는 최고가 모델인 `gpt-5.6-sol`로 연결되므로 비용 통제를 위해 사용하지 않습니다.

비교 가능한 텍스트 모델 가격(표준, 1M tokens 기준):

| 모델 | 입력 | 출력 | 용도 |
|---|---:|---:|---|
| `gpt-5.6-sol` | $5.00 | $30.00 | 최고 품질·복잡한 작업 |
| `gpt-5.6-terra` | $2.00 | $12.00 | 품질과 비용의 균형 |
| `gpt-5.6-luna` | $0.20 | $1.20 | 비용 민감·대량 처리, 권장 |
| `gpt-5.5` | $5.00 | $30.00 | 복잡한 전문 작업 |
| `gpt-5.4` | $2.50 | $15.00 | 전문 작업 |
| `gpt-5.4-mini` | $0.75 | $4.50 | 강한 소형 모델 |
| `gpt-5.4-nano` | $0.20 | $1.25 | 저비용 추출·분류 |
| `gpt-5-mini` | $0.25 | $2.00 | 저지연·정형 작업 |
| `gpt-5-nano` | $0.05 | $0.40 | 절대 최저가·단순 추출/분류 |

가격은 OpenAI 공식 모델 문서의 표준 가격이며, cached input, Batch/Flex, 지역 처리, 도구 호출 비용은 별도입니다. 계정·사용량 등급에 따라 실제 사용 가능한 모델은 달라질 수 있으므로 API의 모델 목록도 확인해야 합니다.

Admin은 모든 제품 작업을 수행할 수 있도록 확정합니다. 단, 감사 로그 자체는 Admin도 수정·삭제할 수 없는 추가 전용 기록으로 유지합니다. SCIM을 실제 연동한다는 의미가 아니라, SCIM 스타일의 `actor/action/target/result/time` 구조로 모든 권한·상태 변경을 기록합니다.

기록 대상:

- 사용자 생성·수정·비활성화·역할 변경
- job·scorecard 생성, 수정, 승인, 새 버전 생성
- PDF 업로드·재처리·격리·실패 상태 변경
- evidence 수정·격리·복구
- 후보자 할당 및 검토 상태 변경
- Recruiter 의견 생성·수정·삭제·복구
- 최초 결정 생성 및 결정 변경
- 데모 리셋
- Slack·이메일 알림 발송·실패

로그 필드에는 `event_id`, `event_type`, `actor_id`, `actor_role`, `target_type`, `target_id`, `action`, `before`, `after`, `reason`, UTC timestamp, request/correlation ID, source, result를 포함합니다. 원본 이력서 텍스트, 비밀키, 토큰, signed URL은 로그에 저장하지 않습니다.

Recruiter 의견은 다음 정책으로 확정합니다:

- Recruiter는 본인이 작성한 임시 의견을 수정·삭제할 수 있음
- 삭제는 물리 삭제가 아닌 soft delete
- Admin은 모든 Recruiter 의견을 수정·삭제·복구할 수 있음
- Hiring Manager는 의견을 조회할 수 있지만 최종 결정과는 별도 영역으로 봄
- 의견의 모든 버전과 생성·수정·삭제·복구 이력을 보존
- 감사 이벤트에는 의견 본문 대신 note ID와 버전 ID를 기록하고, 본문 이력은 별도의 권한 보호 테이블에 저장

실패 알림은 다음 순서로 확정합니다:

1. 일시적인 API 오류·timeout·5xx 발생 시 자동으로 한 번 재처리합니다.
2. 재처리 후에도 실패하면 처리 상태를 `FAILED`로 변경합니다.
3. 처리 목록에 실패 상태와 안전한 실패 사유를 표시합니다.
4. 앱 내부 알림을 생성합니다.
5. 내부 Slack 채널에 알림을 보냅니다.
6. 기본 수신자인 업로드 Recruiter와 Admin에게 이메일을 보냅니다. 담당 Hiring Manager 알림은 후보자가 할당된 경우 추가합니다.

Slack과 이메일에는 원본 이력서나 PII를 넣지 않고 job ID, opaque application ID, 실패 분류, 재시도 횟수, 인증된 앱 링크만 포함합니다. 알림 발송 자체도 성공·실패 이력으로 남기며, 알림 발송 실패가 이력서 처리 상태를 다시 성공으로 바꾸지는 않습니다.

공식 참고 문서: OpenAI [모델 목록](https://developers.openai.com/api/docs/models), [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna), [GPT-5 nano](https://developers.openai.com/api/docs/models/gpt-5-nano), [모델 선택 가이드](https://developers.openai.com/api/docs/guides/latest-model), [API 가격](https://platform.openai.com/pricing).

## Input — 2026-08-23 09:33:32 +0800 (+08)

1. `gpt-5.6-luna` 를 사용하자, 그리고 이번 데모를 통해 실제 최대 요금이 얼마나 발생할 수 있을지 알려줘
2. Admin 권환 및 감사 로그 확정 해줘
3. 동의
4. 실패는 Admin에게만 나머지 업무적인 흐름은 각 담당자에게 발생 해줘, Slack과 이메일은 일단 P1으로 다시 분류하자

## Output — 2026-08-23 09:33:32 +0800 (+08)

확정 사항:

- `OPENAI_MODEL=gpt-5.6-luna` 사용.
- 20개 합성 PDF, PDF당 모델 요청 1회, 실패 시 1회 재처리로 데모 모델 호출을 제한.
- 안전한 데모 상한을 PDF당 시도 1회당 입력 16,000 tokens, 출력 4,000 tokens로 설정하면 evidence 분석 최대 비용은 약 $0.32, scorecard 초안 1회까지 포함하면 약 $0.33입니다. 실제 사용량은 보통 더 낮습니다.
- 무제한 Admin 재처리를 허용하면 이론상 비용 상한이 없어지므로, 데모에서는 파일·scorecard 버전당 최대 2회 시도와 앱 예산 게이트(예: $1)를 둡니다.
- Admin은 최초 결정 생성, 결정 변경, 사용자·역할·scorecard·처리·근거·의견·리셋 등 모든 제품 작업을 수행할 수 있음.
- 감사 로그 자체는 Admin도 수정·삭제할 수 없는 추가 전용 기록으로 유지.
- Recruiter 의견은 수정·soft delete 가능, 모든 버전을 보존하고 변경 이력을 기록.
- 처리 실패 알림은 Admin에게만 앱 내부 알림과 처리 목록 상태로 표시.
- 일반 업무 알림은 각 담당자에게 앱 내부 알림으로 표시.
- Slack·이메일 알림은 P1으로 재분류하고 P0 데모 필수 조건에서 제외.

SCIM 스타일 감사 로그에는 actor, role, action, target, before/after, reason, UTC timestamp, request/correlation ID, source, result를 남기며 원본 이력서·비밀키·토큰·signed URL은 저장하지 않습니다.

## Input — 2026-08-23 09:34:59 +0800 (+08)

그 다음 작업해야 할 사항은 뭐지?

## Output — 2026-08-23 09:35:33 +0800 (+08)

다음 구현 작업은 먼저 결정사항을 문서화한 뒤 Phase 0 저장소 스캐폴딩을 시작하는 것이다. 우선순위는 다음과 같다.

1. `docs/10_DECISIONS.md`, `docs/01_PRD.md`, `TASKS.md`에 Admin 전체 권한, 추가 전용 감사 로그, Recruiter 의견 soft delete/버전 이력, `gpt-5.6-luna`, 파일당 최대 2회 시도와 데모 예산 게이트, Admin 전용 실패 알림, Slack/이메일 P1을 반영한다.
2. 아직 필요한 제품 fixture 하나를 확정한다: 합성 백엔드 엔지니어 직무 설명과 hiring manager가 승인할 REQUIRED/PREFERRED/INTERVIEW_ONLY 기준 목록.
3. Phase 0을 구현한다: pnpm workspace, `apps/web`, `apps/worker`, `packages/domain`, `packages/ai`, `packages/database`, `packages/pdf`, 환경 검증, lint/typecheck/test/build 명령, CI.
4. Phase 1 데이터·권한 기반을 구현한다: Supabase migrations, 시드 사용자, RLS denial tests, Admin 전체 권한, 추가 전용 audit events, Recruiter note versions/soft delete, 내부 notifications, private storage, deterministic reset.
5. Phase 2 scorecard 흐름을 구현한다: job 생성, AI 초안, ambiguity 검토, hiring manager 승인, immutable version, 승인 전 분석 차단.
6. Phase 3~4를 구현한다: 20개 합성 PDF 업로드, 페이지 추출, 멱등 queue/worker, `gpt-5.6-luna` Responses API, `store:false`, 입력·출력 token cap, 파일당 최대 2회 시도, Admin 전용 실패 알림, quote validation, quarantine, AI eval.
7. Phase 5~6에서 근거 중심 검토, Admin/Hiring Manager 결정과 사유, 결정 이력, 감사 타임라인, E2E/RLS/privacy/build/deployment 검증을 완료한다.

즉, 지금 당장 시작할 가장 작은 티켓은 `HL-001 Initialize workspace and commands`이며, Slack·이메일 연동은 현재 구현하지 않고 P1로 남긴다. 구현 순서는 [TASKS.md](TASKS.md)와 [docs/08_IMPLEMENTATION_PLAN.md](docs/08_IMPLEMENTATION_PLAN.md)에 맞춘다.

## Input — 2026-08-23 09:40:11 +0800 (+08)

결정사항 문서화 부터 진행하자. 무얼 작업 해야 하지?

## Output — 2026-08-23 09:41:47 +0800 (+08)

결정사항 문서화를 완료했습니다. `docs/10_DECISIONS.md`에 ADR-007 Admin 전권·추가 전용 감사, ADR-008 Recruiter 의견 버전/soft delete, ADR-009 `gpt-5.6-luna` 비용 제한·최대 2회 시도, ADR-010 P0 내부 알림·Slack/이메일 P1을 추가했습니다.

`docs/01_PRD.md`에는 역할 권한, Admin의 최초·변경 결정, 모든 결정 사유, 감사 이벤트 범위, 재시도·비용 게이트, Admin 전용 실패 알림, 내부 알림 요구사항을 반영했습니다.

`TASKS.md`에는 Admin 권한/RLS, SCIM 스타일 감사 이벤트, 의견 이력, 내부 알림, 모델 비용 제한, Admin 실패 알림, 새 결정 사유 규칙을 구현 티켓으로 추가하고 Slack·이메일은 P1으로 유지했습니다.

검증 결과 `git diff --check`가 통과했습니다. 코드는 수정하지 않았고 문서 3개만 변경했습니다. 다음 구현 티켓은 `HL-001 Initialize workspace and commands`입니다.

## Input — 2026-08-23 09:49:25 +0800 (+08)

합성 백엔드 엔지니어 직무 설명과 scorecard 기준 이거는 실제 채용 공고를 낼 때 작성을 할 수 있는 폼을 만들어줘. 리크루터가 일반적으로 올리겠지? 그리고 그 폼에 넣을만한 데모 내용 제안 해줘.

## Output — 2026-08-23 09:50:28 +0800 (+08)

일반 흐름은 Recruiter가 채용 공고 초안을 작성하고, AI가 scorecard 초안을 제안하며, Hiring Manager가 기준을 검토·승인하는 방식이다. P0에서는 외부 채용 사이트에 실제 게시하지 않고 내부 job record와 raw job description을 작성하는 폼으로 둔다.

폼은 하나로 합치지 않고 다음 두 단계로 분리한다.

1. Job Posting Form: 직무명, 부서, 고용 형태, 근무 방식/위치, Recruiter, Hiring Manager, 요약, 주요 업무, 필수 요건, 우대 요건, 채용 절차, 공개 메모를 입력한다.
2. Scorecard Builder: AI 초안을 생성한 뒤 각 기준의 이름, 유형, 정의, 인정 근거, 대체 근거, resume-assessable 여부, 원문 phrase, ambiguity note, 인터뷰 질문을 편집한다. Hiring Manager가 승인한 뒤 immutable version이 되고, 승인 전에는 분석할 수 없다.

데모 job은 `HireLens Demo Company / Backend Engineer / Product Engineering / 정규직 / 서울·하이브리드(데모)`로 제안한다. 주요 업무는 운영 백엔드 API·서비스 개발, 배포·모니터링, 프론트엔드·제품팀 협업, 안정성·성능 개선이다. 필수 요건은 운영 환경 백엔드 경험, API 설계·구현, 관계형 DB, 자동화 테스트이며, 우대 요건은 Docker/클라우드/CI-CD/관측성/비동기 처리다. 디버깅 사고 과정과 기술적 협업·의사결정 설명은 `INTERVIEW_ONLY`로 둔다.

Scorecard 기준은 다음과 같이 제안한다: `REQUIRED` 운영 환경 백엔드 서비스 개발·운영, API 설계·구현, 관계형 DB 모델링·운영, 자동화 테스트·품질 개선; `PREFERRED` 배포·관측성·비동기 처리; `INTERVIEW_ONLY` 디버깅·장애 대응 사고 과정, 기술적 의사결정 설명·협업. 글로벌 fit score나 weight는 추가하지 않는다.

역할별 동작은 Recruiter가 job draft를 저장·수정하고 scorecard 생성을 요청하며, Hiring Manager가 기준을 수정·승인하고, Admin이 전체 작업을 수행하는 구조다. 필수 UI 상태는 draft, scorecard pending approval, approved, unauthorized, validation error, stale version이다.

관련 구현 티켓은 `HL-020` job create/list UI, `HL-021` scorecard draft contract, `HL-022` ambiguity review UI, `HL-023` approval/versioning이다. 이 답변에서는 실제 UI 코드를 작성하지 않고 폼 계약과 합성 데모 입력값을 제안했다.

## Input — 2026-08-23 09:52:02 +0800 (+08)

아래 내용 진행하자 무얼 결정해야 하지?

다음 구현 티켓은 다음 네 가지입니다.

- `HL-020` Job 생성·목록 UI
- `HL-021` Scorecard 초안 계약
- `HL-022` 모호한 표현 검토 UI
- `HL-023` 승인 및 버전 관리

## Output — 2026-08-23 09:52:33 +0800 (+08)

네 티켓 전에 결정할 항목과 권장 기본값을 정리했다.

- `HL-020`: 필수 Job 필드는 title, department, raw job description, recruiter, hiring manager. location/employment/openings는 선택. 상태는 `DRAFT`, `SCORECARD_PENDING_APPROVAL`, `READY_FOR_INTAKE`, `ARCHIVED`. Recruiter는 draft 생성·수정, Hiring Manager는 조회, Admin은 전체 관리. 외부 게시 버튼은 P0에서 제외.
- `HL-021`: raw JD와 선택적 Recruiter clarification을 입력으로 하고, strict schema의 ambiguity, criterion name/type/definition, accepted·alternative evidence, resume-assessable, source phrase를 출력. `gpt-5.6-luna`, `store:false`, no fit score/no decision field, prompt/schema/model version 저장. 이전에 제안한 backend scorecard 기준을 데모 기본값으로 사용.
- `HL-022`: 모호한 문구는 source phrase, 이유, 제안 조치를 함께 표시. `좋은 커뮤니케이션`은 `INTERVIEW_ONLY`, `운영 경험`은 구체적인 정의를 요구. Hiring Manager가 수락·수정·분류·제외하고 unresolved ambiguity가 남으면 승인을 막음. Admin은 전체 관리, Recruiter는 조회·초안 의견.
- `HL-023`: scorecard version 상태는 `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `SUPERSEDED`. 정상 승인은 Hiring Manager, Admin은 override 승인 가능. Admin override에는 사유 필수. 승인 버전은 immutable, 수정은 새 draft version, 분석은 `APPROVED`만 허용. stale version 경고와 approval actor/time/version 표시.

공통 acceptance criteria는 로딩·empty·partial·retryable/fatal error·unauthorized·stale version 상태, keyboard/accessibility, draft 분석 차단, immutable version, 새 버전 생성, unresolved ambiguity 차단, AI draft와 사람의 승인/결정 분리다. 이 답변에서는 코드를 수정하지 않았다.

## Input — 2026-08-23 09:56:56 +0800 (+08)

권장안 그대로 동의 할게

## Output — 2026-08-23 09:57:28 +0800 (+08)

권장안을 제품 결정으로 확정하고 `docs/10_DECISIONS.md`에 ADR-011을 추가했다.

- Recruiter가 Job draft를 생성·수정하고 Hiring Manager가 scorecard를 검토·승인하는 두 단계 흐름
- Job 필수 필드와 선택 필드
- Job 상태 `DRAFT`, `SCORECARD_PENDING_APPROVAL`, `READY_FOR_INTAKE`, `ARCHIVED`
- Scorecard 상태 `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `SUPERSEDED`
- 모호한 기준은 해결·재정의·`INTERVIEW_ONLY` 분류·제외 후에만 승인 가능
- 승인 버전 immutable, 수정은 새 버전 생성, 분석은 승인 버전만 사용
- Admin은 전체 작업과 승인 override 가능하며 override 사유와 감사 이벤트 필수
- P0 외부 채용 사이트 게시 및 글로벌 fit score/weight는 제외

`git diff --check`가 통과했으며, ATS UI와 scorecard-contract 원칙에 맞는 acceptance criteria도 결정 로그에 포함했다.

## Input — 2026-08-23 10:00:08 +0800 (+08)

`HL-020`부터 `HL-023`까지 구현 내용이 뭐지?

## Output — 2026-08-23 10:00:27 +0800 (+08)

네 티켓은 다음 범위다.

- `HL-020`: `/jobs`, `/jobs/new`, `/jobs/[id]` Job 생성·목록·상세 UI, 필수/선택 필드 validation, Job 상태, Recruiter/Hiring Manager/Admin 권한, create/update audit, loading/empty/error/unauthorized 상태. 외부 채용 게시와 scorecard 승인은 제외.
- `HL-021`: raw JD와 clarification을 입력으로 하는 strict `scorecardDraftSchema`, `gpt-5.6-luna` adapter, versioned prompt/schema/model metadata, ambiguity와 criterion fields, `store:false`, fit score/decision field 금지, DRAFT 저장과 schema/error 테스트.
- `HL-022`: source phrase·모호한 이유·추천 조치를 보여주는 ambiguity review UI, `좋은 커뮤니케이션`의 `INTERVIEW_ONLY` 기본 처리, 기준 재정의/수락/분류/제외, Hiring Manager/Admin 수정 권한, 미해결 ambiguity 승인 차단, 변경 audit와 테스트.
- `HL-023`: scorecard 상태 machine `DRAFT → PENDING_APPROVAL → APPROVED → SUPERSEDED`, Hiring Manager 정상 승인, Admin override와 사유, immutable approved version, 수정 시 새 draft version, approved-only analysis gate, stale version 처리, RLS/integration/E2E 테스트.

권장 구현 순서는 `HL-020 → HL-021 → HL-022 → HL-023`이며, 전제는 Phase 0/1의 workspace·domain·database·auth/RLS 기반이다. 이 티켓들에는 PDF 업로드, 이력서 분석, 근거 추출, 후보자 결정 UI, Slack/email 연동은 포함하지 않는다.

## Input — 2026-08-23 10:02:05 +0800 (+08)

이게 결정해야 할 사항을 알려준건가? 아니면 실제 개발작업이 이제 진행되어도 되는건가?

## Output — 2026-08-23 10:02:16 +0800 (+08)

앞선 답변은 구현 범위와 acceptance criteria를 설명한 것이며, 실제 코드는 아직 시작하지 않았다. 다만 사용자가 권장안에 동의했고 `docs/10_DECISIONS.md`의 ADR-011에 기록했으므로 Job/Scorecard 관련 제품 결정은 개발을 시작해도 되는 상태다.

현재 남은 작업은 결정이 아니라 구현 순서다:

1. Phase 0: `HL-001` workspace, web/worker, packages, commands, env validation, CI
2. Phase 1: Supabase/Auth/RLS, 역할 권한, Job·Scorecard 저장소, audit 기반
3. `HL-020` Job 생성·목록 UI
4. `HL-021` Scorecard 초안 계약
5. `HL-022` 모호한 표현 검토 UI
6. `HL-023` 승인·immutable versioning

저장소가 아직 문서 중심이므로 `HL-020`만 바로 완성된 기능으로 만들 수는 없고 Phase 0/1 기반이 먼저 필요하다. 외부 채용 게시, PDF 처리, 후보자 분석, Slack/email은 이 작업 범위에 포함하지 않는다.

## Input — 2026-08-23 10:03:11 +0800 (+08)

`HL-001 Initialize workspace and commands` 에 담긴 내용은 뭐지?

## Output — 2026-08-23 10:03:25 +0800 (+08)

`HL-001`은 제품 기능이 아니라 문서 중심 저장소를 실행 가능한 TypeScript 모노레포로 만드는 Phase 0 기반 작업이다.

범위:

- root `package.json`, `pnpm-workspace.yaml`, lockfile, 공통 TypeScript/lint/format 설정
- `apps/web` Next.js App Router strict TypeScript 기본 셸
- `apps/worker` TypeScript worker 진입점과 no-op health task
- `packages/domain`, `packages/ai`, `packages/database`, `packages/pdf`의 package/tsconfig/export 뼈대
- `.env.example`와 환경 변수 검증
- `dev`, `lint`, `typecheck`, `test`, `test:integration`, `test:e2e`, `eval:ai`, `build`, `db:start`, `db:reset` 명령
- GitHub Actions CI
- 로컬 실행 가능한 빈 authenticated shell과 worker health check

완료 조건은 `pnpm install` 및 핵심 명령 통과, web/worker 실행, strict TypeScript, 안전한 환경 변수 오류, CI 통과다. Job form, Scorecard, OpenAI 호출, Supabase 테이블/RLS/seed, PDF 처리, 후보자 분석, Slack/email은 HL-001에 포함하지 않는다. 이 답변에서는 코드를 수정하지 않았다.

## Input — 2026-08-23 10:05:43 +0800 (+08)

응 진행해줘.

## Output — 2026-08-23 10:16:36 +0800 (+08)

HL-001 구현을 완료했다. pnpm workspace, strict TypeScript, Next.js 웹 셸(`/`, `/health`), 장기 실행 워커 health 셸, domain/ai/database/pdf 패키지 경계, 환경변수 검증, 공통 명령, Playwright/Vitest 예약 구조, GitHub Actions CI를 추가했다. README와 TASKS.md에 완료 범위와 미구성 범위를 반영했다.

검증 결과: `pnpm lint`, `pnpm typecheck`, `pnpm test`(2 tests), `pnpm format:check`, `pnpm build` 통과. 웹 health endpoint는 200 응답했고 워커도 정상 기동했다. `pnpm db:start`는 코드 문제가 아니라 Docker Desktop이 실행 중이지 않아 중단됐다.

Job/Scorecard, Supabase 스키마·RLS, OpenAI 호출, PDF 처리, 후보자 분석은 HL-001 범위에 포함하지 않았다.

## Input — 2026-08-23 10:23:03 +0800 (+08)

`pnpm` 명령어가 동작하지 않아 설치해야 하는 명령어는?

## Output — 2026-08-23 10:23:19 +0800 (+08)

저장소가 `pnpm@11.19.0`을 사용하므로 `npm install --global pnpm@11.19.0`으로 설치하고 `pnpm --version`, `pnpm install`을 실행하라고 안내했다. pnpm 공식 설치 문서 링크도 제공했다.

## Input — 2026-08-23 10:33:13 +0800 (+08)

오류 발생

`pnpm db:start` 실행 시 Docker daemon에 연결할 수 없다는 오류가 발생함.

## Output — 2026-08-23 10:33:38 +0800 (+08)

Docker CLI는 설치되어 있지만 Docker Desktop daemon이 실행되지 않은 상태임을 진단했다. macOS에서 `docker desktop start` 또는 `open -a Docker`로 Docker Desktop을 시작하고 `docker info`로 확인한 뒤 `pnpm db:start`를 다시 실행하도록 안내했다. 이후 `supabase/config.toml`이 없으면 `supabase init`이 추가로 필요하며, 현재 HL-001에는 Supabase 스키마/마이그레이션이 아직 없음을 설명했다.

## Input — 2026-08-23 11:17:36 +0800 (+08)

`pnpm db:start`에서 이미지 pull 이후 `supabase_storage_hirelens` 컨테이너가 `unhealthy` 상태가 되어 Supabase 시작이 실패함. `logflare` 이미지 pull 중 일시적인 resolve 오류가 있었으나 이후 다운로드가 완료됨.

## Output — 2026-08-23 11:19:33 +0800 (+08)

`supabase start --debug`로 재시작한 결과 `Started supabase local development setup.`까지 성공했다. 모든 주요 컨테이너가 실행 중이고 `supabase_storage_hirelens`는 `healthy`, REST API도 정상 응답했다. 최초 실패는 첫 실행 중 storage health check의 일시적인 readiness/timeout 문제로 판단되며, `supabase/seed.sql` 경고는 seed 파일이 아직 없어 발생한 비치명 경고라고 설명했다.

## Input — 2026-08-23 20:33:02 +0800 (+08)

실행 후 여기까지 완료. 브라우저에서 `http://127.0.0.1:54321`을 열었고 `{"message":"no Route matched with those values"}`가 표시됨.

## Output — 2026-08-23 20:33:13 +0800 (+08)

첨부 화면은 지시문이 아니라 실행 결과이며, `54321` API gateway의 루트 경로에 매칭되는 route가 없어 나타나는 정상 응답이라고 설명했다. Supabase Studio는 `54323`, Mailpit은 `54324`, REST API 확인 경로는 `/rest/v1/`이라고 안내하고, `supabase/seed.sql` 경고는 seed 파일 부재에 대한 비치명 경고라고 덧붙였다.

## Input — 2026-08-23 20:40:00 +0800 (+08)

좋아 그다음 작업해야할 스텝은? 그리고 Git에 develop/alpha/main 이렇게 나눠서 관리하고 싶은데 언제쯤 하면 좋을까?

## Record correction — 2026-08-23 20:37:01 +0800 (+08)

The preceding Input entry was recorded with an approximate timestamp; the current request was observed during this turn.

## Output — 2026-08-23 20:37:01 +0800 (+08)

현재 브랜치가 `main`이고 작업 트리가 아직 커밋되지 않은 상태임을 확인했다. 즉시 브랜치를 나누기보다 Phase 0 기준 커밋을 먼저 만든 뒤 `develop`을 활성 작업 브랜치로 두고, 첫 데모 가능한 수직 슬라이스 직전에 `alpha`를 release-candidate/demo 브랜치로 만드는 전략을 제안했다. 다음 구현 순서는 Phase 1 Supabase/Auth/RLS/seed/audit 기반, 이후 HL-020부터 HL-023까지다.

## Input — 2026-08-23 20:40:00 +0800 (+08)

`HL-001` 이게 어디에 정의된 값이지?

## Input — 2026-08-23 20:45:00 +0800 (+08)

확인 완료. 다음 작업 진행 하자.

## Output — 2026-08-23 20:44:10 +0800 (+08)

`HL-001`은 `docs/08_IMPLEMENTATION_PLAN.md`의 “Suggested implementation tickets → Foundation” 섹션에 `Initialize workspace and commands`로 정의되어 있음을 확인했다. `HL-002`~`HL-004`도 같은 Foundation 목록에 있다. `HL-020`~`HL-023`은 같은 문서의 Scorecard 목록에 정의되어 있다.

## Output — 2026-08-23 20:48:16 +0800 (+08)

Phase 1 구현을 시작하려 했으나, `docs/04_DATA_MODEL.md`와 PRD/ADR-011의 Job·Scorecard 상태 enum이 충돌함을 발견해 migration 작성을 중단했다. 권장 정합안은 PRD/ADR-011의 `DRAFT → SCORECARD_PENDING_APPROVAL → READY_FOR_INTAKE → ARCHIVED` 및 `DRAFT → PENDING_APPROVAL → APPROVED → SUPERSEDED`를 기준으로 데이터 모델 문서를 맞춘 뒤 계속 진행하는 것이다.

## Input — 2026-08-23 20:50:00 +0800 (+08)

응 그러자.

## Output — 2026-08-23 21:11:47 +0800 (+08)

PRD/ADR-011 기준으로 `docs/04_DATA_MODEL.md` 상태 enum을 정정하고 Phase 1 foundation을 구현했다. profiles/jobs/audit_events migration, RLS, synthetic auth/profile/job seed, private resumes bucket forward migration, pgTAP 허용·거부 테스트, demo-only reset guard, README/TASKS를 추가했다. `pnpm test:integration` 15/15, lint, typecheck, unit test 2개, format check, build가 통과했다. `APP_ENV=demo pnpm db:reset`은 migration/seed 적용까지 성공했지만 Supabase Storage health check에서 exit 1이 발생해 clean reset 최종 상태는 외부 환경 리스크로 남겼다.

## Input — 2026-08-23 21:15:00 +0800 (+08)

지금 로컬 도커에 Supabase 까지 올라와 있는건가?

## Output — 2026-08-23 21:39:41 +0800 (+08)

로컬 Docker에서 Supabase 주요 컨테이너가 실행 중이며 DB, Storage, REST API가 정상 응답하는 것을 확인했다. Studio, Auth, Realtime 등 관련 서비스도 실행 중임을 안내했다.

## Input — 2026-08-23 21:44:31 +0800 (+08)

도커에 DB가 실행 되면서 로컬이 무거운거 같아. 로컬 및 알파는 별도로 Supabase에서 직접 Alpha DB를 생성해서 거기에 연동하도록 하자.

## Output — 2026-08-23 21:48:06 +0800 (+08)

개발용 hosted Supabase와 Alpha용 hosted Supabase를 분리하는 ADR, 환경변수 계약, 원격 migration 보호 명령을 반영했다. hosted 환경에서 `pnpm db:start`가 Docker를 시작하지 않도록 변경했고, 실행 중이던 로컬 Supabase 컨테이너는 데이터 볼륨을 보존한 채 중지했다. lint, typecheck, unit test, format check, build를 통과했다. 실제 Supabase 프로젝트 생성과 키 설정은 계정·조직·리전 정보가 필요한 후속 작업으로 남겼다.

## Output — 2026-08-23 21:38:50 +0800 (+08)

로컬 Docker에서 Supabase 컨테이너들이 실제 실행 중임을 확인했다. DB, Studio, Storage, Auth, REST, Realtime 등 주요 컨테이너가 실행 중이고 Storage는 `healthy`, REST API `http://127.0.0.1:54321/rest/v1/`도 정상 응답했다. Studio는 `http://127.0.0.1:54323`에서 접근 가능하다고 안내했다.

## Input — 2026-08-23 21:49:00 +0800 (+08)

지금 로컬 도커에는 뭐가 동작 중이지?

## Output — 2026-08-23 21:49:25 +0800 (+08)

Docker 실행 컨테이너와 Supabase 컨테이너가 모두 없는 상태임을 확인했다. 로컬 Supabase는 이전에 중지되었고 데이터 볼륨은 보존되어 있으며, 현재 Docker는 실행 중인 컨테이너가 없다.

## Input — 2026-08-23 21:52:44 +0800 (+08)

원래 그럼 도커는 DB 때문에 올렸던 건가?

## Output — 2026-08-23 21:52:56 +0800 (+08)

Docker는 PostgreSQL만이 아니라 로컬 Supabase 전체 스택을 실행하기 위해 사용했다고 설명했다. DB, Auth, Storage, REST API, Realtime, Studio, Mailpit 등의 컨테이너가 함께 올라오며, hosted Supabase를 사용하면 일상 개발에서는 Docker가 필요 없다고 안내했다.

## Input — 2026-08-23 21:53:44 +0800 (+08)

그러면 내가 Supabase에 DB 올리고 다시 알려 줄게 거기에 지금 작업 했던 것 모두 적용해줘.

## Output — 2026-08-23 21:53:51 +0800 (+08)

사용자가 Supabase 프로젝트 생성을 완료한 뒤 연결 정보를 알려주면, 현재 작업한 migration, RLS, private Storage bucket, synthetic seed, hosted 환경 설정을 해당 프로젝트에 적용하기로 안내했다. 비밀 키는 채팅으로 보내지 않도록 안내할 예정이다.

## Input — 2026-08-23 22:03:57 +0800 (+08)

생성 완료 했는데 .env 파일에 Supabase 접근에 필요한 정보 알려줘

## Output — 2026-08-23 22:04:03 +0800 (+08)

Supabase 대시보드에서 확인할 project ref, project URL, publishable key, server-only secret key를 `.env.local`에 설정하는 형식과 각 키의 사용 범위를 안내했다. secret key는 채팅으로 공유하지 말고 로컬/서버 환경변수에만 두도록 안내했다.

## Input — 2026-08-23 22:09:15 +0800 (+08)

일단 현재 기준 정보로 로컬에서 Supabse 접근 가능한지 확인해 줄래?

## Output — 2026-08-23 22:10:21 +0800 (+08)

`.env.local`의 URL과 publishable key를 값 노출 없이 확인했다. Auth settings endpoint는 HTTP 200으로 인증 성공했고, `jobs` endpoint는 HTTP 404로 아직 HireLens migration이 원격 프로젝트에 적용되지 않았음을 확인했다. `SUPABASE_PROJECT_REF`와 `SUPABASE_SECRET_KEY`는 비어 있어 원격 migration push와 서버/워커 접근 전 설정이 필요하다.

## Input — 2026-08-23 22:11:58 +0800 (+08)

한번더 확인해줘

## Output — 2026-08-23 22:12:29 +0800 (+08)

`.env.local`에서 hosted-dev, project ref와 URL 일치, publishable/secret key 설정을 확인했다. Auth settings는 HTTP 200으로 접근 가능했고, `public.jobs` 조회는 PostgREST PGRST205로 테이블이 없어 migration 미적용 상태임을 재확인했다. 원격 DB에는 아직 스키마를 쓰지 않았다.

## Input — 2026-08-23 22:13:06 +0800 (+08)

응 적용해줘.

## Output — 2026-08-23 22:14:07 +0800 (+08)

`.env.local`의 hosted-dev project ref로 `supabase link`를 시도했으나 현재 Supabase CLI 로그인 계정이 대상 프로젝트 Management API에 필요한 권한이 없어 `LegacyLinkProjectStatusError`로 중단했다. 원격 migration과 seed는 적용하지 않았고, 올바른 Supabase 계정으로 CLI 재로그인이 필요하다고 안내했다.

## Input — 2026-08-23 22:17:07 +0800 (+08)

다시 작업 진행 해줘.

## Output — 2026-08-23 22:19:12 +0800 (+08)

대상 hosted-dev Supabase 프로젝트 link에 성공했다. IPv4/pooler 연결로 전환한 뒤 두 committed migration을 적용하고 `--include-seed`로 합성 seed를 적용했다. 원격 migration history 2개, Auth settings HTTP 200, profiles 4건, jobs 2건, audit_events 2건, private resumes bucket HTTP 200, publishable key의 비인증 jobs 조회 0건을 확인했다.

## Input — 2026-08-23 22:22:58 +0800 (+08)

로컬/알파는 통합 시켜줘.

## Output — 2026-08-23 22:24:14 +0800 (+08)

현재 migration·seed가 적용된 Supabase 프로젝트를 로컬과 Alpha가 함께 사용하는 `hosted-alpha` backend로 통합했다. `.env.local`과 `.env.example`의 target을 hosted-alpha로 맞추고, README·architecture·ADR-013·TASKS에 공유 DB 운영 규칙을 반영했다. hosted 환경의 `pnpm db:start`는 Docker를 시작하지 않으며, lint·typecheck·unit test·format check를 통과했다.

## Input — 2026-08-23 22:28:37 +0800 (+08)

그 다음 진행해야 할 작업은?

## Output — 2026-08-23 22:28:46 +0800 (+08)

공용 hosted-alpha 연결 이후의 다음 작업으로 Phase 2를 제시했다. 즉시 시작할 티켓은 HL-020 Job 생성·목록 UI이며, 이후 HL-021 scorecard 초안 계약, HL-022 모호한 표현 검토 UI, HL-023 승인·불변 버전 관리를 순서대로 구현하고 각 단계에서 RLS·감사·권한 테스트를 추가한다고 안내했다.

## Input — 2026-08-23 22:29:20 +0800 (+08)

Phase 1 은 이미 작업이 모두 클리어한가?

## Input — 2026-08-23 22:30:47 +0800 (+08)

그럼 왜 페이즈2로 안내를 했지?

## Output — 2026-08-23 22:30:54 +0800 (+08)

Phase 1의 DB 기반 완료와 Phase 1 전체 완료를 혼동해 Phase 2를 바로 안내한 것이 잘못이었다고 설명했다. 남은 Admin 결정 권한, Recruiter 의견, 내부 알림은 현재 후속 도메인에 의존하므로 Phase 2를 막지 않는다고 판단했지만, TASKS 기준으로는 미완료이며 먼저 완료하거나 명시적으로 후속 Phase로 재분류해야 한다고 정정했다.

## Input — 2026-08-23 22:31:31 +0800 (+08)

페이즈 0은 남은 작업 없어? 모두 클리어인가?

## Output — 2026-08-23 22:31:39 +0800 (+08)

Phase 0은 11개 중 10개가 완료되었고, `Codex가 custom agents와 repository skills를 감지하는지 확인` 항목 1개가 남아 있어 전체 완료는 아니라고 안내했다.

## Input — 2026-08-23 22:32:47 +0800 (+08)

Codex가 프로젝트의 custom agents와 repository skills를 정상 감지하는지 확인 해줘

## Output — 2026-08-23 22:33:18 +0800 (+08)

`.codex/config.toml`의 agents enabled 설정, 7개 custom agent TOML의 name/description, 8개 repository skill의 유효한 frontmatter를 확인했다. 현재 Codex 세션에서도 repository skills가 로드된 상태임을 확인했으며, TASKS.md의 Phase 0 감지 확인 항목을 완료로 표시했다.

## Input — 2026-08-23 22:38:30 +0800 (+08)

이거 진행하자, 결정해야 할 사항은?

1. 전체 Admin 권한 매트릭스
   - 최초·변경 결정 생성/수정 권한 포함
2. Recruiter 임시 의견
   - 수정·삭제·복구 및 버전 이력
3. 내부 알림
   - 역할별 업무 알림
   - 처리 실패 시 Admin 알림

## Output — 2026-08-23 22:38:47 +0800 (+08)

이미 확정된 Admin·Recruiter note·notification 원칙과 추가로 결정해야 할 세부사항을 구분해 설명했다. 권장안으로 Admin은 전체 product operation과 최초·변경 human decision을 수행하되 이유·감사 로그를 필수화하고, Recruiter note는 본인 생성·수정·soft delete와 버전 이력, Admin 전체 관리, Hiring Manager 읽기만 허용하며, 알림은 P0 인앱·처리 목록·담당자 수신과 Admin 전용 실패 알림으로 유지하고 Slack·email은 P1로 두는 안을 제시했다.

## Input — 2026-08-23 22:40:03 +0800 (+08)

권장안 기준으로 확정 하자

## Output — 2026-08-23 22:40:32 +0800 (+08)

권장안을 ADR-014로 확정 문서화했다. Admin 전체 운영 권한과 최초·변경 결정 사유·감사, 자기 역할 보호, shared hosted Alpha reset 금지, Recruiter note의 본인 수정·soft delete·복구와 immutable version, Admin 전체 관리, Hiring Manager 활성 note 읽기, P0 인앱 알림·역할별 수신·Admin 전용 실패 알림·중복 방지·P1 Slack/email 원칙을 기록했다. `git diff --check`를 통과했다.

## Input — 2026-08-23 22:43:15 +0800 (+08)

그 다음 진행해야 할 작업 사항은?

## Output — 2026-08-23 22:43:26 +0800 (+08)

ADR-014 결정은 완료됐지만 구현은 아직이라고 구분했다. 다음은 의존성에 맞춰 Phase 1의 Admin 결정 권한·Recruiter note·알림 구현 항목을 각각 Human decision/Review와 Processing workflow 단계로 재배치하고, 즉시 HL-020 Job 생성·목록 UI부터 HL-021~HL-023을 구현하는 순서라고 안내했다.

## Input — 2026-08-23 22:46:42 +0800 (+08)

`HL-020` Job 생성·목록 UI 진행하자.

## Output — 2026-08-23 22:29:27 +0800 (+08)

Phase 1은 12개 항목 중 9개가 완료되어 전체 완료 상태는 아니라고 안내했다. 남은 항목은 전체 Admin 권한 매트릭스, 버전이 있는 Recruiter 임시 의견, 내부 알림과 역할별 수신자이며, 현재 DB 기반·RLS·Storage·감사 로그·합성 seed는 완료되었다고 설명했다.

## Input — 2026-08-23 22:07:14 +0800 (+08)

1. Project Ref
2. Project URL
3. Publishable key
4. Secret key

어디서 확인 가능하지?

## Output — 2026-08-23 22:07:27 +0800 (+08)

Supabase Dashboard의 프로젝트 Connect dialog와 Settings > API Keys 위치를 안내했다. Project Ref는 Dashboard URL의 project 경로와 API URL에서 확인하고, 새 Publishable/Secret 키 또는 Legacy anon/service_role 키의 대응 관계와 Secret key 비공개 원칙을 설명했다.

## Output — 2026-08-23 23:06:16 +0800 (+08)

HL-020 Job 생성·목록 UI를 구현했다. 역할별 인증·RLS·DRAFT 생성, 직무 목록, 로딩/빈 상태/오류/읽기 전용 상태, 합성 계정 E2E, 도메인 검증 테스트를 추가했고, raw job description은 목록 응답과 감사 메타데이터에 포함하지 않도록 했다. Supabase migration 20260823000300을 공유 Alpha에 적용했다. 로컬 Docker는 실행되지 않아 local pgTAP clean reset은 수행하지 못했지만, Alpha RLS 조회 검증은 Recruiter Hiring Manager profile 2개·Job 2개, Hiring Manager Job 1개·Recruiter profile 1개, Admin profile 4개로 확인했다. lint, typecheck, unit test 6개, format, build, Playwright 2개가 통과했다.

## Input — 2026-08-23 23:07:31 +0800 (+08)

그 다음 작업 진행해야할 것은?

## Output — 2026-08-23 23:08:04 +0800 (+08)

다음 구현은 HL-021 Scorecard 초안 계약이다. 먼저 scorecard_versions/criteria 도메인·마이그레이션·RLS·Structured Output 계약을 만들고, Recruiter의 초안 요청, Hiring Manager의 검토·승인 경계, Admin 전체 권한, 모호한 원문 표현과 근거 필드를 정의한다. AI 결과는 초안으로만 저장하고 승인 전 분석을 막으며, 이후 HL-022 모호한 표현 검토 UI와 HL-023 승인·불변 버전 관리로 진행한다고 안내했다.

## Input — 2026-08-23 23:08:58 +0800 (+08)

`HL-021 Scorecard 초안 계약` 진행하자.

## Output — 2026-08-23 23:36:58 +0800 (+08)

HL-021 Scorecard 초안 계약을 구현했다. strict Zod/JSON Schema와 버전화된 OpenAI Responses Structured Output 계약, source phrase 검증, `REQUIRED`/`PREFERRED`/`INTERVIEW_ONLY`, `CLEAR`/`AMBIGUOUS`/`HUMAN_ONLY`, evidence fields, server-only adapter, `store:false`, 일회성 transient retry를 추가했다. Scorecard DB/RLS/RPC/감사 로그와 `READY_FOR_INTAKE` 승인 scorecard guard를 추가하고 Alpha 원격에 migration 20260823000400과 합성 fixture를 적용했다. Job 상세 화면에서 Recruiter/Admin의 초안 요청과 Hiring Manager의 읽기 전용 검토 경계를 연결했다. 결정 문서, 데이터 모델, TASKS, domain/RLS/E2E 테스트를 갱신했다. lint, typecheck, unit 18 tests, format, build, deterministic AI contract eval을 통과했다. E2E 3개는 DEMO_TEST_PASSWORD 미설정으로 스킵되었고 local pgTAP은 Docker PostgreSQL 미실행으로 수행하지 못했다. 로컬 OpenAI API key는 설정되지 않아 실제 API 호출은 실행하지 않았다.

## Input — 2026-08-23 23:39:12 +0800 (+08)

`HL-022 모호한 표현 검토 UI` 진행하자.

## Input — 2026-08-23 23:40:18 +0800 (+08)

Review HL-022 Ambiguity Review UI scope in /Users/jukyeong.kim/.vscode/projects/hirelens against docs/01_PRD.md, docs/05_AI_CONTRACTS.md, docs/10_DECISIONS.md, and the current implementation. Read-only; do not edit. Confirm the smallest P0 behavior, allowed roles and actions, draft vs approved/version boundaries, required audit/reason fields, wording/accessibility guardrails, and any product conflicts. Return concise acceptance criteria and risks.

## Output — 2026-08-23 23:44:02 +0800 (+08)

HL-022는 P0다. 현재 구현은 HL-021의 AI scorecard 초안 표시까지이며, 모호성 해결을 위한 사람의 편집·저장·감사 흐름은 없다. 따라서 현재 상태는 모호한 표현을 보여 주어 속도에는 일부 기여하지만, 모든 표현의 검토 커버리지와 결정 기록 문제는 해결하지 못한다. 최종 채용 판단은 별도 인간 전용 흐름으로 유지된다.

1. Blocking conflicts

- 현재 UI는 읽기 전용이다. `ScorecardDraftPanel`에는 초안 요청만 있고, 해당 action은 `ADMIN`/소유 `RECRUITER`만 허용하며 `HIRING_MANAGER`는 읽기만 한다. 이는 ADR-011의 “Hiring Manager가 scorecard를 편집·승인” 결정 및 ADR-016의 HL-022 편집 follow-up과 아직 연결되지 않았다. See `apps/web/src/app/jobs/_components/scorecard-draft-panel.tsx:28`, `apps/web/src/app/jobs/actions.ts:106`, `docs/10_DECISIONS.md:276`, `docs/10_DECISIONS.md:506`.
- 상위 `ambiguous_phrases` 항목에 criterion ID가 없어 사람이 어떤 기준을 수정해야 하는지 안정적으로 연결할 수 없다. See `packages/domain/src/scorecard.ts:17`, `docs/10_DECISIONS.md:467`.
- 모호성 변경을 저장하는 RPC/action이나 해당 audit event/reason 계약이 없다. 현재 audit은 초안 생성만 기록한다. See `supabase/migrations/20260823000400_scorecard_contract.sql:101`, `docs/01_PRD.md:191`.
- 상태 표현이 충돌한다. 화면은 모든 버전을 `status-draft`로 표시하고 승인된 버전에도 초안 경고를 낼 수 있으며, `CLEAR`도 모호성 해결 필요처럼 표시한다. `getScorecardForJob`도 상태가 아니라 최신 version number만 읽는다. 이는 `CLEAR`/`AMBIGUOUS`/`HUMAN_ONLY` 정의 및 draft/approved 구분과 충돌한다. See `apps/web/src/app/jobs/_components/scorecard-draft-panel.tsx:69`, `apps/web/src/app/jobs/_components/scorecard-draft-panel.tsx:105`, `apps/web/src/app/jobs/_components/scorecard-draft-panel.tsx:173`, `packages/database/src/scorecards.ts:20`, `docs/10_DECISIONS.md:470`.

2. Scope classification

P0. It belongs to the P0 scorecard-review path and is explicitly sequenced before HL-023 approval/versioning. It is not P1/P2 and must not expand into candidate ranking, fit score, automatic acceptance/rejection, notifications, or hiring decisions. See `docs/01_PRD.md:11`, `docs/08_IMPLEMENTATION_PLAN.md:44`, `docs/10_DECISIONS.md:475`.

Smallest defensible role model:

- `ADMIN`: view all; edit/resolve assigned or any draft; approval override later, always with a reason and audit.
- Assigned `HIRING_MANAGER`: view and resolve/edit the assigned draft; approve later in HL-023.
- Assigned `RECRUITER`: request the AI draft and read it; no approval. Whether Recruiters may edit criteria is not explicit and must be marked TBD.
- AI/worker: generate draft metadata only; never resolve, approve, or write a hiring decision.
- Unauthenticated or unassigned users: no access.

3. Missing decisions

- Exact resolution actions and persisted fields: rewrite criterion, reclassify as `INTERVIEW_ONLY`, exclude, or mark clear. The docs name these outcomes but do not define an enum or criterion linkage.
- Whether draft edits are in-place, when `DRAFT` becomes `PENDING_APPROVAL`, and when an old approved version becomes `SUPERSEDED`.
- Whether every ambiguity resolution requires a human rationale. The docs require a reason for Admin approval override and human hiring decisions, but do not explicitly require one for ordinary scorecard edits. Make this a labeled TBD; the safer P0 choice is a required non-empty rationale for each resolution.
- The approval gate must consume only a resolved draft; unresolved `AMBIGUOUS` items must block approval. Approval itself and immutable-version history remain HL-023.
- No customer target is invented: PRD metrics are explicitly TBD. Any new role policy or reason taxonomy must likewise be labeled TBD. See `docs/01_PRD.md:304`.

4. Acceptance criteria

- Every flagged phrase is shown with its source phrase, AI explanation, status, suggested question, and stable linked criterion; the reviewer can inspect definition, accepted/alternative evidence, and resume-assessable state.
- Only an authenticated assigned Hiring Manager or Admin can save a human resolution. Recruiter remains read-only unless the TBD role decision changes. Server authorization and cross-job denial are tested.
- AI output remains visibly AI-generated. A human must explicitly save the resolution; no action creates or changes a candidate hiring decision.
- `HUMAN_ONLY` forces `INTERVIEW_ONLY` and `resume_assessable=false`; unresolved `AMBIGUOUS` remains approval-blocking. `APPROVED` is read-only; editing it creates a new draft version and never overwrites the approved record.
- Each save appends an audit event containing actor, role, action/target, scorecard version, before/after values, reason when required, UTC timestamp, correlation ID, source, and result. No raw resume text or PII is logged; audit events cannot be updated or deleted. See `docs/01_PRD.md:212`.
- Wording uses “제출 자료에서 근거를 찾지 못함”/“면접에서 확인해야 합니다,” never “지원자는 역량이 없다” or “컬처핏이 낮다.” AI evidence, human resolution, and final decision are separate labels. See `docs/05_AI_CONTRACTS.md:156` and `apps/web/AGENTS.md:16`.
- Controls are keyboard accessible with semantic labels/headings, visible text plus non-color status, focus preservation, and loading/empty/error/unauthorized/stale-version states. See `apps/web/AGENTS.md:25`.

5. Smallest valid slice

Add a criterion-linked ambiguity review panel for one assigned Job: read the AI draft, edit the draft criterion/resolution, save through an authorized server RPC, emit an append-only audit event, and show unresolved count plus stale-version handling. Keep it draft-only; defer approval, approved immutability/new-version workflow, candidate review, and final hiring decisions to HL-023 and later P0 slices. Add role, unresolved-gate, immutable-boundary, wording, accessibility, and audit tests.

## Input — 2026-08-23 23:43:37 +0800 (+08)

Please conclude with a concise acceptance-criteria summary now; read-only, no edits.

## Output — 2026-08-23 23:44:05 +0800 (+08)

HL-022 is P0. Acceptance criteria:

- Show every AI-flagged phrase with its explanation, ambiguity status, suggested interview question, and stable linked criterion. Include definition, accepted/alternative evidence, and resume-assessable state. See `docs/05_AI_CONTRACTS.md:16` and `packages/domain/src/scorecard.ts:35`.
- Allow only an authenticated assigned `HIRING_MANAGER` or `ADMIN` to save a human resolution; keep Recruiter read-only unless the unresolved role-policy question is explicitly marked TBD. Deny cross-job access.
- Keep AI output visibly draft-only. No automatic approval, candidate ranking, or hiring decision. `HUMAN_ONLY` must become `INTERVIEW_ONLY` with `resume_assessable=false`; unresolved `AMBIGUOUS` blocks approval. See `docs/10_DECISIONS.md:267`.
- Keep approved versions immutable. Any approved-scorecard edit creates a new draft version; never overwrite the approved record. Approval/version history remains HL-023.
- Each resolution save appends an audit event with actor, role, action/target, scorecard version, before/after values, rationale when required, UTC time, correlation ID, source, and result. Audit events are append-only and contain no resume text or PII. See `docs/01_PRD.md:212`.
- Use evidence-first wording: “제출 자료에서 근거를 찾지 못함” and “면접에서 확인해야 합니다”; never infer lack of ability or culture fit. Distinguish AI evidence from human resolution and final decision. See `docs/05_AI_CONTRACTS.md:156`.
- Provide keyboard-accessible labeled controls, non-color status cues, focus preservation, and loading/empty/error/unauthorized/stale-version states. Add role, unresolved-gate, audit, wording, and immutable-boundary tests. See `apps/web/AGENTS.md:25`.

Smallest valid slice: a criterion-linked, draft-only review panel with one authorized save RPC, append-only audit, unresolved count, and stale-version handling. No project files were changed.

## Input — 2026-08-23 23:44:04 +0800 (+08)

Please conclude now with the minimum acceptance criteria and any conflicts; read-only.

## Output — 2026-08-23 23:44:20 +0800 (+08)

Minimum acceptance criteria:

- Assigned `HIRING_MANAGER` and `ADMIN` can review and save a human resolution; Recruiter can view/request drafts but cannot approve. AI/worker identities cannot resolve or decide.
- Every ambiguity is linked to a criterion and shows source phrase, AI explanation, status, evidence definition, and interview question. `HUMAN_ONLY` forces `INTERVIEW_ONLY`; unresolved `AMBIGUOUS` blocks approval.
- Edits apply only to draft/pending versions. Approved versions are read-only; changes create a new draft version. No resume analysis uses an unapproved version.
- Each save creates an append-only audit event with actor/role, action, target, scorecard version, before/after, rationale when required, timestamp, correlation ID, source, and result; no resume text or PII.
- AI evidence, human scorecard resolution, and final hiring decision are visibly distinct. Wording must not infer missing ability or culture fit; controls must be keyboard accessible and not color-only.

Conflicts/blockers:

- Current implementation is read-only: no ambiguity edit/save action exists, and Hiring Manager is read-only. See `apps/web/src/app/jobs/_components/scorecard-draft-panel.tsx:28` and `apps/web/src/app/jobs/actions.ts:106`.
- `ambiguous_phrases` has no stable criterion ID, so a resolution cannot be safely targeted. See `packages/domain/src/scorecard.ts:17`.
- The UI always presents the version as a draft and mislabels `CLEAR` ambiguity; it also lacks the ambiguity audit/reason path. See `apps/web/src/app/jobs/_components/scorecard-draft-panel.tsx:69` and `supabase/migrations/20260823000400_scorecard_contract.sql:101`.
- Recruiter edit permission, exact resolution enum, draft-to-`PENDING_APPROVAL` transition, and whether every resolution requires a reason remain TBD. No customer metric target is defined; PRD marks metrics TBD. See `docs/01_PRD.md:304`.

No project files were changed.

## Input — 2026-08-23 23:46:00 +0800 (+08)

You are the single write agent for the HL-022 backend slice in /Users/jukyeong.kim/.vscode/projects/hirelens. You are not alone in the repository; do not revert or modify other work. Write only these files: (1) new forward migration supabase/migrations/20260823000500_scorecard_ambiguity_review.sql, (2) packages/database/src/scorecards.ts and packages/database/src/index.ts as needed, (3) new supabase/tests/database/003_scorecard_ambiguity_review.sql. Do not edit domain, apps/web, docs, seed, or existing applied migrations. Implement an atomic security-definer RPC review_scorecard_ambiguity for draft scorecard criteria: only assigned HIRING_MANAGER or ADMIN; only DRAFT scorecard; lock version+criterion; expected_snapshot JSONB must match current criterion snapshot else SQLSTATE 40001; resolutions CLARIFY or INTERVIEW_ONLY; enforce type/resume_assessable/evidence constraints; require non-empty reason; update only criteria fields and retain AI ambiguous_phrases; append audit_events with event SCORECARD_AMBIGUITY_REVIEWED, job aggregate, actor, safe IDs/status/type before/after, reason, version_ref; no raw job description. Keep direct criteria/version writes denied. Add SQL pgTAP tests for HM/Admin allowed, Recruiter denied, stale snapshot denied, approved/draft boundary, and audit metadata/no raw text. Follow existing migration style and add rollback note. Return changed files and any caveats.

## Output — 2026-08-23 23:58:51 +0800 (+08)

HL-022 모호한 표현 검토 UI를 구현했다. AI source phrase와 연결 기준·현재 상태·AI 제안 질문을 표시하고, 할당된 Hiring Manager/Admin만 draft를 `CLARIFY` 또는 `INTERVIEW_ONLY`로 저장할 수 있게 했다. 도메인 입력 검증, server action, stale snapshot 충돌 처리, 키보드 접근 가능한 검토 폼, Recruiter 읽기 전용 상태와 오류/권한 피드백을 추가했다. `review_scorecard_ambiguity` security-definer RPC와 append-only `SCORECARD_AMBIGUITY_REVIEWED` 감사 이벤트를 추가하고 Alpha에 migration 20260823000500/00600을 적용했다. 결정 문서·데이터 모델·TASKS·unit/RLS/E2E 테스트를 갱신했다. lint, typecheck, unit 20 tests, format, build, deterministic AI eval을 통과했다. E2E 4개는 DEMO_TEST_PASSWORD 미설정으로 스킵되었고, local pgTAP은 Docker PostgreSQL 미실행으로 수행하지 못했다.
## Input — 2026-08-24 00:06:24 +0800 (+08)

`HL-023 승인 및 버전 관리` 진행하자.

## Input — 2026-08-24 00:12:02 +0800 (+08)

You are the single write agent for the HL-023 backend/domain slice in /Users/jukyeong.kim/.vscode/projects/hirelens. You are not alone; preserve all existing dirty work and never revert others. Read root AGENTS.md, supabase/AGENTS.md, relevant docs and scorecard/supabase skills. Own ONLY: (1) new forward migration supabase/migrations/20260824000100_scorecard_approval_versioning.sql, (2) packages/domain/src/scorecard.ts, packages/domain/src/index.ts, packages/domain/src/scorecard.test.ts, (3) packages/database/src/scorecards.ts and index.ts, (4) new supabase/tests/database/004_scorecard_approval_versioning.sql. Do not edit apps/web, docs, TASKS, seeds, existing migrations, or records.

Contract: assigned HIRING_MANAGER or ADMIN approves any DRAFT scorecard; both require non-empty reason; expected status/version token rejects stale via SQLSTATE 40001. Approval blocks any criterion AMBIGUOUS; validates HUMAN_ONLY=>INTERVIEW_ONLY + resume_assessable false. Atomically supersede prior APPROVED, preserve its approved_by/approved_at, approve target, set job READY_FOR_INTAKE, one APPROVED/job, append safe SCORECARD_APPROVED audit with actor role, reason, before/after version IDs/statuses, correlation/source/result/version_ref; no raw JD/criterion text. Approved/SUPERSEDED versions and criteria are DB-immutable; permit only controlled APPROVED→SUPERSEDED status transition while preserving all fields. Add create_scorecard_revision RPC for assigned HM/Admin: reason required, source must be APPROVED and expected version/status current, no existing DRAFT for job, clone version metadata and all criteria to next DRAFT with new IDs, preserve source untouched and active, keep job READY_FOR_INTAKE, audit SCORECARD_REVISION_CREATED. Direct writes remain revoked, public execution revoked, authenticated execute only. Add partial unique index for one APPROVED/job and adjust approval metadata constraint so SUPERSEDED retains metadata. Expose repo/domain inputs and getScorecardWorkspaceForJob returning latest working version, active approved version, and version history with approver display name if feasible through existing REST/RLS; keep getScorecardForJob compatible. Tests: domain reasons/UUID, pgTAP HM/Admin allowed, Recruiter/unassigned denied, ambiguity block, atomic status/job/audit, immutable source, clone IDs/version, stale denial, unique approved. Do not implement processing tables; expose/find-current-approved gate only if it fits cleanly. Run narrow tests if possible. Return exact files changed and caveats.

## Output — 2026-08-24 00:18:29 +0800 (+08)

HL-023 backend/domain slice is saved. Added the forward migration with reasoned HM/Admin approval and revision RPCs, stale-token SQLSTATE 40001 handling, ambiguity and HUMAN_ONLY gates, atomic approved-version replacement, READY_FOR_INTAKE transition, immutable approved/superseded versions and criteria, authenticated-only execution, one-approved-per-job index, and safe append-only audits. Added domain input contracts, repository approval/revision methods, and scorecard workspace/history reads while preserving getScorecardForJob.

Changed implementation files: supabase/migrations/20260824000100_scorecard_approval_versioning.sql; packages/domain/src/scorecard.ts; packages/domain/src/index.ts; packages/domain/src/scorecard.test.ts; packages/database/src/scorecards.ts; packages/database/src/index.ts; supabase/tests/database/004_scorecard_approval_versioning.sql. The mandatory root recording rule also appended .codex/records/RECORD.md.

Verification: scorecard domain tests 11/11 passed; full unit suite 26/26 passed; domain/database package typechecks and full workspace typecheck passed; targeted ESLint passed. Clean reset and pgTAP were not run because the Docker daemon is unavailable. SQL formatting was manually preserved because the repository Prettier setup has no SQL parser. Existing profile RLS can make an Admin approver's display name null to non-Admin participants; IDs and approval metadata remain available.

## Output — 2026-08-24 00:39:06 +0800 (+08)

HL-023 승인 및 버전 관리를 구현하고 공유 Alpha Supabase에 migration 20260824000100을 적용했다. 담당 Hiring Manager/Admin 승인, 필수 사유, AMBIGUOUS 차단, content_revision 기반 stale 승인 방지, 기존 승인본 supersede 및 승인 메타데이터 보존, 승인/이전 버전 DB 불변성, 최초 초안 RPC 우회 차단, 사유 기반 새 초안 복제, Job READY_FOR_INTAKE 전이, 안전한 append-only 감사 이벤트를 추가했다. UI는 작업 초안·활성 승인본·불변 버전 이력을 분리하고 역할별 승인/새 버전 생성 폼과 오류 상태를 제공한다. ADR-018, 데이터 모델, TASKS, pgTAP/E2E 계약을 갱신했다. lint, typecheck, unit 26개, format, build, remote migration dry-run/push, migration history, remote schema lint를 통과했다. E2E 4개는 DEMO_TEST_PASSWORD 미설정으로 스킵됐고 Docker가 꺼져 있어 local clean reset/pgTAP은 실행하지 못했다. Phase 3 enqueue/worker의 active APPROVED gate와 광범위한 criterion editor/exclusion UI는 후속 작업이다.

## Input — 2026-08-24 00:41:41 +0800 (+08)

지금까지 작업한 것 develop 브랜치에 커밋 푸쉬 해주고 alpha 와 main 브랜치도 생성 해줘.
