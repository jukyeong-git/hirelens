import { createHash, randomUUID } from "node:crypto";

import {
  cancelPublicResumeSubmission,
  createPublicResumeSubmission,
  finalizePublicResumeSubmission,
  SupabaseRestError,
} from "@hirelens/database";
import { publicResumeSubmissionInputSchema } from "@hirelens/domain";

import {
  getSupabaseServiceClient,
  SupabaseConfigurationError,
} from "../../../../../../lib/supabase-server";

const maximumResumeBytes = 5_242_880;

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const formData = await request.formData();
  const file = formData.get("resume");

  if (!(file instanceof File)) {
    return Response.json({ error: "PDF 이력서 파일을 선택하세요." }, { status: 400 });
  }
  const fileError = await validateResumeFile(file);
  if (fileError) return Response.json({ error: fileError }, { status: 400 });

  const candidateId = randomUUID();
  const applicationId = randomUUID();
  const resumeFileId = randomUUID();
  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const parsed = publicResumeSubmissionInputSchema.safeParse({
    publicSlug: slug,
    candidateId,
    applicationId,
    resumeFileId,
    originalFilename: file.name,
    mimeType: "application/pdf",
    byteSize: file.size,
    sha256,
  });

  if (!parsed.success) {
    return Response.json({ error: "지원서 형식을 확인한 뒤 다시 시도하세요." }, { status: 400 });
  }

  let client;
  try {
    client = getSupabaseServiceClient();
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) {
      return Response.json(
        { error: "지원서 접수 서비스를 현재 사용할 수 없습니다." },
        { status: 503 },
      );
    }
    return Response.json({ error: "지원서 접수 준비에 실패했습니다." }, { status: 500 });
  }

  let storagePath: string;
  try {
    storagePath = await createPublicResumeSubmission(client, parsed.data);
  } catch (error) {
    return Response.json(
      { error: publicSubmissionError(error) },
      { status: publicSubmissionStatus(error) },
    );
  }

  try {
    await client.request("/storage/v1/object/resumes/" + storagePath, {
      method: "POST",
      headers: { "Content-Type": "application/pdf", "x-upsert": "false" },
      body: bytes,
    });
  } catch {
    await cancelPublicResumeSubmission(client, resumeFileId).catch(() => undefined);
    return Response.json(
      { error: "파일 저장에 실패했습니다. 잠시 후 다시 시도하세요." },
      { status: 502 },
    );
  }

  try {
    await finalizePublicResumeSubmission(client, resumeFileId);
  } catch {
    const deleted = await client
      .request("/storage/v1/object/resumes/" + storagePath, { method: "DELETE" })
      .then(() => true)
      .catch(() => false);
    if (deleted) await cancelPublicResumeSubmission(client, resumeFileId).catch(() => undefined);
    return Response.json(
      { error: "지원서 접수에 실패했습니다. 잠시 후 다시 시도하세요." },
      { status: 502 },
    );
  }

  return Response.json(
    {
      accepted: true,
      message: "지원서 접수 완료 · 내부 검토 처리 중",
    },
    { status: 201 },
  );
}

async function validateResumeFile(file: File): Promise<string | null> {
  if (!file.name.toLowerCase().endsWith(".pdf") || file.type !== "application/pdf") {
    return "PDF 파일만 제출할 수 있습니다.";
  }
  if (file.size === 0 || file.size > maximumResumeBytes) {
    return "파일 크기: 1바이트 이상, 5 MiB 이하";
  }
  const header = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
  return header === "%PDF-" ? null : "유효한 PDF 서명(%PDF-)을 찾지 못했습니다.";
}

function publicSubmissionError(error: unknown) {
  if (error instanceof SupabaseRestError) {
    if (/public posting is unavailable|not intake-ready/iu.test(error.responseBody)) {
      return "이 공고는 현재 지원서를 받을 수 없습니다.";
    }
    if (/mime type|byte size|filename|SHA-256/iu.test(error.responseBody)) {
      return "지원서 형식을 확인한 뒤 다시 시도하세요.";
    }
  }
  return "지원서 접수 준비에 실패했습니다. 잠시 후 다시 시도하세요.";
}

function publicSubmissionStatus(error: unknown) {
  if (
    error instanceof SupabaseRestError &&
    /public posting is unavailable|not intake-ready/iu.test(error.responseBody)
  ) {
    return 404;
  }
  return 400;
}
