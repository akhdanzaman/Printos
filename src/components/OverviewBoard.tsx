import React from 'react';
import {
  ActiveBoardId,
  CustomerOrder,
  FilamentSpool,
  FinancialRecord,
  PrinterMachine,
  PrintJob,
  Product,
  PRODUCT_STAGES,
  TaskItem,
} from '../types/printos';
import {
  calculateFinancialSummary,
  calculateProductMargin,
  formatDuration,
  formatRupiah,
  getChecklistProgress,
} from '../utils/calculations';
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  Layers,
  Package,
  Plus,
  Printer,
  TrendingUp,
  Wrench,
} from 'lucide-react';
import { ProductArtwork } from './ProductArtwork';

interface OverviewBoardProps {
  products: Product[];
  tasks: TaskItem[];
  filaments: FilamentSpool[];
  printJobs: PrintJob[];
  printers: PrinterMachine[];
  orders: CustomerOrder[];
  financials: FinancialRecord[];
  onNavigate: (board: ActiveBoardId) => void;
  onToggleTaskStage: (taskId: string) => void;
  onSelectProduct: (product: Product) => void;
  onQuickAddProduct: () => void;
  onQuickAddTask: () => void;
}

export const OverviewBoard: React.FC<OverviewBoardProps> = ({
  products,
  tasks,
  filaments,
  printJobs,
  printers,
  orders,
  financials,
  onNavigate,
  onToggleTaskStage,
  onSelectProduct,
  onQuickAddProduct,
  onQuickAddTask,
}) => {
  const finSummary = calculateFinancialSummary(financials, orders, filaments);

  const todayTasks = tasks.filter(
    (t) => t.stage === 'Today' || t.stage === 'In Progress' || t.priority === 'Urgent'
  );
  const completedTasksCount = tasks.filter((t) => t.stage === 'Completed').length;
  const weeklyTaskPercent =
    tasks.length > 0 ? Math.round((completedTasksCount / tasks.length) * 100) : 0;

  const unfinishedProducts = products.filter((p) => p.stage !== 'Published');
  const publishedProducts = products.filter((p) => p.stage === 'Published');
  const activePrintJobs = printJobs.filter(
    (j) => j.stage === 'Printing' || j.stage === 'Queued' || j.stage === 'Post-Processing'
  );
  const lowSpools = filaments.filter(
    (f) => f.stage === 'Low Stock' || f.stage === 'Reorder Needed'
  );

  // Connected smart action suggestions derived from live workspace state
  const nextSteps: { id: string; title: string; detail: string; targetBoard: ActiveBoardId; actionLabel: string }[] = [];

  if (lowSpools.length > 0) {
    nextSteps.push({
      id: 'ns-spool',
      title: `Restock ${lowSpools.length} low filament spool${lowSpools.length > 1 ? 's' : ''}`,
      detail: `${lowSpools.map((s) => `${s.brand} ${s.colorName} (${s.remainingWeightGrams}g)`).join(', ')} below threshold.`,
      targetBoard: 'inventory',
      actionLabel: 'Open Inventory',
    });
  }

  const readyToSell = products.filter((p) => p.stage === 'Ready to Sell');
  if (readyToSell.length > 0) {
    nextSteps.push({
      id: 'ns-publish',
      title: `Publish "${readyToSell[0].name}" to marketplace`,
      detail: `Currently in Ready to Sell stage with ${formatRupiah(readyToSell[0].sellingPriceRp)} retail price.`,
      targetBoard: 'catalog',
      actionLabel: 'Review Catalog',
    });
  }

  const failedJobs = printJobs.filter((j) => j.stage === 'Failed / Reprint');
  if (failedJobs.length > 0) {
    nextSteps.push({
      id: 'ns-failed',
      title: `Resolve ${failedJobs.length} failed print job`,
      detail: failedJobs[0].failureReason || failedJobs[0].jobTitle,
      targetBoard: 'production',
      actionLabel: 'Inspect Queue',
    });
  }

  return (
    <div className="space-y-8 pb-10">
      {/* Top Executive Summary Strip */}
      <section aria-label="Business & Production Pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Total Revenue (Settled)</span>
              <button
                type="button"
                onClick={() => onNavigate('business')}
                className="text-amber-600 dark:text-amber-400 hover:underline font-medium"
              >
                Ledger →
              </button>
            </div>
            <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {formatRupiah(finSummary.totalRevenueRp)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              Operating profit: {formatRupiah(finSummary.operatingProfitRp)} · ROI {finSummary.investmentRecoveryPercent}%
            </p>
          </div>

          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Product Pipeline & Stock</span>
              <button
                type="button"
                onClick={() => onNavigate('catalog')}
                className="text-amber-600 dark:text-amber-400 hover:underline font-medium"
              >
                Catalog →
              </button>
            </div>
            <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {publishedProducts.length} Published · {unfinishedProducts.length} Active
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {products.reduce((acc, p) => acc + Math.max(0, p.stockQuantity ?? 0), 0)} units in stock · {products.length} total SKUs
            </p>
          </div>

          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Active Print Queue</span>
              <button
                type="button"
                onClick={() => onNavigate('production')}
                className="text-amber-600 dark:text-amber-400 hover:underline font-medium"
              >
                Fleet →
              </button>
            </div>
            <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {activePrintJobs.length} Jobs · {printers.filter((p) => p.status === 'Printing').length}/{printers.length} Printers
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              Est. queue time: {formatDuration(activePrintJobs.reduce((acc, j) => acc + j.printTimeMinutes, 0))}
            </p>
          </div>

          <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Weekly Progress & Stock</span>
              <button
                type="button"
                onClick={() => onNavigate('inventory')}
                className="text-amber-600 dark:text-amber-400 hover:underline font-medium"
              >
                Spools →
              </button>
            </div>
            <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {weeklyTaskPercent}% Tasks Done
            </p>
            <div className="mt-2 w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all"
                style={{ width: `${weeklyTaskPercent}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Main Two-Column Connected Command Center */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Columns: Unfinished Products Pipeline + What to Work on Next */}
        <div className="lg:col-span-7 space-y-6">
          {/* Unfinished Products Pipeline */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Package className="w-4 h-4 text-amber-500" />
                  Products in Development Pipeline
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Idea → Modeling → Prototype → Testing → Finalizing → Ready to Sell
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onQuickAddProduct}
                  className="px-3 py-1.5 text-xs font-semibold bg-amber-100 hover:bg-amber-200/80 text-amber-950 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5 text-orange-600" />
                  Add Product
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('catalog')}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Open Board
                </button>
              </div>
            </div>

            {/* Stage Distribution Bar */}
            <div className="grid grid-cols-7 gap-1.5 my-4">
              {PRODUCT_STAGES.map((stage) => {
                const count = products.filter((p) => p.stage === stage).length;
                return (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => onNavigate('catalog')}
                    className="text-left p-2 rounded-lg bg-orange-50/60 dark:bg-slate-800/60 hover:bg-orange-100/70 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="text-xs font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                      {count}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {stage}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Unfinished Product Cards List */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {unfinishedProducts.map((product) => {
                const check = getChecklistProgress(product.checklist);
                const margin = calculateProductMargin(
                  product.productionCostRp,
                  product.sellingPriceRp
                );
                return (
                  <div
                    key={product.id}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 px-2 -mx-2 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-14 h-11 rounded-lg overflow-hidden shrink-0">
                        <ProductArtwork product={product} className="w-14 h-11" compact />
                      </div>
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onSelectProduct(product)}
                          className="text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-amber-600 dark:hover:text-amber-400 text-left truncate block"
                        >
                          {product.name}
                        </button>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          <span className="font-medium text-amber-600 dark:text-amber-400">
                            {product.stage}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{product.filamentMaterial}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums font-medium text-slate-700 dark:text-slate-300">
                            Stock: {product.stockQuantity ?? 0} pcs
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {formatDuration(product.printTimeMinutes)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                             Checklist {check.completed}/{check.total}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                      <div className="text-right">
                        <div className="text-xs font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                          {formatRupiah(product.sellingPriceRp)}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                          +{margin.marginPercent}% margin
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onSelectProduct(product)}
                        aria-label={`Inspect ${product.name}`}
                        className="px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        Edit Card
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Smart Connected Actions & Bottlenecks */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-amber-500" />
                Recommended Next Actions
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Synced with Inventory, Queue & Catalog
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-2">
              {nextSteps.map((step) => (
                <div
                  key={step.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {step.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {step.detail}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate(step.targetBoard)}
                    className="px-3 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg transition-colors flex items-center gap-1 self-start sm:self-center whitespace-nowrap shrink-0"
                  >
                    {step.actionLabel}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right 5 Columns: Tasks for Today & Active Printer Fleet */}
        <div className="lg:col-span-5 space-y-6">
          {/* Today's Tasks & Upcoming Deadlines */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  Today's Priority Tasks & Deadlines
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Click any checkbox to mark task completed
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onQuickAddTask}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-amber-100 hover:bg-amber-200/80 text-amber-950 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  + New Task
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('tasks')}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  All Tasks
                </button>
              </div>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-2">
              {todayTasks.map((task) => {
                const isDone = task.stage === 'Completed';
                const linkedProduct = products.find((p) => p.id === task.linkedProductId);
                const progress = getChecklistProgress(task.checklist);

                return (
                  <div key={task.id} className="py-3 flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => onToggleTaskStage(task.id)}
                      aria-label={`Mark "${task.title}" as ${isDone ? 'Today' : 'Completed'}`}
                      className="mt-0.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors shrink-0"
                    >
                      {isDone ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Circle className="w-4 h-4" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm font-medium ${
                          isDone
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {task.title}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-1">
                        <span
                          className={
                            task.priority === 'Urgent'
                              ? 'text-red-600 dark:text-red-400 font-semibold'
                              : task.priority === 'High'
                              ? 'text-amber-600 dark:text-amber-400 font-medium'
                              : ''
                          }
                        >
                          {task.priority} Priority
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">Due {task.dueDate}</span>
                        {progress.total > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {progress.completed}/{progress.total} steps
                            </span>
                          </>
                        )}
                        {linkedProduct && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-slate-700 dark:text-slate-300 truncate max-w-[160px]">
                              {linkedProduct.name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Printer Fleet & Active Jobs Summary */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Printer className="w-4 h-4 text-amber-500" />
                  Workshop Printer Fleet
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Live status & maintenance counters
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('production')}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Manage Fleet
              </button>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-2">
              {printers.map((printer) => {
                const activeJob = printJobs.find(
                  (j) => j.printerId === printer.id && j.stage === 'Printing'
                );
                return (
                  <div key={printer.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {printer.name}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        <span
                          className={
                            printer.status === 'Printing'
                              ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                              : printer.status === 'Maintenance'
                              ? 'text-amber-600 dark:text-amber-400 font-medium'
                              : ''
                          }
                        >
                          {printer.status}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{printer.nozzleSize}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{printer.totalHours}h total</span>
                      </div>
                      {activeJob && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 truncate">
                          Running: {activeJob.jobTitle}
                        </p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      {printer.hoursSinceMaintenance >= 150 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                          <Wrench className="w-3.5 h-3.5" />
                          Service due ({printer.hoursSinceMaintenance}h)
                        </span>
                      ) : (
                        <span className="text-xs font-mono tabular-nums text-slate-400">
                          Maint: {printer.hoursSinceMaintenance}h ago
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
