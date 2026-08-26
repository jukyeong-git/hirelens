"""Replace the Alpha demo data with the Korean calibration walkthrough.

Emits one transactional SQL script: it clears every existing job and its
dependents, then installs a single Korean posting, a deliberately loose review
framework, twenty applicants with validated evidence, and the interview
outcomes that push criterion 1 over the diagnosis threshold.

Evidence is written directly rather than through the pipeline, so this costs no
model tokens. The rows still satisfy the same database constraints the worker
must satisfy: every quote is a normalised substring of its page and both hashes
are recomputed here exactly as `persist_validated_evidence` recomputes them.

Deleting hiring history means disabling the append-only guards for the length of
the transaction. That is safe for a synthetic demo database and follows the
precedent set by the lineage backfill in 20260827000100, but it is the reason
this lives in a script rather than a migration: it must never run anywhere real.

  python3 scripts/generate-korean-demo-resumes.py   # fixtures first
  python3 scripts/install-korean-demo.py            # writes /tmp/korean-demo.sql
"""

from __future__ import annotations

import hashlib
import importlib.util
import re
import sys
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests" / "fixtures" / "korean-demo-resumes"
OUT = Path("/tmp/korean-demo.sql")

RECRUITER = "00000000-0000-0000-0000-000000000002"
HIRING_MANAGER = "00000000-0000-0000-0000-000000000003"

JOB = "11000000-0000-0000-0000-000000000001"
FRAMEWORK = "21000000-0000-0000-0000-000000000001"
POSTING = "31000000-0000-0000-0000-000000000001"

# The internal description is parsed back into four sections by
# `parseJobDescriptionSections`, so the headings are part of the contract.
RAW_JOB_DESCRIPTION = "\n\n".join(
    [
        "역할 개요\n"
        "사내 AI 역량진단 서비스의 백엔드를 개발하고 운영합니다. "
        "고객사 트래픽이 빠르게 늘고 있어, 안정적으로 굴러가는 서비스를 함께 만들 분을 찾습니다.",
        "주요 책임\n"
        "· AI 역량진단 서비스의 백엔드 API 개발과 운영\n"
        "· 배포 파이프라인 개선과 장애 대응\n"
        "· 고객사 트래픽 증가에 대응하는 성능 개선",
        # The two vague lines are deliberate: they are what the hiring manager
        # actually wrote, and the ambiguity review has to catch them.
        "자격 요건\n"
        "· 백엔드 개발 경력 3년 이상\n"
        "· Kubernetes 운영 경험이 있는 분\n"
        "· 커뮤니케이션이 좋은 분\n"
        "· 새로운 기술에 열정적인 분",
        "우대 사항\n"
        "· 대용량 트래픽 처리 경험\n"
        "· 장애 대응 및 온콜 경험",
    ]
)

PUBLIC_SUMMARY = (
    "사내 AI 역량진단 서비스의 백엔드를 개발하고 운영할 엔지니어를 찾습니다. "
    "고객사 트래픽이 빠르게 늘고 있어, 안정적으로 굴러가는 서비스를 함께 만들 분이면 좋겠습니다."
)
PUBLIC_RESPONSIBILITIES = (
    "· AI 역량진단 서비스의 백엔드 API 개발과 운영\n"
    "· 배포 파이프라인 개선과 장애 대응\n"
    "· 고객사 트래픽 증가에 대응하는 성능 개선"
)
PUBLIC_REQUIREMENTS = (
    "· 백엔드 개발 경력 3년 이상\n"
    "· Kubernetes 운영 경험\n"
    "· 커뮤니케이션이 좋은 분\n"
    "· 새로운 기술에 열정적인 분"
)
PUBLIC_PREFERRED = "· 대용량 트래픽 처리 경험\n· 장애 대응 및 온콜 경험"

