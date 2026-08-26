# PLAN.md — 평가 기준 교정 루프 (Judgment Flywheel)

이 문서는 HireLens에 **면접 결과를 평가 기준으로 되먹이는 두 번째 루프**를 추가하기 위한
실행 계획이다. 배경, 설계 근거, 기존 코드 규칙, 티켓 단위 작업, 데모 요구사항을 모두 담는다.

## 0. 읽는 순서

1. 이 문서 1~4장 (배경 · 현재 상태 · 블로커 · 설계 원칙)
2. `AGENTS.md` — 저장소 불변식과 작업 절차
3. `docs/13_UI_UX_GUIDE.md` — 화면을 만들기 전 필수
4. `supabase/migrations/20260824002200_evidence_backend_slice.sql` — 따라야 할 RPC/검증 패턴의 원본
5. 이 문서 5장 이후

기존 문서와 충돌하면 **멈추고 보고한다.** 임의로 한쪽을 고르지 않는다.

---

## 1. 배경 — 왜 이걸 만드는가

### 1.1 출제 문제의 진짜 숫자

Zero100 Builderthon 트랙 01(저지먼트)의 고객사는 코드프레소다. 출제문에 이런 현황이 있다.

| 지표                                           | 현재                                         |
| ---------------------------------------------- | -------------------------------------------- |
| 공고당 접수                                    | 200건                                        |
| 실제 검토                                      | 상위 40건 (접수순, 나머지 160건 미검토 마감) |
| **서류 통과자 중 면접에서 직무 불일치로 판명** | **약 절반**                                  |
| 접수 → 첫 면접 안내                            | 8~10일                                       |
| 채용 판단 기록                                 | 담당자 기억과 슬랙에 흩어짐                  |

대부분의 참가팀은 첫 줄(160건 미검토)에 달려들어 "AI가 이력서를 평가한다"를 만들 것이다.
그러나 **세 번째 줄이 핵심이다.** 지금 서류를 통과시킨 판단의 절반이 틀렸다는 뜻이고,
틀린 기준으로 200건을 다 읽으면 **틀린 판단을 5배 빠르게** 할 뿐이다.

### 1.2 기존 ATS로 풀리는 것과 안 풀리는 것

시장 조사 결과(그리팅 / 두들린, 국내 1위 ATS)는 다음과 같다.

**그리팅이 이미 제공하는 것**

- 채용 홈페이지 빌더, 다이렉트 소싱, 인재풀(TRM), 대규모 채용
- 채용 플랫폼 공고 통합 관리, 지원자 통합 수집, 칸반 보드
- 구조화된 평가 프로세스, 평가자 멘션·댓글 협업
- 면접 일정 조율, 이메일·SMS·카카오톡 자동 통보
- 채용 전환율·리드타임·병목 대시보드, Open API / Webhook
- **AI 서류 평가 (베타)** — 사용자가 선호/비선호 조건 4~20개와 가중치를 입력하면
  0~100점과 조건별 판정 아이콘("면접에서 확인" 포함), 평가 근거를 제공.
  자동 합불은 없고 최종 결정은 사람이 한다.

즉 "AI가 기준별로 평가하고 근거를 보여주며 사람이 결정한다"는 **이미 시장에 있다.**
그 방향으로 가는 팀은 그리팅 베타의 열화판을 만들게 된다.

**그리팅에도 없는 것 (공식 가이드 문서 확인)**

- 조건이 어디서 오는지 도와주지 않는다. 사용자가 직접 쓴다.
  (2026-05-13 업데이트로 JD를 안 보고 입력된 조건만 사용)
- 조건이 맞는지 검증하지 않는다. 변별력이 있는지 알려주지 않는다.
- **"조건을 수정하지 않으면 재평가되지 않는다"**, **"합격/불합격 처리된 지원자는 평가 대상에서 제외"**
  → 결정이 내려진 순간 그 지원자를 놓아버린다. 면접 결과가 조건으로 돌아갈 통로가 구조적으로 없다.
- 분석 대시보드가 프로세스 지표(전환율·리드타임)만 본다. **판단이 맞았나**를 재는 지표가 없다.
- AI 평가 결과를 사람이 수정할 수 없다. 즉 "AI가 이거 잘못 봤다"가 데이터로 쌓이지 않는다.

출제문 2페이지에 채용 담당자의 결론이 그대로 적혀 있다.

> "툴을 들여도 문제는 그대로일 것 같았어요. 툴이 없어서가 아니라, 판단이 사람 손을 너무 많이 타서 생기는 문제거든요."

**우리가 만들 것은 그리팅과 겹치는 부분이 아니라, 그리팅을 도입해도 남는 부분이다.**

### 1.3 제품 테제

> 기존 ATS를 도입해도 안 풀리는 문제는 **전부 평가 기준이 좌우한다.**
> 면접 5분 만에 "아니네"가 보이는 원인도 결국 서류를 통과시킨 평가 기준이다.

이걸 뒷받침하는 출제문 인용 두 개.

> "인사 쪽에서 올려주는 후보 중 절반은 면접 5분이면 아닌 게 보입니다. 우리한테 필요 없는 경험이거든요.
> **근데 그걸 공고에 어떻게 써야 걸러지는지는 저도 모르겠어요.**" (개발팀 리더)

> "누구를 왜 뽑았고 왜 떨어뜨렸는지가 조직 어디에도 남지 않아서,
> **채용을 거듭해도 나아지지 않고 매번 처음부터 다시 합니다.**" (경영진)

리더는 기준을 **이미 알고 있다.** 5분 만에 판별하니까. 못 하는 건 그걸 문장으로 옮기는 것뿐이다.
AI가 기준을 발명하는 게 아니라, 그가 반복해서 내린 판단에서 일관된 패턴을 찾아
**"당신은 사실 이 기준으로 거르고 계십니다"**를 문장으로 돌려주는 것이 이 기능이다.

