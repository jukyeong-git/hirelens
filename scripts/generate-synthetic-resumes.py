"""Generate the deterministic HireLens synthetic resume golden set.

The fixtures intentionally contain no names, emails, phone numbers, addresses,
or real employer identifiers. Run from the repository root.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "tests" / "fixtures" / "synthetic-resumes"

CRITERIA = {
    "production_backend": "Production backend delivery and operations",
    "incident_response": "Production incident response",
    "distributed_systems": "Distributed systems design",
    "collaboration": "Cross-functional collaboration - interview only",
}


def case(case_id: str, expected_status: str, summary: str, experience: list[str],
         required_phrase: str | None = None, expected_page: int | None = 1) -> dict:
    return {
        "id": case_id,
        "expected_status": expected_status,
        "summary": summary,
        "experience": experience,
        "required_phrase": required_phrase,
        "expected_page": expected_page,
    }


CASES = [
    *[
        case(
            f"supported-{index:02d}",
            "SUPPORTED",
            "Synthetic profile with direct, verifiable production evidence.",
            [
                f"Built and operated production backend services supporting {index * 8_000:,} daily requests.",
                f"Led incident response and reduced recovery time by {10 + index} percent.",
                "Documented service ownership, deployment, monitoring, and rollback procedures.",
            ],
            "Built and operated production backend services",
        )
        for index in range(1, 6)
    ],
    *[
        case(
            f"partial-{index:02d}",
            "PARTIAL",
            "Synthetic profile with relevant technology use but unclear responsibility.",
            [
                "Contributed to backend API development using TypeScript and PostgreSQL.",
                "Participated in a team that used dashboards and deployment automation.",
                "Individual production ownership and incident responsibility are not described.",
            ],
            "Contributed to backend API development",
        )
        for index in range(1, 6)
    ],
    *[
        case(
            f"not-found-{index:02d}",
            "NOT_FOUND",
            "Synthetic profile whose submitted material does not mention the target evidence.",
            [
                "Created static documentation sites and internal design assets.",
                "Maintained editorial calendars and content review checklists.",
                "The submitted material focuses on documentation work.",
            ],
            None,
            None,
        )
        for index in range(1, 5)
    ],
    *[
        case(
            f"contradicted-{index:02d}",
            "CONTRADICTED",
            "Synthetic profile with an explicit statement conflicting with the criterion.",
            [
                "Worked only on local prototypes that were never deployed to a production environment.",
                "Did not participate in production operations or incident response for these projects.",
            ],
            "never deployed to a production environment",
        )
        for index in range(1, 3)
    ],
    *[
        case(
            f"interview-only-{index:02d}",
            "HUMAN_ONLY",
            "Synthetic profile used to prove interview-only criteria are not inferred from resumes.",
            [
                "Built backend services and prepared technical design documents.",
                "Collaboration style and communication quality must be assessed by a human interview.",
            ],
            None,
            None,
        )
        for index in range(1, 3)
    ],
]


def draw_header(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFillColorRGB(0.10, 0.20, 0.35)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(20 * mm, A4[1] - 14 * mm, "HIRELENS SYNTHETIC DEMO FIXTURE")
    canvas.setFillColorRGB(0.40, 0.47, 0.58)
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(A4[0] - 20 * mm, 12 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build_text_pdf(item: dict) -> None:
    path = OUTPUT / f"{item['id']}.pdf"
    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "FixtureTitle", parent=styles["Title"], fontName="Helvetica-Bold",
        fontSize=19, leading=24, textColor="#17345c", spaceAfter=8,
    )
    section = ParagraphStyle(
        "FixtureSection", parent=styles["Heading2"], fontName="Helvetica-Bold",
        fontSize=11, leading=15, textColor="#365a94", spaceBefore=12, spaceAfter=6,
    )
    body = ParagraphStyle(
        "FixtureBody", parent=styles["BodyText"], fontName="Helvetica",
        fontSize=10, leading=15, textColor="#253854", spaceAfter=7,
    )
    doc = SimpleDocTemplate(
        str(path), pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=24 * mm, bottomMargin=20 * mm,
        title=f"Synthetic Resume {item['id']}", author="HireLens Demo",
    )
    story = [
        Paragraph(f"Synthetic Candidate {item['id'].upper()}", title),
        Paragraph("DEMO DATA ONLY - NOT A REAL PERSON", body),
        Spacer(1, 5 * mm),
        Paragraph("Profile", section),
        Paragraph(item["summary"], body),
        Paragraph("Selected Experience", section),
    ]
    for bullet in item["experience"]:
        story.append(Paragraph(f"- {bullet}", body))
    story.extend([
        PageBreak(),
        Paragraph("Skills and project context", section),
        Paragraph(
            "TypeScript, PostgreSQL, API design, testing, documentation, and synthetic project delivery.",
            body,
        ),
        Paragraph(
            "This second page is included to verify stable page boundaries and source-page navigation.",
            body,
        ),
    ])
    doc.build(story, onFirstPage=draw_header, onLaterPages=draw_header)


def build_image_only_pdf() -> None:
    image_path = OUTPUT / "image-only-01.png"
    image = Image.new("RGB", (1240, 1754), "white")
    draw = ImageDraw.Draw(image)
    regular = ImageFont.load_default(size=34)
    heading = ImageFont.load_default(size=46)
    draw.text((100, 100), "HIRELENS SYNTHETIC DEMO FIXTURE", fill="#17345c", font=regular)
    draw.text((100, 210), "IMAGE ONLY RESUME - OCR REQUIRED", fill="#253854", font=heading)
    draw.text(
        (100, 310),
        "No selectable PDF text is embedded in this page.",
        fill="#253854",
        font=regular,
    )
    image.save(image_path)
    image.save(OUTPUT / "image-only-01.pdf", "PDF", resolution=144.0)
    image_path.unlink()


def build_malformed_pdf() -> None:
    (OUTPUT / "malformed-01.pdf").write_bytes(
        b"%PDF-1.4\n% Synthetic intentionally malformed fixture\n1 0 obj\n<< /Type /Catalog >>\n"
    )


def write_expectations() -> None:
    records = [
        {
            "file": f"{item['id']}.pdf",
            "criterion": "production_backend",
            "acceptable_statuses": [item["expected_status"]],
            "required_source_phrase": item["required_phrase"],
            "expected_page": item["expected_page"],
            "forbidden_overclaims": [
                "candidate lacks the capability",
                "not qualified",
                "hire probability",
            ],
        }
        for item in CASES
    ]
    records.extend([
        {
            "file": "image-only-01.pdf",
            "expected_processing_state": "NEEDS_OCR",
            "acceptable_statuses": [],
        },
        {
            "file": "malformed-01.pdf",
            "expected_processing_state": "FAILED",
            "acceptable_statuses": [],
        },
    ])
    payload = {"fixture_version": "synthetic-resumes-v1", "criteria": CRITERIA, "cases": records}
    (OUTPUT / "expectations.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8"
    )


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for stale in OUTPUT.glob("*.pdf"):
        stale.unlink()
    for item in CASES:
        build_text_pdf(item)
    build_image_only_pdf()
    build_malformed_pdf()
    write_expectations()
    print(f"Generated 20 synthetic resume fixtures in {OUTPUT}")


if __name__ == "__main__":
    main()
