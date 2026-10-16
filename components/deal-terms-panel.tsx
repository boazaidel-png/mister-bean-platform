"use client";

import { FormEvent, useEffect, useState } from "react";
import type { CommercialAgreement, CommercialAgreementModel, Customer, CustomerDeal, DealLoan, DealTermsVersion, EquipmentPurchase, Quote } from "@/lib/platform-types";
import { calculateQuote } from "@/lib/quote-engine";
import { commercialAgreementFromQuote, commercialAgreementLabel } from "@/lib/commercial-agreement";
import { addMonths, dealFromQuote, loanPayment, monthLabel, termsAt, versionKg, versionMonthlyIncome, withVersion, type QuoteFigures } from "@/lib/deal-terms";
import { saveCustomerDeal, subscribeToCustomerDeal } from "@/lib/firebase-platform";
import { backdropDismiss } from "@/lib/backdrop-dismiss";

/**
 * The "הסכם" tab for administrators: the terms in force, what changed and
 * when, the equipment bought for the customer and the loans that paid for it.
 * One button changes the deal from a chosen month; earlier months keep theirs.
 */

type Props = {
  customer: Customer;
  /** The quote the card works from, if any. */
  quote?: Quote;
  agreement?: CommercialAgreement;
  actor: string;
  readOnly: boolean;
  onToast: (message: string) => void;
  /** Shown while the deal has not been set up yet: the agreement as it is on the card today. */
  fallback?: React.ReactNode;
};

const shekels = (value: number) => `₪${Math.round(value).toLocaleString("he-IL")}`;
const thisMonth = () => new Date().toISOString().slice(0, 7);
const createId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const MODELS: CommercialAgreementModel[] = ["beans_only", "equipment_rental", "equipment_sale", "monthly_package", "mixed"];
const payDelayLabel = (months: number) => months <= 0 ? "באותו חודש" : `שוטף + ${months * 30}`;
const installmentsLabel = (count: number) => count <= 1 ? "תשלום אחד" : `${count} תשלומים`;

function figuresOf(quote: Quote): QuoteFigures {
  const metrics = calculateQuote(quote);
  return {
    model: commercialAgreementFromQuote(quote).model,
    equipmentTotal: metrics.equipment.total,
    saleIncome: metrics.equipment.saleIncome,
    leaseIncome: metrics.equipment.leaseIncome,
    operatingCost: metrics.cashflow.rows[0]?.operatingCost || 0,
    financing: { type: metrics.financing.type, amount: metrics.financing.amount, months: metrics.financing.months },
  };
}

/** Without a quote: the agreement entered on the card becomes the first version, as it is. */
function dealFromAgreement(customer: Customer, agreement: CommercialAgreement, startMonth: string, by: string): CustomerDeal {
  const now = new Date().toISOString();
  return {
    startMonth,
    contractMonths: 36,
    versions: [{
      id: `terms-${startMonth}`, fromMonth: startMonth, note: "הסכם התחלתי, מתוך ההסכם בכרטיס",
      model: agreement.model,
      blends: agreement.monthlyBeanKg > 0 ? [{ blend: customer.contractBlends?.[0] || "", kg: agreement.monthlyBeanKg, pricePerKg: agreement.beanPricePerKg, costPerKg: agreement.beanCostPerKg }] : [],
      packageCount: agreement.packageCount, packageMonthlyFee: agreement.packageMonthlyFee,
      packageIncludedKgPerUnit: agreement.packageIncludedKgPerUnit, extraKgPrice: agreement.extraKgPrice,
      monthlyRentalIncome: agreement.monthlyRentalIncome, monthlyServiceIncome: agreement.monthlyServiceIncome,
      operatingCostEstimate: 0, clientPayDelayMonths: 0, coffeeSupplierPayDelayMonths: 0, createdAt: now, createdBy: by,
    }],
    purchases: [],
    loans: [],
    updatedAt: now,
  };
}

