import assert from "node:assert/strict";
import test from "node:test";
import { createBusinessBackup, parseBusinessBackup } from "./system-backup.ts";

test("business backup preserves all business and audit records", () => {
  const backup = createBusinessBackup([], [], { leads: [], quotes: [] }, {
    tickets: [], orders: [], tasks: [], machines: [], profitability: [], activities: [{
      id: "audit", accountId: "a", entityType: "customer", entityId: "a",
      action: "updated", summary: "x", actorUid: "u", actorName: "n", createdAt: "now",
    }],
  }, "2026-10-04T00:00:00.000Z");
  const parsed = parseBusinessBackup(JSON.stringify(backup));
  assert.equal(parsed.exportedAt, "2026-10-04T00:00:00.000Z");
  assert.equal(parsed.operations.activities[0]?.id, "audit");
});

test("invalid or foreign backup is rejected", () => {
  assert.throws(() => parseBusinessBackup('{"product":"other"}'));
});
