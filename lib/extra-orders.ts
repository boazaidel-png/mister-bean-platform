import type { DeliveryPreference, Order } from "./platform-types";

/**
 * Top-up orders: coffee a customer asks for during the month when they run
 * out, on top of the monthly contract order. They live in the same orders
 * collection, marked kind "extra", and start waiting for the office.
 */

export const MAX_EXTRA_ORDER_KG = 500;
export const CLOSED_ORDER_STATUSES = ["סופק", "בוטל"];

export const isExtraOrder = (order: Pick<Order, "kind">) => order.kind === "extra";
export const contractOrdersOnly = <T extends Pick<Order, "kind">>(orders: T[]) => orders.filter((order) => !isExtraOrder(order));

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

export function validateExtraOrder(input: { kg: number; preference: DeliveryPreference; date?: string }, today = new Date()) {
  if (!Number.isInteger(input.kg) || input.kg <= 0) return "יש להזין כמות בק״ג";
  if (input.kg > MAX_EXTRA_ORDER_KG) return `אפשר להזמין עד ${MAX_EXTRA_ORDER_KG} ק״ג בהזמנה אחת`;
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
