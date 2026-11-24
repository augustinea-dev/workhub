import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "pdfjs-dist", "build");
const to = join(root, "public", "pdfjs");
mkdirSync(to, { recursive: true });
for (const file of ["pdf.min.mjs", "pdf.worker.min.mjs"]) copyFileSync(join(from, file), join(to, file));
