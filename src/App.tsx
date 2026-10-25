/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  ActiveBoardId,
  CustomerOrder,
  FilamentSpool,
  FinancialRecord,
  OrderStage,
  PrinterMachine,
  PrintJob,
  PrintOSState,
  Product,
  ProductionStage,
  ProductStage,
  ResearchNote,
  ResearchStage,
  TaskItem,
  TaskStage,
} from './types/printos';
import { INITIAL_PRINTOS_STATE } from './data/seedData';
import {
  computeFilamentStage,
  formatRupiah,
  parseSpreadsheetIdFromUrl,
} from './utils/calculations';
import {
  fetchWorkspaceFromSpreadsheet,
  getAccessToken,
  googleSignIn,
  initAuth,
  logoutGoogle,
  saveWorkspaceToSpreadsheet,
} from './services/spreadsheetService';
import { OverviewBoard } from './components/OverviewBoard';
import { ProductCatalogBoard } from './components/ProductCatalogBoard';
import { TasksCalendarBoard } from './components/TasksCalendarBoard';
import { ProductionFleetBoard } from './components/ProductionFleetBoard';
import { InventoryBoard } from './components/InventoryBoard';
import { ResearchBoard } from './components/ResearchBoard';
import { BusinessFinanceBoard } from './components/BusinessFinanceBoard';
import {
  Box,
  CheckSquare,
  CloudDownload,
  CloudUpload,
  DollarSign,
  Download,
  FileSpreadsheet,
  FlaskConical,
  LayoutDashboard,
  Layers,
  Link2,
  Menu,
  Moon,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Sun,
  X,
} from 'lucide-react';

const STORAGE_KEY = 'printos_workspace_state_v1';
const THEME_KEY = 'printos_theme_v1';
const SPREADSHEET_URL_KEY = 'printos_spreadsheet_url_v1';

