# HireLens Codex Starter

HireLens는 **AI가 지원자를 대신 선발하는 시스템이 아니라, 사람이 더 빠르고 근거 있게 판단하도록 돕는 채용 판단 지원 ATS**입니다.

이 저장소 스타터는 Codex로 MVP를 바이브 코딩할 때 필요한 프로젝트 문서, Codex 지침, 커스텀 서브에이전트, 저장소 스킬을 한 번에 시작할 수 있도록 구성했습니다.

## MVP의 한 문장

> Hiring Manager가 채용 요청과 서류 검토 기준을 만들고, 승인된 공고의 모든 이력서에서 기준별 원문 근거를 찾아 보여준 뒤, Recruiter와 Hiring Manager가 사람의 판단과 이유를 기록한다.

## 이 스타터에 포함된 것

- 루트 및 디렉터리별 `AGENTS.md`
- 제품 정의, PRD, 사용자 흐름, 아키텍처, 데이터 모델
- AI 출력 계약과 평가 계획
- 개인정보·보안 원칙
- 구현 백로그와 데모 시나리오
- `.codex/agents/`의 프로젝트 전용 커스텀 서브에이전트
- `.agents/skills/`의 반복 작업용 저장소 스킬
- `.env.example`, `.gitignore`

## 기술 방향

- **Web:** Next.js App Router + TypeScript
- **UI:** Tailwind CSS + shadcn/ui
- **Data:** Supabase PostgreSQL + Auth + Storage + Queues
- **Worker:** Node.js/TypeScript 백그라운드 워커
- **Document:** PDF.js
- **AI:** OpenAI Responses API + Structured Outputs
- **Test:** Vitest + Playwright
- **Deploy:** Vercel + Railway 또는 동등한 컨테이너 호스팅

HL-001에서 사용하는 패키지 버전은 루트 및 앱의 `package.json`과 `pnpm-lock.yaml`에 고정했습니다.

## HL-001 실행 기반

현재 저장소에는 실행 가능한 웹 셸, 장기 실행 워커 셸, 공유 패키지 경계, 환경변수 검증, CI 검증 명령이 있습니다.

```bash
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm env:check
```

일상 개발의 웹·워커와 Alpha 배포는 동일한 hosted Alpha Supabase 프로젝트에 연결하며 Docker를 실행할 필요가 없습니다. `.env.example`의 `SUPABASE_ENV=hosted-alpha`와 공용 Supabase URL·publishable key를 설정하세요. 로컬과 Alpha는 `APP_ENV`만 각각 `development`와 `alpha`로 다르게 사용합니다.

공개 지원서 접수는 별도의 서버 전용 `DEMO_PUBLIC_SUBMISSION_CODE`가 설정된 경우에만 활성화됩니다. 이 코드는 공개 페이지에 포함하지 말고 진행자가 참가자에게 별도로 전달하세요.

`pnpm db:start`는 항상 Docker 실행을 거부합니다. `pnpm test:integration`은 `.env.local`의 `DATABASE_URL`로 공유 Alpha PostgreSQL에 연결해 등록된 pgTAP 검증을 실행합니다. 각 검증은 임시 합성 데이터를 트랜잭션 안에서 만들고 rollback하며 Alpha 데이터를 초기화하지 않습니다.

공용 hosted Alpha 프로젝트에 migration을 적용할 때는 project ref를 확인한 뒤 `SUPABASE_ENV=hosted-alpha SUPABASE_PROJECT_REF=<alpha-ref> SUPABASE_CONFIRM_MIGRATION=YES pnpm db:push`로 실행합니다. 공유 Alpha는 `db:reset` 대상이 아니며, 초기화 명령은 프로젝트에서 비활성화되어 있습니다.

HL-001에는 Job, Scorecard, 후보자, PDF 처리, OpenAI 호출, Supabase 스키마/RLS, Slack·이메일 알림을 포함하지 않습니다.

## 시작 순서

1. 이 폴더를 새 Git 저장소의 루트로 복사합니다.
2. Codex에서 저장소를 신뢰합니다. 프로젝트 로컬 `.codex/config.toml`은 신뢰된 프로젝트에서만 로드됩니다.
3. `AGENTS.md`와 `START_HERE.md`를 읽습니다.
4. Codex에서 `/skills`로 저장소 스킬을 확인합니다.
5. 아래 첫 프롬프트로 시작합니다.

```text
Read AGENTS.md, START_HERE.md, docs/00_PRODUCT_BRIEF.md, and docs/01_PRD.md.
Spawn product_guardian and code_mapper in parallel.
Do not write code yet.
Return:
1) unresolved product decisions,
2) the smallest P0 vertical slice,
3) a repository scaffolding plan,
4) risks that can invalidate the demo.
Wait for both agents and consolidate their findings.
```

6. 계획을 승인한 뒤 `$vertical-slice`를 사용해 Phase 0부터 구현합니다.

## 예상 저장소 구조

```text
hirelens/
├─ apps/
│  ├─ web/
│  └─ worker/
├─ packages/
│  ├─ ai/
│  ├─ database/
│  ├─ domain/
│  └─ pdf/
├─ supabase/
│  ├─ migrations/
│  └─ seed.sql
├─ tests/
│  ├─ e2e/
│  ├─ fixtures/
│  └─ ai-evals/
├─ docs/
├─ .codex/
├─ .agents/
├─ AGENTS.md
└─ TASKS.md
```

## 데모 데이터 원칙

이 스타터에는 출제 PDF나 실제 지원자 이력서를 포함하지 않습니다.

- 발표·시드·테스트에는 합성 이력서만 사용하며, 업로드 기능은 실제 이력서를 형식만으로 차단하지 않습니다.
- 고객사 자료는 저장소에 커밋하지 않습니다.
- 실제 개인정보를 사용하기 전에는 별도의 보안·개인정보 검토가 필요합니다.
- AI는 최종 합격·불합격을 결정하지 않습니다.

## 업무 흐름 기준 구현 순서

```text
Hiring Manager: Job Requisition + 서류 검토 기준 작성
→ Requisition Approver: 업무 승인/반려
→ Recruiter: 공고 게시
→ 지원자: PDF 이력서 제출
→ Worker: 페이지별 텍스트·기준별 원문 근거 추출
→ Recruiter: 사전 검토 후 Hiring Manager 리뷰 요청
→ Hiring Manager: 인터뷰 진행/보류/추가 정보 요청 결정
→ 이후: 별도 최종 인사결정 및 이유 기록
```

Slack, Google Calendar, 실제 채용 플랫폼 연동은 위 흐름이 검증된 뒤 P1에서 추가합니다.