export function DealTermsPanel({ customer, quote, agreement, actor, readOnly, onToast, fallback }: Props) {
  const [deal, setDeal] = useState<CustomerDeal | null | undefined>(undefined);
  const [shown, setShown] = useState("");
  const [dialog, setDialog] = useState<null | "start" | "update" | "contract" | { purchase: EquipmentPurchase } | { loan: DealLoan }>(null);
  useEffect(() => subscribeToCustomerDeal(customer.id, setDeal, () => { setDeal(null); onToast("לא ניתן לטעון את ההסכם"); }), [customer.id, onToast]);
  const guard = () => { if (readOnly) { onToast("מצב התצוגה הוא לקריאה בלבד"); return false; } return true; };
  const save = async (next: CustomerDeal, message: string) => {
    try { await saveCustomerDeal(customer.id, { ...next, updatedAt: new Date().toISOString() }); setDialog(null); onToast(message); }
    catch (error) { onToast(error instanceof Error && error.message.includes("permission") ? "אין הרשאה. ייתכן שחוקי ההרשאה עוד לא עודכנו." : "השמירה נכשלה"); }
  };

  if (deal === undefined) return <section className="panel"><div className="workspace-loading"><i /><span>טוען את ההסכם…</span></div></section>;

  if (!deal) {
    return <><section className="panel deal-start">
      <h3>ההסכם עוד לא הוקם במבנה החדש</h3>
      <p>{quote ? `ההסכם ייבנה מההצעה "${quote.versionName}": הקפה, המחירים, הציוד, המימון ותנאי התשלום. לפני השמירה תראו בדיוק מה ייכנס.` : agreement ? "ההסכם ייבנה מההסכם שהוזן בכרטיס." : "אין הצעה מאושרת או הסכם בכרטיס שאפשר לבנות ממנו."}</p>
      {(quote || agreement) && <button className="primary" onClick={() => { if (guard()) setDialog("start"); }}>הקמת ההסכם</button>}
      {dialog === "start" && <StartDialog customer={customer} quote={quote} agreement={agreement} actor={actor} onClose={() => setDialog(null)} onSave={(next) => save(next, "ההסכם הוקם")} />}
    </section>{fallback && <><div className="section-spacer" />{fallback}</>}</>;
  }

  const current = termsAt(deal, thisMonth());
  const viewed = deal.versions.find((version) => version.id === shown) || current;
  const endMonth = addMonths(deal.startMonth, deal.contractMonths - 1);

  return <div className="deal-terms">
    <section className="panel">
      <div className="panel-head">
        <div><h3>תנאי ההסכם</h3><p>{viewed === current ? `בתוקף מ${monthLabel(viewed!.fromMonth)}` : `כפי שהיו מ${monthLabel(viewed!.fromMonth)}`} · ההסכם {monthLabel(deal.startMonth)} עד {monthLabel(endMonth)} <button className="text-btn" onClick={() => { if (guard()) setDialog("contract"); }}>עריכה</button></p></div>
        <button className="primary" onClick={() => { if (guard()) setDialog("update"); }}>עדכון ההסכם</button>
      </div>
      {viewed && <TermsView version={viewed} />}
      <div className="deal-timeline" aria-label="שינויים בהסכם">
        {deal.versions.map((version) => <button key={version.id} className={version.id === viewed?.id ? "active" : ""} onClick={() => setShown(version.id)}>
          <b>{monthLabel(version.fromMonth)}</b><span>{version.note}</span>
        </button>)}
      </div>
    </section>

    <div className="dashboard-grid">
      <section className="panel">
        <div className="panel-head"><div><h3>ציוד</h3><p>{customer.pilot ? "לקוח בפיילוט: הציוד לא נספר ברווחיות ובתזרים. עלויות בפועל נרשמות בלשונית כספים." : "כל רכישה עם תנאי התשלום שלה לספק"}</p></div></div>
        {deal.purchases.length ? <div className="deal-list">{deal.purchases.map((item) => <button key={item.id} onClick={() => { if (guard()) setDialog({ purchase: item }); }}>
          <strong>{item.description}</strong><span>{monthLabel(item.month)} · עלות {shekels(item.cost)}</span>
          <small>לספק: {item.supplierPayDelayMonths ? `תשלום ראשון אחרי ${item.supplierPayDelayMonths} חודשים` : "תשלום ראשון באותו חודש"} · {installmentsLabel(item.supplierInstallments)}{item.saleIncome ? ` · הלקוח משלם ${shekels(item.saleIncome)} ב${installmentsLabel(item.clientInstallments)}` : ""}</small>
        </button>)}</div> : <div className="inline-empty">אין רכישות ציוד.</div>}
      </section>
      <section className="panel">
        <div className="panel-head"><div><h3>מימון</h3><p>כפי שנחתם בפועל</p></div><button className="row-action" onClick={() => { if (guard()) setDialog({ loan: { id: "", description: "מימון", amount: 0, annualInterest: 0, months: 12, receivedMonth: thisMonth(), firstPaymentMonth: thisMonth(), createdAt: "" } }); }}>＋ מימון</button></div>
        {deal.loans.length ? <div className="deal-list">{deal.loans.map((item) => <button key={item.id} onClick={() => { if (guard()) setDialog({ loan: item }); }}>
          <strong>{item.description} · {shekels(item.amount)}</strong><span>{item.months} תשלומים של {shekels(loanPayment(item))} · ריבית {item.annualInterest}% לשנה</span>
          <small>התקבל ב{monthLabel(item.receivedMonth)} · תשלום ראשון ב{monthLabel(item.firstPaymentMonth)} · אחרון ב{monthLabel(addMonths(item.firstPaymentMonth, item.months - 1))}</small>
        </button>)}</div> : <div className="inline-empty">אין מימון.</div>}
      </section>
    </div>

    {dialog === "update" && current && <UpdateDialog deal={deal} current={current} actor={actor} onClose={() => setDialog(null)} onSave={(next, message) => save(next, message)} />}
    {dialog === "contract" && <ContractDialog deal={deal} onClose={() => setDialog(null)} onSave={(next) => save(next, "תקופת ההסכם עודכנה")} />}
    {dialog && typeof dialog === "object" && "purchase" in dialog && <PurchaseDialog purchase={dialog.purchase} loans={deal.loans} onClose={() => setDialog(null)} onSave={(item) => save({ ...deal, purchases: deal.purchases.map((other) => other.id === item.id ? item : other) }, "הציוד עודכן")} />}
    {dialog && typeof dialog === "object" && "loan" in dialog && <LoanDialog loan={dialog.loan} onClose={() => setDialog(null)} onSave={(item) => {
      const exists = deal.loans.some((other) => other.id === item.id);
      return save({ ...deal, loans: exists ? deal.loans.map((other) => other.id === item.id ? item : other) : [...deal.loans, item] }, exists ? "המימון עודכן" : "המימון נוסף");
    }} />}
  </div>;
}

