export function normalizeInviteEmail(email?: string | null) {
  return (email || "").trim().toLowerCase();
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
