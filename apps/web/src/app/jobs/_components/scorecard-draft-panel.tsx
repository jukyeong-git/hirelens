"use client";

import { useActionState, useEffect, useState } from "react";

import type {
  AppRole,
  CriterionType,
  ScorecardCriterion,
  ScorecardDetail,
  ScorecardDraft,
  ScorecardVersionHistoryRecord,
  ScorecardWorkspace,
} from "@hirelens/domain";

import {
  initialScorecardActionState,
  initialScorecardDraftGenerationActionState,
} from "../action-state";
import { generateScorecardDraftAction, saveScorecardDraftAction } from "../actions";
import { AmbiguityReviewForm } from "./ambiguity-review-form";
import { ScorecardApprovalForm, ScorecardRevisionForm } from "./scorecard-approval-form";
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
  INTERVIEW_ONLY: "면접 전용",
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

  if (!displayedVersion) {
    return (
      <section className="panel" aria-labelledby="scorecard-title">
        <div className="section-heading">
          <p className="eyebrow">Application review criteria draft</p>
          <h2 id="scorecard-title">아직 지원서 검토 기준 초안이 없습니다.</h2>
        </div>
        <p className="section-copy">
          직무 설명을 기준으로 AI가 검토 기준 초안을 제안합니다. 결과는 초안으로만 저장되며, 사람의
          검토와 승인 전에는 이력서 분석에 사용할 수 없습니다.
        </p>
        {canEdit ? (
          <ReviewFrameworkDraftEditor jobId={jobId} />
        ) : (
          <p className="info-banner" role="status">
            검토 기준 초안 요청은 배정된 Hiring Manager 또는 Admin이 수행합니다.
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
      {workingVersion && approvedVersion ? (
        <section className="panel active-version-summary" aria-labelledby="active-scorecard-title">
          <div>
            <p className="eyebrow">Active approved review criteria</p>
            <h2 id="active-scorecard-title">
              v{approvedVersion.version.version_number} 승인본 사용 중
            </h2>
            <p>
              새 초안 v{workingVersion.version.version_number}을 검토하는 동안 기존 승인본은 계속
              유효합니다.
            </p>
          </div>
          <span className="status-chip status-ready_for_intake">분석 사용 가능</span>
        </section>
      ) : null}

      <section className="panel" aria-labelledby="scorecard-title">
        <div className="section-heading section-heading-inline">
          <div>
            <p className="eyebrow">
              {isDraft
                ? isHumanAuthored
                  ? "검토 기준 초안 · 사람 작성"
                  : "검토 기준 초안 · AI 제안 + 사람 검토"
                : "사람이 승인한 검토 기준"}
            </p>
            <h2 id="scorecard-title">
              지원서 검토 기준 {isDraft ? "초안" : "승인본"} v
              {displayedVersion.version.version_number}
            </h2>
          </div>
          <span className={`status-chip ${scorecardStatusClass(displayedVersion.version.status)}`}>
            {scorecardStatusLabel(displayedVersion.version.status)}
          </span>
        </div>

        <ScorecardMetadata scorecard={displayedVersion} />
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

        <AmbiguitySection
          jobId={jobId}
          canReview={canApprove && isDraft}
          isDraft={isDraft}
          scorecard={displayedVersion}
          unresolvedCount={unresolvedCount}
        />
        <CriteriaSection scorecard={displayedVersion} />

        <section
          className="subsection scorecard-workflow"
          aria-labelledby="scorecard-workflow-title"
        >
          <div className="section-heading">
            <p className="eyebrow">Human review and approval</p>
            <h3 id="scorecard-workflow-title">검토 기준 승인 및 버전 관리</h3>
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
                Recruiter는 검토 기준을 읽을 수 있지만 승인할 수 없습니다. 담당 Hiring Manager 또는
                Admin이 사유를 남기고 승인합니다.
              </p>
            )
          ) : canApprove ? (
            <ScorecardRevisionForm jobId={jobId} version={displayedVersion.version} />
          ) : (
            <p className="info-banner" role="status">
              승인된 검토 기준은 변경할 수 없습니다. 변경이 필요하면 Hiring Manager 또는 Admin이 새
              초안 버전을 생성합니다.
            </p>
          )}
        </section>
      </section>

      <VersionHistory versions={workspace.versionHistory} />
    </>
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
    <div className="subsection" aria-labelledby="review-framework-editor-title">
      <div className="section-heading">
        <p className="eyebrow">Human-controlled draft</p>
        <h3 id="review-framework-editor-title">Review Framework / 지원서 검토 기준</h3>
      </div>
      <p className="section-copy">
        기준은 사람이 직접 검토하고 저장합니다. 저장된 초안도 승인 전에는 지원서 분석에 사용되지
        않습니다.
      </p>

      <div className="form-actions" aria-label="검토 기준 초안 시작 방법">
        <button className="button button-quiet" type="button" onClick={openManualDraft}>
          빈 검토 기준 초안 만들기
        </button>
        <form action={generateAction}>
          <input type="hidden" name="jobId" value={jobId} />
          <button className="button button-primary" type="submit" disabled={generating}>
            {generating ? "AI 제안 생성 중…" : "AI로 검토 기준 제안 받기"}
          </button>
        </form>
      </div>
      <p className="form-help">
        AI는 저장하거나 승인하지 않습니다. 제안이 도착하면 아래 편집기에만 채워집니다.
      </p>

      {generationState.status === "error" ? (
        <ActionAlert message={visibleCopy(generationState.message)} />
      ) : null}
      {generationState.status === "success" ? (
        <p className="form-alert form-alert-success" role="status">
          {visibleCopy(generationState.message)}
        </p>
      ) : null}

      {draft ? (
        <form action={saveAction} className="scorecard-workflow-form">
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="draftJson" value={JSON.stringify(normalizeDraft(draft))} />
          {origin === "ai" && generationState.aiDraftToken ? (
            <input type="hidden" name="aiDraftToken" value={generationState.aiDraftToken} />
          ) : null}
          {origin === "ai" ? (
            <div className="draft-warning" role="note">
              <strong>AI 제안입니다.</strong> 아직 저장되거나 승인되지 않았습니다. 각 기준을 사람이
              검토·수정한 뒤에만 초안을 저장하세요.
            </div>
          ) : (
            <p className="info-banner" role="status">
              사람이 작성한 빈 초안입니다. 필요한 기준을 추가하고 내용을 입력하세요.
            </p>
          )}
          <CriteriaEditor draft={draft} disabled={saving} onChange={setDraft} />
          <button className="button button-primary" type="submit" disabled={saving}>
            {saving ? "검토 기준 초안 저장 중…" : "사람이 검토한 초안 저장"}
          </button>
          <p className="form-help">
            저장은 명시적인 사람의 작업이며 승인이나 분석 시작을 의미하지 않습니다.
          </p>
          {saveState.status === "error" ? (
            <ActionAlert message={visibleCopy(saveState.message)} />
          ) : null}
        </form>
      ) : (
        <p className="info-banner" role="status">
          아직 편집할 초안이 없습니다. 빈 초안을 열거나 AI 제안을 요청하세요.
        </p>
      )}
    </div>
  );
}

