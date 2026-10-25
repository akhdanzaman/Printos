import {
  ChecklistItem,
  CostCalculatorInput,
  CostCalculatorResult,
  CustomerOrder,
  FilamentSpool,
  FilamentStage,
  FinancialRecord,
  Product,
} from '../types/printos';

/**
 * Formats an integer amount in Indonesian Rupiah (Rp).
 * Example: 185000 -> "Rp 185.000"
 */
export function formatRupiah(amount: number, compact = false): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  const isNegative = safe < 0;
  const abs = Math.abs(safe);

  if (compact) {
    if (abs >= 1_000_000_000) {
      const val = (abs / 1_000_000_000).toFixed(1).replace(/\.0$/, '');
      return `${isNegative ? '-' : ''}Rp ${val} M`;
    }
    if (abs >= 1_000_000) {
      const val = (abs / 1_000_000).toFixed(1).replace(/\.0$/, '');
      return `${isNegative ? '-' : ''}Rp ${val} jt`;
    }
    if (abs >= 1_000) {
      const val = Math.round(abs / 1_000);
      return `${isNegative ? '-' : ''}Rp ${val} rb`;
    }
  }

  const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${isNegative ? '-' : ''}Rp ${formatted}`;
}

/**
 * Formats duration in minutes into "Xh Ym"
 */
export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hrs = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

/**
 * Calculates profit in Rp and profit margin percentage for a product.
 */
export function calculateProductMargin(
  productionCostRp: number,
  sellingPriceRp: number
): { profitRp: number; marginPercent: number; markupPercent: number } {
  const cost = Math.max(0, productionCostRp);
  const price = Math.max(0, sellingPriceRp);
  const profitRp = price - cost;
  const marginPercent = price > 0 ? Math.round((profitRp / price) * 100) : 0;
  const markupPercent = cost > 0 ? Math.round((profitRp / cost) * 100) : 0;
  return { profitRp, marginPercent, markupPercent };
}

/**
 * Calculates full 3D print production cost, recommended selling price (rounded to nearest Rp 1.000),
 * and net profit in Indonesian Rupiah.
 */
export function calculatePrintCost(input: CostCalculatorInput): CostCalculatorResult {
  const spoolWeight = Math.max(1, input.spoolWeightGrams);
  const costPerGramRp = input.spoolPriceRp / spoolWeight;
  const wasteMultiplier = 1 + Math.max(0, input.wastePercent) / 100;
  const effectiveWeightGrams = Math.round(input.partWeightGrams * wasteMultiplier * 10) / 10;

  const filamentCostRp = Math.round(effectiveWeightGrams * costPerGramRp);
  const kwhUsed = (Math.max(0, input.printerWatts) / 1000) * Math.max(0, input.printTimeHours);
  const electricityCostRp = Math.round(kwhUsed * Math.max(0, input.electricityRateRpPerKwh));
  const machineWearCostRp = Math.round(
    Math.max(0, input.printTimeHours) * Math.max(0, input.machineDepreciationRpPerHour)
  );

  const totalProductionCostRp =
    filamentCostRp +
    electricityCostRp +
    machineWearCostRp +
    Math.round(Math.max(0, input.laborAndHardwareRp)) +
    Math.round(Math.max(0, input.packagingRp));

  // Target margin % (where Margin = (Price - Cost) / Price, clamped between 5% and 90%)
  const clampedMargin = Math.min(90, Math.max(5, input.targetMarginPercent));
  const rawPrice = Math.round((totalProductionCostRp * 100) / (100 - clampedMargin));
  // Round to nearest Rp 1.000 for clean Indonesian pricing
  const recommendedSellingPriceRp = Math.max(
    1000,
    Math.ceil(rawPrice / 1000) * 1000
  );

  const estimatedProfitRp = recommendedSellingPriceRp - totalProductionCostRp;
  const actualMarginPercent =
    recommendedSellingPriceRp > 0
      ? Math.round((estimatedProfitRp / recommendedSellingPriceRp) * 100)
      : 0;

  return {
    costPerGramRp: Math.round(costPerGramRp),
    effectiveWeightGrams,
    filamentCostRp,
    electricityCostRp,
    machineWearCostRp,
    totalProductionCostRp,
    recommendedSellingPriceRp,
    estimatedProfitRp,
    actualMarginPercent,
  };
}

/**
 * Computes checklist completion stats
 */
export function getChecklistProgress(items: ChecklistItem[]): {
  completed: number;
  total: number;
  percent: number;
} {
  const total = items.length;
  if (total === 0) return { completed: 0, total: 0, percent: 0 };
  const completed = items.filter((item) => item.completed).length;
  const percent = Math.round((completed / total) * 100);
  return { completed, total, percent };
}

/**
 * Automatically determines filament spool stage based on remaining grams and printer assignment
 */
export function computeFilamentStage(
  remainingGrams: number,
  initialGrams: number,
  assignedPrinter?: string
): FilamentStage {
  if (remainingGrams <= 100) {
    return 'Reorder Needed';
  }
  if (remainingGrams <= Math.max(250, initialGrams * 0.25)) {
    return 'Low Stock';
  }
  if (assignedPrinter && assignedPrinter.trim().length > 0) {
    return 'Loaded in Printer';
  }
  return 'In Stock';
}

export interface FinancialSummary {
  totalRevenueRp: number;
  totalExpensesRp: number;
  equipmentInvestmentRp: number;
  filamentSpendRp: number;
  operationalSpendRp: number;
  netProfitRp: number;
  operatingProfitRp: number;
  investmentRecoveryPercent: number;
  activeOrderRevenueRp: number;
  inventoryValueRp: number;
}

/**
 * Aggregates business financial metrics in Indonesian Rupiah (Rp)
 */
export function calculateFinancialSummary(
  records: FinancialRecord[],
  orders: CustomerOrder[],
  filaments: FilamentSpool[]
): FinancialSummary {
  let ledgerIncome = 0;
  let equipmentInvestmentRp = 0;
  let filamentSpendRp = 0;
  let operationalSpendRp = 0;

  for (const rec of records) {
    if (rec.type === 'Income') {
      ledgerIncome += rec.amountRp;
    } else {
      if (rec.category === 'Equipment & Printers') {
        equipmentInvestmentRp += rec.amountRp;
      } else if (rec.category === 'Filament Purchase') {
        filamentSpendRp += rec.amountRp;
      } else {
        operationalSpendRp += rec.amountRp;
      }
    }
  }

  const completedOrderRevenue = orders
    .filter((o) => o.stage === 'Completed' || o.stage === 'Shipped')
    .reduce((acc, o) => acc + o.totalAmountRp, 0);

  const activeOrderRevenueRp = orders
    .filter((o) => o.stage !== 'Completed' && o.stage !== 'Shipped')
    .reduce((acc, o) => acc + o.totalAmountRp, 0);

  const totalRevenueRp = ledgerIncome + completedOrderRevenue;
  const totalExpensesRp = equipmentInvestmentRp + filamentSpendRp + operationalSpendRp;
  const operatingProfitRp = totalRevenueRp - (filamentSpendRp + operationalSpendRp);
  const netProfitRp = totalRevenueRp - totalExpensesRp;

  // Investment recovery measures how much of equipment CAPEX has been recovered by operating profit
  const investmentRecoveryPercent =
    equipmentInvestmentRp > 0
      ? Math.min(100, Math.max(0, Math.round((operatingProfitRp / equipmentInvestmentRp) * 100)))
      : 100;

  const inventoryValueRp = filaments.reduce((acc, spool) => {
    const ratio =
      spool.initialWeightGrams > 0
        ? Math.max(0, spool.remainingWeightGrams) / spool.initialWeightGrams
        : 0;
    return acc + Math.round(spool.purchasePriceRp * ratio);
  }, 0);

  return {
    totalRevenueRp,
    totalExpensesRp,
    equipmentInvestmentRp,
    filamentSpendRp,
    operationalSpendRp,
    netProfitRp,
    operatingProfitRp,
    investmentRecoveryPercent,
    activeOrderRevenueRp,
    inventoryValueRp,
  };
}

/**
 * Determines stock status label and semantic level for a product
 */
export function getProductStockStatus(stockQuantity: number): {
  quantity: number;
  label: string;
  level: 'in_stock' | 'low_stock' | 'out_of_stock';
} {
  const qty = Math.max(0, Math.round(stockQuantity || 0));
  if (qty === 0) {
    return { quantity: 0, label: 'Out of Stock (0 pcs)', level: 'out_of_stock' };
  }
  if (qty <= 3) {
    return { quantity: qty, label: `Low Stock (${qty} pcs)`, level: 'low_stock' };
  }
  return { quantity: qty, label: `In Stock (${qty} pcs)`, level: 'in_stock' };
}

/**
 * Filters products by search query, stage, filament material, and optional stock status
 */
export function filterProducts(
  products: Product[],
  query: string,
  stageFilter: string,
  materialFilter: string,
  stockFilter = 'All'
): Product[] {
  const q = query.trim().toLowerCase();
  return products.filter((p) => {
    if (stageFilter !== 'All' && p.stage !== stageFilter) return false;
    if (materialFilter !== 'All' && p.filamentMaterial !== materialFilter) return false;
    const qty = Math.max(0, p.stockQuantity ?? 0);
    if (stockFilter === 'In Stock' && qty <= 0) return false;
    if (stockFilter === 'Low Stock' && (qty <= 0 || qty > 3)) return false;
    if (stockFilter === 'Out of Stock' && qty !== 0) return false;
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.filamentMaterial.toLowerCase().includes(q) ||
      p.notes.toLowerCase().includes(q) ||
      p.colors.some((c) => c.toLowerCase().includes(q))
    );
  });
}

/**
 * Computes whole calendar days between two YYYY-MM-DD dates (end - start).
 */
export function diffDaysISO(startIso: string, endIso: string): number {
  const startMs = Date.parse(`${startIso}T00:00:00Z`);
  const endMs = Date.parse(`${endIso}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.round((endMs - startMs) / 86_400_000);
}

