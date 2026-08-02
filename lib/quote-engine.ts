import type { Quote, QuoteAllocation, QuoteEquipment } from "./platform-types";

export type EquipmentCatalogItem = {
  key: string;
  label: string;
  cost: number;
  capacityPerDay: number;
  importer: "tavor" | "ypeper";
  addonKeys: string[];
};

export type AddonCatalogItem = {
  key: string;
  label: string;
  cost: number;
  importer: "tavor" | "ypeper";
};

export const importers = {
  tavor: "תבור סחר",
  ypeper: "י. פפר",
} as const;

export const equipmentCatalog: EquipmentCatalogItem[] = [
  { key: "c12", label: "DR. COFFEE C-12", cost: 3350, capacityPerDay: 70, importer: "tavor", addonKeys: ["fridge", "filter", "install"] },
  { key: "f15", label: "DR. COFFEE F-15", cost: 4090, capacityPerDay: 100, importer: "tavor", addonKeys: ["fridge", "filter", "install"] },
  { key: "break", label: "DR. COFFEE - COFFEE BREAK", cost: 5350, capacityPerDay: 100, importer: "tavor", addonKeys: ["fridge", "filter", "install"] },
  { key: "emini", label: "Emilio mini", cost: 800, capacityPerDay: 30, importer: "tavor", addonKeys: ["frother"] },
  { key: "emax", label: "Emilio MAX", cost: 1090, capacityPerDay: 30, importer: "tavor", addonKeys: ["frother"] },
  { key: "jura_w8", label: "Jura W8", cost: 5000, capacityPerDay: 80, importer: "ypeper", addonKeys: ["ypeper_fridge", "ypeper_filter"] },
  { key: "jura_x10", label: "Jura X10", cost: 6500, capacityPerDay: 120, importer: "ypeper", addonKeys: ["ypeper_fridge", "ypeper_filter"] },
  { key: "jura_e8", label: "Jura E8", cost: 4400, capacityPerDay: 40, importer: "ypeper", addonKeys: ["ypeper_fridge"] },
  { key: "jetinno_jl36", label: "JETINNO JL36", cost: 4500, capacityPerDay: 200, importer: "ypeper", addonKeys: ["ypeper_fridge", "ypeper_filter", "ypeper_install"] },
  { key: "jetinno_jl15", label: "JETINNO JL15", cost: 3500, capacityPerDay: 60, importer: "ypeper", addonKeys: ["ypeper_fridge", "ypeper_filter", "ypeper_install"] },
];

export const addonCatalog: AddonCatalogItem[] = [
  { key: "fridge", label: "מקרר חלב", cost: 591, importer: "tavor" },
  { key: "filter", label: "פילטר בריטה", cost: 350, importer: "tavor" },
  { key: "install", label: "התקנה", cost: 300, importer: "tavor" },
  { key: "frother", label: "מקציף חלב", cost: 129, importer: "tavor" },
  { key: "osmosis", label: "אוסמוזה", cost: 550, importer: "tavor" },
  { key: "ypeper_fridge", label: "מקרר חלב", cost: 530, importer: "ypeper" },
  { key: "ypeper_filter", label: "פילטר בריטה", cost: 350, importer: "ypeper" },
  { key: "ypeper_install", label: "התקנה", cost: 350, importer: "ypeper" },
];

const roundUp = (value: number) => Math.ceil(Number(value) || 0);
const positive = (value: number) => Math.max(0, Number(value) || 0);

export function recommendedConsumptionKg(
  quote: Pick<
    Quote,
    "employees" | "knownKg" | "cupsPerEmployee" | "gramsPerCup" | "workDaysMonth"
  >,
) {
  if (positive(quote.knownKg)) return positive(quote.knownKg);
  return roundUp(
    positive(quote.employees) *
      (positive(quote.cupsPerEmployee) || 1.5) *
      (positive(quote.workDaysMonth) || 21) *
      (positive(quote.gramsPerCup) || 12) /
      1000,
  );
}

export function equipmentTotalCost(equipment: QuoteEquipment[]) {
  return equipment.reduce(
    (sum, item) => sum + positive(item.quantity) * positive(item.unitCost),
    0,
  );
}

