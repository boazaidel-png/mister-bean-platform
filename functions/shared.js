import { getFirestore } from "firebase-admin/firestore";

// Keep in sync with BOOTSTRAP_ADMIN_EMAILS in lib/access-invite.ts.
export const OWNER_EMAILS = ["boaz@pacifictrade.co"];

// Where the Firestore database lives; document triggers must run there.
export const DATABASE_REGION = "me-west1";

export const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
export const isOwnerEmail = (email) => OWNER_EMAILS.includes(normalizeEmail(email));

export function isTrustedAdmin(profile) {
  if (!profile || profile.role !== "admin" || profile.status !== "active") return false;
  return isOwnerEmail(profile.email)
    || (isOwnerEmail(profile.adminApprovedBy) && Boolean(profile.adminApprovedAt));
}

/** Appends one entry to the admin-only activity log. */
export async function writeAudit(entry) {
  await getFirestore().collection("auditLog").add({ at: new Date().toISOString(), ...entry });
}