function CriteriaEditor({
  draft,
  disabled,
  onChange,
}: {
  draft: ScorecardDraft;
  disabled: boolean;
  onChange: (draft: ScorecardDraft) => void;
}) {
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
  const removeCriterion = (index: number) =>
    onChange(
      normalizeDraft({
        ...draft,
        criteria: draft.criteria.filter((_, itemIndex) => itemIndex !== index),
      }),
    );
  const moveCriterion = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draft.criteria.length) return;
    const criteria = [...draft.criteria];
    [criteria[index], criteria[target]] = [criteria[target]!, criteria[index]!];
    onChange(normalizeDraft({ ...draft, criteria }));
  };

  return (
    <fieldset disabled={disabled}>
      <legend>검토 기준 편집</legend>
      <div className="criteria-list">
        {draft.criteria.map((criterion, index) => (
          <article className="criterion-card" key={criterion.client_id}>
            <div className="criterion-heading">
              <h4>기준 {index + 1}</h4>
              <div className="form-actions">
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => moveCriterion(index, -1)}
                  disabled={index === 0}
                >
                  위로 이동
                </button>
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => moveCriterion(index, 1)}
                  disabled={index === draft.criteria.length - 1}
                >
                  아래로 이동
                </button>
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => removeCriterion(index)}
                >
                  기준 삭제
                </button>
              </div>
            </div>
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
              유형
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
                <option value="INTERVIEW_ONLY">면접 전용</option>
              </select>
            </label>
            <label>
              기준 정의
              <textarea
                value={criterion.definition}
                onChange={(event) =>
                  updateCriterion(index, (item) => ({ ...item, definition: event.target.value }))
                }
              />
            </label>
            <ListTextArea
              label="인정 근거 (줄마다 하나)"
              value={criterion.accepted_evidence}
              onChange={(accepted_evidence) =>
                updateCriterion(index, (item) => ({ ...item, accepted_evidence }))
              }
            />
            <ListTextArea
              label="대체 근거 (줄마다 하나)"
              value={criterion.alternative_evidence}
              onChange={(alternative_evidence) =>
                updateCriterion(index, (item) => ({ ...item, alternative_evidence }))
              }
            />
            <fieldset>
              <legend>근거 필드</legend>
              {criterion.evidence_fields.map((field, fieldIndex) => (
                <div className="form-grid-two" key={`${criterion.client_id}-field-${fieldIndex}`}>
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
                    필드 설명
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
                    className="button button-quiet"
                    onClick={() =>
                      updateCriterion(index, (item) => ({
                        ...item,
                        evidence_fields: item.evidence_fields.filter(
                          (_, currentIndex) => currentIndex !== fieldIndex,
                        ),
                      }))
                    }
                  >
                    근거 필드 삭제
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="button button-quiet"
                onClick={() =>
                  updateCriterion(index, (item) => ({
                    ...item,
                    evidence_fields: [...item.evidence_fields, { field_name: "", description: "" }],
                  }))
                }
              >
                근거 필드 추가
              </button>
            </fieldset>
            <label>
              <input
                type="checkbox"
                checked={criterion.resume_assessable}
                disabled={criterion.type === "INTERVIEW_ONLY"}
                onChange={(event) =>
                  updateCriterion(index, (item) => ({
                    ...item,
                    resume_assessable: event.target.checked,
                  }))
                }
              />
              이력서에서 평가 가능
            </label>
            <label>
              제안 면접 질문
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
          </article>
        ))}
      </div>
      <button
        type="button"
        className="button button-quiet"
        onClick={() =>
          onChange(
            normalizeDraft({ ...draft, criteria: [...draft.criteria, createBlankCriterion()] }),
          )
        }
      >
        기준 추가
      </button>
    </fieldset>
  );
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

