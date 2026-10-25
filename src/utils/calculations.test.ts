import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRupiah,
  formatDuration,
  calculateProductMargin,
  calculatePrintCost,
  getChecklistProgress,
  computeFilamentStage,
  calculateFinancialSummary,
  filterProducts,
  getProductStockStatus,
  diffDaysISO,
  calculateTaskTimelineMetrics,
  computeGanttSpan,
  computeGanttRangePercent,
  parseSpreadsheetIdFromUrl,
} from './calculations';

test('formatRupiah formats standard and compact Indonesian Rupiah values cleanly', () => {
  assert.equal(formatRupiah(185000), 'Rp 185.000');
  assert.equal(formatRupiah(12500000), 'Rp 12.500.000');
  assert.equal(formatRupiah(12500000, true), 'Rp 12.5 jt');
  assert.equal(formatRupiah(250000, true), 'Rp 250 rb');
  assert.equal(formatRupiah(-45000), '-Rp 45.000');
});

test('formatDuration converts minutes to readable hours and minutes', () => {
  assert.equal(formatDuration(45), '45m');
  assert.equal(formatDuration(120), '2h');
  assert.equal(formatDuration(195), '3h 15m');
});

test('calculateProductMargin computes profit Rp, margin %, and markup %', () => {
  const result = calculateProductMargin(40000, 100000);
  assert.equal(result.profitRp, 60000);
  assert.equal(result.marginPercent, 60);
  assert.equal(result.markupPercent, 150);
});

test('calculatePrintCost computes accurate filament, electricity, wear, and recommended price', () => {
  const res = calculatePrintCost({
    spoolPriceRp: 250000,
    spoolWeightGrams: 1000,
    partWeightGrams: 100,
    wastePercent: 10, // 110g effective -> Rp 27.500 filament
    printTimeHours: 4,
    printerWatts: 150, // 0.6 kWh
    electricityRateRpPerKwh: 1500, // Rp 900 electricity
    machineDepreciationRpPerHour: 1500, // Rp 6.000 machine wear
    laborAndHardwareRp: 5600,
    packagingRp: 5000,
    targetMarginPercent: 55,
  });

  assert.equal(res.costPerGramRp, 250);
  assert.equal(res.effectiveWeightGrams, 110);
  assert.equal(res.filamentCostRp, 27500);
  assert.equal(res.electricityCostRp, 900);
  assert.equal(res.machineWearCostRp, 6000);
  assert.equal(res.totalProductionCostRp, 45000);
  assert.equal(res.recommendedSellingPriceRp, 100000);
  assert.equal(res.estimatedProfitRp, 55000);
  assert.equal(res.actualMarginPercent, 55);
});

test('getChecklistProgress calculates percentage properly', () => {
  const stats = getChecklistProgress([
    { id: '1', text: 'Step 1', completed: true },
    { id: '2', text: 'Step 2', completed: true },
    { id: '3', text: 'Step 3', completed: false },
    { id: '4', text: 'Step 4', completed: false },
  ]);
  assert.equal(stats.completed, 2);
  assert.equal(stats.total, 4);
  assert.equal(stats.percent, 50);
});

test('computeFilamentStage returns appropriate stage based on weight and assignment', () => {
  assert.equal(computeFilamentStage(80, 1000, 'Bambu P1S'), 'Reorder Needed');
  assert.equal(computeFilamentStage(210, 1000, 'Bambu P1S'), 'Low Stock');
  assert.equal(computeFilamentStage(750, 1000, 'Bambu P1S'), 'Loaded in Printer');
  assert.equal(computeFilamentStage(750, 1000, ''), 'In Stock');
});

test('calculateFinancialSummary aggregates revenue, CAPEX, OPEX, and ROI recovery', () => {
  const summary = calculateFinancialSummary(
    [
      {
        id: 'f1',
        date: '2026-10-01',
        title: 'Bambu Lab P1S Combo',
        type: 'Expense',
        category: 'Equipment & Printers',
        amountRp: 10000000,
        notes: '',
      },
      {
        id: 'f2',
        date: '2026-10-05',
        title: '10 Spools eSUN PLA+',
        type: 'Expense',
        category: 'Filament Purchase',
        amountRp: 2000000,
        notes: '',
      },
      {
        id: 'f3',
        date: '2026-10-10',
        title: 'Craft Fair Booth Sales',
        type: 'Income',
        category: 'Sales Revenue',
        amountRp: 6000000,
        notes: '',
      },
    ],
    [
      {
        id: 'o1',
        orderNumber: 'ORD-01',
        customerName: 'Budi',
        channel: 'Tokopedia',
        productId: 'p1',
        quantity: 2,
        totalAmountRp: 2000000,
        costAmountRp: 600000,
        stage: 'Completed',
        dueDate: '2026-10-15',
        customerNotes: '',
        checklist: [],
      },
    ],
    []
  );

  assert.equal(summary.totalRevenueRp, 8000000);
  assert.equal(summary.equipmentInvestmentRp, 10000000);
  assert.equal(summary.filamentSpendRp, 2000000);
  assert.equal(summary.operatingProfitRp, 6000000); // 8jt rev - 2jt filament
  assert.equal(summary.investmentRecoveryPercent, 60); // 6jt operating profit / 10jt equipment
});

