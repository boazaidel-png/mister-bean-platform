import type { ShopCampaign, ShopOrder } from "../../lib/platform-types";
import { icreditPaymentRequest, isCampaignOpen, orderTotal, rivhitInvoiceRequest } from "../../lib/shop-engine";
import { firestore, FirestoreError, tokenEmail } from "./firestore";
import { createPaymentPage, saleDetails, verifySale } from "./icredit";
import { invoiceReceiptDocumentType, newDocument, RivhitError } from "./rivhit";
import { serviceAccountToken } from "./service-account";

interface Env {
  FIREBASE_PROJECT_ID: string;
  ALLOWED_ORIGINS: string;
  /** Path of the public order page on the site, for the return after paying. */
  SHOP_PAGE_PATH: string;
  RIVHIT_API_TOKEN: string;
  /** Payment type recorded when staff mark an order paid by hand (Bit, transfer…). */
  RIVHIT_PAYMENT_TYPE: string;
  /** Payment type recorded for an online card payment. */
  RIVHIT_CARD_PAYMENT_TYPE: string;
  RIVHIT_DOCUMENT_TYPE: string;
  RIVHIT_SEND_MAIL: string;
  /** https://testicredit.rivhit.co.il for tests, https://icredit.rivhit.co.il for real payments. */
  ICREDIT_API: string;
  ICREDIT_GROUP_TOKEN?: string;
  /** The Firebase service account key (JSON), so payments are recorded with nobody signed in. */
  FIREBASE_SERVICE_ACCOUNT?: string;
  /** "1" only on a developer's machine: the sample sale "demo" runs without Firestore. */
  DEMO_MODE?: string;
}

type Demo = { campaign: ShopCampaign; order: ShopOrder };
type Body = { campaignId?: string; orderId?: string; saleToken?: string; demo?: Demo };
type Execution = { waitUntil(promise: Promise<unknown>): void };

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function cors(request: Request, env: Env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = env.ALLOWED_ORIGINS.split(",").map((item) => item.trim());
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Firebase-AppCheck",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(request: Request, env: Env, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(request, env), "Content-Type": "application/json; charset=utf-8" } });
}

const readBody = async (request: Request) => (await request.json().catch(() => ({}))) as Body;
const demoOf = (env: Env, campaignId: string, body: Body) => (env.DEMO_MODE === "1" && campaignId === "demo" && body.demo ? body.demo : null);
const sameAmount = (left: number, right: number) => Math.abs(left - right) < 0.01;

/** Firestore as the server itself, for writes no signed-in person makes. */
async function serverDb(env: Env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) throw new HttpError(503, "התשלום המקוון עדיין לא הוגדר בשרת");
  return firestore(env.FIREBASE_PROJECT_ID, await serviceAccountToken(env.FIREBASE_SERVICE_ACCOUNT));
}

async function loadOrder(env: Env, campaignId: string, orderId: string, demo: Demo | null) {
  if (demo) return { db: null, campaign: demo.campaign, order: demo.order };
  const db = await serverDb(env);
  try {
    return {
      db,
      campaign: await db.get<ShopCampaign>("shopCampaigns", campaignId),
      order: await db.get<ShopOrder>("shopCampaigns", campaignId, "shopOrders", orderId),
    };
  } catch (error) {
    throw new HttpError(error instanceof FirestoreError && error.status === 404 ? 404 : 502, "ההזמנה לא נמצאה");
  }
}

/** Issues the order's tax invoice-receipt in Rivhit, which emails it to the buyer. */
async function issueRivhitInvoice(env: Env, campaign: ShopCampaign, order: ShopOrder, paymentType: number) {
  const documentType = Number(env.RIVHIT_DOCUMENT_TYPE) || (await invoiceReceiptDocumentType(env.RIVHIT_API_TOKEN));
  const document = await newDocument(env.RIVHIT_API_TOKEN, rivhitInvoiceRequest(campaign, order, {
    documentType,
    paymentType,
    sendMail: env.RIVHIT_SEND_MAIL !== "false",
  }));
  return { invoiceNumber: String(document.document_number), invoiceUrl: document.document_link };
}

