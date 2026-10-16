import type { CommercialAgreement, MonthlyExtraCost, Order } from "./platform-types";

/**
 * The economics of a customer deal, computed live from its orders, its
 * agreement and the approved quote; nothing here is entered by hand except
 * one-off monthly costs.
 *
 * Every line has two values: `actual` counts only what was delivered (and
 * fixed costs of months that have begun); `expected` counts everything that
 * is ordered or planned for the month.
 */

export type Pair = { actual: number; expected: number };

/** What the approved quote plans per contract month (from calculateQuote). */
export type QuotePlan = {
  contractMonths: number;
  /** One row per month from the contract's first month. */
  rows: Array<{ equipmentPayment: number; financingIn: number; loanPayment: number; operatingCost: number }>;
  averageMonthlyProfit: number;
  totalContractProfit: number;
};

export type DealInput = {
  agreement?: CommercialAgreement;
  plan?: QuotePlan;
  /** First month of the contract (yyyy-mm). */
  startMonth: string;
  contractMonths: number;
  /** Monthly kilograms under the contract. */
  contractKg: number;
  /** This customer's orders. */
  orders: Order[];
  extraCosts: (month: string) => MonthlyExtraCost[];
  /** One-off income entered for a month. */
  extraIncome?: (month: string) => MonthlyExtraCost[];
  /** What a kilogram of a blend costs us, when the order does not say. */
  blendCost: (blend: string) => number;
  /** The current month (yyyy-mm); later months have no actual values yet. */
  today: string;
  /**
   * The deal by month, when the customer's deal is set up: the terms in force
   * in each month, what a blend cost then, and the month's equipment, loan,
   * equipment-sale and operating money. A real operating cost entered for a
   * month replaces the estimate. Without these, the agreement and the quote's plan are used.
   */
  agreementAt?: (month: string) => CommercialAgreement | undefined;
  contractKgAt?: (month: string) => number;
  blendCostAt?: (month: string, blend: string) => number;
  /** loanFundedEquipment: paid to the supplier from a loan's money; in the cashflow only, as its cost is the loan's repayments. */
  money?: (month: string) => { equipment: number; financing: number; equipmentSale: number; operating: number; loanFundedEquipment?: number };
  /** A customer in a pilot: equipment by the deal is not counted (usually used equipment, nothing owed to the importer). */
  pilot?: boolean;
  /** Payment terms in force in a month, in months after it (0 = the same month), and loan money received in a month. */
  clientPayDelayAt?: (month: string) => number;
  coffeePayDelayAt?: (month: string) => number;
  loanInAt?: (month: string) => number;
};

export const REVENUE_LINES = [
  ["contract", "חבילה / פולים בחוזה"],
  ["extraKg", "ק״ג מעבר לחבילה"],
  ["topUps", "הזמנות השלמה"],
  ["companyExtra", "אקסטרה לחברה"],
  ["employees", "מכירות לעובדים"],
  ["rental", "שכירות ציוד"],
  ["service", "שירות"],
  ["equipmentSale", "מכירת ציוד"],
  ["other", "הכנסות נוספות"],
] as const;

export const COST_LINES = [
  ["beans", "פולי קפה"],
  ["equipment", "ציוד ותשלומים לספק"],
  ["financing", "החזר מימון"],
  ["operating", "תפעול ושירות"],
  ["extra", "הוצאות נוספות"],
] as const;

export type RevenueKey = (typeof REVENUE_LINES)[number][0];
export type CostKey = (typeof COST_LINES)[number][0];

export type DealMonth = {
  month: string;
  /** 1 for the contract's first month; 0 or less before it. */
  index: number;
  inContract: boolean;
  revenue: Record<RevenueKey, Pair>;
  costs: Record<CostKey, Pair>;
  extraCosts: MonthlyExtraCost[];
  extraIncome: MonthlyExtraCost[];
  kg: Pair;
  totalRevenue: Pair;
  totalCost: Pair;
  profit: Pair;
};

const zero = (): Pair => ({ actual: 0, expected: 0 });
const DELIVERED = ["סופק"];

export const monthsBetween = (from: string, to: string) => {
  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
};

export const addMonths = (month: string, count: number) => {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year, value - 1 + count, 1)).toISOString().slice(0, 7);
};

const orderKg = (order: Order) => Math.max(0, Math.round(order.approvedKg || order.requestedKg || 0));
const isDelivered = (order: Order) => DELIVERED.includes(order.status) || Boolean(order.paid);

