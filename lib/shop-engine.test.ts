import assert from "node:assert/strict";
import test from "node:test";
import type { ShopCampaign, ShopOrder } from "./platform-types.ts";
import {
  buyerError,
  cleanQuantities,
  employeeOrderFor,
  endOfDayMs,
  nextShopDelivery,
  syncEmployeeOrders,
  grindForMethod,
  icreditPaymentRequest,
  itemsForMethod,
  isCampaignOpen,
  orderTotal,
  rivhitInvoiceRequest,
  shopCampaignCsv,
  summarizeShopCampaign,
} from "./shop-engine.ts";
import { DADA_SHOP_CATALOG, discountedPrice } from "./shop-catalog.ts";
import { deliveryPrep, deliveryRecipients, deliverySheetHtml } from "./delivery-sheet.ts";
import type { Order } from "./platform-types.ts";

const campaign: ShopCampaign = {
  id: "shop-1",
  accountId: "customer-a",
  customerName: "לקוח א",
  title: "קפה לעובדים",
  status: "open",
  items: [
    { id: "dx", name: "DX+", group: "תערובות", unit: "1 ק״ג", description: "", price: 120, listPrice: 0 },
    { id: "hb", name: "HB+", group: "תערובות", unit: "1 ק״ג", description: "", price: 139.9, listPrice: 0 },
  ],
  closesAtMs: 0,
  note: "",
  paymentUrl: "",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  createdBy: "boaz@pacifictrade.co",
};

const order = (id: string, quantities: Record<string, number>, status: ShopOrder["status"] = "pending", extra: Partial<ShopOrder> = {}): ShopOrder => ({
  id, campaignId: "shop-1", fullName: "דנה כהן", email: "dana@example.com", phone: "0501234567", department: "",
  quantities, total: 0, note: "", status, createdAt: `2026-10-02T0${id.length}:00:00.000Z`, ...extra,
});

test("quantities from the public page are re-checked against the offered items and grinds", () => {
  assert.deepEqual(
    cleanQuantities(campaign.items, { "dx~beans": 2, "dx~moka": 1, "hb~beans": 0, "gone~beans": 3, "dx~coarse": 1, dx: 1, "hb~filter": 1.5 }),
    { "dx~beans": 2, "dx~moka": 1 },
  );
  assert.deepEqual(cleanQuantities(campaign.items, { "dx~beans": 21, "hb~beans": -1 }), {});
  assert.equal(orderTotal(campaign.items, { "dx~beans": 1, "dx~espresso": 1, "hb~turkish": 1 }), 379.9);
});

test("employee prices are the list price less the discount, in whole shekels", () => {
  assert.equal(discountedPrice(140, 10), 126);
  assert.equal(discountedPrice(110, 10), 99);
  assert.equal(discountedPrice(130, 15), 111);
  assert.equal(discountedPrice(120, 0), 120);
});

test("a campaign stops taking orders when closed or after its closing time", () => {
  assert.equal(isCampaignOpen(campaign), true);
  assert.equal(isCampaignOpen({ ...campaign, status: "closed" }), false);
  const closes = endOfDayMs("2026-10-05");
  assert.equal(isCampaignOpen({ ...campaign, closesAtMs: closes }, closes - 1), true);
  assert.equal(isCampaignOpen({ ...campaign, closesAtMs: closes }, closes), false);
  assert.equal(new Date(closes).getHours(), 23);
});

test("buyer details need a name, a valid email for the invoice and a phone", () => {
  const buyer = { fullName: "דנה כהן", email: "Dana@Example.com ", phone: "050-123-4567", department: "", note: "" };
  assert.equal(buyerError(buyer), "");
  assert.match(buyerError({ ...buyer, fullName: " " }), /שם/);
  assert.match(buyerError({ ...buyer, email: "dana@" }), /מייל/);
  assert.match(buyerError({ ...buyer, phone: "050" }), /טלפון/);
});

test("the summary counts units to prepare, collected and outstanding money, without cancelled orders", () => {
  const summary = summarizeShopCampaign(campaign, [
    order("a", { "dx~beans": 2 }, "paid", { paidAmount: 240 }),
    order("bb", { "dx~beans": 1, "hb~moka": 1 }),
    order("ccc", { "hb~moka": 5 }, "cancelled"),
  ]);
  assert.equal(summary.orders, 2);
  assert.equal(summary.paid, 1);
  assert.equal(summary.pending, 1);
  assert.equal(summary.cancelled, 1);
  assert.equal(summary.collected, 240);
  assert.equal(summary.outstanding, 259.9);
  assert.equal(summary.units, 4);
  assert.deepEqual(summary.lines.map((line) => [line.key, line.quantity, line.paidQuantity, line.buyers]), [["dx~beans", 3, 2, 2], ["hb~moka", 1, 0, 1]]);
});

