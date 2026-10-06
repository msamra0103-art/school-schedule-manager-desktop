import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = ["index.html", "styles.css", "bootstrap.js", "app.js", "imported-data.js", "vendor/jszip.min.js", "assets/ministry-logo.png", "assets/نموذج-البيانات-الأساسية-المعتمد.xlsx"];
const assets = {};
for (const file of files) {
  const bytes = await readFile(resolve(root, "site", file));
  assets[`/${file}`] = bytes.toString("base64");
}
const source = await readFile(resolve(root, "worker/index.js"), "utf8");
const output = source.replace("__EMBEDDED_ASSET_MAP__", JSON.stringify(assets));
await mkdir(resolve(root, "dist/server"), { recursive: true });
await writeFile(resolve(root, "dist/server/index.js"), output);
