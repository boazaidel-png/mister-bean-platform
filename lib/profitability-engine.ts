import type { MonthlyProfitability, ProfitabilitySalesChannel } from "./platform-types";

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
    const revenue = rows.reduce((sum, line) => sum + line.quantityKg * line.pricePerKg, 0);
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