### 1.4 절대 쓰지 말아야 할 표현

발표·UI·문서 어디에서도 다음 표현을 쓰지 않는다.

- ❌ "회사에 알맞는 사람을 **골라주는** 솔루션" → AI가 고른다는 뜻으로 읽힌다
- ❌ "회사의 **취지와 알맞는**" → 컬처핏으로 읽힌다. 출제문이 명시적으로 배제한 영역
- ✅ "기존 ATS는 지원자를 관리하지만, 우리는 **회사의 평가 기준이 채용을 거듭할수록 정확해지게** 만든다.
  사람은 계속 사람이 판단하고, 다만 그 판단이 다음 채용의 기준으로 남는다."

---

## 2. 현재 상태 (2026-08-26 실측)

### 2.1 검증된 것 — 전부 통과

```
pnpm test          ✅ 115 tests / 16 files
pnpm lint          ✅ clean
pnpm typecheck     ✅ 6개 패키지
pnpm build         ✅ 13개 라우트
pnpm privacy:scan  ✅ 253개 파일, 커밋된 시크릿 없음
pnpm eval:ai       ✅ 근거 골든셋 (5 accepted, 1 expected quarantine)
```

코드 규모: 14,190줄(TS/TSX), 마이그레이션 51개, pgTAP 테스트 20여 개, E2E 17개.

### 2.2 구현된 흐름

```
채용 생성 → AI 직무기술 초안 → 평가기준 초안(직접/AI) → 모호성 검토 → 승인
→ 공고 작성 → 게시 → 공개 지원(PDF) → 이력서 저장 → 페이지 텍스트 추출
→ AI 근거 추출(기준별 상태·인용·페이지·불확실성) → 인용 원문 검증
→ Recruiter 검토 → HM 검토 요청 → 면접 진행 결정
```

**마지막 지점은 `record_interview_progression()`이다.**
`INTERVIEW` / `HOLD` / `MORE_INFORMATION_REQUIRED` 중 하나를 사유와 함께 기록하고
`workflow_state = INTERVIEW_SELECTED`가 된다.

이건 **면접을 볼지 말지**를 정하는 것이다. **면접 이후는 아무것도 없다.**
우리 작업은 정확히 그 뒤에 붙는다.

### 2.3 검증 안 된 것 — 중요

`.env.local`이 필요해 로컬에서 못 돌린 것:

```
pnpm test:integration   ❌ 호스팅 Supabase 접속 필요
pnpm test:e2e           ❌ 같음
```

`TASKS.md` 미완 항목:

```
Phase 3  ☐ 배포된 Alpha Edge PDF.js 스모크 + 20건 부분배치 테스트
Phase 6  ☐ 데모 리셋과 결정론적 시드
Phase 6  ☐ Playwright 해피패스
Phase 6  ☐ Playwright 재시도/오류 경로
Phase 6  ☐ 배포 URL 빌드 및 스모크 테스트
Phase 6  ☐ 데모 스크립트 리허설
```

**구멍 두 개.**

1. **관통 테스트가 없다.** E2E 17개는 거의 전부 권한·가시성 테스트다
   ("리크루터는 최종 결정 폼을 볼 수 없다" 류). 지원 → 추출 → AI 근거 → 판단을
   한 번에 관통하는 테스트가 없다.
2. **CI가 E2E/integration을 안 돌린다.** (`.github/workflows/ci.yml`은
   lint / typecheck / test / privacy:scan / build만) 그래서 매번 초록불이 떠도
   파이프라인이 실제로 도는지는 CI가 모른다.

`demo-fallback` 스크린샷 3장과 `preprocessed_demo_fallback` 마이그레이션이 존재한다는 것은
팀이 이미 라이브 파이프라인의 데모 신뢰도를 걱정하고 있다는 신호다.

### 2.4 FW-PRE — 착수 전 반드시 할 것

**FW-0보다 먼저.** 반나절.

`.env.local`을 구성하고 **20건 배치를 끝까지 한 번 돌린다.**

FW-4(v2로 재분석 → before/after)가 기존 파이프라인이 실제로 도는 것에 전적으로 의존한다.
지금은 그게 검증되지 않았다. 여기서 안 돌면 FW-1~4를 다 만들어도 데모가 성립하지 않는다.
**발표 전날 밤에 확인하는 것보다 지금 확인하는 게 훨씬 싸다.**

단, **FW-1~FW-2는 파이프라인과 무관하게 만들 수 있다.** 면접 결과 기록과 진단은
순수 SQL이라 AI 호출이 없다. 파이프라인 검증이 늦어져도 병렬 진행 가능하다.

`.env.local` 참고:

- `.env.example`을 복사한 뒤 다음 네 개를 **추가**해야 한다 (예시 파일에 누락됨):
  - `DEMO_TEST_PASSWORD=DemoPass123!` — `supabase/seed.sql:27`에 하드코딩된 합성 비밀번호.
    없으면 E2E 17개 중 15개가 **조용히 skip**된다.
  - `OPENAI_RESPONSES_ENDPOINT=https://api.openai.com/v1/responses` — **함정.**
    근거 추출 어댑터는 기본값이 있으나(`evidence-adapter.ts`)
    평가기준 초안 어댑터(`adapter.ts`)는 없으면 throw한다.
    빼먹으면 "이력서 분석은 되는데 AI 초안 버튼만 안 되는" 상태가 된다.
  - `SUPABASE_CONFIRM_MIGRATION=YES` — `db:push` 가드
  - `SUPABASE_CONFIRM_DEMO_SEED=YES` — 시드 가드
- `DATABASE_URL`은 포트 **5432**(session pooler 또는 direct). 6543(transaction pooler)은
  prepared statement 미지원이라 `pg` 클라이언트를 쓰는 `verify-alpha-db.ts`가 깨진다.