function TermsView({ version }: { version: DealTermsVersion }) {
  const packaged = version.model === "monthly_package";
  return <div className="deal-terms-view">
    <dl>
      <div><dt>סוג ההסכם</dt><dd>{commercialAgreementLabel(version.model)}</dd></div>
      <div><dt>קפה בחודש</dt><dd>{versionKg(version)} ק״ג</dd></div>
      <div><dt>הכנסה חודשית קבועה</dt><dd>{shekels(versionMonthlyIncome(version))} <small>ללא מע״מ</small></dd></div>
      {packaged && <div><dt>חבילה</dt><dd>{version.packageCount} × {shekels(version.packageMonthlyFee)} · {version.packageIncludedKgPerUnit} ק״ג כל אחת · ק״ג נוסף {shekels(version.extraKgPrice)}</dd></div>}
      {version.monthlyRentalIncome > 0 && <div><dt>שכירות ציוד</dt><dd>{shekels(version.monthlyRentalIncome)} בחודש</dd></div>}
      {version.monthlyServiceIncome > 0 && <div><dt>שירות</dt><dd>{shekels(version.monthlyServiceIncome)} בחודש</dd></div>}
      <div><dt>תפעול (הערכה)</dt><dd>{shekels(version.operatingCostEstimate)} בחודש</dd></div>
      <div><dt>הלקוח משלם</dt><dd>{payDelayLabel(version.clientPayDelayMonths)}</dd></div>
      <div><dt>תשלום לספק הפולים</dt><dd>{payDelayLabel(version.coffeeSupplierPayDelayMonths)}</dd></div>
    </dl>
    {version.blends.length > 0 && <div className="table-wrap"><table><thead><tr><th>תערובת</th><th>ק״ג בחודש</th>{!packaged && <th>מחיר לק״ג</th>}<th>עלות לק״ג</th></tr></thead><tbody>
      {version.blends.map((blend, index) => <tr key={index}><td><bdi>{blend.blend || "—"}</bdi></td><td>{blend.kg}</td>{!packaged && <td>{shekels(blend.pricePerKg)}</td>}<td>{shekels(blend.costPerKg)}</td></tr>)}
    </tbody></table></div>}
  </div>;
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    document.body.classList.add("dialog-open");
    return () => { window.removeEventListener("keydown", close); document.body.classList.remove("dialog-open"); };
  }, [onClose]);
  return <div className="modal-backdrop" {...backdropDismiss(onClose)}><div className="modal deal-modal" role="dialog" aria-label={title}><header><h2>{title}</h2><button onClick={onClose} aria-label="סגירה">×</button></header>{children}</div></div>;
}