type Settled = { paid: true; amount: number; invoiceNumber: string; invoiceUrl: string };

/**
 * Records an online payment once iCredit confirmed it: only for this order, and
 * only when iCredit charged exactly the order's price at the sale's prices.
 * Safe to run more than once (the return page and iCredit's notification both
 * call it): a paid order is left as it is, and Rivhit refuses a second invoice.
 */
async function settle(env: Env, db: Awaited<ReturnType<typeof serverDb>> | null, campaign: ShopCampaign, order: ShopOrder, sale: { saleId: string; amount: number; documentNumber?: string; documentUrl?: string }): Promise<Settled> {
  const amount = orderTotal(campaign.items, order.quantities);
  if (order.status === "paid") return { paid: true, amount: order.paidAmount ?? amount, invoiceNumber: order.invoiceNumber || "", invoiceUrl: order.invoiceUrl || "" };
  if (!sameAmount(sale.amount, amount)) throw new HttpError(409, `הסכום ששולם (${sale.amount}) שונה מסכום ההזמנה (${amount}). צריך לבדוק ידנית.`);

  let invoice = { invoiceNumber: sale.documentNumber || "", invoiceUrl: sale.documentUrl || "" };
  if (!invoice.invoiceNumber && env.RIVHIT_API_TOKEN) {
    try {
      invoice = await issueRivhitInvoice(env, campaign, order, Number(env.RIVHIT_CARD_PAYMENT_TYPE) || 3);
    } catch (error) {
      // The money arrived; the payment is recorded and the invoice can be issued from the admin screen.
      console.error("Rivhit invoice failed", order.id, error instanceof Error ? error.message : error);
    }
  }
  if (db) {
    const now = new Date().toISOString();
    await db.update(["shopCampaigns", campaign.id, "shopOrders", order.id], {
      status: "paid",
      paidAt: now,
      paidAmount: amount,
      paymentRef: sale.saleId,
      ...(invoice.invoiceNumber ? { invoiceNumber: invoice.invoiceNumber } : {}),
      ...(invoice.invoiceUrl ? { invoiceUrl: invoice.invoiceUrl } : {}),
      updatedAt: now,
      updatedBy: "iCredit",
    });
  }
  return { paid: true, amount, ...invoice };
}

/**
 * The payment for this order, as iCredit reports it for the payment page the
 * server opened for this order (its private token is saved on the order).
 * Nothing the browser or a notification says is trusted.
 */
async function savedSalePaid(env: Env, order: ShopOrder, saleToken: string) {
  if (!saleToken) return null;
  const sale = await saleDetails(env.ICREDIT_API, saleToken);
  const charged = Number(sale.Amount ?? sale.TransactionAmount ?? 0);
  if (sale.Status !== 0 || !(charged > 0)) return null;
  if (sale.Custom2 && sale.Custom2 !== order.id) throw new HttpError(409, "התשלום שייך להזמנה אחרת");
  return {
    saleId: sale.SaleId,
    amount: charged,
    documentNumber: sale.DocumentNum ? String(sale.DocumentNum) : undefined,
    documentUrl: sale.DocumentURL || undefined,
  };
}

/**
 * Opens an iCredit payment page for one order, with its exact lines and total.
 * Anyone with the sale link may ask, but the amount always comes from the
 * order as saved and the sale's prices, never from the request.
 */
