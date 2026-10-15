import type { EmployeeRecipient, Order } from "./platform-types";

/**
 * What goes out to one customer in one month: the company's coffee and the
 * employees' bags travel in the same delivery, so they are prepared from one
 * list. Coffee is counted in kilograms; an employee bag is one kilogram.
 */

export type PrepRow = {
  coffee: string;
  /** Kilograms the company ordered (monthly order, top-ups and extras). */
  companyKg: number;
  /** Employee bags of this coffee, per grind, in the order they were listed. */
  grinds: Array<{ grind: string; bags: number }>;
  employeeBags: number;
  totalKg: number;
};

const live = (order: Order) => order.status !== "בוטל";
const orderKg = (order: Order) => Math.max(0, Math.round(order.approvedKg || order.requestedKg || 0));
const UNSET_BLEND = "טרם הוגדרה תערובת";

/** One row per coffee: what the company ordered next to the employee bags by grind. */
export function deliveryPrep(orders: Order[]): PrepRow[] {
  const rows = new Map<string, PrepRow>();
  const row = (coffee: string) => {
    const name = coffee.trim() || UNSET_BLEND;
    const current = rows.get(name) || { coffee: name, companyKg: 0, grinds: [], employeeBags: 0, totalKg: 0 };
    rows.set(name, current);
    return current;
  };
  for (const order of orders.filter(live)) {
    if (order.kind === "employees") {
      for (const line of order.employeeLines || []) {
        const current = row(line.coffee);
        const grind = current.grinds.find((item) => item.grind === line.grind);
        if (grind) grind.bags += line.bags; else current.grinds.push({ grind: line.grind, bags: line.bags });
        current.employeeBags += line.bags;
        current.totalKg += line.bags;
      }
      continue;
    }
    const kg = orderKg(order);
    if (!kg) continue;
    const current = row(order.blend);
    current.companyKg += kg;
    current.totalKg += kg;
  }
  return [...rows.values()].sort((left, right) => right.totalKg - left.totalKg || left.coffee.localeCompare(right.coffee, "he"));
}

/** Everyone who gets a bag in this delivery, by name. */
export function deliveryRecipients(orders: Order[]): EmployeeRecipient[] {
  return orders.filter((order) => live(order) && order.kind === "employees")
    .flatMap((order) => order.recipients || [])
    .sort((left, right) => left.name.localeCompare(right.name, "he"));
}

/**
 * "DX+ · פולים × 2, HB+ · טחון לאספרסו × 1" as its parts, so a Latin coffee
 * name can be set apart and "DX+" does not show as "+DX" in a Hebrew line.
 */
export function itemParts(items: string) {
  return items.split(", ").filter(Boolean).map((part) => {
    const [coffee, ...rest] = part.split(" · ");
    return { coffee, rest: rest.join(" · ") };
  });
}

const escapeHtml = (value: string | number) => String(value)
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

/**
 * A printable page for a delivery: the totals to prepare and the named list
 * for handing the bags out. Names are typed by employees, so every value is escaped.
 */
export function deliverySheetHtml(input: { customerName: string; monthTitle: string; deliveryDate: string; orders: Order[]; forCustomer?: boolean }) {
  const rows = deliveryPrep(input.orders);
  const recipients = deliveryRecipients(input.orders);
  const total = rows.reduce((sum, row) => sum + row.totalKg, 0);
  const company = rows.reduce((sum, row) => sum + row.companyKg, 0);
  const bags = rows.reduce((sum, row) => sum + row.employeeBags, 0);
  const e = escapeHtml;
  const prep = rows.map((row) => `<tr><td><b><bdi>${e(row.coffee)}</bdi></b></td><td>${row.companyKg ? `${row.companyKg} ק״ג` : "—"}</td><td>${row.grinds.map((item) => `${e(item.grind)} × ${item.bags}`).join("<br>") || "—"}</td><td><b>${row.totalKg} ק״ג</b></td></tr>`).join("");
  const people = recipients.map((person, index) => `<tr><td>${index + 1}</td><td><b>${e(person.name)}</b></td><td>${e(person.department) || "—"}</td><td>${itemParts(person.items).map((part) => `<bdi>${e(part.coffee)}</bdi>${part.rest ? ` · ${e(part.rest)}` : ""}`).join("<br>")}</td><td class="box"></td></tr>`).join("");
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${e(`משלוח קפה - ${input.customerName} - ${input.monthTitle}`)}</title>
<style>
body{font-family:Arial,"Heebo",sans-serif;color:#2e2723;margin:32px;font-size:14px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px}
p{margin:0;color:#6b625c}
.totals{display:flex;gap:24px;margin:16px 0 0}.totals div{border:1px solid #ddd;border-radius:8px;padding:8px 14px}.totals b{display:block;font-size:18px}
table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #e3ddd8;padding:7px 8px;text-align:right;vertical-align:top}th{background:#f6f2ee;font-size:12px}
td.box{width:48px}tr{break-inside:avoid}
@media print{body{margin:12mm}button{display:none}}
</style></head><body>
<button onclick="window.print()" style="float:left;padding:8px 16px">הדפסה או שמירה כקובץ</button>
<h1>${input.forCustomer ? "קפה לעובדים" : "משלוח קפה"} · ${e(input.customerName)}</h1>
<p>${e(input.monthTitle)}${input.deliveryDate ? ` · אספקה ${e(input.deliveryDate)}` : ""}</p>
${input.forCustomer ? `<div class="totals"><div>עובדים<b>${recipients.length}</b></div><div>שקיות<b>${bags} × 1 ק״ג</b></div></div>` : `<div class="totals"><div>סה״כ להכנה<b>${total} ק״ג</b></div><div>לחברה<b>${company} ק״ג</b></div><div>לעובדים<b>${bags} שקיות</b></div></div>
<h2>סיכום לפי סוג קפה</h2>
${rows.length ? `<table><thead><tr><th>קפה</th><th>לחברה</th><th>לעובדים (שקיות של 1 ק״ג)</th><th>סה״כ</th></tr></thead><tbody>${prep}</tbody></table>` : "<p>אין קפה במשלוח הזה.</p>"}`}
${recipients.length ? `<h2>רשימת חלוקה${input.forCustomer ? "" : ` לעובדים (${recipients.length})`}</h2><table><thead><tr><th>#</th><th>שם</th><th>מחלקה / קומה</th><th>קפה וטחינה</th><th>נמסר</th></tr></thead><tbody>${people}</tbody></table>` : ""}
</body></html>`;
}

/** Opens the sheet in a new tab, to print or save as PDF and send. */
export function openDeliverySheet(input: Parameters<typeof deliverySheetHtml>[0]) {
  const url = URL.createObjectURL(new Blob([deliverySheetHtml(input)], { type: "text/html;charset=utf-8" }));
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
