# UI/UX Guide — Workday-Informed, Evidence-First HireLens

## 1. Design stance

HireLens should borrow the **operational clarity** of an enterprise ATS such as
Workday: role-based workspaces, a requisition as the organizing record, clear
workflow states, and dense lists for frequent operational work.

It must not imitate Workday screens, terminology density, navigation, visual
style, or full HCM scope. HireLens has a narrower job: make resume evidence
and human judgment quick to inspect and easy to explain.

```text
Borrow: workspace, ownership, queues, state clarity, dense operational lists
Own: evidence-first review, source-page traceability, AI/human separation
Avoid: full HRIS navigation, global fit scores, copied layouts or labels
```

## 2. Product principles

1. **Evidence before interpretation.** Show the approved criterion and source
   quote before an AI summary or a reviewer’s conclusion.
2. **Human action is unmistakable.** Approval, publication, and hiring
   decisions are clearly labeled as human actions. AI never appears to approve,
   publish, advance, reject, or hire.
3. **One workflow state per concern.** Requisition, Posting, Review Framework,
   Processing, and Human Decision use separate labels and histories.
4. **Operational density without visual overload.** Use concise rows, filters,
   counts, and progressive disclosure instead of dashboard decoration.
5. **Every exception remains visible.** Processing failures, `NEEDS_OCR`,
   partial results, and blocked approvals belong in the normal workflow.
6. **Intake policy is neutral.** Candidate-facing screens accept technically
   valid PDFs without asking for or displaying a data classification. Product
   UI does not use `Demo`, `demo`, or `데모` labels.
7. **AI proposes; humans define the policy.** The internal concept is `Review
Framework`; label the user-facing artifact `지원서 검토 기준`. The AI draft
   action is explicit, never automatic, and the resulting criteria remain a
   draft until a human approves them.

## 3. Information architecture

### Internal application

Use a compact left navigation on desktop and a labelled menu on smaller
screens:

```text
HireLens
├─ My work
│  ├─ My requisitions             (Hiring Manager)
│  ├─ My postings                 (Recruiter)
│  ├─ My review queue             (Recruiter / Hiring Manager)
│  └─ Requisitions awaiting approval (Requisition Approver)
├─ Requisitions
├─ Applications
├─ Processing issues              (Admin / responsible Recruiter)
└─ Test administration            (Admin)
```

The internal `/jobs` landing page is role-aware rather than a generic dashboard.
The product root `/` redirects to `/careers` so published roles are visible
first; internal users enter their role workspace from the careers header.

- **Hiring Manager:** requisitions awaiting action, Scorecards needing approval,
  assigned candidate reviews.
- **Recruiter:** postings to prepare/publish, submitted applications awaiting
  processing or triage, review requests awaiting response.
- **Admin:** failed processing, access and test-data controls.
- **Requisition Approver:** requisitions awaiting business approval or return.

### Public candidate route

Use a deliberately separate, minimal route such as `/careers/[slug]`.
HL-028 provides the public posting. HL-029 provides the
submission form and private server-owned upload transaction:

```text
Company / HireLens Careers
Job title · location · employment type
Role summary and responsibilities
Candidate preview and public URL
```

The public route must not expose internal navigation, candidate counts,
reviewer names, processing states, requisition text, or a login requirement.
The HL-029 submission receipt says only that the application was received and
must not reveal an application ID.

### Copy density

- Use Korean nouns, status labels, and result-oriented action labels in the UI.
- Use one concise `h1` per page and one noun-based `h2` per section. Do not
  repeat the same concept as an eyebrow, heading, and description.
- Remove ticket IDs, decorative English eyebrow text, and explanatory prose
  when the same meaning is already conveyed by the heading, field label, state,
  or disabled control.
- Use `채용 담당자`, `채용 책임자`, `채용 요청`, `채용 공고`, and `지원서
검토 기준` in user-facing copy; keep English domain names in code only.
- Keep complete sentences only for safety, authorization, validation, error,
  and AI-versus-human responsibility boundaries.
- Do not ask users to classify uploaded content. Keep the distinction between
  live OpenAI results and preprocessed synthetic results.

## 4. Core workspace patterns

### Review Framework editor

- Start with two explicit methods: `직접 작성` and `AI 초안`. Both open the
  same unsaved structured editor; AI does not create a separate workflow.
- Present one collapsible card per criterion. The collapsed row shows the
  criterion name, importance, and whether it can be evaluated from a resume.
- Keep criterion definition, accepted evidence, alternative evidence,
  partial-evidence guidance, extraction fields, and interview question in the
  expanded card. Do not hide validation errors when the card is collapsed.
- Put `기준 추가`, `AI 초안`, and `초안 저장` in a stable action area at the
  bottom. Saving is always an explicit human action.
- Do not display or request a total score, rank, automatic filter, knockout, or
  hiring recommendation.

### Requisition workspace

The requisition is the internal work record, similar in concept to a Workday
requisition workspace but narrower.

```text
Backend Engineer                         [Requisition: Pending approval]
Hiring Manager · Recruiter · target date

Overview | Scorecard | Posting | Applications | History

Next required action
  Business approval is required before this requisition can be posted.
  [Approve requisition] [Return with reason]
```

- Place the primary next action at the top, not inside a menu.
- Show all prerequisites as readable gates: `Requisition approved`,
  `Scorecard approved`, `Posting published`.
- Show approval actions only to the designated Requisition Approver, never to
  Admin merely because they operate the system.
- Show a short human-entered approval/return reason directly below the result.
- Keep history in a quiet secondary tab or drawer; it is a minimal change
  history, not a SCIM audit console.

### Posting workspace