const num = (value: string) => Math.max(0, Number(value) || 0);

function NumberField({ label, value, onChange, step = "1", suffix }: { label: string; value: number; onChange: (value: number) => void; step?: string; suffix?: string }) {
  return <label><span>{label}{suffix ? ` (${suffix})` : ""}</span><input type="number" min="0" step={step} value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(num(event.target.value))} /></label>;
}

function DelayField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label><span>{label}</span><select value={value} onChange={(event) => onChange(Number(event.target.value))}>{[0, 1, 2, 3, 4, 5, 6].map((months) => <option key={months} value={months}>{payDelayLabel(months)}</option>)}</select></label>;
}

/** The deal's first version, built from the quote (or the card's agreement) after showing what goes in. */
function StartDialog({ customer, quote, agreement, actor, onClose, onSave }: { customer: Customer; quote?: Quote; agreement?: CommercialAgreement; actor: string; onClose: () => void; onSave: (deal: CustomerDeal) => Promise<void> }) {
  const [startMonth, setStartMonth] = useState((customer.contractStart || quote?.approvedAt || customer.createdAt || new Date().toISOString()).slice(0, 7));
  const [saving, setSaving] = useState(false);
  const deal = quote ? dealFromQuote(quote, figuresOf(quote), startMonth, actor) : dealFromAgreement(customer, agreement!, startMonth, actor);
  return <Dialog title={`הקמת ההסכם · ${customer.name}`} onClose={onClose}>
    <form className="modal-form" onSubmit={(event) => { event.preventDefault(); setSaving(true); void onSave(deal).finally(() => setSaving(false)); }}>
      <div className="form-grid"><label><span>חודש תחילת ההסכם</span><input type="month" required value={startMonth} onChange={(event) => setStartMonth(event.target.value)} /></label>
        <label><span>משך ההסכם</span><div className="readonly">{deal.contractMonths} חודשים</div></label></div>
      <h3 className="deal-modal-subtitle">מה ייכנס</h3>
      <TermsView version={deal.versions[0]} />
      {deal.purchases.map((item) => <p className="ob-note" key={item.id}>ציוד: {shekels(item.cost)} · לספק {item.supplierPayDelayMonths ? `אחרי ${item.supplierPayDelayMonths} חודשים` : "באותו חודש"}, {installmentsLabel(item.supplierInstallments)}{item.saleIncome ? ` · הלקוח משלם ${shekels(item.saleIncome)}` : ""}</p>)}
      {deal.loans.map((item) => <p className="ob-note" key={item.id}>מימון: {shekels(item.amount)} · {item.months} תשלומים · ריבית {item.annualInterest}% · תשלום ראשון ב{monthLabel(item.firstPaymentMonth)}</p>)}
      <p className="deal-hint">אפשר לתקן כל פרט אחרי ההקמה. ההזמנות וההסכם הקיים בכרטיס לא משתנים.</p>
      <footer><button type="button" onClick={onClose}>ביטול</button><button className="primary" disabled={saving}>{saving ? "שומר…" : "הקמת ההסכם"}</button></footer>
    </form>
  </Dialog>;
}

