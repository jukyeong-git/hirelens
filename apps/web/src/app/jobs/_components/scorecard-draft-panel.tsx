"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  AppRole,
  CriterionType,
  ScorecardCriterion,
  ScorecardDetail,
  ScorecardDraft,
  ScorecardWorkspace,
} from "@hirelens/domain";

import {
  initialScorecardActionState,
  initialScorecardDraftGenerationActionState,
} from "../action-state";
import {
  generateScorecardDraftAction,
  saveScorecardDraftAction,
  updateScorecardDraftAction,
} from "../actions";
import { AmbiguityReviewForm } from "./ambiguity-review-form";
import { ScorecardApprovalForm } from "./scorecard-approval-form";
import { visibleCopy } from "../../_components/visible-copy";

interface ScorecardDraftPanelProps {
  jobId: string;
  viewerRole: AppRole;
  isAssignedHiringManager: boolean;
  workspace: ScorecardWorkspace;
}

const criterionTypeLabels = {
  REQUIRED: "필수",
  PREFERRED: "우대",
  INTERVIEW_ONLY: "면접 확인",
} as const;
const ambiguityStatusLabels = {
  CLEAR: "모호성 없음",
  AMBIGUOUS: "검토 필요",
  HUMAN_ONLY: "면접에서 확인",
} as const;

export function ScorecardDraftPanel({
  jobId,
  viewerRole,
  isAssignedHiringManager,
  workspace,
}: ScorecardDraftPanelProps) {
  const canEdit = viewerRole === "ADMIN" || isAssignedHiringManager;
  const canApprove = viewerRole === "ADMIN" || isAssignedHiringManager;
  const workingVersion = workspace.latestWorkingVersion;
  const approvedVersion = workspace.activeApprovedVersion;
  const displayedVersion = workingVersion ?? approvedVersion;
  const [isEditing, setIsEditing] = useState(false);

  if (!displayedVersion) {
    return (
      <section className="panel" aria-labelledby="scorecard-title">
        <div className="section-heading">
          <h2 id="scorecard-title">지원서 검토 기준</h2>
        </div>
        {canEdit ? (
          <ReviewFrameworkDraftEditor jobId={jobId} />
        ) : (
          <p className="info-banner" role="status">
            검토 기준 초안 요청은 배정된 채용 책임자 또는 관리자가 수행합니다.
          </p>
        )}
      </section>
    );
  }

  const unresolvedCount = displayedVersion.criteria.filter(
    (criterion) => criterion.ambiguity_status === "AMBIGUOUS",
  ).length;
  const isDraft = displayedVersion.version.status === "DRAFT";
  const isHumanAuthored = displayedVersion.version.model_id === "HUMAN_AUTHORED";
  const approver = workspace.versionHistory.find(
    (version) => version.id === displayedVersion.version.id,
  )?.approver;

  return (
    <>
      <section className="panel" aria-labelledby="scorecard-title">
        <div className="section-heading section-heading-inline">
          <div>
            <h2 id="scorecard-title">지원서 검토 기준 {isDraft ? "초안" : "승인본"}</h2>
          </div>
          <div className="section-heading-actions">
            {isDraft && canEdit && !isEditing ? (
              <button
                className="button button-quiet"
                type="button"
                onClick={() => setIsEditing(true)}
              >
                수정
              </button>
            ) : null}
            <span
              className={`status-chip ${scorecardStatusClass(displayedVersion.version.status)}`}
            >
              {scorecardStatusLabel(displayedVersion.version.status)}
            </span>
          </div>
        </div>

        {isDraft ? (
          isHumanAuthored ? (
            <div className="draft-warning" role="note">
              <strong>사람이 작성한 초안을 검토 중입니다.</strong> 명시적 승인이 완료되기 전에는 이
              버전을 이력서 분석에 사용할 수 없습니다.
            </div>
          ) : (
            <div className="draft-warning" role="note">
              <strong>AI가 제안한 초안을 사람이 검토 중입니다.</strong> 명시적 승인이 완료되기
              전에는 이 버전을 이력서 분석에 사용할 수 없습니다.
            </div>
          )
        ) : (
          <div className="approved-banner" role="status">
            <strong>사람이 승인한 활성 버전입니다.</strong>
            <span>
              승인자 {visibleCopy(approver?.display_name ?? "확인 가능한 사용자")} ·{" "}
              {formatDate(displayedVersion.version.approved_at)}
            </span>
          </div>
        )}

        {isDraft && isEditing ? (
          <SavedReviewFrameworkEditor
            jobId={jobId}
            scorecard={displayedVersion}
            onCancel={() => setIsEditing(false)}
          />
        ) : (
          <>
            <AmbiguitySection
              jobId={jobId}
              canReview={canApprove && isDraft}
              isDraft={isDraft}
              scorecard={displayedVersion}
              unresolvedCount={unresolvedCount}
            />
            <CriteriaSection scorecard={displayedVersion} />
          </>
        )}

        {!isEditing && isDraft ? (
          <section
            className="subsection scorecard-workflow"
            aria-labelledby="scorecard-workflow-title"
          >
            <div className="section-heading">
              <h3 id="scorecard-workflow-title">승인 및 버전 관리</h3>
            </div>
            {isDraft ? (
              canApprove ? (
                <ScorecardApprovalForm
                  jobId={jobId}
                  version={displayedVersion.version}
                  unresolvedCount={unresolvedCount}
                />
              ) : (
                <p className="info-banner" role="status">
                  채용 담당자는 검토 기준을 읽을 수 있지만 승인할 수 없습니다. 담당 채용 책임자 또는
                  관리자가 사유를 남기고 승인합니다.
                </p>
              )
            ) : null}
          </section>
        ) : null}
      </section>
    </>
  );
}

