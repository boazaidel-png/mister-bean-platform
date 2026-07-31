"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Download,
  FileInput,
  FileText,
  Filter,
  ChevronDown,
  ChevronUp,
  Clock3,
  LayoutGrid,
  List,
  Pencil,
  Phone,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  UsersRound,
  X,
} from "lucide-react";
import {
  addonCatalog,
  calculateQuote,
  equipmentCatalog,
  importers,
  recommendedEquipment,
} from "@/lib/quote-engine";
import {
  fetchLegacyWorkspace,
  type LegacyMigrationSnapshot,
} from "@/lib/legacy-firebase";
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
const blendCatalog = [
  { name: "EMERALD", cost: 50 },
  { name: "DX", cost: 60 },
  { name: "HB+", cost: 70 },
  { name: "TUSCANINI", cost: 70 },
  { name: "PEGANINI", cost: 70 },
  { name: "STRADIVARI", cost: 90 },
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
const cupMoney = (value: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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
  currentStatus: "",
  nextAction: "",
  meetingDate: "",
  meetingTime: "09:00",
  meetingLocation: "",
  meetingGuest: "",
  sheet: "ראשוני",
  deleted: false,
  statusChangedAt: now(),
  statusHistory: [],
  tasks: [],
  lastUpdated: now().slice(0, 10),
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
  equipmentCosts: {},
  allocation: [],
  supplierMonths: 8,
  leaseMonths: 24,
  manualLeasePerSet: 0,
  saleMargin: 15,
  clientCostMonths: 36,
  extraMonthlyCost: 0,
  clientPayTerm: 0,
  importerPayTerm: 0,
  coffeeSupplierPayTerm: 0,
  cashflowMonths: 36,
  financingMonths: 0,
  financedAmount: 0,
  annualInterest: 0,
  applyVolumeDiscount: true,
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
        <b>{leads.filter((lead) => !lead.deleted && !["נסגר", "לא רלוונטי"].includes(lead.status)).length}</b>
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

type LeadTab =
  | "לטיפול היום"
  | "לידים בתהליך"
  | "מתקדם"
  | "פגישות"
  | "הצעות"
  | "לפנייה עתידית"
  | "נסגר"
  | "לא רלוונטי"
  | "נמחקו";

const leadTabs: LeadTab[] = [
  "לטיפול היום",
  "לידים בתהליך",
  "מתקדם",
  "פגישות",
  "הצעות",
  "לפנייה עתידית",
  "נסגר",
  "לא רלוונטי",
  "נמחקו",
];

const today = () => new Date().toISOString().slice(0, 10);
const isDue = (value: string) => Boolean(value && value <= today());
const isActiveLead = (lead: Lead) =>
  !lead.deleted &&
  !["נסגר", "לא רלוונטי", "לפנייה עתידית"].includes(lead.status);

const leadPipelineStages = ["פנייה", "שיחה", "פגישה", "הצעה", "סגירה"];
function leadPipelineIndex(status: LeadStatus) {
  if (status === "נסגר") return 4;
  if (["בהמתנה להצעת מחיר", "נשלחה הצעת מחיר"].includes(status)) return 3;
  if (
    ["בהמתנה לקביעת פגישה", "נקבעה פגישה"].includes(status)
  ) {
    return 2;
  }
  if (["בוצעה שיחה ראשונית", "בהמתנה לפרטים"].includes(status)) return 1;
  return 0;
}

function leadFollowUpState(lead: Lead) {
  if (!lead.followUpDate) return { label: "לא נקבע פולואפ", tone: "muted" };
  if (lead.followUpDate < today()) {
    return { label: `באיחור · ${displayDate(lead.followUpDate)}`, tone: "late" };
  }
  if (lead.followUpDate === today()) {
    return { label: "לטיפול היום", tone: "today" };
  }
  return { label: displayDate(lead.followUpDate), tone: "future" };
}

function leadMatchesTab(lead: Lead, tab: LeadTab) {
  if (tab === "נמחקו") return lead.deleted;
  if (lead.deleted) return false;
  if (tab === "לטיפול היום") {
    return isActiveLead(lead) && (isDue(lead.followUpDate) || lead.priority === "גבוהה");
  }
  if (tab === "לידים בתהליך") return isActiveLead(lead);
  if (tab === "מתקדם") {
    return [
      "בהמתנה לקביעת פגישה",
      "נקבעה פגישה",
      "בהמתנה להצעת מחיר",
      "נשלחה הצעת מחיר",
    ].includes(lead.status);
  }
  if (tab === "פגישות") return lead.status === "נקבעה פגישה";
  if (tab === "הצעות") return lead.status === "נשלחה הצעת מחיר";
  if (tab === "לפנייה עתידית") return lead.status === "לפנייה עתידית";
  return lead.status === tab;
}

function csvCell(value: unknown) {
  const textValue = String(value ?? "");
  return `"${textValue.replaceAll('"', '""')}"`;
}

function exportLeadsCsv(leads: Lead[]) {
  const headers = [
    "שם חברה",
    "כמות עובדים",
    "מיקום",
    "חיבור",
    "איש קשר",
    "תפקיד",
    "טלפון",
    "מייל",
    "אחראי",
    "רמת עדיפות",
    "תאריך פולואפ",
    "מצב קיים",
    "סטטוס",
    "הערות",
    "ספק",
    "סוג מכונות",
    "כמות מכונות",
    "צריכה חודשית",
    "מחיר לקילו",
    "תאריך פגישה",
    "שעת פגישה",
    "מיקום פגישה",
    "מייל לזימון",
  ];
  const rows = leads
    .filter((lead) => !lead.deleted)
    .map((lead) => [
      lead.company,
      lead.employees,
      lead.location,
      lead.connection,
      lead.contactName,
      lead.contactRole,
      lead.phone,
      lead.email,
      lead.owner,
      lead.priority,
      lead.followUpDate,
      lead.currentStatus,
      lead.status,
      lead.notes,
      lead.supplier,
      lead.machineType,
      lead.machineCount,
      lead.monthlyConsumption,
      lead.pricePerKg,
      lead.meetingDate,
      lead.meetingTime,
      lead.meetingLocation,
      lead.meetingGuest,
    ]);
  const csv = [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
  );
  link.download = `mister-bean-leads-${today()}.csv`;
  link.click();
}

export function LeadsWorkspace({
  workspace,
  readOnly,
  canMigrate,
  onSaveLead,
  onSaveQuote,
  onImport,
  onOpenQuotes,
}: {
  workspace: SalesWorkspace;
  readOnly: boolean;
  canMigrate: boolean;
  onSaveLead: (lead: Lead) => Promise<void>;
  onSaveQuote: (quote: Quote) => Promise<void>;
  onImport: (workspace: SalesWorkspace) => Promise<void>;
  onOpenQuotes: () => void;
}) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<LeadTab>("לידים בתהליך");
  const [status, setStatus] = useState("הכל");
  const [owner, setOwner] = useState("הכל");
  const [priority, setPriority] = useState("הכל");
  const [sortKey, setSortKey] = useState<keyof Lead>("followUpDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [editing, setEditing] = useState<Lead | null>(null);
  const [quoteLead, setQuoteLead] = useState<Lead | null>(null);
  const [importing, setImporting] = useState(false);
  const promotedFutureLeads = useRef(new Set<string>());
  useEffect(() => {
    if (readOnly) return;
    workspace.leads
      .filter(
        (lead) =>
          !lead.deleted &&
          lead.status === "לפנייה עתידית" &&
          isDue(lead.followUpDate) &&
          !promotedFutureLeads.current.has(lead.id),
      )
      .forEach((lead) => {
        promotedFutureLeads.current.add(lead.id);
        void onSaveLead({
          ...lead,
          status: "לא טופל",
          priority: "גבוהה",
          sheet: "ראשוני",
          statusChangedAt: now(),
          statusHistory: [
            ...(lead.statusHistory || []),
            {
              from: "לפנייה עתידית",
              to: "לא טופל",
              changedAt: now(),
            },
          ],
          updatedAt: now(),
        });
      });
  }, [onSaveLead, readOnly, workspace.leads]);
  const rows = workspace.leads
    .filter((lead) => {
      const haystack =
        `${lead.company} ${lead.contactName} ${lead.phone} ${lead.email} ${lead.location}`.toLowerCase();
      return (
        haystack.includes(query.toLowerCase()) &&
        leadMatchesTab(lead, tab) &&
        (status === "הכל" || lead.status === status) &&
        (owner === "הכל" || lead.owner === owner) &&
        (priority === "הכל" || lead.priority === priority)
      );
    })
    .sort((a, b) => {
      const left = String(a[sortKey] ?? "");
      const right = String(b[sortKey] ?? "");
      const compared = left.localeCompare(right, "he", { numeric: true });
      return sortDirection === "asc" ? compared : -compared;
    });
  const owners = [...new Set(workspace.leads.map((lead) => lead.owner).filter(Boolean))];
  const toggleSort = (key: keyof Lead) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };
  const updateLeadStatus = (lead: Lead, nextStatus: LeadStatus) => {
    void onSaveLead({
      ...lead,
      status: nextStatus,
      sheet:
        nextStatus === "לפנייה עתידית" ? "לפנייה עתידית" : lead.sheet,
      statusChangedAt: now(),
      statusHistory: [
        ...(lead.statusHistory || []),
        {
          from: lead.status,
          to: nextStatus,
          changedAt: now(),
        },
      ],
      updatedAt: now(),
    });
  };
  const saveChecked = async (lead: Lead) => {
    const duplicate = workspace.leads.find(
      (item) =>
        item.id !== lead.id &&
        !item.deleted &&
        ((lead.email &&
          item.email.trim().toLowerCase() === lead.email.trim().toLowerCase()) ||
          (lead.phone &&
            item.phone.replace(/\D/g, "") === lead.phone.replace(/\D/g, "")) ||
          (lead.company &&
            item.company.trim().toLowerCase() ===
              lead.company.trim().toLowerCase())),
    );
    if (
      duplicate &&
      !window.confirm(
        `נראה שכבר קיים ליד דומה: ${duplicate.company}. להמשיך לשמור בכל זאת?`,
      )
    ) {
      return false;
    }
    await onSaveLead(lead);
    return true;
  };
  const importCsv = async (file: File) => {
    const textValue = await file.text();
    const parseLine = (line: string) => {
      const values: string[] = [];
      let current = "";
      let quoted = false;
      for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (character === '"') {
          if (quoted && line[index + 1] === '"') {
            current += '"';
            index += 1;
          } else {
            quoted = !quoted;
          }
        } else if (character === "," && !quoted) {
          values.push(current);
          current = "";
        } else {
          current += character;
        }
      }
      values.push(current);
      return values;
    };
    const lines = textValue
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter(Boolean);
    if (lines.length < 2) return;
    const headers = parseLine(lines[0]);
    const value = (row: string[], key: string) =>
      row[headers.indexOf(key)] || "";
    const imported = lines.slice(1).map((line) => {
      const row = parseLine(line);
      return {
        ...emptyLead(),
        company: value(row, "שם חברה"),
        employees: Number(value(row, "כמות עובדים")) || 0,
        location: value(row, "מיקום"),
        connection: value(row, "חיבור"),
        contactName: value(row, "איש קשר"),
        contactRole: value(row, "תפקיד"),
        phone: value(row, "טלפון"),
        email: value(row, "מייל"),
        owner: value(row, "אחראי") || "בועז",
        priority: (["נמוכה", "בינונית", "גבוהה"].includes(
          value(row, "רמת עדיפות"),
        )
          ? value(row, "רמת עדיפות")
          : "בינונית") as LeadPriority,
        followUpDate: value(row, "תאריך פולואפ"),
        currentStatus: value(row, "מצב קיים"),
        status: (leadStatuses.includes(value(row, "סטטוס") as LeadStatus)
          ? value(row, "סטטוס")
          : "לא טופל") as LeadStatus,
        notes: value(row, "הערות"),
        supplier: value(row, "ספק"),
        machineType: value(row, "סוג מכונות"),
        machineCount: Number(value(row, "כמות מכונות")) || 0,
        monthlyConsumption: Number(value(row, "צריכה חודשית")) || 0,
        pricePerKg: Number(value(row, "מחיר לקילו")) || 0,
        meetingDate: value(row, "תאריך פגישה"),
        meetingTime: value(row, "שעת פגישה") || "09:00",
        meetingLocation: value(row, "מיקום פגישה"),
        meetingGuest: value(row, "מייל לזימון"),
      };
    }).filter((lead) => lead.company);
    const existingKeys = new Set(
      workspace.leads.flatMap((lead) => [
        lead.email.trim().toLowerCase(),
        lead.phone.replace(/\D/g, ""),
        lead.company.trim().toLowerCase(),
      ]).filter(Boolean),
    );
    const unique = imported.filter(
      (lead) =>
        ![
          lead.email.trim().toLowerCase(),
          lead.phone.replace(/\D/g, ""),
          lead.company.trim().toLowerCase(),
        ].some((key) => key && existingKeys.has(key)),
    );
    await onImport({ leads: unique, quotes: [] });
    window.alert(
      `יובאו ${unique.length} לידים. ${imported.length - unique.length} כפילויות דולגו.`,
    );
  };

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
          {canMigrate && (
            <button
              className="sales-secondary"
              disabled={readOnly}
              onClick={() => setImporting(true)}
            >
              <FileInput size={17} /> העברת נתונים
            </button>
          )}
          <button
            className="sales-secondary"
            onClick={() => exportLeadsCsv(workspace.leads)}
          >
            <Download size={17} /> ייצוא
          </button>
          <label className="sales-secondary sales-file-button">
            <Upload size={17} /> ייבוא CSV
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importCsv(file);
                event.target.value = "";
              }}
            />
          </label>
          <button
            className="sales-primary"
            disabled={readOnly}
            onClick={() => setEditing(emptyLead())}
          >
            <Plus size={17} /> ליד חדש
          </button>
        </div>
      </div>
      <div className="lead-tabs">
        {leadTabs.map((item) => {
          const count = workspace.leads.filter((lead) =>
            leadMatchesTab(lead, item),
          ).length;
          return (
            <button
              key={item}
              className={`${tab === item ? "active" : ""} ${
                ["לא רלוונטי", "נמחקו"].includes(item) ? "danger" : ""
              }`}
              onClick={() => setTab(item)}
            >
              {item} <b>{count}</b>
            </button>
          );
        })}
      </div>
      <FlowStrip leads={workspace.leads} quotes={workspace.quotes} />
      <div className="sales-kpis">
        <SalesKpi
          label="כל הלידים"
          value={workspace.leads.filter((lead) => !lead.deleted).length}
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
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
          >
            <option>הכל</option>
            <option>גבוהה</option>
            <option>בינונית</option>
            <option>נמוכה</option>
          </select>
        </div>
        <div className="lead-results-head">
          <div>
            <strong>{rows.length} לידים</strong>
            <span>בתצוגה הנוכחית</span>
          </div>
          <div className="lead-view-toggle" aria-label="בחירת תצוגת לידים">
            <button
              className={viewMode === "cards" ? "active" : ""}
              onClick={() => setViewMode("cards")}
              aria-pressed={viewMode === "cards"}
            >
              <LayoutGrid size={15} /> כרטיסים
            </button>
            <button
              className={viewMode === "table" ? "active" : ""}
              onClick={() => setViewMode("table")}
              aria-pressed={viewMode === "table"}
            >
              <List size={15} /> טבלה
            </button>
          </div>
        </div>
        <div className={`lead-card-grid ${viewMode === "cards" ? "active" : ""}`}>
          {rows.map((lead) => {
            const pipelineIndex = leadPipelineIndex(lead.status);
            const followUp = leadFollowUpState(lead);
            return (
              <article className="lead-work-card" key={lead.id}>
                <header>
                  <div className="lead-company-mark">
                    {(lead.company || "?").slice(0, 2)}
                  </div>
                  <div className="lead-card-title">
                    <div>
                      <h3>{lead.company}</h3>
                      <span className={`lead-priority ${lead.priority}`}>
                        {lead.priority}
                      </span>
                    </div>
                    <p>
                      {lead.contactName || "איש קשר לא הוגדר"}
                      {lead.location ? ` · ${lead.location}` : ""}
                    </p>
                  </div>
                  <button
                    className="lead-card-edit"
                    onClick={() => setEditing(lead)}
                    aria-label={`עריכת ${lead.company}`}
                  >
                    <Pencil size={15} />
                  </button>
                </header>
                <div className="lead-pipeline" aria-label="התקדמות הליד">
                  {leadPipelineStages.map((stage, index) => (
                    <div
                      className={`${index <= pipelineIndex ? "done" : ""} ${
                        index === pipelineIndex ? "current" : ""
                      }`}
                      key={stage}
                    >
                      <i />
                      <span>{stage}</span>
                    </div>
                  ))}
                </div>
                <div className="lead-card-status-row">
                  <label>
                    <span>סטטוס</span>
                    <select
                      className="lead-inline-status"
                      value={lead.status}
                      disabled={readOnly}
                      onChange={(event) =>
                        updateLeadStatus(
                          lead,
                          event.target.value as LeadStatus,
                        )
                      }
                    >
                      {leadStatuses.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <div className={`lead-followup ${followUp.tone}`}>
                    <Clock3 size={15} />
                    <div>
                      <span>פולואפ</span>
                      <strong>{followUp.label}</strong>
                    </div>
                  </div>
                </div>
                <div className="lead-next-action">
                  <span>הפעולה הבאה</span>
                  <strong>
                    {lead.nextAction ||
                      (lead.status === "לא טופל"
                        ? "יצירת קשר ראשוני"
                        : "לא הוגדרה פעולה")}
                  </strong>
                </div>
                <dl className="lead-card-facts">
                  <div>
                    <dt>אחראי</dt>
                    <dd>{lead.owner}</dd>
                  </div>
                  <div>
                    <dt>צריכה</dt>
                    <dd>{lead.monthlyConsumption || "—"} ק״ג</dd>
                  </div>
                  <div>
                    <dt>מכונות</dt>
                    <dd>{lead.machineCount || "—"}</dd>
                  </div>
                </dl>
                <footer>
                  {lead.phone ? (
                    <a href={`tel:${lead.phone}`}>
                      <Phone size={15} /> חיוג
                    </a>
                  ) : (
                    <span />
                  )}
                  <button onClick={() => setEditing(lead)}>פתיחת ליד</button>
                  <button
                    className="quote-action"
                    disabled={readOnly}
                    onClick={() => setQuoteLead(lead)}
                  >
                    <FileText size={15} /> הצעה
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
        <div className={`sales-table-wrap ${viewMode === "table" ? "active" : ""}`}>
          <table className="sales-table">
            <thead>
              <tr>
                <th><button className="sales-sort" onClick={() => toggleSort("company")}>חברה</button></th>
                <th>איש קשר</th>
                <th><button className="sales-sort" onClick={() => toggleSort("status")}>סטטוס</button></th>
                <th><button className="sales-sort" onClick={() => toggleSort("owner")}>אחראי</button></th>
                <th><button className="sales-sort" onClick={() => toggleSort("followUpDate")}>פולואפ</button></th>
                <th><button className="sales-sort" onClick={() => toggleSort("monthlyConsumption")}>צריכה</button></th>
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
                    <select
                      className="lead-inline-status"
                      value={lead.status}
                      disabled={readOnly}
                      onChange={(event) =>
                        updateLeadStatus(
                          lead,
                          event.target.value as LeadStatus,
                        )
                      }
                    >
                      {leadStatuses.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
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
        {!rows.length && <div className="sales-empty">לא נמצאו לידים לפי הסינון שנבחר.</div>}
      </section>
      {editing && (
        <LeadModal
          lead={editing}
          readOnly={readOnly}
          onClose={() => setEditing(null)}
          onSave={async (lead) => {
            if (await saveChecked(lead)) setEditing(null);
          }}
          onDelete={async (lead) => {
            await onSaveLead({
              ...lead,
              deleted: true,
              deletedAt: now(),
              updatedAt: now(),
            });
            setEditing(null);
            setTab("נמחקו");
          }}
          onRestore={async (lead) => {
            await onSaveLead({
              ...lead,
              deleted: false,
              deletedAt: undefined,
              updatedAt: now(),
            });
            setEditing(null);
            setTab("לידים בתהליך");
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
      {importing && canMigrate && (
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
  onDeleteQuote,
  onConvert,
  onOpenLeads,
}: {
  workspace: SalesWorkspace;
  readOnly: boolean;
  onSaveQuote: (quote: Quote) => Promise<void>;
  onDeleteQuote: (quoteId: string) => Promise<void>;
  onConvert: (quote: Quote, lead?: Lead) => Promise<string>;
  onOpenLeads: () => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("הכל");
  const [editing, setEditing] = useState<Quote | null>(null);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [expandedClients, setExpandedClients] = useState<Set<string>>(
    () => new Set(),
  );
  const clientGroups = useMemo(() => {
    const groups = new Map<string, { key: string; name: string; quotes: Quote[] }>();
    workspace.quotes.forEach((quote) => {
      const normalizedName = quote.clientName.trim().toLowerCase();
      const key =
        quote.clientKey ||
        quote.leadId ||
        normalizedName ||
        quote.id;
      const group = groups.get(key) || {
        key,
        name: quote.clientName || "הצעה ללא שם",
        quotes: [],
      };
      group.quotes.push(quote);
      groups.set(key, group);
    });
    return [...groups.values()]
      .map((group) => ({
        ...group,
        quotes: [...group.quotes].sort((left, right) =>
          (right.savedAt || right.updatedAt).localeCompare(
            left.savedAt || left.updatedAt,
          ),
        ),
      }))
      .filter((group) => {
        const haystack = `${group.name} ${group.quotes
          .map((quote) => quote.versionName)
          .join(" ")}`.toLowerCase();
        return (
          haystack.includes(query.toLowerCase()) &&
          (status === "הכל" ||
            group.quotes.some((quote) => quote.status === status))
        );
      })
      .sort((left, right) =>
        (right.quotes[0]?.savedAt || right.quotes[0]?.updatedAt || "").localeCompare(
          left.quotes[0]?.savedAt || left.quotes[0]?.updatedAt || "",
        ),
      );
  }, [query, status, workspace.quotes]);
  const toggleClient = (key: string) => {
    setExpandedClients((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
        <div className="quote-client-grid">
          {clientGroups.map((group) => {
            const latest = group.quotes[0];
            const metrics = quoteMetrics(latest);
            const isExpanded = expandedClients.has(group.key);
            const approved = group.quotes.filter(
              (quote) => quote.status === "אושרה",
            ).length;
            return (
              <article
                className={`quote-client-card ${isExpanded ? "expanded" : ""}`}
                key={group.key}
              >
                <header className="quote-client-head">
                  <div className="quote-client-mark">
                    {group.name.slice(0, 2)}
                  </div>
                  <div className="quote-client-title">
                    <div>
                      <h3>{group.name}</h3>
                      <Status>{latest.status}</Status>
                    </div>
                    <p>
                      {group.quotes.length} הצעות
                      {approved ? ` · ${approved} אושרו` : ""}
                      {latest.owner ? ` · ${latest.owner}` : ""}
                    </p>
                  </div>
                  <button
                    className="quote-client-toggle"
                    onClick={() => toggleClient(group.key)}
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? "סגירת" : "פתיחת"} הצעות ${group.name}`}
                  >
                    {isExpanded ? <ChevronUp size={19} /> : <ChevronDown size={19} />}
                  </button>
                </header>
                <div className="quote-client-metrics">
                  <span>
                    <small>צריכה בהצעה האחרונה</small>
                    <strong>{metrics.consumption.consumptionKg} ק״ג</strong>
                  </span>
                  <span>
                    <small>ציוד מוצע</small>
                    <strong>
                      {latest.equipment.reduce(
                        (sum, item) => sum + item.quantity,
                        0,
                      )}{" "}
                      פריטים
                    </strong>
                  </span>
                  <span>
                    <small>יתרה חודשית אחרונה</small>
                    <strong>{money(metrics.profitability.monthlyBalance)}</strong>
                  </span>
                </div>
                <button
                  className="quote-client-open"
                  onClick={() => toggleClient(group.key)}
                >
                  {isExpanded
                    ? "הסתרת הצעות"
                    : `הצגת ${group.quotes.length} ההצעות של הלקוח`}
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {isExpanded && (
                  <div className="quote-version-list">
                    {group.quotes.map((quote, index) => {
                      const versionMetrics = quoteMetrics(quote);
                      return (
                        <section className="quote-version-row" key={quote.id}>
                          <div className="quote-version-name">
                            <span>{index === 0 ? "אחרונה" : `#${group.quotes.length - index}`}</span>
                            <div>
                              <strong>{quote.versionName}</strong>
                              <small>
                                עודכנה {displayDate(quote.savedAt || quote.updatedAt)}
                              </small>
                            </div>
                          </div>
                          <Status>{quote.status}</Status>
                          <div className="quote-version-value">
                            <small>צריכה</small>
                            <strong>
                              {versionMetrics.consumption.consumptionKg} ק״ג
                            </strong>
                          </div>
                          <div className="quote-version-value">
                            <small>יתרה חודשית</small>
                            <strong>
                              {money(
                                versionMetrics.profitability.monthlyBalance,
                              )}
                            </strong>
                          </div>
                          <div className="quote-version-actions">
                            <button onClick={() => setEditing(quote)}>
                              <Pencil size={15} /> פתיחה
                            </button>
                            <button
                              className="sales-danger"
                              disabled={readOnly}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `למחוק את "${quote.versionName}" עבור ${quote.clientName}?`,
                                  )
                                ) {
                                  void onDeleteQuote(quote.id);
                                }
                              }}
                            >
                              <Trash2 size={15} />
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
                            {quote.accountId && (
                              <span className="converted-label">לקוח הוקם</span>
                            )}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}
        </div>
        {!clientGroups.length && <div className="sales-empty">לא נמצאו הצעות מחיר.</div>}
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
  onDelete,
  onRestore,
}: {
  lead: Lead;
  readOnly: boolean;
  onClose: () => void;
  onSave: (lead: Lead) => Promise<void>;
  onDelete: (lead: Lead) => Promise<void>;
  onRestore: (lead: Lead) => Promise<void>;
}) {
  const [draft, setDraft] = useState(lead);
  const [saving, setSaving] = useState(false);
  const update = <K extends keyof Lead>(key: K, value: Lead[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const changed = draft.status !== lead.status;
      await onSave({
        ...draft,
        sheet:
          draft.status === "לפנייה עתידית"
            ? "לפנייה עתידית"
            : draft.sheet === "לפנייה עתידית"
              ? "ראשוני"
              : draft.sheet,
        statusChangedAt: changed ? now() : draft.statusChangedAt,
        statusHistory: changed
          ? [
              ...(draft.statusHistory || []),
              {
                from: lead.status,
                to: draft.status,
                changedAt: now(),
              },
            ]
          : draft.statusHistory || [],
        lastUpdated: today(),
        updatedAt: now(),
      });
    } finally {
      setSaving(false);
    }
  };
  const meetingStart = () => {
    if (!draft.meetingDate) return null;
    const time = draft.meetingTime || "09:00";
    const compact = `${draft.meetingDate.replaceAll("-", "")}T${time.replace(":", "")}00`;
    const [hours, minutes] = time.split(":").map(Number);
    const end = new Date(`${draft.meetingDate}T${time}:00`);
    end.setHours(hours + 1, minutes, 0, 0);
    const endCompact = `${end.toISOString().slice(0, 10).replaceAll("-", "")}T${end
      .toTimeString()
      .slice(0, 8)
      .replaceAll(":", "")}`;
    return { start: compact, end: endCompact };
  };
  const openCalendar = () => {
    const range = meetingStart();
    if (!range) return;
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: `פגישה — ${draft.company}`,
      dates: `${range.start}/${range.end}`,
      location: draft.meetingLocation,
      add: draft.meetingGuest,
      details: `${draft.contactName} · ${draft.phone}`,
    });
    window.open(
      `https://calendar.google.com/calendar/render?${params.toString()}`,
      "_blank",
      "noopener,noreferrer",
    );
  };
  const downloadIcs = () => {
    const range = meetingStart();
    if (!range) return;
    const content = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      `UID:${Date.now()}@mister-bean`,
      `SUMMARY:פגישה — ${draft.company}`,
      `DTSTART:${range.start}`,
      `DTEND:${range.end}`,
      `LOCATION:${draft.meetingLocation}`,
      draft.meetingGuest
        ? `ATTENDEE;RSVP=TRUE:mailto:${draft.meetingGuest}`
        : "",
      "END:VEVENT",
      "END:VCALENDAR",
    ].filter(Boolean).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([content], { type: "text/calendar;charset=utf-8" }),
    );
    link.download = `פגישה-${draft.company || "לקוח"}.ics`;
    link.click();
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
            <span>חיבור / מקור</span>
            <input
              value={draft.connection}
              onChange={(event) => update("connection", event.target.value)}
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
            <span>סוג מכונות</span>
            <input
              value={draft.machineType}
              onChange={(event) => update("machineType", event.target.value)}
            />
          </label>
          <label>
            <span>מחיר נוכחי לק״ג</span>
            <input
              type="number"
              min="0"
              value={draft.pricePerKg}
              onChange={(event) => update("pricePerKg", +event.target.value)}
            />
          </label>
          <label>
            <span>האם בחוזה קיים?</span>
            <select
              value={draft.hasContract ? "כן" : "לא"}
              onChange={(event) =>
                update("hasContract", event.target.value === "כן")
              }
            >
              <option>לא</option>
              <option>כן</option>
            </select>
          </label>
          <label className="full">
            <span>מצב קיים</span>
            <input
              value={draft.currentStatus}
              onChange={(event) => update("currentStatus", event.target.value)}
            />
          </label>
          <label className="full">
            <span>הפעולה הבאה</span>
            <input
              value={draft.nextAction}
              onChange={(event) => update("nextAction", event.target.value)}
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
          <label>
            <span>מיקום פגישה</span>
            <input
              value={draft.meetingLocation}
              onChange={(event) =>
                update("meetingLocation", event.target.value)
              }
            />
          </label>
          <label>
            <span>מייל לזימון</span>
            <input
              type="email"
              value={draft.meetingGuest}
              onChange={(event) => update("meetingGuest", event.target.value)}
            />
          </label>
          {draft.meetingDate && (
            <div className="lead-calendar-actions full">
              <button type="button" onClick={openCalendar}>
                <CalendarDays size={16} /> פתיחה ב־Google Calendar
              </button>
              <button type="button" onClick={downloadIcs}>
                <Download size={16} /> הורדת ICS
              </button>
            </div>
          )}
          <label className="full">
            <span>הערות</span>
            <textarea
              value={draft.notes}
              onChange={(event) => update("notes", event.target.value)}
            />
          </label>
          {!!draft.statusHistory?.length && (
            <details className="lead-history full">
              <summary>היסטוריית סטטוסים ({draft.statusHistory.length})</summary>
              <ol>
                {[...draft.statusHistory].reverse().map((entry, index) => (
                  <li key={`${entry.changedAt}-${index}`}>
                    <span>{displayDate(entry.changedAt)}</span>
                    <b>{entry.from || "—"} ← {entry.to}</b>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
        <footer>
          {lead.deleted ? (
            <button
              type="button"
              disabled={readOnly || saving}
              onClick={() => void onRestore(draft)}
            >
              שחזור ליד
            </button>
          ) : (
            lead.company && (
              <button
                type="button"
                className="sales-danger"
                disabled={readOnly || saving}
                onClick={() => {
                  if (
                    window.confirm(
                      `להעביר את ${lead.company} לכרטיסיית נמחקו?`,
                    )
                  ) {
                    void onDelete(draft);
                  }
                }}
              >
                <Trash2 size={16} /> מחיקה
              </button>
            )
          )}
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
  return calculateQuote(quote);
}

function downloadQuoteSummary(quote: Quote) {
  const metrics = calculateQuote(quote);
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 760;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = "#f3f8f4";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#174d3b";
  context.fillRect(0, 0, canvas.width, 150);
  context.direction = "rtl";
  context.textAlign = "right";
  context.fillStyle = "#fff";
  context.font = "700 42px Arial";
  context.fillText("Mister Bean · תמונת עסקה", 1120, 66);
  context.font = "500 25px Arial";
  context.fillText(`${quote.clientName} · ${quote.versionName}`, 1120, 112);
  const cards = [
    ["צריכה חודשית", `${metrics.consumption.consumptionKg.toFixed(1)} ק״ג`],
    ["הכנסה חודשית מפולים", money(metrics.beans.income)],
    ["עלות ציוד", money(metrics.equipment.total)],
    ["יתרה חודשית", money(metrics.profitability.monthlyBalance)],
    ["שיא חשיפה", money(metrics.cashflow.exposure)],
    [
      "חודש איזון",
      metrics.cashflow.breakEvenMonth
        ? String(metrics.cashflow.breakEvenMonth)
        : "לא בתקופה",
    ],
  ];
  cards.forEach(([label, value], index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = 70 + column * 370;
    const y = 210 + row * 190;
    context.fillStyle = "#fff";
    context.fillRect(x, y, 330, 145);
    context.fillStyle = "#64746d";
    context.font = "500 20px Arial";
    context.textAlign = "right";
    context.fillText(label, x + 290, y + 45);
    context.fillStyle = "#17372d";
    context.font = "700 30px Arial";
    context.fillText(value, x + 290, y + 100);
  });
  context.fillStyle = "#64746d";
  context.font = "500 18px Arial";
  context.fillText(
    "פלט פנימי להצגת תמונת העסקה המרכזית",
    1120,
    690,
  );
  const link = document.createElement("a");
  link.download = `mister-bean-${quote.clientName || "quote"}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
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
  const [recommendationBaseline, setRecommendationBaseline] =
    useState<Quote | null>(null);
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
  const setCatalogQuantity = (
    key: string,
    quantity: number,
    options: {
      label: string;
      cost: number;
      importer: string;
      capacityPerDay?: number;
      addonKeys?: string[];
    },
  ) => {
    const existingIndex = draft.equipment.findIndex(
      (item) => (item.key || item.model) === key,
    );
    if (existingIndex >= 0) {
      updateEquipment(existingIndex, {
        quantity,
        unitCost: options.cost,
        importer: options.importer,
        capacityPerDay: options.capacityPerDay,
        addonKeys: options.addonKeys,
      });
      return;
    }
    update("equipment", [
      ...draft.equipment,
      {
        key,
        model: options.label,
        quantity,
        unitCost: options.cost,
        importer: options.importer,
        capacityPerDay: options.capacityPerDay,
        addonKeys: options.addonKeys,
        commercialModel: "ללא עלות",
        monthlyPrice: 0,
      },
    ]);
  };
  const quantityFor = (key: string) =>
    draft.equipment.find((item) => (item.key || item.model) === key)?.quantity ||
    0;
  const applyRecommendation = () => {
    const recommendation = recommendedEquipment(metrics.consumption.dailyCups);
    const quantities: Record<string, number> = {
      f15: recommendation.f15,
      c12: recommendation.c12,
      emax: recommendation.emilio,
    };
    const addonQuantities: Record<string, number> = {};
    for (const item of equipmentCatalog) {
      const quantity = quantities[item.key] || 0;
      for (const addonKey of item.addonKeys) {
        addonQuantities[addonKey] = (addonQuantities[addonKey] || 0) + quantity;
      }
    }
    const machineItems = equipmentCatalog
      .filter((item) => (quantities[item.key] || 0) > 0)
      .map((item) => ({
        key: item.key,
        model: item.label,
        quantity: quantities[item.key],
        unitCost: item.cost,
        importer: item.importer,
        capacityPerDay: item.capacityPerDay,
        addonKeys: item.addonKeys,
        commercialModel: "ללא עלות" as const,
        monthlyPrice: 0,
      }));
    const addonItems = addonCatalog
      .filter((item) => (addonQuantities[item.key] || 0) > 0)
      .map((item) => ({
        key: item.key,
        model: item.label,
        quantity: addonQuantities[item.key],
        unitCost: item.cost,
        importer: item.importer,
        commercialModel: "ללא עלות" as const,
        monthlyPrice: 0,
      }));
    update("equipment", [...machineItems, ...addonItems]);
  };
  const allocationFor = (item: QuoteEquipment) => {
    const key = item.key || item.model;
    return (
      draft.allocation.find((row) => row.key === key) || {
        key,
        free: item.commercialModel === "ללא עלות" ? item.quantity : 0,
        lease: item.commercialModel === "השכרה" ? item.quantity : 0,
        sale: item.commercialModel === "מכירה" ? item.quantity : 0,
      }
    );
  };
  const updateAllocation = (
    item: QuoteEquipment,
    field: "free" | "lease" | "sale",
    value: number,
  ) => {
    const key = item.key || item.model;
    const current = allocationFor(item);
    const next = { ...current, [field]: Math.max(0, value) };
    update("allocation", [
      ...draft.allocation.filter((row) => row.key !== key),
      next,
    ]);
  };
  const applyBeanPriceRecommendation = () => {
    if (!recommendationBaseline) setRecommendationBaseline(draft);
    const increase = metrics.profitability.targetBeanPriceIncrease;
    update(
      "blends",
      draft.blends.map((blend) => ({
        ...blend,
        pricePerKg: blend.pricePerKg + increase,
      })),
    );
  };
  const applyLeaseRecommendation = () => {
    if (!recommendationBaseline) setRecommendationBaseline(draft);
    update(
      "manualLeasePerSet",
      (draft.manualLeasePerSet || 0) +
        metrics.profitability.targetLeaseIncrease,
    );
  };
  const submit = async (asCopy = false) => {
    setSaving(true);
    try {
      const approvedAt =
        draft.status === "אושרה" ? draft.approvedAt || now() : draft.approvedAt;
      await onSave({
        ...draft,
        id: asCopy ? id("quote") : draft.id,
        versionName: asCopy
          ? `${draft.versionName || "הצעה"} · עותק`
          : draft.versionName,
        approvedAt,
        updatedAt: now(),
        savedAt: now(),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };
  const steps = ["לקוח וצריכה", "פולים", "ציוד", "מתווה ומימון", "סיכום"];

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
              <label>
                <span>ימי עבודה בחודש</span>
                <input
                  type="number"
                  min="1"
                  value={draft.workDaysMonth}
                  onChange={(event) => update("workDaysMonth", +event.target.value)}
                />
              </label>
              <label>
                <span>מספר מכונות מבוקש</span>
                <input
                  type="number"
                  min="0"
                  value={draft.requestedMachines}
                  onChange={(event) =>
                    update("requestedMachines", +event.target.value)
                  }
                />
              </label>
              <div className="quote-recommendation full">
                <Sparkles size={19} />
                <div>
                  <small>המלצת צריכה לפי הנתונים</small>
                  <strong>{metrics.consumption.recommendedKg} ק״ג בחודש</strong>
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
              <label className="quote-discount-toggle">
                <input
                  type="checkbox"
                  checked={draft.applyVolumeDiscount}
                  onChange={(event) =>
                    update("applyVolumeDiscount", event.target.checked)
                  }
                />
                <span>הפעלת הנחת כמות של 10% על הק״ג שמעל 100 ק״ג</span>
              </label>
              {draft.blends.map((blend, index) => (
                <div className="quote-line" key={`${blend.name}-${index}`}>
                  <label>
                    <span>בלנד</span>
                    <select
                      value={blend.name}
                      onChange={(event) => {
                        const selected = blendCatalog.find(
                          (item) => item.name === event.target.value,
                        );
                        updateBlend(index, {
                          name: event.target.value,
                          costPerKg: selected?.cost || blend.costPerKg,
                          pricePerKg: selected
                            ? selected.cost + 40
                            : blend.pricePerKg,
                        });
                      }}
                    >
                      {blendCatalog.map((item) => (
                        <option key={item.name}>{item.name}</option>
                      ))}
                    </select>
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
                  <h3>ציוד לפי יבואן</h3>
                  <p>מכונות, ציוד נלווה ועלויות בפועל</p>
                </div>
                <button onClick={applyRecommendation}>
                  <Sparkles size={15} /> מלא לפי המלצת המערכת
                </button>
              </div>
              <div className="equipment-importer-grid">
                {(Object.keys(importers) as Array<keyof typeof importers>).map(
                  (importerKey) => (
                    <section className="equipment-importer" key={importerKey}>
                      <h4>{importers[importerKey]}</h4>
                      {equipmentCatalog
                        .filter((item) => item.importer === importerKey)
                        .map((item) => {
                          const selected = draft.equipment.find(
                            (row) => (row.key || row.model) === item.key,
                          );
                          return (
                            <div className="equipment-catalog-row" key={item.key}>
                              <div>
                                <strong>{item.label}</strong>
                                <small>
                                  תפוקה {item.capacityPerDay} כוסות ביום
                                </small>
                              </div>
                              <label>
                                <span>כמות</span>
                                <input
                                  type="number"
                                  min="0"
                                  value={quantityFor(item.key)}
                                  onChange={(event) =>
                                    setCatalogQuantity(item.key, +event.target.value, {
                                      label: item.label,
                                      cost: selected?.unitCost ?? item.cost,
                                      importer: item.importer,
                                      capacityPerDay: item.capacityPerDay,
                                      addonKeys: item.addonKeys,
                                    })
                                  }
                                />
                              </label>
                              <label>
                                <span>עלות בפועל</span>
                                <input
                                  type="number"
                                  min="0"
                                  value={selected?.unitCost ?? item.cost}
                                  onChange={(event) =>
                                    setCatalogQuantity(
                                      item.key,
                                      selected?.quantity || 0,
                                      { ...item, cost: +event.target.value },
                                    )
                                  }
                                />
                              </label>
                            </div>
                          );
                        })}
                      <h5>ציוד נלווה</h5>
                      {addonCatalog
                        .filter((item) => item.importer === importerKey)
                        .map((item) => {
                          const selected = draft.equipment.find(
                            (row) => (row.key || row.model) === item.key,
                          );
                          return (
                            <div className="equipment-catalog-row addon" key={item.key}>
                              <strong>{item.label}</strong>
                              <label>
                                <span>כמות</span>
                                <input
                                  type="number"
                                  min="0"
                                  value={quantityFor(item.key)}
                                  onChange={(event) =>
                                    setCatalogQuantity(item.key, +event.target.value, {
                                      label: item.label,
                                      cost: selected?.unitCost ?? item.cost,
                                      importer: item.importer,
                                    })
                                  }
                                />
                              </label>
                              <label>
                                <span>עלות בפועל</span>
                                <input
                                  type="number"
                                  min="0"
                                  value={selected?.unitCost ?? item.cost}
                                  onChange={(event) =>
                                    setCatalogQuantity(
                                      item.key,
                                      selected?.quantity || 0,
                                      { ...item, cost: +event.target.value },
                                    )
                                  }
                                />
                              </label>
                            </div>
                          );
                        })}
                    </section>
                  ),
                )}
              </div>
              <div className="quote-recommendation">
                <Sparkles size={19} />
                <div>
                  <small>המלצת ציוד לפי הצריכה</small>
                  <strong>
                    {Object.entries(recommendedEquipment(metrics.consumption.dailyCups))
                      .filter(([key, value]) =>
                        ["f15", "c12", "emilio"].includes(key) && Number(value) > 0,
                      )
                      .map(([key, value]) => `${value} × ${key}`)
                      .join(" · ") || "לא נדרש ציוד"}
                  </strong>
                </div>
              </div>
              <div className="sales-form-grid compact">
                <label>
                  <span>פריסת תשלום ליבואן</span>
                  <input
                    type="number"
                    min="1"
                    value={draft.supplierMonths}
                    onChange={(event) =>
                      update("supplierMonths", +event.target.value)
                    }
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
            <div className="quote-lines">
              <div className="quote-lines-head">
                <div>
                  <h3>מתווה ציוד, תנאי תשלום ומימון</h3>
                  <p>חלוקת הציוד ובדיקת מבנה העסקה</p>
                </div>
              </div>
              <div className="allocation-list">
                {draft.equipment
                  .filter(
                    (item) =>
                      item.quantity > 0 &&
                      equipmentCatalog.some(
                        (catalog) => catalog.key === (item.key || item.model),
                      ),
                  )
                  .map((item) => {
                    const allocation = allocationFor(item);
                    const remaining =
                      item.quantity -
                      allocation.free -
                      allocation.lease -
                      allocation.sale;
                    return (
                      <div className="allocation-row" key={item.key || item.model}>
                        <strong>{item.model}</strong>
                        <label>
                          <span>כמות</span>
                          <input value={item.quantity} readOnly />
                        </label>
                        {(["free", "lease", "sale"] as const).map((field) => (
                          <label key={field}>
                            <span>
                              {field === "free"
                                ? "ללא עלות"
                                : field === "lease"
                                  ? "השכרה"
                                  : "מכירה"}
                            </span>
                            <input
                              type="number"
                              min="0"
                              value={allocation[field]}
                              onChange={(event) =>
                                updateAllocation(item, field, +event.target.value)
                              }
                            />
                          </label>
                        ))}
                        <small className={remaining < 0 ? "negative" : ""}>
                          {remaining < 0
                            ? `חריגה של ${Math.abs(remaining)}`
                            : `נותרו לחלוקה: ${remaining}`}
                        </small>
                      </div>
                    );
                  })}
              </div>
              <div className="sales-form-grid">
                <label>
                  <span>תקופה לכיסוי ציוד בהשכרה</span>
                  <input
                    type="number"
                    min="1"
                    value={draft.leaseMonths}
                    onChange={(event) => update("leaseMonths", +event.target.value)}
                  />
                </label>
                <label>
                  <span>שכירות ידנית לסט</span>
                  <input
                    type="number"
                    min="0"
                    value={draft.manualLeasePerSet}
                    onChange={(event) =>
                      update("manualLeasePerSet", +event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>רווח רצוי במכירה</span>
                  <div className="input-suffix">
                    <input
                      type="number"
                      min="0"
                      value={draft.saleMargin}
                      onChange={(event) => update("saleMargin", +event.target.value)}
                    />
                    <b>%</b>
                  </div>
                </label>
                <label>
                  <span>תקופת חוזה לחישוב</span>
                  <input
                    type="number"
                    min="1"
                    value={draft.clientCostMonths}
                    onChange={(event) =>
                      update("clientCostMonths", +event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>תנאי תשלום לקוח</span>
                  <select
                    value={draft.clientPayTerm}
                    onChange={(event) =>
                      update("clientPayTerm", +event.target.value)
                    }
                  >
                    {[0, 1, 2, 3].map((value) => (
                      <option value={value} key={value}>
                        {value ? `שוטף + ${value * 30}` : "מיידי"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>תנאי תשלום ליבואן</span>
                  <select
                    value={draft.importerPayTerm}
                    onChange={(event) =>
                      update("importerPayTerm", +event.target.value)
                    }
                  >
                    {[0, 1, 2, 3].map((value) => (
                      <option value={value} key={value}>
                        {value ? `שוטף + ${value * 30}` : "מיידי"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>תנאי תשלום ספק פולים</span>
                  <select
                    value={draft.coffeeSupplierPayTerm}
                    onChange={(event) =>
                      update("coffeeSupplierPayTerm", +event.target.value)
                    }
                  >
                    {[0, 1, 2, 3].map((value) => (
                      <option value={value} key={value}>
                        {value ? `שוטף + ${value * 30}` : "מיידי"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>תקופת תזרים</span>
                  <input
                    type="number"
                    min="12"
                    value={draft.cashflowMonths}
                    onChange={(event) =>
                      update("cashflowMonths", +event.target.value)
                    }
                  />
                </label>
              </div>
              <details className="quote-financing" open={draft.financingMonths > 0}>
                <summary>מימון העסקה</summary>
                <div className="sales-form-grid compact">
                  <label>
                    <span>תקופת המימון</span>
                    <input
                      type="number"
                      min="0"
                      value={draft.financingMonths}
                      onChange={(event) =>
                        update("financingMonths", +event.target.value)
                      }
                    />
                  </label>
                  <label>
                    <span>סכום המימון</span>
                    <input
                      type="number"
                      min="0"
                      value={draft.financedAmount}
                      onChange={(event) =>
                        update("financedAmount", +event.target.value)
                      }
                    />
                  </label>
                  <label>
                    <span>ריבית שנתית</span>
                    <div className="input-suffix">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.annualInterest}
                        onChange={(event) =>
                          update("annualInterest", +event.target.value)
                        }
                      />
                      <b>%</b>
                    </div>
                  </label>
                </div>
                <div className="quote-summary-grid">
                  <div>
                    <small>החזר חודשי</small>
                    <strong>{money(metrics.financing.payment)}</strong>
                  </div>
                  <div>
                    <small>ציוד שלא מומן</small>
                    <strong>
                      {money(metrics.financing.unfinancedEquipment)}
                    </strong>
                  </div>
                  <div>
                    <small>עלות ריבית כוללת</small>
                    <strong>{money(metrics.financing.interest)}</strong>
                  </div>
                </div>
              </details>
            </div>
          )}
          {step === 4 && (
            <div className="quote-summary">
              <div className="quote-summary-hero">
                <span>
                  <CircleDollarSign size={23} />
                </span>
                <div>
                  <small>יתרה חודשית לאחר תשלומים</small>
                  <strong>{money(metrics.profitability.monthlyBalance)}</strong>
                </div>
                <Status>{draft.status}</Status>
              </div>
              <div className="quote-summary-grid">
                <div>
                  <small>צריכה חודשית</small>
                  <strong>{metrics.consumption.consumptionKg} ק״ג</strong>
                </div>
                <div>
                  <small>הכנסה מפולים</small>
                  <strong>{money(metrics.beans.income)}</strong>
                </div>
                <div>
                  <small>עלות ציוד</small>
                  <strong>{money(metrics.equipment.total)}</strong>
                </div>
                <div
                  className={
                    metrics.profitability.monthlyBalance < 0
                      ? "negative"
                      : "positive"
                  }
                >
                  <small>רווח תפעולי חודשי</small>
                  <strong>{money(metrics.profitability.operatingProfit)}</strong>
                </div>
                <div>
                  <small>שיא חשיפה תזרימית</small>
                  <strong>{money(metrics.cashflow.exposure)}</strong>
                </div>
                <div>
                  <small>חודש איזון</small>
                  <strong>
                    {metrics.cashflow.breakEvenMonth || "לא בתקופה"}
                  </strong>
                </div>
                <div>
                  <small>מינימום ק״ג לאיזון</small>
                  <strong>
                    {metrics.profitability.minimumKgToBreakEven} ק״ג
                  </strong>
                </div>
                <div>
                  <small>עלות לכוס ללקוח</small>
                  <strong>{cupMoney(metrics.beans.costPerCup)}</strong>
                </div>
                <div>
                  <small>רווח לתקופת החוזה</small>
                  <strong>
                    {money(metrics.profitability.totalContractProfit)}
                  </strong>
                </div>
              </div>
              <section className="quote-improvement">
                <h3>המלצה לשיפור העסקה</h3>
                {metrics.profitability.monthlyBalance >= 500 ? (
                  <p className="positive">
                    העסקה עומדת ביעד של יתרה חודשית הגבוהה מ־500 ₪.
                  </p>
                ) : (
                  <div className="quote-summary-grid">
                    <div>
                      <small>תוספת נדרשת למחיר ק״ג</small>
                      <strong>
                        {money(metrics.profitability.targetBeanPriceIncrease)}
                      </strong>
                      <button onClick={applyBeanPriceRecommendation}>
                        החלה על המחירים
                      </button>
                    </div>
                    <div>
                      <small>או תוספת שכירות לסט</small>
                      <strong>
                        {money(metrics.profitability.targetLeaseIncrease)}
                      </strong>
                      <button
                        disabled={!metrics.profitability.targetLeaseIncrease}
                        onClick={applyLeaseRecommendation}
                      >
                        החלה על השכירות
                      </button>
                    </div>
                  </div>
                )}
                {recommendationBaseline && (
                  <button
                    className="quote-undo"
                    onClick={() => {
                      setDraft(recommendationBaseline);
                      setRecommendationBaseline(null);
                    }}
                  >
                    ביטול שינויי ההמלצה
                  </button>
                )}
              </section>
              <details className="cashflow-details">
                <summary>תזרים חודשי מלא</summary>
                <div className="cashflow-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>חודש</th>
                        <th>הכנסות</th>
                        <th>יבואן</th>
                        <th>פולים</th>
                        <th>נוספות</th>
                        <th>מימון</th>
                        <th>תזרים</th>
                        <th>מצטבר</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.cashflow.rows.map((row) => (
                        <tr key={row.month}>
                          <td>{row.month}{row.isTail ? " *" : ""}</td>
                          <td>{money(row.income)}</td>
                          <td>{money(row.importer)}</td>
                          <td>{money(row.coffee)}</td>
                          <td>{money(row.extra)}</td>
                          <td>{money(row.financing)}</td>
                          <td>{money(row.net)}</td>
                          <td>{money(row.cumulative)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
              <button
                className="quote-graphic-button"
                onClick={() => downloadQuoteSummary(draft)}
              >
                פלט גרפי קצר
              </button>
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
              <dd>{metrics.consumption.consumptionKg} ק״ג</dd>
            </div>
            <div>
              <dt>מכונות</dt>
              <dd>{draft.equipment.reduce((sum, item) => sum + item.quantity, 0)}</dd>
            </div>
            <div>
              <dt>הכנסה מפולים</dt>
              <dd>{money(metrics.beans.income)}</dd>
            </div>
            <div>
              <dt>יתרה חודשית</dt>
              <dd>{money(metrics.profitability.monthlyBalance)}</dd>
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
            <>
              <button
                disabled={readOnly || saving || !draft.clientName}
                onClick={() => void submit(true)}
              >
                שמור כגרסה חדשה
              </button>
              <button
                className="sales-primary"
                disabled={readOnly || saving || !draft.clientName}
                onClick={() => void submit(false)}
              >
                {saving ? "שומר…" : "שמירת הצעה"}
              </button>
            </>
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
  const [mode, setMode] = useState<"automatic" | "manual">("automatic");
  const [email, setEmail] = useState("boaz@pacifictrade.co");
  const [leadsPassword, setLeadsPassword] = useState("");
  const [quotesPassword, setQuotesPassword] = useState("");
  const [samePassword, setSamePassword] = useState(true);
  const [leadsJson, setLeadsJson] = useState("");
  const [quotesJson, setQuotesJson] = useState("");
  const [snapshot, setSnapshot] = useState<LegacyMigrationSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const connect = async () => {
    setError("");
    setBusy(true);
    try {
      const nextSnapshot =
        mode === "automatic"
          ? await fetchLegacyWorkspace({
              email,
              leadsPassword,
              quotesPassword: samePassword ? leadsPassword : quotesPassword,
            })
          : {
              workspace: parseLegacyWorkspace(
                leadsJson ? JSON.parse(leadsJson) : {},
                quotesJson ? JSON.parse(quotesJson) : [],
              ),
              rawLeads: leadsJson ? JSON.parse(leadsJson) : {},
              rawQuotes: quotesJson ? JSON.parse(quotesJson) : {},
              fetchedAt: now(),
            };
      const workspace = nextSnapshot.workspace;
      if (!workspace.leads.length && !workspace.quotes.length) {
        throw new Error("לא נמצאו רשומות לייבוא.");
      }
      setSnapshot(nextSnapshot);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(
        message.includes("auth/invalid-credential")
          ? "פרטי הכניסה לאחת ממערכות המקור אינם נכונים."
          : message,
      );
    } finally {
      setBusy(false);
    }
  };
  const importData = async () => {
    if (!snapshot) return;
    setBusy(true);
    setError("");
    try {
      await onImport(snapshot.workspace);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };
  const downloadBackup = () => {
    if (!snapshot) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              fetchedAt: snapshot.fetchedAt,
              leads: snapshot.rawLeads,
              quotes: snapshot.rawQuotes,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    link.download = `mister-bean-legacy-backup-${now().slice(0, 10)}.json`;
    link.click();
  };
  return (
    <SalesModal title="ייבוא מהמערכות הקודמות" onClose={onClose}>
      <div className="import-modal">
        <div className="import-note">
          <FileInput size={19} />
          <p>
            ההעברה קוראת את הנתונים ישירות משני פרויקטי Firebase הישנים.
            הסיסמאות משמשות להתחברות חד־פעמית בדפדפן ואינן נשמרות.
          </p>
        </div>
        <div className="import-mode-tabs">
          <button
            className={mode === "automatic" ? "active" : ""}
            onClick={() => {
              setMode("automatic");
              setSnapshot(null);
            }}
          >
            חיבור ישיר
          </button>
          <button
            className={mode === "manual" ? "active" : ""}
            onClick={() => {
              setMode("manual");
              setSnapshot(null);
            }}
          >
            קובץ גיבוי
          </button>
        </div>
        {mode === "automatic" ? (
          <div className="sales-form-grid">
            <label className="full">
              <span>כתובת הדוא״ל במערכות הישנות</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
              />
            </label>
            <label>
              <span>סיסמת מערכת הלידים</span>
              <input
                type="password"
                value={leadsPassword}
                onChange={(event) => setLeadsPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
            {!samePassword && (
              <label>
                <span>סיסמת מערכת ההצעות</span>
                <input
                  type="password"
                  value={quotesPassword}
                  onChange={(event) => setQuotesPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </label>
            )}
            <label className="import-same-password">
              <input
                type="checkbox"
                checked={samePassword}
                onChange={(event) => setSamePassword(event.target.checked)}
              />
              <span>אותה סיסמה בשתי המערכות</span>
            </label>
          </div>
        ) : (
          <>
            <label>
              <span>JSON ממערכת הלידים</span>
              <textarea
                value={leadsJson}
                onChange={(event) => setLeadsJson(event.target.value)}
              />
            </label>
            <label>
              <span>JSON ממערכת הצעות המחיר</span>
              <textarea
                value={quotesJson}
                onChange={(event) => setQuotesJson(event.target.value)}
              />
            </label>
          </>
        )}
        {snapshot && (
          <section className="migration-preview">
            <h3>הנתונים נמצאו</h3>
            <div>
              <span>
                <b>{snapshot.workspace.leads.length}</b>
                לידים
              </span>
              <span>
                <b>{snapshot.workspace.quotes.length}</b>
                גרסאות הצעה
              </span>
              <span>
                <b>
                  {
                    snapshot.workspace.leads.filter((lead) => lead.deleted)
                      .length
                  }
                </b>
                לידים שנמחקו
              </span>
            </div>
            <button onClick={downloadBackup}>הורדת גיבוי לפני העברה</button>
          </section>
        )}
        {error && <div className="sales-import-error">{error}</div>}
        <footer>
          <button onClick={onClose}>ביטול</button>
          {!snapshot ? (
            <button
              className="sales-primary"
              disabled={
                busy ||
                (mode === "automatic" && (!email || !leadsPassword))
              }
              onClick={() => void connect()}
            >
              {busy ? "מתחבר…" : "בדיקת נתונים"}
            </button>
          ) : (
            <button
              className="sales-primary"
              disabled={busy}
              onClick={() => void importData()}
            >
              {busy ? "מעביר…" : "העברת הנתונים למערכת"}
            </button>
          )}
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