---

## 3. 선행 블로커 — 제품 결정 하나를 뒤집어야 한다

`supabase/migrations/20260825000800_remove_review_framework_revision.sql`

```
-- MVP product decision: each Job uses one human-approved Review Framework.
-- Drafts remain editable until approval; approval is final for that Job.
-- Rollback: restore the RPC only through a forward migration
-- and a new product decision.
```

`create_scorecard_revision` RPC가 **의도적으로 삭제되었다.**
`TASKS.md`에도 "Lock the single approved Review Framework for each Job and
remove replacement-version controls."로 체크되어 있다.

**v2를 만들 수 없으면 이 계획 전체가 성립하지 않는다.**
그러므로 첫 작업은 코드가 아니라 **제품 결정을 뒤집는 ADR**이다.
마이그레이션 주석이 그렇게 하라고 명시하고 있다.

---

## 4. 설계 원칙 — 기존 코드가 이미 지키고 있는 것

새 코드는 예외 없이 이 패턴을 따른다. 원본은
`supabase/migrations/20260824002200_evidence_backend_slice.sql`와
`20260824002300_human_interview_gate.sql`이다.

### 4.1 쓰기는 RPC로만

```sql
create function public.some_action(...) returns ...
language plpgsql security definer set search_path = public, auth as $$ ... $$;

alter table public.some_table enable row level security;
create policy some_table_select_assigned on public.some_table for select to authenticated
  using (public.can_access_application(application_id));
grant select on public.some_table to authenticated;
revoke insert, update, delete on public.some_table from anon, authenticated, service_role;

revoke execute on function public.some_action(...) from public, anon, service_role;
grant execute on function public.some_action(...) to authenticated;
```

### 4.2 append-only 이력

```sql
create trigger some_table_prevent_update_or_delete
before update or delete on public.some_table
for each row execute function public.prevent_review_history_mutation();
```

### 4.3 감사 이벤트

모든 물질적 상태 변경은 `public.append_safe_audit(...)`를 호출한다.
**감사 payload에 이력서 원문, 자유 서술 노트, 개인정보를 넣지 않는다.**

### 4.4 SQL 레벨 엄격 검증

`persist_validated_evidence`가 표준이다. 반드시 흉내낼 것:

- `(select count(*) from jsonb_object_keys(result)) <> N` → 알 수 없거나 누락된 키 거부
- **승인된 기준 전부가 정확히 한 번씩** 나와야 통과
  (`jsonb_array_length(...) <> (select count(*) from public.criteria where ...)`)
- 중복 criterion 거부 (`seen_ids` 배열)
- `position(normalized_quote in page.normalized_text) = 0` → 원문에 없는 인용 거부
- 해시 재계산 후 대조

### 4.5 워커는 사람 결정을 쓰지 못한다 — 절대 불변

`20260824002200_evidence_backend_slice.sql` 마지막 줄:

```
-- The worker role intentionally retains no human review/outcome/decision table write grant.
```

**STT 파이프라인도 이 규칙을 지켜야 한다.** (6장 참조)

### 4.6 UI

- **Tailwind가 아니다.** `apps/web/src/app/globals.css`(2,909줄)에 의미 기반 클래스를 쌓아 쓴다.
  예: `panel`, `section-heading-inline`, `criterion-evidence-card`,
  `evidence-status evidence-{lower}`, `form-alert form-alert-error`, `empty-copy`,
  `version-label`, `careful-absence`
- 서버 컴포넌트 기본. 라벨은 파일 하단 라벨 맵 함수로
  (`application-evidence-panel.tsx:138` 참고)
- **색만으로 상태를 표현하지 않는다.** 모든 상태는 텍스트 + 아이콘 + 색 세 축을 갖는다
- 사람의 행동임이 명백한 라벨을 쓴다 (`사람의 결정 저장`, `검토 요청`)
- `NOT_FOUND` 문구는 반드시:
  **"제출 자료에서 이 기준을 뒷받침하는 근거를 찾지 못했습니다."**
  능력이 없다는 단정으로 쓰지 않는다

---

## 5. 데이터 모델 추가분

### 5.1 기준 계보 (`criteria.lineage_id`) — 왜 필요한가

현재 `criteria`는 `scorecard_version_id`에 매달려 있다.
즉 **v1의 "Kubernetes 운영 경험"과 v2의 같은 기준은 서로 아무 관계 없는 두 행이다.**

이 상태에서는 "이 기준이 회차를 거치며 어떻게 변했고 나아졌는가"를 물어볼 방법이 없고,
버전 간 비교도 불가능하다.

```sql
alter table public.criteria
  add column lineage_id uuid,
  add column lineage_origin text
    check (lineage_origin in ('ORIGINAL','REVISED_FROM','SPLIT_FROM','MERGED_FROM')),
  add column parent_lineage_ids uuid[] not null default '{}';
-- 기존 행 백필: 각 criterion에 새 uuid, lineage_origin='ORIGINAL'
-- 백필 후 lineage_id를 not null로
```

**결과 데이터가 쌓이기 전에 넣어야 한다.** 나중에 소급하면 어느 v2 기준이 어느 v1 기준의
후손인지 사람이 추측해서 채워야 하고, 그 추측 위의 통계는 전부 오염된다.

진단 쿼리는 `criterion_id`가 아니라 **`lineage_id`로 묶는다.**

### 5.2 면접 결과 계측

> 구현 기준: 아래 초기 스케치는 현재 데이터 모델로 대체되었다.
> 최종 판단은 기존 `human_reviews`에 남고, 기준별 관찰은
> `interview_observation_sessions`와 `interview_observations`에 저장한다.
> 정확한 계약은 `docs/04_DATA_MODEL.md`와
> `20260827000200_interview_observation_capture.sql`을 따른다.

