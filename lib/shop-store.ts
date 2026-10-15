"use client";

import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseServices } from "./firebase-client";
import type { ShopCampaign, ShopOrder, ShopOrderStatus } from "./platform-types";
import { cleanQuantities, normalizeBuyer, orderTotal, type ShopBuyer } from "./shop-engine";

// Kept apart from firebase-platform.ts so the public order page does not
// pull in the authentication and account code.

export function createShopId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

export function shopPublicUrl(campaignId: string) {
  return `${window.location.origin}/shop/?c=${encodeURIComponent(campaignId)}`;
}

export function subscribeToShopCampaigns(onCampaigns: (campaigns: ShopCampaign[]) => void, onError: (error: Error) => void): Unsubscribe {
  const { db } = getFirebaseServices();
  return onSnapshot(
    query(collection(db, "shopCampaigns")),
    (snapshot) => onCampaigns(snapshot.docs.map((item) => item.data() as ShopCampaign).sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
    onError,
  );
}

/** All orders of all campaigns, for administrators. Grouped by campaign id. */
export function subscribeToShopOrders(onOrders: (orders: Map<string, ShopOrder[]>) => void, onError: (error: Error) => void): Unsubscribe {
  const { db } = getFirebaseServices();
  return onSnapshot(
    query(collectionGroup(db, "shopOrders")),
    (snapshot) => {
      const grouped = new Map<string, ShopOrder[]>();
      for (const item of snapshot.docs) {
        const order = item.data() as ShopOrder;
        const campaignId = item.ref.parent.parent?.id || order.campaignId;
        grouped.set(campaignId, [...(grouped.get(campaignId) || []), order]);
      }
      onOrders(grouped);
    },
    onError,
  );
}

export async function saveShopCampaign(campaign: ShopCampaign) {
  const { db } = getFirebaseServices();
  await setDoc(doc(db, "shopCampaigns", campaign.id), campaign);
}

export async function setShopCampaignStatus(campaignId: string, status: ShopCampaign["status"]) {
  const { db } = getFirebaseServices();
  const now = new Date().toISOString();
  await updateDoc(doc(db, "shopCampaigns", campaignId), status === "closed"
    ? { status, updatedAt: now, closedAt: now }
    : { status, updatedAt: now });
}

export async function deleteShopCampaign(campaignId: string) {
  const { db } = getFirebaseServices();
  const orders = await getDocs(collection(db, "shopCampaigns", campaignId, "shopOrders"));
  // A batch holds up to 500 writes; delete orders in chunks, the campaign last.
  const refs = orders.docs.map((item) => item.ref);
  for (let index = 0; index < refs.length; index += 450) {
    const batch = writeBatch(db);
    refs.slice(index, index + 450).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
  const batch = writeBatch(db);
  batch.delete(doc(db, "shopCampaigns", campaignId));
  await batch.commit();
}

/** Staff record a payment, an invoice number or a cancellation. */
export async function updateShopOrderPayment(
  campaignId: string,
  orderId: string,
  patch: { status: ShopOrderStatus; paidAt?: string; paidAmount?: number; invoiceNumber?: string },
  actor: string,
) {
  const { db } = getFirebaseServices();
  await updateDoc(doc(db, "shopCampaigns", campaignId, "shopOrders", orderId), {
    ...patch,
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  });
}

/** Public: the order page reads only the one campaign it was opened for. */
export function subscribeToPublicShopCampaign(
  campaignId: string,
  onCampaign: (campaign: ShopCampaign | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const { db } = getFirebaseServices();
  return onSnapshot(
    doc(db, "shopCampaigns", campaignId),
    (snapshot) => onCampaign(snapshot.exists() ? (snapshot.data() as ShopCampaign) : null),
    onError,
  );
}

export async function submitShopOrder(campaign: ShopCampaign, buyer: ShopBuyer, quantities: Record<string, number>) {
  const { db } = getFirebaseServices();
  const clean = cleanQuantities(campaign.items, quantities);
  const id = createShopId("order");
  const order: ShopOrder = {
    id,
    campaignId: campaign.id,
    ...normalizeBuyer(buyer),
    quantities: clean,
    total: orderTotal(campaign.items, clean),
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  await setDoc(doc(db, "shopCampaigns", campaign.id, "shopOrders", id), order);
  return order;
}

/** The payments server that issues Rivhit invoices; empty when not set up. */
export const shopApiUrl = (process.env.NEXT_PUBLIC_SHOP_API_URL || "").replace(/\/$/, "");

export type IssuedInvoice = { invoiceNumber: string; invoiceUrl: string; already?: boolean; warning?: string };

/**
 * Asks the payments server to mark an order paid and issue its tax
 * invoice-receipt in Rivhit, which emails it to the employee. The server
 * checks, with the administrator's own sign-in, that the caller may do this.
 */
export async function issueShopInvoice(campaign: ShopCampaign, order: ShopOrder): Promise<IssuedInvoice> {
  if (!shopApiUrl) throw new Error("שרת התשלומים לא מוגדר.");
  const demo = campaign.id === "demo" ? { campaign, order } : undefined;
  const idToken = demo ? "" : await getFirebaseServices().auth.currentUser?.getIdToken();
  if (!demo && !idToken) throw new Error("יש להתחבר מחדש.");
  const response = await fetch(`${shopApiUrl}/shop/invoice`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
    body: JSON.stringify({ campaignId: campaign.id, orderId: order.id, demo }),
  });
  const result = (await response.json().catch(() => ({}))) as IssuedInvoice & { error?: string };
  if (!response.ok && response.status !== 207) throw new Error(result.error || "הפקת החשבונית נכשלה.");
  return result;
}

/**
 * Opens iCredit's payment page for an order. The server prices it from the
 * saved order and the sale's prices; the browser only names the order.
 */
export async function startShopCheckout(campaign: ShopCampaign, order: ShopOrder): Promise<{ url: string; saleToken: string }> {
  return callShopApi("/shop/checkout", { campaignId: campaign.id, orderId: order.id, demo: campaign.id === "demo" ? { campaign, order } : undefined });
}

export type ShopPaymentStatus = { paid: boolean; amount?: number; invoiceNumber?: string; invoiceUrl?: string };

/** After the payment page: asks the server whether iCredit received this order's payment. */
export async function confirmShopPayment(campaign: ShopCampaign, order: ShopOrder, saleToken: string): Promise<ShopPaymentStatus> {
  return callShopApi("/shop/confirm", { campaignId: campaign.id, orderId: order.id, saleToken, demo: campaign.id === "demo" ? { campaign, order } : undefined });
}

async function callShopApi<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!shopApiUrl) throw new Error("התשלום המקוון לא זמין כרגע.");
  const response = await fetch(`${shopApiUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "השירות לא זמין כרגע. נסו שוב בעוד רגע.");
  return result;
}
