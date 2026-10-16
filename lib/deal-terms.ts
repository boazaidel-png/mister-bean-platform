import type { CommercialAgreementModel, CustomerDeal, DealLoan, DealTermsVersion, EquipmentPurchase, Quote } from "./platform-types";

/**
 * A customer's deal over time. The quote it starts from becomes the first
 * version; each change adds a version from the month it applies, and each
 * piece of equipment and each loan keeps its own dates and terms, so a
 * machine added later is paid for from then on without touching the rest.
 */

export const addMonths = (month: string, count: number) => {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year, value - 1 + count, 1)).toISOString().slice(0, 7);
};

export const monthsBetween = (from: string, to: string) => {
  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
};

const positive = (value: unknown) => Math.max(0, Number(value) || 0);
const whole = (value: unknown, minimum = 0) => Math.max(minimum, Math.round(Number(value) || 0));

/** What the quote's own calculation says about the deal (from calculateQuote). */
export type QuoteFigures = {
  model: CommercialAgreementModel;
  equipmentTotal: number;
  saleIncome: number;
  leaseIncome: number;
  /** Monthly operating cost the quote plans (extra costs and service). */
  operatingCost: number;
  financing: { type: string; amount: number; months: number };
};

/** The deal an approved quote starts, from the month the customer starts. */
export function dealFromQuote(quote: Quote, figures: QuoteFigures, startMonth: string, by: string, now = new Date().toISOString()): CustomerDeal {
  const version: DealTermsVersion = {
    id: `terms-${startMonth}`,
    fromMonth: startMonth,
    note: `הסכם התחלתי, מתוך "${quote.versionName}"`,
    sourceQuoteId: quote.id,
    model: figures.model,
    blends: (quote.blends || []).filter((blend) => blend.name && positive(blend.quantityKg) > 0).map((blend) => ({
      blend: blend.name, kg: positive(blend.quantityKg), pricePerKg: positive(blend.pricePerKg), costPerKg: positive(blend.costPerKg),
    })),
    packageCount: whole(quote.packageCount, 1),
    packageMonthlyFee: positive(quote.packageMonthlyFee),
    packageIncludedKgPerUnit: positive(quote.packageIncludedKg),
    extraKgPrice: positive(quote.packageExtraKgPrice),
    monthlyRentalIncome: positive(figures.leaseIncome),
    monthlyServiceIncome: 0,
    operatingCostEstimate: positive(figures.operatingCost),
    clientPayDelayMonths: whole(quote.clientPayTerm),
    coffeeSupplierPayDelayMonths: whole(quote.coffeeSupplierPayTerm),
    createdAt: now,
    createdBy: by,
  };
  const loan: DealLoan | null = figures.financing.type === "loan" && figures.financing.amount > 0 && figures.financing.months > 0
    ? {
        id: `loan-${startMonth}`, description: "מימון הציוד", amount: positive(figures.financing.amount),
        annualInterest: positive(quote.annualInterest), months: whole(figures.financing.months, 1),
        receivedMonth: startMonth, firstPaymentMonth: startMonth, createdAt: now,
      }
    : null;
  // How the supplier is paid, as the quote plans it: supplier financing spreads
  // the whole cost; a loan pays the supplier at once for the part it covers,
  // and the rest is paid at once or, when combined with supplier credit, in installments.
  const total = positive(figures.equipmentTotal);
  const loaned = loan ? Math.min(total, loan.amount) : 0;
  const delay = whole(quote.importerPayTerm);
  const spread = whole(quote.supplierMonths, 1);
  const item = (id: string, description: string, cost: number, installments: number, sale: number, withLoan: boolean): EquipmentPurchase => ({
    id, month: startMonth, description, cost, saleIncome: sale, clientInstallments: 1,
    supplierPayDelayMonths: delay, supplierInstallments: installments, ...(withLoan && loan ? { loanId: loan.id } : {}), createdAt: now,
  });
  const purchases: EquipmentPurchase[] = [];
  if (total > 0) {
    const sale = positive(figures.saleIncome);
    if (figures.financing.type === "supplier") purchases.push(item(`equipment-${startMonth}`, "ציוד לפי ההצעה", total, spread, sale, false));
    else if (loaned > 0) {
      purchases.push(item(`equipment-${startMonth}`, loaned < total ? "ציוד לפי ההצעה, החלק במימון" : "ציוד לפי ההצעה", loaned, 1, loaned < total ? 0 : sale, true));
      if (loaned < total) purchases.push(item(`equipment-${startMonth}-rest`, "ציוד לפי ההצעה, היתרה לספק", total - loaned, quote.combineFinancingAndSupplier ? spread : 1, sale, false));
    } else purchases.push(item(`equipment-${startMonth}`, "ציוד לפי ההצעה", total, 1, sale, false));
  }
  return {
    startMonth,
    contractMonths: whole(quote.clientCostMonths, 1) || 36,
    versions: [version],
    purchases,
    loans: loan ? [loan] : [],
    updatedAt: now,
  };
}

/** The terms in force in a month: the latest version that started by then (the first one before the deal starts). */
export function termsAt(deal: Pick<CustomerDeal, "versions">, month: string): DealTermsVersion | undefined {
  const sorted = [...deal.versions].sort((left, right) => left.fromMonth.localeCompare(right.fromMonth));
  return [...sorted].reverse().find((version) => version.fromMonth <= month) || sorted[0];
}

/** The deal with a change from a month; a change in a month that already has one replaces it. */
export function withVersion(deal: CustomerDeal, version: DealTermsVersion, now = new Date().toISOString()): CustomerDeal {
  const versions = [...deal.versions.filter((item) => item.fromMonth !== version.fromMonth), version]
    .sort((left, right) => left.fromMonth.localeCompare(right.fromMonth));
  return { ...deal, versions, updatedAt: now };
}

/** Monthly kilograms of a version: the package's included coffee, or the blends. */
export function versionKg(version: DealTermsVersion) {
  if (version.model === "monthly_package") return version.packageCount * version.packageIncludedKgPerUnit;
  return version.blends.reduce((sum, blend) => sum + blend.kg, 0);
}

/** Recurring monthly income a version brings, before VAT. */
export function versionMonthlyIncome(version: DealTermsVersion) {
  const coffee = version.model === "monthly_package"
    ? version.packageCount * version.packageMonthlyFee
    : version.blends.reduce((sum, blend) => sum + blend.kg * blend.pricePerKg, 0);
  return coffee + version.monthlyRentalIncome + version.monthlyServiceIncome;
}

/** A loan's fixed monthly repayment (principal and interest). */
export function loanPayment(loan: Pick<DealLoan, "amount" | "months" | "annualInterest">) {
  const months = Math.max(1, loan.months);
  const rate = positive(loan.annualInterest) / 100 / 12;
  if (!rate) return loan.amount / months;
  return (loan.amount * rate) / (1 - (1 + rate) ** -months);
}

/** "פברואר 2027" for a month key. */
export const monthLabel = (month: string) => {
  const [year, value] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(new Date(year, value - 1, 1));
};
