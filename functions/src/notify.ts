import { getFirestore } from "firebase-admin/firestore";
import { onDocumentWrittenWithAuthContext } from "firebase-functions/v2/firestore";
import type { Order, Task, Ticket } from "../../lib/platform-types";
import { activeUsers, adminsOf, customersOf, notifyOnce, serviceOf } from "./push";
import { DATABASE_REGION } from "./shared";

const CLOSED_TICKET = ["נסגרה", "בוטלה על ידי הלקוח"];

const actorOf = (event: { authType: string; authId?: string }) => event.authType === "system" ? "" : event.authId || "";

async function customerName(accountId: string) {
  const account = await getFirestore().doc(`accounts/${accountId}`).get();
  return (account.get("name") as string | undefined) || "לקוח";
}

const monthLabel = (month: string) => {
  const [year, value] = month.split("-");
  return `${Number(value)}/${year}`;
};

/**
 * Service calls: a new call goes to the office, the technicians and the
 * customer's users; a status change goes to the customer, the office and the
 * assigned technician; a new assignment goes to that technician. One write
 * makes at most one notification, even if it changes several things.
 */
export const onTicketWritten = onDocumentWrittenWithAuthContext(
  { document: "accounts/{accountId}/tickets/{ticketId}", region: DATABASE_REGION },
  async (event) => {
    const before = event.data?.before.data() as Ticket | undefined;
    const after = event.data?.after.data() as Ticket | undefined;
    if (!after) return;
    const { accountId } = event.params;
    const path = event.document;
    const statusChanged = Boolean(before) && before?.status !== after.status;
    const assignedTo = after.assignedUid || "";
    const assignmentChanged = Boolean(assignedTo) && before?.assignedUid !== assignedTo;
    if (before && !statusChanged && !assignmentChanged) return;

    const users = await activeUsers();
    const name = await customerName(accountId);
    const urgent = after.urgency === "דחופה" ? "דחופה · " : "";
    const recipients = new Set<string>(adminsOf(users));
    let title: string;
    let body = [after.type, after.site].filter(Boolean).join(" · ");

    if (!before) {
      serviceOf(users).forEach((uid) => recipients.add(uid));
      customersOf(users, accountId).forEach((uid) => recipients.add(uid));
      if (assignedTo) recipients.add(assignedTo);
      title = `קריאת שירות ${urgent}חדשה · ${name}`;
    } else {
      if (assignedTo) recipients.add(assignedTo);
      if (statusChanged) customersOf(users, accountId).forEach((uid) => recipients.add(uid));
      title = statusChanged
        ? `${CLOSED_TICKET.includes(after.status) ? "קריאת שירות נסגרה" : `עדכון בקריאת שירות: ${after.status}`} · ${name}`
        : `קריאת שירות ${urgent}הוקצתה ל${after.assignedTo} · ${name}`;
      if (statusChanged && assignmentChanged) body = `${body} · טכנאי: ${after.assignedTo}`;
    }

    await notifyOnce(`ticket:${path}:${before ? `${after.status}:${assignedTo}` : "new"}`, recipients, {
      title, body, view: "tickets", tag: `ticket:${event.params.ticketId}`,
    }, actorOf(event));
  },
);

/**
 * Coffee orders: when the customer confirms the month's order the office
 * hears about it (and is asked to approve one below the contract); when the
 * office approves, delivers or cancels it, the customer hears about it.
 */
export const onOrderWritten = onDocumentWrittenWithAuthContext(
  { document: "accounts/{accountId}/orders/{orderId}", region: DATABASE_REGION },
  async (event) => {
    const before = event.data?.before.data() as Order | undefined;
    const after = event.data?.after.data() as Order | undefined;
    if (!before || !after) return;
    const { accountId } = event.params;
    const path = event.document;
    const kg = (value: number) => `${Math.round(value)} ק״ג`;

    if (after.customerConfirmedAt && after.customerConfirmedAt !== before.customerConfirmedAt) {
      const users = await activeUsers();
      const name = await customerName(accountId);
      const low = after.requestedKg < after.defaultKg;
      await notifyOnce(`order-confirmed:${path}:${after.customerConfirmedAt}`, adminsOf(users), {
        title: low ? `הזמנה מתחת לחוזה ממתינה לאישורך · ${name}` : `הלקוח אישר הזמנה · ${name}`,
        body: `${kg(after.requestedKg)}${low ? ` במקום ${kg(after.defaultKg)}` : ""} · ${after.blend} · ${monthLabel(after.month)}`,
        view: "orders",
        tag: `order:${event.params.orderId}`,
      }, actorOf(event));
      return;
    }

    const labels: Record<string, string> = { "אושר": "ההזמנה אושרה", "סופק": "ההזמנה סופקה", "בוטל": "ההזמנה בוטלה" };
    if (before.status === after.status || !labels[after.status]) return;
    const users = await activeUsers();
    const name = await customerName(accountId);
    await notifyOnce(`order-status:${path}:${after.status}:${after.updatedAt || ""}`, [...customersOf(users, accountId), ...adminsOf(users)], {
      title: `${labels[after.status]} · ${name}`,
      body: `${kg(after.approvedKg || after.requestedKg)} · ${after.blend} · ${monthLabel(after.month)}`,
      view: "orders",
      tag: `order:${event.params.orderId}`,
    }, actorOf(event));
  },
);

/** Tasks: a new or reassigned task goes to the person it is assigned to and to the office. */
export const onTaskWritten = onDocumentWrittenWithAuthContext(
  { document: "accounts/{accountId}/tasks/{taskId}", region: DATABASE_REGION },
  async (event) => {
    const before = event.data?.before.data() as Task | undefined;
    const after = event.data?.after.data() as Task | undefined;
    if (!after || ["בוצעה", "בוטלה"].includes(after.status)) return;
    const assignedTo = after.assignedUid || "";
    if (before && (!assignedTo || before.assignedUid === assignedTo)) return;

    const users = await activeUsers();
    const due = after.dueDate ? ` · עד ${after.dueDate.split("-").reverse().join("/")}` : "";
    await notifyOnce(`task:${event.document}:${before ? assignedTo : "new"}`, [...adminsOf(users), assignedTo], {
      title: before ? `משימה הוקצתה ל${after.assignedTo} · ${after.type}` : `משימה חדשה · ${after.type}`,
      body: `${after.title}${due}`,
      view: "tasks",
      tag: `task:${event.params.taskId}`,
    }, actorOf(event));
  },
);