export function syncAutomaticAddons(equipment: QuoteEquipment[]) {
  const required = new Map<string, number>();
  const automaticKeys = new Set(
    equipmentCatalog.flatMap((item) => item.addonKeys),
  );

  for (const machine of equipmentCatalog) {
    const selected = equipment.find(
      (item) => (item.key || item.model) === machine.key,
    );
    const quantity = positive(selected?.quantity || 0);
    for (const addonKey of machine.addonKeys) {
      required.set(addonKey, (required.get(addonKey) || 0) + quantity);
    }
  }

  const next = equipment.map((item) => ({ ...item }));
  for (const addonKey of automaticKeys) {
    const addon = addonCatalog.find((item) => item.key === addonKey);
    if (!addon) continue;
    const quantity = required.get(addonKey) || 0;
    const index = next.findIndex(
      (item) => (item.key || item.model) === addonKey,
    );
    if (index >= 0) {
      next[index] = { ...next[index], quantity };
    } else if (quantity > 0) {
      next.push({
        key: addon.key,
        model: addon.label,
        quantity,
        unitCost: addon.cost,
        importer: addon.importer,
        commercialModel: "ללא עלות",
        monthlyPrice: 0,
      });
    }
  }
  return next;
}

export function normalizeAllocationForQuantity(
  allocation: QuoteAllocation | undefined,
  oldQuantity: number,
  newQuantity: number,
): QuoteAllocation {
  const quantity = positive(newQuantity);
  if (!allocation) {
    return { key: "", free: quantity, lease: 0, sale: 0 };
  }

  let free = positive(allocation.free);
  let lease = positive(allocation.lease);
  let sale = positive(allocation.sale);
  const total = free + lease + sale;
  const previous = positive(oldQuantity);

  if (!total) return { ...allocation, free: quantity, lease: 0, sale: 0 };
  if (total !== previous) return { ...allocation, free, lease, sale };
  if (free === previous) return { ...allocation, free: quantity, lease: 0, sale: 0 };
  if (lease === previous) return { ...allocation, free: 0, lease: quantity, sale: 0 };
  if (sale === previous) return { ...allocation, free: 0, lease: 0, sale: quantity };

  const difference = quantity - previous;
  if (difference >= 0) {
    free += difference;
  } else {
    let reduction = Math.abs(difference);
    const fromFree = Math.min(free, reduction);
    free -= fromFree;
    reduction -= fromFree;
    const fromLease = Math.min(lease, reduction);
    lease -= fromLease;
    reduction -= fromLease;
    sale = Math.max(0, sale - reduction);
  }
  return { ...allocation, free, lease, sale };
}

export function recommendedEquipment(dailyCups: number) {
  let best:
    | { f15: number; c12: number; emilio: number; capacity: number; cost: number; score: number }
    | undefined;
  const maxEmilio = dailyCups > 90 ? 0 : 10;
  for (let f15 = 0; f15 <= 10; f15 += 1) {
    for (let c12 = 0; c12 <= 10; c12 += 1) {
      for (let emilio = 0; emilio <= maxEmilio; emilio += 1) {
        const capacity = f15 * 100 + c12 * 70 + emilio * 30;
        if (capacity < dailyCups) continue;
        const cost =
          f15 * (4090 + 591 + 350 + 300) +
          c12 * (3350 + 591 + 350 + 300) +
          emilio * (1090 + 129);
        const count = f15 + c12 + emilio;
        const score = cost + (capacity - dailyCups) * 8 + count * 120;
        if (!best || score < best.score) {
          best = { f15, c12, emilio, capacity, cost, score };
        }
      }
    }
  }
  return best || { f15: 1, c12: 0, emilio: 0, capacity: 100, cost: 5331, score: 0 };
}

function allocationFor(quote: Quote, item: QuoteEquipment): QuoteAllocation {
  const key = item.key || item.model;
  const saved = quote.allocation.find((row) => row.key === key);
  if (saved) return saved;
  return {
    key,
    free: item.commercialModel === "ללא עלות" ? item.quantity : 0,
    lease: item.commercialModel === "השכרה" ? item.quantity : 0,
    sale: item.commercialModel === "מכירה" ? item.quantity : 0,
  };
}

