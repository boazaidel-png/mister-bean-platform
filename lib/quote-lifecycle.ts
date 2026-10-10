import type { Lead, Quote } from "./platform-types";

const openStatuses = new Set<Quote["status"]>(["טיוטה", "בבדיקה", "נשלחה"]);

const normalizedName = (quote: Quote) => quote.clientName.trim().toLowerCase();

/**
 * Two quotes belong to the same client when they share a lead, a customer
 * account or a client key, or, as a last resort, the same client name. This is
 * the same grouping the quotes screen uses to show versions under one client.
 */
export function quotesShareClient(left: Quote, right: Quote) {
  if (left.leadId && left.leadId === right.leadId) return true;
  const leftKeys = [left.accountId, left.clientKey].filter(Boolean);
  const rightKeys = [right.accountId, right.clientKey].filter(Boolean);
  if (leftKeys.some((key) => rightKeys.includes(key))) return true;
  const name = normalizedName(left);
  return Boolean(name) && name === normalizedName(right);
}

const approvalTime = (quote: Quote) => quote.approvedAt || quote.updatedAt || "";
const lastEdit = (quote: Quote) => quote.savedAt || quote.updatedAt || "";

/**
 * The approved quote that replaced this one, if any. An open version (draft,
 * in review or sent) of a client whose deal was approved later is no longer
 * active. A version written after the approval, such as an upsell for an
 * existing customer, stays active.
 */
export function supersedingQuote(quote: Quote, quotes: Quote[]) {
  if (!openStatuses.has(quote.status)) return undefined;
  return quotes
    .filter(
      (other) =>
        other.id !== quote.id &&
        other.status === "אושרה" &&
        quotesShareClient(quote, other) &&
        approvalTime(other) >= lastEdit(quote),
    )
    .sort((left, right) => approvalTime(right).localeCompare(approvalTime(left)))[0];
}

export function isSupersededQuote(quote: Quote, quotes: Quote[]) {
  return Boolean(supersedingQuote(quote, quotes));
}

/**
 * The customer account a quote should be attached to when it is approved, so
 * that approving a second version of the same client updates the existing
 * card instead of opening a duplicate. Returns undefined for a new client.
 */
export function existingAccountIdForQuote(
  quote: Quote,
  quotes: Quote[],
  lead?: Lead,
) {
  if (quote.accountId) return quote.accountId;
  if (lead?.convertedAccountId) return lead.convertedAccountId;
  const siblings = quotes
    .filter(
      (other) =>
        other.id !== quote.id && other.accountId && quotesShareClient(quote, other),
    )
    .sort((left, right) => {
      const approved =
        Number(right.status === "אושרה") - Number(left.status === "אושרה");
      return approved || approvalTime(right).localeCompare(approvalTime(left));
    });
  return siblings[0]?.accountId || undefined;
}
