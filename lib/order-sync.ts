import type { Customer, Order } from "./platform-types";

const UNSET_BLEND = "טרם הוגדרה תערובת";

/** Kilograms a customer's contract covers each month: the package's included coffee or the agreed monthly quantity. */
export function contractMonthlyKg(customer: Pick<Customer, "commercialAgreement" | "monthlyKg">) {
  const agreement = customer.commercialAgreement;
  if (agreement?.model === "monthly_package") {
    return Math.max(0, Math.round(agreement.packageCount * agreement.packageIncludedKgPerUnit));
  }
  return Math.max(0, Math.round(agreement?.monthlyBeanKg || customer.monthlyKg || 0));
}

export const currentMonthKey = (date = new Date()) => date.toISOString().slice(0, 7);

function latestOrder(orders: Order[], accountId: string) {
  return orders
    .filter((order) => order.accountId === accountId)
    .sort((left, right) => right.month.localeCompare(left.month) || (right.updatedAt || "").localeCompare(left.updatedAt || ""))[0];
}

/**
 * Keeps the monthly orders in step with the customer cards: every customer
 * that is not paused gets an order for the month from its contract quantity,
 * and an order still "לפי חוזה" that nobody changed follows a changed
 * contract. Returns the same array when nothing changed.
 */
export function syncContractOrders(orders: Order[], customers: Customer[], month: string, now = new Date().toISOString()): Order[] {
  let next = orders;
  for (const customer of customers) {
    if (customer.status === "בהשהיה") continue;
    const kg = contractMonthlyKg(customer);
    if (kg <= 0) continue;
    const existing = next.find((order) => order.accountId === customer.id && order.month === month);
    if (!existing) {
      const previous = latestOrder(next, customer.id);
      const blend = previous?.blend && previous.blend !== UNSET_BLEND ? previous.blend : customer.contractBlends?.[0] || UNSET_BLEND;
      next = [{
        id: `order-${customer.id}-${month}`, accountId: customer.id, month,
        defaultKg: kg, requestedKg: kg, approvedKg: kg,
        status: "לפי חוזה", blend, note: "", createdAt: now, updatedAt: now,
      }, ...next];
      continue;
    }
    const untouched = existing.status === "לפי חוזה"
      && existing.requestedKg === existing.defaultKg
      && (existing.approvedKg || existing.defaultKg) === existing.defaultKg;
    if (untouched && existing.defaultKg !== kg) {
      next = next.map((order) => order.id === existing.id
        ? { ...order, defaultKg: kg, requestedKg: kg, approvedKg: kg, updatedAt: now }
        : order);
    }
  }
  return next;
}
