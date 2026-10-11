import { getFirestore, type DocumentReference } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import type { Customer, Machine, Order, Task } from "../../lib/platform-types";
import { planDailyRun } from "./daily-plan";
import { formatShortDate } from "./dates";
import { activeUsers, adminsOf, customersOf, notifyOnce } from "./push";
import { DATABASE_REGION, israelDateKey, TIME_ZONE } from "./shared";

const OPEN_TASK = ["פתוחה", "בטיפול"];

/** Creates a document unless someone (the site, or an earlier run) already did. */
async function createIfMissing(ref: DocumentReference, data: object) {
  try {
    await ref.create(data);
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 6) return false;
    throw error;
  }
}

const listAll = async <T>(group: string) =>
  (await getFirestore().collectionGroup(group).get()).docs.map((doc) => doc.data() as T);

/** Runs every morning: orders, reminders, maintenance tasks and the day's task summary. */
export const dailyOperations = onSchedule(
  { schedule: "every day 07:30", timeZone: TIME_ZONE, region: DATABASE_REGION, timeoutSeconds: 300 },
  async () => {
    const db = getFirestore();
    const today = israelDateKey();
    const now = new Date().toISOString();
    const [customers, orders, tasks, machines, users] = await Promise.all([
      db.collection("accounts").get().then((snapshot) => snapshot.docs.map((doc) => doc.data() as Customer)),
      listAll<Order>("orders"),
      listAll<Task>("tasks"),
      listAll<Machine>("machines"),
      activeUsers(),
    ]);
    const plan = planDailyRun({ customers, orders, tasks, machines, today, now });

    let ordersCreated = 0;
    for (const order of plan.newOrders) {
      if (await createIfMissing(db.doc(`accounts/${order.accountId}/orders/${order.id}`), order)) ordersCreated += 1;
    }
    // Each new task notifies its assignee and the office through onTaskWritten.
    let tasksCreated = 0;
    for (const task of plan.newTasks) {
      if (await createIfMissing(db.doc(`accounts/${task.accountId}/tasks/${task.id}`), task)) tasksCreated += 1;
    }

    const reminded: string[] = [];
    const unreachable: string[] = [];
    for (const { order, customer, date, stage } of plan.reminders) {
      const recipients = customersOf(users, customer.id);
      const kg = Math.round(order.defaultKg);
      const result = await notifyOnce(`order-reminder:${order.id}:${stage}`, recipients, {
        title: stage === "final" ? "תזכורת אחרונה: אישור הזמנת הקפה" : "הגיע הזמן לאשר את הזמנת הקפה",
        body: `אספקה ב-${formatShortDate(date)}. לפי החוזה ${kg} ק״ג. אפשר להזמין יותר; כמות נמוכה מהחוזה עוברת לאישור.`,
        view: "orders",
        tag: `order:${order.id}`,
      });
      if (!result.fresh) continue;
      (result.sent > 0 ? reminded : unreachable).push(customer.name);
    }
    if (reminded.length || unreachable.length) {
      const parts = [
        reminded.length ? `נשלחה תזכורת ל: ${reminded.join(", ")}` : "",
        unreachable.length ? `ללא התראות בנייד (כדאי להתקשר): ${unreachable.join(", ")}` : "",
      ].filter(Boolean);
      await notifyOnce(`order-reminders-summary:${today}`, adminsOf(users), {
        title: `${reminded.length + unreachable.length} לקוחות טרם אישרו הזמנה`,
        body: parts.join(" · "),
        view: "orders",
      });
    }

    // One morning summary per person: the office sees every open task due
    // today or late, everyone else only the tasks assigned to them.
    const due = tasks.concat(plan.newTasks).filter((task) => OPEN_TASK.includes(task.status) && task.dueDate && task.dueDate.slice(0, 10) <= today);
    const admins = new Set(adminsOf(users));
    const summary = async (uid: string, list: Task[]) => {
      if (!list.length) return;
      const late = list.filter((task) => task.dueDate.slice(0, 10) < today).length;
      await notifyOnce(`tasks-due:${uid}:${today}`, [uid], {
        title: `${list.length} משימות להיום${late ? `, מתוכן ${late} באיחור` : ""}`,
        body: list.slice(0, 3).map((task) => task.title).join(" · "),
        view: "tasks",
        tag: "tasks-due",
      });
    };
    for (const uid of admins) await summary(uid, due);
    const byAssignee = new Map<string, Task[]>();
    for (const task of due) {
      if (!task.assignedUid || admins.has(task.assignedUid)) continue;
      byAssignee.set(task.assignedUid, [...(byAssignee.get(task.assignedUid) || []), task]);
    }
    for (const [uid, list] of byAssignee) await summary(uid, list);

    logger.info("daily run", { today, ordersCreated, tasksCreated, reminded: reminded.length, unreachable: unreachable.length, due: due.length });
  },
);
