"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Check, Clock, Lock, Minus, Package, Percent, Plus, ShoppingBag, Truck, X } from "lucide-react";
import { isFirebaseConfigured } from "@/lib/firebase-client";
import type { ShopCampaign, ShopGrind, ShopItem, ShopMethod, ShopOrder } from "@/lib/platform-types";
import {
  buyerError,
  formatShekel,
  grindLabel,
  isCampaignOpen,
  itemsForMethod,
  lineKey,
  MAX_SHOP_NOTE,
  MAX_SHOP_QUANTITY,
  orderLines,
  orderTotal,
  SHOP_GRINDS,
  SHOP_METHODS,
  type ShopBuyer,
  type ShopOrderLine,
} from "@/lib/shop-engine";
import { DADA_SHOP_CATALOG } from "@/lib/shop-catalog";
import { confirmShopPayment, shopApiUrl, startShopCheckout, submitShopOrder, subscribeToPublicShopCampaign } from "@/lib/shop-store";

const orderKey = (campaignId: string) => `shop-order-${campaignId}`;
const saleKey = (orderId: string) => `shop-sale-${orderId}`;
const buyerKey = "shop-buyer";
const emptyBuyer: ShopBuyer = { fullName: "", email: "", phone: "", department: "", note: "" };
const LOGO = "/mister-bean-platform/brands/dada-logo.png";

function readStorage(key: string) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeStorage(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* private mode: nothing is remembered */ }
}
function removeStorage(key: string) {
  try { window.localStorage.removeItem(key); } catch { /* private mode */ }
}
function readJson<T>(key: string): T | null {
  try { return JSON.parse(readStorage(key) || "null") as T | null; } catch { return null; }
}
const noSubscription = () => () => undefined;

const formatDate = (ms: number) => new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric" }).format(new Date(ms));
const firstName = (fullName: string) => fullName.trim().split(/\s+/)[0] || "";
const discountOf = (item: ShopItem) => (item.listPrice > item.price ? Math.round((1 - item.price / item.listPrice) * 100) : 0);
const blendStyle = (item: ShopItem) => ({ "--blend": item.color || "#6b4a36" }) as React.CSSProperties;

