import type { ShopCampaign, ShopGrind, ShopItem, ShopMethod, ShopOrder, ShopOrderStatus } from "./platform-types";

export const MAX_SHOP_ITEMS = 30;
export const MAX_SHOP_QUANTITY = 20;
export const MAX_SHOP_NOTE = 500;

export const SHOP_ORDER_STATUS_LABELS: Record<ShopOrderStatus, string> = {
  pending: "ממתין לתשלום",
  paid: "שולם",
  cancelled: "בוטל",
};

export const SHOP_GRINDS: Array<{ id: ShopGrind; label: string }> = [
  { id: "beans", label: "פולים" },
  { id: "espresso", label: "טחון לאספרסו" },
  { id: "turkish", label: "טחון לקפה שחור" },
  { id: "moka", label: "טחון למקינטה" },
  { id: "filter", label: "טחון לפילטר" },
];

/**
 * How employees make coffee at home. The method picks the grind: a fully
 * automatic machine grinds its own beans; for the rest the coffee comes ground
 * for that method, unless the employee has a grinder and asks for beans.
 */
export const SHOP_METHODS: Array<{ id: ShopMethod; label: string; hint: string; grind: ShopGrind }> = [
  { id: "auto", label: "מכונה אוטומטית", hint: "טוחנת לבד בלחיצת כפתור", grind: "beans" },
  { id: "espresso", label: "מכונת אספרסו", hint: "חצי אוטומטית או בריסטה מקצועית", grind: "espresso" },
  { id: "turkish", label: "קפה שחור", hint: "טורקי, בפינג׳אן או בכוס", grind: "turkish" },
  { id: "moka", label: "מקינטה", hint: "על הכיריים", grind: "moka" },
  { id: "filter", label: "פילטר", hint: "פילטר, פרנץ׳ פרס או V60", grind: "filter" },
];

/** The grind to send for a brewing method; with a grinder at home, always beans. */
export function grindForMethod(method: ShopMethod, hasGrinder: boolean): ShopGrind {
  if (hasGrinder) return "beans";
  return SHOP_METHODS.find((item) => item.id === method)?.grind || "beans";
}

/** The items suited to a brewing method, in catalog order. Items without methods suit every method. */
export function itemsForMethod(items: ShopItem[], method: ShopMethod | "all") {
  return method === "all" ? items : items.filter((item) => !item.methods?.length || item.methods.includes(method));
}

const GRIND_IDS = new Set<string>(SHOP_GRINDS.map((grind) => grind.id));

export function grindLabel(grind: ShopGrind) {
  return SHOP_GRINDS.find((item) => item.id === grind)?.label || grind;
}

/** The quantities key of one item in one grind. */
export function lineKey(itemId: string, grind: ShopGrind) {
  return `${itemId}~${grind}`;
}

export function parseLineKey(key: string): { itemId: string; grind: ShopGrind } | null {
  const [itemId, grind, extra] = key.split("~");
  return itemId && GRIND_IDS.has(grind) && extra === undefined ? { itemId, grind: grind as ShopGrind } : null;
}

export function isValidQuantity(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_SHOP_QUANTITY;
}

/** Keeps only whole quantities within the limit, for items that are still offered, in a known grind. */
export function cleanQuantities(items: ShopItem[], quantities: Record<string, unknown>) {
  const known = new Set(items.map((item) => item.id));
  return Object.fromEntries(
    Object.entries(quantities || {}).filter(([key, quantity]) => {
      const parsed = parseLineKey(key);
      return parsed && known.has(parsed.itemId) && isValidQuantity(quantity);
    }),
  ) as Record<string, number>;
}

export type ShopOrderLine = { key: string; item: ShopItem; grind: ShopGrind; quantity: number; lineTotal: number };

/** The order's lines in catalog order, then grind order. */
export function orderLines(items: ShopItem[], quantities: Record<string, unknown>): ShopOrderLine[] {
  const clean = cleanQuantities(items, quantities);
  return items.flatMap((item) => SHOP_GRINDS
    .map((grind) => ({ key: lineKey(item.id, grind.id), grind: grind.id }))
    .filter(({ key }) => clean[key])
    .map(({ key, grind }) => ({ key, item, grind, quantity: clean[key], lineTotal: roundMoney(item.price * clean[key]) })));
}