test('filterProducts and getProductStockStatus filter and classify stock levels accurately', () => {
  assert.equal(getProductStockStatus(0).level, 'out_of_stock');
  assert.equal(getProductStockStatus(2).level, 'low_stock');
  assert.equal(getProductStockStatus(12).level, 'in_stock');

  const mockProducts = [
    {
      id: 'p1',
      name: 'Crystal Dragon',
      sku: 'DRG-01',
      stage: 'Published' as const,
      category: 'Art Toys',
      dimensions: '420x80x45mm',
      colors: ['Silk Gold'],
      filamentId: 's1',
      filamentMaterial: 'Silk PLA',
      filamentGrams: 140,
      printTimeMinutes: 320,
      productionCostRp: 45000,
      sellingPriceRp: 145000,
      stockQuantity: 11,
      unitsSold: 24,
      stlFileName: 'dragon.3mf',
      stlFileSize: '18.4 MB',
      artworkPreset: 'dragon' as const,
      notes: '',
      checklist: [],
      updatedAt: '2026-10-20',
    },
    {
      id: 'p2',
      name: 'Voron Duct',
      sku: 'VRN-02',
      stage: 'Prototype' as const,
      category: 'Functional Parts',
      dimensions: '85x60x55mm',
      colors: ['Carbon Black'],
      filamentId: 's2',
      filamentMaterial: 'ASA',
      filamentGrams: 48,
      printTimeMinutes: 95,
      productionCostRp: 28000,
      sellingPriceRp: 95000,
      stockQuantity: 2,
      unitsSold: 0,
      stlFileName: 'duct.stl',
      stlFileSize: '4.1 MB',
      artworkPreset: 'voron' as const,
      notes: '',
      checklist: [],
      updatedAt: '2026-10-21',
    },
  ];

  assert.equal(filterProducts(mockProducts, 'dragon', 'All', 'All').length, 1);
  assert.equal(filterProducts(mockProducts, '', 'Prototype', 'All').length, 1);
  assert.equal(filterProducts(mockProducts, '', 'All', 'ASA').length, 1);
  assert.equal(filterProducts(mockProducts, '', 'All', 'All', 'Low Stock').length, 1);
  assert.equal(filterProducts(mockProducts, '', 'All', 'All', 'Out of Stock').length, 0);
  assert.equal(filterProducts(mockProducts, 'nonexistent', 'All', 'All').length, 0);
});

test('calculateTaskTimelineMetrics and computeGanttSpan compute planned vs actual schedules accurately', () => {
  assert.equal(diffDaysISO('2026-10-19', '2026-10-21'), 2);

  // Completed 1 day early
  const earlyMetrics = calculateTaskTimelineMetrics(
    {
      stage: 'Completed',
      plannedStartDate: '2026-10-19',
      dueDate: '2026-10-21',
      actualStartDate: '2026-10-19',
      actualEndDate: '2026-10-20',
    },
    '2026-10-23'
  );
  assert.equal(earlyMetrics.plannedDurationDays, 3);
  assert.equal(earlyMetrics.actualDurationDays, 2);
  assert.equal(earlyMetrics.status, 'completed_early');
  assert.equal(earlyMetrics.statusLabel, '1d Early');

  // Completed 1 day late
  const lateMetrics = calculateTaskTimelineMetrics(
    {
      stage: 'Completed',
      plannedStartDate: '2026-10-20',
      dueDate: '2026-10-21',
      actualStartDate: '2026-10-20',
      actualEndDate: '2026-10-22',
    },
    '2026-10-23'
  );
  assert.equal(lateMetrics.status, 'completed_late');
  assert.equal(lateMetrics.statusLabel, '+1d Delay');

  // Active in progress
  const activeMetrics = calculateTaskTimelineMetrics(
    {
      stage: 'In Progress',
      plannedStartDate: '2026-10-21',
      dueDate: '2026-10-24',
      actualStartDate: '2026-10-22',
      actualEndDate: '',
    },
    '2026-10-23'
  );
  assert.equal(activeMetrics.status, 'in_progress_on_track');
  assert.equal(activeMetrics.effectiveActualEnd, '2026-10-23');
  assert.equal(activeMetrics.actualDurationDays, 2);

  const days = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'];
  const span = computeGanttSpan('2026-10-20', '2026-10-22', days);
  assert.equal(span.visible, true);
  assert.equal(span.startIndex, 1);
  assert.equal(span.spanDays, 3);

  // Percentage calculation across a 10-day window (2026-10-19 to 2026-10-28)
  const pct = computeGanttRangePercent('2026-10-19', '2026-10-20', '2026-10-19', '2026-10-28');
  assert.equal(pct.visible, true);
  assert.equal(pct.leftPercent, 0);
  assert.equal(pct.widthPercent, 20);
});

test('parseSpreadsheetIdFromUrl extracts spreadsheet IDs from shared links and raw IDs', () => {
  assert.equal(
    parseSpreadsheetIdFromUrl(
      'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?usp=sharing'
    ),
    '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
  );
  assert.equal(
    parseSpreadsheetIdFromUrl('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'),
    '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
  );
  assert.equal(parseSpreadsheetIdFromUrl(''), null);
});