export default function ShopPage() {
  // The page is pre-rendered without a query string; the campaign id is only known in the browser.
  const search = useSyncExternalStore(noSubscription, () => window.location.search, () => null);
  const campaignId = search === null ? "" : new URLSearchParams(search).get("c")?.trim() || "";
  const [campaign, setCampaign] = useState<ShopCampaign | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [buyer, setBuyer] = useState<ShopBuyer>(() => (typeof window === "undefined" ? null : readJson<ShopBuyer>(buyerKey)) || emptyBuyer);
  const [method, setMethod] = useState<ShopMethod | "all">("all");
  /** The grind picked on each product card, by item id. */
  const [cardGrinds, setCardGrinds] = useState<Record<string, ShopGrind>>({});
  const [viewing, setViewing] = useState<ShopItem | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [placed, setPlaced] = useState<ShopOrder | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());
  const remembered = useSyncExternalStore(noSubscription, () => (campaignId ? readStorage(orderKey(campaignId)) : null), () => null);
  const rememberedOrder = useMemo(() => { try { return remembered ? JSON.parse(remembered) as ShopOrder : null; } catch { return null; } }, [remembered]);
  const [orderAgain, setOrderAgain] = useState(false);

  useEffect(() => {
    if (!campaignId || !isFirebaseConfigured) return;
    return subscribeToPublicShopCampaign(campaignId, setCampaign, () => setFailed(true));
  }, [campaignId]);

  const order = placed || (orderAgain ? null : rememberedOrder);
  const stage = search === null
    ? "loading"
    : !campaignId || !isFirebaseConfigured || failed || campaign === null
      ? "missing"
      : campaign === undefined
        ? "loading"
        : order
          ? "placed"
          : isCampaignOpen(campaign, now) ? "ready" : "closed";

  const items = useMemo(() => campaign?.items || [], [campaign]);
  const lines = orderLines(items, quantities);
  const total = orderTotal(items, quantities);
  const listTotal = lines.reduce((sum, line) => sum + Math.max(line.item.listPrice, line.item.price) * line.quantity, 0);
  const units = lines.reduce((sum, line) => sum + line.quantity, 0);
  const groups = useMemo(() => groupItems(itemsForMethod(items, method)), [items, method]);
  const discount = useMemo(() => {
    const percents = items.map(discountOf);
    return percents.length && percents.every((percent) => percent > 0 && percent === percents[0]) ? percents[0] : 0;
  }, [items]);
  const daysLeft = campaign?.closesAtMs ? Math.max(0, Math.ceil((campaign.closesAtMs - now) / 86400000)) : 0;

  const setQuantity = (key: string, quantity: number) => setQuantities((current) => {
    const next = { ...current };
    if (quantity > 0) next[key] = Math.min(MAX_SHOP_QUANTITY, quantity); else delete next[key];
    return next;
  });
  const add = (item: ShopItem, grind: ShopGrind, count = 1) => {
    const key = lineKey(item.id, grind);
    setQuantities((current) => ({ ...current, [key]: Math.min(MAX_SHOP_QUANTITY, (current[key] || 0) + count) }));
  };
  const send = async () => {
    if (!campaign || sending) return;
    if (!units) { setError("יש לבחור לפחות שקית קפה אחת."); return; }
    const problem = buyerError(buyer);
    if (problem) { setError(problem); return; }
    setSending(true);
    setError("");
    try {
      const saved = await submitShopOrder(campaign, buyer, quantities);
      writeStorage(orderKey(campaign.id), JSON.stringify(saved));
      writeStorage(buyerKey, JSON.stringify({ ...buyer, note: "" }));
      setQuantities({});
      setBuyer((current) => ({ ...current, note: "" }));
      // Straight on to the payment page; if that fails, the order screen offers to pay again.
      if (shopApiUrl && await goToPayment(campaign, saved)) return;
      setCheckoutOpen(false);
      setPlaced(saved);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError(isCampaignOpen(campaign) ? "השליחה לא הצליחה. כדאי לבדוק את החיבור לאינטרנט ולנסות שוב." : "ההזמנות לסבב הזה כבר נסגרו.");
    } finally {
      setSending(false);
    }
  };

  const startAgain = () => {
    if (campaign) removeStorage(orderKey(campaign.id));
    setPlaced(null);
    setOrderAgain(true);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="sp" dir="rtl">
      <header className="sp-header">
        <div className="sp-header-inner">
          {/* eslint-disable-next-line @next/next/no-img-element -- static export, plain image */}
          <img className="sp-logo" src={LOGO} alt="DAdA Fresh Coffee" />
          <div className="sp-header-title">
            <b>חנות הקפה לעובדים</b>
            {campaign && <small><bdi>{campaign.customerName}</bdi></small>}
          </div>
          {stage === "ready" && <button type="button" className="sp-header-cart" onClick={() => { if (units) { setError(""); setCheckoutOpen(true); } }} aria-label={`הסל שלי, ${units} פריטים`}>
            <ShoppingBag size={22} aria-hidden />
            {units > 0 && <b>{units}</b>}
          </button>}
        </div>
      </header>

      <div className="sp-wrap">
        {stage === "loading" && <div className="sp-state"><i className="sp-spinner" /><p>טוענים את החנות…</p></div>}
        {stage === "missing" && <div className="sp-state"><h2>המכירה לא נמצאה</h2><p>כדאי לפתוח שוב את הקישור שקיבלתם, או לבקש קישור חדש.</p></div>}
        {stage === "closed" && <div className="sp-state"><h2>ההזמנות לסבב הזה נסגרו</h2><p>תודה! נשמח לראות אתכם בסבב הבא.</p></div>}
        {stage === "placed" && order && campaign && <PlacedOrder order={order} campaign={campaign} canOrderAgain={isCampaignOpen(campaign)} onOrderAgain={startAgain} />}

        {stage === "ready" && campaign && <>
          <section className="sp-banner">
            <div className="sp-banner-text">
              {discount > 0 && <span className="sp-banner-tag">{discount}% הנחה לעובדים</span>}
              <h1>קפה טרי של DAdA,<br />ישר אליכם למשרד</h1>
              <p>פולי קפה קלויים טרי מבית הקלייה, בשקיות של 1 ק״ג.</p>
              {daysLeft > 0 && <p className="sp-banner-date"><Clock size={15} aria-hidden /> פתוח להזמנות עד {formatDate(campaign.closesAtMs)}{daysLeft <= 3 && ` · נשארו ${daysLeft === 1 ? "יום אחד" : `${daysLeft} ימים`}`}</p>}
            </div>
            <div className="sp-banner-photos" aria-hidden>
              {["house-blend-plus", "ethiopia-sidamo-natural", "toscanini"].map((id) => (
                // eslint-disable-next-line @next/next/no-img-element -- static export
                <img key={id} src={photoUrl(id)} alt="" />
              ))}
            </div>
          </section>

          <ul className="sp-perks">
            <li><Percent size={20} aria-hidden /><span><b>{discount > 0 ? `${discount}% הנחה` : "מחיר לעובדים"}</b>ממחירי החנות</span></li>
            <li><Truck size={20} aria-hidden /><span><b>משלוח מרוכז</b>ישר למשרד</span></li>
            <li><Package size={20} aria-hidden /><span><b>חשבונית במייל</b>כולל מע״מ</span></li>
          </ul>
          {campaign.note && <p className="sp-note"><Truck size={17} aria-hidden /><span>{campaign.note}</span></p>}

          <section className="sp-shop" id="sp-coffee" aria-label="הקפה">
            <div className="sp-filter">
              <p className="sp-filter-label">איך אתם מכינים קפה? נציג את מה שמתאים</p>
              <div className="sp-tabs" role="tablist" aria-label="סינון לפי שיטת הכנה">
                <button type="button" role="tab" aria-selected={method === "all"} onClick={() => setMethod("all")}>הכול</button>
                {SHOP_METHODS.map((item) => <button type="button" role="tab" key={item.id} aria-selected={method === item.id} onClick={() => setMethod(item.id)}>
                  <MethodIcon method={item.id} />{item.label}
                </button>)}
              </div>
            </div>

            {groups.map(([group, groupItems]) => <div className="sp-section" key={group}>
              {group && <h2 className="sp-section-title">{group === "חד זני" ? "קפה חד זני" : "תערובות"} <span>{groupItems.length} מוצרים</span></h2>}
              <div className="sp-grid">
                {groupItems.map((item) => {
                  const grind = cardGrinds[item.id];
                  return <ProductCard
                    key={item.id}
                    item={item}
                    lines={lines.filter((line) => line.item.id === item.id)}
                    grind={grind}
                    onGrind={(next) => setCardGrinds((current) => ({ ...current, [item.id]: next }))}
                    onOpen={() => setViewing(item)}
                    onAdd={() => { if (grind) add(item, grind); }}
                    onQuantity={setQuantity}
                  />;
                })}
              </div>
            </div>)}
            {!groups.length && <div className="sp-state small"><p>אין במכירה הזו קפה שמתאים לשיטה הזו.</p><button type="button" className="sp-link" onClick={() => setMethod("all")}>הצגת כל הקפה</button></div>}
          </section>
        </>}

        <footer className="sp-foot">
          <p>DAdA Fresh Coffee · בית קלייה בוטיק ישראלי</p>
          <small><Lock size={12} aria-hidden /> הזמנה ותשלום מאובטחים</small>
        </footer>
      </div>

      {stage === "ready" && units > 0 && !checkoutOpen && !viewing && <button className="sp-cartbar" onClick={() => { setError(""); setCheckoutOpen(true); }}>
        <span className="sp-cartbar-count">{units}</span>
        <span className="sp-cartbar-text">מעבר לסל</span>
        <strong>{formatShekel(total)}</strong>
      </button>}

      {viewing && <ProductSheet
        item={viewing}
        defaultGrind={cardGrinds[viewing.id] || null}
        lines={lines.filter((line) => line.item.id === viewing.id)}
        onAdd={(grind, count) => { add(viewing, grind, count); setCardGrinds((current) => ({ ...current, [viewing.id]: grind })); setViewing(null); }}
        onClose={() => setViewing(null)}
      />}

      {checkoutOpen && campaign && <Checkout
        lines={lines}
        total={total}
        saving={Math.round(listTotal - total)}
        buyer={buyer}
        error={error}
        sending={sending}
        online={Boolean(shopApiUrl)}
        onBuyer={setBuyer}
        onQuantity={setQuantity}
        onClose={() => setCheckoutOpen(false)}
        onSend={() => void send()}
      />}
    </div>
  );
}

