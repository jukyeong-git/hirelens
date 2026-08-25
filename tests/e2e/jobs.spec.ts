import { expect, test } from "@playwright/test";

const demoPassword = process.env.DEMO_TEST_PASSWORD;
const seededBackendJobPath = "/jobs/10000000-0000-0000-0000-000000000001";
const seededPlatformJobPath = "/jobs/10000000-0000-0000-0000-000000000002";
const seededBackendApplicationPath = "/applications/50000000-0000-0000-0000-000000000001";

test.describe("Job and scorecard workspace", () => {
  test.beforeEach(() => {
    test.skip(!demoPassword, "Set DEMO_TEST_PASSWORD to run authenticated demo tests.");
  });

  test("recruiter can sign in, see assigned jobs, and receives read-only requisition guidance", async ({
    page,
  }) => {
    await signIn(page, "recruiter@demo.hirelens.example");

    await expect(page.getByRole("heading", { name: "Requisition 작업 공간" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Job 목록" })).toBeVisible();
    await expect(page.locator(`a[href="${seededBackendJobPath}"]`)).toBeVisible();
    await expect(page.getByRole("region", { name: "읽기 전용 안내" })).toContainText(
      "Hiring Manager 작성 · Recruiter 조회",
    );
    await expect(page.getByRole("heading", { name: "Job 초안 생성" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "AI로 Job Requisition 초안 만들기" }),
    ).toHaveCount(0);
    await expect(
      page.getByText("AI는 편집 가능한 Job Requisition/직무 설명 초안만 제안합니다."),
    ).toHaveCount(0);
  });

  test("hiring manager can access the requisition creation workspace", async ({ page }) => {
    await signIn(page, "hiring-manager@demo.hirelens.example");

    await expect(page.getByRole("heading", { name: "Requisition 작업 공간" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Job 초안 생성" })).toBeVisible();
    await expect(page.getByLabel("직무명")).toBeEditable();
    await expect(page.getByLabel("채용 필요성 / 추가 요청")).toBeEditable();
    await expect(
      page.getByRole("button", { name: "AI로 Job Requisition 초안 만들기" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "AI로 Job Requisition 초안 만들기" }),
    ).toBeEnabled();
    await expect(page.getByText("자동 저장·승인·제출·공고 게시에는 관여하지 않으며")).toBeVisible();
    await expect(page.getByLabel("Hiring Manager")).toHaveValue("Test Hiring Manager");
    await expect(page.getByLabel("Hiring Manager")).not.toBeEditable();
    await expect(page.locator(`a[href="${seededBackendJobPath}"]`)).toBeVisible();
  });

  test("designated approver sees an isolated approval queue", async ({ page }) => {
    await signIn(page, "requisition-approver@demo.hirelens.example");

    await expect(page.getByRole("heading", { name: "Requisition 승인 대기열" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "대기 중인 Requisition" })).toBeVisible();
    await expect(
      page.getByText("이 화면에는 지원서, 검토 기준, 후보자 근거가 표시되지 않습니다."),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Requisition 작업 공간" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Job 목록" })).toHaveCount(0);
  });

  test("hiring manager sees separate requisition and review-criteria gates", async ({ page }) => {
    await signIn(page, "hiring-manager@demo.hirelens.example");
    await openSeededJob(page, seededBackendJobPath);

    await expect(page.getByRole("heading", { name: "Requisition 승인 준비" })).toBeVisible();
    await expect(page.getByLabel("Requisition 상태", { exact: true })).toContainText(
      "Requisition 상태",
    );
    await expect(page.getByLabel("Requisition 상태", { exact: true })).toContainText(
      "검토 기준 상태",
    );
    await expect(page.getByRole("button", { name: "Requisition 제출" })).toBeDisabled();
    await expect(
      page.getByText("승인자와 승인된 검토 기준이 있어야 제출할 수 있습니다."),
    ).toBeVisible();
  });

  test("recruiter can read the requisition handoff without workflow or decision controls", async ({
    page,
  }) => {
    await signIn(page, "recruiter@demo.hirelens.example");

    await openSeededJob(page, seededBackendJobPath);

    await expect(page.getByRole("heading", { name: "Requisition 승인 준비" })).toBeVisible();
    await expect(
      page.getByText(
        "이 영역은 읽기 전용입니다. 배정된 Hiring Manager만 승인자 지정 및 제출을 수행할 수 있습니다.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "승인자 저장" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Requisition 제출" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "최종 결정" })).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /지원서 검토 기준 (?:초안|승인본) v1/ }),
    ).toBeVisible();
    await expect(page.getByText("면접에서 확인").first()).toBeVisible();
    await expect(page.getByText("gpt-5.6-luna")).toBeVisible();
    await expect(page.getByRole("button", { name: "검토 결과 저장" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "v1 승인" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "빈 검토 기준 초안 만들기" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "AI로 검토 기준 제안 받기" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "사람이 검토한 초안 저장" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "검토 기준 버전 이력" })).toBeVisible();
  });

  test("posting management is visible to the assigned recruiter with both publication gates", async ({
    page,
  }) => {
    await signIn(page, "recruiter@demo.hirelens.example");
    await openSeededJob(page, seededBackendJobPath);

    await expect(page.getByRole("heading", { name: "공고 관리" })).toBeVisible();
    await expect(page.getByLabel("공고 게시 조건")).toContainText("Requisition 승인");
    await expect(page.getByLabel("공고 게시 조건")).toContainText("지원서 검토 기준");
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

    await expect(page.getByRole("heading", { name: "공고 관리" })).toBeVisible();
    await expect(page.getByText("배정 Recruiter 전용 · Admin 운영 예외")).toBeVisible();
    await expect(page.getByRole("button", { name: "공고 초안 만들기" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "공고 게시" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "공고 종료" })).toHaveCount(0);
  });

  test("admin can see the operational posting-management surface", async ({ page }) => {
    await signIn(page, "admin@demo.hirelens.example");
    await openSeededJob(page, seededBackendJobPath);

    await expect(page.getByRole("heading", { name: "공고 관리" })).toBeVisible();
    await expect(page.getByRole("button", { name: "공고 초안 만들기" })).toBeVisible();
    await expect(page.getByText("Admin은 운영상 예외로만 처리할 수 있습니다.")).toHaveCount(0);
  });

  test("requisition approver has no posting-management surface", async ({ page }) => {
    await signIn(page, "requisition-approver@demo.hirelens.example");

    await expect(page.getByRole("heading", { name: "공고 관리" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "공고 초안 만들기" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "공고 게시" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "공고 종료" })).toHaveCount(0);
  });

  test("hiring manager can open the ambiguity review form", async ({ page }) => {
    await signIn(page, "hiring-manager@demo.hirelens.example");

    await openSeededJob(page, seededBackendJobPath);

    await expect(page.getByRole("heading", { name: "모호한 표현 검토" })).toBeVisible();
    const reviewResult = page.getByLabel("검토 결과");
    if ((await reviewResult.count()) === 1) {
      await expect(reviewResult).toBeEditable();
      await expect(page.getByLabel("검토 사유")).toBeEditable();
      await expect(page.getByRole("button", { name: "검토 결과 저장" })).toBeVisible();
    } else {
      await expect(page.getByText("0개 미해결")).toBeVisible();
      await expect(page.getByText("사람이 승인한 활성 버전입니다.")).toBeVisible();
    }
  });

  test("recruiter can open an assigned application but cannot see the final-decision form", async ({
    page,
  }) => {
    await signIn(page, "recruiter@demo.hirelens.example");
    await page.goto(seededBackendApplicationPath);

    await expect(page.getByRole("heading", { name: "지원서 근거 검토" })).toBeVisible();
    await expect(page.getByText("직접 근거")).toBeVisible();
    await expect(page.getByText("사람 확인 전용")).toBeVisible();
    await expect(page.getByRole("link", { name: "원문 1페이지 보기" })).toBeVisible();
    await expect(page.getByText("사전 처리 합성 결과")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/demo|데모/i);
    await expect(page.locator("body")).not.toContainText(/100점|fit score|적합도 점수/i);
    await expect(page.getByRole("heading", { name: "Hiring Manager 검토 요청" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "인터뷰 진행 판단" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "최종 결정" })).toBeVisible();
    await expect(page.getByText(/최종 결정은 인터뷰 진행 판단과 분리됩니다/)).toBeVisible();
    await expect(page.getByRole("button", { name: "최종 결정 저장" })).toHaveCount(0);
    await expect(page.getByLabel("새 임시 의견")).toBeEditable();
  });

  test("assigned manager can open an application and sees the approved-review-criteria gate", async ({
    page,
  }) => {
    await signIn(page, "hiring-manager@demo.hirelens.example");
    await openSeededJob(page, seededBackendJobPath);
    await page.locator(`a[href="${seededBackendApplicationPath}"]`).click();

    await expect(page.getByRole("heading", { name: "지원서 근거 검토" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "인터뷰 진행 판단" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "최종 결정" })).toBeVisible();
    await expect(page.getByText(/최종 결정은 인터뷰 진행 판단과 분리됩니다/)).toBeVisible();
    await expect(page.getByLabel("새 임시 의견")).toHaveCount(0);
  });

  test("recruiter sees the current resume intake gate", async ({ page }) => {
    await signIn(page, "recruiter@demo.hirelens.example");
    await openSeededJob(page, seededBackendJobPath);

    await expect(page.getByRole("heading", { name: "PDF 이력서 접수" })).toBeVisible();
    const uploadButton = page.getByRole("button", { name: "선택한 PDF 업로드" });
    if ((await uploadButton.count()) === 1) {
      await expect(uploadButton).toBeVisible();
      await expect(page.getByRole("button", { name: "PDF 이력서" })).toBeVisible();
    } else {
      await expect(
        page.getByText(
          "승인된 지원서 검토 기준이 있는 ‘접수 준비’ Job에서만 업로드할 수 있습니다.",
        ),
      ).toBeVisible();
    }
  });
});