export function dealMonth(input: DealInput, month: string): DealMonth {
  const { plan } = input;
  const agreement = input.agreementAt ? input.agreementAt(month) : input.agreement;
  const contractKg = input.contractKgAt ? input.contractKgAt(month) : input.contractKg;
  const index = monthsBetween(input.startMonth, month) + 1;
  const inContract = index >= 1 && index <= input.contractMonths;
  const started = month <= input.today;
  const revenue = Object.fromEntries(REVENUE_LINES.map(([key]) => [key, zero()])) as Record<RevenueKey, Pair>;
  const costs = Object.fromEntries(COST_LINES.map(([key]) => [key, zero()])) as Record<CostKey, Pair>;
  const kg = zero();
  const add = (pair: Pair, value: number, delivered: boolean) => {
    pair.expected += value;
    if (delivered) pair.actual += value;
  };
  /** Fixed amounts count as actual once their month has begun. */
  const fixed = (pair: Pair, value: number) => add(pair, value, started);

  const live = input.orders.filter((order) => order.month === month && order.status !== "בוטל");
  const contractOrder = live.find((order) => (order.kind ?? "contract") === "contract");
  const costOf = (blend: string) => input.blendCostAt?.(month, blend) || input.blendCost(blend) || agreement?.beanCostPerKg || 0;
  // An order of several blends costs the average of its blends, weighted by kilograms.
  const beanCost = (order: Order) => {
    if (order.costPerKg !== undefined) return order.costPerKg;
    const lines = (order.blendLines || []).filter((line) => line.kg > 0);
    if (!lines.length) return costOf(order.blend);
    const kg = lines.reduce((sum, line) => sum + line.kg, 0);
    return lines.reduce((sum, line) => sum + line.kg * costOf(line.blend), 0) / kg;
  };
  const extraPrice = agreement
    ? (agreement.model === "monthly_package" ? agreement.extraKgPrice : agreement.beanPricePerKg || agreement.extraKgPrice) || 0
    : 0;

  // The month's contract coffee: the package fee plus kilograms beyond it, or kilograms at the agreed price.
  if (agreement && (contractOrder || inContract)) {
    const ordered = contractOrder ? orderKg(contractOrder) : contractKg;
    const delivered = Boolean(contractOrder && isDelivered(contractOrder));
    if (agreement.model === "monthly_package") {
      add(revenue.contract, agreement.packageCount * agreement.packageMonthlyFee, delivered);
      const included = agreement.packageCount * agreement.packageIncludedKgPerUnit;
      add(revenue.extraKg, Math.max(0, ordered - included) * (agreement.extraKgPrice || 0), delivered);
    } else {
      add(revenue.contract, ordered * (agreement.beanPricePerKg || 0), delivered);
    }
    add(kg, ordered, delivered);
    add(costs.beans, ordered * (contractOrder ? beanCost(contractOrder) : agreement.beanCostPerKg || 0), delivered);
  }

  for (const order of live) {
    const kind = order.kind ?? "contract";
    if (kind === "contract") continue;
    const quantity = orderKg(order);
    const delivered = isDelivered(order);
    const price = order.pricePerKg ?? (kind === "employees" ? 0 : extraPrice);
    const line = kind === "extra" ? revenue.topUps : kind === "company_extra" ? revenue.companyExtra : revenue.employees;
    add(line, quantity * price, delivered);
    add(kg, quantity, delivered);
    add(costs.beans, quantity * beanCost(order), delivered);
  }

  if (agreement && inContract) {
    fixed(revenue.rental, agreement.monthlyRentalIncome || 0);
    fixed(revenue.service, agreement.monthlyServiceIncome || 0);
  }
  const extraCosts = input.extraCosts(month);
  const extraTotal = extraCosts.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  if (input.money) {
    // The deal's own dates and terms: each purchase, each loan; a real operating cost replaces the estimate.
    const money = input.money(month);
    fixed(revenue.equipmentSale, money.equipmentSale);
    fixed(costs.equipment, money.equipment);
    fixed(costs.financing, money.financing);
    if (!extraCosts.length) fixed(costs.operating, money.operating);
  } else {
    if (agreement?.oneTimeEquipmentIncomeMonth === month) fixed(revenue.equipmentSale, agreement.oneTimeEquipmentIncome || 0);
    // What the approved quote plans for this contract month: equipment
    // payments (net of what a loan paid for), loan repayments and operating costs.
    const row = plan && index >= 1 ? plan.rows[index - 1] : undefined;
    if (row) {
      fixed(costs.equipment, Math.max(0, row.equipmentPayment - row.financingIn));
      fixed(costs.financing, row.loanPayment);
      fixed(costs.operating, row.operatingCost);
    }
  }
  fixed(costs.extra, extraTotal);
  const extraIncome = input.extraIncome?.(month) || [];
  fixed(revenue.other, extraIncome.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));

  const sum = (lines: Record<string, Pair>) => Object.values(lines).reduce((total, pair) => ({
    actual: total.actual + pair.actual,
    expected: total.expected + pair.expected,
  }), zero());
  const totalRevenue = sum(revenue);
  const totalCost = sum(costs);
  return {
    month, index, inContract, revenue, costs, extraCosts, extraIncome, kg, totalRevenue, totalCost,
    profit: { actual: totalRevenue.actual - totalCost.actual, expected: totalRevenue.expected - totalCost.expected },
  };
}

