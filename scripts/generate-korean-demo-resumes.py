"""Generate the Korean demo resume set for the calibration walkthrough.

The pool is designed, not random. Criterion 1 ships deliberately loose accepted
evidence ("Kubernetes 사용 경험이 기재됨"), so five applicants pass on paper while
only one of them describes real operational ownership. Recording the interview
outcomes for those five is what pushes the criterion over the diagnosis
threshold (3 or more LEVEL_INSUFFICIENT observations at 40% or above), which is
the whole point of the demo.

No personal names, emails, phone numbers, or real employers appear anywhere.
Applicants are identified by an opaque label. That is both the repository's
synthetic-data rule and an honest reflection of the product: HireLens does not
read names.

Run from the repository root:  python3 scripts/generate-korean-demo-resumes.py
"""

from __future__ import annotations

import json
from pathlib import Path

from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

try:
    from PIL import Image, ImageDraw
except ImportError:  # pragma: no cover - the image-only case is optional
    Image = None

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "tests" / "fixtures" / "korean-demo-resumes"

# A CID font keeps the fixture regenerable on any machine: nothing is embedded
# from the host system, and pdfjs still extracts the text.
FONT = "HYSMyeongJo-Medium"

CRITERIA = {
    "k8s_operations": "운영 환경 Kubernetes 경험",
    "production_backend": "운영 서비스 백엔드 개발",
    "high_traffic": "대용량 트래픽 처리",
    "communication": "커뮤니케이션 (면접 전용)",
}

# Sentences that the loose v1 criterion accepts but that describe no operational
# ownership. These are the applicants the interview will contradict.
TOY_K8S = [
    "개인 프로젝트를 Kubernetes로 배포했습니다.",
    "쿠버네티스를 학습한 뒤 사이드 프로젝트에 적용했습니다.",
    "공식 튜토리얼을 따라 K8s 클러스터를 직접 구성해 보았습니다.",
    "로컬 환경에 minikube로 클러스터를 띄워 실습했습니다.",
]

REAL_K8S = "운영 중인 EKS 클러스터 3개를 관리하며 장애 대응을 담당했습니다."

PARTIAL_K8S = [
    "Kubernetes 기반 배포 파이프라인 구축에 참여했습니다.",
    "컨테이너 오케스트레이션 도입 논의에 참여하고 문서를 작성했습니다.",
    "사내 K8s 클러스터를 사용해 서비스를 배포한 경험이 있습니다.",
]


def applicant(
    label: str,
    headline: str,
    summary: str,
    experience: list[str],
    skills: str,
    expected: dict[str, str],
    quote: str | None,
) -> dict:
    return {
        "label": label,
        "headline": headline,
        "summary": summary,
        "experience": experience,
        "skills": skills,
        "expected": expected,
        "required_source_phrase": quote,
    }


def build_pool() -> list[dict]:
    pool: list[dict] = []

    # 1-4: pass the loose criterion on hobby-level evidence.
    for index, sentence in enumerate(TOY_K8S, start=1):
        pool.append(
            applicant(
                f"지원자 {index:02d}",
                "백엔드 개발자 · 경력 4년",
                "커머스 도메인에서 주문/정산 API를 개발했습니다.",
                [
                    "주문 API 서버를 개발하고 일 12만 건의 주문 처리를 담당했습니다.",
                    sentence,
                    "결제 연동 모듈을 리팩터링해 응답 지연을 30% 줄였습니다.",
                ],
                "Java, Spring Boot, MySQL, Docker, Kubernetes",
                {"k8s_operations": "SUPPORTED", "production_backend": "SUPPORTED"},
                sentence,
            )
        )

    # 5: the one applicant whose evidence actually matches the intent.
    pool.append(
        applicant(
            "지원자 05",
            "백엔드/플랫폼 엔지니어 · 경력 7년",
            "구독형 서비스의 백엔드와 배포 인프라를 함께 담당했습니다.",
            [
                REAL_K8S,
                "정산 배치 시스템을 운영하며 월 400만 건의 트랜잭션을 처리했습니다.",
                "야간 장애 대응 온콜을 2년간 수행하고 사후 리포트를 작성했습니다.",
            ],
            "Go, Kubernetes, AWS EKS, Terraform, PostgreSQL",
            {
                "k8s_operations": "SUPPORTED",
                "production_backend": "SUPPORTED",
                "high_traffic": "SUPPORTED",
            },
            REAL_K8S,
        )
    )

    # 6-8: partial evidence. Useful, but the scope of ownership is unclear.
    for offset, sentence in enumerate(PARTIAL_K8S):
        index = 6 + offset
        pool.append(
            applicant(
                f"지원자 {index:02d}",
                "백엔드 개발자 · 경력 5년",
                "사내 물류 시스템의 API와 배치를 개발했습니다.",
                [
                    "배송 추적 API를 개발하고 운영했습니다.",
                    sentence,
                    "레거시 배치를 분리해 처리 시간을 절반으로 줄였습니다.",
                ],
                "Kotlin, Spring, Redis, Kubernetes",
                {"k8s_operations": "PARTIAL", "production_backend": "SUPPORTED"},
                sentence,
            )
        )

    # 9: explicitly contradicts the criterion.
    contradiction = "컨테이너 오케스트레이션 운영 경험은 없으며 입사 후 학습할 계획입니다."
    pool.append(
        applicant(
            "지원자 09",
            "백엔드 개발자 · 경력 3년",
            "사내 관리자 도구의 백엔드를 담당했습니다.",
            [
                "관리자 페이지 API를 개발하고 운영했습니다.",
                contradiction,
                "단위 테스트 커버리지를 40%에서 75%로 올렸습니다.",
            ],
            "Python, Django, PostgreSQL",
            {"k8s_operations": "CONTRADICTED", "production_backend": "SUPPORTED"},
            contradiction,
        )
    )

    # 10: the second applicant with genuine high-traffic evidence.
    traffic = "일 평균 900만 요청을 처리하는 광고 입찰 서버를 운영했습니다."
    pool.append(
        applicant(
            "지원자 10",
            "백엔드 개발자 · 경력 8년",
            "광고 플랫폼의 실시간 입찰 시스템을 개발했습니다.",
            [
                traffic,
                "지연 시간 예산을 100ms로 잡고 프로파일링과 튜닝을 반복했습니다.",
                "트래픽 급증 시 자동 확장 정책을 설계했습니다.",
            ],
            "Go, gRPC, Kafka, Redis",
            {
                "k8s_operations": "NOT_FOUND",
                "production_backend": "SUPPORTED",
                "high_traffic": "SUPPORTED",
            },
            traffic,
        )
    )

    # 11-19: solid backend work, but nothing that speaks to the container
    # criterion. These are the applicants a keyword filter would drop first.
    other_profiles = [
        ("사내 회계 시스템의 정산 로직을 개발했습니다.", "Java, Spring, Oracle"),
        ("헬스케어 앱의 예약 API를 개발하고 운영했습니다.", "Node.js, Express, MongoDB"),
        ("교육 플랫폼의 수강 신청 백엔드를 담당했습니다.", "Python, FastAPI, PostgreSQL"),
        ("게임 서버의 매치메이킹 로직을 개발했습니다.", "C#, .NET, Redis"),
        ("사내 인증 서버를 개발하고 SSO를 연동했습니다.", "Java, Spring Security"),
        ("물류 창고 관리 시스템의 재고 API를 개발했습니다.", "Kotlin, Spring, MySQL"),
        ("보험 청구 심사 배치를 개발하고 운영했습니다.", "Java, Spring Batch"),
        ("사내 데이터 수집 파이프라인을 개발했습니다.", "Python, Airflow"),
        ("여행 예약 서비스의 결제 연동을 담당했습니다.", "PHP, Laravel, MySQL"),
    ]
    for offset, (line, skills) in enumerate(other_profiles):
        index = 11 + offset
        pool.append(
            applicant(
                f"지원자 {index:02d}",
                "백엔드 개발자 · 경력 4년",
                line,
                [
                    line,
                    "요구사항 정의부터 배포까지 전 과정에 참여했습니다.",
                    "운영 중 발생한 버그를 추적하고 수정했습니다.",
                ],
                skills,
                {"k8s_operations": "NOT_FOUND", "production_backend": "SUPPORTED"},
                None,
            )
        )

    return pool


