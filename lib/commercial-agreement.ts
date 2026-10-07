import { calculateQuote } from "./quote-engine";
import type { CommercialAgreement, CommercialAgreementModel, Quote } from "./platform-types";

export const commercialAgreementLabel = (model: CommercialAgreementModel) => ({
  beans_only: "מכירת פולים בלבד",
  equipment_rental: "השכרת מכונות ופולים",
  equipment_sale: "מכירת מכונות ופולים",
  monthly_package: "חבילה חודשית — מכונה, שירות ופולים",
  mixed: "הסכם משולב",
})[model];

export function emptyCommercialAgreement(timestamp = new Date().toISOString()): CommercialAgreement {
  return {
    model: "beans_only",
    status: "draft",
    monthlyBeanKg: 0,
    beanCostPerKg: 0,
    beanPricePerKg: 0,
    packageCount: 1,
    packageMonthlyFee: 0,
    packageIncludedKgPerUnit: 0,
    extraKgPrice: 0,
    monthlyRentalIncome: 0,
    monthlyServiceIncome: 0,
    oneTimeEquipmentIncome: 0,
    updatedAt: timestamp,
  };
}

export function commercialAgreementFromQuote(quote: Quote): CommercialAgreement {
  const metrics = calculateQuote(quote);
  const monthlyBeanKg = quote.blends.reduce((sum, blend) => sum + Math.max(0, blend.quantityKg || 0), 0) || Math.max(0, quote.knownKg || 0);
  const beanIncome = quote.blends.reduce((sum, blend) => sum + Math.max(0, blend.quantityKg || 0) * Math.max(0, blend.pricePerKg || 0), 0);
  const beanCost = quote.blends.reduce((sum, blend) => sum + Math.max(0, blend.quantityKg || 0) * Math.max(0, blend.costPerKg || 0), 0);
  const beanPricePerKg = monthlyBeanKg > 0 ? beanIncome / monthlyBeanKg : 0;
  let model: CommercialAgreementModel = "beans_only";
  if (quote.pricingModel === "monthly_package") model = "monthly_package";
  else if (metrics.equipment.saleIncome > 0 && metrics.equipment.leaseIncome > 0) model = "mixed";
  else if (metrics.equipment.saleIncome > 0) model = "equipment_sale";
  else if (metrics.equipment.leaseIncome > 0) model = "equipment_rental";

  return {
    ...emptyCommercialAgreement(quote.updatedAt || new Date().toISOString()),
    model,
    status: quote.status === "אושרה" ? "active" : "draft",
    sourceQuoteId: quote.id,
    monthlyBeanKg,
    beanCostPerKg: Math.round(monthlyBeanKg > 0 ? beanCost / monthlyBeanKg : 0),
    beanPricePerKg: Math.round(beanPricePerKg),
    packageCount: Math.max(1, quote.packageCount || 1),
    packageMonthlyFee: Math.max(0, quote.packageMonthlyFee || 0),
    packageIncludedKgPerUnit: Math.max(0, quote.packageIncludedKg || 0),
    extraKgPrice: Math.max(0, quote.packageExtraKgPrice || 0),
    monthlyRentalIncome: Math.max(0, metrics.equipment.leaseIncome || 0),
    monthlyServiceIncome: 0,
    oneTimeEquipmentIncome: Math.max(0, metrics.equipment.saleIncome || 0),
    oneTimeEquipmentIncomeMonth: quote.approvedAt?.slice(0, 7),
    updatedAt: quote.updatedAt || new Date().toISOString(),
  };
}

export function commercialAgreementMonthlyIncome(agreement: CommercialAgreement, month: string) {
  const packageIncome = agreement.model === "monthly_package"
    ? agreement.packageCount * agreement.packageMonthlyFee
    : 0;
  const beanIncome = agreement.model === "monthly_package"
    ? 0
    : agreement.monthlyBeanKg * agreement.beanPricePerKg;
  const equipmentSaleIncome = agreement.oneTimeEquipmentIncomeMonth === month
    ? agreement.oneTimeEquipmentIncome
    : 0;
  return {
    packageIncome,
    beanIncome,
    rentalIncome: agreement.monthlyRentalIncome,
    serviceIncome: agreement.monthlyServiceIncome,
    equipmentSaleIncome,
    recurringIncome: packageIncome + beanIncome + agreement.monthlyRentalIncome + agreement.monthlyServiceIncome,
    totalIncome: packageIncome + beanIncome + agreement.monthlyRentalIncome + agreement.monthlyServiceIncome + equipmentSaleIncome,
  };
}