export type TaskScheduleStatus =
  | 'completed_early'
  | 'completed_on_time'
  | 'completed_late'
  | 'in_progress_on_track'
  | 'in_progress_delayed'
  | 'not_started';

export interface TaskTimelineMetrics {
  plannedStart: string;
  plannedEnd: string;
  plannedDurationDays: number;
  actualStart: string;
  actualEnd: string;
  effectiveActualEnd: string;
  actualDurationDays: number;
  varianceDays: number;
  status: TaskScheduleStatus;
  statusLabel: string;
}

/**
 * Computes Planned vs. Actual timeline metrics for a task in the Gantt chart and table views.
 */
export function calculateTaskTimelineMetrics(
  task: {
    stage: string;
    plannedStartDate?: string;
    dueDate: string;
    actualStartDate?: string;
    actualEndDate?: string;
  },
  referenceToday = '2026-10-23'
): TaskTimelineMetrics {
  const plannedEnd = task.dueDate || referenceToday;
  const rawPlannedStart = task.plannedStartDate?.trim() || plannedEnd;
  const plannedStart =
    diffDaysISO(rawPlannedStart, plannedEnd) >= 0 ? rawPlannedStart : plannedEnd;
  const plannedDurationDays = Math.max(1, diffDaysISO(plannedStart, plannedEnd) + 1);

  const actualStart = task.actualStartDate?.trim() || '';
  const actualEnd = task.actualEndDate?.trim() || '';
  const hasActualStart = actualStart.length > 0;
  const hasActualEnd = actualEnd.length > 0;

  const effectiveActualEnd = hasActualEnd
    ? actualEnd
    : hasActualStart
    ? diffDaysISO(actualStart, referenceToday) >= 0
      ? referenceToday
      : actualStart
    : '';

  const actualDurationDays = hasActualStart
    ? Math.max(1, diffDaysISO(actualStart, effectiveActualEnd) + 1)
    : 0;

  if (hasActualEnd || task.stage === 'Completed') {
    const finishIso = hasActualEnd ? actualEnd : referenceToday;
    const varianceDays = diffDaysISO(plannedEnd, finishIso);
    if (varianceDays < 0) {
      return {
        plannedStart,
        plannedEnd,
        plannedDurationDays,
        actualStart: actualStart || plannedStart,
        actualEnd: finishIso,
        effectiveActualEnd: finishIso,
        actualDurationDays: Math.max(
          1,
          diffDaysISO(actualStart || plannedStart, finishIso) + 1
        ),
        varianceDays,
        status: 'completed_early',
        statusLabel: `${Math.abs(varianceDays)}d Early`,
      };
    }
    if (varianceDays === 0) {
      return {
        plannedStart,
        plannedEnd,
        plannedDurationDays,
        actualStart: actualStart || plannedStart,
        actualEnd: finishIso,
        effectiveActualEnd: finishIso,
        actualDurationDays: Math.max(
          1,
          diffDaysISO(actualStart || plannedStart, finishIso) + 1
        ),
        varianceDays: 0,
        status: 'completed_on_time',
        statusLabel: 'On Time',
      };
    }
    return {
      plannedStart,
      plannedEnd,
      plannedDurationDays,
      actualStart: actualStart || plannedStart,
      actualEnd: finishIso,
      effectiveActualEnd: finishIso,
      actualDurationDays: Math.max(
        1,
        diffDaysISO(actualStart || plannedStart, finishIso) + 1
      ),
      varianceDays,
      status: 'completed_late',
      statusLabel: `+${varianceDays}d Delay`,
    };
  }

  if (hasActualStart || task.stage === 'In Progress' || task.stage === 'Review') {
    const varianceDays = diffDaysISO(plannedEnd, referenceToday);
    if (varianceDays > 0) {
      return {
        plannedStart,
        plannedEnd,
        plannedDurationDays,
        actualStart: actualStart || plannedStart,
        actualEnd: '',
        effectiveActualEnd: referenceToday,
        actualDurationDays: Math.max(
          1,
          diffDaysISO(actualStart || plannedStart, referenceToday) + 1
        ),
        varianceDays,
        status: 'in_progress_delayed',
        statusLabel: `Overdue +${varianceDays}d`,
      };
    }
    return {
      plannedStart,
      plannedEnd,
      plannedDurationDays,
      actualStart: actualStart || referenceToday,
      actualEnd: '',
      effectiveActualEnd:
        diffDaysISO(actualStart || referenceToday, referenceToday) >= 0
          ? referenceToday
          : actualStart || referenceToday,
      actualDurationDays: Math.max(
        1,
        diffDaysISO(
          actualStart || referenceToday,
          diffDaysISO(actualStart || referenceToday, referenceToday) >= 0
            ? referenceToday
            : actualStart || referenceToday
        ) + 1
      ),
      varianceDays,
      status: 'in_progress_on_track',
      statusLabel: 'In Progress',
    };
  }

  const overdueDiff = diffDaysISO(plannedEnd, referenceToday);
  if (overdueDiff > 0) {
    return {
      plannedStart,
      plannedEnd,
      plannedDurationDays,
      actualStart: '',
      actualEnd: '',
      effectiveActualEnd: '',
      actualDurationDays: 0,
      varianceDays: overdueDiff,
      status: 'in_progress_delayed',
      statusLabel: `Overdue +${overdueDiff}d`,
    };
  }

  return {
    plannedStart,
    plannedEnd,
    plannedDurationDays,
    actualStart: '',
    actualEnd: '',
    effectiveActualEnd: '',
    actualDurationDays: 0,
    varianceDays: 0,
    status: 'not_started',
    statusLabel: 'Scheduled',
  };
}

