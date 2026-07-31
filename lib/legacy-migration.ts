import type {
  Lead,
  LeadPriority,
  LeadStatus,
  LeadTask,
  Quote,
  QuoteAllocation,
  QuoteStatus,
  SalesWorkspace,
} from "./platform-types";
import { addonCatalog, equipmentCatalog } from "./quote-engine";

type UnknownRecord = Record<string, unknown>;

const leadStatuses = new Set<LeadStatus>([
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
]);

const quoteStatuses = new Set<QuoteStatus>([
  "טיוטה",
  "בבדיקה",
  "נשלחה",
  "אושרה",
  "נדחתה",
]);

const text = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();
const number = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};
const timestamp = (value: unknown) => {
  const candidate = text(value);
  const date = candidate ? new Date(candidate) : new Date();
  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString();
};
const bool = (value: unknown) =>
  value === true || ["כן", "true", "1"].includes(text(value).toLowerCase());
const rows = (value: unknown): UnknownRecord[] =>
  Array.isArray(value)
    ? value.filter((item) => item && typeof item === "object") as UnknownRecord[]
    : [];

function legacyLeadTasks(value: unknown, source: UnknownRecord): LeadTask[] {
  return rows(value).map((item, index) => ({
    id: text(item.id) || `task-${index + 1}`,
    title: text(item.title),
    status: (["פתוחה", "בטיפול", "נדחתה", "בוצעה", "בוטלה"].includes(
      text(item.status),
    )
      ? text(item.status)
      : "פתוחה") as LeadTask["status"],
    priority: (["נמוכה", "בינונית", "גבוהה"].includes(text(item.priority))
      ? text(item.priority)
      : text(source.priority) || "בינונית") as LeadPriority,
    owner: text(item.owner) || text(source.owner) || "בועז",
    dueDate: text(item.dueDate) || text(source.followUpDate),
    dueTime: text(item.dueTime) || "09:00",
    note: text(item.note),
    createdAt: timestamp(item.createdAt || source.createdAt),
    updatedAt: timestamp(item.updatedAt || item.createdAt || source.updatedAt),
  }));
}

function legacyLead(id: string, source: UnknownRecord): Lead {
  const statusText = text(source.status);
  const priorityText = text(source.priority);
  const deletedAt = text(source.deletedAt);
  const updatedAt = timestamp(
    source.updatedAt || source.lastUpdatedAt || source.lastUpdated,
  );
  return {
    id: `lead-${id}`,
    legacyId: id,
    company: text(source.company),
    employees: number(source.employees),
    location: text(source.location),
    connection: text(source.connection),
    contactName: text(source.contact || source.contactName),
    contactRole: text(source.role || source.contactRole),
    phone: text(source.phone),
    email: text(source.email),
    owner: text(source.owner) || "בועז",
    priority: (["נמוכה", "בינונית", "גבוהה"].includes(priorityText)
      ? priorityText
      : "בינונית") as LeadPriority,
    status: leadStatuses.has(statusText as LeadStatus)
      ? (statusText as LeadStatus)
      : "לא טופל",
    followUpDate: text(source.followUpDate),
    hasContract: bool(source.hasContract),
    supplier: text(source.supplier),
    machineType: text(source.machineType),
    machineCount: number(source.machineCount),
    monthlyConsumption: number(source.monthlyConsumption),
    pricePerKg: number(source.pricePerKg),
    notes: text(source.notes),
    currentStatus: text(source.currentStatus),
    nextAction: text(source.nextAction),
    meetingDate: text(source.meetingDate),
    meetingTime: text(source.meetingTime),
    meetingLocation: text(source.meetingLocation),
    meetingGuest: text(source.meetingGuest),
    sheet: text(source.sheet) || "ראשוני",
    deleted: bool(source.deleted),
    ...(deletedAt ? { deletedAt } : {}),
    statusChangedAt: timestamp(source.statusChangedAt || updatedAt),
    statusHistory: rows(source.statusHistory).map((entry) => ({
      from: text(entry.from || entry.oldStatus),
      to: text(entry.to || entry.newStatus),
      changedAt: timestamp(entry.changedAt || entry.at),
      changedBy: text(entry.changedBy || entry.owner) || undefined,
    })),
    tasks: legacyLeadTasks(source.tasks, source),
    lastUpdated: text(source.lastUpdated) || updatedAt.slice(0, 10),
    quoteIds: [],
    createdAt: timestamp(source.createdAt || updatedAt),
    updatedAt,
  };
}