async function checkout(request: Request, env: Env) {
  const body = await readBody(request);
  const campaignId = String(body.campaignId || "");
  const orderId = String(body.orderId || "");
  if (!campaignId || !orderId) throw new HttpError(400, "חסרים פרטי הזמנה");
  if (!env.ICREDIT_GROUP_TOKEN) throw new HttpError(503, "התשלום המקוון עדיין לא הוגדר");

  const { db, campaign, order } = await loadOrder(env, campaignId, orderId, demoOf(env, campaignId, body));
  if (order.status === "paid") throw new HttpError(409, "ההזמנה כבר שולמה");
  if (order.status === "cancelled") throw new HttpError(409, "ההזמנה בוטלה");
  // Paid on an earlier page (another tab, a slow return): record it instead of opening a new page.
  const earlier = db ? await savedSalePaid(env, order, order.paymentSaleToken || "") : null;
  if (earlier) {
    await settle(env, db, campaign, order, earlier);
    throw new HttpError(409, "ההזמנה כבר שולמה");
  }
  if (!isCampaignOpen(campaign)) throw new HttpError(409, "המכירה כבר נסגרה");
  if (!(orderTotal(campaign.items, order.quantities) > 0)) throw new HttpError(400, "אין בהזמנה פריטים לתשלום");

  const origin = request.headers.get("Origin") || "";
  if (!env.ALLOWED_ORIGINS.split(",").map((item) => item.trim()).includes(origin)) throw new HttpError(403, "בקשה ממקור לא מוכר");
  const redirectUrl = `${origin}${env.SHOP_PAGE_PATH}?c=${encodeURIComponent(campaignId)}&paid=${encodeURIComponent(orderId)}`;
  const self = new URL(request.url);
  // iCredit can only notify a public https address; on a developer's machine the return page confirms instead.
  const ipnUrl = self.protocol === "https:" ? `${self.origin}/shop/ipn` : undefined;

  const page = await createPaymentPage(env.ICREDIT_API, env.ICREDIT_GROUP_TOKEN, icreditPaymentRequest(campaign, order, { redirectUrl, ipnUrl }));
  if (db) await db.update(["shopCampaigns", campaignId, "shopOrders", orderId], { paymentSaleToken: page.PrivateSaleToken });
  return { url: page.URL, saleToken: page.PrivateSaleToken };
}

/** The employee is back from the payment page: ask iCredit whether this order was paid. */
async function confirm(request: Request, env: Env) {
  const body = await readBody(request);
  const campaignId = String(body.campaignId || "");
  const orderId = String(body.orderId || "");
  if (!campaignId || !orderId) throw new HttpError(400, "חסרים פרטי הזמנה");
  const { db, campaign, order } = await loadOrder(env, campaignId, orderId, demoOf(env, campaignId, body));
  if (order.status === "paid") return { paid: true, amount: order.paidAmount, invoiceNumber: order.invoiceNumber || "", invoiceUrl: order.invoiceUrl || "" };

  // The saved token is the one to trust; the demo sale has nowhere to save it.
  const saleToken = order.paymentSaleToken || (db ? "" : String(body.saleToken || ""));
  if (!saleToken) return { paid: false };
  const sale = await savedSalePaid(env, order, saleToken);
  return sale ? settle(env, db, campaign, order, sale) : { paid: false };
}

/**
 * iCredit's notification of a payment. It must be answered within about a
 * second, so the work continues after the reply. The notification only says
 * which order to look at: the payment is then checked with iCredit against
 * the payment page opened for that order, so a real sale id sent with another
 * order's ids cannot mark that order paid.
 */
async function ipn(request: Request, env: Env, execution: Execution) {
  const text = await request.text();
  let fields: Record<string, string> = {};
  try {
    fields = JSON.parse(text) as Record<string, string>;
  } catch {
    fields = Object.fromEntries(new URLSearchParams(text));
  }
  const saleId = String(fields.SaleId || "");
  const campaignId = String(fields.Custom1 || "");
  const orderId = String(fields.Custom2 || "");
  const amount = Number(fields.TransactionAmount || fields.Amount || 0);
  execution.waitUntil((async () => {
    try {
      if (!saleId || !campaignId || !orderId || !env.ICREDIT_GROUP_TOKEN) return;
      if (!(await verifySale(env.ICREDIT_API, env.ICREDIT_GROUP_TOKEN, saleId, amount))) {
        console.error("IPN not verified", saleId);
        return;
      }
      const { db, campaign, order } = await loadOrder(env, campaignId, orderId, null);
      if (order.status === "paid") return;
      const sale = await savedSalePaid(env, order, order.paymentSaleToken || "");
      if (!sale || sale.saleId !== saleId) {
        console.error("IPN does not match the order's own payment page", saleId, orderId);
        return;
      }
      await settle(env, db, campaign, order, sale);
    } catch (error) {
      console.error("IPN failed", saleId, error instanceof Error ? error.message : error);
    }
  })());
  return new Response("OK");
}