function SavedReviewFrameworkEditor({
  jobId,
  scorecard,
  onCancel,
}: {
  jobId: string;
  scorecard: ScorecardDetail;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    updateScorecardDraftAction,
    initialScorecardActionState,
  );
  const [draft, setDraft] = useState<ScorecardDraft>(() => scorecardToDraft(scorecard));

  useEffect(() => {
    if (state.status === "success") {
      onCancel();
      router.refresh();
    }
  }, [onCancel, router, state.status]);

  return (
    <form action={action} className="scorecard-workflow-form review-framework-draft-form">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="scorecardVersionId" value={scorecard.version.id} />
      <input type="hidden" name="expectedVersionNumber" value={scorecard.version.version_number} />
      <input type="hidden" name="expectedStatus" value="DRAFT" />
      <input
        type="hidden"
        name="expectedContentRevision"
        value={scorecard.version.content_revision}
      />
      <input type="hidden" name="draftJson" value={JSON.stringify(normalizeDraft(draft))} />
      <label>
        수정 사유
        <textarea name="reason" required maxLength={1000} />
      </label>
      <CriteriaEditor
        draft={draft}
        disabled={pending}
        onChange={setDraft}
        submitLabel="변경 저장"
        pendingLabel="변경 저장 중…"
        onCancel={onCancel}
      />
      {state.status === "error" ? <ActionAlert message={visibleCopy(state.message)} /> : null}
    </form>
  );
}

type DraftOrigin = "manual" | "ai";

