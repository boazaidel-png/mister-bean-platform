import type { MonthlyProfitability, Order, ProfitabilitySaleLine } from "./platform-types";

/**
 * Before sales became orders (15.10), extras for the company and employee
 * sales were typed as lines on a month's profitability page. Those lines are
 * still stored there, untouched. This shows each of them as an order on the
 * screen, so the orders board and the profitability count them again.
 *
 * Nothing here writes to the database: the orders are built on every render
 * and carry `legacySale`, which keeps them out of saving and editing.
 */

/** Lines the office typed itself; contract lines were derived from the month's order. */
const isTypedSale = (line: ProfitabilitySaleLine) =>
  !line.id.startsWith("contract-") && line.channel !== "contract";

/** The order status a line had on the board before the change. */
function statusOf(line: ProfitabilitySaleLine): Order["status"] {
  if (line.deliveryStatus === "בוטל") return "בוטל";
  if (line.deliveryStatus === "סופק") return "סופק";
  if (line.deliveryStatus === "מוכן למשלוח" || line.deliveryStatus === "נשלח") return "בהכנה";
  // The office entered these lines itself, so they were shown as approved.
  return "אושר";
}

export function legacySaleOrders(records: MonthlyProfitability[]): Order[] {
  const orders: Order[] = [];
  for (const record of records) {
    for (const line of record.sales || []) {
      if (!isTypedSale(line)) continue;
      const kg = Math.max(0, Number(line.quantityKg) || 0);
      orders.push({
        id: `legacy-sale-${record.id}-${line.id}`,
        accountId: record.accountId,
        month: record.month,
        defaultKg: 0,
        requestedKg: kg,
        approvedKg: kg,
        status: statusOf(line),
        blend: line.blendName || "ללא תערובת",
        note: "נרשם בדף הרווחיות לפני שמכירות הפכו להזמנות",
        kind: line.channel === "employees" ? "employees" : "company_extra",
        pricePerKg: Math.max(0, Number(line.pricePerKg) || 0),
        costPerKg: Math.max(0, Number(line.costPerKg) || 0),
        ...(line.deliveredAt ? { deliveredAt: line.deliveredAt } : {}),
        ...(line.paid ? { paid: true } : {}),
        ...(line.invoiceSent ? { invoiceSent: true } : {}),
        ...(line.deliveryNoteSent ? { deliveryNoteSent: true } : {}),
        legacySale: { recordId: record.id, lineId: line.id },
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      } as Order);
    }
  }
  return orders;
}

/** The customer's orders together with its earlier typed sales, for display only. */
export const withLegacySales = (orders: Order[], records: MonthlyProfitability[]) => [
  ...orders,
  ...legacySaleOrders(records),
];
