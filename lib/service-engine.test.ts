import assert from "node:assert/strict";
import test from "node:test";
import type { Ticket } from "./platform-types.ts";
import {
  calculateTicketDeadlines,
  isTicketSlaBreached,
  nextTechnicianStatus,
} from "./service-engine.ts";

const openedAt = new Date("2026-08-04T08:00:00.000Z");

test("customer SLA determines normal response and resolution deadlines", () => {
  const deadlines = calculateTicketDeadlines(
    { slaResponseHours: 3, slaResolutionHours: 30 },
    "רגילה",
    openedAt,
  );
  assert.equal(deadlines.responseDueAt, "2026-08-04T11:00:00.000Z");
  assert.equal(deadlines.resolutionDueAt, "2026-08-05T14:00:00.000Z");
});

test("urgent incidents cap resolution time at four hours", () => {
  const deadlines = calculateTicketDeadlines(
    { slaResponseHours: 2, slaResolutionHours: 24 },
    "דחופה",
    openedAt,
  );
  assert.equal(deadlines.resolutionDueAt, "2026-08-04T12:00:00.000Z");
});

test("open overdue tickets breach SLA while closed tickets do not", () => {
  const ticket = {
    id: "SR-1",
    accountId: "account-1",
    site: "ראשי",
    machineId: "",
    type: "תקלה",
    urgency: "רגילה",
    status: "בטיפול",
    description: "",
    contact: "",
    phone: "",
    assignedTo: "טכנאי",
    openedAt: openedAt.toISOString(),
    updatedAt: openedAt.toISOString(),
    resolutionDueAt: "2026-08-04T12:00:00.000Z",
  } satisfies Ticket;
  assert.equal(isTicketSlaBreached(ticket, new Date("2026-08-04T13:00:00Z").getTime()), true);
  assert.equal(isTicketSlaBreached({ ...ticket, status: "נסגרה" }, new Date("2026-08-04T13:00:00Z").getTime()), false);
});

test("technician workflow advances through travel, arrival and work", () => {
  assert.equal(nextTechnicianStatus("תואם ביקור"), "בדרך");
  assert.equal(nextTechnicianStatus("בדרך"), "הגעה ללקוח");
  assert.equal(nextTechnicianStatus("הגעה ללקוח"), "בטיפול");
});