function ReviewFrameworkDraftEditor({ jobId }: { jobId: string }) {
  const [generationState, generateAction, generating] = useActionState(
    generateScorecardDraftAction,
    initialScorecardDraftGenerationActionState,
  );
  const [saveState, saveAction, saving] = useActionState(
    saveScorecardDraftAction,
    initialScorecardActionState,
  );
  const [draft, setDraft] = useState<ScorecardDraft | null>(null);
  const [origin, setOrigin] = useState<DraftOrigin>("manual");

  useEffect(() => {
    if (generationState.status === "success" && generationState.draft) {
      setDraft(normalizeDraft(generationState.draft));
      setOrigin("ai");
    }
  }, [generationState.draft, generationState.status]);

  const openManualDraft = () => {
    setDraft(createBlankDraft());
    setOrigin("manual");
  };

  return (
    <div className="review-framework-editor">
      {!draft ? (
        <>
          <div className="review-framework-start-actions" aria-label="검토 기준 초안 시작 방법">
            <button className="button button-quiet" type="button" onClick={openManualDraft}>
              직접 작성
            </button>
            <form action={generateAction}>
              <input type="hidden" name="jobId" value={jobId} />
              <button className="button button-primary" type="submit" disabled={generating}>
                {generating ? "AI 초안 생성 중…" : "AI 초안"}
              </button>
            </form>
          </div>
          {generationState.status === "error" ? (
            <ActionAlert message={visibleCopy(generationState.message)} />
          ) : null}
        </>
      ) : (
        <form action={saveAction} className="scorecard-workflow-form review-framework-draft-form">
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="draftJson" value={JSON.stringify(normalizeDraft(draft))} />
          {origin === "ai" && generationState.aiDraftToken ? (
            <input type="hidden" name="aiDraftToken" value={generationState.aiDraftToken} />
          ) : null}
          {origin === "ai" ? (
            <div className="draft-origin-banner draft-origin-ai" role="status">
              <strong>AI가 제안한 초안</strong>
              <span>내용을 검토·수정한 뒤 직접 저장하세요.</span>
            </div>
          ) : (
            <div className="draft-origin-banner draft-origin-manual" role="status">
              <strong>직접 작성하는 초안</strong>
              <span>입력한 기준만 초안으로 저장됩니다.</span>
            </div>
          )}
          <CriteriaEditor draft={draft} disabled={saving} onChange={setDraft} />
          {saveState.status === "error" ? (
            <ActionAlert message={visibleCopy(saveState.message)} />
          ) : null}
        </form>
      )}
    </div>
  );
}

