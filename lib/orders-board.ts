import type { CommercialAgreement, MonthlyProfitability, Order, ProfitabilitySaleLine } from "./platform-types";

/**
 * The coffee orders board: every coffee sale of a month in one list, placed
 * on one pipeline. Monthly contract orders and top-ups are orders; extras for
 * the company and employee orders are sale lines of the month's profitability
 * record. Both move through the same stages.
 */

export type OrderStage = "customer" | "approval" | "approved" | "preparing" | "delivered" | "paid" | "cancelled";

/** The pipeline, in order. Cancelled orders sit outside it. */
export const ORDER_STAGES: Array<{ key: Exclude<OrderStage, "cancelled">; label: string }> = [
  { key: "customer", label: "ממתין ללקוח" },
  { key: "approval", label: "לאישורך" },
  { key: "approved", label: "מאושר" },
  { key: "preparing", label: "בהכנה" },
  { key: "delivered", label: "סופק" },
  { key: "paid", label: "שולם" },
];

export const stageLabel = (stage: OrderStage) =>
  stage === "cancelled" ? "בוטל" : ORDER_STAGES.find((item) => item.key === stage)!.label;

export type RowKind = "monthly" | "extra" | "company_extra" | "employees";

export const ROW_KIND_LABELS: Record<RowKind, string> = {
  monthly: "חודשית",
  extra: "השלמה",
  company_extra: "אקסטרה לחברה",
  employees: "עובדים",
};

export type BoardRow = {
  key: string;
  kind: RowKind;
  accountId: string;
  month: string;
  blend: string;
  kg: number;
  /** The contract quantity, for monthly orders. */
  contractKg?: number;
  stage: OrderStage;
  /** Agreed value in shekels, 0 when unknown. */
  value: number;
  deliveredAt?: string;
  updatedAt: string;
  order?: Order;
  sale?: { recordId: string; line: ProfitabilitySaleLine; locked: boolean };
};

export function orderStage(order: Pick<Order, "status" | "paid">): OrderStage {
  if (order.status === "בוטל") return "cancelled";
  if (order.paid) return "paid";
  if (order.status === "סופק") return "delivered";
  if (order.status === "בהכנה") return "preparing";
  if (order.status === "אושר") return "approved";
  if (order.status === "ממתין לאישור") return "approval";
  return "customer";
}

export function saleStage(line: Pick<ProfitabilitySaleLine, "deliveryStatus" | "paid">): OrderStage {
  if (line.deliveryStatus === "בוטל") return "cancelled";
  if (line.paid) return "paid";
  if (line.deliveryStatus === "סופק") return "delivered";
  if (line.deliveryStatus === "מוכן למשלוח" || line.deliveryStatus === "נשלח") return "preparing";
  // The office enters these lines itself, so they start approved.
  return "approved";
}

const orderKg = (order: Order) => Math.max(0, Math.round(order.approvedKg || order.requestedKg || 0));

/**
 * What an order is worth under the customer's agreement: a package month is
 * the package fee plus extra kilograms beyond what it includes; otherwise
 * kilograms at the agreed price. Top-ups are priced as extra kilograms.
 */
export function orderValue(order: Order, agreement?: CommercialAgreement) {
  if (!agreement) return 0;
  const kg = orderKg(order);
  if (order.kind === "extra") return kg * (agreement.extraKgPrice || agreement.beanPricePerKg || 0);
  if (agreement.model === "monthly_package") {
    const included = agreement.packageCount * agreement.packageIncludedKgPerUnit;
    return agreement.packageCount * agreement.packageMonthlyFee + Math.max(0, kg - included) * (agreement.extraKgPrice || 0);
  }
  return kg * (agreement.beanPricePerKg || 0);
}

