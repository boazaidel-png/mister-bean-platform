"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  FileInput,
  FileText,
  Filter,
  Pencil,
  Plus,
  Search,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import { parseLegacyWorkspace } from "@/lib/legacy-migration";
import type {
  Lead,
  LeadPriority,
  LeadStatus,
  Quote,
  QuoteBlend,
  QuoteEquipment,
  QuoteStatus,
  SalesWorkspace,
} from "@/lib/platform-types";

const leadStatuses: LeadStatus[] = [
  "לא טופל",
  "בוצעה שיחה ראשונית",
  "בהמתנה לפרטים",
  "בהמתנה לקביעת פגישה",
  "נקבעה פגישה",
  "בהמתנה להצעת מחיר",
  "נשלחה הצעת מחיר",
  "לפנייה עתידית",
  "נסגר",
  "לא רלוונטי",
];
const quoteStatuses: QuoteStatus[] = [
  "טיוטה",
  "בבדיקה",
  "נשלחה",
  "אושרה",
  "נדחתה",
];
const machineModels = [
  "Dr. Coffee F11",
  "Dr. Coffee F15",
  "Dr. Coffee Coffee Break",
  "Jura X10",
  "Jura E8",
  "Jetinno JL15",
  "Emilio Mini",
];
const now = () => new Date().toISOString();
const id = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const money = (value: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value || 0);
const displayDate = (value: string) =>
  value
    ? new Intl.DateTimeFormat("he-IL").format(new Date(value))
    : "לא נקבע";

const emptyLead = (): Lead => ({
  id: id("lead"),
  company: "",
  employees: 0,
  location: "",
  connection: "",
  contactName: "",
  contactRole: "",
  phone: "",
  email: "",
  owner: "בועז",
  priority: "בינונית",
  status: "לא טופל",
  followUpDate: "",
  hasContract: false,
  supplier: "",
  machineType: "",
  machineCount: 0,
  monthlyConsumption: 0,
  pricePerKg: 0,
  notes: "",
  meetingDate: "",
  meetingTime: "",
  meetingLocation: "",
  quoteIds: [],
  createdAt: now(),
  updatedAt: now(),
});

const quoteFromLead = (lead?: Lead): Quote => ({
  id: id("quote"),
  leadId: lead?.id,
  clientName: lead?.company || "",
  versionName: "גרסה 1",
  clientRank: "רגיל",
  status: "טיוטה",
  employees: lead?.employees || 100,
  knownKg: lead?.monthlyConsumption || 0,
  requestedMachines: lead?.machineCount || 0,
  cupsPerEmployee: 1.5,
  gramsPerCup: 12,
  workDaysMonth: 21,
  blends: [
    {
      name: "DX",
      quantityKg: lead?.monthlyConsumption || 0,
      costPerKg: 42,
      pricePerKg: 82,
    },
  ],
  equipment: [],
  leaseMonths: 24,
  saleMargin: 15,
  extraMonthlyCost: 0,
  owner: lead?.owner || "בועז",
  notes: "",
  createdAt: now(),
  updatedAt: now(),
});

function tone(status: string) {
  if (status.includes("אושר") || status === "נסגר") return "green";
  if (status.includes("נשלח") || status.includes("פגישה")) return "blue";
  if (status.includes("נדח") || status.includes("רלוונטי")) return "red";
  if (status.includes("המתנה") || status === "בבדיקה") return "orange";
  return "gray";
}

function Status({ children }: { children: string }) {
  return <span className={`sales-status ${tone(children)}`}>{children}</span>;
}

function FlowStrip({
  leads,
  quotes,
}: {
  leads: Lead[];
  quotes: Quote[];
}) {
  const won = quotes.filter((quote) => quote.status === "אושרה").length;
  return (
    <div className="sales-flow-strip">
      <div>
        <span className="flow-icon">
          <UsersRound size={18} />
        </span>
        <b>{leads.filter((lead) => !["נסגר", "לא רלוונטי"].includes(lead.status)).length}</b>
        <small>לידים פעילים</small>
      </div>
      <ArrowLeft size={20} />
      <div>
        <span className="flow-icon">
          <FileText size={18} />
        </span>
        <b>{quotes.filter((quote) => quote.status !== "נדחתה").length}</b>
        <small>הצעות בתהליך</small>
      </div>
      <ArrowLeft size={20} />
      <div>
        <span className="flow-icon">
          <Building2 size={18} />
        </span>
        <b>{won}</b>
        <small>עסקאות שאושרו</small>
      </div>
    </div>
  );
}