test("anonymous users see only the narrow published career posting and no internal data", async ({
  page,
}) => {
  const indexResponse = await page.goto("/careers");

  expect(indexResponse?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "포지션 목록" })).toBeVisible();
  await expect(page.getByRole("link", { name: "내부 작업 공간" })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/demo|데모/i);
  const publicPostingLink = page.locator('a[href^="/careers/"]').first();
  await expect(publicPostingLink).toBeVisible();
  const publicPostingPath = await publicPostingLink.getAttribute("href");
  expect(publicPostingPath).toMatch(/^\/careers\/[0-9a-f]{32}$/);

  const publicResponse = await page.goto(publicPostingPath!);

  expect(publicResponse?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "공개 포지션 목록" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Senior Backend Engineer/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("article").getByText(/Singapore · Hybrid/)).toBeVisible();
  await expect(page.getByRole("button", { name: "지원하기" })).toBeVisible();
  await page.getByRole("button", { name: "지원하기" }).click();
  await expect(page.getByRole("dialog", { name: "지원 방식 선택" })).toBeVisible();
  await expect(page.getByRole("button", { name: "이력서로 자동 채움" })).toBeVisible();
  await expect(page.getByRole("button", { name: "수기 지원" })).toBeVisible();
  await page.getByRole("button", { name: "이력서로 자동 채움" }).click();
  await expect(page.getByRole("heading", { name: "이력서로 자동 채움" })).toBeVisible();
  await page.getByRole("button", { name: "지원 창 닫기" }).click();
  await expect(page.getByText(/합성·익명화 테스트 자료만 사용합니다/)).toHaveCount(0);
  await expect(page.getByText(/실제 개인정보·이력서는 제출하지 마세요/)).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/demo|데모/i);
  await expect(page.getByText(/Internal synthetic requisition|raw_job_description/)).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(
    /job_id|requisition_status|scorecard|reviewer/i,
  );
  await expect(page.getByRole("heading", { name: "이력서 제출" })).toHaveCount(0);
  await expect(page.getByLabel("접속 코드")).toHaveCount(0);
  await expect(page.getByLabel("PDF 이력서")).toHaveCount(0);
  await expect(page.getByLabel(/실제 지원서|테스트 자료|합성|익명화/)).toHaveCount(0);

  const deniedSubmission = await page.request.post(
    "/api/public/postings/" + publicPostingPath!.split("/").pop() + "/applications",
    {
      multipart: {
        demoAccessCode: "invalid-demo-access-code",
        resume: {
          name: "synthetic-test.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.4\n%%EOF"),
        },
      },
    },
  );
  expect([403, 503]).toContain(deniedSubmission.status());
  await expect(deniedSubmission.json()).resolves.toEqual({
    error:
      deniedSubmission.status() === 403
        ? "접속 코드를 확인하세요."
        : "지원서 접수 서비스가 아직 활성화되지 않았습니다.",
  });
  const missingCodeSubmission = await page.request.post(
    "/api/public/postings/" + publicPostingPath!.split("/").pop() + "/applications",
    {
      multipart: {
        resume: {
          name: "synthetic-test.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.4\n%%EOF"),
        },
      },
    },
  );
  expect([403, 503]).toContain(missingCodeSubmission.status());
  await expect(missingCodeSubmission.json()).resolves.toEqual({
    error:
      missingCodeSubmission.status() === 403
        ? "접속 코드를 확인하세요."
        : "지원서 접수 서비스가 아직 활성화되지 않았습니다.",
  });
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
    page.getByRole("heading", { name: /Requisition 작업 공간|Requisition 승인 대기열/ }),
  ).toBeVisible();
}

async function openSeededJob(page: import("@playwright/test").Page, path: string) {
  await page.goto(path);
  await expect(page).toHaveURL(path);
}
