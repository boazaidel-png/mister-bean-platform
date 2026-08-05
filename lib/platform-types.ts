export type Role = "customer" | "multi" | "service" | "admin";

export type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  accountIds: string[];
  status: "active" | "pending";
  createdAt: string;
  phone?: string;
  serviceRegion?: string;
  skills?: string[];
};

export type AccessInviteStatus = "ready" | "accepted" | "revoked";

export type AccessInvite = {
  email: string;
  accountId: string;
  customerName: string;
  role: "customer" | "multi";
  status: AccessInviteStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  sourceQuoteId?: string;
  acceptedAt?: string;
  acceptedByUid?: string;
};

export type CustomerConversionResult = {
  accountId: string;
  inviteEmail?: string;
  inviteStatus: "created" | "already-accepted" | "not-created";
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
  sourceLeadId?: string;
  sourceQuoteId?: string;
  conversionType?: "manual" | "approved-quote";
  createdAt?: string;
  contractStart?: string;
  onboardingStatus?: "טרם התחיל" | "בהקמה" | "מוכן להפעלה" | "הושלם";
  slaResponseHours?: number;
  slaResolutionHours?: number;
  notes?: CustomerNote[];
};

export type CustomerNote = {
  id: string;
  text: string;
  createdAt: string;
  createdBy: string;
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
  installedAt?: string;
  warrantyEnd?: string;
  updatedAt?: string;
};

export type TicketEvent = {
  id: string;
  type: "created" | "status" | "assignment" | "visit" | "note" | "closed";
  label: string;
  createdAt: string;
  createdBy: string;
  visibleToCustomer?: boolean;
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
  assignedUid?: string;
  responseDueAt?: string;
  resolutionDueAt?: string;
  firstResponseAt?: string;
  scheduledAt?: string;
  arrivedAt?: string;
  workStartedAt?: string;
  workSummary?: string;
  partsUsed?: string[];
  customerConfirmedBy?: string;
  customerConfirmedAt?: string;
  events?: TicketEvent[];
  attachments?: Array<{
    name: string;
    url: string;
    type: string;
    uploadedAt: string;
  }>;
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
  createdAt?: string;
  updatedAt?: string;
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
  assignedUid?: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
};

export type Activity = {
  id: string;
  accountId: string;
  entityType: "ticket" | "order" | "task" | "machine" | "customer";
  entityId: string;
  action: "created" | "updated" | "deleted";
  summary: string;
  actorUid: string;
  actorName: string;
  createdAt: string;
};

export type PlatformStore = {
  tickets: Ticket[];
  orders: Order[];
  tasks: Task[];
  machines: Machine[];
  activities: Activity[];
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

export type LeadStatusHistoryEntry = {
  from: string;
  to: string;
  changedAt: string;
  changedBy?: string;
};

export type LeadTask = {
  id: string;
  title: string;
  status: "פתוחה" | "בטיפול" | "נדחתה" | "בוצעה" | "בוטלה";
  priority: LeadPriority;
  owner: string;
  dueDate: string;
  dueTime: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

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
  currentStatus: string;
  nextAction: string;
  meetingDate: string;
  meetingTime: string;
  meetingLocation: string;
  meetingGuest: string;
  sheet: string;
  deleted: boolean;
  deletedAt?: string;
  statusChangedAt: string;
  statusHistory: LeadStatusHistoryEntry[];
  tasks: LeadTask[];
  lastUpdated: string;
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
  key?: string;
  model: string;
  quantity: number;
  unitCost: number;
  importer?: "tavor" | "ypeper" | string;
  capacityPerDay?: number;
  addonKeys?: string[];
  commercialModel: "ללא עלות" | "השכרה" | "מכירה";
  monthlyPrice: number;
};

export type QuoteAllocation = {
  key: string;
  free: number;
  lease: number;
  sale: number;
};

export type QuoteFinancingType = "none" | "loan" | "supplier";

export type Quote = {
  id: string;
  leadId?: string;
  accountId?: string;
  clientName: string;
  contactName?: string;
  contactRole?: string;
  phone?: string;
  email?: string;
  location?: string;
  supplier?: string;
  leadNotes?: string;
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
  equipmentCosts: Record<string, number>;
  allocation: QuoteAllocation[];
  supplierMonths: number;
  leaseMonths: number;
  manualLeasePerSet: number;
  saleMargin: number;
  clientCostMonths: number;
  extraMonthlyCost: number;
  clientPayTerm: number;
  importerPayTerm: number;
  coffeeSupplierPayTerm: number;
  cashflowMonths: number;
  financingMonths: number;
  financedAmount: number;
  annualInterest: number;
  financingType?: QuoteFinancingType;
  combineFinancingAndSupplier?: boolean;
  targetMonthlyProfit?: number;
  earlyExitMonth?: number;
  applyVolumeDiscount: boolean;
  owner: string;
  notes: string;
  clientKey?: string;
  savedAt?: string;
  legacyId?: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  accessInviteEmail?: string;
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