/**
 * Marks an employee's order as paid by hand (Bit, transfer) and issues its
 * tax invoice-receipt in Rivhit. Only an administrator may call it: the order
 * is read with the caller's own Firebase token, and the rules let only
 * administrators read orders. The amount comes from the sale's prices.
 */
async function issueInvoice(request: Request, env: Env) {
  const body = await readBody(request);
  const campaignId = String(body.campaignId || "");
  const orderId = String(body.orderId || "");
  if (!campaignId || !orderId) throw new HttpError(400, "חסרים פרטי הזמנה");

  const demo = demoOf(env, campaignId, body);
  const idToken = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!demo && !idToken) throw new HttpError(401, "יש להתחבר מחדש");
  const db = demo ? null : firestore(env.FIREBASE_PROJECT_ID, idToken, request.headers.get("X-Firebase-AppCheck") || "");

  let campaign: ShopCampaign;
  let order: ShopOrder;
  try {
    campaign = demo ? demo.campaign : await db!.get<ShopCampaign>("shopCampaigns", campaignId);
    order = demo ? demo.order : await db!.get<ShopOrder>("shopCampaigns", campaignId, "shopOrders", orderId);
  } catch (error) {
    const notFound = error instanceof FirestoreError && error.status === 404;
    throw new HttpError(notFound ? 404 : 403, notFound ? "ההזמנה לא נמצאה" : "אין הרשאה להפיק חשבונית");
  }

  if (order.invoiceNumber) return { invoiceNumber: order.invoiceNumber, invoiceUrl: order.invoiceUrl || "", already: true };
  if (order.status === "cancelled") throw new HttpError(409, "ההזמנה בוטלה");
  const amount = orderTotal(campaign.items, order.quantities);
  if (!(amount > 0)) throw new HttpError(400, "אין בהזמנה פריטים לחיוב");

  let invoice;
  try {
    invoice = await issueRivhitInvoice(env, campaign, order, Number(env.RIVHIT_PAYMENT_TYPE) || 9);
  } catch (error) {
    if (error instanceof RivhitError && error.code === -107) throw new HttpError(409, "כבר הופקה ברווחית חשבונית להזמנה הזו. אפשר למצוא אותה ברווחית לפי מספר ההזמנה.");
    throw new HttpError(502, error instanceof Error ? `רווחית: ${error.message}` : "הפקת החשבונית נכשלה");
  }

  const result = { ...invoice, amount };
  if (db) {
    const now = new Date().toISOString();
    try {
      await db.update(["shopCampaigns", campaignId, "shopOrders", orderId], {
        status: "paid",
        paidAt: order.paidAt || now,
        paidAmount: amount,
        invoiceNumber: invoice.invoiceNumber,
        invoiceUrl: invoice.invoiceUrl,
        updatedAt: now,
        updatedBy: tokenEmail(idToken),
      });
    } catch {
      // The invoice exists; report it so it can be recorded by hand.
      return { ...result, warning: `החשבונית ${invoice.invoiceNumber} הופקה, אבל שמירתה בהזמנה נכשלה. כדאי להקליד את המספר ידנית.` };
    }
  }
  return result;
}

const routes: Record<string, (request: Request, env: Env) => Promise<unknown>> = {
  "/shop/invoice": issueInvoice,
  "/shop/checkout": checkout,
  "/shop/confirm": confirm,
};

const worker = {
  async fetch(request: Request, env: Env, execution: Execution): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request, env) });
    // iCredit's servers call this one; it answers plain text, not JSON.
    if (request.method === "POST" && pathname === "/shop/ipn") return ipn(request, env, execution);
    const route = request.method === "POST" ? routes[pathname] : undefined;
    if (!route) return json(request, env, 404, { error: "not found" });
    try {
      return json(request, env, 200, await route(request, env));
    } catch (error) {
      if (error instanceof HttpError) return json(request, env, error.status, { error: error.message });
      console.error(pathname, error);
      return json(request, env, 502, { error: "השירות לא זמין כרגע. נסו שוב בעוד רגע." });
    }
  },
};

export default worker;
