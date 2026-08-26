"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import type {
  CriterionRecord,
  EvidenceItemRecord,
  InterviewCriterionVerdict,
  InterviewObservationSource,
  InterviewWeaknessType,
  ResumePageRecord,
} from "@hirelens/domain";
import type { InterviewGuideCriterion } from "@hirelens/ai";

import { initialReviewActionState } from "../../jobs/action-state";
import { recordPostInterviewReviewAction } from "../../jobs/actions";
import {
  generateInterviewAssessmentAction,
  generateInterviewGuideAction,
  initialInterviewAssessmentActionState,
  initialInterviewGuideActionState,
} from "../interview-actions";
import { FieldSelect } from "../../_components/field-select";
import { SegmentedControl } from "../../_components/segmented-control";
import { useSpeechTranscript } from "./use-speech-transcript";

interface InterviewOutcomeFormProps {
  applicationId: string;
  scorecardVersionId: string;
  criteria: CriterionRecord[];
  evidence: EvidenceItemRecord[];
  pages: ResumePageRecord[];
}

interface ObservationValue {
  verdict: InterviewCriterionVerdict | "";
  weaknessType: InterviewWeaknessType | null;
  note: string;
  source: InterviewObservationSource;
  /** Null unless a draft exists for this criterion. */
  aiDraftAccepted: boolean | null;
}

interface DraftValue {
  verdict: InterviewCriterionVerdict;
  weaknessType: InterviewWeaknessType | null;
  rationale: string;
  transcriptQuote: string | null;
}

type Phase = "PREPARE" | "RECORD" | "REVIEW";

const PHASES: ReadonlyArray<{ id: Phase; label: string; caption: string }> = [
  { id: "PREPARE", label: "면접 준비", caption: "무엇을 확인할지 정합니다" },
  { id: "RECORD", label: "면접 진행", caption: "대화를 받아씁니다" },
  { id: "REVIEW", label: "결과 정리", caption: "기준별로 확인합니다" },
];

const VERDICT_OPTIONS = [
  {
    value: "MATCHED" as const,
    label: "확인됨",
    hint: "지원서 내용대로",
    tone: "positive" as const,
  },
  {
    value: "WEAKER" as const,
    label: "미치지 못함",
    hint: "지원서보다 약함",
    tone: "caution" as const,
  },
  {
    value: "STRONGER" as const,
    label: "그 이상",
    hint: "지원서보다 나음",
    tone: "positive" as const,
  },
  {
    value: "NOT_ASKED" as const,
    label: "확인 못 함",
    hint: "면접에서 다루지 않음",
    tone: "neutral" as const,
  },
];

const WEAKNESS_OPTIONS = [
  {
    value: "LEVEL_INSUFFICIENT" as const,
    label: "수준이 부족",
    hint: "사실이지만 요구 수준에 못 미침",
    tone: "caution" as const,
  },
  {
    value: "FALSE_CLAIM" as const,
    label: "사실과 다름",
    hint: "지원서 내용이 실제와 달랐음",
    tone: "critical" as const,
  },
  {
    value: "AI_MISREAD" as const,
    label: "해석 오류",
    hint: "지원서 표현을 시스템이 잘못 읽음",
    tone: "neutral" as const,
  },
];

const DECISION_OPTIONS = [
  { value: "PROCEED", label: "다음 단계 진행" },
  { value: "HOLD", label: "보류" },
  { value: "DO_NOT_PROCEED", label: "진행하지 않음" },
];

const REASON_CODE_OPTIONS = [
  { value: "EVIDENCE_REVIEW", label: "근거 검토", hint: "기준별 확인 결과에 따른 판단" },
  { value: "INTERVIEW_REQUIRED", label: "추가 면접 필요", hint: "한 번 더 확인이 필요함" },
  { value: "ROLE_ALIGNMENT", label: "직무 정합성", hint: "요구 역량과 맞지 않음" },
  { value: "BUSINESS_CONTEXT", label: "업무 상황", hint: "채용 상황·조직 사정" },
];

