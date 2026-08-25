import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean)
  .filter((file) => ![".pdf", ".png", ".jpg", ".jpeg"].includes(extname(file).toLowerCase()))
  .filter((file) => file !== ".env.local");

const checks = [
  { name: "OpenAI secret", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/u },
  {
    name: "populated Supabase secret",
    pattern:
      /^[ \t]*SUPABASE_SECRET_KEY[ \t]*=[ \t]*(?:sb_secret_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})/mu,
  },
  { name: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u },
];

const findings: string[] = [];
for (const file of files) {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const check of checks) {
    if (check.pattern.test(text)) findings.push(`${file}: ${check.name}`);
  }
}

if (findings.length > 0) {
  console.error(`Privacy scan failed with ${findings.length} potential secret finding(s).`);
  for (const finding of findings) console.error(finding);
  process.exit(1);
}

console.log(
  `Privacy scan passed across ${files.length} text files; no committed secret pattern found.`,
);
