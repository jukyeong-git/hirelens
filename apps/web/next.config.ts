import { loadEnvFile } from "node:process";
import { resolve } from "node:path";

import type { NextConfig } from "next";

try {
  loadEnvFile(resolve(process.cwd(), "../../.env.local"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    throw error;
  }
}

const nextConfig: NextConfig = {
  transpilePackages: ["@hirelens/ai", "@hirelens/database", "@hirelens/domain"],
};

export default nextConfig;