# Criterion 1 ships loose on purpose. Four applicants clear it on hobby-level
# evidence and only one describes operational ownership; recording those
# interviews is what makes the diagnosis fire.
CRITERIA = [
    {
        "key": "k8s_operations",
        "client_id": "ko-criterion-1",
        "name": "운영 환경 Kubernetes 경험",
        "type": "REQUIRED",
        "definition": "Kubernetes 기반 서비스를 운영한 경험",
        "accepted": ["Kubernetes 사용 경험이 기재됨"],
        "assessable": True,
        "question": "직접 운영한 클러스터의 규모와 최근 장애 대응 사례를 설명해 주세요.",
    },
    {
        "key": "production_backend",
        "client_id": "ko-criterion-2",
        "name": "운영 서비스 백엔드 개발",
        "type": "REQUIRED",
        "definition": "운영 중인 서비스의 백엔드를 개발하고 책임진 경험",
        "accepted": ["운영 서비스의 개발 또는 운영 책임 범위가 기재됨"],
        "assessable": True,
        "question": "담당하신 서비스에서 어디까지 책임지셨는지 설명해 주세요.",
    },
    {
        "key": "high_traffic",
        "client_id": "ko-criterion-3",
        "name": "대용량 트래픽 처리",
        "type": "PREFERRED",
        "definition": "대용량 트래픽을 다룬 경험",
        "accepted": ["구체적인 처리량 또는 지연 예산이 기재됨"],
        "assessable": True,
        "question": "가장 큰 트래픽을 다뤘던 사례와 병목 해결 과정을 설명해 주세요.",
    },
    {
        "key": "communication",
        "client_id": "ko-criterion-4",
        "name": "커뮤니케이션",
        "type": "INTERVIEW_ONLY",
        "definition": "이력서만으로 일관되게 검증하기 어려워 면접에서 확인합니다.",
        "accepted": [],
        "assessable": False,
        "question": "복잡한 장애나 설계 결정을 팀에 설명했던 상황을 말씀해 주세요.",
    },
]

AMBIGUOUS_PHRASES = [
    {
        "source_phrase": "커뮤니케이션이 좋은 분",
        "ambiguity_note": "이력서만으로 일관되게 검증하기 어려운 표현입니다.",
        "ambiguity_status": "HUMAN_ONLY",
        "suggested_interview_question": "복잡한 장애나 설계 결정을 팀에 설명했던 상황을 말씀해 주세요.",
    },
    {
        "source_phrase": "새로운 기술에 열정적인 분",
        "ambiguity_note": "어떤 평가 기준으로도 확인할 수 없어 공고에서만 남는 문장입니다.",
        "ambiguity_status": "HUMAN_ONLY",
        "suggested_interview_question": "최근 직접 학습해 업무에 적용한 기술을 설명해 주세요.",
    },
]


def q(value: str | None) -> str:
    if value is None:
        return "null"
    return "'" + value.replace("'", "''") + "'"


def json_array(values: list[str]) -> str:
    items = ", ".join('"' + v.replace('"', '\\"') + '"' for v in values)
    return q(f"[{items}]") + "::jsonb"


def normalize(value: str) -> str:
    """Mirror of the SQL normalisation used when validating evidence quotes."""
    return re.sub(r"\s+", " ", value.strip())


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def uuid_at(prefix: str, index: int) -> str:
    return f"{prefix}-0000-0000-0000-{index:012d}"