```sql
create type public.interview_criterion_verdict as enum (
  'MATCHED',    -- 지원서 내용대로였음
  'WEAKER',     -- 지원서보다 약했음
  'STRONGER',   -- 지원서보다 나았음 (기준이 과하다는 신호)
  'NOT_ASKED'   -- 면접에서 묻지 않음
);

create type public.interview_weakness_type as enum (
  'FALSE_CLAIM',         -- 지원서 내용이 사실과 달랐음
  'LEVEL_INSUFFICIENT',  -- 사실이지만 필요한 수준·범위가 아니었음
  'AI_MISREAD'           -- 지원서 표현이 모호해 시스템이 다르게 읽음
);

create type public.interview_observation_source as enum ('FORM', 'FREE_TEXT', 'TRANSCRIPT');

-- 지원자당 1행
create table public.interview_outcomes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete restrict,
  scorecard_version_id uuid not null references public.scorecard_versions (id) on delete restrict,
  reviewer_id uuid not null references public.profiles (id) on delete restrict,
  decision text not null check (decision in ('HIRE','HOLD','REJECT')),
  reason text not null check (length(trim(reason)) between 1 and 2000),
  off_criteria_reason text check (off_criteria_reason is null or length(off_criteria_reason) <= 2000),
  supersedes_outcome_id uuid unique references public.interview_outcomes (id),
  created_at timestamptz not null default now()
);

-- 기준당 1행
create table public.interview_observations (
  id uuid primary key default gen_random_uuid(),
  interview_outcome_id uuid not null references public.interview_outcomes (id) on delete restrict,
  application_id uuid not null references public.applications (id) on delete restrict,
  criterion_id uuid not null references public.criteria (id) on delete restrict,
  criterion_lineage_id uuid not null,
  verdict public.interview_criterion_verdict not null,
  weakness_type public.interview_weakness_type,
  note text check (note is null or length(note) <= 1000),
  source public.interview_observation_source not null default 'FORM',
  ai_draft_accepted boolean,
  confirmed_at timestamptz,
  observer_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (interview_outcome_id, criterion_id),
  check ((verdict = 'WEAKER') = (weakness_type is not null)),
  check (source = 'FORM' or ai_draft_accepted is not null)
);
```

**설계 결정과 근거**

- **관찰(`observations`)과 결정(`outcomes`)을 분리한다.** AI 근거와 사람 결정을 분리한 것과 같은 층위다.
  면접관 여러 명이 각자 다른 기준을 관찰할 수 있는 구조로도 확장된다.
- **`off_criteria_reason`은 반드시 넣는다.** 이 칸이 없으면 기준 목록 **바깥**의 이유
  (리더 머릿속엔 있는데 문서엔 없는 기준)를 영원히 못 잡는다.
  그런데 우리가 붙잡기로 한 리더 인용이 정확히 그것이다.
- **`confirmed_at`이 STT 게이트다.** AI가 뽑은 관찰은 `confirmed_at = null`로 저장되고,
  사람이 확인해야 집계에 들어간다. 미확인 행은 진단 쿼리에서 제외된다.
- `unique (interview_outcome_id, criterion_id)`로 한 결정 안에서 기준 중복을 막는다.

### 5.3 RPC

```sql
public.record_interview_outcome(
  target_application_id uuid,
  target_scorecard_version_id uuid,
  new_decision text,
  new_reason text,
  observations jsonb,            -- [{criterion_id, verdict, weakness_type, note}]
  off_criteria_reason_value text default null
) returns uuid
```

검증 요구사항 (`persist_validated_evidence` 패턴 그대로):

- 배정된 `HIRING_MANAGER`(해당 Job) 또는 `ADMIN`만 실행 가능
- 해당 application의 `workflow_state`가 `INTERVIEW_SELECTED`여야 함
- `scorecard_version_id`가 그 Job의 승인된 버전이어야 함 (`APPROVED` 또는 `SUPERSEDED`)
- **승인된 기준 전부가 정확히 한 번씩** observations에 나와야 함
- 각 observation 객체의 키 개수 검사 (알 수 없는 키 거부)
- `verdict='WEAKER'`면 `weakness_type` 필수, 아니면 null이어야 함
- `criterion_lineage_id`는 서버가 `criteria`에서 조회해 채운다 (클라이언트 입력 금지)
- 성공 시 `workflow_state = 'INTERVIEW_COMPLETED'`
- `append_safe_audit('INTERVIEW_OUTCOME_RECORDED', ...)` —
  **payload에 note/off_criteria_reason 원문을 넣지 않는다** (개수와 verdict 분포만)

---

## 6. 티켓

### FW-PRE · 파이프라인 완주 검증 `~4h`

2.4장 참조. `.env.local` 구성 → `pnpm db:link` → `test:integration` →
20건 배치 업로드 → 근거 추출 완료 확인.

### FW-0 · 개정 경로 복원 + 기준 계보 `~3h`

- `docs/10_DECISIONS.md`의 **ADR-035**와 **ADR-036**으로 결정 기록
  - Status: Accepted / Supersedes: 단일 승인 버전 잠금 결정
  - Context: 면접 결과가 기준의 오류를 드러내는데 개정 경로가 없어 학습이 불가능
  - Decision: 승인된 버전은 여전히 불변. 다만 **면접 근거에 기반한 새 draft 버전 생성**을 허용.
    승인은 사람만. 자동 적용 경로는 존재하지 않는다.
- `supabase/migrations/20260827000100_restore_framework_revision_with_lineage.sql`
  - `create_scorecard_revision` 복원 — 원본은
    `20260824000100_scorecard_approval_versioning.sql`에 있다
  - `criteria.lineage_id` / `lineage_origin` / `parent_lineage_ids` 추가 + 백필
  - 개정 시 lineage 상속
  - 활성 `APPROVED`는 Job당 최대 1개 유지, 이전 것은 `SUPERSEDED`