/** "עדכון ההסכם": today's terms, filled in; change what changed and from which month. */
function UpdateDialog({ deal, current, actor, onClose, onSave }: { deal: CustomerDeal; current: DealTermsVersion; actor: string; onClose: () => void; onSave: (deal: CustomerDeal, message: string) => Promise<void> }) {
  const [draft, setDraft] = useState<DealTermsVersion>({ ...current, blends: current.blends.map((blend) => ({ ...blend })), note: "" });
  const [fromMonth, setFromMonth] = useState(thisMonth() < deal.startMonth ? deal.startMonth : thisMonth());
  const [equipment, setEquipment] = useState<EquipmentPurchase | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof DealTermsVersion>(key: K, value: DealTermsVersion[K]) => setDraft((value0) => ({ ...value0, [key]: value }));
  const setBlend = (index: number, patch: Partial<DealTermsVersion["blends"][number]>) => set("blends", draft.blends.map((blend, i) => i === index ? { ...blend, ...patch } : blend));
  const packaged = draft.model === "monthly_package";
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.note.trim() || saving) return;
    setSaving(true);
    const now = new Date().toISOString();
    const version: DealTermsVersion = { ...draft, id: `terms-${fromMonth}`, fromMonth, note: draft.note.trim(), blends: draft.blends.filter((blend) => blend.blend.trim() && blend.kg > 0), createdAt: now, createdBy: actor };
    const next = withVersion(deal, version, now);
    const withEquipment = equipment && equipment.cost > 0 ? { ...next, purchases: [...next.purchases, { ...equipment, month: fromMonth, createdAt: now }] } : next;
    void onSave(withEquipment, `ההסכם עודכן מ${monthLabel(fromMonth)}`).finally(() => setSaving(false));
  };
  const replacing = deal.versions.some((version) => version.fromMonth === fromMonth);
  return <Dialog title="עדכון ההסכם" onClose={onClose}>
    <form className="modal-form" onSubmit={submit}>
      <div className="form-grid">
        <label><span>החל מחודש</span><input type="month" required min={deal.startMonth} value={fromMonth} onChange={(event) => setFromMonth(event.target.value)} />{replacing && <small>יש כבר שינוי בחודש הזה; הוא יוחלף.</small>}</label>
        <label><span>מה השתנה</span><input required maxLength={120} placeholder="לדוגמה: נוספה מכונה, עלייה ל־100 ק״ג" value={draft.note} onChange={(event) => set("note", event.target.value)} /></label>
        <label className="full"><span>סוג ההסכם</span><select value={draft.model} onChange={(event) => set("model", event.target.value as CommercialAgreementModel)}>{MODELS.map((model) => <option key={model} value={model}>{commercialAgreementLabel(model)}</option>)}</select></label>
      </div>
      <h3 className="deal-modal-subtitle">קפה בחודש</h3>
      <div className="deal-blends">
        {draft.blends.map((blend, index) => <div key={index} className="deal-blend-row">
          <input placeholder="תערובת" value={blend.blend} onChange={(event) => setBlend(index, { blend: event.target.value })} aria-label="תערובת" />
          <label>ק״ג<input type="number" min="0" value={blend.kg} onChange={(event) => setBlend(index, { kg: num(event.target.value) })} /></label>
          {!packaged && <label>מחיר<input type="number" min="0" value={blend.pricePerKg} onChange={(event) => setBlend(index, { pricePerKg: num(event.target.value) })} /></label>}
          <label>עלות<input type="number" min="0" value={blend.costPerKg} onChange={(event) => setBlend(index, { costPerKg: num(event.target.value) })} /></label>
          <button type="button" className="row-action" aria-label="הסרה" onClick={() => set("blends", draft.blends.filter((_, i) => i !== index))}>✕</button>
        </div>)}
        <button type="button" className="text-btn" onClick={() => set("blends", [...draft.blends, { blend: "", kg: 0, pricePerKg: 0, costPerKg: 0 }])}>＋ תערובת</button>
      </div>
      <div className="form-grid">
        {packaged && <><NumberField label="מספר חבילות" value={draft.packageCount} onChange={(value) => set("packageCount", Math.max(1, Math.round(value)))} />
          <NumberField label="דמי חבילה בחודש" suffix="₪" value={draft.packageMonthlyFee} onChange={(value) => set("packageMonthlyFee", value)} />
          <NumberField label="ק״ג כלולים בחבילה" value={draft.packageIncludedKgPerUnit} onChange={(value) => set("packageIncludedKgPerUnit", value)} />
          <NumberField label="מחיר ק״ג נוסף" suffix="₪" value={draft.extraKgPrice} onChange={(value) => set("extraKgPrice", value)} /></>}
        <NumberField label="שכירות ציוד בחודש" suffix="₪" value={draft.monthlyRentalIncome} onChange={(value) => set("monthlyRentalIncome", value)} />
        <NumberField label="שירות בחודש" suffix="₪" value={draft.monthlyServiceIncome} onChange={(value) => set("monthlyServiceIncome", value)} />
        <NumberField label="תפעול בחודש (הערכה)" suffix="₪" value={draft.operatingCostEstimate} onChange={(value) => set("operatingCostEstimate", value)} />
        <DelayField label="הלקוח משלם" value={draft.clientPayDelayMonths} onChange={(value) => set("clientPayDelayMonths", value)} />
        <DelayField label="תשלום לספק הפולים" value={draft.coffeeSupplierPayDelayMonths} onChange={(value) => set("coffeeSupplierPayDelayMonths", value)} />
      </div>
      <label className="deal-check"><input type="checkbox" checked={Boolean(equipment)} onChange={(event) => setEquipment(event.target.checked ? { id: createId("equipment"), month: fromMonth, description: "", cost: 0, saleIncome: 0, clientInstallments: 1, supplierPayDelayMonths: 1, supplierInstallments: 1, createdAt: "" } : null)} /><span>נוסף ציוד בשינוי הזה</span></label>
      {equipment && <PurchaseFields value={equipment} loans={deal.loans} onChange={setEquipment} />}
      <footer><button type="button" onClick={onClose}>ביטול</button><button className="primary" disabled={saving || !draft.note.trim()}>{saving ? "שומר…" : "שמירה"}</button></footer>
    </form>
  </Dialog>;
}