function ProductCard({ item, lines, grind, onGrind, onOpen, onAdd, onQuantity }: {
  item: ShopItem;
  lines: ShopOrderLine[];
  grind?: ShopGrind;
  onGrind: (grind: ShopGrind) => void;
  onOpen: () => void;
  onAdd: () => void;
  onQuantity: (key: string, quantity: number) => void;
}) {
  const off = discountOf(item);
  const [missing, setMissing] = useState(false);
  const current = grind ? lines.find((line) => line.grind === grind) : undefined;
  const others = lines.filter((line) => line !== current);
  return <article className={`sp-card ${lines.length ? "in-cart" : ""}`}>
    <button type="button" className="sp-card-photo" onClick={onOpen} aria-label={`פרטים על ${item.name}`}>
      <Photo item={item} />
      {off > 0 && <span className="sp-sale">-{off}%</span>}
      {item.badge && <em className="sp-badge">{item.badge}</em>}
    </button>
    <div className="sp-card-body">
      <button type="button" className="sp-card-name" onClick={onOpen}><bdi>{item.name}</bdi></button>
      <small className="sp-card-sub">{item.tags?.length ? item.tags.join(" · ") : `${item.group === "חד זני" ? "חד זני" : "תערובת"} · ${item.unit}`}</small>
      <span className="sp-price"><strong>{formatShekel(item.price)}</strong>{off > 0 && <s>{formatShekel(item.listPrice)}</s>}</span>
      <select className={`sp-grind-select ${missing ? "missing" : ""} ${grind ? "" : "empty"}`} value={grind || ""} aria-label={`פולים או טחון: ${item.name}`} onChange={(event) => { onGrind(event.target.value as ShopGrind); setMissing(false); }}>
        <option value="" disabled>פולים או טחון?</option>
        {SHOP_GRINDS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
      {current
        ? <div className="sp-card-qty"><Stepper label={`${item.name} ${grindLabel(current.grind)}`} value={current.quantity} onChange={(value) => onQuantity(current.key, value)} /><small>בסל</small></div>
        : <button type="button" className="sp-add" onClick={() => { if (grind) onAdd(); else setMissing(true); }}>הוספה לסל</button>}
      {missing && !grind && <small className="sp-card-hint">בחרו קודם פולים או טחון</small>}
      {others.length > 0 && <small className="sp-card-also"><Check size={12} aria-hidden /> בסל גם: {others.map((line) => `${grindLabel(line.grind)} × ${line.quantity}`).join(", ")}</small>}
    </div>
  </article>;
}

/** Quantity buttons. In the cart, going below one removes the line; elsewhere one is the minimum. */
function Stepper({ label, value, onChange, min = 0 }: { label: string; value: number; onChange: (value: number) => void; min?: number }) {
  const removes = min === 0 && value === 1;
  return <div className="sp-stepper" role="group" aria-label={`כמות ${label}`}>
    <button type="button" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={removes ? "הסרה" : "הפחתה"}>{removes ? <X size={14} aria-hidden /> : <Minus size={14} aria-hidden />}</button>
    <b aria-live="polite">{value}</b>
    <button type="button" disabled={value >= MAX_SHOP_QUANTITY} onClick={() => onChange(value + 1)} aria-label="הוספה"><Plus size={14} aria-hidden /></button>
  </div>;
}

/** A bottom sheet on phones, a centred card on wider screens. */
function Sheet({ label, className = "", onClose, children }: { label: string; className?: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    document.body.classList.add("dialog-open");
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => { document.body.classList.remove("dialog-open"); window.removeEventListener("keydown", close); };
  }, [onClose]);
  return createPortal(<div className="sp sp-backdrop" dir="rtl" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={`sp-sheet ${className}`} role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" className="sp-close" onClick={onClose} aria-label="סגירה"><X size={20} aria-hidden /></button>
      {children}
    </div>
  </div>, document.body);
}

