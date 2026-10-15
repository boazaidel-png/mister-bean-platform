export type Role = "customer" | "multi" | "service" | "admin";

export type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  accountIds: string[];
  status: "active" | "pending" | "revoked";
  createdAt: string;
  adminApprovedBy?: string;
  adminApprovedAt?: string;
  revokedAt?: string;
  revokedBy?: string;
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
  | "contact"
  | "tastings"
  | "shop";

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
  serviceLevel?: string;
  branches: string[];
  contractBlends?: string[];
  deliveryDayOfMonth?: number;
  sourceLeadId?: string;
  sourceQuoteId?: string;
  conversionType?: "manual" | "approved-quote";
  createdAt?: string;
  contractStart?: string;
  onboardingStatus?: "טרם התחיל" | "בהקמה" | "מוכן להפעלה" | "הושלם";
  slaResponseHours?: number;
  slaResolutionHours?: number;
  notes?: CustomerNote[];
  profitabilityBlends?: ProfitabilityBlendPreset[];
  commercialAgreement?: CommercialAgreement;
  /**
   * The quote we currently work with for this customer, chosen on the card
   * from all the quotes built for it. The card's agreement and calculations
   * come from it. Without a choice, the latest approved quote is used.
   */
  activeQuoteId?: string;
  /** A trial customer: managed like any customer (orders, service, profitability) but clearly marked. */
  pilot?: boolean;
  pilotStartedAt?: string;
};

export type CommercialAgreementModel =
  | "beans_only"
  | "equipment_rental"
  | "equipment_sale"
  | "monthly_package"
  | "mixed";

export type CommercialAgreement = {
  model: CommercialAgreementModel;
  status: "draft" | "active";
  sourceQuoteId?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  monthlyBeanKg: number;
  beanCostPerKg: number;
  beanPricePerKg: number;
  packageCount: number;
  packageMonthlyFee: number;
  packageIncludedKgPerUnit: number;
  extraKgPrice: number;
  monthlyRentalIncome: number;
  monthlyServiceIncome: number;
  oneTimeEquipmentIncome: number;
  oneTimeEquipmentIncomeMonth?: string;
  updatedAt: string;
};

export type ProfitabilitySalesChannel = "contract" | "company_extra" | "employees" | "company";

export type ProfitabilityBlendPreset = {
  id: string;
  channel: ProfitabilitySalesChannel;
  name: string;
  costPerKg: number;
  pricePerKg: number;
  updatedAt: string;
};

export type ProfitabilitySaleLine = {
  id: string;
  channel: ProfitabilitySalesChannel;
  blendName: string;
  quantityKg: number;
  costPerKg: number;
  pricePerKg: number;
  includedInFixedRevenue?: boolean;
  deliveryStatus?: "ממתין להכנה" | "מוכן למשלוח" | "נשלח" | "סופק" | "בוטל";
  deliveredAt?: string;
  paid?: boolean;
  invoiceSent?: boolean;
  deliveryNoteSent?: boolean;
};

export type MonthlyProfitability = {
  id: string;
  accountId: string;
  month: string;
  sales: ProfitabilitySaleLine[];
  fixedRevenue: number;
  rentalRevenue: number;
  otherRevenue: number;
  serviceCost: number;
  deliveryCost: number;
  equipmentCost: number;
  otherCost: number;
  status: "draft" | "closed";
  /** One-off costs of this month, beyond what the approved quote plans. */
  extraCosts?: MonthlyExtraCost[];
  createdAt: string;
  updatedAt: string;
};

export type MonthlyExtraCost = { id: string; label: string; amount: number; createdAt: string };

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
  floor?: string;
  waterSystem?: "none" | "filter" | "osmosis" | "filter_and_osmosis";
  waterSystemInstalledAt?: string;
  lastFilterReplacementAt?: string;
  filterReplacementDue?: string;
  rentalStart?: string;
  rentalEnd?: string;
  monthlyRent?: number;
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

/** What the customer answered when opening a service call (see lib/ticket-intake.ts). */
export type TicketIntake = {
  safety: string;
  /** A danger sign or "not sure": handled as a safety case, not by remote guidance. */
  safetyReview: boolean;
  impact: string;
  startedWhen: string;
  /** Optional date and time the fault started. */
  startedAt?: string;
  screen: string;
  screenMessage?: string;
  recurrence: string;
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
  intake?: TicketIntake;
  attachments?: Array<{
    name: string;
    url?: string;
    storagePath?: string;
    type: string;
    uploadedAt: string;
  }>;
};

