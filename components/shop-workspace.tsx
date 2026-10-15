"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, Copy, Download, FileSpreadsheet, Maximize2, Pencil, Plus, Trash2 } from "lucide-react";
import QRCode from "qrcode";
import type { Customer, ShopCampaign, ShopItem, ShopOrder, ShopOrderStatus } from "@/lib/platform-types";
import { backdropDismiss } from "@/lib/backdrop-dismiss";
import {
  campaignMonth,
  dateInputValue,
  deliveryDateIn,
  endOfDayMs,
  nextShopDelivery,
  placedOrders,
  formatShekel,
  grindLabel,
  isCampaignOpen,
  MAX_SHOP_ITEMS,
  orderAmount,
  orderLines,
  orderTotal,
  parseLineKey,
  shopCampaignCsv,
  SHOP_ORDER_STATUS_LABELS,
  sortOrders,
  summarizeShopCampaign,
} from "@/lib/shop-engine";
import { DADA_SHOP_CATALOG, DEFAULT_SHOP_DISCOUNT, discountedPrice, SHOP_UNIT, shopCatalogItems } from "@/lib/shop-catalog";
import {
  createShopId,
  deleteShopCampaign,
  saveShopCampaign,
  setShopCampaignStatus,
  shopPublicUrl,
  subscribeToShopCampaigns,
  subscribeToShopOrders,
  issueShopInvoice,
  shopApiUrl,
  updateShopOrderPayment,
} from "@/lib/shop-store";

const formatDate = (value: string | number) => value ? new Intl.DateTimeFormat("he-IL", { dateStyle: "short" }).format(new Date(value)) : "";
const formatDateTime = (value: string) => value ? new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "";
const monthTitle = (month: string) => { const [year, value] = month.split("-").map(Number); return new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(new Date(year, value - 1, 1)); };
const shiftMonth = (month: string, by: number) => { const [year, value] = month.split("-").map(Number); const date = new Date(year, value - 1 + by, 1); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; };
const errorText = (error: unknown) => error instanceof Error && error.message.includes("permission") ? "אין הרשאה לפעולה. ייתכן שחוקי Firebase עדיין לא עודכנו." : "הפעולה לא הצליחה. נסו שוב.";

function campaignState(campaign: ShopCampaign) {
  if (isCampaignOpen(campaign)) return { label: "פתוחה להזמנות", tone: "green" };
  return { label: campaign.status === "open" ? "תאריך הסגירה עבר" : "סגורה", tone: "gray" };
}

function useShopData(onError: (message: string) => void) {
  const [campaigns, setCampaigns] = useState<ShopCampaign[]>([]);
  const [orders, setOrders] = useState<Map<string, ShopOrder[]>>(new Map());
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const fail = (error: Error) => { setReady(true); onError(errorText(error)); };
    const stopCampaigns = subscribeToShopCampaigns((next) => { setCampaigns(next); setReady(true); }, fail);
    const stopOrders = subscribeToShopOrders(setOrders, fail);
    return () => { stopCampaigns(); stopOrders(); };
    // Subscriptions are set up once; onError only reports.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { campaigns, orders, ready };
}

type SaleProps = {
  customers: Customer[];
  readOnly: boolean;
  actor: string;
  onToast: (message: string) => void;
};

/** Opening a sale from the coffee orders: the customer is fixed in the customer card, chosen on the main board. */
export function ShopSaleNew({ customers, customer, actor, onToast, onCreated, onClose }: SaleProps & {
  customer?: Customer;
  onCreated: (campaign: ShopCampaign) => void;
  onClose: () => void;
}) {
  return <CampaignModal
    orders={[]}
    customers={customers}
    fixedCustomer={customer}
    actor={actor}
    onClose={onClose}
    onSaved={(campaign) => { onToast("המכירה נפתחה. שלחו את הקישור לעובדים."); onCreated(campaign); }}
    onError={(error) => onToast(errorText(error))}
  />;
}

/**
 * Everything about one sale over the coffee orders: the link and QR to send,
 * the preparing list, who paid and their invoices, editing, closing and reopening.
 */