function CriteriaEditor({
  draft,
  disabled,
  onChange,
  submitLabel = "초안 저장",
  pendingLabel = "초안 저장 중…",
  onCancel,
}: {
  draft: ScorecardDraft;
  disabled: boolean;
  onChange: (draft: ScorecardDraft) => void;
  submitLabel?: string;
  pendingLabel?: string;
  onCancel?: () => void;
}) {
  const [openCriterionIds, setOpenCriterionIds] = useState<Set<string>>(
    () => new Set(draft.criteria.slice(0, 1).map((criterion) => criterion.client_id)),
  );
  const updateCriterion = (
    index: number,
    update: (criterion: ScorecardCriterion) => ScorecardCriterion,
  ) => {
    onChange(
      normalizeDraft({
        ...draft,
        criteria: draft.criteria.map((criterion, itemIndex) =>
          itemIndex === index ? update(criterion) : criterion,
        ),
      }),
    );
  };
  const removeCriterion = (index: number) => {
    const removedId = draft.criteria[index]?.client_id;
    if (removedId) {
      setOpenCriterionIds((current) => {
        const next = new Set(current);
        next.delete(removedId);
        return next;
      });
    }
    onChange(
      normalizeDraft({
        ...draft,
        criteria: draft.criteria.filter((_, itemIndex) => itemIndex !== index),
      }),
    );
  };
  const moveCriterion = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draft.criteria.length) return;
    const criteria = [...draft.criteria];
    [criteria[index], criteria[target]] = [criteria[target]!, criteria[index]!];
    onChange(normalizeDraft({ ...draft, criteria }));
  };
  const addCriterion = () => {
    const criterion = createBlankCriterion();
    setOpenCriterionIds((current) => new Set([...current, criterion.client_id]));
    onChange(normalizeDraft({ ...draft, criteria: [...draft.criteria, criterion] }));
  };
  const setCriterionOpen = (criterionId: string, open: boolean) => {
    setOpenCriterionIds((current) => {
      const next = new Set(current);
      if (open) next.add(criterionId);
      else next.delete(criterionId);
      return next;
    });
  };

  return (
    <fieldset className="criteria-editor" disabled={disabled}>
      <legend className="sr-only">검토 기준 편집</legend>
      <div className="criteria-list">
        {draft.criteria.length === 0 ? (
          <p className="info-banner" role="status">
            입력된 기준이 없습니다. 기준을 추가해 작성하세요.
          </p>
        ) : null}
        {draft.criteria.map((criterion, index) => (
          <details
            className="criterion-card criterion-editor-card"
            key={criterion.client_id}
            open={openCriterionIds.has(criterion.client_id)}
            onToggle={(event) => setCriterionOpen(criterion.client_id, event.currentTarget.open)}
          >
            <summary className="criterion-editor-summary">
              <span className="criterion-order">기준 {index + 1}</span>
              <strong>{criterion.name.trim() || "기준명 미입력"}</strong>
              <span className="criterion-summary-status">
                <span className="status-chip status-draft">
                  {criterionTypeLabels[criterion.type]}
                </span>
                <span className="criterion-resume-status">
                  {criterion.resume_assessable ? "이력서 확인 가능" : "이력서 확인 불가"}
                </span>
              </span>
            </summary>
            <div className="criterion-editor-body">
              <div className="criterion-card-actions" aria-label={`기준 ${index + 1} 순서 및 삭제`}>
                <button
                  type="button"
                  className="button button-quiet button-compact"
                  onClick={() => moveCriterion(index, -1)}
                  disabled={index === 0}
                  aria-label={`기준 ${index + 1} 위로 이동`}
                  title="위로 이동"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="button button-quiet button-compact"
                  onClick={() => moveCriterion(index, 1)}
                  disabled={index === draft.criteria.length - 1}
                  aria-label={`기준 ${index + 1} 아래로 이동`}
                  title="아래로 이동"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="button button-quiet button-compact"
                  onClick={() => removeCriterion(index)}
                  aria-label={`기준 ${index + 1} 삭제`}
                >
                  삭제
                </button>
              </div>
              <div className="form-grid-two">
                <label>
                  기준명
                  <input
                    value={criterion.name}
                    onChange={(event) =>
                      updateCriterion(index, (item) => ({ ...item, name: event.target.value }))
                    }
                  />
                </label>
                <label>
                  중요도
                  <select
                    value={criterion.type}
                    onChange={(event) =>
                      updateCriterion(index, (item) =>
                        updateCriterionType(item, event.target.value as CriterionType),
                      )
                    }
                  >
                    <option value="REQUIRED">필수</option>
                    <option value="PREFERRED">우대</option>
                    <option value="INTERVIEW_ONLY">면접 확인</option>
                  </select>
                </label>
              </div>
              <label>
                판단 기준
                <textarea
                  value={criterion.definition}
                  onChange={(event) =>
                    updateCriterion(index, (item) => ({ ...item, definition: event.target.value }))
                  }
                />
              </label>
              <label>
                확인 방법
                <select
                  value={criterion.resume_assessable ? "RESUME" : "INTERVIEW"}
                  disabled={criterion.type === "INTERVIEW_ONLY"}
                  onChange={(event) =>
                    updateCriterion(index, (item) => ({
                      ...item,
                      resume_assessable: event.target.value === "RESUME",
                    }))
                  }
                >
                  <option value="RESUME">이력서에서 확인</option>
                  <option value="INTERVIEW">면접에서 확인</option>
                </select>
              </label>
              <ListTextArea
                label="인정 근거"
                value={criterion.accepted_evidence}
                onChange={(accepted_evidence) =>
                  updateCriterion(index, (item) => ({ ...item, accepted_evidence }))
                }
              />
              <ListTextArea
                label="대체 인정 근거"
                value={criterion.alternative_evidence}
                onChange={(alternative_evidence) =>
                  updateCriterion(index, (item) => ({ ...item, alternative_evidence }))
                }
              />
              <label>
                부분 근거 판단
                <textarea
                  value={criterion.partial_evidence_guidance ?? ""}
                  onChange={(event) =>
                    updateCriterion(index, (item) => ({
                      ...item,
                      partial_evidence_guidance: emptyToNull(event.target.value),
                    }))
                  }
                />
              </label>
              <fieldset className="evidence-fields-editor">
                <legend>AI가 확인할 정보</legend>
                <p className="form-help">
                  이력서 분석 시 AI가 찾아야 할 정보의 이름과 확인 내용을 입력하세요.
                </p>
                {criterion.evidence_fields.length === 0 ? (
                  <p className="evidence-fields-empty">아직 추가한 분석 입력이 없습니다.</p>
                ) : null}
                {criterion.evidence_fields.map((field, fieldIndex) => (
                  <div
                    className="evidence-field-row"
                    key={`${criterion.client_id}-field-${fieldIndex}`}
                  >
                    <label>
                      필드명
                      <input
                        value={field.field_name}
                        onChange={(event) =>
                          updateCriterion(index, (item) => ({
                            ...item,
                            evidence_fields: item.evidence_fields.map((current, currentIndex) =>
                              currentIndex === fieldIndex
                                ? { ...current, field_name: event.target.value }
                                : current,
                            ),
                          }))
                        }
                      />
                    </label>
                    <label>
                      확인 내용
                      <input
                        value={field.description}
                        onChange={(event) =>
                          updateCriterion(index, (item) => ({
                            ...item,
                            evidence_fields: item.evidence_fields.map((current, currentIndex) =>
                              currentIndex === fieldIndex
                                ? { ...current, description: event.target.value }
                                : current,
                            ),
                          }))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="button button-quiet button-compact"
                      onClick={() =>
                        updateCriterion(index, (item) => ({
                          ...item,
                          evidence_fields: item.evidence_fields.filter(
                            (_, currentIndex) => currentIndex !== fieldIndex,
                          ),
                        }))
                      }
                      aria-label={`${field.field_name || `분석 입력 ${fieldIndex + 1}`} 삭제`}
                    >
                      삭제
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() =>
                    updateCriterion(index, (item) => ({
                      ...item,
                      evidence_fields: [
                        ...item.evidence_fields,
                        { field_name: "", description: "" },
                      ],
                    }))
                  }
                >
                  확인 정보 추가
                </button>
              </fieldset>
              <label>
                확인 질문
                <textarea
                  value={criterion.suggested_interview_question ?? ""}
                  onChange={(event) =>
                    updateCriterion(index, (item) => ({
                      ...item,
                      suggested_interview_question: emptyToNull(event.target.value),
                    }))
                  }
                />
              </label>
            </div>
          </details>
        ))}
      </div>
      <div className="scorecard-editor-actions">
        <button type="button" className="button button-quiet" onClick={addCriterion}>
          기준 추가
        </button>
        {onCancel ? (
          <button type="button" className="button button-quiet" onClick={onCancel}>
            취소
          </button>
        ) : null}
        <button className="button button-primary" type="submit" disabled={disabled}>
          {disabled ? pendingLabel : submitLabel}
        </button>
      </div>
    </fieldset>
  );
}

function scorecardToDraft(scorecard: ScorecardDetail): ScorecardDraft {
  return normalizeDraft({
    ambiguous_phrases: scorecard.version.ambiguous_phrases,
    criteria: scorecard.criteria.map((criterion) => ({
      client_id: criterion.client_id,
      name: criterion.name,
      type: criterion.type,
      definition: criterion.definition,
      accepted_evidence: criterion.accepted_evidence,
      alternative_evidence: criterion.alternative_evidence,
      partial_evidence_guidance: criterion.partial_evidence_guidance,
      evidence_fields: criterion.evidence_fields,
      resume_assessable: criterion.resume_assessable,
      source_phrase: criterion.source_phrase,
      ambiguity_note: criterion.ambiguity_note,
      ambiguity_status: criterion.ambiguity_status,
      suggested_interview_question: criterion.suggested_interview_question,
      display_order: criterion.display_order,
    })),
  });
}

function ListTextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <label>
      {label}
      <span className="form-help">줄마다 하나씩 입력하세요.</span>
      <textarea
        value={value.join("\n")}
        onChange={(event) =>
          onChange(
            event.target.value
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean),
          )
        }
      />
    </label>
  );
}

