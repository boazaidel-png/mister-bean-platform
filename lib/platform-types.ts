export type Role = "customer" | "multi" | "service" | "admin";

export type View =
  | "dashboard"
  | "customers"
  | "customer"
  | "tickets"
  | "machines"
  | "orders"
  | "tasks"
  | "reports"
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
