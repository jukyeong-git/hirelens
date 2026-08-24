import { z } from "zod";

const environmentSchema = z.object({
  APP_ENV: z.enum(["development", "test", "demo", "alpha", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  SUPABASE_ENV: z.enum(["hosted-dev", "hosted-alpha", "local-docker"]).default("hosted-alpha"),
  SUPABASE_PROJECT_REF: z.string().min(1).optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  RESUME_BUCKET: z.string().min(1).default("resumes"),
  PROCESSING_QUEUE: z.literal("resume_analysis").default("resume_analysis"),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).optional(),
  OPENAI_STORE: z.enum(["true", "false"]).default("false"),
  AI_PIPELINE_VERSION: z.string().min(1).default("v1"),
  AI_SCORECARD_PROMPT_VERSION: z.string().min(1).default("scorecard-v1"),
  AI_EVIDENCE_PROMPT_VERSION: z.string().min(1).default("evidence-v1"),
  AI_SCHEMA_VERSION: z.string().min(1).default("v1"),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(3),
  WORKER_MAX_ATTEMPTS: z.coerce.number().int().positive().max(2).default(2),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  SENTRY_DSN: z.string().url().optional(),
});

export type RuntimeEnvironment = z.infer<typeof environmentSchema>;

function normalizeBlankValues(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, value === "" ? undefined : value]),
  );
}

export function parseEnvironment(input: Record<string, unknown> = process.env): RuntimeEnvironment {
  const parsed = environmentSchema.safeParse(normalizeBlankValues(input));

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return parsed.data;
}
