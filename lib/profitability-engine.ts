import type { MonthlyProfitability, Order, ProfitabilitySaleLine, ProfitabilitySalesChannel, Quote } from "./platform-types";

const amount = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;

export function calculateActualProfitability(record: MonthlyProfitability) {
  const sales = record.sales.map((line) => ({
    ...line,
    quantityKg: amount(line.quantityKg),
    costPerKg: amount(line.costPerKg),
    pricePerKg: amount(line.pricePerKg),
  }));
  const channel = (name: ProfitabilitySalesChannel) => {
    const rows = sales.filter((line) => line.channel === name);
    const kg = rows.reduce((sum, line) => sum + line.quantityKg, 0);
    const revenue = rows.reduce(
      (sum, line) => sum + (line.includedInFixedRevenue ? 0 : line.quantityKg * line.pricePerKg),
      0,
    );
    const beanCost = rows.reduce((sum, line) => sum + line.quantityKg * line.costPerKg, 0);
    return { kg, revenue, beanCost, grossProfit: revenue - beanCost };
  };
  const company = channel("company");
  const employees = channel("employees");
  const variableRevenue = company.revenue + employees.revenue;
  const fixedRevenue = amount(record.fixedRevenue) + amount(record.rentalRevenue) + amount(record.otherRevenue);
  const revenue = variableRevenue + fixedRevenue;
  const beanCost = company.beanCost + employees.beanCost;
  const operatingCosts = amount(record.serviceCost) + amount(record.deliveryCost) + amount(record.equipmentCost) + amount(record.otherCost);
  const grossProfit = revenue - beanCost;
  const netProfit = grossProfit - operatingCosts;
  const totalKg = company.kg + employees.kg;
  return {
    company,
    employees,
    totalKg,
    variableRevenue,
    fixedRevenue,
    revenue,
    beanCost,
    grossProfit,
    operatingCosts,
    netProfit,
    marginPercent: revenue > 0 ? netProfit / revenue * 100 : 0,
    profitPerKg: totalKg > 0 ? netProfit / totalKg : 0,
  };
}

export function buildDefaultCompanySales(
  quote?: Quote,
  order?: Order,
): ProfitabilitySaleLine[] {
  if (!quote) return [];
  const includedInFixedRevenue = quote.pricingModel === "monthly_package";
  const blends = quote.blends.filter((blend) => blend.name.trim());
  if (order) {
    const matchingBlend = blends.find(
      (blend) => blend.name.trim().toLowerCase() === order.blend.trim().toLowerCase(),
    );
    const selected = matchingBlend || blends[0];
    const quantityKg = Math.max(0, order.approvedKg || order.requestedKg || order.defaultKg);
    if (!selected || quantityKg <= 0) return [];
    return [{
      id: `contract-${order.id}`,
      channel: "company",
      blendName: matchingBlend ? order.blend : selected.name,
      quantityKg,
      costPerKg: selected.costPerKg,
      pricePerKg: selected.pricePerKg,
      includedInFixedRevenue,
    }];
  }
  return blends.map((blend, index) => ({
    id: `contract-${quote.id}-${index + 1}`,
    channel: "company" as const,
    blendName: blend.name,
    quantityKg: Math.max(0, blend.quantityKg || (index === 0 ? quote.knownKg : 0)),
    costPerKg: blend.costPerKg,
    pricePerKg: blend.pricePerKg,
    includedInFixedRevenue,
  })).filter((line) => line.quantityKg > 0);
}
