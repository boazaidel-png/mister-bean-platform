import type { CommercialAgreement, Customer, Order } from "./platform-types";

const UNSET_BLEND = "טרם הוגדרה תערובת";
const CLOSED_STATUSES = ["סופק", "בוטל"];

/**
 * Kilograms the contract covers each month: the package's included coffee or
 * the agreed monthly quantity. `agreement` is the one the customer card works
 * with (saved on the card, or built from the active quote); without one, the
 * card's monthly quantity.
 */
export function contractMonthlyKg(customer: Pick<Customer, "monthlyKg">, agreement?: CommercialAgreement) {
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
 * Keeps the month's orders in step with the contract chosen in each customer
 * card:
 * - every customer that is not paused gets an order for the month;
 * - an open order's contract quantity ("לפי חוזה") always follows the
 *   contract, and its requested and approved quantities follow too unless
 *   someone changed them;
 * - delivered and cancelled orders are history and stay as they are.
 * Returns the same array when nothing changed.
 */
export function syncContractOrders(
  orders: Order[],
  customers: Customer[],
  month: string,
  agreementFor: (customer: Customer) => CommercialAgreement | undefined = (customer) => customer.commercialAgreement,
  now = new Date().toISOString(),
): Order[] {
  let next = orders;
  for (const customer of customers) {
    if (customer.status === "בהשהיה") continue;
    const kg = contractMonthlyKg(customer, agreementFor(customer));
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
    if (CLOSED_STATUSES.includes(existing.status) || existing.paid || existing.defaultKg === kg) continue;
    const previousDefault = existing.defaultKg;
    next = next.map((order) => order.id === existing.id
      ? {
          ...order,
          defaultKg: kg,
          requestedKg: order.requestedKg === previousDefault ? kg : order.requestedKg,
          approvedKg: !order.approvedKg || order.approvedKg === previousDefault ? kg : order.approvedKg,
          updatedAt: now,
        }
      : order);
  }
  return next;
}