function PurchaseFields({ value, loans, onChange }: { value: EquipmentPurchase; loans: DealLoan[]; onChange: (value: EquipmentPurchase) => void }) {
  const set = <K extends keyof EquipmentPurchase>(key: K, next: EquipmentPurchase[K]) => onChange({ ...value, [key]: next });
  return <div className="form-grid">
    <label className="full"><span>מה נקנה</span><input required maxLength={120} placeholder="לדוגמה: מכונה שנייה לקומה 3" value={value.description} onChange={(event) => set("description", event.target.value)} /></label>
    <NumberField label="עלות לנו" suffix="₪" value={value.cost} onChange={(next) => set("cost", next)} />
    <NumberField label="הלקוח משלם עליו (במכירה)" suffix="₪" value={value.saleIncome} onChange={(next) => set("saleIncome", next)} />
    {value.saleIncome > 0 && <NumberField label="הלקוח משלם בתשלומים" value={value.clientInstallments} onChange={(next) => set("clientInstallments", Math.max(1, Math.round(next)))} />}
    <label><span>תשלום ראשון לספק</span><select value={value.supplierPayDelayMonths} onChange={(event) => set("supplierPayDelayMonths", Number(event.target.value))}>{[0, 1, 2, 3, 4, 5, 6].map((months) => <option key={months} value={months}>{months ? `אחרי ${months} חודשים` : "באותו חודש"}</option>)}</select></label>
    <NumberField label="תשלומים לספק" value={value.supplierInstallments} onChange={(next) => set("supplierInstallments", Math.max(1, Math.round(next)))} />
    {loans.length > 0 && <label><span>מומן בהלוואה</span><select value={value.loanId || ""} onChange={(event) => { const next: EquipmentPurchase = { ...value, loanId: event.target.value }; if (!next.loanId) delete next.loanId; onChange(next); }}><option value="">לא</option>{loans.map((loan) => <option key={loan.id} value={loan.id}>{loan.description} · {shekels(loan.amount)}</option>)}</select></label>}
  </div>;
}