export type OrderKind = "contract" | "extra" | "company_extra" | "employees";

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
  deliveredAt?: string;
  paid?: boolean;
  invoiceSent?: boolean;
  deliveryNoteSent?: boolean;
  /** When the customer last confirmed or changed the order themselves. */
  customerConfirmedAt?: string;
  /**
   * contract: the month's order under the agreement (also when unset);
   * extra: a top-up the customer asked for; company_extra and employees:
   * sales the office enters.
   */
  kind?: OrderKind;
  /** Price and cost per kilogram fixed when the order was entered (not used for contract orders). */
  pricePerKg?: number;
  costPerKg?: number;
  /** For a top-up: when the customer wants it delivered. */
  deliveryPreference?: DeliveryPreference;
  /** For a top-up delivered on a chosen date (yyyy-mm-dd). */
  requestedDeliveryDate?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type DeliveryPreference = "asap" | "tomorrow" | "date";

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
  machineId?: string;
  automationKey?: string;
  autoGenerated?: boolean;
};

export type Activity = {
  id: string;
  accountId: string;
  entityType: "ticket" | "order" | "task" | "machine" | "customer" | "profitability";
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
  profitability: MonthlyProfitability[];
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
  | "פיילוט"
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
export type QuotePricingModel = "standard" | "monthly_package";
export type ConsumptionCertainty = "exact" | "estimated" | "unknown";
export type ClientPricingPreference =
  | "unknown"
  | "standard"
  | "monthly_package";

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
  consumptionCertainty?: ConsumptionCertainty;
  clientPricingPreference?: ClientPricingPreference;
  pricingModel?: QuotePricingModel;
  packageMonthlyFee?: number;
  packageCount?: number;
  packageIncludedKg?: number;
  packageExtraKgPrice?: number;
  packageServiceCost?: number;
  monthlyServiceCost?: number;
  blends: QuoteBlend[];
  equipment: QuoteEquipment[];
  autoSyncAccessories?: boolean;
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

export type TastingBlend = {
  id: string;
  name: string;
  arabicaPercent: number;
  profile: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type TastingSessionBlend = Pick<TastingBlend, "id" | "name" | "arabicaPercent" | "profile">;

export type TastingSessionStatus = "open" | "closed";

/** A tasting event at a customer. Blends are copied in, so later catalog edits never change past results. */
export type TastingSession = {
  id: string;
  accountId: string;
  customerName: string;
  title: string;
  status: TastingSessionStatus;
  blends: TastingSessionBlend[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  closedAt?: string;
};

/** One anonymous taster's answers. Ratings are 1 (not my cup of coffee) to 5 (hell yes), keyed by blend id. */
export type TastingResponse = {
  id: string;
  sessionId: string;
  ratings: Record<string, number>;
  favoriteBlendId: string;
  comment: string;
  createdAt: string;
};

/** A coffee product offered in an employee sale. Prices are per unit, in shekels, VAT included. */
export type ShopItem = {
  id: string;
  name: string;
  /** "תערובות" or "חד זני", for grouping on the order page. */
  group: string;
  unit: string;
  description: string;
  price: number;
  /** The regular store price, shown crossed out; 0 when there is none. */
  listPrice: number;
  /** Taste profile shown to employees. Optional: a coffee added by hand has none. */
  code?: string;
  color?: string;
  arabicaPercent?: number;
  /** 1 (light) to 5 (full); 0 when unknown. */
  body?: number;
  /** 1 (low) to 5 (high); 0 when unknown. */
  acidity?: number;
  tags?: string[];
  badge?: string;
  /** How the coffee is brewed at home; it is listed under each of these. */
  methods?: ShopMethod[];
};

export type ShopGrind = "beans" | "espresso" | "turkish" | "moka" | "filter";

export type ShopMethod = "auto" | "espresso" | "turkish" | "moka" | "filter";

export type ShopCampaignStatus = "open" | "closed";

/**
 * A coffee sale to the employees of one customer. Anyone with the link can
 * order while it is open and before closesAtMs (0 = no automatic close).
 * paymentUrl is an optional manual payment link (Bit, PayBox…) shown after ordering.
 */
export type ShopCampaign = {
  id: string;
  accountId: string;
  customerName: string;
  title: string;
  status: ShopCampaignStatus;
  items: ShopItem[];
  closesAtMs: number;
  note: string;
  paymentUrl: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  closedAt?: string;
};

export type ShopOrderStatus = "pending" | "paid" | "cancelled";

/**
 * One employee's order. Written by the buyer without signing in, so the
 * quantities are re-checked and the total re-priced from the campaign when read.
 * Payment fields are set only by staff (or, later, the payment provider).
 */
export type ShopOrder = {
  id: string;
  campaignId: string;
  fullName: string;
  email: string;
  phone: string;
  department: string;
  /** Units per item and grind, keyed "itemId~grind". */
  quantities: Record<string, number>;
  /** The total the buyer saw when ordering. */
  total: number;
  note: string;
  status: ShopOrderStatus;
  createdAt: string;
  paidAt?: string;
  paidAmount?: number;
  invoiceNumber?: string;
  /** Link to the invoice PDF in Rivhit. */
  invoiceUrl?: string;
  /** iCredit's private token for this order's payment page; set by the payments server. */
  paymentSaleToken?: string;
  /** iCredit's sale id once the order was paid online. */
  paymentRef?: string;
  updatedAt?: string;
  updatedBy?: string;
};
