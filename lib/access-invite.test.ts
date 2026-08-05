import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultProfileAccess,
  isBootstrapAdminEmail,
  isTrustedAdminProfile,
  isValidInviteEmail,
  normalizeInviteEmail,
  resolveInviteEmail,
} from "./access-invite.ts";

test("normalizes customer email before creating an invitation", () => {
  assert.equal(normalizeInviteEmail("  Client@Example.COM "), "client@example.com");
});

test("prefers the quote email and falls back to the lead email", () => {
  assert.equal(
    resolveInviteEmail("quote@example.com", "lead@example.com"),
    "quote@example.com",
  );
  assert.equal(resolveInviteEmail("", "LEAD@Example.com"), "lead@example.com");
});

test("rejects missing, malformed and unsafe invitation emails", () => {
  assert.equal(isValidInviteEmail(""), false);
  assert.equal(isValidInviteEmail("not-an-email"), false);
  assert.equal(isValidInviteEmail("bad/name@example.com"), false);
  assert.equal(resolveInviteEmail("invalid", ""), "");
});

test("only the configured owner emails are bootstrap administrators", () => {
  assert.equal(isBootstrapAdminEmail("BOAZ@PACIFICTRADE.CO"), true);
  assert.equal(isBootstrapAdminEmail("customer@example.com"), false);
});

test("every regular new user defaults to a pending customer, never an administrator", () => {
  assert.deepEqual(defaultProfileAccess("client@example.com"), {
    role: "customer",
    status: "pending",
  });
  assert.deepEqual(defaultProfileAccess("boaz@pacifictrade.co"), {
    role: "admin",
    status: "active",
  });
});

test("non-owner administrators require an explicit owner approval record", () => {
  assert.equal(
    isTrustedAdminProfile({
      email: "manager@example.com",
      role: "admin",
      status: "active",
    }),
    false,
  );
  assert.equal(
    isTrustedAdminProfile({
      email: "manager@example.com",
      role: "admin",
      status: "active",
      adminApprovedBy: "boaz@pacifictrade.co",
      adminApprovedAt: "2026-08-05T00:00:00.000Z",
    }),
    true,
  );
  assert.equal(
    isTrustedAdminProfile({
      email: "customer@example.com",
      role: "customer",
      status: "active",
      adminApprovedBy: "boaz@pacifictrade.co",
      adminApprovedAt: "2026-08-05T00:00:00.000Z",
    }),
    false,
  );
});
