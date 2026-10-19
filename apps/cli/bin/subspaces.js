#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "cli.ts");
const result = spawnSync(
  process.execPath,
  ["--disable-warning=ExperimentalWarning", "--experimental-strip-types", entry, ...process.argv.slice(2)],
  { stdio: "inherit", env: process.env },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
