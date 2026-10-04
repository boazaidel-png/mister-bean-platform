import assert from "node:assert/strict";
import test from "node:test";
import { reconcileFilterReplacementTask, updateTaskStatus } from "./maintenance-engine.ts";
import type { Machine, Task } from "./platform-types.ts";

const machine: Machine = {
  id: "m-1", accountId: "a-1", site: "ראשי", model: "F15", serial: "123",
  status: "פעילה", commercial: "השכרה", location: "מטבח", lastService: "", nextService: "",
  filterReplacementDue: "2026-11-01",
};

test("filter maintenance task is created once", () => {
  const first = reconcileFilterReplacementTask([], machine, "בר", new Date("2026-10-01T00:00:00Z"));
  const second = reconcileFilterReplacementTask(first, machine, "בר", new Date("2026-10-02T00:00:00Z"));
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(second[0].dueDate, "2026-11-01");
});

test("rescheduling replaces pending task but keeps completed history", () => {
  const old = reconcileFilterReplacementTask([], machine, "בר")[0];
  const completed: Task = { ...old, status: "בוצעה", completedAt: "2026-11-01T10:00:00Z" };
  const next = reconcileFilterReplacementTask([completed, { ...old, id: "pending" }], { ...machine, filterReplacementDue: "2027-05-01" }, "בר");
  assert.equal(next.filter((task) => task.status === "בוצעה").length, 1);
  assert.equal(next.filter((task) => task.status === "פתוחה").length, 1);
  assert.equal(next.find((task) => task.status === "פתוחה")?.dueDate, "2027-05-01");
});

test("task status update is idempotent and clears completion when reopened", () => {
  const task: Task = { id: "t", accountId: "a", title: "x", type: "x", dueDate: "2026-01-01", priority: "רגילה", status: "בוצעה", assignedTo: "בר", completedAt: "old" };
  const next = updateTaskStatus([task], "t", "פתוחה", "now");
  assert.equal(next[0].completedAt, undefined);
  assert.deepEqual(updateTaskStatus(next, "t", "פתוחה", "later"), next);
});
