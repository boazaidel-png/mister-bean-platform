import type { CommercialAgreement, Order, OrderKind } from "./platform-types";

/**
 * The coffee orders board: every coffee sale of a month in one list, placed
 * on one pipeline: the monthly contract order, the customer's top-ups, extras
 * for the company and employee sales are all orders.
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

export type RowKind = OrderKind;

export const ROW_KIND_LABELS: Record<RowKind, string> = {
  contract: "חודשית",
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
  order: Order;
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

const orderKg = (order: Order) => Math.max(0, Math.round(order.approvedKg || order.requestedKg || 0));

/** The price per kilogram a sale outside the contract order is charged by default. */
export function defaultPricePerKg(kind: OrderKind, agreement?: CommercialAgreement) {
  if (!agreement || kind === "employees") return 0;
  return Math.round((agreement.model === "monthly_package" ? agreement.extraKgPrice : agreement.beanPricePerKg || agreement.extraKgPrice) || 0);
}

/**
 * What an order is worth: a contract month under a package is the package fee
 * plus extra kilograms beyond what it includes, otherwise kilograms at the
 * agreed price; any other sale is kilograms at the order's own price.
 */
export function orderValue(order: Order, agreement?: CommercialAgreement) {
  const kg = orderKg(order);
  const kind = order.kind ?? "contract";
  if (kind !== "contract") return kg * (order.pricePerKg ?? defaultPricePerKg(kind, agreement));
  if (!agreement) return 0;
  if (agreement.model === "monthly_package") {
    const included = agreement.packageCount * agreement.packageIncludedKgPerUnit;
    return agreement.packageCount * agreement.packageMonthlyFee + Math.max(0, kg - included) * (agreement.extraKgPrice || 0);
  }
  return kg * (agreement.beanPricePerKg || 0);
}

export function buildBoardRows(input: {
  orders: Order[];
  agreementFor: (accountId: string) => CommercialAgreement | undefined;
}): BoardRow[] {
  return input.orders.map((order) => ({
    key: `order:${order.id}`,
    kind: order.kind ?? "contract",
    accountId: order.accountId,
    month: order.month,
    blend: order.blend,
    kg: orderKg(order),
    ...((order.kind ?? "contract") === "contract" ? { contractKg: Math.round(order.defaultKg || 0) } : {}),
    stage: orderStage(order),
    value: orderValue(order, input.agreementFor(order.accountId)),
    ...(order.deliveredAt ? { deliveredAt: order.deliveredAt } : {}),
    updatedAt: order.updatedAt || order.createdAt || "",
    order,
  }));
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

export type NextAction = { label: string; order: Partial<Order> };

/** The one button a row offers: what moves it to the next stage. */
export function nextAction(row: BoardRow, today = new Date().toISOString().slice(0, 10)): NextAction | null {
  const order = row.order;
  if (row.stage === "customer") return { label: "אישור לפי החוזה", order: { status: "אושר" } };
  if (row.stage === "approval") {
    return { label: "אישור", order: { status: "אושר", ...(order.kind === "extra" || order.customerConfirmedAt ? { approvedKg: order.requestedKg } : {}) } };
  }
  if (row.stage === "approved") return { label: "העברה להכנה", order: { status: "בהכנה" } };
  if (row.stage === "preparing") return { label: "סימון כסופק", order: { status: "סופק", deliveredAt: order.deliveredAt || today } };
  if (row.stage === "delivered") return { label: "סימון כשולם", order: { paid: true } };
  return null;
}