/** One coffee in full: DAdA's description, its profile, and how to add it. */
function ProductSheet({ item, defaultGrind, lines, onAdd, onClose }: {
  item: ShopItem;
  defaultGrind: ShopGrind | null;
  lines: ShopOrderLine[];
  onAdd: (grind: ShopGrind, count: number) => void;
  onClose: () => void;
}) {
  const [grind, setGrind] = useState<ShopGrind | null>(defaultGrind);
  const [count, setCount] = useState(1);
  const off = discountOf(item);
  return <Sheet label={item.name} className="sp-product" onClose={onClose}>
    <div className="sp-product-visual"><Photo item={item} /></div>
    <div className="sp-sheet-body">
      <div className="sp-product-head">
        <div>
          {item.badge && <em className="sp-badge">{item.badge}</em>}
          <h2><bdi>{item.name}</bdi></h2>
          <small>{item.group === "חד זני" ? "קפה חד זני" : "תערובת"} · {item.unit}</small>
        </div>
        <span className="sp-price big"><strong>{formatShekel(item.price)}</strong>{off > 0 && <s>{formatShekel(item.listPrice)}</s>}</span>
      </div>
      <BlendProfile item={item} />
      <h3>פולים או טחון?</h3>
      <div className="sp-grinds" role="radiogroup" aria-label="סוג טחינה">
        {SHOP_GRINDS.map((option) => <button type="button" role="radio" aria-checked={grind === option.id} key={option.id} onClick={() => setGrind(option.id)}>{option.label}</button>)}
      </div>
      {lines.length > 0 && <p className="sp-already"><Check size={14} aria-hidden /> כבר בסל: {lines.map((line) => `${grindLabel(line.grind)} × ${line.quantity}`).join(", ")}</p>}
    </div>
    <footer className="sp-sheet-foot">
      <Stepper label={item.name} value={count} min={1} onChange={setCount} />
      <button type="button" className="sp-primary" disabled={!grind} onClick={() => grind && onAdd(grind, count)}>
        <span>{grind ? "הוספה לסל" : "בחרו פולים או טחון"}</span>
        {grind && <b>{formatShekel(item.price * count)}</b>}
      </button>
    </footer>
  </Sheet>;
}

