import { getFirestore } from "firebase-admin/firestore";
import type { UserProfile } from "../../lib/platform-types";

// Keep in sync with BOOTSTRAP_ADMIN_EMAILS in lib/access-invite.ts.
export const OWNER_EMAILS = ["boaz@pacifictrade.co"];

// Where the Firestore database lives; document triggers and jobs run there.
export const DATABASE_REGION = "me-west1";
// Callable functions the site calls directly.
export const CALLABLE_REGION = "europe-west1";
export const TIME_ZONE = "Asia/Jerusalem";
export const APP_URL = "https://boazaidel-png.github.io/mister-bean-platform/";

export const normalizeEmail = (email: unknown) => String(email || "").trim().toLowerCase();
export const isOwnerEmail = (email: unknown) => OWNER_EMAILS.includes(normalizeEmail(email));

type AdminFields = Pick<UserProfile, "email" | "role" | "status" | "adminApprovedBy" | "adminApprovedAt">;

export function isTrustedAdmin(profile: Partial<AdminFields> | undefined | null) {
  if (!profile || profile.role !== "admin" || profile.status !== "active") return false;
  return isOwnerEmail(profile.email)
    || (isOwnerEmail(profile.adminApprovedBy) && Boolean(profile.adminApprovedAt));
}

export type AuditEntry = {
  action: string;
  actorUid?: string;
  actorEmail?: string;
  targetUid?: string;
  targetEmail?: string;
  before?: unknown;
  after?: unknown;
};

/** Appends one entry to the admin-only activity log. */
export async function writeAudit(entry: AuditEntry) {
  await getFirestore().collection("auditLog").add({ at: new Date().toISOString(), ...entry });
}

/** Calendar date (YYYY-MM-DD) in Israel for a moment in time. */
export function israelDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export { addDays, daysBetween, formatShortDate } from "./dates";
