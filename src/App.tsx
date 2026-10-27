/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ActiveBoardId,
  ContentItem,
  ContentProject,
  ContentPublication,
  ContentSeries,
  ContentSponsorship,
  ContentStage,
  CreatorCapacityConfig,
  CustomerOrder,
  FilamentSpool,
  FinancialRecord,
  MetricSnapshot,
  OrderStage,
  PrinterMachine,
  PrintJob,
  PrintOSState,
  Product,
  ProductionSession,
  ProductionStage,
  ProductStage,
  ResearchNote,
  ResearchStage,
  TaskItem,
  TaskStage,
  WeeklyContentReview,
} from './types/printos';
import { INITIAL_PRINTOS_STATE } from './data/seedData';
import {
  computeFilamentStage,
  parseSpreadsheetIdFromUrl,
} from './utils/calculations';
import {
  getJakartaDateIso,
  migratePrintOSState,
  syncContentTasksIdempotent,
  syncSponsorshipToFinancialsIdempotent,
} from './utils/contentStudio';
import {
  checkRemoteSpreadsheetRevision,
  completeRedirectSignIn,
  getLastAuthError,
  fetchWorkspaceFromSpreadsheet,
  getAccessToken,
  googleSignIn,
  initAuth,
  logoutGoogle,
  saveWorkspaceToSpreadsheet,
  SpreadsheetRevisionEntry,
} from './services/spreadsheetService';
import { OverviewBoard } from './components/OverviewBoard';
import { ProductCatalogBoard } from './components/ProductCatalogBoard';
import { ContentStudioBoard } from './components/ContentStudioBoard';
import { HermesBridgePanel } from './components/content/HermesBridgePanel';
import { TasksCalendarBoard } from './components/TasksCalendarBoard';
import { ProductionFleetBoard } from './components/ProductionFleetBoard';
import { InventoryBoard } from './components/InventoryBoard';
import { ResearchBoard } from './components/ResearchBoard';
import { BusinessFinanceBoard } from './components/BusinessFinanceBoard';
import {
  AlertTriangle,
  Box,
  CheckSquare,
  Clapperboard,
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
  Plug,
  Printer,
  RotateCcw,
  Search,
  Smartphone,
  Sun,
  Upload,
  X,
} from 'lucide-react';

const STORAGE_KEY = 'printos_workspace_state_v1';
const CORRUPT_BACKUP_KEY = 'printos_corrupt_recovery_raw_v1';
const THEME_KEY = 'printos_theme_v1';
const SPREADSHEET_URL_KEY = 'printos_spreadsheet_url_v1';