export function buildBoardRows(input: {
  orders: Order[];
  profitability: MonthlyProfitability[];
  agreementFor: (accountId: string) => CommercialAgreement | undefined;
}): BoardRow[] {
  const rows: BoardRow[] = input.orders.map((order) => ({
    key: `order:${order.id}`,
    kind: order.kind === "extra" ? "extra" : "monthly",
    accountId: order.accountId,
    month: order.month,
    blend: order.blend,
    kg: orderKg(order),
    ...(order.kind === "extra" ? {} : { contractKg: Math.round(order.defaultKg || 0) }),
    stage: orderStage(order),
    value: orderValue(order, input.agreementFor(order.accountId)),
    ...(order.deliveredAt ? { deliveredAt: order.deliveredAt } : {}),
    updatedAt: order.updatedAt || order.createdAt || "",
    order,
  }));
  for (const record of input.profitability) {
    for (const line of record.sales) {
      if ((line.channel !== "company_extra" && line.channel !== "employees") || line.id.startsWith("contract-")) continue;
      rows.push({
        key: `sale:${record.id}:${line.id}`,
        kind: line.channel,
        accountId: record.accountId,
        month: record.month,
        blend: line.blendName,
        kg: Math.max(0, Math.round(line.quantityKg)),
        stage: saleStage(line),
        value: Math.round(line.quantityKg * line.pricePerKg),
        ...(line.deliveredAt ? { deliveredAt: line.deliveredAt } : {}),
        updatedAt: record.updatedAt || "",
        sale: { recordId: record.id, line, locked: record.status === "closed" },
      });
    }
  }
  return rows;
}

/** Orders waiting on the office come first, then the rest of the pipeline in order. */
export function sortRows(rows: BoardRow[]) {
  const rank = (stage: OrderStage) => stage === "cancelled" ? 99 : ORDER_STAGES.findIndex((item) => item.key === stage);
  const attention = (stage: OrderStage) => stage === "approval" ? 0 : 1;
  return [...rows].sort((left, right) =>
    attention(left.stage) - attention(right.stage)
    || rank(left.stage) - rank(right.stage)
    || right.updatedAt.localeCompare(left.updatedAt));
}

export function monthSummary(rows: BoardRow[]) {
  const live = rows.filter((row) => row.stage !== "cancelled");
  const delivered = live.filter((row) => row.stage === "delivered" || row.stage === "paid");
  const unpaid = live.filter((row) => row.stage === "delivered");
  return {
    orderedKg: live.reduce((sum, row) => sum + row.kg, 0),
    orders: live.length,
    customers: new Set(live.map((row) => row.accountId)).size,
    deliveredKg: delivered.reduce((sum, row) => sum + row.kg, 0),
    value: live.reduce((sum, row) => sum + row.value, 0),
    unpaidValue: unpaid.reduce((sum, row) => sum + row.value, 0),
    unpaidCount: unpaid.length,
    byStage: Object.fromEntries([...ORDER_STAGES.map((item) => item.key), "cancelled"].map((stage) =>
      [stage, rows.filter((row) => row.stage === stage).length])) as Record<OrderStage, number>,
  };
}

export const shiftMonth = (month: string, by: number) => {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, value - 1 + by, 1));
  return date.toISOString().slice(0, 7);
};

/** Kilograms ordered in each of the `count` months ending with `endMonth`. */
export function monthHistory(rows: BoardRow[], endMonth: string, count = 12) {
  return Array.from({ length: count }, (_, index) => {
    const month = shiftMonth(endMonth, index - count + 1);
    const live = rows.filter((row) => row.month === month && row.stage !== "cancelled");
    return { month, kg: live.reduce((sum, row) => sum + row.kg, 0), orders: live.length };
  });
}

export type NextAction =
  | { label: string; order: Partial<Order> }
  | { label: string; sale: Partial<ProfitabilitySaleLine> };

/** The one button a row offers: what moves it to the next stage. */
export function nextAction(row: BoardRow, today = new Date().toISOString().slice(0, 10)): NextAction | null {
  if (row.sale) {
    if (row.sale.locked) return null;
    if (row.stage === "approved") return { label: "העברה להכנה", sale: { deliveryStatus: "מוכן למשלוח" } };
    if (row.stage === "preparing") return { label: "סימון כסופק", sale: { deliveryStatus: "סופק", deliveredAt: row.sale.line.deliveredAt || today } };
    if (row.stage === "delivered") return { label: "סימון כשולם", sale: { paid: true } };
    return null;
  }
  const order = row.order!;
  if (row.stage === "customer") return { label: "אישור לפי החוזה", order: { status: "אושר" } };
  if (row.stage === "approval") {
    return { label: "אישור", order: { status: "אושר", ...(order.kind === "extra" || order.customerConfirmedAt ? { approvedKg: order.requestedKg } : {}) } };
  }
  if (row.stage === "approved") return { label: "העברה להכנה", order: { status: "בהכנה" } };
  if (row.stage === "preparing") return { label: "סימון כסופק", order: { status: "סופק", deliveredAt: order.deliveredAt || today } };
  if (row.stage === "delivered") return { label: "סימון כשולם", order: { paid: true } };
  return null;
}