export function ShopSaleManager({ campaignId, customers, readOnly, actor, onToast, onClose }: SaleProps & { campaignId: string; onClose: () => void }) {
  const { campaigns, orders, ready } = useShopData(onToast);
  const [editing, setEditing] = useState(false);
  const campaign = campaigns.find((item) => item.id === campaignId);
  const guard = () => { if (readOnly) { onToast("מצב התצוגה הוא לקריאה בלבד"); return false; } return true; };
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !editing) onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [editing, onClose]);
  useEffect(() => {
    document.body.classList.add("dialog-open");
    return () => document.body.classList.remove("dialog-open");
  }, []);
  return <div className="shop-manager" role="dialog" aria-modal="true" aria-label="ניהול מכירה לעובדים">
    <div className="shop-manager-inner">
      {!ready
        ? <div className="workspace-loading"><i /><span>טוען את המכירה…</span></div>
        : campaign
          ? <CampaignDetail
              campaign={campaign}
              orders={orders.get(campaign.id) || []}
              showCustomer
              actor={actor}
              guard={guard}
              onToast={onToast}
              onEdit={() => { if (guard()) setEditing(true); }}
              onBack={onClose}
            />
          : <div className="panel inline-empty">המכירה לא נמצאה. ייתכן שנמחקה. <button className="text-btn" onClick={onClose}>חזרה להזמנות</button></div>}
    </div>
    {editing && campaign && <CampaignModal
      campaign={campaign}
      orders={orders.get(campaign.id) || []}
      customers={customers}
      actor={actor}
      onClose={() => setEditing(false)}
      onSaved={() => { setEditing(false); onToast("המכירה עודכנה"); }}
      onError={(error) => onToast(errorText(error))}
    />}
  </div>;
}

type DraftItem = ShopItem & { included: boolean };

/** The sale's own items first, then the rest of the store catalog, unticked. */
function draftItems(campaign: ShopCampaign | undefined, discount: number): DraftItem[] {
  if (!campaign) return shopCatalogItems(discount).map((item) => ({ ...item, included: true }));
  const own = campaign.items.map((item) => ({ ...item, included: true }));
  const rest = shopCatalogItems(discount).filter((item) => !campaign.items.some((own) => own.id === item.id)).map((item) => ({ ...item, included: false }));
  return [...own, ...rest];
}

