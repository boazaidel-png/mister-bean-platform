import type { CommercialAgreement, Customer, Order } from "./platform-types";

const UNSET_BLEND = "טרם הוגדרה תערובת";
// Being prepared, delivered or cancelled: the contract no longer changes it.
const CLOSED_STATUSES = ["בהכנה", "סופק", "בוטל"];
/** A new month's order waits for the customer to confirm it. */
export const NEW_ORDER_STATUS = "ממתין לעדכון לקוח";
/** Status of orders opened before NEW_ORDER_STATUS replaced it; shown as the new one. */
export const LEGACY_NEW_ORDER_STATUS = "לפי חוזה";

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
    .filter((order) => order.accountId === accountId && (order.kind ?? "contract") === "contract")
    .sort((left, right) => right.month.localeCompare(left.month) || (right.updatedAt || "").localeCompare(left.updatedAt || ""))[0];
}

/**
 * Keeps the month's orders in step with the contract chosen in each customer
 * card:
 * - every customer that is not paused gets an order for the month;
 * - an open order's contract quantity always follows the
 *   contract, and its requested and approved quantities follow too unless
 *   someone changed them;
 * - orders being prepared, delivered or cancelled stay as they are.
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
    // Top-ups the customer ordered during the month are not the contract order.
    const existing = next.find((order) => order.accountId === customer.id && order.month === month && (order.kind ?? "contract") === "contract");
    if (!existing) {
      const previous = latestOrder(next, customer.id);
      const blend = previous?.blend && previous.blend !== UNSET_BLEND ? previous.blend : customer.contractBlends?.[0] || UNSET_BLEND;
      // Last month's split into blends carries over while it still adds up to the contract quantity.
      const lines = previous?.blendLines?.length && previous.blendLines.reduce((sum, line) => sum + line.kg, 0) === kg ? previous.blendLines : undefined;
      next = [{
        id: `order-${customer.id}-${month}`, accountId: customer.id, month,
        defaultKg: kg, requestedKg: kg, approvedKg: kg,
        status: NEW_ORDER_STATUS, blend, note: "", createdAt: now, updatedAt: now,
        ...(lines ? { blendLines: lines } : {}),
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
          // An order split into blends keeps the quantities it was split into.
          approvedKg: order.blendLines?.length ? order.approvedKg : !order.approvedKg || order.approvedKg === previousDefault ? kg : order.approvedKg,
          updatedAt: now,
        }
      : order);
  }
  return next;
}