const CONFIDENCE_OPTIONS = [
  { value: "HIGH" as const, label: "높음" },
  { value: "MEDIUM" as const, label: "보통" },
  { value: "LOW" as const, label: "낮음" },
];

const PRIORITY_LABELS: Record<string, { label: string; tone: string }> = {
  HIGH: { label: "반드시 확인", tone: "priority-high" },
  MEDIUM: { label: "확인 권장", tone: "priority-medium" },
  LOW: { label: "가볍게 확인", tone: "priority-low" },
};

function criterionTypeLabel(type: CriterionRecord["type"]) {
  return { REQUIRED: "필수", PREFERRED: "우대", INTERVIEW_ONLY: "면접 확인" }[type];
}

function evidenceLabel(status: string) {
  return (
    {
      SUPPORTED: "지원서에 근거 있음",
      PARTIAL: "지원서에 근거 일부",
      NOT_FOUND: "지원서에서 못 찾음",
      CONTRADICTED: "본인이 없다고 기재",
      HUMAN_ONLY: "면접에서 확인",
      PENDING: "결과 대기",
    }[status] ?? status
  );
}

function formatDuration(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function InterviewOutcomeForm({
  applicationId,
  scorecardVersionId,
  criteria,
  evidence,
  pages,
}: InterviewOutcomeFormProps) {
  const [state, formAction, pending] = useActionState(
    recordPostInterviewReviewAction,
    initialReviewActionState,
  );
  const [guideState, guideAction, guidePending] = useActionState(
    generateInterviewGuideAction,
    initialInterviewGuideActionState,
  );
  const [assessmentState, assessmentAction, assessmentPending] = useActionState(
    generateInterviewAssessmentAction,
    initialInterviewAssessmentActionState,
  );

  const [phase, setPhase] = useState<Phase>("PREPARE");
  const [step, setStep] = useState(0);
  const [localError, setLocalError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const speech = useSpeechTranscript();

  const [values, setValues] = useState<Record<string, ObservationValue>>(() =>
    Object.fromEntries(
      criteria.map((criterion) => [
        criterion.id,
        { verdict: "", weaknessType: null, note: "", source: "FORM", aiDraftAccepted: null },
      ]),
    ),
  );
  const [decision, setDecision] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [confidence, setConfidence] = useState("MEDIUM");

  const evidenceByCriterion = useMemo(() => {
    const grouped = new Map<string, EvidenceItemRecord[]>();
    for (const item of evidence) {
      grouped.set(item.criterion_id, [...(grouped.get(item.criterion_id) ?? []), item]);
    }
    return grouped;
  }, [evidence]);
  const pageById = useMemo(() => new Map(pages.map((page) => [page.id, page])), [pages]);

  const guideByCriterion = useMemo(() => {
    const grouped = new Map<string, InterviewGuideCriterion>();
    for (const entry of guideState.guide?.criteria ?? []) grouped.set(entry.criterion_id, entry);
    return grouped;
  }, [guideState.guide]);

  const draftByCriterion = useMemo(() => {
    const grouped = new Map<string, DraftValue>();
    for (const entry of assessmentState.assessment?.criteria ?? []) {
      grouped.set(entry.criterion_id, {
        verdict: entry.verdict,
        weaknessType: entry.weakness_type,
        rationale: entry.rationale,
        transcriptQuote: entry.transcript_quote,
      });
    }
    return grouped;
  }, [assessmentState.assessment]);

  // A fresh set of drafts replaces whatever the previous run left behind, and
  // arrives unaccepted: the interviewer confirms each one before it counts.
  useEffect(() => {
    if (!assessmentState.assessment) return;
    setValues((previous) => {
      const next = { ...previous };
      for (const entry of assessmentState.assessment!.criteria) {
        next[entry.criterion_id] = {
          verdict: entry.verdict,
          weaknessType: entry.weakness_type,
          note: previous[entry.criterion_id]?.note ?? "",
          source: "TRANSCRIPT",
          aiDraftAccepted: false,
        };
      }
      return next;
    });
    setStep(0);
  }, [assessmentState.assessment]);

  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [state.status]);

  const answered = criteria.filter((criterion) => values[criterion.id]?.verdict).length;
  const unconfirmedDrafts = criteria.filter(
    (criterion) =>
      values[criterion.id]?.source === "TRANSCRIPT" &&
      values[criterion.id]?.aiDraftAccepted === false,
  ).length;

  const observations = criteria.map((criterion) => {
    const value = values[criterion.id];
    return {
      criterionId: criterion.id,
      verdict: value?.verdict,
      weaknessType: value?.weaknessType ?? null,
      note: value?.note.trim() || null,
      source: value?.source ?? "FORM",
      aiDraftAccepted: value?.aiDraftAccepted ?? null,
    };
  });

  const update = (criterionId: string, patch: Partial<ObservationValue>) =>
    setValues((previous) => ({
      ...previous,
      [criterionId]: {
        ...(previous[criterionId] ?? {
          verdict: "",
          weaknessType: null,
          note: "",
          source: "FORM",
          aiDraftAccepted: null,
        }),
        ...patch,
      },
    }));

  const current = criteria[step];

  return (
    <section className="panel interview-workspace" aria-labelledby="post-interview-review-title">
      <div className="section-heading section-heading-inline">
        <div>
          <h2 id="post-interview-review-title">면접 평가</h2>
          <p className="section-copy">
            지원서가 확인해 주지 못한 것을 면접에서 확인하고, 그 결과를 기준별로 남깁니다.
          </p>
        </div>
        <span className="count-label">
          {answered}/{criteria.length}개 기준 확인
        </span>
      </div>

      <ol className="phase-rail" aria-label="면접 평가 단계">
        {PHASES.map((entry, index) => {
          const activeIndex = PHASES.findIndex((candidate) => candidate.id === phase);
          const status = index < activeIndex ? "done" : index === activeIndex ? "active" : "todo";
          return (
            <li className={`phase-step phase-${status}`} key={entry.id}>
              <button
                type="button"
                onClick={() => setPhase(entry.id)}
                aria-current={status === "active" ? "step" : undefined}
              >
                <span className="phase-index" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="phase-text">
                  <strong>{entry.label}</strong>
                  <span>{entry.caption}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {phase === "PREPARE" ? (
        <PreparePhase
          applicationId={applicationId}
          scorecardVersionId={scorecardVersionId}
          criteria={criteria}
          evidenceByCriterion={evidenceByCriterion}
          guideByCriterion={guideByCriterion}
          guideNote={guideState.guide?.opening_note ?? null}
          guideAction={guideAction}
          guidePending={guidePending}
          guideMessage={guideState.status === "error" ? (guideState.message ?? null) : null}
          onStart={() => setPhase("RECORD")}
        />
      ) : null}

      {phase === "RECORD" ? (
        <RecordPhase
          speech={speech}
          criteria={criteria}
          guideByCriterion={guideByCriterion}
          onFinish={() => {
            speech.stop();
            setPhase("REVIEW");
          }}
        />
      ) : null}

      {phase === "REVIEW" ? (
        <>
          <div className="assessment-launcher">
            <form action={assessmentAction}>
              <input type="hidden" name="applicationId" value={applicationId} />
              <input type="hidden" name="scorecardVersionId" value={scorecardVersionId} />
              <input type="hidden" name="transcript" value={speech.transcript} />
              <div className="assessment-launcher-copy">
                <strong>받아쓴 내용으로 기준별 초안 만들기</strong>
                <span>
                  {speech.transcript.trim()
                    ? `받아쓴 글자 ${speech.transcript.trim().length.toLocaleString("ko-KR")}자`
                    : "받아쓴 내용이 없습니다. 기준별로 직접 선택하세요."}
                </span>
              </div>
              <button
                className="button button-primary"
                type="submit"
                disabled={assessmentPending || speech.transcript.trim().length < 30}
              >
                {assessmentPending ? "초안 만드는 중…" : "초안 만들기"}
              </button>
            </form>
            {assessmentState.status === "error" ? (
              <p className="form-alert form-alert-error" role="alert">
                {assessmentState.message}
              </p>
            ) : null}
            {assessmentState.status === "success" ? (
              <p className="form-alert form-alert-success" role="status">
                {assessmentState.message} 확인하지 않은 초안은 기준 개선 집계에 포함되지 않습니다.
              </p>
            ) : null}
          </div>

          <form
            action={formAction}
            className="interview-review-form"
            onSubmit={(event) => {
              if (answered !== criteria.length) {
                event.preventDefault();
                setLocalError("모든 기준의 확인 결과를 선택하세요.");
                requestAnimationFrame(() => errorRef.current?.focus());
              } else if (!decision || !reasonCode) {
                event.preventDefault();
                setLocalError("최종 결정과 사유 분류를 선택하세요.");
                requestAnimationFrame(() => errorRef.current?.focus());
              } else {
                setLocalError("");
              }
            }}
          >
            <input type="hidden" name="applicationId" value={applicationId} />
            <input type="hidden" name="scorecardVersionId" value={scorecardVersionId} />
            <input type="hidden" name="observations" value={JSON.stringify(observations)} />

            {localError || state.status === "error" ? (
              <p ref={errorRef} className="form-alert form-alert-error" role="alert" tabIndex={-1}>
                {localError || state.message}
              </p>
            ) : null}

            <nav className="criterion-rail" aria-label="기준 이동">
              {criteria.map((criterion, index) => {
                const value = values[criterion.id];
                const done = Boolean(value?.verdict);
                const needsConfirm =
                  value?.source === "TRANSCRIPT" && value.aiDraftAccepted === false;
                return (
                  <button
                    key={criterion.id}
                    type="button"
                    className={`criterion-rail-step${index === step ? " is-current" : ""}${
                      done ? " is-done" : ""
                    }${needsConfirm ? " needs-confirm" : ""}`}
                    aria-current={index === step ? "step" : undefined}
                    onClick={() => setStep(index)}
                  >
                    <span className="criterion-rail-index" aria-hidden="true">
                      {index + 1}
                    </span>
                    <span className="criterion-rail-name">{criterion.name}</span>
                  </button>
                );
              })}
            </nav>

            {current ? (
              <CriterionStep
                criterion={current}
                value={
                  values[current.id] ?? {
                    verdict: "",
                    weaknessType: null,
                    note: "",
                    source: "FORM",
                    aiDraftAccepted: null,
                  }
                }
                draft={draftByCriterion.get(current.id) ?? null}
                items={evidenceByCriterion.get(current.id) ?? []}
                pageById={pageById}
                guide={guideByCriterion.get(current.id) ?? null}
                disabled={pending}
                onChange={(patch) => update(current.id, patch)}
              />
            ) : null}

            <div className="criterion-step-nav">
              <button
                className="button button-quiet"
                type="button"
                disabled={step === 0}
                onClick={() => setStep((index) => Math.max(0, index - 1))}
              >
                이전 기준
              </button>
              <span className="criterion-step-count">
                {step + 1} / {criteria.length}
              </span>
              <button
                className="button button-quiet"
                type="button"
                disabled={step >= criteria.length - 1}
                onClick={() => setStep((index) => Math.min(criteria.length - 1, index + 1))}
              >
                다음 기준
              </button>
            </div>

            <div className="final-decision">
              <div className="section-heading">
                <h3>최종 결정</h3>
                <p className="section-copy">
                  {answered === criteria.length
                    ? "모든 기준을 확인했습니다."
                    : `${criteria.length - answered}개 기준이 남았습니다.`}
                  {unconfirmedDrafts > 0
                    ? ` 확인하지 않은 초안 ${unconfirmedDrafts}개는 기준 개선 집계에서 제외됩니다.`
                    : ""}
                </p>
              </div>

              <SegmentedControl
                legend="이 지원자를 어떻게 할까요?"
                options={DECISION_OPTIONS}
                value={decision}
                onChange={setDecision}
                name="decision"
                disabled={pending}
                columns={3}
              />

              <div className="field">
                <label htmlFor="interview-reason-code">사유 분류</label>
                <FieldSelect
                  id="interview-reason-code"
                  options={REASON_CODE_OPTIONS}
                  value={reasonCode}
                  onChange={setReasonCode}
                  name="reasonCode"
                  disabled={pending}
                  ariaLabel="사유 분류"
                />
              </div>

              <div className="field">
                <label htmlFor="interview-reason-detail">결정 이유</label>
                <textarea
                  id="interview-reason-detail"
                  name="reasonDetail"
                  required
                  maxLength={2000}
                  disabled={pending}
                  placeholder="어떤 기준의 어떤 확인 결과가 이 결정으로 이어졌는지 적어 주세요."
                />
              </div>

              <SegmentedControl
                legend="이 판단에 대한 확신"
                options={CONFIDENCE_OPTIONS}
                value={confidence}
                onChange={setConfidence}
                name="confidence"
                disabled={pending}
                columns={3}
              />

              <details className="optional-fields">
                <summary>기준 밖의 사정이나 메모 추가</summary>
                <div className="field">
                  <label htmlFor="interview-off-criteria">평가 기준에 없던 판단 근거</label>
                  <textarea
                    id="interview-off-criteria"
                    name="offCriteriaReason"
                    maxLength={2000}
                    disabled={pending}
                    placeholder="기준으로 정해두지 않았지만 판단에 영향을 준 사정이 있다면 적어 주세요. 다음 기준 개선에 참고합니다."
                  />
                </div>
                <div className="field">
                  <label htmlFor="interview-note">추가 메모</label>
                  <textarea id="interview-note" name="note" maxLength={2000} disabled={pending} />
                </div>
              </details>

              <button
                className="button button-primary button-wide"
                type="submit"
                disabled={pending}
              >
                {pending ? "저장 중…" : "면접 결과 저장"}
              </button>
              {state.status === "success" ? (
                <p className="form-alert form-alert-success" role="status">
                  {state.message}
                </p>
              ) : null}
            </div>
          </form>
        </>
      ) : null}
    </section>
  );
}

function PreparePhase({
  applicationId,
  scorecardVersionId,
  criteria,
  evidenceByCriterion,
  guideByCriterion,
  guideNote,
  guideAction,
  guidePending,
  guideMessage,
  onStart,
}: {
  applicationId: string;
  scorecardVersionId: string;
  criteria: CriterionRecord[];
  evidenceByCriterion: Map<string, EvidenceItemRecord[]>;
  guideByCriterion: Map<string, InterviewGuideCriterion>;
  guideNote: string | null;
  guideAction: (formData: FormData) => void;
  guidePending: boolean;
  guideMessage: string | null;
  onStart: () => void;
}) {
  const hasGuide = guideByCriterion.size > 0;
  // Highest-priority criteria first, so the interviewer opens on what matters.
  const ordered = hasGuide
    ? [...criteria].sort((left, right) => {
        const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
        const leftRank = rank[guideByCriterion.get(left.id)?.probe_priority ?? "LOW"];
        const rightRank = rank[guideByCriterion.get(right.id)?.probe_priority ?? "LOW"];
        return leftRank - rightRank;
      })
    : criteria;

  return (
    <div className="prepare-phase">
      <div className="assessment-launcher">
        <form action={guideAction}>
          <input type="hidden" name="applicationId" value={applicationId} />
          <input type="hidden" name="scorecardVersionId" value={scorecardVersionId} />
          <div className="assessment-launcher-copy">
            <strong>지원서를 읽고 확인할 항목 고르기</strong>
            <span>제출 자료가 확인해 주지 못한 기준을 골라, 무엇을 물어볼지 제안합니다.</span>
          </div>
          <button className="button button-primary" type="submit" disabled={guidePending}>
            {guidePending ? "질문지 만드는 중…" : hasGuide ? "다시 만들기" : "질문지 만들기"}
          </button>
        </form>
        {guideMessage ? (
          <p className="form-alert form-alert-error" role="alert">
            {guideMessage}
          </p>
        ) : null}
      </div>

      {guideNote ? <p className="guide-opening">{guideNote}</p> : null}

      <div className="prepare-list">
        {ordered.map((criterion) => {
          const guide = guideByCriterion.get(criterion.id);
          const items = evidenceByCriterion.get(criterion.id) ?? [];
          const status = items[0]?.status ?? "PENDING";
          const priority = guide ? PRIORITY_LABELS[guide.probe_priority] : null;
          return (
            <article
              className={`prepare-card${priority ? ` ${priority.tone}` : ""}`}
              key={criterion.id}
            >
              <div className="section-heading-inline">
                <div>
                  <span className="version-label">{criterionTypeLabel(criterion.type)}</span>
                  <h3>{criterion.name}</h3>
                </div>
                {priority ? (
                  <span className={`priority-chip ${priority.tone}`}>{priority.label}</span>
                ) : null}
              </div>

              <p className="evidence-line">
                <span className={`evidence-status evidence-${status.toLowerCase()}`}>
                  {evidenceLabel(status)}
                </span>
              </p>

              {guide ? (
                <>
                  <p className="guide-rationale">{guide.rationale}</p>
                  <ol className="guide-questions">
                    {guide.questions.map((question) => (
                      <li key={question.question}>
                        <strong>{question.question}</strong>
                        <span>확인할 점 — {question.listen_for}</span>
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <p className="section-copy">{criterion.definition}</p>
              )}
            </article>
          );
        })}
      </div>

      <button className="button button-primary button-wide" type="button" onClick={onStart}>
        면접 시작하기
      </button>
    </div>
  );
}

function RecordPhase({
  speech,
  criteria,
  guideByCriterion,
  onFinish,
}: {
  speech: ReturnType<typeof useSpeechTranscript>;
  criteria: CriterionRecord[];
  guideByCriterion: Map<string, InterviewGuideCriterion>;
  onFinish: () => void;
}) {
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Keep the newest words in view without stealing focus from the page.
  useEffect(() => {
    const node = transcriptRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [speech.transcript, speech.interim]);

  return (
    <div className="record-phase">
      <div className={`recorder${speech.isRecording ? " is-recording" : ""}`}>
        <button
          type="button"
          className="recorder-button"
          onClick={() => (speech.isRecording ? speech.stop() : speech.start())}
          disabled={!speech.isSupported}
          aria-label={speech.isRecording ? "받아쓰기 멈추기" : "받아쓰기 시작"}
        >
          <span className="recorder-dot" aria-hidden="true" />
          {speech.isRecording ? "멈추기" : "받아쓰기 시작"}
        </button>
        <div className="recorder-meta">
          <strong className="recorder-timer">{formatDuration(speech.elapsedSeconds)}</strong>
          <span>
            {!speech.isSupported
              ? "이 브라우저는 음성 인식을 지원하지 않습니다. 아래에 직접 입력하세요."
              : speech.isRecording
                ? "듣고 있습니다"
                : speech.transcript
                  ? "멈춤 · 이어서 받아쓸 수 있습니다"
                  : "마이크를 켜면 대화가 글로 남습니다"}
          </span>
        </div>
        {speech.transcript || speech.interim ? (
          <button type="button" className="button button-quiet" onClick={speech.reset}>
            지우고 다시
          </button>
        ) : null}
      </div>

      {speech.error ? (
        <p className="form-alert form-alert-error" role="alert">
          {speech.error}
        </p>
      ) : null}

      <div className="record-columns">
        <div className="record-transcript">
          <div className="section-heading-inline">
            <strong>받아쓴 내용</strong>
            <span className="count-label">
              {speech.transcript.trim().length.toLocaleString("ko-KR")}자
            </span>
          </div>
          <div className="transcript-live" ref={transcriptRef} aria-live="polite">
            {speech.transcript || speech.interim ? (
              <p>
                {speech.transcript}
                {speech.interim ? <em className="transcript-interim">{speech.interim}</em> : null}
              </p>
            ) : (
              <p className="empty-copy">아직 받아쓴 내용이 없습니다.</p>
            )}
          </div>
          <details className="transcript-editor">
            <summary>직접 고치기</summary>
            <textarea
              aria-label="받아쓴 내용 직접 수정"
              value={speech.transcript}
              onChange={(event) => speech.setTranscript(event.target.value)}
              placeholder="음성 인식이 어려운 환경이면 여기에 대화 내용을 직접 적어도 됩니다."
            />
          </details>
        </div>

        <aside className="record-checklist" aria-label="확인할 항목">
          <strong>확인할 항목</strong>
          <ul>
            {criteria.map((criterion) => {
              const guide = guideByCriterion.get(criterion.id);
              const priority = guide ? PRIORITY_LABELS[guide.probe_priority] : null;
              return (
                <li key={criterion.id}>
                  <span className="checklist-name">{criterion.name}</span>
                  {priority ? (
                    <span className={`priority-chip ${priority.tone}`}>{priority.label}</span>
                  ) : null}
                  {guide?.questions[0] ? (
                    <span className="checklist-question">{guide.questions[0].question}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </aside>
      </div>

      <button className="button button-primary button-wide" type="button" onClick={onFinish}>
        면접 끝내고 결과 정리하기
      </button>
    </div>
  );
}

function CriterionStep({
  criterion,
  value,
  draft,
  items,
  pageById,
  guide,
  disabled,
  onChange,
}: {
  criterion: CriterionRecord;
  value: ObservationValue;
  draft: DraftValue | null;
  items: EvidenceItemRecord[];
  pageById: Map<string, ResumePageRecord>;
  guide: InterviewGuideCriterion | null;
  disabled: boolean;
  onChange: (patch: Partial<ObservationValue>) => void;
}) {
  const status = items[0]?.status ?? "PENDING";
  const quoted = items.filter((item) => item.exact_quote);
  const awaitingConfirmation = value.source === "TRANSCRIPT" && value.aiDraftAccepted === false;

  return (
    <article className="criterion-step">
      <header className="criterion-step-header">
        <div>
          <span className="version-label">{criterionTypeLabel(criterion.type)}</span>
          <h3>{criterion.name}</h3>
        </div>
        <span className={`evidence-status evidence-${status.toLowerCase()}`}>
          {evidenceLabel(status)}
        </span>
      </header>
      <p className="section-copy">{criterion.definition}</p>

      <div className="criterion-step-columns">
        <section className="criterion-source" aria-label="지원서에 있던 내용">
          <strong>지원서에 있던 내용</strong>
          {quoted.length > 0 ? (
            quoted.map((item) => {
              const page = item.resume_page_id ? pageById.get(item.resume_page_id) : null;
              return (
                <blockquote key={item.id}>
                  “{item.exact_quote}”
                  {page ? (
                    <a href={`#source-page-${page.page_number}`}>원문 {page.page_number}쪽</a>
                  ) : null}
                </blockquote>
              );
            })
          ) : (
            <p className="careful-absence">
              제출 자료에서 이 기준을 뒷받침하는 내용을 찾지 못했습니다. 지원자에게 해당 경험이
              없다는 뜻은 아닙니다.
            </p>
          )}
          {guide?.questions[0] ? (
            <p className="criterion-suggested-question">
              물어볼 질문 — {guide.questions[0].question}
            </p>
          ) : null}
        </section>

        {draft ? (
          <section
            className={`criterion-draft${awaitingConfirmation ? " is-unconfirmed" : " is-confirmed"}`}
            aria-label="받아쓴 내용 기반 초안"
          >
            <div className="section-heading-inline">
              <strong>받아쓴 내용으로 만든 초안</strong>
              <span className="draft-state">{awaitingConfirmation ? "확인 대기" : "확인함"}</span>
            </div>
            <p className="draft-verdict">
              {VERDICT_OPTIONS.find((option) => option.value === draft.verdict)?.label ??
                draft.verdict}
              {draft.weaknessType
                ? ` · ${WEAKNESS_OPTIONS.find((option) => option.value === draft.weaknessType)?.label ?? ""}`
                : ""}
            </p>
            <p className="draft-rationale">{draft.rationale}</p>
            {draft.transcriptQuote ? (
              <blockquote className="draft-quote">“{draft.transcriptQuote}”</blockquote>
            ) : null}
            {awaitingConfirmation ? (
              <div className="button-row">
                <button
                  type="button"
                  className="button button-primary"
                  disabled={disabled}
                  onClick={() =>
                    onChange({
                      verdict: draft.verdict,
                      weaknessType: draft.weaknessType,
                      aiDraftAccepted: true,
                    })
                  }
                >
                  이 초안이 맞습니다
                </button>
                <button
                  type="button"
                  className="button button-quiet"
                  disabled={disabled}
                  onClick={() =>
                    onChange({
                      verdict: "",
                      weaknessType: null,
                      source: "FORM",
                      aiDraftAccepted: null,
                    })
                  }
                >
                  직접 고르겠습니다
                </button>
              </div>
            ) : (
              <p className="draft-confirmed-copy">
                확인하셨습니다. 아래에서 언제든 바꿀 수 있습니다.
              </p>
            )}
          </section>
        ) : null}
      </div>

      <SegmentedControl
        legend="면접에서 확인한 결과"
        options={VERDICT_OPTIONS}
        value={value.verdict}
        disabled={disabled}
        columns={4}
        onChange={(verdict) =>
          onChange({
            verdict,
            weaknessType: verdict === "WEAKER" ? value.weaknessType : null,
            // Choosing by hand after a draft means the interviewer overrode it;
            // record that as an accepted-by-edit transcript observation rather
            // than pretending the draft never existed.
            aiDraftAccepted: value.source === "TRANSCRIPT" ? true : null,
          })
        }
      />

      {value.verdict === "WEAKER" ? (
        <SegmentedControl
          legend="어떤 점이 달랐습니까?"
          options={WEAKNESS_OPTIONS}
          value={value.weaknessType ?? ""}
          disabled={disabled}
          columns={3}
          onChange={(weaknessType) =>
            onChange({
              weaknessType,
              aiDraftAccepted: value.source === "TRANSCRIPT" ? true : null,
            })
          }
        />
      ) : null}

      {value.verdict === "WEAKER" && value.weaknessType === "LEVEL_INSUFFICIENT" ? (
        <p className="calibration-hint" role="status">
          이 선택은 기준 자체가 느슨한지 판단하는 데 쓰입니다. 같은 기준에서 반복되면 기준 수정을
          제안합니다.
        </p>
      ) : null}

      <div className="field">
        <label htmlFor={`note-${criterion.id}`}>관찰 메모 (선택)</label>
        <textarea
          id={`note-${criterion.id}`}
          maxLength={1000}
          value={value.note}
          disabled={disabled}
          placeholder="면접에서 실제로 들은 내용을 간단히 남겨 주세요."
          onChange={(event) => onChange({ note: event.target.value })}
        />
      </div>
    </article>
  );
}
