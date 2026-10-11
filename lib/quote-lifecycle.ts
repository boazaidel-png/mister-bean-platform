import type { CommercialAgreement, Customer, Lead, Quote } from "./platform-types";

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

/**
 * The quote the card works from: the one chosen as active, or, when none was
 * chosen (or it no longer exists), the latest approved quote.
 */
export function activeQuoteFor(customer: Pick<Customer, "activeQuoteId">, quotes: Quote[]) {
  const chosen = customer.activeQuoteId
    ? quotes.find((quote) => quote.id === customer.activeQuoteId)
    : undefined;
  if (chosen) return chosen;
  return [...quotes]
    .filter((quote) => quote.status === "אושרה")
    .sort((left, right) =>
      (right.approvedAt || right.updatedAt || "").localeCompare(left.approvedAt || left.updatedAt || ""),
    )[0];
}

/**
 * The customer fields that change when a quote becomes the one we work with:
 * the agreement is rebuilt from the quote (`fromQuote` is
 * commercialAgreementFromQuote of it), while the agreement dates already
 * set on the card are kept.
 */
export function customerUpdateForActiveQuote(
  customer: Customer,
  quote: Quote,
  fromQuote: CommercialAgreement,
  timestamp = new Date().toISOString(),
): Pick<Customer, "activeQuoteId" | "commercialAgreement" | "monthlyKg" | "contractBlends"> {
  const previous = customer.commercialAgreement;
  const agreement: CommercialAgreement = {
    ...fromQuote,
    status: "active",
    effectiveFrom: previous?.effectiveFrom || customer.contractStart || undefined,
    effectiveTo: previous?.effectiveTo || customer.contractEnd || undefined,
    oneTimeEquipmentIncomeMonth:
      fromQuote.oneTimeEquipmentIncomeMonth ||
      previous?.oneTimeEquipmentIncomeMonth ||
      (fromQuote.oneTimeEquipmentIncome > 0 ? timestamp.slice(0, 7) : undefined),
    updatedAt: timestamp,
  };
  const blends = Array.from(
    new Set(
      quote.blends
        .filter((blend) => blend.quantityKg > 0)
        .map((blend) => blend.name.trim())
        .filter(Boolean),
    ),
  );
  return {
    activeQuoteId: quote.id,
    commercialAgreement: agreement,
    monthlyKg:
      agreement.model === "monthly_package"
        ? agreement.packageCount * agreement.packageIncludedKgPerUnit
        : agreement.monthlyBeanKg,
    contractBlends: blends.length ? blends : customer.contractBlends,
  };
}
