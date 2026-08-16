import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputDirectory = resolve(process.cwd(), "test-output", "cjs");

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  resolve(outputDirectory, "package.json"),
  `${JSON.stringify({ type: "commonjs" })}\n`,
  "utf8",
);