export default function App() {
  const [corruptStorageAlert, setCorruptStorageAlert] = useState<{
    errorMessage: string;
    rawPayload: string;
  } | null>(null);

  const [storageWriteError, setStorageWriteError] = useState<string>('');

  const [state, setState] = useState<PrintOSState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null && saved !== '') {
        const migration = migratePrintOSState(saved, INITIAL_PRINTOS_STATE);
        if (migration.status === 'ok' && migration.state) {
          return migration.state;
        }
        // Corrupt data detected: preserve raw string in recovery slot and do NOT silently overwrite STORAGE_KEY
        try {
          localStorage.setItem(CORRUPT_BACKUP_KEY, saved);
        } catch {
          // Ignore quota error when saving backup
        }
        setTimeout(() => {
          setCorruptStorageAlert({
            errorMessage:
              migration.errorMessage ||
              'Local storage data (localStorage) is corrupted or invalid.',
            rawPayload: saved,
          });
        }, 0);
        return structuredClone(INITIAL_PRINTOS_STATE);
      }
    } catch (err: any) {
      setTimeout(() => {
        setStorageWriteError(
          `Failed to read localStorage: ${err?.message || 'Storage access is restricted.'}`
        );
      }, 0);
    }
    return structuredClone(INITIAL_PRINTOS_STATE);
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
  const [openQuickCaptureTrigger, setOpenQuickCaptureTrigger] = useState<boolean>(false);

  // JSON Import / Restore Preview Modal State
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [jsonRestorePreview, setJsonRestorePreview] = useState<{
    fileName: string;
    migratedState: PrintOSState;
    migratedFromVersion: number;
  } | null>(null);

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
    type: 'idle' | 'success' | 'error' | 'info';
    message: string;
  }>({ type: 'idle', message: '' });

  const [hermesOpen, setHermesOpen] = useState(false);
  const [sheetConfirmModal, setSheetConfirmModal] = useState<
    | null
    | {
        mode: 'save';
        isStaleWarning?: boolean;
        remoteRevisionId?: string;
        remoteSavedAt?: string;
      }
    | {
        mode: 'fetch';
        fetchedState: PrintOSState;
        spreadsheetTitle: string;
        syncedAt: string;
        revisionId?: string;
        revisions: SpreadsheetRevisionEntry[];
        selectedRevisionId: string;
      }
  >(null);

  useEffect(() => {
    // Completes the OAuth code exchange after Google redirects back to the app.
    let cancelled = false;
    completeRedirectSignIn()
      .then((result) => {
        if (cancelled) return;
        if (result) {
          setGoogleUserEmail(result.user.email || 'Google Connected');
          setNeedsGoogleAuth(false);
          setSheetStatus({
            type: 'success',
            message: 'Google Sheets terhubung. Token tersimpan di tab ini sampai ~1 jam.',
          });
          return;
        }
        const authError = getLastAuthError();
        if (authError) setSheetStatus({ type: 'error', message: authError });
      })
      .catch((error: any) => {
        if (!cancelled) {
          setSheetStatus({ type: 'error', message: error?.message || 'Login Google gagal.' });
        }
      });

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
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SPREADSHEET_URL_KEY, spreadsheetUrl);
    } catch {
      // Ignore storage errors
    }
  }, [spreadsheetUrl]);

  // Persist workspace to localStorage ONLY when corruptStorageAlert is not active
  // so corrupt local data is never overwritten without explicit user consent!
  useEffect(() => {
    if (corruptStorageAlert) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      if (storageWriteError) setStorageWriteError('');
    } catch (err: any) {
      setStorageWriteError(
        `Failed to save changes to localStorage (${
          err?.name || 'QuotaExceededError'
        }). Use the Backup JSON button so your data is not lost.`
      );
    }
  }, [state, corruptStorageAlert]);

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

  // --- Connected 3D Printing State Handlers ---

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
      updatedAt: getJakartaDateIso(),
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
          ? { ...p, stage: newStage, updatedAt: getJakartaDateIso() }
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
              updatedAt: getJakartaDateIso(),
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
                date: getJakartaDateIso(),
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
                    updatedAt: getJakartaDateIso(),
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
              updatedAt: getJakartaDateIso(),
            }
          : p
      ),
    }));
  };

  // --- Connected Content Studio State Handlers ---

  const handleSaveContentItem = (item: ContentItem) => {
    setState((prev) => {
      const list = prev.contentItems || [];
      const exists = list.some((c) => c.id === item.id);
      return {
        ...prev,
        contentItems: exists
          ? list.map((c) => (c.id === item.id ? item : c))
          : [item, ...list],
      };
    });
  };

  const handleDeleteContentItem = (id: string) => {
    setState((prev) => ({
      ...prev,
      contentItems: (prev.contentItems || []).filter((c) => c.id !== id),
      contentPublications: (prev.contentPublications || []).filter(
        (p) => p.contentItemId !== id
      ),
    }));
  };

  const handleMoveContentStage = (id: string, stage: ContentStage) => {
    setState((prev) => ({
      ...prev,
      contentItems: (prev.contentItems || []).map((c) =>
        c.id === id ? { ...c, stage, updatedAt: getJakartaDateIso() } : c
      ),
    }));
  };

  const handleReorderContentItem = (id: string, direction: 'up' | 'down') => {
    setState((prev) => {
      const list = [...(prev.contentItems || [])].sort(
        (a, b) => a.orderIndex - b.orderIndex
      );
      const idx = list.findIndex((c) => c.id === id);
      if (idx === -1) return prev;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= list.length) return prev;
      const tempOrder = list[idx].orderIndex;
      list[idx] = { ...list[idx], orderIndex: list[swapIdx].orderIndex };
      list[swapIdx] = { ...list[swapIdx], orderIndex: tempOrder };
      return { ...prev, contentItems: list };
    });
  };

  const handleSaveProject = (project: ContentProject) => {
    setState((prev) => {
      const list = prev.contentProjects || [];
      const exists = list.some((p) => p.id === project.id);
      return {
        ...prev,
        contentProjects: exists
          ? list.map((p) => (p.id === project.id ? project : p))
          : [...list, project],
      };
    });
  };

  const handleSaveSeries = (series: ContentSeries) => {
    setState((prev) => {
      const list = prev.contentSeries || [];
      const exists = list.some((s) => s.id === series.id);
      return {
        ...prev,
        contentSeries: exists
          ? list.map((s) => (s.id === series.id ? series : s))
          : [...list, series],
      };
    });
  };

  const handleSavePublication = (pub: ContentPublication) => {
    setState((prev) => {
      const list = prev.contentPublications || [];
      const exists = list.some((p) => p.id === pub.id);
      return {
        ...prev,
        contentPublications: exists
          ? list.map((p) => (p.id === pub.id ? pub : p))
          : [pub, ...list],
      };
    });
  };

  const handleDeletePublication = (id: string) => {
    setState((prev) => ({
      ...prev,
      contentPublications: (prev.contentPublications || []).filter(
        (p) => p.id !== id
      ),
    }));
  };

  const handleSaveMetricSnapshot = (snapshot: MetricSnapshot) => {
    setState((prev) => {
      const list = prev.metricSnapshots || [];
      const exists = list.some(
        (s) =>
          s.id === snapshot.id ||
          (s.publicationId === snapshot.publicationId &&
            s.window === snapshot.window)
      );
      return {
        ...prev,
        metricSnapshots: exists
          ? list.map((s) =>
              s.id === snapshot.id ||
              (s.publicationId === snapshot.publicationId &&
                s.window === snapshot.window)
                ? snapshot
                : s
            )
          : [snapshot, ...list],
      };
    });
  };

  const handleSaveProductionSession = (session: ProductionSession) => {
    setState((prev) => {
      const list = prev.productionSessions || [];
      const exists = list.some((s) => s.id === session.id);
      const nextSessions = exists
        ? list.map((s) => (s.id === session.id ? session : s))
        : [session, ...list];

      // Automatically keep tasks in sync idempotently
      const synced = syncContentTasksIdempotent(
        prev.tasks,
        nextSessions,
        prev.contentItems || []
      );

      return {
        ...prev,
        productionSessions: nextSessions,
        tasks: synced.tasks,
      };
    });
  };

  const handleDeleteProductionSession = (id: string) => {
    setState((prev) => ({
      ...prev,
      productionSessions: (prev.productionSessions || []).filter(
        (s) => s.id !== id
      ),
      tasks: prev.tasks.filter((t) => t.sourceRefId !== `session:${id}`),
    }));
  };

  const handleSyncSessionsToTasks = () => {
    const res = syncContentTasksIdempotent(
      state.tasks,
      state.productionSessions || [],
      state.contentItems || []
    );
    setState((prev) => ({
      ...prev,
      tasks: res.tasks,
    }));
    return { createdCount: res.createdCount, updatedCount: res.updatedCount };
  };

  const handleSaveSponsorship = (deal: ContentSponsorship) => {
    setState((prev) => {
      const list = prev.contentSponsorships || [];
      const exists = list.some((d) => d.id === deal.id);
      const nextDeals = exists
        ? list.map((d) => (d.id === deal.id ? deal : d))
        : [deal, ...list];

      const syncedLedger = syncSponsorshipToFinancialsIdempotent(
        prev.financials,
        nextDeals,
        getJakartaDateIso()
      );

      return {
        ...prev,
        contentSponsorships: nextDeals,
        financials: syncedLedger.financials,
      };
    });
  };

  const handleDeleteSponsorship = (id: string) => {
    setState((prev) => ({
      ...prev,
      contentSponsorships: (prev.contentSponsorships || []).filter(
        (d) => d.id !== id
      ),
    }));
  };

  const handleSyncSponsorshipsToLedger = () => {
    const res = syncSponsorshipToFinancialsIdempotent(
      state.financials,
      state.contentSponsorships || [],
      getJakartaDateIso()
    );
    setState((prev) => ({
      ...prev,
      financials: res.financials,
    }));
    return { addedCount: res.addedCount, updatedCount: res.updatedCount };
  };

  const handleSaveWeeklyReview = (review: WeeklyContentReview) => {
    setState((prev) => {
      const list = prev.weeklyReviews || [];
      const exists = list.some((r) => r.id === review.id);
      return {
        ...prev,
        weeklyReviews: exists
          ? list.map((r) => (r.id === review.id ? review : r))
          : [review, ...list],
      };
    });
  };

  const handleSaveCapacityConfig = (config: CreatorCapacityConfig) => {
    setState((prev) => ({
      ...prev,
      creatorCapacity: config,
    }));
  };

  // --- Backup JSON, Import JSON & Corrupt Storage Handlers ---

  const handleExportWorkspaceJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `printos-backup-${getJakartaDateIso()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJsonFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rawText = String(reader.result || '');
      const migration = migratePrintOSState(rawText, INITIAL_PRINTOS_STATE);
      if (migration.status === 'corrupt' || !migration.state) {
        setSheetStatus({
          type: 'error',
          message:
            migration.errorMessage ||
            'Invalid JSON file. Your local data was not overwritten.',
        });
        return;
      }
      setJsonRestorePreview({
        fileName: file.name,
        migratedState: migration.state,
        migratedFromVersion: migration.migratedFromVersion,
      });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleResetDemoWorkspace = () => {
    const fresh = structuredClone(INITIAL_PRINTOS_STATE);
    setCorruptStorageAlert(null);
    setState(fresh);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    } catch {
      // Ignore
    }
  };

  const navSections: {
    title: string;
    items: {
      id: ActiveBoardId;
      label: string;
      count?: string | number;
      icon: React.ComponentType<{ className?: string }>;
    }[];
  }[] = [
    {
      title: 'Workspace',
      items: [
        {
          id: 'overview',
          label: 'Workspace Overview',
          icon: LayoutDashboard,
        },
      ],
    },
    {
      title: '3D Printing & Workshop',
      items: [
        {
          id: 'catalog',
          label: 'Product Catalog',
          count: state.products.length,
          icon: Box,
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
      ],
    },
    {
      title: 'Creator & Business',
      items: [
        {
          id: 'content',
          label: 'Content Studio',
          count: state.contentItems?.length || 0,
          icon: Clapperboard,
        },
        {
          id: 'tasks',
          label: 'Tasks & Schedule',
          count: state.tasks.filter((t) => t.stage !== 'Completed').length,
          icon: CheckSquare,
        },
        {
          id: 'business',
          label: 'Business & Finance (Rp)',
          count: state.orders.length,
          icon: DollarSign,
        },
      ],
    },
  ];

  const navItems = navSections.flatMap((section) => section.items);

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
      updatedAt: getJakartaDateIso(),
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
                    Maker & Creator Workspace
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

            {/* Grouped Boards Navigation List */}
            <nav aria-label="Primary Boards" className="space-y-4">
              {navSections.map((section) => (
                <div key={section.title} className="space-y-1">
                  <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {section.title}
                  </div>
                  {section.items.map((item) => {
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
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
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
                </div>
              ))}
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

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportJsonFileChange}
              className="hidden"
            />

            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={handleExportWorkspaceJson}
                className="px-2 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg flex items-center justify-center gap-1 transition-colors"
              >
                <Download className="w-3 h-3" />
                Backup JSON
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-2 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg flex items-center justify-center gap-1 transition-colors"
              >
                <Upload className="w-3 h-3" />
                Import JSON
              </button>
              <button
                type="button"
                onClick={handleResetDemoWorkspace}
                className="px-2 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg flex items-center justify-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Reset Seed
              </button>
            </div>

            <button
              type="button"
              onClick={() => setHermesOpen(true)}
              className="w-full px-2 py-1.5 text-[11px] font-semibold text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-900/60 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plug className="w-3 h-3" />
              Hermes Bridge
            </button>

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
                      setSheetStatus({ type: 'info', message: 'Menghubungkan ke Google…' });
                      const res = await googleSignIn((message) =>
                        setSheetStatus({ type: 'info', message })
                      );
                      if (res) {
                        setGoogleUserEmail(res.user.email || 'Google Connected');
                        setNeedsGoogleAuth(false);
                        setSheetStatus({
                          type: 'success',
                          message: 'Google Sheets terhubung. Token tersimpan di tab ini sampai ~1 jam.',
                        });
                      } else {
                        setSheetStatus({
                          type: 'info',
                          message: 'Menunggu Google… halaman akan berpindah ke login.',
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
                  onClick={async () => {
                    if (!parseSpreadsheetIdFromUrl(spreadsheetUrl)) {
                      setSheetStatus({
                        type: 'error',
                        message: 'Paste a shared Google Spreadsheet link first.',
                      });
                      return;
                    }
                    setSheetStatus({ type: 'idle', message: '' });
                    let isStale = false;
                    let remoteRev: string | undefined;
                    let remoteSavedAt: string | undefined;
                    try {
                      const token = await getAccessToken();
                      if (token) {
                        const check = await checkRemoteSpreadsheetRevision(
                          spreadsheetUrl,
                          state.syncMeta?.lastSavedRevisionId,
                          token
                        );
                        isStale = check.isStale;
                        remoteRev = check.remoteRevisionId;
                        remoteSavedAt = check.remoteSavedAt;
                      }
                    } catch {
                      // Non-blocking precheck
                    }
                    setSheetConfirmModal({
                      mode: 'save',
                      isStaleWarning: isStale,
                      remoteRevisionId: remoteRev,
                      remoteSavedAt,
                    });
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
                        revisionId: res.revisionId,
                        revisions: res.revisions,
                        selectedRevisionId:
                          res.revisionId || res.revisions[0]?.revisionId || 'latest',
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
                      : sheetStatus.type === 'info'
                      ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60'
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
          {/* Top Bar: Breadcrumb on Left — Visible Search on Mobile & Desktop — Quick Actions on Right */}
          <header className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20">
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

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* Search visible on BOTH mobile & desktop */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  placeholder="Search products, tasks, content..."
                  aria-label="Global workspace search"
                  className="pl-7 pr-2.5 py-1.5 text-xs bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-amber-500 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none w-36 sm:w-52"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  setOpenQuickCaptureTrigger(true);
                  setActiveBoard('content');
                }}
                className="px-2.5 sm:px-3 py-2 text-xs font-semibold bg-amber-100 hover:bg-amber-200 text-amber-950 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Smartphone className="w-3.5 h-3.5 text-orange-600" />
                <span className="hidden sm:inline">Quick Capture</span>
                <span className="sm:hidden">+ Idea</span>
              </button>

              <button
                type="button"
                onClick={triggerNewProductModal}
                className="px-3 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Quick Add Product</span>
                <span className="sm:hidden">+ Product</span>
              </button>
            </div>
          </header>

          {/* Corrupt Storage Protection Banner (Never overwrites corrupt data silently) */}
          {corruptStorageAlert && (
            <div
              role="alert"
              className="mx-6 mt-4 p-4 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-300 dark:border-red-800 text-xs text-red-900 dark:text-red-200 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  Data Protection Warning: Corrupted Local Storage (localStorage) Detected
                </span>
              </div>
              <p>
                {corruptStorageAlert.errorMessage} For your safety, PrintOS <strong>did not overwrite</strong> your local storage with demo data. A raw copy of the corrupted data has been preserved in recovery key <code>{CORRUPT_BACKUP_KEY}</code>.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const blob = new Blob([corruptStorageAlert.rawPayload], {
                      type: 'text/plain;charset=utf-8',
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'printos-corrupt-recovery-raw.txt';
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="px-3 py-1.5 font-semibold bg-white dark:bg-slate-900 border border-red-300 rounded-lg"
                >
                  Download Raw Data (.txt)
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 font-semibold bg-amber-500 text-slate-950 rounded-lg"
                >
                  Restore from JSON Backup
                </button>
                <button
                  type="button"
                  onClick={handleResetDemoWorkspace}
                  className="px-3 py-1.5 font-medium text-red-700 dark:text-red-300 hover:underline"
                >
                  Confirm Reset to Seed Data
                </button>
              </div>
            </div>
          )}

          {storageWriteError && (
            <div
              role="alert"
              className="mx-6 mt-4 p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 flex items-center justify-between"
            >
              <span>{storageWriteError}</span>
              <button
                type="button"
                onClick={() => setStorageWriteError('')}
                className="text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Board Content Area */}
          <main className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto">
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

            {activeBoard === 'content' && (
              <ContentStudioBoard
                products={state.products}
                capacity={
                  state.creatorCapacity || INITIAL_PRINTOS_STATE.creatorCapacity!
                }
                projects={state.contentProjects || []}
                seriesList={state.contentSeries || []}
                contentItems={state.contentItems || []}
                publications={state.contentPublications || []}
                metricSnapshots={state.metricSnapshots || []}
                productionSessions={state.productionSessions || []}
                sponsorships={state.contentSponsorships || []}
                weeklyReviews={state.weeklyReviews || []}
                globalSearch={globalSearch}
                openQuickCaptureTrigger={openQuickCaptureTrigger}
                onClearQuickCaptureTrigger={() => setOpenQuickCaptureTrigger(false)}
                onSaveContentItem={handleSaveContentItem}
                onDeleteContentItem={handleDeleteContentItem}
                onMoveContentStage={handleMoveContentStage}
                onReorderContentItem={handleReorderContentItem}
                onSaveProject={handleSaveProject}
                onSaveSeries={handleSaveSeries}
                onSavePublication={handleSavePublication}
                onDeletePublication={handleDeletePublication}
                onSaveMetricSnapshot={handleSaveMetricSnapshot}
                onSaveProductionSession={handleSaveProductionSession}
                onDeleteProductionSession={handleDeleteProductionSession}
                onSyncSessionsToTasks={handleSyncSessionsToTasks}
                onSaveSponsorship={handleSaveSponsorship}
                onDeleteSponsorship={handleDeleteSponsorship}
                onSyncSponsorshipsToLedger={handleSyncSponsorshipsToLedger}
                onSaveWeeklyReview={handleSaveWeeklyReview}
                onSaveCapacityConfig={handleSaveCapacityConfig}
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
                sponsorships={state.contentSponsorships || []}
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

        {/* JSON Backup / Restore Preview Modal */}
        {jsonRestorePreview && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="json-restore-title"
            className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                  <h2
                  id="json-restore-title"
                  className="text-base font-bold text-slate-900 dark:text-slate-100"
                >
                  JSON Backup Restore Preview
                </h2>
                <button
                  type="button"
                  onClick={() => setJsonRestorePreview(null)}
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                <p>
                  File <strong>{jsonRestorePreview.fileName}</strong> (Schema v
                  {jsonRestorePreview.migratedFromVersion} → v2) has been validated:
                </p>
                <ul className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-1 font-medium">
                  <li>• {jsonRestorePreview.migratedState.products.length} Catalog Products</li>
                  <li>• {jsonRestorePreview.migratedState.tasks.length} Tasks & Gantt Timelines</li>
                  <li>
                    • {jsonRestorePreview.migratedState.contentItems?.length || 0} Content Studio Items &{' '}
                    {jsonRestorePreview.migratedState.contentPublications?.length || 0} Channel Publications
                  </li>
                  <li>• {jsonRestorePreview.migratedState.filaments.length} Filament Spools</li>
                  <li>
                    • {jsonRestorePreview.migratedState.orders.length} Orders &{' '}
                    {jsonRestorePreview.migratedState.financials.length} Financial Records
                  </li>
                </ul>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setJsonRestorePreview(null)}
                  className="px-4 py-1.5 text-xs font-medium text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCorruptStorageAlert(null);
                    setState(jsonRestorePreview.migratedState);
                    setJsonRestorePreview(null);
                    setSheetStatus({
                      type: 'success',
                      message: `Successfully restored workspace data from "${jsonRestorePreview.fileName}".`,
                    });
                  }}
                  className="px-4 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg"
                >
                  Confirm Restore Data
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mandatory User Confirmation Dialog for Spreadsheet Save & Fetch Operations */}
        {hermesOpen && (
          <HermesBridgePanel
            state={state}
            onClose={() => setHermesOpen(false)}
            onReplace={(next) => {
              setState(next);
              setHermesOpen(false);
            }}
          />
        )}

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
                  {sheetConfirmModal.isStaleWarning && (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-200 space-y-1">
                      <div className="font-bold flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0" />
                        Newer Remote Spreadsheet Revision Warning (Stale Revision)
                      </div>
                      <p className="text-[11px]">
                        The spreadsheet has a newer remote revision <code>{sheetConfirmModal.remoteRevisionId}</code> ({sheetConfirmModal.remoteSavedAt}) that differs from your local base revision (<code>{state.syncMeta?.lastSavedRevisionId}</code>). Saving now will append a new revision to <code>PrintOS_Snapshots</code> (previous revisions remain preserved and recoverable).
                      </p>
                    </div>
                  )}

                  <p>
                    Save a versioned snapshot to app-owned tabs (<code>PrintOS_Meta</code>, <code>PrintOS_Snapshots</code>, <code>PrintOS_Catalog</code>, <code>PrintOS_Tasks</code>, <code>PrintOS_Content</code>) on Spreadsheet (
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {parseSpreadsheetIdFromUrl(spreadsheetUrl)}
                    </span>
                    ) without deleting user-owned tabs:
                  </p>
                  <ul className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-1 font-medium">
                    <li>• {state.products.length} Products in Catalog</li>
                    <li>• {state.tasks.length} Tasks & Gantt Timelines</li>
                    <li>
                      • {state.contentItems?.length || 0} Content Studio Items &{' '}
                      {state.contentPublications?.length || 0} Publications
                    </li>
                    <li>• {state.filaments.length} Filament Spools</li>
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
                    Select a snapshot revision from{' '}
                    <strong className="text-slate-900 dark:text-slate-100">
                      {sheetConfirmModal.spreadsheetTitle}
                    </strong>{' '}
                    to load into your local workspace:
                  </p>

                  {sheetConfirmModal.revisions.length > 1 && (
                    <div>
                      <label className="block font-semibold mb-1">
                        Select Snapshot Revision (Supports Previous Revision Recovery):
                      </label>
                      <select
                        value={sheetConfirmModal.selectedRevisionId}
                        onChange={(e) => {
                          const revId = e.target.value;
                          const found = sheetConfirmModal.revisions.find(
                            (r) => r.revisionId === revId
                          );
                          if (found) {
                            setSheetConfirmModal({
                              ...sheetConfirmModal,
                              selectedRevisionId: revId,
                              fetchedState: found.state,
                              syncedAt: found.savedAt,
                              revisionId: found.revisionId,
                            });
                          }
                        }}
                        className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                      >
                        {sheetConfirmModal.revisions.map((rev, idx) => (
                          <option key={rev.revisionId} value={rev.revisionId}>
                            {idx === 0 ? '[Latest] ' : `[Revision #${idx + 1}] `}
                            {rev.revisionId} — {rev.savedAt.slice(0, 19).replace('T', ' ')} ({rev.summaryText})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <ul className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-1 font-medium">
                    <li>• {sheetConfirmModal.fetchedState.products?.length || 0} Products</li>
                    <li>• {sheetConfirmModal.fetchedState.tasks?.length || 0} Tasks</li>
                    <li>
                      • {sheetConfirmModal.fetchedState.contentItems?.length || 0} Content Items &{' '}
                      {sheetConfirmModal.fetchedState.contentPublications?.length || 0} Channel Publications
                    </li>
                    <li>• {sheetConfirmModal.fetchedState.filaments?.length || 0} Filament Spools</li>
                    <li>• {sheetConfirmModal.fetchedState.orders?.length || 0} Customer Orders</li>
                    <li>• Revision: {sheetConfirmModal.revisionId || 'latest'}</li>
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
                          const signInRes = await googleSignIn((message) =>
                            setSheetStatus({ type: 'info', message })
                          );
                          if (!signInRes) {
                            setIsSyncingSheet(false);
                            setSheetStatus({
                              type: 'info',
                              message:
                                'Mengalihkan ke Google untuk login. Setelah kembali, klik Save sekali lagi.',
                            });
                            return;
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
                        setState((prev) => ({
                          ...prev,
                          syncMeta: {
                            schemaVersion: 2,
                            lastSavedRevisionId: result.revisionId,
                            lastSyncedAt: result.savedAt,
                            lastSpreadsheetTitle: result.spreadsheetTitle,
                          },
                        }));
                        setSheetConfirmModal(null);
                        setSheetStatus({
                          type: 'success',
                          message: `Verified & saved revision ${result.revisionId} (${result.rowCount} rows) to "${result.spreadsheetTitle}".`,
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
                      setCorruptStorageAlert(null);
                      setState(sheetConfirmModal.fetchedState);
                      setSheetStatus({
                        type: 'success',
                        message: `Fetched & loaded revision ${
                          sheetConfirmModal.revisionId || 'latest'
                        } from "${sheetConfirmModal.spreadsheetTitle}".`,
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
