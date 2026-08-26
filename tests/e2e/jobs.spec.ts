import { expect, test } from "@playwright/test";

const demoPassword = process.env.DEMO_TEST_PASSWORD;
const seededBackendJobPath = "/jobs/10000000-0000-0000-0000-000000000001";
const seededPlatformJobPath = "/jobs/10000000-0000-0000-0000-000000000002";
const seededBackendApplicationPath = "/applications/50000000-0000-0000-0000-000000000001";
const seededCalibrationApplicationPath = "/applications/50000000-0000-0000-0000-000000000107";

test.describe("Job and scorecard workspace", () => {
  test.beforeEach(() => {
    test.skip(!demoPassword, "Set DEMO_TEST_PASSWORD to run authenticated demo tests.");
  });

  test("recruiter can sign in, see assigned jobs, and receives read-only requisition guidance", async ({
    page,
  }) => {
    await signIn(page, "recruiter@demo.hirelens.example");

    await expect(page.getByRole("heading", { name: "Recruiter 홈" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "진행 중인 채용 요청 목록" })).toBeVisible();
    await expect(page.getByText("게시 중 공고", { exact: true })).toBeVisible();
    await expect(page.getByText("후보자 검토", { exact: true })).toHaveCount(0);
    await expect(page.locator(`a[href="${seededBackendJobPath}"]`)).toBeVisible();
    await expect(page.getByRole("region", { name: "읽기 전용 안내" })).toContainText(
      "채용 책임자 작성 · 채용 담당자 조회",
    );
    await expect(page.getByRole("heading", { name: "기본 정보" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "AI 초안" })).toHaveCount(0);
  });

  test("hiring manager can access the requisition creation workspace", async ({ page }) => {
    await signIn(page, "hiring-manager@demo.hirelens.example");

    await expect(page.getByRole("heading", { name: "Hiring Manager 홈" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "기본 정보" })).toHaveCount(0);
    await expect(page.getByText("후보자 검토", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "채용 생성" }).click();
    await expect(page).toHaveURL(/\/jobs\/new$/);
    await expect(page.getByRole("heading", { name: "채용 생성" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "기본 정보" })).toBeVisible();
    await expect(page.getByLabel("직무명")).toBeEditable();
    await expect(page.getByLabel("채용 필요성 / 추가 요청")).toBeEditable();
    await expect(page.getByRole("button", { name: "AI 초안" })).toBeVisible();
    await expect(page.getByRole("button", { name: "AI 초안" })).toBeEnabled();
    await expect(page.getByLabel("채용 책임자")).toHaveValue("Hiring Manager");
    await expect(page.getByLabel("채용 책임자")).not.toBeEditable();
    await expect(page.getByRole("link", { name: "Hiring Manager 홈" })).toBeVisible();
    await expect(page.getByText("채용 담당자는 이 채용 요청의 운영 담당자입니다.")).toHaveCount(0);
    await expect(page.getByText("현재 로그인한 채용 책임자로 고정됩니다.")).toHaveCount(0);
    await expect(page.getByText(/AI 초안의 입력값입니다/)).toHaveCount(0);
    await expect(page.getByText(/AI 초안은 편집 가능한 제안입니다/)).toHaveCount(0);
    await expect(
      page.getByText("AI 초안 또는 직접 작성한 필수 항목을 모두 입력해야 저장할 수 있습니다."),
    ).toHaveCount(0);
  });

  test("designated approver sees an isolated approval queue", async ({ page }) => {
    await signIn(page, "requisition-approver@demo.hirelens.example");

    await expect(page.getByRole("heading", { name: "채용 요청 승인" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "승인 대기" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recruiter 홈" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Hiring Manager 홈" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "진행 중인 채용 요청 목록" })).toHaveCount(0);
  });

  test("hiring manager sees separate requisition and review-criteria gates", async ({ page }) => {
    await signIn(page, "hiring-manager@demo.hirelens.example");
    await openSeededJob(page, seededBackendJobPath);

    await expect(page.getByRole("heading", { name: "채용 요청 승인" })).toBeVisible();
    await expect(page.getByLabel("채용 요청 상태", { exact: true })).toContainText(
      "채용 요청 상태",
    );
    await expect(page.getByLabel("채용 요청 상태", { exact: true })).toContainText(
      "평가 기준 상태",
    );
    await expect(page.getByRole("button", { name: "채용 요청 제출" })).toBeDisabled();
    await expect(
      page.getByText("승인자와 승인된 평가 기준이 있어야 제출할 수 있습니다."),
    ).toBeVisible();
  });

  test("recruiter can read the requisition handoff without workflow or decision controls", async ({
    page,
  }) => {
    await signIn(page, "recruiter@demo.hirelens.example");

    await openSeededJob(page, seededBackendJobPath);

    await expect(page.getByRole("heading", { name: "채용 요청 승인" })).toBeVisible();
    await expect(
      page.getByText(
        "이 영역은 읽기 전용입니다. 배정된 채용 책임자만 승인자를 지정하고 제출할 수 있습니다.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "승인자 저장" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "채용 요청 제출" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "사람의 최종 결정" })).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /지원서 평가 기준 (?:초안|승인본)/ }),
    ).toBeVisible();
    await expect(page.getByText("면접에서 확인").first()).toBeVisible();
    await expect(page.getByText("gpt-5.6-luna")).toBeVisible();
    await expect(page.getByRole("button", { name: "검토 결과 저장" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "v1 승인" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "빈 평가 기준 초안 만들기" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "AI로 평가 기준 제안 받기" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "사람이 검토한 초안 저장" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "평가 기준 버전 이력" })).toHaveCount(0);
  });

  test("posting management is visible to the assigned recruiter with both publication gates", async ({
    page,
  }) => {
    await signIn(page, "recruiter@demo.hirelens.example");
    await openSeededJob(page, seededBackendJobPath);

    await expect(page.getByRole("heading", { name: "채용 공고" })).toBeVisible();
    await expect(page.getByLabel("공고 게시 조건")).toContainText("채용 요청 승인");
    await expect(page.getByLabel("공고 게시 조건")).toContainText("지원서 평가 기준");
    await expect(page.getByRole("button", { name: "공고 초안 만들기" })).toBeVisible();
    await expect(page.getByText("게시 후 공개 경로 활성화")).toBeVisible();
    await expect(page.getByRole("button", { name: "공고 게시" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "공고 종료" })).toHaveCount(0);
  });

  test("recruiter reads the seeded posting safely and dismisses close confirmation when available", async ({
    page,
  }) => {
    await signIn(page, "recruiter@demo.hirelens.example");
    await openSeededJob(page, seededPlatformJobPath);

    const closeButton = page.getByRole("button", { name: "공고 종료" });
    await expect(page.getByRole("heading", { name: "공고 상태 이력" })).toBeVisible();

    if ((await closeButton.count()) === 1) {
      let confirmationMessage: string | undefined;
      page.once("dialog", async (dialog) => {
        expect(dialog.type()).toBe("confirm");
        confirmationMessage = dialog.message();
        await dialog.dismiss();
      });
      await closeButton.click();

      expect(confirmationMessage).toBe(
        "공고를 종료하면 다시 게시할 수 없습니다. 계속하시겠습니까?",
      );
      await expect(closeButton).toBeVisible();
    }
  });

  test("hiring manager sees posting management as read-only", async ({ page }) => {
    await signIn(page, "hiring-manager@demo.hirelens.example");
    await openSeededJob(page, seededBackendJobPath);

    await expect(page.getByRole("heading", { name: "채용 공고" })).toBeVisible();
    await expect(page.getByText("배정된 채용 담당자 전용 · 관리자 운영 예외")).toBeVisible();
    await expect(page.getByRole("button", { name: "공고 초안 만들기" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "공고 게시" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "공고 종료" })).toHaveCount(0);
  });

  test("admin can see the operational posting-management surface", async ({ page }) => {
    await signIn(page, "admin@demo.hirelens.example");
    await openSeededJob(page, seededBackendJobPath);

    await expect(page.getByRole("heading", { name: "채용 공고" })).toBeVisible();
    await expect(page.getByRole("button", { name: "공고 초안 만들기" })).toBeVisible();
    await expect(page.getByText("Admin은 운영상 예외로만 처리할 수 있습니다.")).toHaveCount(0);
  });

  test("requisition approver has no posting-management surface", async ({ page }) => {
    await signIn(page, "requisition-approver@demo.hirelens.example");

    await expect(page.getByRole("heading", { name: "채용 공고" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "공고 초안 만들기" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "공고 게시" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "공고 종료" })).toHaveCount(0);
  });

  test("hiring manager sees separated job-description and evaluation-criteria issues", async ({
    page,
  }) => {
    await signIn(page, "hiring-manager@demo.hirelens.example");

    await openSeededJob(page, seededBackendJobPath);

    await expect(page.getByRole("heading", { name: "직무 설명 확인 사항" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "요청 사유" })).toBeVisible();
    const basicInfoEditButton = page.getByRole("button", { name: "수정" });
    if ((await basicInfoEditButton.count()) === 1) {
      await basicInfoEditButton.click();
      const basicInfoSaveButton = page.getByRole("button", { name: "저장" });
      await expect(basicInfoSaveButton).toBeVisible();
      await expect(basicInfoSaveButton).toBeDisabled();
      const requestReason = page.getByLabel("요청 사유");
      await requestReason.fill(`${await requestReason.inputValue()} 수정`);
      await expect(basicInfoSaveButton).toBeEnabled();
    }
    await page.getByRole("link", { name: "평가 기준" }).click();
    await expect(page.getByRole("heading", { name: "평가 기준 확인 사항" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "직무 설명 확인 사항" })).toHaveCount(0);
    const editButton = page.getByRole("button", { name: "수정" });
    if ((await editButton.count()) === 1) {
      await editButton.click();
      const saveButton = page.getByRole("button", { name: "저장" });
      await expect(saveButton).toBeVisible();
      await expect(saveButton).toBeDisabled();
      const criterionName = page.getByLabel("기준명").first();
      await criterionName.fill(`${await criterionName.inputValue()} 수정`);
      await expect(saveButton).toBeEnabled();
      await expect(page.getByRole("button", { name: "변경 저장" })).toHaveCount(0);
    }

    await expect(page.getByLabel("검토 결과")).toHaveCount(0);
    await expect(page.getByLabel("검토 사유")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "검토 결과 저장" })).toHaveCount(0);
  });

  test("recruiter can open an assigned application but cannot see the final-decision form", async ({
    page,
  }) => {
    await signIn(page, "recruiter@demo.hirelens.example");
    await page.goto(seededBackendApplicationPath);

    await expect(page.getByRole("heading", { name: "AI 지원서 근거" })).toBeVisible();
    await expect(page.getByText("직접 근거")).toBeVisible();
    await expect(page.getByText("사람 확인 전용")).toBeVisible();
    await expect(page.getByRole("link", { name: "원문 1페이지 보기" })).toBeVisible();
    await expect(page.getByText("사전 처리 합성 결과")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/demo|데모/i);
    await expect(page.locator("body")).not.toContainText(/100점|fit score|적합도 점수/i);
    await expect(page.getByRole("heading", { name: "검토 요청" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "인터뷰 판단" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "사람의 최종 결정" })).toBeVisible();
    await expect(page.getByText(/최종 결정은 인터뷰 판단과 분리됩니다/)).toBeVisible();
    await expect(page.getByRole("button", { name: "최종 결정 저장" })).toHaveCount(0);
    await expect(page.getByLabel("새 임시 의견")).toBeEditable();
  });

  test("assigned manager can open an application and sees the approved-review-criteria gate", async ({
    page,
  }) => {
    await signIn(page, "hiring-manager@demo.hirelens.example");
    await openSeededJob(page, seededBackendJobPath);
    await page.locator(`a[href="${seededBackendApplicationPath}"]`).click();

    await expect(page.getByRole("heading", { name: "AI 지원서 근거" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "인터뷰 판단" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "사람의 최종 결정" })).toBeVisible();
    await expect(page.getByText(/최종 결정은 인터뷰 판단과 분리됩니다/)).toBeVisible();
    await expect(page.getByLabel("새 임시 의견")).toHaveCount(0);
  });

  test("recruiter sees the current resume intake gate", async ({ page }) => {
    await signIn(page, "recruiter@demo.hirelens.example");
    await openSeededJob(page, seededBackendJobPath);

    await expect(page.getByRole("heading", { name: "이력서 업로드" })).toBeVisible();
    const uploadButton = page.getByRole("button", { name: "선택한 PDF 업로드" });
    if ((await uploadButton.count()) === 1) {
      await expect(uploadButton).toBeVisible();
      await expect(page.getByRole("button", { name: "PDF 이력서" })).toBeVisible();
    } else {
      await expect(
        page.getByText(
          "승인된 지원서 평가 기준이 있는 ‘접수 준비’ 채용 요청에서만 업로드할 수 있습니다.",
        ),
      ).toBeVisible();
    }
  });

  test("assigned manager sees deterministic criterion calibration", async ({ page }) => {
    await signIn(page, "second-manager@demo.hirelens.example");
    await page.goto(`${seededPlatformJobPath}?tab=review-framework`);

    const diagnosis = page.getByRole("region", { name: "평가 기준 진단" });
    await expect(diagnosis).toBeVisible();
    await expect(diagnosis.getByText("검토 필요", { exact: true })).toBeVisible();
    await expect(diagnosis.getByText(/직접 근거로 확인된 5건 중 4건/)).toBeVisible();
    await expect(diagnosis.getByText(/사실과 다른 지원서 1건/)).toBeVisible();
    await expect(
      diagnosis.getByRole("heading", { name: "Incident response ownership" }),
    ).toBeVisible();
    await expect(diagnosis.getByText("관측 중", { exact: true })).toBeVisible();
  });

  test("post-interview form blocks an incomplete criterion set and moves focus", async ({
    page,
  }) => {
    await signIn(page, "second-manager@demo.hirelens.example");
    await page.goto(seededCalibrationApplicationPath);

    const postInterviewReview = page.getByRole("region", { name: "면접 결과 기록" });
    await expect(postInterviewReview).toBeVisible();
    await postInterviewReview.getByLabel("최종 결정").selectOption("PROCEED");
    await postInterviewReview.getByLabel("사유 분류").selectOption("EVIDENCE_REVIEW");
    await postInterviewReview.getByLabel("상세 사유").fill("합성 면접 근거를 사람이 확인했습니다.");
    await postInterviewReview.getByRole("button", { name: "면접 결과와 최종 결정 저장" }).click();

    const error = postInterviewReview.getByRole("alert");
    await expect(error).toHaveText("모든 평가 기준의 면접 결과를 선택하세요.");
    await expect(error).toBeFocused();
  });

  test("recruiter cannot access the post-interview write form", async ({ page }) => {
    await signIn(page, "recruiter@demo.hirelens.example");
    await page.goto(seededCalibrationApplicationPath);

    await expect(page.getByRole("button", { name: "면접 결과와 최종 결정 저장" })).toHaveCount(0);
  });

  test("DO_NOT_PROCEED cannot submit without a human reason", async ({ page }) => {
    await signIn(page, "second-manager@demo.hirelens.example");
    await page.goto(seededCalibrationApplicationPath);

    const postInterviewReview = page.getByRole("region", { name: "면접 결과 기록" });
    const criterionVerdicts = postInterviewReview.getByRole("combobox", {
      name: /면접 결과/,
    });
    for (let index = 0; index < (await criterionVerdicts.count()); index += 1) {
      await criterionVerdicts.nth(index).selectOption("MATCHED");
    }
    await postInterviewReview.getByLabel("최종 결정").selectOption("DO_NOT_PROCEED");
    await postInterviewReview.getByLabel("사유 분류").selectOption("EVIDENCE_REVIEW");
    await postInterviewReview.getByRole("button", { name: "면접 결과와 최종 결정 저장" }).click();

    await expect(postInterviewReview.getByLabel("상세 사유")).toBeFocused();
  });

  test("unassigned Hiring Manager cannot open another manager's application", async ({ page }) => {
    await signIn(page, "hiring-manager@demo.hirelens.example");
    const response = await page.goto(seededCalibrationApplicationPath);

    expect(response?.status()).toBe(404);
    await expect(page.getByRole("button", { name: "면접 결과와 최종 결정 저장" })).toHaveCount(0);
  });
});