export default function App() {
  const [state, setState] = useState<PrintOSState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.products) && Array.isArray(parsed.tasks)) {
          // Ensure every product has stockQuantity populated even if loaded from an older localStorage snapshot
          const seedMap = new Map(
            INITIAL_PRINTOS_STATE.products.map((p) => [p.id, p.stockQuantity])
          );
          parsed.products = parsed.products.map((p: Product) => ({
            ...p,
            stockQuantity:
              typeof p.stockQuantity === 'number'
                ? p.stockQuantity
                : seedMap.get(p.id) ??
                  (p.stage === 'Published' ? 6 : p.stage === 'Ready to Sell' ? 4 : 0),
          }));

          // Ensure every task has plannedStartDate, actualStartDate, and actualEndDate populated
          const seedTaskMap = new Map(
            INITIAL_PRINTOS_STATE.tasks.map((t) => [t.id, t])
          );
          parsed.tasks = parsed.tasks.map((t: TaskItem) => {
            const seedTask = seedTaskMap.get(t.id);
            return {
              ...t,
              plannedStartDate:
                t.plannedStartDate ||
                seedTask?.plannedStartDate ||
                t.dueDate ||
                '2026-10-22',
              dueDate: t.dueDate || seedTask?.dueDate || '2026-10-24',
              actualStartDate:
                typeof t.actualStartDate === 'string'
                  ? t.actualStartDate
                  : seedTask?.actualStartDate ??
                    (t.stage === 'In Progress' ||
                    t.stage === 'Review' ||
                    t.stage === 'Completed'
                      ? t.dueDate
                      : ''),
              actualEndDate:
                typeof t.actualEndDate === 'string'
                  ? t.actualEndDate
                  : seedTask?.actualEndDate ?? (t.stage === 'Completed' ? t.dueDate : ''),
            };
          });
          return parsed;
        }
      }
    } catch {
      // Fallback to initial seed data
    }
    return INITIAL_PRINTOS_STATE;
  });

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'dark';
    } catch {
      return false;
    }
  });

  const [activeBoard, setActiveBoard] = useState<ActiveBoardId>('overview');
  const [globalSearch, setGlobalSearch] = useState<string>('');
  const [mobileNavOpen, setMobileNavOpen] = useState<boolean>(false);
  const [selectedProductForModal, setSelectedProductForModal] = useState<Product | null>(null);
  const [openNewTaskModalTrigger, setOpenNewTaskModalTrigger] = useState<boolean>(false);

  // Google Spreadsheet Sync State
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string>(() => {
    try {
      return localStorage.getItem(SPREADSHEET_URL_KEY) || '';
    } catch {
      return '';
    }
  });
  const [googleUserEmail, setGoogleUserEmail] = useState<string | null>(null);
  const [needsGoogleAuth, setNeedsGoogleAuth] = useState<boolean>(true);
  const [isSyncingSheet, setIsSyncingSheet] = useState<false | 'save' | 'fetch'>(false);
  const [sheetStatus, setSheetStatus] = useState<{
    type: 'idle' | 'success' | 'error';
    message: string;
  }>({ type: 'idle', message: '' });
  const [sheetConfirmModal, setSheetConfirmModal] = useState<
    | null
    | { mode: 'save' }
    | {
        mode: 'fetch';
        fetchedState: PrintOSState;
        spreadsheetTitle: string;
        syncedAt: string;
      }
  >(null);

  useEffect(() => {
    const unsubscribe = initAuth(
      (user) => {
        setGoogleUserEmail(user.email || 'Google Connected');
        setNeedsGoogleAuth(false);
      },
      () => {
        setGoogleUserEmail(null);
        setNeedsGoogleAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SPREADSHEET_URL_KEY, spreadsheetUrl);
    } catch {
      // Ignore storage errors
    }
  }, [spreadsheetUrl]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors
    }
  }, [state]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, darkMode ? 'dark' : 'light');
    } catch {
      // Ignore
    }
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // --- Connected State Handlers ---

  const handleSaveProduct = (product: Product) => {
    setState((prev) => {
      const exists = prev.products.some((p) => p.id === product.id);
      return {
        ...prev,
        products: exists
          ? prev.products.map((p) => (p.id === product.id ? product : p))
          : [product, ...prev.products],
      };
    });
  };

  const handleDeleteProduct = (productId: string) => {
    setState((prev) => ({
      ...prev,
      products: prev.products.filter((p) => p.id !== productId),
    }));
  };

  const handleDuplicateProduct = (product: Product) => {
    const copy: Product = {
      ...product,
      id: `prod-${Date.now()}`,
      name: `${product.name} (Copy)`,
      sku: `${product.sku}-COPY`,
      stockQuantity: product.stockQuantity ?? 0,
      unitsSold: 0,
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    setState((prev) => ({
      ...prev,
      products: [copy, ...prev.products],
    }));
  };

  const handleMoveProductStage = (productId: string, newStage: ProductStage) => {
    setState((prev) => ({
      ...prev,
      products: prev.products.map((p) =>
        p.id === productId
          ? { ...p, stage: newStage, updatedAt: new Date().toISOString().slice(0, 10) }
          : p
      ),
    }));
  };

  const handleAdjustProductStock = (productId: string, delta: number) => {
    setState((prev) => ({
      ...prev,
      products: prev.products.map((p) =>
        p.id === productId
          ? {
              ...p,
              stockQuantity: Math.max(0, (p.stockQuantity ?? 0) + delta),
              updatedAt: new Date().toISOString().slice(0, 10),
            }
          : p
      ),
    }));
  };

  const handleSaveTask = (task: TaskItem) => {
    setState((prev) => {
      const exists = prev.tasks.some((t) => t.id === task.id);
      return {
        ...prev,
        tasks: exists
          ? prev.tasks.map((t) => (t.id === task.id ? task : t))
          : [task, ...prev.tasks],
      };
    });
  };

  const handleDeleteTask = (taskId: string) => {
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((t) => t.id !== taskId),
    }));
  };

  const handleMoveTaskStage = (taskId: string, stage: TaskStage) => {
    const todayIso = '2026-10-23';
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) return t;
        const nextActualStart =
          (stage === 'In Progress' || stage === 'Review' || stage === 'Completed') &&
          !t.actualStartDate
            ? todayIso
            : t.actualStartDate || '';
        const nextActualEnd =
          stage === 'Completed'
            ? t.actualEndDate || todayIso
            : stage === 'Backlog' || stage === 'Today'
            ? ''
            : t.actualEndDate || '';
        return {
          ...t,
          stage,
          actualStartDate: nextActualStart,
          actualEndDate: nextActualEnd,
        };
      }),
    }));
  };

  const handleToggleTaskStage = (taskId: string) => {
    const todayIso = '2026-10-23';
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) return t;
        const nextStage: TaskStage = t.stage === 'Completed' ? 'Today' : 'Completed';
        return {
          ...t,
          stage: nextStage,
          actualStartDate:
            nextStage === 'Completed'
              ? t.actualStartDate || t.plannedStartDate || todayIso
              : t.actualStartDate || '',
          actualEndDate: nextStage === 'Completed' ? t.actualEndDate || todayIso : '',
        };
      }),
    }));
  };

  const handleAdjustFilamentWeight = (spoolId: string, deltaGrams: number) => {
    setState((prev) => ({
      ...prev,
      filaments: prev.filaments.map((f) => {
        if (f.id !== spoolId) return f;
        const nextRemaining = Math.max(0, f.remainingWeightGrams + deltaGrams);
        return {
          ...f,
          remainingWeightGrams: nextRemaining,
          stage: computeFilamentStage(nextRemaining, f.initialWeightGrams, f.assignedPrinter),
        };
      }),
    }));
  };

  const handleSaveFilament = (spool: FilamentSpool, logExpenseRp = 0) => {
    setState((prev) => {
      const exists = prev.filaments.some((f) => f.id === spool.id);
      const nextFilaments = exists
        ? prev.filaments.map((f) => (f.id === spool.id ? spool : f))
        : [spool, ...prev.filaments];

      const nextFinancials =
        logExpenseRp > 0
          ? [
              {
                id: `fin-${Date.now()}`,
                date: new Date().toISOString().slice(0, 10),
                title: `Spool Purchase: ${spool.brand} ${spool.name} (${spool.material})`,
                type: 'Expense' as const,
                category: 'Filament Purchase' as const,
                amountRp: logExpenseRp,
                notes: 'Logged automatically from Filament Inventory.',
              },
              ...prev.financials,
            ]
          : prev.financials;

      return {
        ...prev,
        filaments: nextFilaments,
        financials: nextFinancials,
      };
    });
  };

  const handleDeleteFilament = (spoolId: string) => {
    setState((prev) => ({
      ...prev,
      filaments: prev.filaments.filter((f) => f.id !== spoolId),
    }));
  };

  const handleSaveJob = (job: PrintJob, deductFilamentGrams = 0) => {
    setState((prev) => {
      const exists = prev.printJobs.some((j) => j.id === job.id);
      const nextJobs = exists
        ? prev.printJobs.map((j) => (j.id === job.id ? job : j))
        : [job, ...prev.printJobs];

      const nextFilaments =
        deductFilamentGrams > 0
          ? prev.filaments.map((f) => {
              if (f.id !== job.filamentId) return f;
              const rem = Math.max(0, f.remainingWeightGrams - deductFilamentGrams);
              return {
                ...f,
                remainingWeightGrams: rem,
                stage: computeFilamentStage(rem, f.initialWeightGrams, f.assignedPrinter),
              };
            })
          : prev.filaments;

      return {
        ...prev,
        printJobs: nextJobs,
        filaments: nextFilaments,
      };
    });
  };

  const handleMoveJobStage = (
    jobId: string,
    stage: ProductionStage,
    deductFilament = false
  ) => {
    setState((prev) => {
      const targetJob = prev.printJobs.find((j) => j.id === jobId);
      const nextJobs = prev.printJobs.map((j) =>
        j.id === jobId ? { ...j, stage } : j
      );

      const nextFilaments =
        deductFilament && targetJob
          ? prev.filaments.map((f) => {
              if (f.id !== targetJob.filamentId) return f;
              const rem = Math.max(0, f.remainingWeightGrams - targetJob.filamentGramsUsed);
              return {
                ...f,
                remainingWeightGrams: rem,
                stage: computeFilamentStage(rem, f.initialWeightGrams, f.assignedPrinter),
              };
            })
          : prev.filaments;

      const nextProducts =
        deductFilament && targetJob && stage === 'Completed'
          ? prev.products.map((p) =>
              p.id === targetJob.productId
                ? {
                    ...p,
                    stockQuantity: Math.max(0, (p.stockQuantity ?? 0) + targetJob.batchQuantity),
                    updatedAt: new Date().toISOString().slice(0, 10),
                  }
                : p
            )
          : prev.products;

      return {
        ...prev,
        printJobs: nextJobs,
        filaments: nextFilaments,
        products: nextProducts,
      };
    });
  };

  const handleDeleteJob = (jobId: string) => {
    setState((prev) => ({
      ...prev,
      printJobs: prev.printJobs.filter((j) => j.id !== jobId),
    }));
  };

  const handleUpdatePrinter = (printer: PrinterMachine) => {
    setState((prev) => ({
      ...prev,
      printers: prev.printers.map((p) => (p.id === printer.id ? printer : p)),
    }));
  };

  const handleSaveResearchNote = (note: ResearchNote) => {
    setState((prev) => {
      const exists = prev.researchNotes.some((n) => n.id === note.id);
      return {
        ...prev,
        researchNotes: exists
          ? prev.researchNotes.map((n) => (n.id === note.id ? note : n))
          : [note, ...prev.researchNotes],
      };
    });
  };

  const handleMoveResearchStage = (noteId: string, stage: ResearchStage) => {
    setState((prev) => ({
      ...prev,
      researchNotes: prev.researchNotes.map((n) =>
        n.id === noteId ? { ...n, stage } : n
      ),
    }));
  };

  const handleDeleteResearchNote = (noteId: string) => {
    setState((prev) => ({
      ...prev,
      researchNotes: prev.researchNotes.filter((n) => n.id !== noteId),
    }));
  };

  const handleSaveOrder = (order: CustomerOrder) => {
    setState((prev) => {
      const exists = prev.orders.some((o) => o.id === order.id);
      return {
        ...prev,
        orders: exists
          ? prev.orders.map((o) => (o.id === order.id ? order : o))
          : [order, ...prev.orders],
      };
    });
  };

  const handleMoveOrderStage = (orderId: string, stage: OrderStage) => {
    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) => (o.id === orderId ? { ...o, stage } : o)),
    }));
  };

  const handleDeleteOrder = (orderId: string) => {
    setState((prev) => ({
      ...prev,
      orders: prev.orders.filter((o) => o.id !== orderId),
    }));
  };

  const handleAddFinancialRecord = (record: FinancialRecord) => {
    setState((prev) => ({
      ...prev,
      financials: [record, ...prev.financials],
    }));
  };

  const handleDeleteFinancialRecord = (id: string) => {
    setState((prev) => ({
      ...prev,
      financials: prev.financials.filter((f) => f.id !== id),
    }));
  };

  const handleApplyCostToProduct = (productId: string, costRp: number, priceRp: number) => {
    setState((prev) => ({
      ...prev,
      products: prev.products.map((p) =>
        p.id === productId
          ? {
              ...p,
              productionCostRp: costRp,
              sellingPriceRp: priceRp,
              updatedAt: new Date().toISOString().slice(0, 10),
            }
          : p
      ),
    }));
  };

  const handleExportWorkspaceJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `printos-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleResetDemoWorkspace = () => {
    setState(INITIAL_PRINTOS_STATE);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_PRINTOS_STATE));
  };

  const navItems: {
    id: ActiveBoardId;
    label: string;
    count?: string | number;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      id: 'overview',
      label: 'Workspace Overview',
      icon: LayoutDashboard,
    },
    {
      id: 'catalog',
      label: 'Product Catalog',
      count: state.products.length,
      icon: Box,
    },
    {
      id: 'tasks',
      label: 'Tasks & Schedule',
      count: state.tasks.filter((t) => t.stage !== 'Completed').length,
      icon: CheckSquare,
    },
    {
      id: 'production',
      label: 'Production & Fleet',
      count: state.printJobs.filter((j) => j.stage !== 'Completed').length,
      icon: Printer,
    },
    {
      id: 'inventory',
      label: 'Filament Inventory',
      count: state.filaments.length,
      icon: Layers,
    },
    {
      id: 'research',
      label: 'Research & Profiles',
      count: state.researchNotes.length,
      icon: FlaskConical,
    },
    {
      id: 'business',
      label: 'Business & Finance (Rp)',
      count: state.orders.length,
      icon: DollarSign,
    },
  ];

  const activeBoardMeta = navItems.find((item) => item.id === activeBoard) || navItems[0];

  const triggerNewProductModal = () => {
    const defaultFilament = state.filaments[0];
    setSelectedProductForModal({
      id: `prod-${Date.now()}`,
      name: '',
      sku: `POS-SKU-${state.products.length + 1}`,
      stage: 'Idea',
      category: 'Functional Parts',
      dimensions: '100 × 100 × 45 mm',
      colors: [defaultFilament?.colorName || 'Charcoal Black'],
      filamentId: defaultFilament?.id || 'fil-1',
      filamentMaterial: defaultFilament?.material || 'PLA+',
      filamentGrams: 85,
      printTimeMinutes: 120,
      productionCostRp: 35000,
      sellingPriceRp: 115000,
      stockQuantity: 0,
      unitsSold: 0,
      stlFileName: 'new_product_model.3mf',
      stlFileSize: '4.2 MB',
      artworkPreset: 'voron',
      notes: '',
      checklist: [
        { id: `chk-${Date.now()}-1`, text: 'Export manifold 3MF/STL mesh', completed: false },
      ],
      updatedAt: new Date().toISOString().slice(0, 10),
    });
    setActiveBoard('catalog');
  };

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-[#FAF8F5] dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex">
        {/* Desktop & Mobile Sidebar Navigation */}
        <aside
          aria-label="Workspace Boards"
          className={`fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-slate-900 border-r border-orange-100 dark:border-slate-800 flex flex-col justify-between transition-transform lg:translate-x-0 lg:static lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:shrink-0 ${
            mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="p-4 space-y-6">
            {/* Brand Header */}
            <div className="flex items-center justify-between px-2">
              <button
                type="button"
                onClick={() => {
                  setActiveBoard('overview');
                  setMobileNavOpen(false);
                }}
                className="flex items-center gap-2.5 text-left focus:outline-none"
              >
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center font-extrabold font-display text-base shadow-xs">
                  P
                </div>
                <div>
                  <span className="text-lg font-extrabold tracking-tight font-display text-slate-900 dark:text-slate-100 block leading-none">
                    PrintOS
                  </span>
                  <span className="text-[11px] font-medium text-orange-600 dark:text-amber-400">
                    3D Maker Studio
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close sidebar"
                className="lg:hidden p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Boards Navigation List */}
            <nav aria-label="Primary Boards" className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeBoard === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveBoard(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-amber-100/90 text-amber-950 dark:bg-amber-500 dark:text-slate-950 font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-orange-50/70 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-orange-600 dark:text-slate-950' : 'text-slate-400'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.count !== undefined && (
                      <span
                        className={`tabular-nums text-[11px] font-semibold ${
                          isActive
                            ? 'text-orange-700 dark:text-slate-900'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Footer: Persistence Controls & Theme Toggle */}
          <div className="p-4 border-t border-orange-100 dark:border-slate-800 space-y-3">
            <div className="px-1 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
              <span className="font-medium">Theme Mode</span>
              <button
                type="button"
                onClick={() => setDarkMode((prev) => !prev)}
                aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                className="px-3 py-1.5 rounded-lg bg-amber-100/80 hover:bg-amber-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-amber-950 dark:text-slate-100 flex items-center gap-1.5 font-semibold transition-colors cursor-pointer"
              >
                {darkMode ? (
                  <>
                    <Moon className="w-3.5 h-3.5 text-amber-400" />
                    Dark Mode
                  </>
                ) : (
                  <>
                    <Sun className="w-3.5 h-3.5 text-orange-500" />
                    Light Mode
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleExportWorkspaceJson}
                className="px-2.5 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg flex items-center justify-center gap-1 transition-colors"
              >
                <Download className="w-3 h-3" />
                Backup JSON
              </button>
              <button
                type="button"
                onClick={handleResetDemoWorkspace}
                className="px-2.5 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg flex items-center justify-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Reset Seed
              </button>
            </div>

            {/* Spreadsheet Sync Service (below Backup JSON button) */}
            <div className="pt-2.5 border-t border-orange-100/80 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  Spreadsheet Sync
                </span>
                {parseSpreadsheetIdFromUrl(spreadsheetUrl) ? (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                    Link Ready
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400">Paste Link</span>
                )}
              </div>

              <div className="relative">
                <Link2 className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={spreadsheetUrl}
                  onChange={(e) => {
                    setSpreadsheetUrl(e.target.value);
                    if (sheetStatus.type !== 'idle') {
                      setSheetStatus({ type: 'idle', message: '' });
                    }
                  }}
                  placeholder="Paste shared spreadsheet link..."
                  aria-label="Shared Google Spreadsheet Link"
                  className="w-full pl-7 pr-2.5 py-1.5 text-[11px] bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Google Account Connection for Sheets API */}
              {needsGoogleAuth ? (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      setSheetStatus({ type: 'idle', message: '' });
                      const res = await googleSignIn();
                      if (res) {
                        setGoogleUserEmail(res.user.email || 'Google Connected');
                        setNeedsGoogleAuth(false);
                        setSheetStatus({
                          type: 'success',
                          message: 'Google Sheets account connected.',
                        });
                      }
                    } catch (err: any) {
                      setSheetStatus({
                        type: 'error',
                        message: err?.message || 'Google Sign-In cancelled.',
                      });
                    }
                  }}
                  className="w-full py-1.5 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <svg
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    className="w-3.5 h-3.5 block shrink-0"
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                  </svg>
                  <span>Sign in with Google</span>
                </button>
              ) : (
                <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/50 text-[10px]">
                  <span className="text-emerald-800 dark:text-emerald-300 truncate font-medium">
                    {googleUserEmail}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      await logoutGoogle();
                      setGoogleUserEmail(null);
                      setNeedsGoogleAuth(true);
                    }}
                    className="text-slate-500 hover:text-red-600 font-semibold ml-1.5 shrink-0"
                  >
                    Sign out
                  </button>
                </div>
              )}

              {/* Save & Fetch Spreadsheet Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isSyncingSheet !== false}
                  onClick={() => {
                    if (!parseSpreadsheetIdFromUrl(spreadsheetUrl)) {
                      setSheetStatus({
                        type: 'error',
                        message: 'Paste a shared Google Spreadsheet link first.',
                      });
                      return;
                    }
                    setSheetStatus({ type: 'idle', message: '' });
                    setSheetConfirmModal({ mode: 'save' });
                  }}
                  className="px-2.5 py-1.5 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <CloudUpload className="w-3 h-3" />
                  {isSyncingSheet === 'save' ? 'Saving...' : 'Save'}
                </button>

                <button
                  type="button"
                  disabled={isSyncingSheet !== false}
                  onClick={async () => {
                    if (!parseSpreadsheetIdFromUrl(spreadsheetUrl)) {
                      setSheetStatus({
                        type: 'error',
                        message: 'Paste a shared Google Spreadsheet link first.',
                      });
                      return;
                    }
                    setIsSyncingSheet('fetch');
                    setSheetStatus({ type: 'idle', message: '' });
                    try {
                      const token = await getAccessToken();
                      const res = await fetchWorkspaceFromSpreadsheet(
                        spreadsheetUrl,
                        state,
                        token
                      );
                      setSheetConfirmModal({
                        mode: 'fetch',
                        fetchedState: res.state,
                        spreadsheetTitle: res.spreadsheetTitle,
                        syncedAt: res.syncedAt,
                      });
                    } catch (err: any) {
                      setSheetStatus({
                        type: 'error',
                        message:
                          err?.message ||
                          'Failed to fetch spreadsheet. Ensure link is shared.',
                      });
                    } finally {
                      setIsSyncingSheet(false);
                    }
                  }}
                  className="px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-200 bg-emerald-100 hover:bg-emerald-200/80 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 disabled:opacity-50 rounded-lg flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <CloudDownload className="w-3 h-3" />
                  {isSyncingSheet === 'fetch' ? 'Fetching...' : 'Fetch'}
                </button>
              </div>

              {sheetStatus.message && (
                <div
                  className={`p-2 rounded-lg text-[10px] leading-snug ${
                    sheetStatus.type === 'error'
                      ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/60'
                      : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                  }`}
                >
                  {sheetStatus.message}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Mobile Drawer Backdrop */}
        {mobileNavOpen && (
          <div
            onClick={() => setMobileNavOpen(false)}
            className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
          />
        )}

        {/* Main Workspace Viewport */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* SaaS Top Bar Contract: Breadcrumb on Left — Quick Filter/Search — Primary Action on Right */}
          <header className="flex items-center justify-between gap-4 px-6 py-3.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open navigation menu"
                className="lg:hidden p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2 text-sm min-w-0">
                <span className="text-slate-400 dark:text-slate-500 hidden sm:inline">
                  PrintOS
                </span>
                <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">/</span>
                <h1 className="font-bold text-slate-900 dark:text-slate-100 truncate">
                  {activeBoardMeta.label}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="relative hidden sm:block">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  placeholder="Filter cards across board..."
                  aria-label="Global workspace search"
                  className="pl-8 pr-3 py-1.5 text-xs bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-amber-500 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none w-52"
                />
              </div>

              <button
                type="button"
                onClick={triggerNewProductModal}
                className="px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Quick Add Product
              </button>
            </div>
          </header>

          {/* Board Content Area */}
          <main className="flex-1 p-6 max-w-[1600px] w-full mx-auto">
            {activeBoard === 'overview' && (
              <OverviewBoard
                products={state.products}
                tasks={state.tasks}
                filaments={state.filaments}
                printJobs={state.printJobs}
                printers={state.printers}
                orders={state.orders}
                financials={state.financials}
                onNavigate={(b) => setActiveBoard(b)}
                onToggleTaskStage={handleToggleTaskStage}
                onSelectProduct={(prod) => {
                  setSelectedProductForModal(prod);
                  setActiveBoard('catalog');
                }}
                onQuickAddProduct={triggerNewProductModal}
                onQuickAddTask={() => {
                  setOpenNewTaskModalTrigger(true);
                  setActiveBoard('tasks');
                }}
              />
            )}

            {activeBoard === 'catalog' && (
              <ProductCatalogBoard
                products={state.products}
                filaments={state.filaments}
                globalSearch={globalSearch}
                selectedProduct={selectedProductForModal}
                onSelectProduct={setSelectedProductForModal}
                onSaveProduct={handleSaveProduct}
                onDeleteProduct={handleDeleteProduct}
                onDuplicateProduct={handleDuplicateProduct}
                onMoveProductStage={handleMoveProductStage}
                onAdjustProductStock={handleAdjustProductStock}
              />
            )}

            {activeBoard === 'tasks' && (
              <TasksCalendarBoard
                tasks={state.tasks}
                products={state.products}
                globalSearch={globalSearch}
                openNewTaskModalTrigger={openNewTaskModalTrigger}
                onClearNewTaskTrigger={() => setOpenNewTaskModalTrigger(false)}
                onSaveTask={handleSaveTask}
                onDeleteTask={handleDeleteTask}
                onMoveTaskStage={handleMoveTaskStage}
              />
            )}

            {activeBoard === 'production' && (
              <ProductionFleetBoard
                printJobs={state.printJobs}
                printers={state.printers}
                products={state.products}
                filaments={state.filaments}
                onSaveJob={handleSaveJob}
                onDeleteJob={handleDeleteJob}
                onMoveJobStage={handleMoveJobStage}
                onUpdatePrinter={handleUpdatePrinter}
              />
            )}

            {activeBoard === 'inventory' && (
              <InventoryBoard
                filaments={state.filaments}
                globalSearch={globalSearch}
                onSaveFilament={handleSaveFilament}
                onDeleteFilament={handleDeleteFilament}
                onAdjustWeight={handleAdjustFilamentWeight}
              />
            )}

            {activeBoard === 'research' && (
              <ResearchBoard
                notes={state.researchNotes}
                products={state.products}
                globalSearch={globalSearch}
                onSaveNote={handleSaveResearchNote}
                onDeleteNote={handleDeleteResearchNote}
                onMoveNoteStage={handleMoveResearchStage}
              />
            )}

            {activeBoard === 'business' && (
              <BusinessFinanceBoard
                products={state.products}
                filaments={state.filaments}
                orders={state.orders}
                financials={state.financials}
                onSaveOrder={handleSaveOrder}
                onMoveOrderStage={handleMoveOrderStage}
                onDeleteOrder={handleDeleteOrder}
                onAddFinancialRecord={handleAddFinancialRecord}
                onDeleteFinancialRecord={handleDeleteFinancialRecord}
                onApplyCostToProduct={handleApplyCostToProduct}
              />
            )}
          </main>
        </div>

        {/* Mandatory User Confirmation Dialog for Spreadsheet Save & Fetch Operations */}
        {sheetConfirmModal && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sheet-confirm-title"
            className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                <h2
                  id="sheet-confirm-title"
                  className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  {sheetConfirmModal.mode === 'save'
                    ? 'Confirm Save to Google Spreadsheet'
                    : 'Confirm Load Data from Spreadsheet'}
                </h2>
                <button
                  type="button"
                  onClick={() => setSheetConfirmModal(null)}
                  aria-label="Close confirmation modal"
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {sheetConfirmModal.mode === 'save' ? (
                <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
                  <p>
                    This will overwrite the first sheet tab of your connected Google
                    Spreadsheet (
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {parseSpreadsheetIdFromUrl(spreadsheetUrl)}
                    </span>
                    ) with your current PrintOS workspace data:
                  </p>
                  <ul className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-1 font-medium">
                    <li>• {state.products.length} Products in Catalog</li>
                    <li>• {state.tasks.length} Tasks & Gantt Timelines</li>
                    <li>• {state.filaments.length} Filament Spools</li>
                    <li>• {state.printJobs.length} Print Jobs & {state.printers.length} Printers</li>
                    <li>• {state.orders.length} Customer Orders & {state.financials.length} Financial Records</li>
                  </ul>
                  {needsGoogleAuth && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      You will be prompted to sign in with Google to authorize writing to this spreadsheet.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
                  <p>
                    Replace your current local workspace with the data fetched from{' '}
                    <strong className="text-slate-900 dark:text-slate-100">
                      {sheetConfirmModal.spreadsheetTitle}
                    </strong>
                    ?
                  </p>
                  <ul className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-1 font-medium">
                    <li>• {sheetConfirmModal.fetchedState.products?.length || 0} Products</li>
                    <li>• {sheetConfirmModal.fetchedState.tasks?.length || 0} Tasks</li>
                    <li>• {sheetConfirmModal.fetchedState.filaments?.length || 0} Filament Spools</li>
                    <li>• {sheetConfirmModal.fetchedState.orders?.length || 0} Customer Orders</li>
                    <li>• Last Synced: {sheetConfirmModal.syncedAt.slice(0, 19).replace('T', ' ')}</li>
                  </ul>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setSheetConfirmModal(null)}
                  className="px-4 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  Cancel
                </button>
                {sheetConfirmModal.mode === 'save' ? (
                  <button
                    type="button"
                    disabled={isSyncingSheet === 'save'}
                    onClick={async () => {
                      setIsSyncingSheet('save');
                      setSheetStatus({ type: 'idle', message: '' });
                      try {
                        let token = await getAccessToken();
                        if (!token) {
                          const signInRes = await googleSignIn();
                          if (!signInRes) {
                            throw new Error('Google Sign-In is required to save to Google Sheets.');
                          }
                          token = signInRes.accessToken;
                          setGoogleUserEmail(signInRes.user.email || 'Google Connected');
                          setNeedsGoogleAuth(false);
                        }
                        const result = await saveWorkspaceToSpreadsheet(
                          spreadsheetUrl,
                          state,
                          token
                        );
                        setSheetConfirmModal(null);
                        setSheetStatus({
                          type: 'success',
                          message: `Saved ${result.rowCount} rows to "${result.spreadsheetTitle}" (${result.sheetTabName}).`,
                        });
                      } catch (err: any) {
                        setSheetConfirmModal(null);
                        setSheetStatus({
                          type: 'error',
                          message:
                            err?.message ||
                            'Failed to save to Google Sheets. Check sharing permissions.',
                        });
                      } finally {
                        setIsSyncingSheet(false);
                      }
                    }}
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
                  >
                    Confirm Save
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setState(sheetConfirmModal.fetchedState);
                      setSheetStatus({
                        type: 'success',
                        message: `Fetched & loaded data from "${sheetConfirmModal.spreadsheetTitle}".`,
                      });
                      setSheetConfirmModal(null);
                    }}
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
                  >
                    Confirm Load Data
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