def build_pdf(item: dict, index: int) -> Path:
    path = OUTPUT / f"ko-resume-{index:02d}.pdf"
    document = SimpleDocTemplate(
        str(path),
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        title=item["label"],
        author="HireLens synthetic fixture",
    )
    title = ParagraphStyle(
        "KoTitle", fontName=FONT, fontSize=18, leading=24, spaceAfter=4, textColor="#17345c"
    )
    meta = ParagraphStyle(
        "KoMeta", fontName=FONT, fontSize=10, leading=15, spaceAfter=14, textColor="#54637a"
    )
    section = ParagraphStyle(
        "KoSection",
        fontName=FONT,
        fontSize=12,
        leading=17,
        spaceBefore=12,
        spaceAfter=6,
        textColor="#365a94",
    )
    body = ParagraphStyle(
        "KoBody",
        fontName=FONT,
        fontSize=10.5,
        leading=17,
        spaceAfter=5,
        alignment=TA_LEFT,
        textColor="#253854",
    )

    flow = [
        Paragraph(item["label"], title),
        Paragraph(item["headline"], meta),
        Paragraph("요약", section),
        Paragraph(item["summary"], body),
        Paragraph("주요 경험", section),
    ]
    flow.extend(Paragraph(f"· {line}", body) for line in item["experience"])
    flow.extend(
        [
            Paragraph("기술 스택", section),
            Paragraph(item["skills"], body),
            Spacer(1, 8 * mm),
            Paragraph(
                "본 문서는 HireLens 데모용 합성 이력서입니다. 실재하는 개인이나 기업의 정보가 아닙니다.",
                meta,
            ),
        ]
    )
    document.build(flow)
    return path


def main() -> None:
    pdfmetrics.registerFont(UnicodeCIDFont(FONT))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for stale in OUTPUT.glob("*"):
        stale.unlink()

    pool = build_pool()
    cases = []
    for index, item in enumerate(pool, start=1):
        build_pdf(item, index)
        cases.append(
            {
                "file": f"ko-resume-{index:02d}.pdf",
                "label": item["label"],
                "expected": item["expected"],
                "required_source_phrase": item["required_source_phrase"],
            }
        )

    # An image-only page must land as NEEDS_OCR rather than an empty result.
    if Image is not None:
        page = Image.new("RGB", (1240, 1754), "white")
        draw = ImageDraw.Draw(page)
        draw.text((90, 120), "HIRELENS DEMO FIXTURE", fill="#17345c")
        draw.text((90, 190), "IMAGE ONLY RESUME - OCR REQUIRED", fill="#253854")
        image_path = OUTPUT / "ko-resume-20-image-only.pdf"
        page.save(str(image_path), "PDF", resolution=150.0)
        cases.append(
            {
                "file": image_path.name,
                "label": "지원자 20",
                "expected": {"processing": "NEEDS_OCR"},
                "required_source_phrase": None,
            }
        )

    (OUTPUT / "expectations.json").write_text(
        json.dumps(
            {
                "fixture_version": "korean-demo-resumes-v1",
                "criteria": CRITERIA,
                "cases": cases,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"{len(cases)}건 생성: {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
