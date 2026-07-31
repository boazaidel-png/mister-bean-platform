export type Role = "customer" | "multi" | "service" | "admin";

export type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  accountIds: string[];
  status: "active" | "pending";
  createdAt: string;
};

export type PreviewContext = {
  role: Role;
  accountId: string;
};

export type View =
  | "dashboard"
  | "leads"
  | "quotes"
  | "customers"
  | "customer"
  | "tickets"
  | "machines"
  | "orders"
  | "tasks"
  | "reports"
  | "access"
  | "contract"
  | "contact";

export type Customer = {
  id: string;
  name: string;
  status: string;
  rank: string;
  contactName: string;
  phone: string;
  email: string;
  city: string;
  address: string;
  owner: string;
  monthlyKg: number;
  contractEnd: string;
  serviceLevel: string;
  branches: string[];
};

export type Machine = {
  id: string;
  accountId: string;
  site: string;
  model: string;
  serial: string;
  status: string;
  commercial: string;
  location: string;
  lastService: string;
  nextService: string;
};

export type Ticket = {
  id: string;
  accountId: string;
  site: string;
  machineId: string;
  type: string;
  urgency: string;
  status: string;
  description: string;
  contact: string;
  phone: string;
  assignedTo: string;
  openedAt: string;
  updatedAt: string;
  closedAt?: string;
  closeReason?: string;
};

export type Order = {
  id: string;
  accountId: string;
  month: string;
  defaultKg: number;
  requestedKg: number;
  approvedKg: number;
  status: string;
  blend: string;
  note: string;
};

export type Task = {
  id: string;
  accountId: string;
  title: string;
  type: string;
  dueDate: string;
  priority: string;
  status: string;
  assignedTo: string;
};

export type PlatformStore = {
  tickets: Ticket[];
  orders: Order[];
  tasks: Task[];
  machines: Machine[];
};

export type LeadPriority = "נמוכה" | "בינונית" | "גבוהה";

export type LeadStatus =
  | "לא טופל"
  | "בוצעה שיחה ראשונית"
  | "בהמתנה לפרטים"
  | "בהמתנה לקביעת פגישה"
  | "נקבעה פגישה"
  | "בהמתנה להצעת מחיר"
  | "נשלחה הצעת מחיר"
  | "לפנייה עתידית"
  | "נסגר"
  | "לא רלוונטי";

export type Lead = {
  id: string;
  company: string;
  employees: number;
  location: string;
  connection: string;
  contactName: string;
  contactRole: string;
  phone: string;
  email: string;
  owner: string;
  priority: LeadPriority;
  status: LeadStatus;
  followUpDate: string;
  hasContract: boolean;
  supplier: string;
  machineType: string;
  machineCount: number;
  monthlyConsumption: number;
  pricePerKg: number;
  notes: string;
  meetingDate: string;
  meetingTime: string;
  meetingLocation: string;
  quoteIds: string[];
  convertedAccountId?: string;
  legacyId?: string;
  createdAt: string;
  updatedAt: string;
};

export type QuoteStatus =
  | "טיוטה"
  | "בבדיקה"
  | "נשלחה"
  | "אושרה"
  | "נדחתה";

export type QuoteBlend = {
  name: string;
  quantityKg: number;
  costPerKg: number;
  pricePerKg: number;
};

export type QuoteEquipment = {
  model: string;
  quantity: number;
  unitCost: number;
  commercialModel: "ללא עלות" | "השכרה" | "מכירה";
  monthlyPrice: number;
};

export type Quote = {
  id: string;
  leadId?: string;
  accountId?: string;
  clientName: string;
  versionName: string;
  clientRank: string;
  status: QuoteStatus;
  employees: number;
  knownKg: number;
  requestedMachines: number;
  cupsPerEmployee: number;
  gramsPerCup: number;
  workDaysMonth: number;
  blends: QuoteBlend[];
  equipment: QuoteEquipment[];
  leaseMonths: number;
  saleMargin: number;
  extraMonthlyCost: number;
  owner: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
};

export type SalesWorkspace = {
  leads: Lead[];
  quotes: Quote[];
};

/**
 * This is the shared identity contract for the future unified platform.
 * A lead, quote, contract and service record should all point to this ID.
 */
export type AccountIdentity = {
  accountId: string;
  legacyLeadId?: string;
  legacyQuoteClientKey?: string;
  firebaseUid?: string;
};