function monthlyPayment(amount: number, months: number, annualInterest: number) {
  if (amount <= 0 || months <= 0) return 0;
  const rate = positive(annualInterest) / 100 / 12;
  if (!rate) return amount / months;
  return (
    (amount * rate * Math.pow(1 + rate, months)) /
    (Math.pow(1 + rate, months) - 1)
  );
}

function addFlow(values: number[], month: number, amount: number) {
  const index = Math.round(month);
  if (index >= 1 && index < values.length) values[index] += amount;
}

export function calculateQuote(quote: Quote) {
  const grams = positive(quote.gramsPerCup) || 12;
  const workDays = positive(quote.workDaysMonth) || 21;
  const cupsPerEmployee = positive(quote.cupsPerEmployee) || 1.5;
  const recommendedKg = roundUp(
    positive(quote.employees) * cupsPerEmployee * workDays * grams / 1000,
  );
  const consumptionKg = recommendedConsumptionKg(quote);
  const monthlyCups = consumptionKg * (1000 / grams);
  const dailyCups = monthlyCups / workDays;

  const totalKg = quote.blends.reduce(
    (sum, blend) => sum + positive(blend.quantityKg),
    0,
  );
  const excessKg = quote.applyVolumeDiscount
    ? Math.max(0, totalKg - 100)
    : 0;
  let beanIncome = 0;
  let beanCost = 0;
  for (const blend of quote.blends) {
    const quantity = positive(blend.quantityKg);
    const cost = positive(blend.costPerKg);
    const price = Math.max(positive(blend.pricePerKg), cost + 10);
    const discounted = totalKg ? excessKg * (quantity / totalKg) : 0;
    beanIncome += (quantity - discounted) * price + discounted * price * 0.9;
    beanCost += quantity * cost;
  }
  const beanProfit = beanIncome - beanCost;
  const averageBeanProfit = totalKg ? beanProfit / totalKg : 0;

  const equipmentTotal = equipmentTotalCost(quote.equipment);
  const allocations = quote.equipment
    .filter((item) => equipmentCatalog.some((catalog) => catalog.key === (item.key || item.model)))
    .map((item) => ({ item, allocation: allocationFor(quote, item) }));
  let leaseIncome = 0;
  let saleIncome = 0;
  let saleProfit = 0;
  let uncoveredCost = 0;
  for (const { item, allocation } of allocations) {
    const catalog = equipmentCatalog.find(
      (entry) => entry.key === (item.key || item.model),
    );
    const packageCost =
      positive(item.unitCost) +
      (item.addonKeys || catalog?.addonKeys || []).reduce((sum, addonKey) => {
        const selectedAddon = quote.equipment.find(
          (entry) => (entry.key || entry.model) === addonKey,
        );
        const defaultAddon = addonCatalog.find((entry) => entry.key === addonKey);
        return sum + positive(selectedAddon?.unitCost || defaultAddon?.cost || 0);
      }, 0);
    uncoveredCost += (allocation.free + allocation.lease) * packageCost;
    const leasePerSet =
      positive(quote.manualLeasePerSet) ||
      packageCost / Math.max(1, positive(quote.leaseMonths) || 24);
    leaseIncome += allocation.lease * leasePerSet;
    const salePrice = packageCost * (1 + positive(quote.saleMargin) / 100);
    saleIncome += allocation.sale * salePrice;
    saleProfit += allocation.sale * (salePrice - packageCost);
  }

  const supplierMonths = Math.max(1, positive(quote.supplierMonths) || 8);
  const financingMonths = positive(quote.financingMonths);
  const financedAmount = Math.min(
    positive(quote.financedAmount),
    uncoveredCost || equipmentTotal,
  );
  const financePayment = monthlyPayment(
    financedAmount,
    financingMonths,
    quote.annualInterest,
  );
  const unfinancedEquipment = Math.max(0, uncoveredCost - financedAmount);
  const supplierPayment = unfinancedEquipment / supplierMonths;
  const operatingProfit =
    beanProfit + leaseIncome - positive(quote.extraMonthlyCost);
  const monthlyBalance = operatingProfit - supplierPayment - financePayment;
  const totalFinancePaid = financePayment * financingMonths;
  const financingInterest = Math.max(0, totalFinancePaid - financedAmount);

  const activeMonths = Math.max(12, positive(quote.cashflowMonths) || 36);
  const tail = Math.max(
    positive(quote.clientPayTerm),
    positive(quote.importerPayTerm),
    positive(quote.coffeeSupplierPayTerm),
  );
  const displayMonths = activeMonths + tail;
  const clientIncome = Array(displayMonths + 1).fill(0);
  const importerPayments = Array(displayMonths + 1).fill(0);
  const coffeePayments = Array(displayMonths + 1).fill(0);
  const extraCosts = Array(displayMonths + 1).fill(0);
  const financeIn = Array(displayMonths + 1).fill(0);
  const financeOut = Array(displayMonths + 1).fill(0);
  for (let month = 1; month <= activeMonths; month += 1) {
    addFlow(
      clientIncome,
      month + positive(quote.clientPayTerm),
      beanIncome + leaseIncome,
    );
    addFlow(
      coffeePayments,
      month + positive(quote.coffeeSupplierPayTerm),
      beanCost,
    );
    addFlow(extraCosts, month, positive(quote.extraMonthlyCost));
    if (month <= supplierMonths) {
      addFlow(
        importerPayments,
        month + positive(quote.importerPayTerm),
        supplierPayment,
      );
    }
    if (month <= financingMonths) addFlow(financeOut, month, financePayment);
  }
  if (saleIncome) {
    addFlow(clientIncome, 1 + positive(quote.clientPayTerm), saleIncome);
  }
  if (financedAmount) addFlow(financeIn, 1, financedAmount);

  let cumulative = 0;
  let minimumCumulative = 0;
  let breakEvenMonth: number | null = null;
  const cashflow = Array.from({ length: displayMonths }, (_, index) => {
    const month = index + 1;
    const financing = financeIn[month] - financeOut[month];
    const net =
      clientIncome[month] +
      financing -
      importerPayments[month] -
      coffeePayments[month] -
      extraCosts[month];
    cumulative += net;
    minimumCumulative = Math.min(minimumCumulative, cumulative);
    if (breakEvenMonth === null && cumulative >= 0) breakEvenMonth = month;
    return {
      month,
      income: clientIncome[month],
      importer: importerPayments[month],
      coffee: coffeePayments[month],
      extra: extraCosts[month],
      financing,
      net,
      cumulative,
      isTail: month > activeMonths,
    };
  });

  const contractMonths = Math.max(1, positive(quote.clientCostMonths) || 36);
  const totalContractProfit =
    operatingProfit * contractMonths +
    saleProfit -
    uncoveredCost -
    financingInterest;
  const minimumKgToBreakEven =
    averageBeanProfit > 0
      ? Math.ceil(
          (positive(quote.extraMonthlyCost) + supplierPayment + financePayment) /
            averageBeanProfit,
        )
      : 0;
  const neededForTarget = Math.max(0, 500 - monthlyBalance);

  return {
    consumption: {
      recommendedKg,
      consumptionKg,
      monthlyCups,
      dailyCups,
    },
    beans: {
      totalKg,
      excessKg,
      income: beanIncome,
      cost: beanCost,
      profit: beanProfit,
      averageProfitPerKg: averageBeanProfit,
      costPerCup: totalKg ? beanIncome / (totalKg * (1000 / grams)) : 0,
    },
    equipment: {
      total: equipmentTotal,
      uncoveredCost,
      supplierPayment,
      leaseIncome,
      saleIncome,
      saleProfit,
    },
    financing: {
      amount: financedAmount,
      months: financingMonths,
      payment: financePayment,
      interest: financingInterest,
      unfinancedEquipment,
    },
    cashflow: {
      rows: cashflow,
      firstMonth: cashflow[0]?.net || 0,
      exposure: Math.abs(minimumCumulative),
      breakEvenMonth,
      endingBalance: cumulative,
    },
    profitability: {
      operatingProfit,
      monthlyBalance,
      totalContractProfit,
      minimumKgToBreakEven,
      targetBeanPriceIncrease:
        totalKg > 0 ? neededForTarget / totalKg : 0,
      targetLeaseIncrease:
        allocations.reduce((sum, row) => sum + row.allocation.lease, 0) > 0
          ? neededForTarget /
            allocations.reduce((sum, row) => sum + row.allocation.lease, 0)
          : 0,
    },
  };
}
