import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_IMAGE_BYTES,
  passwordSecurityError,
  safeStorageFileName,
  validateTicketFiles,
} from "./security.ts";

test("requires a reasonably strong local password", () => {
  assert.match(passwordSecurityError("short1"), /12/);
  assert.match(passwordSecurityError("abcdefghijkl"), /מספר/);
  assert.equal(passwordSecurityError("סיסמה-בטוחה-2026"), "");
});

test("accepts only bounded image and video evidence", () => {
  assert.equal(
    validateTicketFiles([{ name: "machine.jpg", size: 1024, type: "image/jpeg" }]),
    "",
  );
  assert.match(
    validateTicketFiles([{ name: "script.svg", size: 1024, type: "image/svg+xml" }]),
    /אינו מסוג נתמך/,
  );
  assert.match(
    validateTicketFiles([
      { name: "large.png", size: MAX_IMAGE_BYTES + 1, type: "image/png" },
    ]),
    /גדול מדי/,
  );
});

test("creates storage-safe names without preserving path characters", () => {
  assert.equal(
    safeStorageFileName("../../machine photo.JPG", "safe-id"),
    "safe-id-machine-photo.jpg",
  );
});