def load_pool() -> list[dict]:
    spec = importlib.util.spec_from_file_location(
        "ko_gen", ROOT / "scripts" / "generate-korean-demo-resumes.py"
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module.build_pool()


def page_text(path: Path) -> str:
    return "\n".join((page.extract_text() or "") for page in PdfReader(path).pages)


def evidence_rows(item: dict, text: str) -> list[tuple[str, str, str | None]]:
    """(criterion key, status, quote) for one applicant, one row per criterion."""
    expected = item["expected"]
    rows: list[tuple[str, str, str | None]] = []
    for criterion in CRITERIA:
        key = criterion["key"]
        if key == "communication":
            rows.append((key, "HUMAN_ONLY", None))
            continue
        status = expected.get(key, "NOT_FOUND")
        quote: str | None = None
        if status in {"SUPPORTED", "PARTIAL", "CONTRADICTED"}:
            if key == "k8s_operations":
                quote = item["required_source_phrase"]
            else:
                quote = next(
                    (
                        line
                        for line in item["experience"]
                        if normalize(line) in normalize(text)
                        and (key != "high_traffic" or any(ch.isdigit() for ch in line))
                    ),
                    item["experience"][0],
                )
            if quote is None or normalize(quote) not in normalize(text):
                status, quote = "NOT_FOUND", None
        rows.append((key, status, quote))
    return rows


def main() -> None:
    if not FIXTURES.exists():
        sys.exit("먼저 generate-korean-demo-resumes.py 를 실행하세요.")
    pool = load_pool()
    sql: list[str] = []
    add = sql.append

    add("begin;")
    add("")
    add("-- Hiring history is append-only by design. Disabling the guards is")
    add("-- acceptable only because this database holds synthetic demo rows.")
    for table in (
        "human_reviews",
        "interview_observations",
        "interview_observation_sessions",
        "interview_progression_reviews",
        "review_note_versions",
        "job_posting_status_history",
        "scorecard_versions",
        "criteria",
        "job_postings",
    ):
        add(f"alter table public.{table} disable trigger user;")
    add("")
    add("-- Clear every existing job and its dependents, children first.")
    for statement in (
        "delete from public.evidence_items",
        "delete from public.resume_pages",
        "delete from public.interview_observations",
        "delete from public.human_reviews",
        "delete from public.interview_observation_sessions",
        "delete from public.interview_progression_reviews",
        "delete from public.review_note_versions",
        "delete from public.review_notes",
        "delete from public.review_assignments",
        "delete from public.notifications",
        "delete from public.processing_runs",
        "delete from public.resume_files",
        "delete from public.applications",
        "delete from public.candidates",
        "delete from public.job_posting_status_history",
        "delete from public.job_postings",
        "delete from public.criteria",
        "delete from public.scorecard_versions",
        "delete from public.jobs",
    ):
        add(f"{statement};")
    add("")

    add("-- One Korean posting, written the way a busy hiring manager writes it.")
    add(
        "insert into public.jobs (id, title, department, hiring_need, raw_job_description, "
        "status, recruiter_id, hiring_manager_id, is_synthetic_demo) values ("
        f"{q(JOB)}, {q('백엔드 엔지니어')}, {q('개발본부')}, "
        f"{q('AI 역량진단 서비스 백엔드 증원')}, {q(RAW_JOB_DESCRIPTION)}, "
        f"'DRAFT', {q(RECRUITER)}, {q(HIRING_MANAGER)}, true);"
    )
    add("")

    phrases = (
        "["
        + ", ".join(
            "{"
            + ", ".join(
                f'"{k}": "{v}"' for k, v in phrase.items()
            )
            + "}"
            for phrase in AMBIGUOUS_PHRASES
        )
        + "]"
    )
    add(
        "insert into public.scorecard_versions (id, job_id, version_number, status, "
        "source_job_description_hash, prompt_version, schema_version, model_id, "
        "ambiguous_phrases, created_by) values ("
        f"{q(FRAMEWORK)}, {q(JOB)}, 1, 'DRAFT', {q(sha256(RAW_JOB_DESCRIPTION))}, "
        f"{q('ko-demo-framework-v1')}, {q('review-framework-v1')}, {q('HUMAN_AUTHORED')}, "
        f"{q(phrases)}::jsonb, {q(HIRING_MANAGER)});"
    )
    add("")

    for order, criterion in enumerate(CRITERIA):
        add(
            "insert into public.criteria (scorecard_version_id, client_id, name, type, "
            "definition, accepted_evidence, alternative_evidence, resume_assessable, "
            "evidence_fields, ambiguity_status, suggested_interview_question, display_order) values ("
            f"{q(FRAMEWORK)}, {q(criterion['client_id'])}, {q(criterion['name'])}, "
            f"{q(criterion['type'])}, {q(criterion['definition'])}, "
            f"{json_array(criterion['accepted'])}, '[]'::jsonb, "
            f"{'true' if criterion['assessable'] else 'false'}, '[]'::jsonb, "
            f"{q('HUMAN_ONLY' if not criterion['assessable'] else 'CLEAR')}, "
            f"{q(criterion['question'])}, {order});"
        )
    add("")
    add("-- Approve only now: criteria cannot be added under an approved version.")
    add(
        "update public.scorecard_versions set status = 'APPROVED', "
        f"approved_by = {q(HIRING_MANAGER)}, approved_at = now() where id = {q(FRAMEWORK)};"
    )
    add(f"update public.jobs set status = 'READY_FOR_INTAKE' where id = {q(JOB)};")
    add("")

    add(
        "insert into public.job_postings (id, job_id, status, public_slug, public_title, "
        "public_location, public_employment_type, public_summary, public_responsibilities, "
        "public_requirements, public_preferred_qualifications, created_by, published_by, "
        "published_at) values ("
        f"{q(POSTING)}, {q(JOB)}, 'PUBLISHED', {q(sha256(JOB)[:32])}, "
        f"{q('백엔드 엔지니어')}, {q('서울')}, {q('정규직')}, {q(PUBLIC_SUMMARY)}, "
        f"{q(PUBLIC_RESPONSIBILITIES)}, {q(PUBLIC_REQUIREMENTS)}, {q(PUBLIC_PREFERRED)}, "
        f"{q(RECRUITER)}, {q(RECRUITER)}, now());"
    )
    add("")

    criterion_id = (
        "(select id from public.criteria where scorecard_version_id = "
        f"{q(FRAMEWORK)} and client_id = %s)"
    )

    for index, item in enumerate(pool, start=1):
        path = FIXTURES / f"ko-resume-{index:02d}.pdf"
        text = page_text(path)
        normalized = normalize(text)
        page_hash = sha256(normalized)

        candidate = uuid_at("41000000", index)
        application = uuid_at("51000000", index)
        resume = uuid_at("61000000", index)
        run = uuid_at("71000000", index)
        page_id = uuid_at("81000000", index)
        interviewed = index <= 5
        recorded = index <= 4

        state = (
            "INTERVIEW_COMPLETED" if recorded else "INTERVIEW_SELECTED" if interviewed else "NEW"
        )
        add(
            "insert into public.candidates (id, demo_label) values "
            f"({q(candidate)}, {q(item['label'])});"
        )
        add(
            "insert into public.applications (id, candidate_id, job_id, source, workflow_state) "
            f"values ({q(application)}, {q(candidate)}, {q(JOB)}, 'DEMO_SEED', {q(state)});"
        )
        add(
            "insert into public.resume_files (id, application_id, storage_path, original_filename, "
            "mime_type, byte_size, sha256, intake_status) values ("
            f"{q(resume)}, {q(application)}, {q(f'ko-demo/{resume}.pdf')}, "
            f"{q(f'ko-resume-{index:02d}.pdf')}, 'application/pdf', {path.stat().st_size}, "
            f"{q(sha256(path.read_bytes().hex()))}, 'UPLOADED');"
        )
        add(
            "insert into public.processing_runs (id, application_id, resume_file_id, "
            "scorecard_version_id, pipeline_version, prompt_version, schema_version, model_id, "
            "status, attempt_count, completed_at) values ("
            f"{q(run)}, {q(application)}, {q(resume)}, {q(FRAMEWORK)}, "
            f"{q('evidence-pipeline-v1')}, {q('evidence-extraction-prompt-v3')}, "
            f"{q('evidence-extraction-schema-v2')}, {q('ko-demo-fixture')}, "
            "'COMPLETED', 1, now());"
        )
        add(
            "insert into public.resume_pages (id, resume_file_id, processing_run_id, page_number, "
            "raw_text, normalized_text, raw_text_sha256, normalized_text_sha256) values ("
            f"{q(page_id)}, {q(resume)}, {q(run)}, 1, {q(text)}, {q(normalized)}, "
            f"{q(sha256(text))}, {q(page_hash)});"
        )

        for key, status, quote in evidence_rows(item, text):
            client_id = next(c["client_id"] for c in CRITERIA if c["key"] == key)
            target = criterion_id % q(client_id)
            if quote is None:
                add(
                    "insert into public.evidence_items (processing_run_id, criterion_id, status, "
                    "source_ordinal, interpretation, uncertainty, suggested_interview_question) "
                    f"values ({q(run)}, {target}, {q(status)}, 0, "
                    f"{q('제출 자료에서 이 기준을 뒷받침하는 근거를 찾지 못했습니다.' if status == 'NOT_FOUND' else '이력서로 판단하지 않고 면접에서 확인합니다.')}, "
                    "null, null);"
                )
            else:
                normalized_quote = normalize(quote)
                add(
                    "insert into public.evidence_items (processing_run_id, criterion_id, status, "
                    "source_ordinal, resume_page_id, exact_quote, interpretation, uncertainty, "
                    "source_quote_hash, source_page_hash) values ("
                    f"{q(run)}, {target}, {q(status)}, 1, {q(page_id)}, {q(quote)}, "
                    f"{q('지원서에 기재된 문장에서 확인했습니다.')}, "
                    f"{q('책임 범위가 명시되지 않아 면접에서 확인이 필요합니다.' if status == 'PARTIAL' else None)}, "
                    f"{q(sha256(normalized_quote))}, {q(page_hash)});"
                )

        if interviewed:
            add(
                "insert into public.review_assignments (application_id, assigned_to, assigned_by, "
                f"status) values ({q(application)}, {q(HIRING_MANAGER)}, {q(RECRUITER)}, 'ACTIVE');"
            )
            add(
                "insert into public.interview_progression_reviews (application_id, "
                "scorecard_version_id, reviewer_id, outcome, reason) values ("
                f"{q(application)}, {q(FRAMEWORK)}, {q(HIRING_MANAGER)}, 'INTERVIEW', "
                f"{q('지원서 근거를 확인하고 면접을 진행합니다.')});"
            )

        if recorded:
            session = uuid_at("91000000", index)
            add(
                "insert into public.interview_observation_sessions (id, application_id, "
                "scorecard_version_id, reviewer_id, off_criteria_reason) values ("
                f"{q(session)}, {q(application)}, {q(FRAMEWORK)}, {q(HIRING_MANAGER)}, null);"
            )
            for criterion in CRITERIA:
                if criterion["key"] == "k8s_operations":
                    verdict, weakness, note = (
                        "WEAKER",
                        "LEVEL_INSUFFICIENT",
                        "클러스터가 단일 노드 개발용이었고 운영 책임은 없었습니다.",
                    )
                elif criterion["key"] == "communication":
                    verdict, weakness, note = "MATCHED", None, None
                else:
                    verdict, weakness, note = "MATCHED", None, None
                add(
                    "insert into public.interview_observations (interview_observation_session_id, "
                    "application_id, criterion_id, criterion_lineage_id, verdict, weakness_type, "
                    "note, source, confirmed_at, observer_id) values ("
                    f"{q(session)}, {q(application)}, "
                    f"{criterion_id % q(criterion['client_id'])}, "
                    "(select lineage_id from public.criteria where scorecard_version_id = "
                    f"{q(FRAMEWORK)} and client_id = {q(criterion['client_id'])}), "
                    f"{q(verdict)}, {q(weakness)}, {q(note)}, 'FORM', now(), {q(HIRING_MANAGER)});"
                )
            add(
                "insert into public.human_reviews (application_id, scorecard_version_id, "
                "reviewer_id, decision, reason_code, reason_detail, confidence, "
                "observation_session_id) values ("
                f"{q(application)}, {q(FRAMEWORK)}, {q(HIRING_MANAGER)}, 'DO_NOT_PROCEED', "
                f"{q('ROLE_ALIGNMENT')}, {q('운영 환경 경험 수준이 요구 사항에 미치지 못했습니다.')}, "
                f"'HIGH', {q(session)});"
            )
        add("")

    for table in (
        "human_reviews",
        "interview_observations",
        "interview_observation_sessions",
        "interview_progression_reviews",
        "review_note_versions",
        "job_posting_status_history",
        "scorecard_versions",
        "criteria",
        "job_postings",
    ):
        add(f"alter table public.{table} enable trigger user;")
    add("commit;")

    OUT.write_text("\n".join(sql) + "\n", encoding="utf-8")
    print(f"{len(pool)}명 분량 SQL 생성: {OUT}")
    print(f"공개 공고 주소: /careers/{sha256(JOB)[:32]}")


if __name__ == "__main__":
    main()
