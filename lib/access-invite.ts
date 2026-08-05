export function normalizeInviteEmail(email?: string | null) {
  return (email || "").trim().toLowerCase();
}

export const BOOTSTRAP_ADMIN_EMAILS = [
  "boazaidel@gmail.com",
  "boaz@pacifictrade.co",
] as const;

export function isBootstrapAdminEmail(email?: string | null) {
  return BOOTSTRAP_ADMIN_EMAILS.includes(
    normalizeInviteEmail(email) as (typeof BOOTSTRAP_ADMIN_EMAILS)[number],
  );
}

export function isTrustedAdminProfile(profile: {
  email?: string | null;
  role?: string | null;
  status?: string | null;
  adminApprovedBy?: string | null;
  adminApprovedAt?: string | null;
}) {
  if (profile.role !== "admin" || profile.status !== "active") return false;
  if (isBootstrapAdminEmail(profile.email)) return true;
  return (
    isBootstrapAdminEmail(profile.adminApprovedBy) &&
    Boolean(profile.adminApprovedAt)
  );
}

export function defaultProfileAccess(email?: string | null) {
  return isBootstrapAdminEmail(email)
    ? ({ role: "admin", status: "active" } as const)
    : ({ role: "customer", status: "pending" } as const);
}

export function isValidInviteEmail(email?: string | null) {
  const normalized = normalizeInviteEmail(email);
  return (
    normalized.length <= 254 &&
    !normalized.includes("/") &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  );
}

export function resolveInviteEmail(
  quoteEmail?: string | null,
  leadEmail?: string | null,
) {
  const normalized = normalizeInviteEmail(quoteEmail || leadEmail);
  return isValidInviteEmail(normalized) ? normalized : "";
}