test("the export lists every buyer and neutralizes values Excel would run as formulas", () => {
  const csv = shopCampaignCsv(campaign, [
    order("a", { "dx~beans": 2 }, "paid", { paidAmount: 240, invoiceNumber: "1001" }),
    order("bb", { "hb~filter": 1 }, "pending", { fullName: "=HYPERLINK(\"x\")", note: "שורה, עם פסיק" }),
  ]);
  const lines = csv.split("\r\n");
  assert.match(lines[2], /^תאריך הזמנה,שם מלא,מייל,טלפון,מחלקה \/ קומה,פריטים,יחידות,סכום,סטטוס/);
  assert.match(lines[3], /דנה כהן,dana@example.com,0501234567,,DX\+ · פולים × 2,2,240,שולם,1001/);
  assert.match(lines[4], /"'=HYPERLINK\(""x""\)"/);
  assert.match(lines[4], /"שורה, עם פסיק"$/);
  assert.ok(lines.includes("DX+,פולים,1 ק״ג,2,2,1"));
  assert.ok(lines.includes("HB+,טחון לפילטר,1 ק״ג,1,0,1"));
});

test("the brewing method picks the grind and the coffees to show", () => {
  assert.equal(grindForMethod("auto", false), "beans");
  assert.equal(grindForMethod("moka", false), "moka");
  assert.equal(grindForMethod("turkish", false), "turkish");
  assert.equal(grindForMethod("filter", true), "beans");
  const items = [
    { ...campaign.items[0], methods: ["auto", "espresso"] as const },
    { ...campaign.items[1], methods: ["filter"] as const },
    { ...campaign.items[1], id: "custom" },
  ].map((item) => ({ ...item, methods: item.methods ? [...item.methods] : undefined }));
  assert.deepEqual(itemsForMethod(items, "espresso").map((item) => item.id), ["dx", "custom"]);
  assert.deepEqual(itemsForMethod(items, "filter").map((item) => item.id), ["hb", "custom"]);
  assert.equal(itemsForMethod(items, "all").length, 3);
});

test("automatic machines get blends up to House Blend and decaf only, and every single origin suits an espresso machine", () => {
  const houseBlend = DADA_SHOP_CATALOG.find((item) => item.id === "house-blend")!;
  const forAuto = DADA_SHOP_CATALOG.filter((item) => item.methods?.includes("auto"));
  assert.deepEqual(forAuto.map((item) => item.id), ["house-blend", "house-blend-plus", "dx-plus", "amber", "decaf", "emerald"]);
  assert.ok(forAuto.every((item) => item.group === "תערובות" && (item.id === "decaf" || item.listPrice <= houseBlend.listPrice)));
  const singleOrigins = DADA_SHOP_CATALOG.filter((item) => item.group === "חד זני");
  assert.equal(singleOrigins.length, 10);
  assert.ok(singleOrigins.every((item) => ["espresso", "moka", "filter"].every((method) => item.methods?.includes(method as never))));
});

test("a paid order becomes one Rivhit invoice-receipt at the sale's prices, never twice", () => {
  const paid = order("order-abcdefghijklmnop", { "dx~moka": 2, "hb~beans": 1 }, "paid", { total: 1, fullName: "דנה כהן-לוי בן שושן אברהמי מהקומה השלישית" });
  const request = rivhitInvoiceRequest(campaign, paid, { documentType: 2, paymentType: 9, sendMail: true });
  assert.equal(request.document_type, 2);
  assert.equal(request.last_name.length, 30);
  assert.equal(request.email_to, "dana@example.com");
  assert.equal(request.send_mail, true);
  assert.equal(request.order, "abcdefghijklmnop".slice(-15));
  assert.deepEqual(request.items, [
    { description: "DX+ · טחון למקינטה · 1 ק״ג", quantity: 2, price_nis: 120 },
    { description: "HB+ · פולים · 1 ק״ג", quantity: 1, price_nis: 139.9 },
  ]);
  // Re-priced from the sale, not from the total the browser sent.
  assert.deepEqual(request.payments, [{ payment_type: 9, amount_nis: 379.9 }]);
  assert.equal(request.request_reference, "mister-bean-shop-order-abcdefghijklmnop");
  const noMail = rivhitInvoiceRequest(campaign, { ...paid, email: "a@b.c" }, { documentType: 2, paymentType: 9, sendMail: true });
  assert.equal(noMail.send_mail, false);
  assert.equal("email_to" in noMail, false);
});

