import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../site/imported-data.js", import.meta.url), "utf8");
const state = JSON.parse(source.slice(source.indexOf("=") + 1, source.lastIndexOf(";")).trim());
assert.equal(state.teachers.length, 72);
assert.equal(state.classes.length, 26);
assert.equal(state.assignments.length, 269);
assert.equal(state.schedule.length, 884);

const duplicateAssignments = new Set();
for (const assignment of state.assignments) {
  const key = `${assignment.teacherId}|${assignment.classId}|${assignment.subjectId}`;
  assert.ok(!duplicateAssignments.has(key), `duplicate assignment ${key}`);
  duplicateAssignments.add(key);
  const placed = state.schedule.filter(item => item.assignmentId === assignment.id).length;
  assert.equal(placed, Number(assignment.weeklyCount), `wrong lesson count for ${assignment.id}`);
}

const classSlots = new Set();
for (const lesson of state.schedule) {
  const key = `${lesson.classId}|${lesson.dayId}|${lesson.periodId}`;
  assert.ok(!classSlots.has(key), `class collision ${key}`);
  classSlots.add(key);
}

const byClass = new Map(state.classes.map(item => [item.id, item]));
const profiles = new Map(state.settings.profiles.map(item => [item.id, item]));
const minutes = value => { let [hour, minute] = value.split(":").map(Number); if (hour < 7) hour += 12; return hour * 60 + minute; };
const interval = lesson => {
  const row = profiles.get(byClass.get(lesson.classId).profileId).periods.find(item => Number(item.n) === Number(lesson.periodId));
  return [minutes(row.start), minutes(row.end)];
};
for (let i = 0; i < state.schedule.length; i++) for (let j = i + 1; j < state.schedule.length; j++) {
  const a = state.schedule[i], b = state.schedule[j];
  if (a.teacherId !== b.teacherId || a.dayId !== b.dayId) continue;
  const [as, ae] = interval(a), [bs, be] = interval(b);
  assert.ok(!(as < be && bs < ae), `teacher time collision ${a.teacherId} ${a.dayId}`);
}

console.log(JSON.stringify({ teachers: 72, classes: 26, assignments: 269, lessons: 884, duplicateAssignments: 0, classCollisions: 0, teacherTimeCollisions: 0 }));