/**
 * Computes column start index (0-based) and span length for a date range across an ordered array of YYYY-MM-DD timeline days.
 */
export function computeGanttSpan(
  startIso: string,
  endIso: string,
  timelineDays: string[]
): { visible: boolean; startIndex: number; spanDays: number } {
  if (!startIso || !endIso || timelineDays.length === 0) {
    return { visible: false, startIndex: 0, spanDays: 0 };
  }
  const firstDay = timelineDays[0];
  const lastDay = timelineDays[timelineDays.length - 1];

  const normalizedEnd = diffDaysISO(startIso, endIso) >= 0 ? endIso : startIso;

  if (diffDaysISO(normalizedEnd, firstDay) > 0 || diffDaysISO(lastDay, startIso) > 0) {
    return { visible: false, startIndex: 0, spanDays: 0 };
  }

  const clampedStart = diffDaysISO(firstDay, startIso) < 0 ? firstDay : startIso;
  const clampedEnd = diffDaysISO(normalizedEnd, lastDay) < 0 ? lastDay : normalizedEnd;

  const startIndex = Math.max(0, diffDaysISO(firstDay, clampedStart));
  const endIndex = Math.min(
    timelineDays.length - 1,
    diffDaysISO(firstDay, clampedEnd)
  );
  const spanDays = Math.max(1, endIndex - startIndex + 1);

  return { visible: true, startIndex, spanDays };
}