- `supabase/tests/database/022_framework_revision.sql`
  - 승인된 버전이 여전히 수정 불가한가
  - 개정 draft가 lineage를 상속하는가
  - 비인가 역할이 개정을 만들 수 없는가

### FW-1 · 면접 결과 계측 `~7h` — 없으면 나머지 전부 불가

- `20260827000200_interview_outcome_capture.sql` (5장 전체)
- `workflow_state`에 `INTERVIEW_COMPLETED` 추가
- `packages/domain/src/interview.ts` — zod 스키마
  (`packages/domain/src/evidence.ts` 스타일: `boundedText`, `.strict()`, 명시적 enum)
- `packages/database/src/interviews.ts` — 타입드 조회 함수
- `apps/web/src/app/applications/[applicationId]/interview-outcome-form.tsx`
- `supabase/tests/database/023_interview_outcome.sql`
  - 기준 하나 누락 시 거부
  - `WEAKER`인데 `weakness_type` 없으면 거부
  - 미배정 사용자 거부, Recruiter 거부
  - update/delete 불가
  - service_role로 실행 불가

### FW-2 · 진단 `~4h`

- `20260827000300_criterion_calibration.sql`
  - **순수 SQL. LLM 호출 없음.**
  - `public.criterion_calibration_summary(target_job_id uuid)` 함수 또는 보안 뷰

```sql
-- 진단 로직 핵심
select
  c.lineage_id,
  c.name,
  count(*) filter (where e.status = 'SUPPORTED')                       as doc_supported,
  count(*) filter (where e.status = 'SUPPORTED'
                     and o.verdict = 'WEAKER'
                     and o.weakness_type = 'LEVEL_INSUFFICIENT')       as mismatched,
  count(*) filter (where o.weakness_type = 'FALSE_CLAIM')              as excluded_false_claim,
  count(*) filter (where o.weakness_type = 'AI_MISREAD')               as excluded_misread
from ...
where o.confirmed_at is not null      -- 미확인 AI 초안 제외
group by c.lineage_id, c.name
```

- **발화 조건: `mismatched >= 3 AND mismatched::numeric / doc_supported >= 0.4`**
- 미달이면 `OBSERVING` 상태로 반환 (숨기지 않는다)

**임계값 근거.** 200건 지원 → 서류 통과 8~10명 → 면접도 그만큼.
기준당 관찰 최대치가 10건 안팎이므로 10건을 기다리면 채용이 끝난다.
3건이면 우연으로 보기 어려우면서 채용 중간에 잡을 수 있다.
비율 조건을 같이 두는 이유는 미달 3건이라도 관찰이 3건이면 100%,
20건이면 15%로 완전히 다르기 때문이다.

**`FALSE_CLAIM` 제외가 이 로직의 핵심이다.**
지원자가 없는 경험을 지어낸 것은 우리 기준이 틀린 게 아니다.
이걸 같이 세면 **멀쩡한 기준을 엉뚱하게 조이게 되고**, 다음 회차에 진짜 자격 있는 사람이 걸러진다.
`AI_MISREAD`도 제외한다 — 그건 프롬프트/정의 명확성 문제로 따로 다룬다.
다만 **제외한 건수는 화면에 노출한다** (7.2 참조).

- `apps/web/src/app/jobs/_components/criterion-diagnosis-panel.tsx`
- `supabase/tests/database/024_criterion_calibration.sql`
  - `FALSE_CLAIM`만 3건이면 발화하지 않는가
  - `confirmed_at is null`인 행이 집계에서 빠지는가
  - 3건 미만이면 `OBSERVING`인가

### FW-3 · 개정 제안 → 승인 `~6h`

- `packages/ai/src/revision-prompt.ts` / `revision.ts` / `revision-adapter.ts`
  - `packages/ai/src/evidence-adapter.ts` 구조를 그대로 따른다:
    에러 코드 enum, `retryable`/`quarantined` getter, 토큰·비용 예산 가드,
    `store: false`, Structured Outputs(`text: { format: ... }`), usage 검증
  - `packages/ai/src/versions.ts`에 `REVISION_CONTRACT_VERSIONS` 추가
  - `packages/ai/fixtures/framework-revision.valid.json` + `eval:ai`에 포함
- **입력**: finding 통계 + 현재 criterion 정의 + 어긋난 건들의 `exact_quote` + 일치한 건의 `exact_quote`
- **출력 스키마 (strict)**:

```json
{
  "finding_lineage_id": "uuid",
  "change_type": "TIGHTEN_EVIDENCE | RETYPE_TO_INTERVIEW_ONLY | DEMOTE_TO_PREFERRED | ADD_EXCLUSION",
  "before": { "accepted_evidence": ["..."] },
  "after": { "accepted_evidence": ["..."], "excluded_evidence": ["..."] },
  "rationale": "..."
}
```

- **제약: 제안은 반드시 finding에 묶인다. finding 없는 제안은 생성 불가.**
  근거 추출의 "원문에 없는 인용은 저장 불가"와 같은 층위의 방어다.
- **검증**: 보호 속성 어휘 린터 통과 (학교·나이·성별·출신·가족·건강 관련 표현),
  기준 타입 규칙 준수 (`INTERVIEW_ONLY`는 `resume_assessable=false`)
- 승인은 기존 `approve_scorecard` RPC를 그대로 쓴다

**드라이런(적용 전 시뮬레이션)은 데모에서 뺀다.** 실제로 하려면 20건을 새 기준으로
AI 재호출해야 해서 1~2분 걸리고 비용도 든다. 승인 → 재분석 → FW-4 비교 화면 순서가
데모 흐름상 낫다. 향후 과제로 남긴다.

### FW-4 · 재분석 + before/after `~5h`

**스키마 변경이 거의 필요 없다.** 확인된 사실:

- `processing_runs.idempotency_key`가 `scorecard_version_id`를 포함해 해시되므로
  v2로 새 런을 만들면 자연히 별개 런이 된다
