import type { Customer, PlatformStore, SalesWorkspace, UserProfile } from "./platform-types";

export const BACKUP_SCHEMA_VERSION = 1;

export type BusinessBackup = {
  product: "mister-bean-platform";
  schemaVersion: number;
  exportedAt: string;
  customers: Customer[];
  users: UserProfile[];
  sales: SalesWorkspace;
  operations: PlatformStore;
};

export function createBusinessBackup(
  customers: Customer[],
  users: UserProfile[],
  sales: SalesWorkspace,
  store: PlatformStore,
  exportedAt = new Date().toISOString(),
): BusinessBackup {
  return {
    product: "mister-bean-platform",
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt,
    customers: structuredClone(customers),
    users: structuredClone(users),
    sales: structuredClone(sales),
    operations: {
      tickets: structuredClone(store.tickets),
      orders: structuredClone(store.orders),
      tasks: structuredClone(store.tasks),
      machines: structuredClone(store.machines),
      activities: structuredClone(store.activities),
      profitability: structuredClone(store.profitability),
    },
  };
}

export function parseBusinessBackup(value: string): BusinessBackup {
  const parsed = JSON.parse(value) as Partial<BusinessBackup>;
  if (
    parsed.product !== "mister-bean-platform" ||
    parsed.schemaVersion !== BACKUP_SCHEMA_VERSION ||
    !parsed.exportedAt ||
    !Array.isArray(parsed.customers) ||
    !Array.isArray(parsed.users) ||
    !Array.isArray(parsed.sales?.leads) ||
    !Array.isArray(parsed.sales?.quotes) ||
    !Array.isArray(parsed.operations?.tickets) ||
    !Array.isArray(parsed.operations?.orders) ||
    !Array.isArray(parsed.operations?.tasks) ||
    !Array.isArray(parsed.operations?.machines) ||
    !Array.isArray(parsed.operations?.activities)
  ) {
    throw new Error("קובץ הגיבוי אינו תקין או שאינו מתאים לגרסת המערכת.");
  }
  const backup = parsed as BusinessBackup;
  // Backups created before the profitability board did not include this list.
  // Treat them as an empty history so existing backups remain restorable.
  backup.operations.profitability = Array.isArray(parsed.operations?.profitability)
    ? parsed.operations.profitability
    : [];
  return backup;
}