function ActionAlert({ message }: { message?: string }) {
  const stale = message?.includes("이미 검토 기준 초안이 있습니다");
  return (
    <div className="form-alert form-alert-error" role="alert">
      <p>{message ?? "요청을 완료하지 못했습니다. 다시 시도하세요."}</p>
      {stale ? (
        <button
          className="button button-quiet"
          type="button"
          onClick={() => window.location.reload()}
        >
          최신 상태 새로고침
        </button>
      ) : null}
    </div>
  );
}

function updateCriterionType(
  criterion: ScorecardCriterion,
  type: CriterionType,
): ScorecardCriterion {
  return {
    ...criterion,
    type,
    resume_assessable: type === "INTERVIEW_ONLY" ? false : criterion.resume_assessable,
  };
}

function createBlankDraft(): ScorecardDraft {
  return { ambiguous_phrases: [], criteria: [createBlankCriterion()] };
}

function createBlankCriterion(): ScorecardCriterion {
  return {
    client_id: createClientId(),
    name: "",
    type: "REQUIRED",
    definition: "",
    accepted_evidence: [],
    alternative_evidence: [],
    partial_evidence_guidance: null,
    evidence_fields: [],
    resume_assessable: true,
    source_phrase: null,
    ambiguity_note: null,
    ambiguity_status: "CLEAR",
    suggested_interview_question: null,
    display_order: 0,
  };
}

