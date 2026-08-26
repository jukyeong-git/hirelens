import { createHash, randomUUID } from "node:crypto";

import {
  getJobForScorecard,
  cancelResumeUploadReservation,
  createResumeUploadReservation,
  finalizeUploadedResume,
  SupabaseRestError,
  type SupabaseRestClient,
} from "@hirelens/database";
import { getAuthenticatedViewer } from "../../../../../lib/supabase-server";

const maximumResumeBytes = 10_485_760;

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const authenticated = await getAuthenticatedViewer();
  if (!authenticated) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { jobId } = await params;
  const { client, viewer } = authenticated;
  if (viewer.role !== "ADMIN" && viewer.role !== "RECRUITER") {
    return Response.json({ error: "이력서를 업로드할 권한이 없습니다." }, { status: 403 });
  }
  const job = await getJobForScorecard(client, jobId);
  if (!job)
    return Response.json(
      { error: "채용 요청을 찾을 수 없거나 접근할 수 없습니다." },
      { status: 404 },
    );

  const formData = await request.formData();
  const files = formData.getAll("files").filter((value): value is File => value instanceof File);
  if (!files.length) return Response.json({ error: "업로드할 PDF를 선택하세요." }, { status: 400 });

  const results = [];
  for (const file of files) {
    results.push(await uploadOneResume(client, job.id, file));
  }
  return Response.json({ results });
}

async function uploadOneResume(client: SupabaseRestClient, jobId: string, file: File) {
  const validationError = await validateResumeFile(file);
  if (validationError)
    return { filename: file.name, status: "error" as const, message: validationError };

  const applicationId = randomUUID();
  const candidateId = randomUUID();
  const resumeFileId = randomUUID();
  const storagePath = `${jobId}/${applicationId}/${resumeFileId}.pdf`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  try {
    await createResumeUploadReservation(client, {
      jobId,
      candidateId,
      applicationId,
      resumeFileId,
      storagePath,
      originalFilename: file.name,
      mimeType: "application/pdf",
      byteSize: file.size,
      sha256,
    });
  } catch (error) {
    return { filename: file.name, status: "error" as const, message: uploadErrorMessage(error) };
  }

  try {
    await client.request(`/storage/v1/object/resumes/${storagePath}`, {
      method: "POST",
      headers: { "Content-Type": "application/pdf", "x-upsert": "false" },
      body: bytes,
    });
  } catch (error) {
    await cancelResumeUploadReservation(client, { resumeFileId }).catch(() => undefined);
    return { filename: file.name, status: "error" as const, message: uploadErrorMessage(error) };
  }

  try {
    await finalizeUploadedResume(client, { resumeFileId });
  } catch (error) {
    const deleted = await client
      .request(`/storage/v1/object/resumes/${storagePath}`, { method: "DELETE" })
      .then(() => true)
      .catch(() => false);
    if (deleted)
      await cancelResumeUploadReservation(client, { resumeFileId }).catch(() => undefined);
    return { filename: file.name, status: "error" as const, message: uploadErrorMessage(error) };
  }

  return { filename: file.name, status: "success" as const, applicationId, resumeFileId };
}

async function validateResumeFile(file: File): Promise<string | null> {
  if (!file.name.toLowerCase().endsWith(".pdf") || file.type !== "application/pdf") {
    return "PDF 파일만 업로드할 수 있습니다.";
  }
  if (file.size === 0 || file.size > maximumResumeBytes) {
    return "파일 크기: 1바이트 이상, 10 MiB 이하 · 고객 정책 TBD";
  }
  const header = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
  return header === "%PDF-" ? null : "유효한 PDF 서명(%PDF-)을 찾지 못했습니다.";
}

function uploadErrorMessage(error: unknown) {
  if (error instanceof SupabaseRestError) {
    if (error.status === 401 || error.status === 403)
      return "현재 사용자에게 이 채용 요청의 업로드 권한이 없습니다.";
    if (/ready for intake|approved scorecard/iu.test(error.responseBody))
      return "승인된 지원서 평가 기준이 있는 접수 준비 채용 요청에서만 업로드할 수 있습니다.";
  }
  return "업로드에 실패했습니다. 파일을 확인한 뒤 다시 시도하세요.";
}