/** The cart, the buyer's details and the way to payment, in one sheet. */
function Checkout({ lines, total, saving, buyer, error, sending, online, onBuyer, onQuantity, onClose, onSend }: {
  lines: ShopOrderLine[];
  total: number;
  saving: number;
  buyer: ShopBuyer;
  error: string;
  sending: boolean;
  online: boolean;
  onBuyer: (buyer: ShopBuyer) => void;
  onQuantity: (key: string, quantity: number) => void;
  onClose: () => void;
  onSend: () => void;
}) {
  useEffect(() => { if (!lines.length) onClose(); }, [lines.length, onClose]);
  const field = (key: keyof ShopBuyer) => ({ value: buyer[key], onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onBuyer({ ...buyer, [key]: event.target.value }) });

  return <Sheet label="הסל שלי" onClose={onClose}>
    <div className="sp-sheet-body">
      <h2 className="sp-sheet-title">הסל שלי</h2>
      <ul className="sp-cart">
        {lines.map((line) => <li key={line.key} style={blendStyle(line.item)}>
          <span className="sp-cart-thumb"><Photo item={line.item} /></span>
          <span className="sp-cart-text"><b><bdi>{line.item.name}</bdi></b><small>{grindLabel(line.grind)}</small></span>
          <Stepper label={`${line.item.name} ${grindLabel(line.grind)}`} value={line.quantity} onChange={(quantity) => onQuantity(line.key, quantity)} />
          <span className="sp-cart-price">
            <strong>{formatShekel(line.lineTotal)}</strong>
            {line.item.listPrice > line.item.price && <s>{formatShekel(line.item.listPrice * line.quantity)}</s>}
          </span>
        </li>)}
      </ul>
      <div className="sp-totals">
        {saving > 0 && <>
          <p className="sp-subtotal"><span>מחיר בחנות</span><s>{formatShekel(total + saving)}</s></p>
          <p className="sp-saving"><span>הנחת עובדים</span><b>−{formatShekel(saving)}</b></p>
        </>}
        <p className="sp-grand"><span>סה״כ לתשלום <small>כולל מע״מ</small></span><strong>{formatShekel(total)}</strong></p>
      </div>

      <h3>הפרטים שלכם</h3>
      <div className="sp-fields">
        <label><span>שם מלא</span><input autoComplete="name" maxLength={120} {...field("fullName")} /></label>
        <label><span>טלפון נייד</span><input type="tel" inputMode="tel" autoComplete="tel" dir="ltr" maxLength={40} {...field("phone")} /></label>
        <label className="wide"><span>מייל <small>לשם תישלח החשבונית</small></span><input type="email" inputMode="email" autoComplete="email" dir="ltr" maxLength={320} {...field("email")} /></label>
        <label className="wide"><span>מחלקה / קומה <small>לא חובה</small></span><input maxLength={120} {...field("department")} /></label>
        <label className="wide"><span>הערה <small>לא חובה</small></span><textarea rows={2} maxLength={MAX_SHOP_NOTE} {...field("note")} /></label>
      </div>
    </div>
    <footer className="sp-sheet-foot column">
      {error && <p className="sp-error" role="alert">{error}</p>}
      <button type="button" className="sp-primary" disabled={sending} onClick={onSend}>
        {online && <Lock size={16} aria-hidden />}
        <span>{sending ? (online ? "מעבירים לתשלום מאובטח…" : "שולחים…") : online ? "לתשלום" : "שליחת ההזמנה"}</span>
        {!sending && <b>{formatShekel(total)}</b>}
      </button>
      <p className="sp-trust">{online ? "כרטיס אשראי, Apple Pay, Google Pay או Bit · חשבונית מס קבלה במייל" : "החשבונית תישלח אליכם במייל"}</p>
    </footer>
  </Sheet>;
}