function normalizeDraft(draft: ScorecardDraft): ScorecardDraft {
  return {
    ...draft,
    criteria: draft.criteria.map((criterion, display_order) => ({ ...criterion, display_order })),
  };
}

function emptyToNull(value: string) {
  return value.trim() || null;
}

function createClientId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `criterion-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function AmbiguitySection({
  jobId,
  canReview,
  isDraft,
  scorecard,
  unresolvedCount,
}: {
  jobId: string;
  canReview: boolean;
  isDraft: boolean;
  scorecard: ScorecardDetail;
  unresolvedCount: number;
}) {
  return (
    <section className="subsection" aria-labelledby="ambiguous-phrases-title">
      <div className="section-heading section-heading-inline">
        <div>
          <h3 id="ambiguous-phrases-title">모호한 표현 검토</h3>
        </div>
        <span className="count-label">{unresolvedCount}개 미해결</span>
      </div>
      {scorecard.version.ambiguous_phrases.length > 0 ? (
        <ul className="ambiguity-list">
          {scorecard.version.ambiguous_phrases.map((phrase) => {
            const criterion = scorecard.criteria.find(
              (item) => item.source_phrase === phrase.source_phrase,
            );
            const currentStatus = criterion?.ambiguity_status ?? phrase.ambiguity_status;
            return (
              <li key={`${phrase.source_phrase}-${phrase.ambiguity_note}`}>
                <div className="ambiguity-item-heading">
                  <strong>“{phrase.source_phrase ?? "모호한 표현"}”</strong>
                  <span className="status-chip status-scorecard_pending_approval">
                    {ambiguityStatusLabels[currentStatus]}
                  </span>
                </div>
                <span>{phrase.ambiguity_note ?? "추가 검토가 필요한 표현입니다."}</span>
                {phrase.suggested_interview_question ? (
                  <p className="ambiguity-question">
                    <strong>AI 제안 질문</strong> {phrase.suggested_interview_question}
                  </p>
                ) : null}
                {criterion ? (
                  <div className="ambiguity-linked-criterion">
                    <div>
                      <span className="eyebrow">연결된 평가 기준</span>
                      <strong>{criterion.name}</strong>
                      <p>{criterion.definition}</p>
                    </div>
                    {canReview ? (
                      <AmbiguityReviewForm
                        jobId={jobId}
                        scorecardVersionId={scorecard.version.id}
                        criterion={criterion}
                      />
                    ) : isDraft ? (
                      <p className="info-banner" role="status">
                        이 표현은 담당 채용 책임자 또는 관리자가 검토할 수 있습니다.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="info-banner" role="status">
                    연결된 평가 기준을 찾지 못했습니다. 승인 전에 사람의 확인이 필요합니다.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="info-banner" role="status">
          AI가 별도 검토가 필요한 표현을 찾지 못했습니다. 기준은 여전히 사람의 승인 대상입니다.
        </p>
      )}
    </section>
  );
}

function CriteriaSection({ scorecard }: { scorecard: ScorecardDetail }) {
  return (
    <section className="subsection" aria-labelledby="criteria-title">
      <div className="section-heading section-heading-inline">
        <div>
          <h3 id="criteria-title">평가 기준</h3>
        </div>
        <span className="count-label">{scorecard.criteria.length}개</span>
      </div>
      <div className="criteria-list">
        {scorecard.criteria.map((criterion) => (
          <article className="criterion-card" key={criterion.id}>
            <div className="criterion-heading">
              <h4>{criterion.name}</h4>
              <span className="status-chip status-draft">
                {criterionTypeLabels[criterion.type]}
              </span>
            </div>
            <p>{criterion.definition}</p>
            <dl className="criterion-meta">
              <div>
                <dt>이력서 평가</dt>
                <dd>{criterion.resume_assessable ? "가능" : "불가 · 면접에서 확인"}</dd>
              </div>
              <div>
                <dt>모호성</dt>
                <dd>{ambiguityStatusLabels[criterion.ambiguity_status]}</dd>
              </div>
            </dl>
            <div className="evidence-copy">
              <strong>인정 근거</strong>
              <ul>
                {criterion.accepted_evidence.length > 0 ? (
                  criterion.accepted_evidence.map((evidence) => <li key={evidence}>{evidence}</li>)
                ) : (
                  <li>이력서 근거 없음 · 면접에서 확인</li>
                )}
              </ul>
            </div>
            {criterion.alternative_evidence.length > 0 ? (
              <div className="evidence-copy">
                <strong>대체 인정 근거</strong>
                <ul>
                  {criterion.alternative_evidence.map((evidence) => (
                    <li key={evidence}>{evidence}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {criterion.partial_evidence_guidance ? (
              <div className="evidence-copy">
                <strong>부분 근거 판단</strong>
                <p>{criterion.partial_evidence_guidance}</p>
              </div>
            ) : null}
            {criterion.evidence_fields.length > 0 ? (
              <div className="evidence-copy">
                <strong>AI 확인 정보</strong>
                <ul>
                  {criterion.evidence_fields.map((field) => (
                    <li key={`${field.field_name}-${field.description}`}>
                      <strong>{field.field_name}</strong>: {field.description}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function scorecardStatusLabel(status: string) {
  return (
    { DRAFT: "초안", PENDING_APPROVAL: "승인 대기", APPROVED: "승인됨", SUPERSEDED: "이전 승인본" }[
      status
    ] ?? status
  );
}
function scorecardStatusClass(status: string) {
  return status === "APPROVED"
    ? "status-ready_for_intake"
    : status === "SUPERSEDED"
      ? "status-archived"
      : status === "PENDING_APPROVAL"
        ? "status-scorecard_pending_approval"
        : "status-draft";
}
function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
      )
    : "시각 미기록";
}