test("an order's payment page carries its exact lines and total, the buyer, and ids to match the payment back", () => {
  const pending = order("order-abc", { "dx~moka": 2, "hb~beans": 1 }, "pending", { fullName: "דנה כהן לוי" });
  const request = icreditPaymentRequest(campaign, pending, { redirectUrl: "https://example.com/shop/?c=shop-1&paid=order-abc", ipnUrl: "https://pay.example.com/shop/ipn" });
  assert.deepEqual(request.Items, [
    { Description: "DX+ · טחון למקינטה · 1 ק״ג", Quantity: 2, UnitPrice: 120 },
    { Description: "HB+ · פולים · 1 ק״ג", Quantity: 1, UnitPrice: 139.9 },
  ]);
  assert.equal(request.MaxPayments, 1);
  assert.equal(request.CustomerFirstName, "דנה");
  assert.equal(request.CustomerLastName, "כהן לוי");
  const single = icreditPaymentRequest(campaign, { ...pending, fullName: "דנה" }, { redirectUrl: "https://example.com/" });
  assert.equal(single.CustomerFirstName, "דנה");
  assert.equal(single.CustomerLastName, "דנה");
  assert.equal(request.Custom1, "shop-1");
  assert.equal(request.Custom2, "order-abc");
  assert.equal(request.IPNURL, "https://pay.example.com/shop/ipn");
  const local = icreditPaymentRequest(campaign, { ...pending, fullName: "דנה" }, { redirectUrl: "http://localhost:3001/x" });
  assert.equal("IPNURL" in local, false);
});

test("the payment page and the invoice show the store price, then the employee discount, adding up to the order total", () => {
  const sale = { ...campaign, items: [
    { id: "dx", name: "DX+", group: "תערובות", unit: "1 ק״ג", description: "", price: 108, listPrice: 120 },
    { id: "hb", name: "HB+", group: "תערובות", unit: "1 ק״ג", description: "", price: 126, listPrice: 140 },
  ] };
  const paid = order("order-discount", { "dx~moka": 2, "hb~beans": 1 }, "paid");
  const page = icreditPaymentRequest(sale, paid, { redirectUrl: "https://example.com/shop/" });
  assert.deepEqual(page.Items, [
    { Description: "DX+ · טחון למקינטה · 1 ק״ג", Quantity: 2, UnitPrice: 120 },
    { Description: "HB+ · פולים · 1 ק״ג", Quantity: 1, UnitPrice: 140 },
    { Description: "הנחת עובדים 10%", Quantity: 1, UnitPrice: -38 },
  ]);
  assert.equal(page.Items.reduce((sum, line) => sum + line.UnitPrice * line.Quantity, 0), orderTotal(sale.items, paid.quantities));
  const invoice = rivhitInvoiceRequest(sale, paid, { documentType: 2, paymentType: 3, sendMail: false });
  assert.deepEqual(invoice.items.at(-1), { description: "הנחת עובדים 10%", quantity: 1, price_nis: -38 });
  assert.equal(invoice.payments[0].amount_nis, 342);
  // Without store prices there is no discount line.
  assert.equal(icreditPaymentRequest(campaign, order("o", { "dx~beans": 1 }), { redirectUrl: "https://example.com/" }).Items.length, 1);
});