export function LeadsWorkspace({
  workspace,
  readOnly,
  onSaveLead,
  onSaveQuote,
  onImport,
  onOpenQuotes,
}: {
  workspace: SalesWorkspace;
  readOnly: boolean;
  onSaveLead: (lead: Lead) => Promise<void>;
  onSaveQuote: (quote: Quote) => Promise<void>;
  onImport: (workspace: SalesWorkspace) => Promise<void>;
  onOpenQuotes: () => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("הכל");
  const [owner, setOwner] = useState("הכל");
  const [editing, setEditing] = useState<Lead | null>(null);
  const [quoteLead, setQuoteLead] = useState<Lead | null>(null);
  const [importing, setImporting] = useState(false);
  const rows = workspace.leads.filter((lead) => {
    const haystack =
      `${lead.company} ${lead.contactName} ${lead.phone} ${lead.email} ${lead.location}`.toLowerCase();
    return (
      haystack.includes(query.toLowerCase()) &&
      (status === "הכל" || lead.status === status) &&
      (owner === "הכל" || lead.owner === owner)
    );
  });
  const owners = [...new Set(workspace.leads.map((lead) => lead.owner).filter(Boolean))];

  return (
    <div className="sales-workspace">
      <div className="sales-page-head">
        <div>
          <h2>לידים</h2>
          <p>ניהול פניות והתקדמות עד להצעת מחיר</p>
        </div>
        <div>
          <button className="sales-secondary" onClick={onOpenQuotes}>
            <FileText size={17} /> להצעות מחיר
          </button>
          <button
            className="sales-secondary"
            disabled={readOnly}
            onClick={() => setImporting(true)}
          >
            <FileInput size={17} /> ייבוא
          </button>
          <button
            className="sales-primary"
            disabled={readOnly}
            onClick={() => setEditing(emptyLead())}
          >
            <Plus size={17} /> ליד חדש
          </button>
        </div>
      </div>
      <FlowStrip leads={workspace.leads} quotes={workspace.quotes} />
      <div className="sales-kpis">
        <SalesKpi
          label="כל הלידים"
          value={workspace.leads.length}
          detail="במאגר המשותף"
        />
        <SalesKpi
          label="דורשים טיפול"
          value={workspace.leads.filter((lead) => lead.status === "לא טופל").length}
          detail="טרם בוצעה שיחה"
          kind="red"
        />
        <SalesKpi
          label="לקראת הצעה"
          value={
            workspace.leads.filter((lead) =>
              ["נקבעה פגישה", "בהמתנה להצעת מחיר"].includes(lead.status),
            ).length
          }
          detail="בשלב מסחרי"
          kind="orange"
        />
        <SalesKpi
          label="נסגרו"
          value={workspace.leads.filter((lead) => lead.status === "נסגר").length}
          detail="הפכו ללקוחות"
          kind="green"
        />
      </div>
      <section className="sales-panel">
        <div className="sales-filters">
          <label>
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="חיפוש חברה, איש קשר או טלפון"
            />
          </label>
          <label className="select-filter">
            <Filter size={16} />
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option>הכל</option>
              {leadStatuses.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <select value={owner} onChange={(event) => setOwner(event.target.value)}>
            <option>הכל</option>
            {owners.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
        <div className="sales-table-wrap">
          <table className="sales-table">
            <thead>
              <tr>
                <th>חברה</th>
                <th>איש קשר</th>
                <th>סטטוס</th>
                <th>אחראי</th>
                <th>פולואפ</th>
                <th>צריכה</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <strong>{lead.company}</strong>
                    <small>{lead.location || "מיקום לא הוגדר"}</small>
                  </td>
                  <td>
                    {lead.contactName || "—"}
                    <small>{lead.phone}</small>
                  </td>
                  <td>
                    <Status>{lead.status}</Status>
                  </td>
                  <td>{lead.owner}</td>
                  <td>{displayDate(lead.followUpDate)}</td>
                  <td>{lead.monthlyConsumption || "—"} ק״ג</td>
                  <td>
                    <div className="sales-row-actions">
                      <button onClick={() => setEditing(lead)} aria-label="עריכת ליד">
                        <Pencil size={15} />
                      </button>
                      <button
                        className="quote-action"
                        disabled={readOnly}
                        onClick={() => setQuoteLead(lead)}
                      >
                        הצעה
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sales-mobile-list">
          {rows.map((lead) => (
            <article key={lead.id}>
              <header>
                <div>
                  <strong>{lead.company}</strong>
                  <small>{lead.contactName || lead.location}</small>
                </div>
                <Status>{lead.status}</Status>
              </header>
              <dl>
                <div>
                  <dt>אחראי</dt>
                  <dd>{lead.owner}</dd>
                </div>
                <div>
                  <dt>פולואפ</dt>
                  <dd>{displayDate(lead.followUpDate)}</dd>
                </div>
                <div>
                  <dt>צריכה</dt>
                  <dd>{lead.monthlyConsumption || "—"} ק״ג</dd>
                </div>
              </dl>
              <footer>
                <button onClick={() => setEditing(lead)}>עריכה</button>
                <button disabled={readOnly} onClick={() => setQuoteLead(lead)}>
                  יצירת הצעה
                </button>
              </footer>
            </article>
          ))}
        </div>
        {!rows.length && <div className="sales-empty">לא נמצאו לידים לפי הסינון שנבחר.</div>}
      </section>
      {editing && (
        <LeadModal
          lead={editing}
          readOnly={readOnly}
          onClose={() => setEditing(null)}
          onSave={async (lead) => {
            await onSaveLead(lead);
            setEditing(null);
          }}
        />
      )}
      {quoteLead && (
        <QuoteModal
          quote={quoteFromLead(quoteLead)}
          readOnly={readOnly}
          onClose={() => setQuoteLead(null)}
          onSave={async (quote) => {
            await onSaveQuote(quote);
            setQuoteLead(null);
            onOpenQuotes();
          }}
        />
      )}
      {importing && (
        <ImportModal
          onClose={() => setImporting(false)}
          onImport={async (data) => {
            await onImport(data);
            setImporting(false);
          }}
        />
      )}
    </div>
  );
}

export function QuotesWorkspace({
  workspace,
  readOnly,
  onSaveQuote,
  onConvert,
  onOpenLeads,
}: {
  workspace: SalesWorkspace;
  readOnly: boolean;
  onSaveQuote: (quote: Quote) => Promise<void>;
  onConvert: (quote: Quote, lead?: Lead) => Promise<string>;
  onOpenLeads: () => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("הכל");
  const [editing, setEditing] = useState<Quote | null>(null);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const rows = workspace.quotes.filter(
    (quote) =>
      `${quote.clientName} ${quote.versionName}`.toLowerCase().includes(query.toLowerCase()) &&
      (status === "הכל" || quote.status === status),
  );

  const convert = async (quote: Quote) => {
    setBusyId(quote.id);
    setMessage("");
    try {
      const lead = workspace.leads.find((item) => item.id === quote.leadId);
      const accountId = await onConvert(quote, lead);
      setMessage(`חשבון הלקוח הוקם בהצלחה: ${accountId}`);
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="sales-workspace">
      <div className="sales-page-head">
        <div>
          <h2>הצעות מחיר</h2>
          <p>בניית הצעה, אישור והקמת לקוח</p>
        </div>
        <div>
          <button className="sales-secondary" onClick={onOpenLeads}>
            <UsersRound size={17} /> ללידים
          </button>
          <button
            className="sales-primary"
            disabled={readOnly}
            onClick={() => setEditing(quoteFromLead())}
          >
            <Plus size={17} /> הצעה חדשה
          </button>
        </div>
      </div>
      <FlowStrip leads={workspace.leads} quotes={workspace.quotes} />
      <div className="sales-kpis">
        <SalesKpi
          label="טיוטות"
          value={workspace.quotes.filter((quote) => quote.status === "טיוטה").length}
          detail="בעבודה"
        />
        <SalesKpi
          label="נשלחו"
          value={workspace.quotes.filter((quote) => quote.status === "נשלחה").length}
          detail="ממתינות ללקוח"
          kind="blue"
        />
        <SalesKpi
          label="אושרו"
          value={workspace.quotes.filter((quote) => quote.status === "אושרה").length}
          detail="מוכנות להקמה"
          kind="green"
        />
        <SalesKpi
          label="שיעור סגירה"
          value={`${Math.round(
            (workspace.quotes.filter((quote) => quote.status === "אושרה").length /
              Math.max(
                1,
                workspace.quotes.filter((quote) =>
                  ["אושרה", "נדחתה"].includes(quote.status),
                ).length,
              )) *
              100,
          )}%`}
          detail="מהצעות שהוכרעו"
          kind="orange"
        />
      </div>
      {message && <div className="sales-success">{message}</div>}
      <section className="sales-panel">
        <div className="sales-filters">
          <label>
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="חיפוש לקוח או גרסה"
            />
          </label>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option>הכל</option>
            {quoteStatuses.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
        <div className="quote-grid">
          {rows.map((quote) => {
            const metrics = quoteMetrics(quote);
            return (
              <article className="quote-card" key={quote.id}>
                <header>
                  <div>
                    <small>{quote.versionName}</small>
                    <h3>{quote.clientName || "הצעה ללא שם"}</h3>
                  </div>
                  <Status>{quote.status}</Status>
                </header>
                <div className="quote-card-metrics">
                  <span>
                    <small>צריכה חודשית</small>
                    <strong>{metrics.monthlyKg} ק״ג</strong>
                  </span>
                  <span>
                    <small>מחיר חודשי</small>
                    <strong>{money(metrics.monthlyRevenue)}</strong>
                  </span>
                  <span>
                    <small>רווח חודשי</small>
                    <strong>{money(metrics.monthlyProfit)}</strong>
                  </span>
                </div>
                <p>
                  {quote.employees} עובדים · {quote.equipment.reduce((sum, item) => sum + item.quantity, 0)} מכונות
                </p>
                <footer>
                  <button onClick={() => setEditing(quote)}>
                    <Pencil size={15} /> פתיחה
                  </button>
                  {quote.status === "אושרה" && !quote.accountId && (
                    <button
                      className="convert-button"
                      disabled={readOnly || busyId === quote.id}
                      onClick={() => void convert(quote)}
                    >
                      <CheckCircle2 size={15} />
                      {busyId === quote.id ? "מקים…" : "הקמת לקוח"}
                    </button>
                  )}
                  {quote.accountId && <span className="converted-label">לקוח הוקם</span>}
                </footer>
              </article>
            );
          })}
        </div>
        {!rows.length && <div className="sales-empty">לא נמצאו הצעות מחיר.</div>}
      </section>
      {editing && (
        <QuoteModal
          quote={editing}
          readOnly={readOnly}
          onClose={() => setEditing(null)}
          onSave={async (quote) => {
            await onSaveQuote(quote);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function SalesKpi({
  label,
  value,
  detail,
  kind = "",
}: {
  label: string;
  value: string | number;
  detail: string;
  kind?: string;
}) {
  return (
    <article className={kind}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function LeadModal({
  lead,
  readOnly,
  onClose,
  onSave,
}: {
  lead: Lead;
  readOnly: boolean;
  onClose: () => void;
  onSave: (lead: Lead) => Promise<void>;
}) {
  const [draft, setDraft] = useState(lead);
  const [saving, setSaving] = useState(false);
  const update = <K extends keyof Lead>(key: K, value: Lead[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({ ...draft, updatedAt: now() });
    } finally {
      setSaving(false);
    }
  };
  return (
    <SalesModal title={lead.company ? `ליד · ${lead.company}` : "ליד חדש"} onClose={onClose}>
      <form className="sales-form" onSubmit={submit}>
        <div className="sales-form-grid">
          <label>
            <span>שם החברה</span>
            <input
              required
              value={draft.company}
              onChange={(event) => update("company", event.target.value)}
            />
          </label>
          <label>
            <span>מיקום</span>
            <input
              value={draft.location}
              onChange={(event) => update("location", event.target.value)}
            />
          </label>
          <label>
            <span>איש קשר</span>
            <input
              value={draft.contactName}
              onChange={(event) => update("contactName", event.target.value)}
            />
          </label>
          <label>
            <span>תפקיד</span>
            <input
              value={draft.contactRole}
              onChange={(event) => update("contactRole", event.target.value)}
            />
          </label>
          <label>
            <span>טלפון</span>
            <input value={draft.phone} onChange={(event) => update("phone", event.target.value)} />
          </label>
          <label>
            <span>דוא״ל</span>
            <input
              type="email"
              value={draft.email}
              onChange={(event) => update("email", event.target.value)}
            />
          </label>
          <label>
            <span>סטטוס</span>
            <select
              value={draft.status}
              onChange={(event) => update("status", event.target.value as LeadStatus)}
            >
              {leadStatuses.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            <span>עדיפות</span>
            <select
              value={draft.priority}
              onChange={(event) => update("priority", event.target.value as LeadPriority)}
            >
              <option>נמוכה</option>
              <option>בינונית</option>
              <option>גבוהה</option>
            </select>
          </label>
          <label>
            <span>אחראי</span>
            <input value={draft.owner} onChange={(event) => update("owner", event.target.value)} />
          </label>
          <label>
            <span>תאריך פולואפ</span>
            <input
              type="date"
              value={draft.followUpDate}
              onChange={(event) => update("followUpDate", event.target.value)}
            />
          </label>
          <label>
            <span>מספר עובדים</span>
            <input
              type="number"
              min="0"
              value={draft.employees}
              onChange={(event) => update("employees", +event.target.value)}
            />
          </label>
          <label>
            <span>צריכה חודשית בק״ג</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={draft.monthlyConsumption}
              onChange={(event) => update("monthlyConsumption", +event.target.value)}
            />
          </label>
          <label>
            <span>כמות מכונות</span>
            <input
              type="number"
              min="0"
              value={draft.machineCount}
              onChange={(event) => update("machineCount", +event.target.value)}
            />
          </label>
          <label>
            <span>ספק קיים</span>
            <input
              value={draft.supplier}
              onChange={(event) => update("supplier", event.target.value)}
            />
          </label>
          <label>
            <span>תאריך פגישה</span>
            <input
              type="date"
              value={draft.meetingDate}
              onChange={(event) => update("meetingDate", event.target.value)}
            />
          </label>
          <label>
            <span>שעת פגישה</span>
            <input
              type="time"
              value={draft.meetingTime}
              onChange={(event) => update("meetingTime", event.target.value)}
            />
          </label>
          <label className="full">
            <span>הערות</span>
            <textarea
              value={draft.notes}
              onChange={(event) => update("notes", event.target.value)}
            />
          </label>
        </div>
        <footer>
          <button type="button" onClick={onClose}>ביטול</button>
          <button className="sales-primary" disabled={readOnly || saving}>
            {saving ? "שומר…" : "שמירת ליד"}
          </button>
        </footer>
      </form>
    </SalesModal>
  );
}

function quoteMetrics(quote: Quote) {
  const recommendedKg = Math.ceil(
    (quote.employees *
      quote.cupsPerEmployee *
      quote.workDaysMonth *
      quote.gramsPerCup) /
      1000,
  );
  const monthlyKg =
    quote.knownKg ||
    quote.blends.reduce((sum, blend) => sum + blend.quantityKg, 0) ||
    recommendedKg;
  const beanRevenue = quote.blends.reduce(
    (sum, blend) => sum + blend.quantityKg * blend.pricePerKg,
    0,
  );
  const beanCost = quote.blends.reduce(
    (sum, blend) => sum + blend.quantityKg * blend.costPerKg,
    0,
  );
  const equipmentMonthlyRevenue = quote.equipment.reduce(
    (sum, item) => sum + item.quantity * item.monthlyPrice,
    0,
  );
  const equipmentCost = quote.equipment.reduce(
    (sum, item) => sum + item.quantity * item.unitCost,
    0,
  );
  const monthlyRevenue =
    beanRevenue + equipmentMonthlyRevenue + quote.extraMonthlyCost;
  const monthlyProfit =
    monthlyRevenue -
    beanCost -
    equipmentCost / Math.max(1, quote.leaseMonths);
  return {
    recommendedKg,
    monthlyKg,
    beanRevenue,
    equipmentCost,
    monthlyRevenue,
    monthlyProfit,
  };
}

function QuoteModal({
  quote,
  readOnly,
  onClose,
  onSave,
}: {
  quote: Quote;
  readOnly: boolean;
  onClose: () => void;
  onSave: (quote: Quote) => Promise<void>;
}) {
  const [draft, setDraft] = useState(quote);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const metrics = useMemo(() => quoteMetrics(draft), [draft]);
  const update = <K extends keyof Quote>(key: K, value: Quote[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const updateBlend = (index: number, data: Partial<QuoteBlend>) =>
    update(
      "blends",
      draft.blends.map((blend, blendIndex) =>
        blendIndex === index ? { ...blend, ...data } : blend,
      ),
    );
  const updateEquipment = (index: number, data: Partial<QuoteEquipment>) =>
    update(
      "equipment",
      draft.equipment.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...data } : item,
      ),
    );
  const submit = async () => {
    setSaving(true);
    try {
      const approvedAt =
        draft.status === "אושרה" ? draft.approvedAt || now() : draft.approvedAt;
      await onSave({ ...draft, approvedAt, updatedAt: now() });
    } finally {
      setSaving(false);
    }
  };
  const steps = ["לקוח וצריכה", "פולים", "ציוד ומתווה", "סיכום"];

  return (
    <SalesModal
      title={draft.clientName ? `הצעה · ${draft.clientName}` : "הצעה חדשה"}
      onClose={onClose}
      wide
    >
      <div className="quote-stepper">
        {steps.map((label, index) => (
          <button
            key={label}
            className={step === index ? "active" : ""}
            onClick={() => setStep(index)}
          >
            <b>{index + 1}</b>
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="quote-editor">
        <div className="quote-edit-main">
          {step === 0 && (
            <div className="sales-form-grid">
              <label>
                <span>שם הלקוח</span>
                <input
                  required
                  value={draft.clientName}
                  onChange={(event) => update("clientName", event.target.value)}
                />
              </label>
              <label>
                <span>שם הגרסה</span>
                <input
                  value={draft.versionName}
                  onChange={(event) => update("versionName", event.target.value)}
                />
              </label>
              <label>
                <span>סטטוס</span>
                <select
                  value={draft.status}
                  onChange={(event) => update("status", event.target.value as QuoteStatus)}
                >
                  {quoteStatuses.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>דירוג לקוח</span>
                <select
                  value={draft.clientRank}
                  onChange={(event) => update("clientRank", event.target.value)}
                >
                  <option>רגיל</option>
                  <option>חשוב</option>
                  <option>אסטרטגי</option>
                </select>
              </label>
              <label>
                <span>מספר עובדים</span>
                <input
                  type="number"
                  min="0"
                  value={draft.employees}
                  onChange={(event) => update("employees", +event.target.value)}
                />
              </label>
              <label>
                <span>צריכה ידועה בק״ג</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={draft.knownKg}
                  onChange={(event) => update("knownKg", +event.target.value)}
                />
              </label>
              <label>
                <span>כוסות לעובד ביום</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={draft.cupsPerEmployee}
                  onChange={(event) => update("cupsPerEmployee", +event.target.value)}
                />
              </label>
              <label>
                <span>גרם לכוס</span>
                <input
                  type="number"
                  min="1"
                  value={draft.gramsPerCup}
                  onChange={(event) => update("gramsPerCup", +event.target.value)}
                />
              </label>
              <div className="quote-recommendation full">
                <Sparkles size={19} />
                <div>
                  <small>המלצת צריכה לפי הנתונים</small>
                  <strong>{metrics.recommendedKg} ק״ג בחודש</strong>
                </div>
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="quote-lines">
              <div className="quote-lines-head">
                <div>
                  <h3>תערובות ומחירים</h3>
                  <p>הכמות, העלות ומחיר המכירה לכל בלנד</p>
                </div>
                <button
                  onClick={() =>
                    update("blends", [
                      ...draft.blends,
                      { name: "DX", quantityKg: 0, costPerKg: 42, pricePerKg: 82 },
                    ])
                  }
                >
                  <Plus size={15} /> הוספת בלנד
                </button>
              </div>
              {draft.blends.map((blend, index) => (
                <div className="quote-line" key={`${blend.name}-${index}`}>
                  <label>
                    <span>בלנד</span>
                    <input
                      value={blend.name}
                      onChange={(event) => updateBlend(index, { name: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>כמות ק״ג</span>
                    <input
                      type="number"
                      min="0"
                      value={blend.quantityKg}
                      onChange={(event) =>
                        updateBlend(index, { quantityKg: +event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>עלות לק״ג</span>
                    <input
                      type="number"
                      min="0"
                      value={blend.costPerKg}
                      onChange={(event) =>
                        updateBlend(index, { costPerKg: +event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>מחיר מכירה</span>
                    <input
                      type="number"
                      min="0"
                      value={blend.pricePerKg}
                      onChange={(event) =>
                        updateBlend(index, { pricePerKg: +event.target.value })
                      }
                    />
                  </label>
                  <button
                    className="line-remove"
                    onClick={() =>
                      update(
                        "blends",
                        draft.blends.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {step === 2 && (
            <div className="quote-lines">
              <div className="quote-lines-head">
                <div>
                  <h3>ציוד ומתווה מסחרי</h3>
                  <p>בחירת מכונות והאופן שבו הן מסופקות</p>
                </div>
                <button
                  onClick={() =>
                    update("equipment", [
                      ...draft.equipment,
                      {
                        model: machineModels[0],
                        quantity: 1,
                        unitCost: 4090,
                        commercialModel: "ללא עלות",
                        monthlyPrice: 0,
                      },
                    ])
                  }
                >
                  <Plus size={15} /> הוספת ציוד
                </button>
              </div>
              {draft.equipment.map((item, index) => (
                <div className="quote-line equipment" key={`${item.model}-${index}`}>
                  <label>
                    <span>דגם</span>
                    <select
                      value={item.model}
                      onChange={(event) =>
                        updateEquipment(index, { model: event.target.value })
                      }
                    >
                      {machineModels.map((model) => (
                        <option key={model}>{model}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>כמות</span>
                    <input
                      type="number"
                      min="0"
                      value={item.quantity}
                      onChange={(event) =>
                        updateEquipment(index, { quantity: +event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>עלות יחידה</span>
                    <input
                      type="number"
                      min="0"
                      value={item.unitCost}
                      onChange={(event) =>
                        updateEquipment(index, { unitCost: +event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>מתווה</span>
                    <select
                      value={item.commercialModel}
                      onChange={(event) =>
                        updateEquipment(index, {
                          commercialModel: event.target.value as QuoteEquipment["commercialModel"],
                        })
                      }
                    >
                      <option>ללא עלות</option>
                      <option>השכרה</option>
                      <option>מכירה</option>
                    </select>
                  </label>
                  <label>
                    <span>חיוב חודשי</span>
                    <input
                      type="number"
                      min="0"
                      value={item.monthlyPrice}
                      onChange={(event) =>
                        updateEquipment(index, { monthlyPrice: +event.target.value })
                      }
                    />
                  </label>
                  <button
                    className="line-remove"
                    onClick={() =>
                      update(
                        "equipment",
                        draft.equipment.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              <div className="sales-form-grid compact">
                <label>
                  <span>פריסת ציוד בחודשים</span>
                  <input
                    type="number"
                    min="1"
                    value={draft.leaseMonths}
                    onChange={(event) => update("leaseMonths", +event.target.value)}
                  />
                </label>
                <label>
                  <span>עלות תפעול חודשית נוספת</span>
                  <input
                    type="number"
                    min="0"
                    value={draft.extraMonthlyCost}
                    onChange={(event) => update("extraMonthlyCost", +event.target.value)}
                  />
                </label>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="quote-summary">
              <div className="quote-summary-hero">
                <span>
                  <CircleDollarSign size={23} />
                </span>
                <div>
                  <small>מחיר חודשי ללקוח</small>
                  <strong>{money(metrics.monthlyRevenue)}</strong>
                </div>
                <Status>{draft.status}</Status>
              </div>
              <div className="quote-summary-grid">
                <div>
                  <small>צריכה חודשית</small>
                  <strong>{metrics.monthlyKg} ק״ג</strong>
                </div>
                <div>
                  <small>הכנסה מפולים</small>
                  <strong>{money(metrics.beanRevenue)}</strong>
                </div>
                <div>
                  <small>עלות ציוד</small>
                  <strong>{money(metrics.equipmentCost)}</strong>
                </div>
                <div className={metrics.monthlyProfit < 0 ? "negative" : "positive"}>
                  <small>רווח חודשי מוערך</small>
                  <strong>{money(metrics.monthlyProfit)}</strong>
                </div>
              </div>
              <label className="quote-notes">
                <span>הערות פנימיות</span>
                <textarea
                  value={draft.notes}
                  onChange={(event) => update("notes", event.target.value)}
                />
              </label>
            </div>
          )}
        </div>
        <aside className="quote-live-summary">
          <span>סיכום בזמן אמת</span>
          <strong>{draft.clientName || "לקוח חדש"}</strong>
          <dl>
            <div>
              <dt>צריכה</dt>
              <dd>{metrics.monthlyKg} ק״ג</dd>
            </div>
            <div>
              <dt>מכונות</dt>
              <dd>{draft.equipment.reduce((sum, item) => sum + item.quantity, 0)}</dd>
            </div>
            <div>
              <dt>מחיר חודשי</dt>
              <dd>{money(metrics.monthlyRevenue)}</dd>
            </div>
            <div>
              <dt>רווח חודשי</dt>
              <dd>{money(metrics.monthlyProfit)}</dd>
            </div>
          </dl>
        </aside>
      </div>
      <footer className="quote-modal-footer">
        <button onClick={onClose}>ביטול</button>
        <div>
          {step > 0 && <button onClick={() => setStep((value) => value - 1)}>הקודם</button>}
          {step < steps.length - 1 ? (
            <button className="sales-primary" onClick={() => setStep((value) => value + 1)}>
              המשך
            </button>
          ) : (
            <button
              className="sales-primary"
              disabled={readOnly || saving || !draft.clientName}
              onClick={() => void submit()}
            >
              {saving ? "שומר…" : "שמירת הצעה"}
            </button>
          )}
        </div>
      </footer>
    </SalesModal>
  );
}

function ImportModal({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (workspace: SalesWorkspace) => Promise<void>;
}) {
  const [leadsJson, setLeadsJson] = useState("");
  const [quotesJson, setQuotesJson] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const importData = async () => {
    setError("");
    setBusy(true);
    try {
      const workspace = parseLegacyWorkspace(
        leadsJson ? JSON.parse(leadsJson) : {},
        quotesJson ? JSON.parse(quotesJson) : [],
      );
      if (!workspace.leads.length && !workspace.quotes.length) {
        throw new Error("לא נמצאו רשומות לייבוא.");
      }
      await onImport(workspace);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SalesModal title="ייבוא מהמערכות הקודמות" onClose={onClose}>
      <div className="import-modal">
        <div className="import-note">
          <FileInput size={19} />
          <p>הדבקת ייצוא JSON אינה מוחקת מידע קיים. רשומות מיובאות נשמרות עם מזהה המקור לצורך מעקב.</p>
        </div>
        <label>
          <span>JSON ממערכת הלידים</span>
          <textarea value={leadsJson} onChange={(event) => setLeadsJson(event.target.value)} />
        </label>
        <label>
          <span>JSON ממערכת הצעות המחיר</span>
          <textarea value={quotesJson} onChange={(event) => setQuotesJson(event.target.value)} />
        </label>
        {error && <div className="sales-import-error">{error}</div>}
        <footer>
          <button onClick={onClose}>ביטול</button>
          <button className="sales-primary" disabled={busy} onClick={() => void importData()}>
            {busy ? "מייבא…" : "ייבוא נתונים"}
          </button>
        </footer>
      </div>
    </SalesModal>
  );
}

function SalesModal({
  title,
  onClose,
  wide = false,
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="sales-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`sales-modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="סגירה">
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