export type GanttTimeScale = 'daily' | 'weekly' | 'monthly';

/**
 * Computes percentage left offset and width for a task bar within a date window [windowStartIso, windowEndIso].
 * Used to position Planned and Actual bars across Daily, Weekly, and Monthly Gantt scales.
 */
export function computeGanttRangePercent(
  startIso: string,
  endIso: string,
  windowStartIso: string,
  windowEndIso: string
): { visible: boolean; leftPercent: number; widthPercent: number; spanDays: number } {
  if (!startIso || !endIso || !windowStartIso || !windowEndIso) {
    return { visible: false, leftPercent: 0, widthPercent: 0, spanDays: 0 };
  }

  const totalWindowDays = Math.max(1, diffDaysISO(windowStartIso, windowEndIso) + 1);
  const normalizedEnd = diffDaysISO(startIso, endIso) >= 0 ? endIso : startIso;

  if (
    diffDaysISO(normalizedEnd, windowStartIso) > 0 ||
    diffDaysISO(windowEndIso, startIso) > 0
  ) {
    return { visible: false, leftPercent: 0, widthPercent: 0, spanDays: 0 };
  }

  const clampedStart =
    diffDaysISO(windowStartIso, startIso) < 0 ? windowStartIso : startIso;
  const clampedEnd =
    diffDaysISO(normalizedEnd, windowEndIso) < 0 ? windowEndIso : normalizedEnd;

  const offsetDays = Math.max(0, diffDaysISO(windowStartIso, clampedStart));
  const spanDays = Math.max(1, diffDaysISO(clampedStart, clampedEnd) + 1);

  const leftPercent = Math.round(((offsetDays / totalWindowDays) * 100) * 100) / 100;
  const widthPercent = Math.round(((spanDays / totalWindowDays) * 100) * 100) / 100;

  return {
    visible: true,
    leftPercent,
    widthPercent,
    spanDays,
  };
}

/**
 * Extracts a Google Spreadsheet ID from a shared Google Sheets URL or raw ID string.
 */
export function parseSpreadsheetIdFromUrl(input: string): string | null {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  if (/^[a-zA-Z0-9-_]{15,}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}