test("a sale becomes one coffee order of the customer, from paid orders only", () => {
  const sale = { ...campaign, month: "2026-11" };
  const orders = [
    order("a", { "dx~beans": 2, "hb~espresso": 1 }, "paid", { fullName: "רון לוי", department: "קומה 3" }),
    order("bb", { "dx~beans": 1 }, "paid", { fullName: "אבי כהן" }),
    order("ccc", { "hb~beans": 5 }, "pending", { fullName: "טיוטה" }),
    order("dddd", { "hb~beans": 2 }, "cancelled"),
  ];
  const made = employeeOrderFor(sale, orders, undefined, "2026-10-20T00:00:00.000Z", 0)!;
  assert.equal(made.id, "emp-shop-1");
  assert.equal(made.accountId, "customer-a");
  assert.equal(made.kind, "employees");
  assert.equal(made.month, "2026-11");
  assert.equal(made.approvedKg, 4);
  assert.equal(made.status, "ממתין לעדכון לקוח");
  assert.deepEqual(made.employeeLines, [{ coffee: "DX+", grind: "פולים", bags: 3 }, { coffee: "HB+", grind: "טחון לאספרסו", bags: 1 }]);
  assert.deepEqual(made.recipients!.map((person) => person.name), ["אבי כהן", "רון לוי"]);
  assert.equal(made.recipients![1].department, "קומה 3");
  // 3 × 120 + 139.9 = 499.9 with VAT, per bag without VAT.
  assert.equal(made.pricePerKg, Math.round(499.9 / 1.18 / 4 * 100) / 100);

  // Nothing changed: the same order, so nothing is written.
  assert.equal(employeeOrderFor(sale, orders, made, "2026-10-21T00:00:00.000Z", 0), made);
  // Closing the sale approves it for preparing.
  assert.equal(employeeOrderFor({ ...sale, status: "closed" }, orders, made, "2026-10-21T00:00:00.000Z", 0)!.status, "אושר");
  // Once delivered, late changes no longer touch it.
  const delivered = { ...made, status: "סופק" };
  assert.equal(employeeOrderFor(sale, [...orders, order("e", { "dx~beans": 9 }, "paid")], delivered), delivered);
  // A sale without paid orders sends nothing.
  assert.equal(employeeOrderFor(sale, [orders[2]], undefined), null);
});

test("syncing adds and updates employee orders and leaves the list alone when nothing changed", () => {
  const sale = { ...campaign, month: "2026-11" };
  const shopOrders = new Map([["shop-1", [order("a", { "dx~beans": 1 }, "paid")]]]);
  const first = syncEmployeeOrders([], [sale], shopOrders, "2026-10-20T00:00:00.000Z", 0);
  assert.equal(first.length, 1);
  assert.equal(syncEmployeeOrders(first, [sale], shopOrders, "2026-10-21T00:00:00.000Z", 0), first);
});

test("a new sale goes out with the next delivery it can make and closes a few days before", () => {
  const early = nextShopDelivery(20, new Date(2026, 9, 5));
  assert.equal(early.month, "2026-10");
  assert.equal(early.closesOn, "2026-10-17");
  const late = nextShopDelivery(10, new Date(2026, 9, 8));
  assert.equal(late.month, "2026-11");
  assert.equal(late.closesOn, "2026-11-07");
});

test("the delivery list puts the company's coffee and the employee bags together per coffee", () => {
  const base = { accountId: "customer-a", month: "2026-11", defaultKg: 0, note: "" };
  const orders: Order[] = [
    { ...base, id: "c", requestedKg: 10, approvedKg: 12, status: "אושר", blend: "DX+" },
    { ...base, id: "x", requestedKg: 3, approvedKg: 0, status: "בוטל", blend: "DX+", kind: "company_extra" },
    { ...base, id: "e", requestedKg: 4, approvedKg: 4, status: "אושר", blend: "", kind: "employees",
      employeeLines: [{ coffee: "DX+", grind: "פולים", bags: 3 }, { coffee: "HB+", grind: "טחון לאספרסו", bags: 1 }],
      recipients: [{ name: "רון <b>", department: "", items: "DX+ · פולים × 3" }] },
  ];
  assert.deepEqual(deliveryPrep(orders), [
    { coffee: "DX+", companyKg: 12, grinds: [{ grind: "פולים", bags: 3 }], employeeBags: 3, totalKg: 15 },
    { coffee: "HB+", companyKg: 0, grinds: [{ grind: "טחון לאספרסו", bags: 1 }], employeeBags: 1, totalKg: 1 },
  ]);
  assert.equal(deliveryRecipients(orders).length, 1);
  const html = deliverySheetHtml({ customerName: "לקוח א", monthTitle: "נובמבר 2026", deliveryDate: "", orders });
  assert.match(html, /רון &lt;b&gt;/);
  assert.doesNotMatch(html, /רון <b>/);
  assert.match(html, /16 ק״ג/);
  // The customer gets only who gets what: coffee and grind per employee, no preparing totals.
  const forCustomer = deliverySheetHtml({ customerName: "לקוח א", monthTitle: "נובמבר 2026", deliveryDate: "", orders: [orders[2]], forCustomer: true });
  assert.match(forCustomer, /רשימת חלוקה/);
  assert.match(forCustomer, /טחון למקינטה|פולים/);
  assert.doesNotMatch(forCustomer, /סיכום לפי סוג קפה|לחברה|להכנה/);
});
