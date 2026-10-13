import assert from "node:assert/strict";
import test from "node:test";
import type { ShopCampaign, ShopOrder } from "./platform-types.ts";
import {
  buyerError,
  cleanQuantities,
  endOfDayMs,
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
  assert.equal(request.CustomerLastName, "דנה כהן לוי");
  assert.equal("CustomerFirstName" in request, false);
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