- `load_evidence_analysis_context`가 `APPROVED`와 `SUPERSEDED`를 모두 허용하므로
  파이프라인 수정 없이 v1/v2 근거가 공존한다

- 기존 `enqueue_resume_processing_run` 재사용
- `apps/web/src/app/jobs/_components/framework-comparison-panel.tsx`

**불변식: 재분석은 기존 `interview_progression_reviews` / `interview_outcomes`를
절대 변경하지 않는다.** AI 재실행이 사람의 과거 판단을 덮어쓰면 그 순간 이 제품은
"AI가 채용을 결정하는 시스템"이 된다. 새 근거는 새 런에 붙고, 사람은 원하면 새 판단을 **추가**한다.

### FW-5 · 공고 대조 `~3h` — 여유되면

v2 승인 시 공고문과 기준을 양방향 대조:

- 기준에 있는데 공고에 없음 → 그런 사람이 자기가 해당되는 줄 모르고 지원하지 않는다
- 공고에 있는데 기준에 없음 → 아무도 그걸로 평가하지 않는 장식 문장

**공고는 자동으로 고치지 않는다.** 게시 중인 공고는 이미 지원자가 있어 중간에 요건을 바꾸는 것이
민감하다. 진행 중 공고는 수정 여부를 묻고 지원자가 있으면 경고를 띄운다.
다음 공고를 만들 때 v2 기준으로 자동 초안이 나오게 하는 쪽이 실무적으로 자연스럽다.

### FW-STT · 면접 녹취 자동 계측 `~7h` — FW-1 이후 병렬 가능

**별도 시스템이 아니다. FW-1의 `source = 'TRANSCRIPT'`로 들어간다.**

- `20260827000400_interview_transcript.sql`
  - `interview_transcripts (id, application_id, utterances jsonb, uploaded_by, created_at)`
  - `utterances`: `[{ordinal, timestamp_ms, speaker, text, normalized_text, normalized_text_sha256}]`
- `packages/ai/src/transcript-evidence.ts`
  - `evidence-prompt.ts`와 **동일 구조**. `pages` 자리에 `utterances`,
    `page_number` 자리에 `ordinal`
  - 프롬프트 지시는 **"기준 N에 관련된 발언을 원문 그대로 인용하라"**만 한다
- **AI에게 "왜 탈락했는지 분석해달라"고 절대 요청하지 않는다.**
  그 순간 AI가 사람을 평가하는 것이 되어 제품 불변식과 충돌한다.
  negative prompt로 편향을 막을 수 있다고 가정하지 않는다. **구조로 막는다.**
- 인용 검증은 `persist_validated_evidence`와 동일하게
  `position(normalized_quote in utterance.normalized_text) = 0` 검사
- **결과는 `confirmed_at = null`로만 저장된다.** 면접관이 확인해야 집계에 들어간다.
  이것이 4.5장 "워커는 사람 결정을 쓰지 못한다"를 지키는 방법이다.
- 큐에 태우지 않고 **동기 서버 액션**으로 처리한다. 면접 녹취는 1건씩이고 즉시성이 필요 없어
  evidence 파이프라인의 lease/retry가 과하다. 실패하면 면접관이 직접 폼 입력하면 된다.

**알려진 리스크 (발표에서 먼저 언급할 것)**

- 면접 녹음은 **지원자 동의**가 필요하다. 데모는 합성 녹취로 하되, 이 전제를 명시한다.
- 면접 대화에는 나이·학교·가족이 자연스럽게 나온다. 이력서보다 마스킹이 훨씬 어렵다.
  기준과 무관한 발화는 애초에 추출 대상에서 제외하는 구조가 필요하다.

### 순서와 컷 라인

```
FW-PRE → FW-0 → FW-1 → FW-2 → FW-3 → FW-4      (여기까지가 플라이휠)
                        └─ FW-STT (FW-1 이후 병렬)
                                        FW-5 (여유되면)
```

- **FW-2까지만 있어도** "기준이 틀렸다는 걸 데이터로 안다"는 주장은 성립한다.
- 시간이 모자라면 **FW-3의 AI 제안을 빼고 사람이 직접 문구를 고치는 화면만** 남겨도 데모가 된다.
- **절대 자르지 않는다: FW-0, FW-1, FW-2.** 이 셋이 없으면 플라이휠이 아니라 그냥 ATS다.

---

## 7. UI

`docs/13_UI_UX_GUIDE.md`를 먼저 읽는다. 아래는 그 위에 얹는 화면 명세다.

### 7.1 화면 A — 면접 결과 기록

`applications/[applicationId]/interview-outcome-form.tsx`
기존 페이지 하단, `workflow_state = INTERVIEW_SELECTED`일 때만. 배정된 채용 책임자.

```
┌ 필수 ─ Kubernetes 운영 경험 ──────────────────┐
│ 지원서 근거                                    │
│ "Kubernetes로 개인 프로젝트를 배포했습니다"       │
│                          원문 2페이지 보기 →     │
│                                              │
│ 면접에서 확인한 결과                             │
│  ( ) 지원서 내용대로였음                         │
│  (•) 지원서보다 약했음                          │
│  ( ) 지원서보다 나았음                          │
│  ( ) 면접에서 묻지 않음                         │
│                                              │
│  └ 어떤 점이 달랐습니까?                         │
│    ( ) 지원서 내용이 사실과 달랐음                 │
│    (•) 사실이지만 필요한 수준·범위가 아니었음        │
│    ( ) 지원서 표현이 모호해 다르게 읽힘             │
│    [                                      ]  │
│                                              │
│ ⚠ 지원서 판정은 '직접 근거'였습니다 — 어긋납니다   │
└──────────────────────────────────────────────┘

평가 기준에 없는 이유로 판단이 갈렸다면 (선택)
[                                             ]

최종 결정   ( ) 진행  ( ) 보류  (•) 미진행
사유 (필수) [                                 ]

4개 기준 중 4개 응답 완료          [ 면접 결과 저장 ]
```

