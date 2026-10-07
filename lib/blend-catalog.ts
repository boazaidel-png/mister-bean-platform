import type { Customer, ProfitabilityBlendPreset, Quote } from "./platform-types";

/** House blends and what a kilogram costs us. Selling prices are per customer. */
export const BLEND_CATALOG = [
  { name: "EMERALD", cost: 50 },
  { name: "DX", cost: 60 },
  { name: "HB+", cost: 70 },
  { name: "TUSCANINI", cost: 70 },
  { name: "PEGANINI", cost: 70 },
  { name: "STRADIVARI", cost: 90 },
];

export type KnownBlend = { name: string; costPerKg: number; pricePerKg: number };

const blendKey = (name: string) => name.trim().toLowerCase();

/**
 * Every blend this customer can be sold, with the best known cost and price:
 * what was last entered for the customer, then the approved quote, then the
 * house catalog (cost only). Employee prices are kept apart because they differ.
 */
export function knownBlends(
  customer: Pick<Customer, "profitabilityBlends" | "contractBlends">,
  quote?: Pick<Quote, "blends">,
  channel: "company" | "employees" = "company",
): KnownBlend[] {
  const byName = new Map<string, KnownBlend>();
  const add = (name: string, costPerKg: number, pricePerKg: number) => {
    const key = blendKey(name);
    if (!key || key === blendKey("טרם הוגדרה תערובת")) return;
    const current = byName.get(key);
    byName.set(key, {
      name: current?.name || name.trim(),
      costPerKg: current?.costPerKg || costPerKg || 0,
      pricePerKg: current?.pricePerKg || pricePerKg || 0,
    });
  };
  const presets = [...(customer.profitabilityBlends || [])]
    .filter((item: ProfitabilityBlendPreset) =>
      channel === "employees" ? item.channel === "employees" : item.channel !== "employees")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  presets.forEach((item) => add(item.name, item.costPerKg, item.pricePerKg));
  (quote?.blends || []).forEach((item) => add(item.name, item.costPerKg, channel === "employees" ? 0 : item.pricePerKg));
  (customer.contractBlends || []).forEach((name) => add(name, 0, 0));
  BLEND_CATALOG.forEach((item) => add(item.name, item.cost, 0));
  return [...byName.values()];
}

export function findKnownBlend(blends: KnownBlend[], name: string) {
  return blends.find((item) => blendKey(item.name) === blendKey(name));
}