function CampaignModal({ campaign, orders, customers, fixedCustomer, actor, onClose, onSaved, onError }: {
  campaign?: ShopCampaign;
  orders: ShopOrder[];
  customers: Customer[];
  fixedCustomer?: Customer;
  actor: string;
  onClose: () => void;
  onSaved: (campaign: ShopCampaign, created: boolean) => void;
  onError: (error: unknown) => void;
}) {
  const [accountId, setAccountId] = useState(campaign?.accountId || fixedCustomer?.id || "");
  const customer = fixedCustomer || customers.find((item) => item.id === accountId);
  const [title, setTitle] = useState(campaign?.title || "");
  // A new sale goes out with the customer's next delivery it can make, and closes a few days before it.
  const suggested = (id: string) => nextShopDelivery((fixedCustomer || customers.find((item) => item.id === id))?.deliveryDayOfMonth);
  const [month, setMonth] = useState(() => campaign ? campaignMonth(campaign) : suggested(accountId).month);
  const [closesOn, setClosesOn] = useState(() => campaign ? dateInputValue(campaign.closesAtMs) : suggested(accountId).closesOn);
  const deliveryDay = customer?.deliveryDayOfMonth;
  const chooseMonth = (next: string) => {
    setMonth(next);
    const delivery = deliveryDateIn(next, deliveryDay);
    setClosesOn(dateInputValue(new Date(delivery.getFullYear(), delivery.getMonth(), delivery.getDate() - 3).getTime()));
  };
  const monthOptions = Array.from(new Set([campaignMonth(campaign || { createdAt: new Date().toISOString(), closesAtMs: 0 }), month, ...[0, 1, 2].map((by) => shiftMonth(suggested(accountId).month, by - 1))])).sort();
  const [note, setNote] = useState(campaign?.note || "");
  const [paymentUrl, setPaymentUrl] = useState(campaign?.paymentUrl || "");
  const [discount, setDiscount] = useState(DEFAULT_SHOP_DISCOUNT);
  const [items, setItems] = useState<DraftItem[]>(() => draftItems(campaign, DEFAULT_SHOP_DISCOUNT));
  const [saving, setSaving] = useState(false);
  /** Items someone already ordered cannot be taken out of the sale. */
  const ordered = useMemo(() => new Set(orders.filter((order) => order.status !== "cancelled").flatMap((order) => Object.keys(order.quantities).map((key) => parseLineKey(key)?.itemId || ""))), [orders]);
  const included = items.filter((item) => item.included);
  const invalid = included.some((item) => !item.name.trim() || !(item.price > 0));
  const paymentUrlInvalid = Boolean(paymentUrl.trim()) && !/^https:\/\/\S+$/.test(paymentUrl.trim());
  const defaultTitle = customer ? `קפה לעובדי ${customer.name}` : "קפה לעובדים";

  const patchItem = (id: string, patch: Partial<DraftItem>) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  const applyDiscount = () => setItems((current) => current.map((item) => item.listPrice ? { ...item, price: discountedPrice(item.listPrice, discount) } : item));
  const addCustomItem = () => setItems((current) => [...current, { id: createShopId("item"), name: "", group: "תערובות", unit: SHOP_UNIT, description: "", price: 0, listPrice: 0, included: true }]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!customer || !included.length || included.length > MAX_SHOP_ITEMS || invalid || paymentUrlInvalid || saving) return;
    setSaving(true);
    const now = new Date().toISOString();
    const next: ShopCampaign = {
      id: campaign?.id || createShopId("shop"),
      accountId: customer.id,
      customerName: customer.name,
      title: title.trim() || defaultTitle,
      status: campaign?.status || "open",
      items: included.map(({ id, name, group, unit, description, price, listPrice }) => ({ id, name: name.trim(), group, unit: unit.trim() || SHOP_UNIT, description: description.trim(), price: Math.round(price * 100) / 100, listPrice })),
      closesAtMs: closesOn ? endOfDayMs(closesOn) : 0,
      month,
      note: note.trim(),
      paymentUrl: paymentUrl.trim(),
      createdAt: campaign?.createdAt || now,
      updatedAt: now,
      createdBy: campaign?.createdBy || actor,
      ...(campaign?.closedAt ? { closedAt: campaign.closedAt } : {}),
    };
    try {
      await saveShopCampaign(next);
      onSaved(next, !campaign);
    } catch (error) {
      onError(error);
      setSaving(false);
    }
  };

  return <ShopModal title={campaign ? "עריכת מכירה" : "מכירה חדשה לעובדים"} onClose={onClose} wide>
    <form className="modal-form" onSubmit={(event) => void submit(event)}>
      <div className="form-grid">
        {!fixedCustomer && !campaign && <label className="full">לקוח (הארגון)
          <select required value={accountId} onChange={(event) => { setAccountId(event.target.value); const next = suggested(event.target.value); setMonth(next.month); setClosesOn(next.closesOn); }}>
            <option value="">בחירת לקוח…</option>
            {customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>}
        <label>יוצא עם המשלוח של
          <select value={month} onChange={(event) => chooseMonth(event.target.value)}>
            {monthOptions.map((item) => <option key={item} value={item}>{monthTitle(item)}</option>)}
          </select>
          <small>{customer ? `אספקה ב־${formatDate(deliveryDateIn(month, deliveryDay).getTime())}, יחד עם הקפה של החברה` : "בחרו לקוח"}</small>
        </label>
        <label>כותרת לעובדים<input value={title} placeholder={defaultTitle} maxLength={200} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>הזמנות פתוחות עד<input type="date" value={closesOn} onChange={(event) => setClosesOn(event.target.value)} /><small>{closesOn ? `הקישור ייסגר בסוף היום הזה${customer && endOfDayMs(closesOn) >= deliveryDateIn(month, deliveryDay).getTime() ? ". שימו לב: אחרי מועד האספקה" : ""}` : "ללא תאריך: נסגר ידנית"}</small></label>
        <label className="full">הודעה לעובדים <small>(לא חובה)</small><textarea rows={2} maxLength={1000} value={note} placeholder="לדוגמה: המשלוח יגיע למשרד ביום חמישי ויחולק במטבחון בקומה 3" onChange={(event) => setNote(event.target.value)} /></label>
        <label className="full">קישור לתשלום <small>(לא חובה, עד שהסליקה תחובר: Bit, PayBox…)</small><input type="url" dir="ltr" maxLength={500} value={paymentUrl} placeholder="https://" onChange={(event) => setPaymentUrl(event.target.value)} />{paymentUrlInvalid && <small className="shop-field-error">הקישור צריך להתחיל ב-https://</small>}</label>
      </div>

      <div className="shop-items-head">
        <h3 className="tasting-modal-subtitle">קפה במכירה <small>({included.length} נבחרו · שקיות {SHOP_UNIT} · מחירים כולל מע״מ)</small></h3>
        <div className="shop-discount">
          <label>הנחה ממחיר החנות<input type="number" min={0} max={90} value={discount} onChange={(event) => setDiscount(Number(event.target.value))} />%</label>
          <button type="button" onClick={applyDiscount}>עדכון המחירים</button>
        </div>
      </div>
      {campaign && orders.length > 0 && <p className="shop-modal-warning">שינוי מחיר יחול גם על הזמנות שעוד לא שולמו.</p>}
      <div className="shop-item-editor">
        {items.map((item) => {
          const locked = ordered.has(item.id) && item.included;
          return <div className={`shop-item-row ${item.included ? "" : "excluded"}`} key={item.id}>
            <input type="checkbox" checked={item.included} disabled={locked} title={locked ? "כבר הוזמן, אי אפשר להוריד" : undefined} aria-label={`הכללת ${item.name || "פריט"} במכירה`} onChange={(event) => patchItem(item.id, { included: event.target.checked })} />
            {DADA_SHOP_CATALOG.some((catalog) => catalog.id === item.id)
              ? <span className="shop-item-name"><bdi>{item.name}</bdi><small>{item.group}</small></span>
              : <input className="shop-item-name-input" value={item.name} placeholder="שם הקפה" maxLength={120} onChange={(event) => patchItem(item.id, { name: event.target.value })} />}
            <span className="shop-item-list">{item.listPrice ? <s>{formatShekel(item.listPrice)}</s> : ""}</span>
            <label className="shop-item-price"><input type="number" min={0} step="0.01" value={item.price || ""} disabled={!item.included} aria-label={`מחיר ${item.name}`} onChange={(event) => patchItem(item.id, { price: Number(event.target.value) })} />₪</label>
          </div>;
        })}
        <button type="button" className="text-btn" onClick={addCustomItem}><Plus size={14} /> קפה שלא מופיע ברשימה</button>
      </div>
      {included.length > MAX_SHOP_ITEMS && <p className="shop-field-error">אפשר לכלול עד {MAX_SHOP_ITEMS} סוגי קפה במכירה.</p>}
      <footer>
        <button type="button" onClick={onClose}>ביטול</button>
        <button className="primary" disabled={!customer || !included.length || included.length > MAX_SHOP_ITEMS || invalid || paymentUrlInvalid || saving}>{saving ? "שומר…" : campaign ? "שמירה" : "פתיחת המכירה"}</button>
      </footer>
    </form>
  </ShopModal>;
}

function CampaignDetail({ campaign, orders, showCustomer, actor, guard, onToast, onEdit, onBack }: {
  campaign: ShopCampaign;
  orders: ShopOrder[];
  showCustomer: boolean;
  actor: string;
  guard: () => boolean;
  onToast: (message: string) => void;
  onEdit: () => void;
  onBack: () => void;
}) {
  // An order counts once it is paid; a draft left on the payment page is not shown.
  const placed = useMemo(() => placedOrders(orders), [orders]);
  const drafts = orders.length - placed.length;
  const [showDrafts, setShowDrafts] = useState(false);
  const summary = useMemo(() => summarizeShopCampaign(campaign, placed), [campaign, placed]);
  const sorted = useMemo(() => sortOrders(showDrafts ? orders : placed).reverse(), [orders, placed, showDrafts]);
  const month = campaignMonth(campaign);
  const [qr, setQr] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"paid" | "cancelled" | "all">("all");
  const url = shopPublicUrl(campaign.id);
  const state = campaignState(campaign);
  const takesOrders = isCampaignOpen(campaign);
  const shown = filter === "all" ? sorted : sorted.filter((order) => order.status === filter);

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(url, { width: 720, margin: 2, color: { dark: "#2e2723", light: "#ffffff" } }).then((data) => { if (active) setQr(data); });
    return () => { active = false; };
  }, [url]);

  const run = async (action: () => Promise<void>, done: string) => {
    if (!guard() || busy) return;
    setBusy(true);
    try { await action(); onToast(done); } catch (error) { onToast(errorText(error)); } finally { setBusy(false); }
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(url); onToast("הקישור הועתק"); } catch { onToast("לא ניתן להעתיק. אפשר לסמן את הקישור ולהעתיק ידנית."); }
  };
  const download = (href: string, name: string) => {
    const link = document.createElement("a");
    link.href = href;
    link.download = name.replace(/[\\/:*?"<>|]/g, "");
    link.click();
  };
  const exportCsv = () => {
    const blob = new Blob(["﻿", shopCampaignCsv(campaign, placed)], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    download(href, `הזמנות עובדים - ${campaign.customerName} - ${new Date().toISOString().slice(0, 10)}.csv`);
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  };
  /** Marks the order paid and issues its Rivhit invoice-receipt through the payments server. */
  const invoice = (order: ShopOrder) => {
    const amount = orderTotal(campaign.items, order.quantities);
    if (!window.confirm(`לסמן את ההזמנה של ${order.fullName} כשולמה ולהפיק ברווחית חשבונית מס קבלה על ${formatShekel(amount)}?\nהחשבונית תישלח אל ${order.email}.`)) return;
    if (!guard() || busy) return;
    setBusy(true);
    void issueShopInvoice(campaign, order)
      .then((result) => {
        onToast(result.warning || (result.already ? `כבר הופקה חשבונית ${result.invoiceNumber}` : `חשבונית ${result.invoiceNumber} הופקה ונשלחה ל${order.fullName}`));
        // The sample sale is not saved anywhere, so show the document right away.
        if (campaign.id === "demo" && result.invoiceUrl) window.open(result.invoiceUrl, "_blank", "noopener");
      })
      .catch((error: unknown) => onToast(error instanceof Error ? error.message : "הפקת החשבונית נכשלה"))
      .finally(() => setBusy(false));
  };
  const setStatus = (order: ShopOrder, status: ShopOrderStatus) => {
    if (status === order.status) return;
    if (status === "paid" && shopApiUrl && !order.invoiceNumber) { invoice(order); return; }
    if (status === "cancelled" && !window.confirm(`לבטל את ההזמנה של ${order.fullName}?`)) return;
    const patch = status === "paid"
      ? { status, paidAt: new Date().toISOString(), paidAmount: orderTotal(campaign.items, order.quantities) }
      : status === "pending" ? { status, paidAt: "", paidAmount: 0 } : { status };
    void run(() => updateShopOrderPayment(campaign.id, order.id, patch, actor), status === "paid" ? `ההזמנה של ${order.fullName} סומנה כשולמה` : "סטטוס ההזמנה עודכן");
  };
  const setInvoice = (order: ShopOrder, invoiceNumber: string) => {
    if (invoiceNumber === (order.invoiceNumber || "")) return;
    void run(() => updateShopOrderPayment(campaign.id, order.id, { status: order.status, invoiceNumber }, actor), "מספר החשבונית נשמר");
  };
  const remove = () => {
    if (!window.confirm(`למחוק את "${campaign.title}" ואת כל ${orders.length} ההזמנות שלה? לא ניתן לשחזר.`)) return;
    void run(async () => { await deleteShopCampaign(campaign.id); onBack(); }, "המכירה נמחקה");
  };

  return (
    <div className="tasting-admin">
      <button className="text-btn tasting-back" onClick={onBack}><ArrowRight size={15} /> חזרה להזמנות</button>
      <div className="customer-header tasting-detail-head">
        <div>
          <div className="header-line"><h2>{campaign.title}</h2><span className={`badge ${state.tone}`}>{state.label}</span></div>
          <p>{showCustomer && `${campaign.customerName} · `}יוצא עם המשלוח של {monthTitle(month)} · נפתחה {formatDate(campaign.createdAt)}{campaign.closesAtMs ? ` · הזמנות עד ${formatDate(campaign.closesAtMs)}` : ""}{campaign.closedAt && campaign.status === "closed" ? ` · נסגרה ${formatDate(campaign.closedAt)}` : ""}</p>
        </div>
        <div className="title-actions">
          <button onClick={exportCsv}><FileSpreadsheet size={16} /> ייצוא לאקסל</button>
          <button onClick={onEdit}><Pencil size={16} /> עריכה</button>
          {campaign.status === "open"
            ? <button className="primary" disabled={busy} onClick={() => void run(() => setShopCampaignStatus(campaign.id, "closed"), "המכירה נסגרה. הקישור כבר לא מקבל הזמנות.")}>סגירת המכירה</button>
            : <button disabled={busy} onClick={() => void run(() => setShopCampaignStatus(campaign.id, "open"), "המכירה נפתחה מחדש")}>פתיחה מחדש</button>}
          <button className="row-action danger" disabled={busy} onClick={remove} aria-label="מחיקת המכירה"><Trash2 size={16} /></button>
        </div>
      </div>

      <div className="kpi-grid tasting-kpis">
        <div className="kpi"><span>עובדים שהזמינו</span><strong>{summary.paid}</strong><small>{summary.cancelled ? `ועוד ${summary.cancelled} שבוטלו` : takesOrders ? "מתעדכן בזמן אמת" : "סה״כ במכירה"}</small></div>
        <div className="kpi"><span>שקיות להכנה</span><strong>{summary.units}</strong><small>{SHOP_UNIT} כל אחת</small></div>
        <div className="kpi"><span>נגבה</span><strong>{formatShekel(summary.collected)}</strong><small>כולל מע״מ</small></div>
        <div className="kpi"><span>משלוח</span><strong>{monthTitle(month)}</strong><small>יחד עם הקפה של החברה</small></div>
      </div>

      <div className="tasting-detail-grid">
        <section className="panel shop-packing">
          <div className="panel-head"><div><h3>רשימת הכנה</h3><p>כמה שקיות לארוז, לפי קפה וטחינה. ההזמנה מופיעה גם בלשונית &quot;הזמנות קפה&quot; של הלקוח, ליד הקפה של החברה.</p></div></div>
          {summary.lines.length
            ? <div className="table-wrap"><table><thead><tr><th>קפה</th><th>טחינה</th><th>שקיות</th><th>מזמינים</th></tr></thead><tbody>
                {summary.lines.map((line) => <tr key={line.key}><td><strong><bdi>{line.item.name}</bdi></strong></td><td>{grindLabel(line.grind)}</td><td><strong>{line.quantity}</strong></td><td>{line.buyers}</td></tr>)}
              </tbody></table></div>
            : <div className="inline-empty">עדיין אין הזמנות.</div>}
        </section>

        <section className="panel tasting-qr-card">
          <h3>הקישור לעובדים</h3>
          <p>{takesOrders ? "שולחים לאיש הקשר בארגון בוואטסאפ או במייל, או תולים את ה-QR ליד מכונת הקפה." : "המכירה לא מקבלת הזמנות כרגע."}</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
          {qr ? <img src={qr} alt="קוד QR להזמנת קפה" className={takesOrders ? "" : "muted"} /> : <div className="tasting-qr-placeholder" />}
          <div className="tasting-link-box"><span dir="ltr">{url}</span></div>
          <div className="tasting-qr-actions">
            <button onClick={() => void copyLink()}><Copy size={15} /> העתקת קישור</button>
            <button onClick={() => qr && download(qr, `qr-קפה-לעובדים-${campaign.customerName}.png`)} disabled={!qr}><Download size={15} /> הורדת QR</button>
            <button onClick={() => setFullscreen(true)} disabled={!qr}><Maximize2 size={15} /> מסך מלא</button>
          </div>
          {!campaign.paymentUrl && <p className="shop-payment-hint">אין עדיין קישור לתשלום. עד שהסליקה תחובר, העובדים יקבלו הודעה שנעדכן אותם לגבי התשלום.</p>}
        </section>
      </div>

      <section className="panel shop-orders">
        <div className="panel-head">
          <div><h3>הזמנות העובדים</h3><p>{shopApiUrl ? "סימון \"שולם\" מפיק חשבונית מס קבלה ברווחית ושולח אותה לעובד במייל." : "מסמנים כאן תשלום ומספר חשבונית. כשרווחית תחובר, החשבונית תופק לבד."}</p></div>
          <div className="tabs shop-order-filter">
            {(["all", "paid", "cancelled"] as const).map((key) => <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>
              {key === "all" ? "הכול" : SHOP_ORDER_STATUS_LABELS[key]} <small>{key === "all" ? placed.length : placed.filter((order) => order.status === key).length}</small>
            </button>)}
          </div>
        </div>
        {shown.length
          ? <div className="table-wrap"><table><thead><tr><th>הוזמן</th><th>עובד/ת</th><th>מה הזמינו</th><th>סכום</th><th>סטטוס</th><th>מספר חשבונית</th></tr></thead><tbody>
              {shown.map((order) => <tr key={order.id} className={order.status === "cancelled" ? "shop-order-cancelled" : ""}>
                <td>{formatDateTime(order.createdAt)}</td>
                <td><strong>{order.fullName}</strong><small dir="ltr">{order.phone} · {order.email}</small>{order.department && <small>{order.department}</small>}{order.note && <small className="shop-order-note">„{order.note}”</small>}</td>
                <td className="shop-order-lines">{orderLines(campaign.items, order.quantities).map((line) => <span key={line.key}><bdi>{line.item.name}</bdi> · {grindLabel(line.grind)} × {line.quantity}</span>)}</td>
                <td><strong>{formatShekel(orderAmount(campaign, order))}</strong>{order.paidAt && order.status === "paid" && <small>שולם {formatDate(order.paidAt)}</small>}</td>
                <td><select className="status-select" value={order.status} onChange={(event) => { if (guard()) setStatus(order, event.target.value as ShopOrderStatus); }}>
                  {(Object.keys(SHOP_ORDER_STATUS_LABELS) as ShopOrderStatus[]).map((status) => <option key={status} value={status}>{SHOP_ORDER_STATUS_LABELS[status]}</option>)}
                </select></td>
                <td>{order.invoiceUrl
                  ? <a className="shop-invoice-link" href={order.invoiceUrl} target="_blank" rel="noopener noreferrer">חשבונית {order.invoiceNumber}</a>
                  : shopApiUrl && order.status === "paid" && !order.invoiceNumber
                    ? <button className="row-action" disabled={busy} onClick={() => invoice(order)}>הפקת חשבונית</button>
                    : <input className="shop-invoice-input" key={order.invoiceNumber || ""} defaultValue={order.invoiceNumber || ""} maxLength={60} placeholder="—" aria-label={`מספר חשבונית של ${order.fullName}`} onBlur={(event) => { if (guard()) setInvoice(order, event.target.value.trim()); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />}</td>
              </tr>)}
            </tbody></table></div>
          : <div className="inline-empty">{placed.length ? "אין הזמנות בסטטוס הזה." : "עדיין לא התקבלו הזמנות. שלחו את הקישור לעובדים."}</div>}
        {drafts > 0 && <button className="text-btn shop-drafts-toggle" onClick={() => setShowDrafts((value) => !value)}>{showDrafts ? "הסתרת טיוטות" : `${drafts} עובדים פתחו את דף התשלום ולא שילמו (לבדיקה בלבד)`}</button>}
      </section>

      {fullscreen && <div className="tasting-fullscreen" onClick={() => setFullscreen(false)} role="dialog" aria-label="קוד QR במסך מלא">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src="/mister-bean-platform/brands/dada-logo.png" alt="DAdA Fresh Coffee" className="tasting-fullscreen-logo" />
        <h2>קפה טרי לעובדי {campaign.customerName}</h2>
        <p>סורקים, בוחרים קפה וטחינה, והקפה מגיע למשרד</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
        <img src={qr} alt="קוד QR להזמנת קפה" className="tasting-fullscreen-qr" />
        <small>הקישו בכל מקום כדי לסגור</small>
      </div>}
    </div>
  );
}

function ShopModal({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  useEffect(() => {
    document.body.classList.add("dialog-open");
    return () => document.body.classList.remove("dialog-open");
  }, []);
  return <div className="modal-backdrop" {...backdropDismiss(onClose)}>
    <div className={`modal ${wide ? "shop-modal-wide" : ""}`} role="dialog" aria-label={title}>
      <header><h2>{title}</h2><button onClick={onClose} aria-label="סגירה">×</button></header>
      {children}
    </div>
  </div>;
}