**설계 결정 두 개.**

1. **지원서 판정 라벨은 선택 후에 공개한다.** 인용문은 미리 보여준다(면접관이 뭘 물었는지
   상기해야 하므로). 하지만 "직접 근거"라는 판정 라벨을 먼저 보면 면접관이 거기 동조한다(앵커링).
   선택 후 어긋남 경고로 뜨는 것이 앵커링을 막으면서 그 자리에서
   "기준이 이상하네"를 깨닫게 한다.
2. **진행률 표시가 필수다.** RPC가 승인된 기준 전부를 요구하므로 하나라도 빠지면 저장이 거부된다.
   몇 개 남았는지 안 보이면 사용자는 왜 막히는지 모른다.

### 7.2 화면 B — 기준 진단

`jobs/_components/criterion-diagnosis-panel.tsx` · 평가 기준 탭 상단 · 채용 책임자 / Admin

```
┌ ⚠ 검토 필요 ─ Kubernetes 운영 경험 ── 필수 ────┐
│ '직접 근거'로 통과한 5명 중 4명이 면접에서        │
│ 수준 미달로 확인되었습니다.                       │
│                                               │
│ 어긋난 4명의 통과 근거                           │
│   "Kubernetes로 개인 프로젝트를 배포했습니다"      │
│   "K8s 튜토리얼을 따라 클러스터를 구성해봤습니다"    │
│   "쿠버네티스 학습 후 사이드 프로젝트에 적용"        │
│                                               │
│ 일치한 1명의 통과 근거                           │
│   "EKS 클러스터 3개를 운영하며 장애 대응을 담당"    │
│                                               │
│ 현재 통과 조건                                  │
│   · Kubernetes 사용 경험이 기재됨                │
│                                               │
│ 집계 제외 1건 — 지원서 내용이 사실과 달랐던 경우    │
│                                               │
│ [ AI 개정안 요청 ] [ 직접 수정 ] [ 조치 안 함 ]   │
└───────────────────────────────────────────────┘

┌ 관측 중 ─ 대용량 트래픽 처리 ── 우대 ───────────┐
│ 면접 관찰 2건 · 진단에는 3건이 필요합니다          │
└───────────────────────────────────────────────┘
```

- **"집계 제외 N건"을 반드시 노출한다.** 지원자가 사실과 다르게 쓴 것을 기준 탓으로 돌리지
  않는다는 걸 보여주는 자리다. "지원자가 거짓을 말하면 어떻게 하나"라는 질문에 대한 답이
  화면에 이미 있는 셈이다.
- **관측 중 카드도 반드시 보여준다.** UI 가이드가 "모든 예외는 정상 워크플로 안에 남는다"를
  요구한다. 임계 미달을 숨기면 사용자는 시스템이 안 도는 줄 안다.
- **"조치 안 함"도 기록한다.** 리더가 "진단은 맞지만 이 기준은 유지한다"고 판단한 것도
  조직의 판단이다.

### 7.3 화면 C — 개정안 검토

`jobs/_components/framework-revision-form.tsx` · B에서 펼쳐짐

```
AI 개정안                        지원서 평가 기준 v1 → v2 (초안)

통과 조건
  − Kubernetes 사용 경험이 기재됨
  + 운영 환경 클러스터의 책임 범위가 명시됨
  + 장애 대응 또는 배포 사고 사례가 기재됨

제외 조건 (신규)
  + 개인 프로젝트·학습용 배포만 기재된 경우

근거  어긋난 4건의 통과 근거가 모두 개인 프로젝트 수준이었고,
      일치한 1건만 운영 책임 범위를 명시했습니다.

[ 이대로 승인 ] [ 수정 후 승인 ] [ 기각 ]
```

UI 가이드가 AI 산출물과 사람 입력의 시각적 분리를 요구하므로 `AI 개정안` 라벨을 블록에 명시한다.

### 7.4 화면 D — v1 / v2 비교

`jobs/_components/framework-comparison-panel.tsx` · 재분석 완료 후

```
평가 기준 v1                    평가 기준 v2
지원자 20명 · 직접 근거 8명       지원자 20명 · 직접 근거 6명

지원자        v1              v2
후보 A       직접 근거   →   부분 근거    ⚠ 변경
후보 B       직접 근거   →   부분 근거    ⚠ 변경
후보 C       직접 근거   →   부분 근거    ⚠ 변경
후보 D       직접 근거   →   부분 근거    ⚠ 변경
후보 M       근거 미발견 →   직접 근거    ⚠ 변경

v1 통과 후 면접에서 미달로 확인된 4명이
v2에서는 지원서 단계에서 '부분 근거'로 표시됩니다.
```

가이드가 총점·순위를 금지하므로 **개수와 상태 변화만** 쓴다.

### 7.5 새 CSS 클래스

`globals.css`에 추가. 기존 클래스를 최대한 재사용한다.

```
.interview-verdict-card        A의 기준 카드 (criterion-evidence-card 변형)
.interview-verdict.verdict-*   verdict별 상태 (evidence-status evidence-* 패턴)
.verdict-mismatch              어긋남 경고 (form-alert-warning 변형)
.diagnosis-card                B의 진단 카드
.diagnosis-observing           관측 중 상태
.framework-diff                C의 −/+ 디프
.comparison-row                D의 v1→v2 행
```

### 7.6 Playwright 커버리지 (가이드 10절 요구)

- 기준 하나를 비워두면 저장이 막히고 오류 요약으로 포커스가 이동한다
- 미진행 결정에 사유가 없으면 저장이 거부된다
- 배정되지 않은 사용자는 면접 결과 폼에 접근할 수 없다
- 관측 3건 미만이면 진단 카드가 아니라 관측 중 카드가 뜬다
- STT로 채워진 관찰이 확인 전에는 진단 집계에 들어가지 않는다

