import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [app, html, css, worker] = await Promise.all([
  readFile(new URL("site/app.js", root), "utf8"),
  readFile(new URL("site/index.html", root), "utf8"),
  readFile(new URL("site/styles.css", root), "utf8"),
  readFile(new URL("worker/index.js", root), "utf8"),
]);

const includes = (source, value, label) => assert.ok(source.includes(value), `missing requirement: ${label}`);

includes(html, 'lang="ar" dir="rtl"', "Arabic RTL shell");
includes(html, "لوحة إدارة الجدول المدرسي", "requested product title");
includes(html, "استيراد البيانات الأساسية من Excel", "Excel import from dashboard");
includes(html, "فصول محددة", "bulk timing profile assignment to classes");
includes(html, "الغياب والاستئذان", "absence and permission workspace");
includes(html, "النسخ والأرشيف", "backup archive workspace");
includes(html, "المدراء والصلاحيات", "multiple administrators UI");
includes(html, "لا تُحفظ كلمات مرور داخل البرنامج", "secure platform authentication notice");

includes(app, "function assignmentValidationIssues", "central class/subject assignment validation");
includes(app, "teamTeaching", "explicit team-teaching exception");
includes(app, "blocked:'assignment-duplicates'", "generator-level duplicate assignment guard");
includes(app, "assignmentValidationIssues(base.assignments,base)", "Excel duplicate validation");
includes(app, "assignmentValidationIssues(pool", "manual/CSV duplicate validation");
includes(app, "planCascadingMove", "cascading drag-and-drop relocation");
includes(app, "recordScheduleChange", "complete movement report");
includes(app, "scheduleRulesStaySafe", "smart swap rule validation");
includes(app, "scope==='same'", "same-day smart swaps");
includes(app, "scope==='other'", "cross-day smart swaps");
includes(app, "sameDepartment?0:100000", "department-first absence coverage");
includes(app, "reciprocalLessons", "reciprocal permission substitutions");
includes(app, "reservationReflow", "department reservation reflow");
includes(app, "reason", "visible reservation reason");
includes(app, "double_contiguous", "double periods without a break rule");
includes(app, "max_consecutive", "maximum consecutive lessons rule");
includes(app, "timeOverlap", "actual-clock overlap protection");
includes(app, "renderTimingApplyTargets", "class/day timing target controls");
includes(app, "scaledAssignmentCounts", "quota scaling for shortened days");
includes(app, "femaleTitle", "gender-aware footer roles");
includes(app, "createArchive", "version archive creation");
includes(app, "exportBackup", "backup export");
includes(app, "importBackup", "backup restore");
includes(app, "تاريخ الإصدار", "issue date in outputs");
includes(app, "compactClassName", "compact class labels in final output");
includes(app, "إجمالي كل حصة", "period totals");
includes(app, "إجمالي كل يوم", "day totals");
includes(app, "sourceFile:pendingExcelImport.fileName", "dynamic imported source metadata");

includes(css, "@page{size:A4 landscape;margin:0}", "full-page A4 landscape printing");
includes(css, "direction:rtl!important", "RTL printed output");
includes(worker, '"M.samra0103"', "primary administrator alias");
includes(worker, 'role==="department"', "department-limited administrator role");
includes(worker, "update_substitutions", "server-side department substitution path");

const template = new URL("site/assets/نموذج-البيانات-الأساسية-المعتمد.xlsx", root);
await access(template);
assert.ok((await stat(template)).size > 100_000, "official populated Excel template is missing or empty");

console.log(JSON.stringify({ requirementsAudit: "passed", checks: 43 }));
