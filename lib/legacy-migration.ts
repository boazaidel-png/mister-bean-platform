import type {
  Lead,
  LeadPriority,
  LeadStatus,
  Quote,
  QuoteStatus,
  SalesWorkspace,
} from "./platform-types";

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

function legacyLead(id: string, source: UnknownRecord): Lead {
  const statusText = text(source.status);
  const priorityText = text(source.priority);
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
    meetingDate: text(source.meetingDate),
    meetingTime: text(source.meetingTime),
    meetingLocation: text(source.meetingLocation),
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
  const updatedAt = timestamp(source.updatedAt || source.savedAt);
  return {
    id: `quote-${id}`,
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
    equipment: Object.entries(equipmentMap)
      .filter(([, quantity]) => number(quantity) > 0)
      .map(([model, quantity]) => {
        const terms = allocation.find((row) => text(row.key) === model);
        const commercialModel =
          number(terms?.sale) > 0
            ? "מכירה"
            : number(terms?.lease) > 0
              ? "השכרה"
              : "ללא עלות";
        return {
          model,
          quantity: number(quantity),
          unitCost: number(costMap[model]),
          commercialModel,
          monthlyPrice: 0,
        };
      }),
    leaseMonths: number(source.leaseMonths) || 24,
    saleMargin: number(source.saleMargin) || 15,
    extraMonthlyCost: number(source.extraMonthlyCost),
    owner: text(source.owner),
    notes: "יובא ממערכת הצעות המחיר הקודמת",
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
      .map(([id, value]) => legacyLead(id, value as UnknownRecord)),
    quotes: quoteRows
      .filter((value) => value && typeof value === "object")
      .map((value, index) => {
        const row = value as UnknownRecord;
        return legacyQuote(text(row.id) || String(index + 1), row);
      }),
  };
}
