import { parseEnvironment } from "@hirelens/domain";

const environment = parseEnvironment();

console.log(
  JSON.stringify({
    appEnv: environment.APP_ENV,
    appUrl: environment.NEXT_PUBLIC_APP_URL,
    openAIModelConfigured: Boolean(environment.OPENAI_MODEL),
    supabaseConfigured: Boolean(environment.NEXT_PUBLIC_SUPABASE_URL),
    workerConcurrency: environment.WORKER_CONCURRENCY,
  }),
);