export function orderTotal(items: ShopItem[], quantities: Record<string, unknown>) {
  return roundMoney(orderLines(items, quantities).reduce((sum, line) => sum + line.lineTotal, 0));
}

export function orderUnits(items: ShopItem[], quantities: Record<string, unknown>) {
  return orderLines(items, quantities).reduce((sum, line) => sum + line.quantity, 0);
}

/** "DX+ · טחון למקינטה × 2, Amber · פולים × 1" */
export function orderLinesText(items: ShopItem[], quantities: Record<string, unknown>) {
  return orderLines(items, quantities).map((line) => `${line.item.name} · ${grindLabel(line.grind)} × ${line.quantity}`).join(", ");
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function formatShekel(value: number) {
  return `${new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2 }).format(value)} ₪`;
}

/** Open means the link still takes orders: not closed by hand and not past its closing time. */
export function isCampaignOpen(campaign: Pick<ShopCampaign, "status" | "closesAtMs">, now = Date.now()) {
  return campaign.status === "open" && (!campaign.closesAtMs || now < campaign.closesAtMs);
}

/** The last moment of the given local calendar day (yyyy-mm-dd), as epoch milliseconds. */
export function endOfDayMs(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return 0;
  return new Date(year, month - 1, day, 23, 59, 59).getTime();
}

/** The local calendar day (yyyy-mm-dd) of epoch milliseconds, for a date input. */
export function dateInputValue(ms: number) {
  if (!ms) return "";
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type ShopBuyer = { fullName: string; email: string; phone: string; department: string; note: string };

export function normalizeBuyer(buyer: ShopBuyer): ShopBuyer {
  return {
    fullName: buyer.fullName.trim().replace(/\s+/g, " ").slice(0, 120),
    email: buyer.email.trim().toLowerCase().slice(0, 320),
    phone: buyer.phone.replace(/[^\d+]/g, "").slice(0, 40),
    department: buyer.department.trim().slice(0, 120),
    note: buyer.note.trim().slice(0, MAX_SHOP_NOTE),
  };
}

/** The first problem with the buyer's details, in Hebrew, or "" when they are fine. */
export function buyerError(buyer: ShopBuyer) {
  const clean = normalizeBuyer(buyer);
  if (clean.fullName.length < 2) return "יש למלא שם מלא.";
  if (!EMAIL_PATTERN.test(clean.email)) return "כתובת המייל לא תקינה. החשבונית תישלח אליה.";
  if (clean.phone.replace(/\D/g, "").length < 9) return "מספר הטלפון לא תקין.";
  return "";
}

/** The amount an order is worth: what was actually paid, otherwise its price at the campaign's prices. */
export function orderAmount(campaign: Pick<ShopCampaign, "items">, order: ShopOrder) {
  return order.status === "paid" && typeof order.paidAmount === "number" ? order.paidAmount : orderTotal(campaign.items, order.quantities);
}

export type ShopLineSummary = { key: string; item: ShopItem; grind: ShopGrind; quantity: number; paidQuantity: number; buyers: number };

export type ShopCampaignSummary = {
  orders: number;
  paid: number;
  pending: number;
  cancelled: number;
  collected: number;
  outstanding: number;
  units: number;
  /** Units to prepare per item and grind, from every order that was not cancelled, in catalog order. */
  lines: ShopLineSummary[];
};

export function summarizeShopCampaign(campaign: Pick<ShopCampaign, "items">, orders: ShopOrder[]): ShopCampaignSummary {
  const byKey = new Map<string, ShopLineSummary>();
  const summary: ShopCampaignSummary = { orders: 0, paid: 0, pending: 0, cancelled: 0, collected: 0, outstanding: 0, units: 0, lines: [] };

  for (const order of orders) {
    if (order.status === "cancelled") { summary.cancelled += 1; continue; }
    summary.orders += 1;
    const amount = orderAmount(campaign, order);
    if (order.status === "paid") { summary.paid += 1; summary.collected += amount; } else { summary.pending += 1; summary.outstanding += amount; }
    for (const line of orderLines(campaign.items, order.quantities)) {
      const current = byKey.get(line.key) || { key: line.key, item: line.item, grind: line.grind, quantity: 0, paidQuantity: 0, buyers: 0 };
      current.quantity += line.quantity;
      current.buyers += 1;
      if (order.status === "paid") current.paidQuantity += line.quantity;
      byKey.set(line.key, current);
      summary.units += line.quantity;
    }
  }
  // Catalog order, then grind order, as on the order page.
  summary.lines = campaign.items.flatMap((item) => SHOP_GRINDS.map((grind) => byKey.get(lineKey(item.id, grind.id))).filter((line): line is ShopLineSummary => Boolean(line)));
  summary.collected = roundMoney(summary.collected);
  summary.outstanding = roundMoney(summary.outstanding);
  return summary;
}

export function sortOrders(orders: ShopOrder[]) {
  return [...orders].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

/**
 * A cell for a spreadsheet. Buyers type these values themselves, so a value
 * that Excel would run as a formula is prefixed with an apostrophe.
 */
function csvCell(value: string | number) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const csvRow = (cells: Array<string | number>) => cells.map(csvCell).join(",");

const formatDateTime = (value: string) =>
  value ? new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "";

/**
 * Every buyer of a campaign, one row each with what they ordered, followed by
 * the units to prepare per item and grind. Opens in Excel (UTF-8 with a BOM, added on download).
 */
export function shopCampaignCsv(campaign: ShopCampaign, orders: ShopOrder[]) {
  const summary = summarizeShopCampaign(campaign, orders);
  const rows: string[] = [
    csvRow([campaign.customerName, campaign.title]),
    "",
    csvRow(["תאריך הזמנה", "שם מלא", "מייל", "טלפון", "מחלקה / קומה", "פריטים", "יחידות", "סכום", "סטטוס", "מספר חשבונית", "תאריך תשלום", "הערה"]),
  ];
  for (const order of sortOrders(orders)) {
    rows.push(csvRow([
      formatDateTime(order.createdAt),
      order.fullName,
      order.email,
      order.phone,
      order.department,
      orderLinesText(campaign.items, order.quantities),
      orderUnits(campaign.items, order.quantities),
      orderAmount(campaign, order),
      SHOP_ORDER_STATUS_LABELS[order.status] || order.status,
      order.invoiceNumber || "",
      formatDateTime(order.paidAt || ""),
      order.note,
    ]));
  }
  rows.push("", csvRow(["סיכום להכנה (ללא הזמנות שבוטלו)"]), csvRow(["פריט", "טחינה", "יחידה", "כמות", "מתוכן שולמו", "מספר מזמינים"]));
  for (const line of summary.lines) rows.push(csvRow([line.item.name, grindLabel(line.grind), line.item.unit, line.quantity, line.paidQuantity, line.buyers]));
  rows.push(
    "",
    csvRow(["הזמנות", summary.orders]),
    csvRow(["שולמו", summary.paid, summary.collected]),
    csvRow(["ממתינות לתשלום", summary.pending, summary.outstanding]),
    csvRow(["בוטלו", summary.cancelled]),
  );
  return rows.join("\r\n");
}

/**
 * An order's lines at the store's own prices, and the employee discount as one
 * line of its own, so the payment page and the invoice show the full price
 * first and then what was taken off. The lines add up to the order total.
 */
export function pricedWithDiscount(items: ShopItem[], quantities: Record<string, unknown>) {
  const lines = orderLines(items, quantities).map((line) => ({
    description: `${line.item.name} · ${grindLabel(line.grind)} · ${line.item.unit}`.slice(0, 100),
    quantity: line.quantity,
    unitPrice: Math.max(line.item.listPrice, line.item.price),
    percent: line.item.listPrice > line.item.price ? Math.round((1 - line.item.price / line.item.listPrice) * 100) : 0,
  }));
  const listTotal = roundMoney(lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0));
  const discount = roundMoney(listTotal - orderTotal(items, quantities));
  const percents = new Set(lines.filter((line) => line.percent > 0).map((line) => line.percent));
  const label = percents.size === 1 ? `הנחת עובדים ${[...percents][0]}%` : "הנחת עובדים";
  return { lines, discount: discount > 0 ? { description: label, amount: discount } : null };
}

export type RivhitInvoiceOptions = {
  /** The Rivhit document type of a tax invoice-receipt (חשבונית מס קבלה) in this account. */
  documentType: number;
  /** The Rivhit payment type the money came in as (bank transfer, Bit, credit card…). */
  paymentType: number;
  /** Rivhit emails the document to the buyer. */
  sendMail: boolean;
};

/**
 * The Rivhit Document.New request for one paid order: one line per coffee and
 * grind at the store price, then the employee discount (VAT included), paid in full. The order id is the
 * request reference, so Rivhit refuses to issue a second document for it.
 * The API token is added by the server.
 */
export function rivhitInvoiceRequest(campaign: Pick<ShopCampaign, "items" | "customerName" | "title">, order: ShopOrder, options: RivhitInvoiceOptions) {
  const priced = pricedWithDiscount(campaign.items, order.quantities);
  const amount = orderTotal(campaign.items, order.quantities);
  const email = order.email.trim();
  return {
    document_type: options.documentType,
    customer_id: 0,
    last_name: order.fullName.trim().slice(0, 30),
    phone: order.phone.slice(0, 15),
    ...(email.length >= 6 && email.length <= 50 ? { email_to: email } : {}),
    send_mail: options.sendMail && email.length >= 6 && email.length <= 50,
    price_include_vat: true,
    comments: `${campaign.customerName} · ${campaign.title}`.slice(0, 400),
    order: order.id.slice(-15),
    items: [
      ...priced.lines.map((line) => ({ description: line.description, quantity: line.quantity, price_nis: line.unitPrice })),
      ...(priced.discount ? [{ description: priced.discount.description, quantity: 1, price_nis: -priced.discount.amount }] : []),
    ],
    payments: [{ payment_type: options.paymentType, amount_nis: amount }],
    prevent_duplicates: true,
    request_reference: `mister-bean-shop-${order.id}`,
  };
}

/**
 * The iCredit GetUrl request for one order: a payment page with this order's
 * lines at the store price, the employee discount, and exactly the order total, the buyer's details filled in, and the sale and
 * order ids in Custom1/Custom2 so a payment can be matched back to its order.
 * The payment page token is added by the server.
 */
export function icreditPaymentRequest(
  campaign: Pick<ShopCampaign, "id" | "items" | "customerName" | "title">,
  order: ShopOrder,
  options: { redirectUrl: string; ipnUrl?: string },
) {
  const priced = pricedWithDiscount(campaign.items, order.quantities);
  const email = order.email.trim();
  return {
    Items: [
      ...priced.lines.map((line) => ({ Description: line.description, Quantity: line.quantity, UnitPrice: line.unitPrice })),
      ...(priced.discount ? [{ Description: priced.discount.description, Quantity: 1, UnitPrice: -priced.discount.amount }] : []),
    ],
    PriceIncludeVAT: true,
    MaxPayments: 1,
    RedirectURL: options.redirectUrl,
    ...(options.ipnUrl ? { IPNURL: options.ipnUrl, IPNMethod: 1 } : {}),
    // The whole name as typed; Rivhit prints last name before first name.
    CustomerLastName: order.fullName.trim().slice(0, 30),
    PhoneNumber: order.phone.slice(0, 15),
    ...(email.length >= 6 && email.length <= 50 ? { EmailAddress: email } : {}),
    Comments: `${campaign.customerName} · ${campaign.title}`.slice(0, 400),
    Order: order.id.slice(-15),
    Custom1: campaign.id,
    Custom2: order.id,
    DocumentLanguage: "he",
    DisplayBackButton: true,
  };
}
