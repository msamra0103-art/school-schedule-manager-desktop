import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const worker = await readFile(resolve("dist/server/index.js"), "utf8");
const manifest = JSON.parse(await readFile(resolve("dist/.openai/hosting.json"), "utf8"));
await readFile(resolve("dist/.openai/drizzle/0000_accounts_and_shared_state.sql"), "utf8");
assert.equal(manifest.d1, "DB");
assert.ok(worker.includes("async fetch(request,env"));
assert.ok(worker.includes("/api/session"));
assert.ok(worker.includes("/index.html"));
console.log("Artifact is valid and contains the authenticated Worker API");
