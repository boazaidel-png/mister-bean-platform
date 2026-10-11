import type { Order, Role, Ticket, UserProfile } from "./platform-types";

export type NotificationKind = "order" | "low-order" | "ticket" | "access" | "high-usage";

export type AppNotification = {
  /** Changes when the underlying event changes, so a re-sent order shows up again. */
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  at: string;
  target: { type: "order" | "ticket" | "access" | "customer"; id: string; accountId?: string };
};

/** How far back the bell looks; older events are history, not news. */
export const NOTIFICATION_WINDOW_DAYS = 30;

const UNASSIGNED = "טרם הוקצה";

/**
 * Builds the bell's list from data the app already loads. Administrators get
 * every kind; service staff only service calls; customers nothing.
 * - A customer confirming an order sets customerConfirmedAt: at or above the
 *   contract it is approved at once ("אושר"), below it waits ("ממתין לאישור").
 * - An order below the contract quantity is flagged as low.
 * - New, still-unassigned service calls are calls customers opened.
 * - Pending user profiles are access requests.
 */
export function buildNotifications(input: {
  role: Role | null;
  orders: Order[];
  tickets: Ticket[];
  users: UserProfile[];
  customerName: (accountId: string) => string;
  /** Customers two full months at 20% or more over the contract (see highConsumption in extra-orders). */
  highUsage?: Array<{ accountId: string; totals: number[]; contractKg: number; overPercent: number }>;
  now?: Date;
}): AppNotification[] {
  const { role, customerName } = input;
  if (role !== "admin" && role !== "service") return [];
  const since = new Date((input.now || new Date()).getTime() - NOTIFICATION_WINDOW_DAYS * 86400000).toISOString();
  const list: AppNotification[] = [];

  if (role === "admin") {
    for (const order of input.orders) {
      // A customer's own confirmation: approved when at least the contract
      // quantity, otherwise waiting for the office.
      const confirmed = Boolean(order.customerConfirmedAt) && order.status === "אושר";
      const at = order.customerConfirmedAt || order.updatedAt || order.createdAt || "";
      if ((order.status !== "ממתין לאישור" && !confirmed) || at < since) continue;
      if (order.kind === "extra") {
        // A top-up the customer asked for because they ran out.
        if (order.status !== "ממתין לאישור") continue;
        const when = order.deliveryPreference === "date" && order.requestedDeliveryDate
          ? `אספקה ב-${order.requestedDeliveryDate.split("-").reverse().join("/")}`
          : order.deliveryPreference === "tomorrow" ? "אספקה מחר" : "אספקה בהקדם";
        list.push({
          id: `order:${order.id}:${at}`,
          kind: "order",
          title: `נגמר הקפה · הזמנת השלמה · ${customerName(order.accountId)}`,
          detail: `${Math.round(order.requestedKg)} ק״ג · ${order.blend} · ${when}`,
          at,
          target: { type: "order", id: order.id, accountId: order.accountId },
        });
        continue;
      }
      const low = order.defaultKg > 0 && order.requestedKg < order.defaultKg;
      list.push({
        id: `order:${order.id}:${at}`,
        kind: low ? "low-order" : "order",
        title: low ? `הזמנה נמוכה מהחוזה · ${customerName(order.accountId)}`
          : confirmed ? `הלקוח אישר הזמנה · ${customerName(order.accountId)}`
          : `הזמנה חדשה · ${customerName(order.accountId)}`,
        detail: low
          ? `${Math.round(order.requestedKg)} ק״ג במקום ${Math.round(order.defaultKg)} ק״ג בחוזה · ${order.blend}`
          : `${Math.round(order.requestedKg)} ק״ג · ${order.blend} · ${confirmed ? "אושרה" : "ממתינה לאישור"}`,
        at,
        target: { type: "order", id: order.id, accountId: order.accountId },
      });
    }
    for (const user of input.users) {
      if (user.status !== "pending" || (user.createdAt || "") < since) continue;
      list.push({
        id: `access:${user.uid}`,
        kind: "access",
        title: "בקשה להרשאה חדשה",
        detail: `${user.displayName || user.email} · ${user.email}`,
        at: user.createdAt,
        target: { type: "access", id: user.uid },
      });
    }
  }

  for (const ticket of input.tickets) {
    if (ticket.openedAt < since || ticket.assignedTo !== UNASSIGNED || ["נסגרה", "בוטלה על ידי הלקוח"].includes(ticket.status)) continue;
    list.push({
      id: `ticket:${ticket.id}`,
      kind: "ticket",
      title: `קריאת שירות חדשה · ${customerName(ticket.accountId)}`,
      detail: `${ticket.type}${ticket.urgency ? ` · ${ticket.urgency}` : ""}${ticket.site ? ` · ${ticket.site}` : ""}`,
      at: ticket.openedAt,
      target: { type: "ticket", id: ticket.id, accountId: ticket.accountId },
    });
  }

  if (role === "admin") {
    // Two full months running at 20% or more over the contract: time to talk about a bigger contract.
    const month = (input.now || new Date()).toISOString().slice(0, 7);
    for (const high of input.highUsage || []) {
      const { accountId } = high;
      list.push({
        id: `high-usage:${accountId}:${month}`,
        kind: "high-usage",
        title: `צריכה גבוהה מהחוזה · ${customerName(accountId)}`,
        detail: `חודשיים ברצף: ${high.totals.map((total) => Math.round(total)).join(" ו-")} ק״ג מול ${high.contractKg} בחוזה (+${high.overPercent}%). כדאי להציע הגדלת חוזה.`,
        at: `${month}-01T06:00:00.000Z`,
        target: { type: "customer", id: accountId, accountId },
      });
    }
  }

  return list.sort((left, right) => right.at.localeCompare(left.at));
}

export type NotificationReadState = { since: string; read: string[] };

export const isUnread = (notification: AppNotification, state: NotificationReadState) =>
  notification.at > state.since && !state.read.includes(notification.id);