function legacyQuote(id: string, source: UnknownRecord): Quote {
  const statusText = text(source.quoteStatus || source.status);
  const blendRows = Array.isArray(source.blends) ? source.blends : [];
  const equipmentMap =
    source.equipment && typeof source.equipment === "object"
      ? (source.equipment as UnknownRecord)
      : {};
  const costMap =
    source.equipmentCosts && typeof source.equipmentCosts === "object"
      ? (source.equipmentCosts as UnknownRecord)
      : {};
  const allocation = Array.isArray(source.allocation)
    ? (source.allocation as UnknownRecord[])
    : [];
  const equipmentRows = Object.entries(equipmentMap)
    .filter(([, quantity]) => number(quantity) > 0)
    .map(([model, quantity]) => {
      const terms = allocation.find((row) => text(row.key) === model);
      const catalogItem = equipmentCatalog.find((item) => item.key === model);
      const addonItem = addonCatalog.find((item) => item.key === model);
      const commercialModel =
        number(terms?.sale) > 0
          ? "מכירה"
          : number(terms?.lease) > 0
            ? "השכרה"
            : "ללא עלות";
      return {
        key: model,
        model: catalogItem?.label || addonItem?.label || model,
        quantity: number(quantity),
        unitCost:
          number(costMap[model]) ||
          catalogItem?.cost ||
          addonItem?.cost ||
          0,
        importer: catalogItem?.importer || addonItem?.importer,
        capacityPerDay: catalogItem?.capacityPerDay,
        addonKeys: catalogItem?.addonKeys,
        commercialModel,
        monthlyPrice: number(source.manualLeasePerSet),
      } as const;
    });
  const updatedAt = timestamp(source.updatedAt || source.savedAt);
  return {
    id: `quote-${id}`,
    legacyId: id,
    clientKey: text(source.clientKey),
    clientName: text(source.clientName),
    versionName: text(source.versionName) || "גרסה מיובאת",
    clientRank: text(source.clientRank) || "רגיל",
    status: quoteStatuses.has(statusText as QuoteStatus)
      ? (statusText as QuoteStatus)
      : "טיוטה",
    employees: number(source.employees),
    knownKg: number(source.knownKg),
    requestedMachines: number(source.requestedMachines),
    cupsPerEmployee: number(source.cupsPerEmployee) || 1.5,
    gramsPerCup: number(source.gramsPerCup) || 12,
    workDaysMonth: number(source.workDaysMonth) || 21,
    blends: blendRows.map((row) => {
      const blend = row as UnknownRecord;
      return {
        name: text(blend.name) || "DX",
        quantityKg: number(blend.qty || blend.quantityKg),
        costPerKg: number(blend.cost || blend.costPerKg),
        pricePerKg: number(blend.price || blend.pricePerKg),
      };
    }),
    equipment: equipmentRows,
    equipmentCosts: Object.fromEntries(
      Object.entries(costMap).map(([key, value]) => [key, number(value)]),
    ),
    allocation: allocation.map((row) => ({
      key: text(row.key),
      free: number(row.free),
      lease: number(row.lease),
      sale: number(row.sale),
    })) as QuoteAllocation[],
    supplierMonths: number(source.supplierMonths) || 8,
    leaseMonths: number(source.leaseMonths) || 24,
    manualLeasePerSet: number(source.manualLeasePerSet),
    saleMargin: number(source.saleMargin) || 15,
    clientCostMonths: number(source.clientCostMonths) || 36,
    extraMonthlyCost: number(source.extraMonthlyCost),
    clientPayTerm: number(source.clientPayTerm),
    importerPayTerm: number(source.importerPayTerm),
    coffeeSupplierPayTerm: number(source.coffeeSupplierPayTerm),
    cashflowMonths: number(source.cashflowMonths) || 36,
    financingMonths: number(source.financingMonths),
    financedAmount: number(source.financedAmount),
    annualInterest: number(source.annualInterest),
    applyVolumeDiscount: source.applyVolumeDiscount !== false,
    owner: text(source.owner),
    notes: "יובא ממערכת הצעות המחיר הקודמת",
    savedAt: text(source.savedAt),
    createdAt: timestamp(source.createdAt || updatedAt),
    updatedAt,
  };
}

export function parseLegacyWorkspace(
  leadsInput: unknown,
  quotesInput: unknown,
): SalesWorkspace {
  const leadsSource =
    leadsInput && typeof leadsInput === "object"
      ? (leadsInput as UnknownRecord)
      : {};
  const quoteRows = Array.isArray(quotesInput)
    ? quotesInput
    : quotesInput && typeof quotesInput === "object"
      ? Object.entries(quotesInput as UnknownRecord).map(([id, value]) => ({
          id,
          ...(value as UnknownRecord),
        }))
      : [];

  return {
    leads: Object.entries(leadsSource)
      .filter(([, value]) => value && typeof value === "object")
      .map(([id, value]) => {
        const source = value as UnknownRecord;
        return legacyLead(text(source.id) || id, source);
      }),
    quotes: quoteRows
      .filter((value) => value && typeof value === "object")
      .map((value, index) => {
        const row = value as UnknownRecord;
        return legacyQuote(text(row.id) || String(index + 1), row);
      }),
  };
}