/** Opens the order's payment page. Returns false when that is not possible right now. */
async function goToPayment(campaign: ShopCampaign, order: ShopOrder) {
  try {
    const { url, saleToken } = await startShopCheckout(campaign, order);
    writeStorage(saleKey(order.id), saleToken);
    window.location.assign(url);
    return true;
  } catch {
    return false;
  }
}

type PaymentState = "unpaid" | "redirecting" | "checking" | "paid" | "failed";

function PlacedOrder({ order, campaign, canOrderAgain, onOrderAgain }: { order: ShopOrder; campaign: ShopCampaign; canOrderAgain: boolean; onOrderAgain: () => void }) {
  const lines = orderLines(campaign.items, order.quantities);
  const total = orderTotal(campaign.items, order.quantities);
  const online = Boolean(shopApiUrl);
  // Back from the payment page, the address carries ?paid=<order id>.
  const returning = useSyncExternalStore(noSubscription, () => new URLSearchParams(window.location.search).get("paid") === order.id, () => false);
  const [state, setState] = useState<PaymentState>(() => (order.status === "paid" ? "paid" : online && returning ? "checking" : "unpaid"));
  const [invoice, setInvoice] = useState({ number: order.invoiceNumber || "", url: order.invoiceUrl || "" });

  useEffect(() => {
    if (state !== "checking") return;
    let cancelled = false;
    // iCredit may need a few seconds to settle the payment; ask a few times.
    void (async () => {
      for (let attempt = 0; attempt < 6 && !cancelled; attempt += 1) {
        try {
          const result = await confirmShopPayment(campaign, order, readStorage(saleKey(order.id)) || "");
          if (result.paid) {
            if (cancelled) return;
            setInvoice({ number: result.invoiceNumber || "", url: result.invoiceUrl || "" });
            setState("paid");
            writeStorage(orderKey(campaign.id), JSON.stringify({ ...order, status: "paid", invoiceNumber: result.invoiceNumber, invoiceUrl: result.invoiceUrl }));
            removeStorage(saleKey(order.id));
            return;
          }
        } catch { /* try again */ }
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
      if (!cancelled) setState("unpaid");
    })();
    return () => { cancelled = true; };
  }, [state, campaign, order]);

  const pay = async () => {
    setState("redirecting");
    if (!(await goToPayment(campaign, order))) setState("failed");
  };

  const paid = state === "paid";
  return <div className="sp-done">
    <section className={`sp-done-card ${paid ? "paid" : ""}`}>
      {state === "checking"
        ? <i className="sp-spinner" />
        : <span className="sp-done-mark" aria-hidden>{paid ? <Check size={30} strokeWidth={2.6} /> : <ShoppingBag size={26} />}</span>}
      <h1>{state === "checking" ? "בודקים את התשלום…" : paid ? `תודה ${firstName(order.fullName)}, התשלום התקבל` : `תודה ${firstName(order.fullName)}, ההזמנה התקבלה`}</h1>
      {paid && <p>החשבונית {invoice.number ? "נשלחה" : "תישלח"} אל <bdi>{order.email}</bdi>{invoice.url && <> · <a href={invoice.url} target="_blank" rel="noopener noreferrer">לצפייה בחשבונית</a></>}</p>}
      {!paid && state !== "checking" && <p>{online ? "נשאר רק לשלם, והקפה בדרך אליכם." : campaign.paymentUrl ? "נשאר רק לשלם. החשבונית תישלח אליכם במייל." : "נעדכן אתכם בהמשך לגבי התשלום. החשבונית תישלח אליכם במייל."}</p>}
      {state === "failed" && <p className="sp-error">לא הצלחנו לפתוח את דף התשלום. נסו שוב בעוד רגע.</p>}
      {online && !paid && state !== "checking" && <button className="sp-primary" disabled={state === "redirecting"} onClick={() => void pay()}>
        <Lock size={16} aria-hidden /><span>{state === "redirecting" ? "פותחים את דף התשלום…" : "לתשלום"}</span>{state !== "redirecting" && <b>{formatShekel(total)}</b>}
      </button>}
      {!online && campaign.paymentUrl && <a className="sp-primary" href={campaign.paymentUrl} target="_blank" rel="noopener noreferrer"><span>מעבר לתשלום</span><b>{formatShekel(total)}</b></a>}
    </section>

    <section className="sp-receipt">
      <h2>ההזמנה שלך</h2>
      <ul className="sp-cart">
        {lines.map((line) => <li key={line.key} className="readonly" style={blendStyle(line.item)}>
          <span className="sp-cart-thumb"><Photo item={line.item} /></span>
          <span className="sp-cart-text"><b><bdi>{line.item.name}</bdi></b><small>{grindLabel(line.grind)} · {line.quantity} {line.quantity === 1 ? "שקית" : "שקיות"}</small></span>
          <strong>{formatShekel(line.lineTotal)}</strong>
        </li>)}
      </ul>
      <p className="sp-grand"><span>סה״כ {paid ? "שולם" : "לתשלום"}</span><strong>{formatShekel(total)}</strong></p>
      <p className="sp-note"><Truck size={18} aria-hidden /><span>{campaign.note || "הקפה יגיע אליכם למשרד."}</span></p>
    </section>
    {canOrderAgain && <button className="sp-link center" onClick={onOrderAgain}>הזמנה נוספת</button>}
  </div>;
}

function groupItems(items: ShopItem[]) {
  const byGroup = new Map<string, ShopItem[]>();
  for (const item of items) byGroup.set(item.group || "", [...(byGroup.get(item.group || "") || []), item]);
  return [...byGroup.entries()];
}

const PHOTO_IDS = new Set(DADA_SHOP_CATALOG.map((item) => item.id));
const photoUrl = (id: string) => `/mister-bean-platform/shop/coffee/${id}.jpg`;

/** DAdA's product photo; a coffee added by hand gets a plain bag outline instead. */
function Photo({ item }: { item: ShopItem }) {
  if (!PHOTO_IDS.has(item.id)) return <span className="sp-photo-none" aria-hidden><Package size={36} /></span>;
  // eslint-disable-next-line @next/next/no-img-element -- static export, no image optimisation
  return <img className="sp-photo" src={photoUrl(item.id)} alt="" loading="lazy" />;
}

function Meter({ label, value, low, high }: { label: string; value: number; low: string; high: string }) {
  return <div className="sp-meter">
    <span>{label}</span>
    <i role="meter" aria-label={label} aria-valuemin={1} aria-valuemax={5} aria-valuenow={value}>{[1, 2, 3, 4, 5].map((step) => <b key={step} className={step <= value ? "on" : ""} />)}</i>
    <small>{value <= 2 ? low : value >= 4 ? high : "בינוני"}</small>
  </div>;
}

/** DAdA's description, the arabica/robusta split, and body and acidity where the printed menu gives them. */
function BlendProfile({ item }: { item: ShopItem }) {
  const arabica = typeof item.arabicaPercent === "number" ? item.arabicaPercent : null;
  const methods = SHOP_METHODS.filter((method) => item.methods?.includes(method.id)).map((method) => method.label);
  return <div className="sp-profile" style={blendStyle(item)}>
    {item.description && <p>{item.description}</p>}
    {item.tags?.length ? <div className="sp-tags">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
    {arabica !== null && <div className="sp-ratio" aria-label={`${arabica}% ערביקה, ${100 - arabica}% רובוסטה`}>
      {arabica > 0 && <span style={{ flexGrow: arabica }}>ערביקה {arabica}%</span>}
      {arabica < 100 && <span className="robusta" style={{ flexGrow: 100 - arabica }}>רובוסטה {100 - arabica}%</span>}
    </div>}
    {(item.body || 0) > 0 && <Meter label="גוף" value={item.body!} low="קליל" high="מלא" />}
    {(item.acidity || 0) > 0 && <Meter label="חומציות" value={item.acidity!} low="נמוכה" high="גבוהה" />}
    {methods.length > 0 && <small className="sp-fits">מתאים ל{methods.join(", ")}</small>}
  </div>;
}

/** Line drawings of the ways to make coffee at home. */
function MethodIcon({ method }: { method: ShopMethod | "all" }) {
  const common = { width: 28, height: 28, viewBox: "0 0 32 32", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (method) {
    case "auto":
      return <svg {...common}><rect x="6" y="3.5" width="20" height="25" rx="3" /><rect x="10" y="7.5" width="12" height="5" rx="1.5" /><path d="M14 16h4v2.5h-4z" /><path d="M12.5 21.5h7v2.5a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2z" /></svg>;
    case "espresso":
      return <svg {...common}><path d="M4 11h15v1.5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" /><path d="M19 13h9" /><path d="M7 11V8.5h9V11" /><path d="M9.5 20.5v2M13.5 20.5v2" /><path d="M7.5 25h8v1a2.5 2.5 0 0 1-2.5 2.5h-3A2.5 2.5 0 0 1 7.5 26z" /></svg>;
    case "turkish":
      return <svg {...common}><path d="M8 12h11l-1.6 3.5 2 8.5a3 3 0 0 1-2.9 3.5h-6a3 3 0 0 1-2.9-3.5l2-8.5z" /><path d="M19 13.5l9-3" /><path d="M11 4.5c0 1.6 1.4 1.6 1.4 3.2M15 4.5c0 1.6 1.4 1.6 1.4 3.2" /></svg>;
    case "moka":
      return <svg {...common}><path d="M10 4.5h11l-1.5 9h-8z" /><path d="M8.5 16.5h14l-2 12h-10z" /><path d="M11 14.5h9" /><path d="M21 6.5h3.5a1.5 1.5 0 0 1 1.5 1.5v4.5" /></svg>;
    case "filter":
      return <svg {...common}><path d="M5 6.5h22l-8 10h-6z" /><path d="M12 16.5h8v2.5h-8z" /><path d="M8.5 22h15v3.5a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3z" /></svg>;
    default:
      return <svg {...common}><circle cx="16" cy="16" r="11" /><path d="M13 12.5a3 3 0 1 1 4.2 2.8c-.8.4-1.2 1-1.2 1.9V18" /><path d="M16 21.5v.5" /></svg>;
  }
}
