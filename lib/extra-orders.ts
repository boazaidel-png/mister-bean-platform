import type { DeliveryPreference, Order } from "./platform-types";

/**
 * Top-up orders: coffee a customer asks for during the month when they run
 * out, on top of the monthly contract order. They live in the same orders
 * collection, marked kind "extra", and start waiting for the office.
 */

export const MAX_EXTRA_ORDER_KG = 500;
export const CLOSED_ORDER_STATUSES = ["סופק", "בוטל"];

export const isExtraOrder = (order: Pick<Order, "kind">) => order.kind === "extra";
export const isContractOrder = (order: Pick<Order, "kind">) => (order.kind ?? "contract") === "contract";
export const contractOrdersOnly = <T extends Pick<Order, "kind">>(orders: T[]) => orders.filter(isContractOrder);

export const DELIVERY_PREFERENCES: Array<[DeliveryPreference, string]> = [
  ["asap", "הכי מהר שאפשר"],
  ["tomorrow", "מחר"],
  ["date", "בתאריך שאבחר"],
];

const dayKey = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

export function deliveryPreferenceLabel(order: Pick<Order, "deliveryPreference" | "requestedDeliveryDate">) {
  if (order.deliveryPreference === "date" && order.requestedDeliveryDate) {
    const [year, month, day] = order.requestedDeliveryDate.split("-");
    return `ב-${day}/${month}/${year}`;
  }
  if (order.deliveryPreference === "tomorrow") return "מחר";
  if (order.deliveryPreference === "asap") return "הכי מהר שאפשר";
  return "";
}

/**
 * The next delivery under the contract: this month's delivery day when it is
 * still ahead and this month's contract order was not delivered yet,
 * otherwise next month's.
 */
export function nextContractDelivery(deliveryDayOfMonth: number, orders: Order[], today = new Date()) {
  const day = Math.min(28, Math.max(1, Math.round(deliveryDayOfMonth || 1)));
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const month = dayKey(start).slice(0, 7);
  const thisMonth = contractOrdersOnly(orders).find((order) => order.month === month);
  const candidate = new Date(today.getFullYear(), today.getMonth(), day);
  const delivered = thisMonth && (thisMonth.status === "סופק" || Boolean(thisMonth.deliveredAt));
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const date = !delivered && candidate >= todayStart ? candidate : new Date(today.getFullYear(), today.getMonth() + 1, day);
  const days = Math.round((date.getTime() - todayStart.getTime()) / 86400000);
  return { date: dayKey(date), days };
}

/** Coffee delivered to the customer this calendar month, contract and top-ups. */
export function deliveredThisMonthKg(orders: Order[], today = new Date()) {
  const month = dayKey(today).slice(0, 7);
  return orders
    .filter((order) => order.status === "סופק" && (order.deliveredAt || "").slice(0, 7) === month)
    .reduce((sum, order) => sum + Math.max(0, order.approvedKg || order.requestedKg || 0), 0);
}

/** Top-ups still waiting or approved, so the customer sees them instead of ordering twice. */
export const openExtraOrders = (orders: Order[]) =>
  orders.filter((order) => isExtraOrder(order) && !CLOSED_ORDER_STATUSES.includes(order.status));

/** Top-ups in a month may add up to this share of the contract; more needs a word with the office. */
export const EXTRA_ORDER_SHARE = 0.2;

/** Kilograms the customer may still top up this month: 20% of the contract, less top-ups already ordered. */
export function extraAllowanceKg(orders: Order[], contractKg: number, month: string) {
  const limit = Math.floor(Math.max(0, contractKg) * EXTRA_ORDER_SHARE);
  const used = orders
    .filter((order) => isExtraOrder(order) && order.month === month && order.status !== "בוטל")
    .reduce((sum, order) => sum + Math.max(0, order.approvedKg || order.requestedKg || 0), 0);
  return { limit, used, left: Math.max(0, limit - used) };
}

export const CONTACT_OFFICE_MESSAGE = "לכמות גדולה יותר יש ליצור קשר ישירות עם המשרד.";

export function validateExtraOrder(input: { kg: number; preference: DeliveryPreference; date?: string; allowanceKg?: number }, today = new Date()) {
  if (!Number.isInteger(input.kg) || input.kg <= 0) return "יש להזין כמות בק״ג";
  if (input.kg > MAX_EXTRA_ORDER_KG) return `אפשר להזמין עד ${MAX_EXTRA_ORDER_KG} ק״ג בהזמנה אחת`;
  if (input.allowanceKg !== undefined && input.kg > input.allowanceKg) {
    return input.allowanceKg > 0
      ? `אפשר להשלים עד ${input.allowanceKg} ק״ג החודש (20% מהכמות בחוזה). ${CONTACT_OFFICE_MESSAGE}`
      : `מכסת ההשלמה החודשית (20% מהכמות בחוזה) נוצלה. ${CONTACT_OFFICE_MESSAGE}`;
  }
  if (input.preference === "date") {
    if (!input.date) return "יש לבחור תאריך לאספקה";
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    if (input.date < dayKey(tomorrow)) return "תאריך האספקה צריך להיות ממחר והלאה";
  }
  return "";
}

export function newExtraOrder(input: {
  accountId: string;
  kg: number;
  blend: string;
  note: string;
  preference: DeliveryPreference;
  date?: string;
  now?: Date;
}): Order {
  const now = input.now || new Date();
  const timestamp = now.toISOString();
  return {
    id: `extra-${input.accountId}-${now.getTime().toString(36)}`,
    accountId: input.accountId,
    month: dayKey(now).slice(0, 7),
    kind: "extra",
    defaultKg: 0,
    requestedKg: input.kg,
    approvedKg: 0,
    status: "ממתין לאישור",
    blend: input.blend.trim() || "טרם הוגדרה תערובת",
    note: input.note.trim().slice(0, 2000),
    deliveryPreference: input.preference,
    ...(input.preference === "date" && input.date ? { requestedDeliveryDate: input.date } : {}),
    customerConfirmedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/** Consumption of at least this share above the contract, two months running, suggests a bigger contract. */
export const HIGH_USAGE_RATIO = 1.2;
export const HIGH_USAGE_MONTHS = 2;

const shiftMonth = (month: string, by: number) => {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, value - 1 + by, 1));
  return date.toISOString().slice(0, 7);
};

/** Coffee a customer took in a month: the contract order and top-ups, cancelled orders left out. */
export function monthTotalKg(orders: Order[], month: string) {
  return orders
    .filter((order) => order.month === month && order.status !== "בוטל")
    .reduce((sum, order) => sum + Math.max(0, order.approvedKg || order.requestedKg || 0), 0);
}

/**
 * Whether the last two full months (before `month`) each went 20% or more
 * over the contract quantity. Returns the months and totals, or null.
 */
export function highConsumption(orders: Order[], contractKg: number, month: string) {
  if (contractKg <= 0) return null;
  const months = Array.from({ length: HIGH_USAGE_MONTHS }, (_, index) => shiftMonth(month, -(HIGH_USAGE_MONTHS - index)));
  const totals = months.map((item) => monthTotalKg(orders, item));
  // Top-ups stop at 20% of the contract, so reaching it counts.
  if (!totals.every((total) => total >= contractKg * HIGH_USAGE_RATIO)) return null;
  const average = totals.reduce((sum, total) => sum + total, 0) / totals.length;
  return { months, totals, contractKg, average, overPercent: Math.round((average / contractKg - 1) * 100) };
}