test("anonymous users see only the narrow published career posting and no internal data", async ({
  page,
}) => {
  const indexResponse = await page.goto("/careers");

  expect(indexResponse?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "채용 중인 포지션" })).toBeVisible();
  await expect(page.getByRole("link", { name: "내부 작업 공간" })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/demo|데모/i);
  const publicPostingLink = page.locator('a[href^="/careers/"]').first();
  await expect(publicPostingLink).toBeVisible();
  const publicPostingPath = await publicPostingLink.getAttribute("href");
  expect(publicPostingPath).toMatch(/^\/careers\/[0-9a-f]{32}$/);

  const publicResponse = await page.goto(publicPostingPath!);

  expect(publicResponse?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "채용 중인 포지션" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Senior Backend Engineer/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("article").getByText(/Singapore · Hybrid/)).toBeVisible();
  await expect(page.getByRole("button", { name: "지원하기" })).toBeVisible();
  await page.getByRole("button", { name: "지원하기" }).click();
  await expect(page.getByRole("dialog", { name: "지원 방식 선택" })).toBeVisible();
  await expect(page.getByRole("button", { name: "이력서로 지원" })).toBeVisible();
  await expect(page.getByRole("button", { name: "수기 지원" })).toBeVisible();
  await page.getByRole("button", { name: "이력서로 지원" }).click();
  await expect(page).toHaveURL(/\/careers\/[0-9a-f]{32}\/apply\?mode=resume$/);
  await expect(page.getByRole("heading", { name: "이력서로 지원" })).toBeVisible();
  await expect(page.locator('input[name="resume"]')).toBeAttached();
  await expect(page.getByText(/합성·익명화 테스트 자료만 사용합니다/)).toHaveCount(0);
  await expect(page.getByText(/실제 개인정보·이력서는 제출하지 마세요/)).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/demo|데모/i);
  await expect(page.getByText(/Internal synthetic requisition|raw_job_description/)).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(
    /job_id|requisition_status|scorecard|reviewer/i,
  );
  await expect(page.getByRole("heading", { name: "이력서 제출" })).toHaveCount(0);
  await expect(page.getByLabel(/실제 지원서|테스트 자료|합성|익명화/)).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("10000000-0000-0000-0000-000000000002");

  const missingResponse = await page.goto("/careers/not-a-real-public-slug");
  expect(missingResponse?.status()).toBe(404);

  await page.goto("/jobs");

  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
  await expect(page.getByLabel("이메일")).toHaveValue("");
  await expect(page.locator("body")).not.toContainText(/demo|데모/i);
  await expect(
    page.getByRole("button", { name: /공고 초안 만들기|공고 게시|공고 종료|지원서 제출/ }),
  ).toHaveCount(0);
});

test("root opens the public careers index", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/careers$/);
  await expect(page.getByRole("heading", { name: "채용 공고", level: 1 })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/demo|데모/i);
});

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/jobs");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(demoPassword!);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(
    page.getByRole("heading", {
      name: /Recruiter 홈|Hiring Manager 홈|채용 요청 승인/,
    }),
  ).toBeVisible();
}

async function openSeededJob(page: import("@playwright/test").Page, path: string) {
  await page.goto(path);
  await expect(page).toHaveURL(path);
}