---

## 8. 데모 시드 — 실행 조건

**플라이휠은 과거가 있어야 돈다.** 합성 이력서 20건만 넣으면 면접 기록이 0이라
FW-2가 아무것도 띄우지 않고 데모가 죽는다.

`supabase/seed.sql`에 다음이 결정론적으로 들어가야 한다.

- 기준 v1에 **의도적으로 느슨한 항목** 하나
  (`accepted_evidence`에 "Kubernetes 사용 경험이 기재됨" 수준의 문구)
- 이력서 20건 중 5건이 그 조건으로 `SUPPORTED`
  (인용문이 "개인 프로젝트 배포", "튜토리얼 따라 구성" 류)
- 그중 1건은 진짜 운영 경험 ("EKS 클러스터 3개 운영, 장애 대응 담당")
- `interview_outcomes` 5건, `interview_observations`에서
  4건이 `WEAKER` + `LEVEL_INSUFFICIENT`, 1건이 `MATCHED`
- 별도로 `FALSE_CLAIM` 1건을 심어 "집계 제외" 표시를 시연
- → `mismatched = 4 >= 3`, `4/5 = 0.8 >= 0.4` 이므로 진단이 발화

**FW-1이 끝나자마자 이걸 넣어야** FW-2를 개발하면서 바로 확인할 수 있다.

`TASKS.md`의 "데모 리셋과 결정론적 시드"가 아직 미완이므로 이 작업과 합쳐서 처리한다.

### 3분 데모 순서

1. 대시보드 — v1로 20건 분석 완료 (15초)
2. 기준 진단 — 시그널 발화, 숫자를 클릭하면 실제 인용과 면접 관찰이 나란히 (35초)
3. 개정안 검토 — before/after 디프, 리더가 수정 후 승인 → v2 (40초)
4. 재분석 → v1/v2 비교 화면 (40초)
5. 마무리 — **"이 회사는 두 번째 채용부터 이 실수를 안 합니다."** (20초)

경영진의 "매번 처음부터 다시 합니다"에 대한 정확한 반대말이다.

---

## 9. 검증

작업 후 반드시 실행한다. `AGENTS.md`의 "Do not claim tests passed unless they were actually run."을 지킨다.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm privacy:scan
pnpm build
pnpm eval:ai            # 프롬프트/스키마 변경 시 필수
pnpm test:integration   # .env.local 필요
pnpm test:e2e           # .env.local + DEMO_TEST_PASSWORD 필요
```

`pnpm`이 없으면 `corepack pnpm ...`으로 실행한다. 단 `typecheck`는 내부에서
`pnpm -r`을 재호출하므로 PATH에 `pnpm`이 있어야 한다
(`sudo corepack enable` 또는 `~/.local/bin`에 shim).

---

## 10. 하지 말 것

- ❌ **AI가 기준을 자동으로 개정하게 하지 않는다.** 모든 개정은 사람 승인을 거친다.
  자동 적용 경로는 코드에 존재해서는 안 된다.
- ❌ **AI에게 "왜 탈락했는지" 묻지 않는다.** AI는 기준별 발언을 인용할 뿐이다.
- ❌ **탈락자만 기록하지 않는다.** 면접 본 사람 전원이다.
  통과한 사람의 근거 문장이 없으면 "그럼 뭐라고 고쳐야 하나"가 나오지 않는다.
- ❌ **`FALSE_CLAIM`을 기준 교정 집계에 포함하지 않는다.** 멀쩡한 기준을 엉뚱하게 조이게 된다.
- ❌ **재분석이 기존 사람 판단을 변경하지 않는다.**
- ❌ **총점, 순위, 자동 필터, 합격 추천을 만들지 않는다.** (`AGENTS.md` 불변식)
- ❌ **보호 속성(나이·성별·학벌·출신·가족·건강)을 추론하거나 기준 후보로 제안하지 않는다.**
  암묵 기준 후보가 보호 속성과 상관되면 제안 대신 경고를 낸다.
- ❌ **감사 로그에 이력서 원문, 면접 노트 원문, 개인정보를 넣지 않는다.**
- ❌ **`.env.local`, 실제 이력서, API 키를 커밋하지 않는다.**

---

## 부록 A — 확인된 코드 사실 (2026-08-26 실측)

계획이 의존하는 사실들. 재확인이 필요하면 이 위치를 본다.

| 사실                        | 위치                                                                             |
| --------------------------- | -------------------------------------------------------------------------------- |
| 현재 흐름의 마지막 지점     | `record_interview_progression()` — `20260824002300_human_interview_gate.sql:112` |
| 워커는 사람 결정을 못 쓴다  | `20260824002200_evidence_backend_slice.sql:219`                                  |
| 개정 RPC가 삭제됨           | `20260825000800_remove_review_framework_revision.sql`                            |
| 인용 원문 검증 로직         | `persist_validated_evidence` — `20260824002200:180-182`                          |
| idempotency_key에 버전 포함 | `set_evidence_processing_identity()` — `20260824002200:29`                       |
| `SUPERSEDED`도 분석 허용    | `load_evidence_analysis_context` — `20260824002200:128`                          |
| 데모 비밀번호               | `supabase/seed.sql:27` (`DemoPass123!`)                                          |
| AI 어댑터 표준 구조         | `packages/ai/src/evidence-adapter.ts`                                            |
| UI 클래스/라벨 패턴         | `apps/web/src/app/applications/[applicationId]/application-evidence-panel.tsx`   |
| criteria 테이블 정의        | `20260823000400_scorecard_contract.sql:46`                                       |
| evidence_items 테이블 정의  | `20260824002200_evidence_backend_slice.sql:53`                                   |
