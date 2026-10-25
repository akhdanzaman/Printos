import React, { useState } from 'react';
import {
  CostCalculatorInput,
  CustomerOrder,
  FilamentSpool,
  FinancialCategory,
  FinancialRecord,
  ORDER_STAGES,
  OrderStage,
  Product,
} from '../types/printos';
import {
  calculateFinancialSummary,
  calculatePrintCost,
  calculateProductMargin,
  formatRupiah,
} from '../utils/calculations';
import {
  ArrowRight,
  Calculator,
  CheckCircle2,
  DollarSign,
  FolderKanban,
  Plus,
  ShoppingBag,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';

interface BusinessFinanceBoardProps {
  products: Product[];
  filaments: FilamentSpool[];
  orders: CustomerOrder[];
  financials: FinancialRecord[];
  onSaveOrder: (order: CustomerOrder) => void;
  onMoveOrderStage: (orderId: string, stage: OrderStage) => void;
  onDeleteOrder: (orderId: string) => void;
  onAddFinancialRecord: (record: FinancialRecord) => void;
  onDeleteFinancialRecord: (id: string) => void;
  onApplyCostToProduct: (productId: string, costRp: number, priceRp: number) => void;
}

export const BusinessFinanceBoard: React.FC<BusinessFinanceBoardProps> = ({
  products,
  filaments,
  orders,
  financials,
  onSaveOrder,
  onMoveOrderStage,
  onDeleteOrder,
  onAddFinancialRecord,
  onDeleteFinancialRecord,
  onApplyCostToProduct,
}) => {
  const [activeSection, setActiveSection] = useState<
    'overview' | 'calculator' | 'orders' | 'ledger'
  >('overview');

  // Cost & Margin Calculator State
  const [calcTargetProductId, setCalcTargetProductId] = useState<string>(
    products[0]?.id || ''
  );
  const [calcInput, setCalcInput] = useState<CostCalculatorInput>({
    spoolPriceRp: filaments[0]?.purchasePriceRp || 250000,
    spoolWeightGrams: filaments[0]?.initialWeightGrams || 1000,
    partWeightGrams: products[0]?.filamentGrams || 145,
    wastePercent: 12,
    printTimeHours: Math.round(((products[0]?.printTimeMinutes || 300) / 60) * 10) / 10,
    printerWatts: 140,
    electricityRateRpPerKwh: 1445, // Standard PLN R1 tariff Rp/kWh
    machineDepreciationRpPerHour: 2000,
    laborAndHardwareRp: 6500,
    packagingRp: 4500,
    targetMarginPercent: 65,
  });
  const [appliedBanner, setAppliedBanner] = useState<string>('');

  // Order Modal State
  const [editingOrder, setEditingOrder] = useState<CustomerOrder | null>(null);

  // Financial Ledger Modal State
  const [newRecordModal, setNewRecordModal] = useState<FinancialRecord | null>(null);

  const summary = calculateFinancialSummary(financials, orders, filaments);
  const calcResult = calculatePrintCost(calcInput);

  // Sort products by total revenue generated (unitsSold * sellingPriceRp)
  const productPerformance = [...products].sort(
    (a, b) => b.unitsSold * b.sellingPriceRp - a.unitsSold * a.sellingPriceRp
  );

  const handleLoadProductIntoCalculator = (prodId: string) => {
    setCalcTargetProductId(prodId);
    const prod = products.find((p) => p.id === prodId);
    if (!prod) return;
    const spool = filaments.find((f) => f.id === prod.filamentId);
    setCalcInput((prev) => ({
      ...prev,
      spoolPriceRp: spool?.purchasePriceRp || prev.spoolPriceRp,
      spoolWeightGrams: spool?.initialWeightGrams || 1000,
      partWeightGrams: prod.filamentGrams,
      printTimeHours: Math.round((prod.printTimeMinutes / 60) * 10) / 10,
    }));
  };

  const handleApplyCalculatedPricing = () => {
    if (!calcTargetProductId) return;
    onApplyCostToProduct(
      calcTargetProductId,
      calcResult.totalProductionCostRp,
      calcResult.recommendedSellingPriceRp
    );
    const prod = products.find((p) => p.id === calcTargetProductId);
    setAppliedBanner(
      `Updated "${prod?.name}" with Cost ${formatRupiah(
        calcResult.totalProductionCostRp
      )} & Selling Price ${formatRupiah(calcResult.recommendedSellingPriceRp)}.`
    );
    setTimeout(() => setAppliedBanner(''), 4000);
  };

  const handleOpenNewOrder = (defaultStage: OrderStage = 'New Order') => {
    const prod = products[0];
    setEditingOrder({
      id: `ord-${Date.now()}`,
      orderNumber: `ORD-2026-${100 + orders.length + 1}`,
      customerName: '',
      channel: 'Tokopedia',
      productId: prod?.id || 'prod-1',
      quantity: 1,
      totalAmountRp: prod?.sellingPriceRp || 150000,
      costAmountRp: prod?.productionCostRp || 50000,
      stage: defaultStage,
      dueDate: '2026-10-26',
      customerNotes: '',
      checklist: [
        { id: `oc-${Date.now()}-1`, text: 'Print & inspect parts', completed: false },
        { id: `oc-${Date.now()}-2`, text: 'Pack with bubble wrap & shipping label', completed: false },
      ],
    });
  };

  const handleOpenNewLedgerEntry = (type: 'Income' | 'Expense' = 'Income') => {
    setNewRecordModal({
      id: `fin-${Date.now()}`,
      date: '2026-10-23',
      title: '',
      type,
      category: type === 'Income' ? 'Sales Revenue' : 'Filament Purchase',
      amountRp: 250000,
      notes: '',
    });
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Top Financial KPIs in Indonesian Rupiah (Rp) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <div className="text-xs text-slate-500">Total Revenue (Rp)</div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatRupiah(summary.totalRevenueRp)}
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-500">
            Active pipeline: +{formatRupiah(summary.activeOrderRevenueRp)}
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <div className="text-xs text-slate-500">Operating Profit (Excl. CAPEX)</div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {formatRupiah(summary.operatingProfitRp)}
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-500">
            Filament & Ops Spend: {formatRupiah(summary.filamentSpendRp + summary.operationalSpendRp)}
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <div className="text-xs text-slate-500">Printer & Equipment CAPEX</div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {formatRupiah(summary.equipmentInvestmentRp)}
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-slate-500">
            Remaining to break-even:{' '}
            {formatRupiah(Math.max(0, summary.equipmentInvestmentRp - summary.operatingProfitRp))}
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Investment Recovery (ROI)</span>
            <span className="font-mono tabular-nums font-bold text-amber-600 dark:text-amber-400">
              {summary.investmentRecoveryPercent}%
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {summary.investmentRecoveryPercent}% Recovered
          </div>
          <div className="mt-2 w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all"
              style={{ width: `${summary.investmentRecoveryPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Sub-Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveSection('overview')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeSection === 'overview'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Charts & Sales
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('calculator')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeSection === 'calculator'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            Cost Calculator (Rp)
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('orders')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeSection === 'orders'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <FolderKanban className="w-3.5 h-3.5" />
            Orders Board ({orders.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('ledger')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeSection === 'ledger'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            Financial Ledger
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleOpenNewOrder('New Order')}
            className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            + New Order
          </button>
          <button
            type="button"
            onClick={() => handleOpenNewLedgerEntry('Income')}
            className="px-3.5 py-1.5 text-xs font-semibold bg-amber-100 hover:bg-amber-200/80 text-amber-950 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5 text-orange-600" />
            Record Sale / Expense
          </button>
        </div>
      </div>

      {/* SECTION 1: Financial Charts & Product Performance */}
      {activeSection === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left 6 cols: Spending, Revenue & ROI Visual Breakdown */}
          <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Revenue, Expenses & Equipment Recovery Breakdown
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                All figures in Indonesian Rupiah (Rp)
              </p>
            </div>

            <div className="space-y-4">
              {[
                {
                  label: 'Gross Sales Revenue (Settled)',
                  amount: summary.totalRevenueRp,
                  color: 'bg-emerald-500',
                  max: Math.max(summary.totalRevenueRp, summary.totalExpensesRp, 1),
                },
                {
                  label: 'Operating Profit (After Filament, Power & Packaging)',
                  amount: summary.operatingProfitRp,
                  color: 'bg-amber-500',
                  max: Math.max(summary.totalRevenueRp, summary.totalExpensesRp, 1),
                },
                {
                  label: 'Equipment & 3D Printer Investment (CAPEX)',
                  amount: summary.equipmentInvestmentRp,
                  color: 'bg-orange-500',
                  max: Math.max(summary.totalRevenueRp, summary.totalExpensesRp, 1),
                },
                {
                  label: 'Filament Spool Purchases',
                  amount: summary.filamentSpendRp,
                  color: 'bg-sky-500',
                  max: Math.max(summary.totalRevenueRp, summary.totalExpensesRp, 1),
                },
                {
                  label: 'Electricity, Nozzles, Packaging & Ads',
                  amount: summary.operationalSpendRp,
                  color: 'bg-purple-500',
                  max: Math.max(summary.totalRevenueRp, summary.totalExpensesRp, 1),
                },
              ].map((row) => {
                const widthPct = Math.min(
                  100,
                  Math.max(4, Math.round((Math.max(0, row.amount) / row.max) * 100))
                );
                return (
                  <div key={row.label} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-700 dark:text-slate-300 font-medium">
                        {row.label}
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                        {formatRupiah(row.amount)}
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${row.color} rounded-full transition-all`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="text-xs text-slate-500">
                Current Filament Stock Value:{' '}
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  {formatRupiah(summary.inventoryValueRp)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveSection('calculator')}
                className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
              >
                Open Cost Calculator
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Right 6 cols: Best Selling Products vs Products Needing Improvement */}
          <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Product Sales Performance & Margin Audit
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Identify top earners vs products that need pricing or print-time optimization
              </p>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {productPerformance.map((prod) => {
                const margin = calculateProductMargin(
                  prod.productionCostRp,
                  prod.sellingPriceRp
                );
                const totalRev = prod.unitsSold * prod.sellingPriceRp;
                const totalProfit = prod.unitsSold * margin.profitRp;
                const hourlyProfit =
                  prod.printTimeMinutes > 0
                    ? Math.round(margin.profitRp / (prod.printTimeMinutes / 60))
                    : 0;

                return (
                  <div
                    key={prod.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {prod.name}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                        <span>{prod.unitsSold} sold</span>
                        <span aria-hidden="true">·</span>
                        <span>Margin {margin.marginPercent}%</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatRupiah(hourlyProfit)}/print-hr</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            prod.unitsSold >= 20
                              ? 'text-emerald-600 dark:text-emerald-400 font-sans font-medium'
                              : prod.stage === 'Published' || prod.stage === 'Ready to Sell'
                              ? 'text-amber-600 dark:text-amber-400 font-sans font-medium'
                              : 'font-sans'
                          }
                        >
                          {prod.unitsSold >= 20
                            ? 'Best Seller'
                            : prod.unitsSold > 0
                            ? 'Growing'
                            : 'Pre-Launch / R&D'}
                        </span>
                      </div>
                    </div>

                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        Rev: {formatRupiah(totalRev)}
                      </div>
                      <div className="text-[11px] text-emerald-600 dark:text-emerald-400">
                        Profit: {formatRupiah(totalProfit)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: Interactive 3D Print Cost, Selling Price & Margin Calculator */}
      {activeSection === 'calculator' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-amber-500" />
                  3D Print Production Cost & Margin Calculator (Rp)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Calculate exact unit cost including purge/support waste, PLN electricity, machine wear, and hardware
                </p>
              </div>

              <select
                aria-label="Load preset from product catalog"
                value={calcTargetProductId}
                onChange={(e) => handleLoadProductIntoCalculator(e.target.value)}
                className="px-3 py-1.5 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-medium"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    Load Product: {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Filament Spool Price (Rp)
                </label>
                <input
                  type="number"
                  step={5000}
                  value={calcInput.spoolPriceRp}
                  onChange={(e) =>
                    setCalcInput({
                      ...calcInput,
                      spoolPriceRp: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Model + Support Weight (grams)
                </label>
                <input
                  type="number"
                  min={1}
                  value={calcInput.partWeightGrams}
                  onChange={(e) =>
                    setCalcInput({
                      ...calcInput,
                      partWeightGrams: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Purge / Poop / Failure Buffer (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={calcInput.wastePercent}
                  onChange={(e) =>
                    setCalcInput({
                      ...calcInput,
                      wastePercent: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Print Time (Hours)
                </label>
                <input
                  type="number"
                  step={0.5}
                  min={0.1}
                  value={calcInput.printTimeHours}
                  onChange={(e) =>
                    setCalcInput({
                      ...calcInput,
                      printTimeHours: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Printer Avg Power (Watts)
                </label>
                <input
                  type="number"
                  value={calcInput.printerWatts}
                  onChange={(e) =>
                    setCalcInput({
                      ...calcInput,
                      printerWatts: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Machine Depreciation & Maintenance (Rp/hr)
                </label>
                <input
                  type="number"
                  step={500}
                  value={calcInput.machineDepreciationRpPerHour}
                  onChange={(e) =>
                    setCalcInput({
                      ...calcInput,
                      machineDepreciationRpPerHour: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Post-Processing Labor & Brass Inserts/Magnets (Rp)
                </label>
                <input
                  type="number"
                  step={1000}
                  value={calcInput.laborAndHardwareRp}
                  onChange={(e) =>
                    setCalcInput({
                      ...calcInput,
                      laborAndHardwareRp: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Box, Bubble Wrap & Packaging (Rp)
                </label>
                <input
                  type="number"
                  step={500}
                  value={calcInput.packagingRp}
                  onChange={(e) =>
                    setCalcInput({
                      ...calcInput,
                      packagingRp: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                <span>Target Gross Profit Margin (%)</span>
                <span className="font-mono tabular-nums text-amber-600">
                  {calcInput.targetMarginPercent}%
                </span>
              </div>
              <input
                type="range"
                min={15}
                max={85}
                value={calcInput.targetMarginPercent}
                onChange={(e) =>
                  setCalcInput({
                    ...calcInput,
                    targetMarginPercent: Number(e.target.value),
                  })
                }
                className="w-full accent-amber-500"
              />
            </div>
          </div>

          {/* Right 5 cols: Live Calculated Output Card */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Unit Cost Breakdown & Recommended Price
            </h3>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono tabular-nums">
              <div className="py-2.5 flex justify-between">
                <span className="font-sans text-slate-500">
                  Effective Filament ({calcResult.effectiveWeightGrams}g @ {formatRupiah(calcResult.costPerGramRp)}/g)
                </span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {formatRupiah(calcResult.filamentCostRp)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="font-sans text-slate-500">
                  PLN Electricity ({calcInput.printTimeHours}h @ {calcInput.printerWatts}W)
                </span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {formatRupiah(calcResult.electricityCostRp)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="font-sans text-slate-500">
                  Printer Wear & Nozzle Amortization
                </span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {formatRupiah(calcResult.machineWearCostRp)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="font-sans text-slate-500">
                  Hardware, Assembly & Packaging
                </span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {formatRupiah(calcInput.laborAndHardwareRp + calcInput.packagingRp)}
                </span>
              </div>
              <div className="py-3 flex justify-between text-sm font-bold text-slate-900 dark:text-slate-100">
                <span className="font-sans">Total Production Cost (HPP)</span>
                <span>{formatRupiah(calcResult.totalProductionCostRp)}</span>
              </div>
            </div>

            <div className="p-4 bg-gradient-to-br from-amber-50 via-orange-50/70 to-emerald-50 border border-amber-200/80 dark:from-slate-800 dark:to-slate-800 rounded-xl space-y-1.5">
              <div className="text-xs font-medium text-amber-900/80 dark:text-slate-300">
                Recommended Selling Price ({calcResult.actualMarginPercent}% Margin)
              </div>
              <div className="text-2xl font-extrabold font-display tabular-nums text-orange-600 dark:text-amber-400">
                {formatRupiah(calcResult.recommendedSellingPriceRp)}
              </div>
              <div className="text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                Net Profit per Unit: {formatRupiah(calcResult.estimatedProfitRp)}
              </div>
            </div>

            {appliedBanner && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{appliedBanner}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleApplyCalculatedPricing}
              className="w-full py-2.5 px-4 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg transition-colors"
            >
              Apply Cost & Selling Price to Selected Product
            </button>
          </div>
        </div>
      )}

      {/* SECTION 3: Trello-Style Customer Order Tracking Board */}
      {activeSection === 'orders' && (
        <div className="flex gap-4 overflow-x-auto pb-4 items-start">
          {ORDER_STAGES.map((stage, idx) => {
            const stageOrders = orders.filter((o) => o.stage === stage);

            return (
              <div
                key={stage}
                className="w-76 shrink-0 bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3 flex flex-col"
              >
                <div className="flex items-center justify-between px-1 pb-3">
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {stage} ({stageOrders.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() => handleOpenNewOrder(stage)}
                    aria-label={`Add order to ${stage}`}
                    className="p-1 text-slate-500 hover:text-slate-900 rounded-md"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-3 min-h-[120px]">
                  {stageOrders.map((order) => {
                    const prod = products.find((p) => p.id === order.productId);
                    const netProfit = order.totalAmountRp - order.costAmountRp;

                    return (
                      <div
                        key={order.id}
                        className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-2"
                      >
                        <button
                          type="button"
                          onClick={() => setEditingOrder(order)}
                          className="w-full text-left block"
                        >
                          <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                            <span>{order.orderNumber}</span>
                            <span>{order.channel}</span>
                          </div>
                          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1">
                            {order.customerName}
                          </h4>
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                            {order.quantity}× {prod?.name || 'Custom Print'}
                          </p>
                          {order.customerNotes && (
                            <p className="text-xs text-slate-500 italic mt-1.5 line-clamp-2">
                              "{order.customerNotes}"
                            </p>
                          )}
                          <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-mono tabular-nums">
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                              {formatRupiah(order.totalAmountRp)}
                            </span>
                            <span className="text-emerald-600 dark:text-emerald-400">
                              +{formatRupiah(netProfit)}
                            </span>
                          </div>
                        </button>

                        {idx < ORDER_STAGES.length - 1 && (
                          <div className="pt-1 flex justify-end">
                            <button
                              type="button"
                              onClick={() =>
                                onMoveOrderStage(order.id, ORDER_STAGES[idx + 1])
                              }
                              className="px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 rounded flex items-center gap-1"
                            >
                              Move to {ORDER_STAGES[idx + 1]}
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* SECTION 4: Income & Expense Ledger Table */}
      {activeSection === 'ledger' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 bg-slate-50/70 dark:bg-slate-800/50">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-3">Description</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-4 text-right">Amount (Rp)</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {financials.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-500">
                      {rec.date}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {rec.title}
                      </div>
                      {rec.notes && (
                        <div className="text-xs text-slate-500">{rec.notes}</div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-xs text-slate-600 dark:text-slate-300">
                      {rec.category}
                    </td>
                    <td className="py-3 px-3 text-xs font-medium">
                      <span
                        className={
                          rec.type === 'Income'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-600 dark:text-slate-400'
                        }
                      >
                        {rec.type}
                      </span>
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono tabular-nums text-xs font-bold ${
                        rec.type === 'Income'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {rec.type === 'Income' ? '+' : '-'}
                      {formatRupiah(rec.amountRp)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onDeleteFinancialRecord(rec.id)}
                        aria-label={`Delete ${rec.title}`}
                        className="p-1 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Order Modal */}
      {editingOrder && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2
                id="order-modal-title"
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                Order {editingOrder.orderNumber}
              </h2>
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                aria-label="Close order modal"
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!editingOrder.customerName.trim()) return;
                onSaveOrder(editingOrder);
                setEditingOrder(null);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Customer Name & City *
                </label>
                <input
                  type="text"
                  required
                  value={editingOrder.customerName}
                  onChange={(e) =>
                    setEditingOrder({ ...editingOrder, customerName: e.target.value })
                  }
                  placeholder="e.g., Hendra Wijaya (Jakarta)"
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Product
                  </label>
                  <select
                    value={editingOrder.productId}
                    onChange={(e) => {
                      const prod = products.find((p) => p.id === e.target.value);
                      const qty = editingOrder.quantity;
                      setEditingOrder({
                        ...editingOrder,
                        productId: e.target.value,
                        totalAmountRp: (prod?.sellingPriceRp || 100000) * qty,
                        costAmountRp: (prod?.productionCostRp || 40000) * qty,
                      });
                    }}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({formatRupiah(p.sellingPriceRp)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Sales Channel
                  </label>
                  <select
                    value={editingOrder.channel}
                    onChange={(e) =>
                      setEditingOrder({
                        ...editingOrder,
                        channel: e.target.value as CustomerOrder['channel'],
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="Tokopedia">Tokopedia</option>
                    <option value="Shopee">Shopee</option>
                    <option value="Instagram">Instagram</option>
                    <option value="TikTok Shop">TikTok Shop</option>
                    <option value="Direct Custom">Direct Custom</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={editingOrder.quantity}
                    onChange={(e) => {
                      const qty = Math.max(1, Number(e.target.value) || 1);
                      const prod = products.find((p) => p.id === editingOrder.productId);
                      setEditingOrder({
                        ...editingOrder,
                        quantity: qty,
                        totalAmountRp: (prod?.sellingPriceRp || 100000) * qty,
                        costAmountRp: (prod?.productionCostRp || 40000) * qty,
                      });
                    }}
                    className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Total Price (Rp)
                  </label>
                  <input
                    type="number"
                    step={1000}
                    value={editingOrder.totalAmountRp}
                    onChange={(e) =>
                      setEditingOrder({
                        ...editingOrder,
                        totalAmountRp: Number(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Stage
                  </label>
                  <select
                    value={editingOrder.stage}
                    onChange={(e) =>
                      setEditingOrder({
                        ...editingOrder,
                        stage: e.target.value as OrderStage,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    {ORDER_STAGES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Customer Notes & Custom Color Requests
                </label>
                <textarea
                  rows={2}
                  value={editingOrder.customerNotes}
                  onChange={(e) =>
                    setEditingOrder({ ...editingOrder, customerNotes: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    onDeleteOrder(editingOrder.id);
                    setEditingOrder(null);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-red-600"
                >
                  Delete
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingOrder(null)}
                    className="px-4 py-1.5 text-xs font-medium text-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg"
                  >
                    Save Order
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Financial Record Modal */}
      {newRecordModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ledger-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2
                id="ledger-modal-title"
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                Record Financial Transaction (Rp)
              </h2>
              <button
                type="button"
                onClick={() => setNewRecordModal(null)}
                aria-label="Close transaction modal"
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newRecordModal.title.trim()) return;
                onAddFinancialRecord(newRecordModal);
                setNewRecordModal(null);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Description *
                </label>
                <input
                  type="text"
                  required
                  value={newRecordModal.title}
                  onChange={(e) =>
                    setNewRecordModal({ ...newRecordModal, title: e.target.value })
                  }
                  placeholder="e.g., 5 Spools eSUN PETG Black or Custom Batch Payout"
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Transaction Type
                  </label>
                  <select
                    value={newRecordModal.type}
                    onChange={(e) => {
                      const t = e.target.value as 'Income' | 'Expense';
                      setNewRecordModal({
                        ...newRecordModal,
                        type: t,
                        category:
                          t === 'Income' ? 'Sales Revenue' : 'Filament Purchase',
                      });
                    }}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="Income">Income (Revenue)</option>
                    <option value="Expense">Expense (Spending)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={newRecordModal.category}
                    onChange={(e) =>
                      setNewRecordModal({
                        ...newRecordModal,
                        category: e.target.value as FinancialCategory,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="Sales Revenue">Sales Revenue</option>
                    <option value="Filament Purchase">Filament Purchase</option>
                    <option value="Equipment & Printers">Equipment & Printers</option>
                    <option value="Spare Parts & Nozzle">Spare Parts & Nozzle</option>
                    <option value="Packaging & Shipping">Packaging & Shipping</option>
                    <option value="Electricity & Ops">Electricity & Ops</option>
                    <option value="Marketing & Ads">Marketing & Ads</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Amount in Rupiah (Rp)
                  </label>
                  <input
                    type="number"
                    step={5000}
                    required
                    value={newRecordModal.amountRp}
                    onChange={(e) =>
                      setNewRecordModal({
                        ...newRecordModal,
                        amountRp: Number(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={newRecordModal.date}
                    onChange={(e) =>
                      setNewRecordModal({ ...newRecordModal, date: e.target.value })
                    }
                    className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setNewRecordModal(null)}
                  className="px-4 py-1.5 text-xs font-medium text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg"
                >
                  Save Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
