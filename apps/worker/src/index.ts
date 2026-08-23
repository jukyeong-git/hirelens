import { DOMAIN_PACKAGE_NAME, parseEnvironment } from "@hirelens/domain";

export function getWorkerHealth() {
  return {
    service: "worker",
    status: "ok" as const,
    package: DOMAIN_PACKAGE_NAME,
  };
}

export function startWorker() {
  const environment = parseEnvironment();
  const health = getWorkerHealth();

  console.log(
    JSON.stringify({
      ...health,
      appEnv: environment.APP_ENV,
      message: "Worker foundation is running; queue processing is not implemented yet.",
    }),
  );

  const heartbeat = setInterval(() => undefined, 60_000);
  const stop = () => {
    clearInterval(heartbeat);
    process.exitCode = 0;
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

startWorker();