/**
 * The whole contract: every month from its start to its end. `toDate` is
 * what actually happened until this month; `forecast` adds the expected
 * months still ahead; `target` is the profit the approved quote planned.
 */
export function dealPeriod(input: DealInput) {
  const months = Array.from({ length: Math.max(1, input.contractMonths) }, (_, index) => dealMonth(input, addMonths(input.startMonth, index)));
  const past = months.filter((item) => item.month <= input.today);
  const ahead = months.filter((item) => item.month > input.today);
  const toDate = past.reduce((sum, item) => sum + item.profit.actual, 0);
  return {
    months,
    elapsed: past.length,
    toDate,
    revenueToDate: past.reduce((sum, item) => sum + item.totalRevenue.actual, 0),
    costToDate: past.reduce((sum, item) => sum + item.totalCost.actual, 0),
    forecast: toDate + ahead.reduce((sum, item) => sum + item.profit.expected, 0),
    target: input.plan?.totalContractProfit ?? null,
    endMonth: addMonths(input.startMonth, Math.max(1, input.contractMonths) - 1),
  };
}

export type CashflowMonth = {
  month: string;
  /** What the customer pays this month, by the payment terms of the month it is for. */
  fromCustomer: number;
  /** Loan money received this month. */
  loanIn: number;
  beans: number;
  equipment: number;
  financing: number;
  operating: number;
  extra: number;
  totalIn: number;
  totalOut: number;
  net: number;
  /** Running sum of net from the first month shown. */
  cumulative: number;
  /** Before the current month: what actually happened; from it on: expected. */
  past: boolean;
};

/**
 * When the money of a deal comes in and goes out, month by month. A month's
 * revenue is paid by the customer as many months later as the terms of that
 * month say; the coffee is paid to the supplier on the supplier's terms;
 * equipment, loans and operating costs fall in the month they are paid.
 * Past months count what was delivered, later months what is expected.
 */
export function dealCashflow(input: DealInput, fromMonth: string, toMonth: string): CashflowMonth[] {
  const span = monthsBetween(fromMonth, toMonth) + 1;
  if (span <= 0) return [];
  // Revenue and coffee of earlier months can still be paid inside the range.
  const lookBack = 12;
  const basis = (month: string) => {
    const data = dealMonth(input, month);
    const actual = month < input.today;
    const pick = (pair: Pair) => actual ? pair.actual : pair.expected;
    return { data, pick };
  };
  const rows = Array.from({ length: span }, (_, index): CashflowMonth => ({
    month: addMonths(fromMonth, index), fromCustomer: 0, loanIn: 0, beans: 0, equipment: 0, financing: 0, operating: 0, extra: 0,
    totalIn: 0, totalOut: 0, net: 0, cumulative: 0, past: addMonths(fromMonth, index) < input.today,
  }));
  const at = (month: string) => rows[monthsBetween(fromMonth, month)];
  for (let index = -lookBack; index < span; index += 1) {
    const month = addMonths(fromMonth, index);
    const { data, pick } = basis(month);
    const customerPays = at(addMonths(month, Math.max(0, Math.round(input.clientPayDelayAt?.(month) || 0))));
    if (customerPays) customerPays.fromCustomer += pick(data.totalRevenue);
    const supplierPaid = at(addMonths(month, Math.max(0, Math.round(input.coffeePayDelayAt?.(month) || 0))));
    if (supplierPaid) supplierPaid.beans += pick(data.costs.beans);
    const row = at(month);
    if (!row) continue;
    row.equipment += pick(data.costs.equipment) + (input.money?.(month).loanFundedEquipment || 0);
    row.financing += pick(data.costs.financing);
    row.operating += pick(data.costs.operating);
    row.extra += pick(data.costs.extra);
    row.loanIn += input.loanInAt?.(month) || 0;
  }
  let cumulative = 0;
  for (const row of rows) {
    row.totalIn = row.fromCustomer + row.loanIn;
    row.totalOut = row.beans + row.equipment + row.financing + row.operating + row.extra;
    row.net = row.totalIn - row.totalOut;
    cumulative += row.net;
    row.cumulative = cumulative;
  }
  return rows;
}
