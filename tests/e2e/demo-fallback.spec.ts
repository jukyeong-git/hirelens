import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const enabled = process.env.CAPTURE_DEMO_FALLBACK === "YES";
const demoPassword = process.env.DEMO_TEST_PASSWORD;
const outputDirectory = resolve("docs/demo-fallback");

test("capture deterministic synthetic demo fallback screens", async ({ page }) => {
  test.setTimeout(60_000);
  test.skip(!enabled || !demoPassword, "Explicit capture flag and demo password are required.");
  mkdirSync(outputDirectory, { recursive: true });

  await page.goto("/careers");
  await expect(page.getByRole("heading", { name: "채용 중인 포지션" })).toBeVisible();
  await page.screenshot({
    path: resolve(outputDirectory, "01-public-careers.png"),
    fullPage: true,
  });

  await signIn(page, "recruiter@demo.hirelens.example", demoPassword!);
  await page.goto("/applications/50000000-0000-0000-0000-000000000001");
  await expect(page.getByText("사전 처리 합성 결과")).toBeVisible();
  await page.screenshot({
    path: resolve(outputDirectory, "02-recruiter-evidence.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
  await signIn(page, "hiring-manager@demo.hirelens.example", demoPassword!);
  await page.goto("/applications/50000000-0000-0000-0000-000000000001");
  await expect(page.getByRole("heading", { name: "인터뷰 판단" })).toBeVisible();
  await page.screenshot({
    path: resolve(outputDirectory, "03-hiring-manager-review.png"),
    fullPage: true,
  });
});

async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/jobs");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(
    page.getByRole("heading", { name: /Recruiter 홈|Hiring Manager 홈|채용 요청 승인/ }),
  ).toBeVisible();
}