The Recruiter edits candidate-facing copy in a dedicated posting section. Keep
the approved Scorecard private; the public posting is not a copy of every
evaluation criterion.

```text
Posting status: Draft / Published / Closed
Public URL: available only when Published

Candidate-facing content
  Title, summary, responsibilities, requirements, location

Publication gates
  ✓ Requisition approved
  ✓ Scorecard v1 approved
  [Publish posting]
```

`Publish` and `Close posting` require confirmation. Closing stops new public
submissions without hiding existing internal applications.

### Application list

Use a dense, sortable operational table rather than cards as the default.

| Candidate label       | Processing | Evidence                      | Review owner | Human decision | Updated |
| --------------------- | ---------- | ----------------------------- | ------------ | -------------- | ------- |
| Synthetic candidate A | Ready      | 3 supported, 1 interview-only | Mina         | —              | 4m ago  |
| Synthetic candidate B | Needs OCR  | Not available                 | Unassigned   | —              | 12m ago |

Required filters: processing state, evidence state, assigned reviewer, and
human decision state. Do not sort by an AI-generated overall fit score.

### Candidate review workspace

Use a two-pane layout on wide screens and a sequential layout on narrow
screens.

```text
Left: approved Scorecard criteria          Right: source and review context
──────────────────────────────────────────────────────────────────────────
Criterion definition                        Resume page viewer
Evidence state                              Exact quote, highlighted
Exact quote + page                          AI interpretation
Uncertainty                                 Recruiter note history
Suggested interview question                Human decision form
```

The visual order is mandatory:

1. criterion definition;
2. evidence state;
3. exact quote and page;
4. AI interpretation;
5. uncertainty and suggested question;
6. Recruiter note;
7. human decision.

`NOT_FOUND` must read: **“제출 자료에서 이 기준을 뒷받침하는 근거를 찾지 못했습니다.”** Never phrase it as an assertion that the candidate lacks the capability.

## 5. Status system

Use a pill only as a compact supplement. Every status must also have visible
text and an icon. Do not merge these dimensions:

| Dimension      | Example states                                          | UI treatment                                            |
| -------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| Requisition    | Draft, pending approval, approved, returned             | Header state + next action for the Requisition Approver |
| Posting        | Draft, published, closed                                | Header state + public URL action                        |
| Scorecard      | Draft, approved, superseded                             | Version badge and history                               |
| Processing     | Queued, extracting, completed, needs OCR, failed        | Table column + details                                  |
| Evidence       | Supported, partial, not found, contradicted, human-only | Criterion row                                           |
| Human decision | Proceed, hold, do not proceed                           | Explicit human-decision panel                           |

For errors, distinguish:

- **Retryable:** show reason and `Retry` only to an authorized role.
- **Fatal:** explain the safe next action; do not show a futile retry.
- **Partial:** retain and label usable evidence; do not make the screen blank.
- **Unauthorized:** explain that access is restricted without exposing data.

## 6. Interaction and copy rules

- Use action labels that name the actor and result: `Admin 승인`, `공고 게시`,
  `검토 요청`, `사람의 결정 저장`.
- Require a reason inline for approval, return, decision, and decision change.
- Use explicit confirmation for publish, close, retry, and any destructive
  operation.
- Separate system notices from human messages. For example, label an AI block
  `AI가 추출한 근거` and a note block `Recruiter 임시 의견`.
- Do not show a confident-looking numerical rank or “recommended hire” label.
- Put critical empty-state guidance beside the missing action: “승인된
  Scorecard가 있어야 공고를 게시할 수 있습니다.”

## 7. Visual language

- Use a neutral, editorial workspace with one restrained brand accent for
  primary actions.
- Prefer strong type hierarchy, subtle dividers, compact rows, and whitespace
  around decision areas.
- Reserve warning/error colors for exceptional state; never use color alone.
- Use icons only where they shorten repeated operational scanning: document,
  page, queue, warning, human decision.
- Public careers pages should be calmer and more spacious than internal
  operations pages, while sharing typography and accessible controls.

## 8. Accessibility and responsive requirements

- Every status has text, an icon, and color.
- Every control has an accessible name and works with keyboard navigation.
- Focus moves to the confirmation or error summary after submit.
- Tables offer a responsive row-detail pattern rather than horizontal overflow
  without context.
- The source-page link is available from every evidence item.
- Loading, empty, partial, retryable failure, fatal failure, unauthorized, and
  stale-version states are designed before the happy path is considered done.

## 9. Workday-inspired, not Workday-copied

| Use the concept                                           | Do not copy                                                |
| --------------------------------------------------------- | ---------------------------------------------------------- |
| Role-specific workspace and work queues                   | Workday navigation tree, visual chrome, or labels verbatim |
| Requisition as the organizing record                      | Full position, compensation, and HRIS data model           |
| Clear approval and posting states                         | Dense configuration screens for every enterprise policy    |
| Operational application table                             | Candidate ranking or opaque talent scores                  |
| Candidate-facing posting separate from internal workspace | Public exposure of review data or staff work queues        |

Workday references for the underlying concepts: [job requisition setup](https://doc.workday.com/admin-guide/en-us/human-capital-management/recruiting/job-requisitions-for-recruiting/fsn1558961997264.html) and [job requisition creation](https://doc.workday.com/admin-guide/en-us/human-capital-management/staffing/job-requisitions/dan1370797162029.html).

## 10. Implementation checklist

Before building a screen, identify its owner, state transitions, public/private
boundary, empty/error states, and the minimal decision/change history it must
show. Candidate and evidence UI changes must follow the repository `ats-ui`
skill and add Playwright coverage for source-page access, `NOT_FOUND` wording,
required decision reasons, unauthorized access, and partial processing.
