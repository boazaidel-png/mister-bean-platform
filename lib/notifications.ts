import type { Order, Role, Ticket, UserProfile } from "./platform-types";

export type NotificationKind = "order" | "low-order" | "ticket" | "access";

export type AppNotification = {
  /** Changes when the underlying event changes, so a re-sent order shows up again. */
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  at: string;
  target: { type: "order" | "ticket" | "access"; id: string; accountId?: string };
};

/** How far back the bell looks; older events are history, not news. */
export const NOTIFICATION_WINDOW_DAYS = 30;

const UNASSIGNED = "טרם הוקצה";

/**
 * Builds the bell's list from data the app already loads. Administrators get
 * every kind; service staff only service calls; customers nothing.
 * - A customer saving an order marks it "ממתין לאישור" (the database only
 *   lets customers write that status), so those orders are customer orders.
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
  now?: Date;
}): AppNotification[] {
  const { role, customerName } = input;
  if (role !== "admin" && role !== "service") return [];
  const since = new Date((input.now || new Date()).getTime() - NOTIFICATION_WINDOW_DAYS * 86400000).toISOString();
  const list: AppNotification[] = [];

  if (role === "admin") {
    for (const order of input.orders) {
      const at = order.updatedAt || order.createdAt || "";
      if (order.status !== "ממתין לאישור" || at < since) continue;
      const low = order.defaultKg > 0 && order.requestedKg < order.defaultKg;
      list.push({
        id: `order:${order.id}:${at}`,
        kind: low ? "low-order" : "order",
        title: low ? `הזמנה נמוכה מהחוזה · ${customerName(order.accountId)}` : `הזמנה חדשה · ${customerName(order.accountId)}`,
        detail: low
          ? `${Math.round(order.requestedKg)} ק״ג במקום ${Math.round(order.defaultKg)} ק״ג בחוזה · ${order.blend}`
          : `${Math.round(order.requestedKg)} ק״ג · ${order.blend} · ממתינה לאישור`,
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

  return list.sort((left, right) => right.at.localeCompare(left.at));
}

export type NotificationReadState = { since: string; read: string[] };

export const isUnread = (notification: AppNotification, state: NotificationReadState) =>
  notification.at > state.since && !state.read.includes(notification.id);
