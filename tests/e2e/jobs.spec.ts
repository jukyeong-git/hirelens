import { expect, test } from "@playwright/test";

const demoPassword = process.env.DEMO_TEST_PASSWORD;

test.describe("Job and scorecard workspace", () => {
  test.beforeEach(() => {
    test.skip(!demoPassword, "Set DEMO_TEST_PASSWORD to run authenticated demo tests.");
  });

  test("recruiter can sign in, see assigned jobs, and access the create form", async ({ page }) => {
    await page.goto("/jobs");
    await page.getByLabel("이메일").fill("recruiter@demo.hirelens.example");
    await page.getByLabel("비밀번호").fill(demoPassword!);
    await page.getByRole("button", { name: "로그인" }).click();

    await expect(page.getByRole("heading", { name: "Job 작업 공간" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Job 목록" })).toBeVisible();
    await expect(page.getByRole("rowheader", { name: /Backend Engineer/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Job 초안 생성" })).toBeVisible();
    await expect(page.getByLabel("직무명")).toBeEditable();
  });

  test("hiring manager gets a read-only Job workspace", async ({ page }) => {
    await page.goto("/jobs");
    await page.getByLabel("이메일").fill("hiring-manager@demo.hirelens.example");
    await page.getByLabel("비밀번호").fill(demoPassword!);
    await page.getByRole("button", { name: "로그인" }).click();

    await expect(page.getByRole("heading", { name: "Job 작업 공간" })).toBeVisible();
    await expect(page.getByRole("region", { name: "읽기 전용 안내" })).toContainText("읽기 전용");
    await expect(page.getByRole("heading", { name: "Job 초안 생성" })).toHaveCount(0);
    await expect(page.getByRole("rowheader", { name: /Backend Engineer/ })).toBeVisible();
  });

  test("recruiter can open the seeded scorecard draft and see its AI boundary", async ({
    page,
  }) => {
    await page.goto("/jobs");
    await page.getByLabel("이메일").fill("recruiter@demo.hirelens.example");
    await page.getByLabel("비밀번호").fill(demoPassword!);
    await page.getByRole("button", { name: "로그인" }).click();

    await page.getByRole("link", { name: "Backend Engineer" }).click();

    await expect(page.getByRole("heading", { name: "Scorecard 초안 v1" })).toBeVisible();
    await expect(page.getByRole("note")).toContainText("AI가 만든 초안");
    await expect(page.getByText("면접에서 확인").first()).toBeVisible();
    await expect(page.getByText("gpt-5.6-luna")).toBeVisible();
    await expect(page.getByRole("button", { name: "검토 결과 저장" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "v1 승인" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Scorecard 버전 이력" })).toBeVisible();
  });

  test("hiring manager can open the ambiguity review form", async ({ page }) => {
    await page.goto("/jobs");
    await page.getByLabel("이메일").fill("hiring-manager@demo.hirelens.example");
    await page.getByLabel("비밀번호").fill(demoPassword!);
    await page.getByRole("button", { name: "로그인" }).click();

    await page.getByRole("link", { name: "Backend Engineer" }).click();

    await expect(page.getByRole("heading", { name: "모호한 표현 검토" })).toBeVisible();
    await expect(page.getByLabel("검토 결과")).toBeEditable();
    await expect(page.getByLabel("검토 사유")).toBeEditable();
    await expect(page.getByRole("button", { name: "검토 결과 저장" })).toBeVisible();
    await expect(page.getByLabel("승인 사유 *")).toBeEditable();
    await expect(page.getByRole("button", { name: "v1 승인" })).toBeVisible();
  });

  test("recruiter can open an assigned application but cannot see the final-decision form", async ({
    page,
  }) => {
    await signIn(page, "recruiter@demo.hirelens.example");
    await page.getByRole("link", { name: "Backend Engineer" }).click();
    await page.getByRole("link", { name: /Synthetic Backend Candidate/ }).click();

    await expect(page.getByRole("heading", { name: "최종 결정" })).toBeVisible();
    await expect(page.getByText("Recruiter는 최종 결정을 저장할 수 없습니다.")).toBeVisible();
    await expect(page.getByRole("button", { name: "최종 결정 저장" })).toHaveCount(0);
    await expect(page.getByLabel("새 임시 의견")).toBeEditable();
  });

  test("assigned manager can open an application and sees the approved-scorecard gate", async ({
    page,
  }) => {
    await signIn(page, "hiring-manager@demo.hirelens.example");
    await page.getByRole("link", { name: "Backend Engineer" }).click();
    await page.getByRole("link", { name: /Synthetic Backend Candidate/ }).click();

    await expect(page.getByRole("heading", { name: "최종 결정" })).toBeVisible();
    await expect(
      page.getByText("승인된 Scorecard가 아직 없어 최종 결정을 저장할 수 없습니다."),
    ).toBeVisible();
    await expect(page.getByLabel("새 임시 의견")).toHaveCount(0);
  });

  test("recruiter sees the resume intake gate before a scorecard is approved", async ({ page }) => {
    await signIn(page, "recruiter@demo.hirelens.example");
    await page.getByRole("link", { name: "Backend Engineer" }).click();

    await expect(page.getByRole("heading", { name: "합성 PDF 이력서 접수" })).toBeVisible();
    await expect(
      page.getByText("승인된 Scorecard가 있는 ‘접수 준비’ Job에서만 업로드할 수 있습니다."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "선택한 PDF 업로드" })).toHaveCount(0);
  });
});

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/jobs");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(demoPassword!);
  await page.getByRole("button", { name: "로그인" }).click();
}