function PurchaseDialog({ purchase, loans, onClose, onSave }: { purchase: EquipmentPurchase; loans: DealLoan[]; onClose: () => void; onSave: (purchase: EquipmentPurchase) => Promise<void> }) {
  const [draft, setDraft] = useState(purchase);
  const [saving, setSaving] = useState(false);
  return <Dialog title="ציוד" onClose={onClose}>
    <form className="modal-form" onSubmit={(event) => { event.preventDefault(); setSaving(true); void onSave(draft).finally(() => setSaving(false)); }}>
      <div className="form-grid"><label><span>חודש הרכישה</span><input type="month" required value={draft.month} onChange={(event) => setDraft({ ...draft, month: event.target.value })} /></label></div>
      <PurchaseFields value={draft} loans={loans} onChange={setDraft} />
      <footer><button type="button" onClick={onClose}>ביטול</button><button className="primary" disabled={saving}>{saving ? "שומר…" : "שמירה"}</button></footer>
    </form>
  </Dialog>;
}

function LoanDialog({ loan, onClose, onSave }: { loan: DealLoan; onClose: () => void; onSave: (loan: DealLoan) => Promise<void> }) {
  const [draft, setDraft] = useState(loan);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof DealLoan>(key: K, value: DealLoan[K]) => setDraft((current) => ({ ...current, [key]: value }));
  return <Dialog title={loan.id ? "מימון" : "מימון חדש"} onClose={onClose}>
    <form className="modal-form" onSubmit={(event) => { event.preventDefault(); setSaving(true); void onSave({ ...draft, id: draft.id || createId("loan"), createdAt: draft.createdAt || new Date().toISOString() }).finally(() => setSaving(false)); }}>
      <div className="form-grid">
        <label className="full"><span>תיאור</span><input required maxLength={120} value={draft.description} onChange={(event) => set("description", event.target.value)} /></label>
        <NumberField label="סכום" suffix="₪" value={draft.amount} onChange={(value) => set("amount", value)} />
        <NumberField label="ריבית שנתית" suffix="%" step="0.1" value={draft.annualInterest} onChange={(value) => set("annualInterest", value)} />
        <NumberField label="מספר תשלומים" value={draft.months} onChange={(value) => set("months", Math.max(1, Math.round(value)))} />
        <label><span>תשלום חודשי</span><div className="readonly">{shekels(loanPayment(draft))}</div></label>
        <label><span>הכסף התקבל ב</span><input type="month" required value={draft.receivedMonth} onChange={(event) => set("receivedMonth", event.target.value)} /></label>
        <label><span>תשלום ראשון ב</span><input type="month" required value={draft.firstPaymentMonth} onChange={(event) => set("firstPaymentMonth", event.target.value)} /></label>
      </div>
      <footer><button type="button" onClick={onClose}>ביטול</button><button className="primary" disabled={saving || draft.amount <= 0}>{saving ? "שומר…" : "שמירה"}</button></footer>
    </form>
  </Dialog>;
}

function ContractDialog({ deal, onClose, onSave }: { deal: CustomerDeal; onClose: () => void; onSave: (deal: CustomerDeal) => Promise<void> }) {
  const [startMonth, setStartMonth] = useState(deal.startMonth);
  const [months, setMonths] = useState(deal.contractMonths);
  const [saving, setSaving] = useState(false);
  return <Dialog title="תקופת ההסכם" onClose={onClose}>
    <form className="modal-form" onSubmit={(event) => {
      event.preventDefault(); setSaving(true);
      // The first version starts with the deal.
      const versions = deal.versions.map((version, index) => index === 0 && version.fromMonth > startMonth ? { ...version, fromMonth: startMonth, id: `terms-${startMonth}` } : version);
      void onSave({ ...deal, startMonth, contractMonths: months, versions }).finally(() => setSaving(false));
    }}>
      <div className="form-grid">
        <label><span>חודש תחילה</span><input type="month" required max={deal.versions[1]?.fromMonth} value={startMonth} onChange={(event) => setStartMonth(event.target.value)} /></label>
        <NumberField label="משך בחודשים" value={months} onChange={(value) => setMonths(Math.min(240, Math.max(1, Math.round(value))))} />
        <label className="full"><span>סיום</span><div className="readonly">{monthLabel(addMonths(startMonth, months - 1))}</div></label>
      </div>
      <footer><button type="button" onClick={onClose}>ביטול</button><button className="primary" disabled={saving}>{saving ? "שומר…" : "שמירה"}</button></footer>
    </form>
  </Dialog>;
}
