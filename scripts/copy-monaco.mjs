// Copy Monaco's runtime assets into public/ so the editor loads from our own
// origin instead of a third-party CDN (unreliable from China). Runs via the
// prebuild/predev npm hooks.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, "node_modules", "monaco-editor", "min", "vs");
const dest = join(root, "public", "monaco", "vs");

if (!existsSync(src)) {
  console.error("monaco-editor package not found — run npm install first");
  process.exit(1);
}
mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });
console.log("Copied Monaco assets to public/monaco/vs");
