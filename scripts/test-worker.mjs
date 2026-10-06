import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";

const { default: worker } = await import("../dist/server/index.js");
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(await readFile(new URL("../drizzle/0000_accounts_and_shared_state.sql", import.meta.url), "utf8"));
class Statement {
  constructor(db, sql, values = []) { this.db = db; this.sql = sql; this.values = values; }
  bind(...values) { return new Statement(this.db, this.sql, values); }
  async first() { return this.db.prepare(this.sql).get(...this.values) || null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.values) }; }
  async run() { return this.db.prepare(this.sql).run(...this.values); }
}
const DB = { prepare: sql => new Statement(sqlite, sql) };
const call = async (path, { userId = "owner-1", email = "owner@example.test", method = "GET", payload } = {}) => {
  const headers = { "oai-authenticated-user-id": userId, "oai-authenticated-user-email": email };
  if (payload !== undefined) headers["content-type"] = "application/json";
  const response = await worker.fetch(new Request(`https://example.test${path}`, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) }), { DB }, {});
  return { status: response.status, data: await response.json() };
};

let result = await call("/api/session");
assert.equal(result.status, 200);
assert.equal(result.data.user.username, "M.samra0103");
assert.equal(result.data.user.role, "full");

const sharedState = { teachers: [{ id: "t1", department: "اللغة العربية" }, { id: "t2", department: "الرياضيات" }], dailySubstitutions: [] };
result = await call("/api/state", { method: "PUT", payload: { state: sharedState } });
assert.equal(result.status, 200);

result = await call("/api/accounts", { method: "POST", payload: { email: "arabic@example.test", username: "arabic.department", displayName: "مسؤول العربية", role: "department", department: "اللغة العربية" } });
assert.equal(result.status, 201);

result = await call("/api/session", { userId: "arabic-1", email: "arabic@example.test" });
assert.equal(result.status, 200);
assert.equal(result.data.user.department, "اللغة العربية");

const ownRecord = { id: "s1", absentTeacherId: "t1", items: [] };
result = await call("/api/substitutions", { userId: "arabic-1", email: "arabic@example.test", method: "PUT", payload: { records: [ownRecord] } });
assert.equal(result.status, 200);

result = await call("/api/substitutions", { userId: "arabic-1", email: "arabic@example.test", method: "PUT", payload: { records: [{ id: "s2", absentTeacherId: "t2", items: [] }] } });
assert.equal(result.status, 403);

result = await call("/api/accounts/1", { method: "PATCH", payload: { role: "department", department: "اللغة العربية", active: true } });
assert.equal(result.status, 400);

result = await call("/api/state");
assert.deepEqual(result.data.state.dailySubstitutions, [ownRecord]);
console.log(JSON.stringify({ primaryAdmin: "passed", sharedState: "passed", departmentScope: "passed", primaryProtection: "passed" }));
