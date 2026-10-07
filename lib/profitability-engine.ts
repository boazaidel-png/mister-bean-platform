import type { CommercialAgreement, MonthlyProfitability, Order, ProfitabilitySaleLine, ProfitabilitySalesChannel, Quote } from "./platform-types";

const amount = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;

export function calculateActualProfitability(record: MonthlyProfitability) {
  const sales = record.sales.map((line) => ({
    ...line,
    quantityKg: amount(line.quantityKg),
    costPerKg: amount(line.costPerKg),
    pricePerKg: amount(line.pricePerKg),
  }));
  const channel = (names: ProfitabilitySalesChannel[]) => {
    const rows = sales.filter((line) => names.includes(line.channel));
    const kg = rows.reduce((sum, line) => sum + line.quantityKg, 0);
    const revenue = rows.reduce(
      (sum, line) => sum + (line.includedInFixedRevenue ? 0 : line.quantityKg * line.pricePerKg),
      0,
    );
    const beanCost = rows.reduce((sum, line) => sum + line.quantityKg * line.costPerKg, 0);
    return { kg, revenue, beanCost, grossProfit: revenue - beanCost };
  };
  const contract = channel(["contract", "company"]);
  const companyExtra = channel(["company_extra"]);
  const company = {
    kg: contract.kg + companyExtra.kg,
    revenue: contract.revenue + companyExtra.revenue,
    beanCost: contract.beanCost + companyExtra.beanCost,
    grossProfit: contract.grossProfit + companyExtra.grossProfit,
  };
  const employees = channel(["employees"]);
  const variableRevenue = company.revenue + employees.revenue;
  const fixedRevenue = amount(record.fixedRevenue) + amount(record.rentalRevenue) + amount(record.otherRevenue);
  const revenue = variableRevenue + fixedRevenue;
  const beanCost = company.beanCost + employees.beanCost;
  const operatingCosts = amount(record.serviceCost) + amount(record.deliveryCost) + amount(record.equipmentCost) + amount(record.otherCost);
  const grossProfit = revenue - beanCost;
  const netProfit = grossProfit - operatingCosts;
  const totalKg = company.kg + employees.kg;
  return {
    contract,
    companyExtra,
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
  agreement?: CommercialAgreement,
): ProfitabilitySaleLine[] {
  // Sales follow actual consumption: the month's order is the only source of
  // contract kilograms. Without an order nothing was sold yet, so the quote's
  // or agreement's planned quantity is never counted. They only supply prices.
  const quantityKg = Math.max(0, order?.approvedKg || order?.requestedKg || order?.defaultKg || 0);
  if (!order || quantityKg <= 0) return [];
  const blends = (quote?.blends || []).filter((blend) => blend.name.trim());
  const matchingBlend = blends.find(
    (blend) => blend.name.trim().toLowerCase() === order.blend.trim().toLowerCase(),
  );
  const selected = matchingBlend || blends[0];
  if (!selected && !agreement) return [];
  const baseLines: ProfitabilitySaleLine[] = [{
    id: `contract-${order.id}`,
    channel: "contract",
    blendName: selected && !matchingBlend ? selected.name : order.blend || "פולים בחוזה",
    quantityKg,
    costPerKg: agreement?.beanCostPerKg || selected?.costPerKg || 0,
    pricePerKg: agreement?.beanPricePerKg || selected?.pricePerKg || 0,
  }];
  const isMonthlyPackage = agreement
    ? agreement.model === "monthly_package"
    : quote?.pricingModel === "monthly_package";
  if (!isMonthlyPackage) return baseLines;

  let remainingIncludedKg = agreement
    ? Math.max(0, agreement.packageCount * agreement.packageIncludedKgPerUnit)
    : Math.max(0, (quote?.packageCount || 1) * (quote?.packageIncludedKg || 0));
  return baseLines.flatMap((line) => {
    const contractKg = Math.min(line.quantityKg, remainingIncludedKg);
    const extraKg = line.quantityKg - contractKg;
    remainingIncludedKg -= contractKg;
    return [
      ...(contractKg > 0 ? [{
        ...line,
        quantityKg: contractKg,
        includedInFixedRevenue: true,
      }] : []),
      ...(extraKg > 0 ? [{
        ...line,
        id: `${line.id}-extra`,
        channel: "company_extra" as const,
        quantityKg: extraKg,
        pricePerKg: agreement?.extraKgPrice || quote?.packageExtraKgPrice || line.pricePerKg,
        includedInFixedRevenue: false,
      }] : []),
    ];
  });
}
