import assert from "node:assert/strict";
import test from "node:test";
import {
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