function ScorecardMetadata({ scorecard }: { scorecard: ScorecardDetail }) {
  const isHumanAuthored = scorecard.version.model_id === "HUMAN_AUTHORED";
  if (isHumanAuthored) {
    return (
      <div className="metadata-grid" aria-label="검토 기준 작성 메타데이터">
        <div>
          <span>작성 방식</span>
          <strong>수기 입력</strong>
        </div>
        <div>
          <span>검증 계약</span>
          <strong>{scorecard.version.schema_version}</strong>
        </div>
        <div>
          <span>직무 설명 기준</span>
          <strong>{scorecard.version.source_job_description_hash.slice(0, 12)}…</strong>
        </div>
      </div>
    );
  }

  return (
    <div className="metadata-grid" aria-label="검토 기준 계약 메타데이터">
      <div>
        <span>Model</span>
        <strong>{scorecard.version.model_id}</strong>
      </div>
      <div>
        <span>Prompt</span>
        <strong>{scorecard.version.prompt_version}</strong>
      </div>
      <div>
        <span>Schema</span>
        <strong>{scorecard.version.schema_version}</strong>
      </div>
      <div>
        <span>Source hash</span>
        <strong>{scorecard.version.source_job_description_hash.slice(0, 12)}…</strong>
      </div>
    </div>
  );
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
          <p className="eyebrow">Ambiguity review</p>
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
                        이 표현은 담당 Hiring Manager 또는 Admin이 검토할 수 있습니다.
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
          <p className="eyebrow">Criteria</p>
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
          </article>
        ))}
      </div>
    </section>
  );
}

function VersionHistory({ versions }: { versions: ScorecardVersionHistoryRecord[] }) {
  return (
    <section className="panel" aria-labelledby="version-history-title">
      <div className="section-heading">
        <p className="eyebrow">Immutable history</p>
        <h2 id="version-history-title">검토 기준 버전 이력</h2>
      </div>
      <ol className="version-history-list">
        {versions.map((version) => (
          <li key={version.id}>
            <div>
              <strong>v{version.version_number}</strong>
              <span className={`status-chip ${scorecardStatusClass(version.status)}`}>
                {scorecardStatusLabel(version.status)}
              </span>
            </div>
            <span>
              {version.approved_at
                ? `${visibleCopy(version.approver?.display_name ?? "승인 사용자")} · ${formatDate(version.approved_at)}`
                : `생성 ${formatDate(version.created_at)}`}
            </span>
          </li>
        ))}
      </ol>
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
