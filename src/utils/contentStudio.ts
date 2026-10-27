import {
  ContentFormat,
  ContentItem,
  ContentPillar,
  ContentProject,
  ContentPublication,
  ContentSeries,
  ContentSponsorship,
  ContentStage,
  CreatorCapacityConfig,
  FinancialRecord,
  LocalAssetReference,
  MetricSnapshot,
  PrintOSState,
  Product,
  ProductionSession,
  PublicationStatus,
  SessionActivityType,
  SponsorshipStatus,
  TaskItem,
} from '../types/printos';
import { INITIAL_PRINTOS_STATE } from '../data/seedData';
import { diffDaysISO, formatRupiah } from './calculations';

export const CURRENT_SCHEMA_VERSION = 2;

const LEGACY_STAGE_MAP: Record<string, ContentStage> = {
  Strategi: 'Strategy',
  'Bank Ide & Riset': 'Idea & Research Bank',
  Brief: 'Brief',
  'Naskah / Slide': 'Script / Slides',
  'Shot List': 'Shot List',
  'Rencana Produksi': 'Production Plan',
  'Aset & Referensi Edit': 'Assets & Edit Notes',
  QC: 'QC',
  'Siap Tayang': 'Ready to Publish',
  Terbit: 'Published',
  'Evaluasi & Repurpose': 'Review & Repurpose',
};

const LEGACY_PUB_STATUS_MAP: Record<string, PublicationStatus> = {
  Draf: 'Draft',
  Terjadwal: 'Scheduled',
  'Siap Posting Manual': 'Ready for Manual Post',
  'Sudah Tayang': 'Published',
  Ditunda: 'Postponed',
};

const LEGACY_ACTIVITY_MAP: Record<string, SessionActivityType> = {
  'Shooting iPhone': 'iPhone Shooting',
  'Voice-Over & Audio': 'Voice-Over & Audio',
  'Editing CapCut/VN': 'CapCut/VN Editing',
  'Penulisan Naskah/Cerpen': 'Script / Story Writing',
};

const LEGACY_SPONSOR_STATUS_MAP: Record<string, SponsorshipStatus> = {
  Negosiasi: 'Negotiating',
  'Dijanjikan / Invoice': 'Promised / Invoiced',
  'Diterima / Cair': 'Received / Paid',
  Dibatalkan: 'Cancelled',
};

const LEGACY_ASSET_TYPE_MAP: Record<string, LocalAssetReference['assetType']> = {
  'Raw Video iPhone': 'iPhone Raw Video',
  'Voice-Over Audio': 'Voice-Over Audio',
  'Foto / Carousel': 'Photo / Carousel',
  'Project Edit (CapCut/VN)': 'Edit Project (CapCut/VN)',
  'Musik / SFX': 'Music / SFX',
};

export function normalizeContentStage(stage: string): ContentStage {
  return LEGACY_STAGE_MAP[stage] || (stage as ContentStage) || 'Idea & Research Bank';
}

export function normalizePublicationStatus(status: string): PublicationStatus {
  return LEGACY_PUB_STATUS_MAP[status] || (status as PublicationStatus) || 'Scheduled';
}

export function normalizeSessionActivityType(act: string): SessionActivityType {
  return LEGACY_ACTIVITY_MAP[act] || (act as SessionActivityType) || 'iPhone Shooting';
}

export function normalizeSponsorshipStatus(status: string): SponsorshipStatus {
  return LEGACY_SPONSOR_STATUS_MAP[status] || (status as SponsorshipStatus) || 'Promised / Invoiced';
}

/**
 * Returns YYYY-MM-DD formatted date in Asia/Jakarta (WIB, UTC+7).
 * Handles timezone boundaries accurately (e.g., 2026-10-23T20:00:00Z is 2026-10-24 in Jakarta).
 */
export function getJakartaDateIso(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value || '2026';
  const month = parts.find((p) => p.type === 'month')?.value || '10';
  const day = parts.find((p) => p.type === 'day')?.value || '23';
  return `${year}-${month}-${day}`;
}

/**
 * Returns HH:mm formatted 24-hour time in Asia/Jakarta (WIB).
 */
export function getJakartaTimeWib(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return formatter.format(date);
}

/**
 * Adds (or subtracts) calendar days to a YYYY-MM-DD string.
 */
export function addDaysIso(isoDate: string, deltaDays: number): string {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(ms)) return isoDate;
  const next = new Date(ms + deltaDays * 86_400_000);
  return next.toISOString().slice(0, 10);
}

/**
 * Returns true if YYYY-MM-DD falls on Saturday (6) or Sunday (0).
 */
export function isWeekendIso(isoDate: string): boolean {
  const dt = new Date(`${isoDate}T00:00:00Z`);
  const day = dt.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Returns English weekday name for a YYYY-MM-DD string.
 */
export function getIndonesianDayName(isoDate: string): string {
  const dt = new Date(`${isoDate}T00:00:00Z`);
  const names = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  return names[dt.getUTCDay()] || 'Day';
}

/**
 * Computes Monday..Sunday week range for any YYYY-MM-DD date.
 */
export function getWeekRangeForDateIso(anchorIso: string): {
  weekStartIso: string;
  weekEndIso: string;
  days: string[];
} {
  const dt = new Date(`${anchorIso}T00:00:00Z`);
  const dayOfWeek = dt.getUTCDay(); // 0 = Sun, 1 = Mon, ...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStartIso = addDaysIso(anchorIso, diffToMonday);
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(weekStartIso, i));
  return {
    weekStartIso,
    weekEndIso: days[6],
    days,
  };
}

/**
 * Generates a 28/35/42-day calendar grid (Monday-first) for a given YYYY-MM month string.
 */
export function buildCalendarDaysForMonth(yearMonth: string): {
  monthLabel: string;
  days: { iso: string; inCurrentMonth: boolean; isWeekend: boolean }[];
} {
  const [yStr, mStr] = (yearMonth || '2026-10').split('-');
  const year = Number(yStr) || 2026;
  const month = Number(mStr) || 10; // 1..12
  const firstDayIso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
  const firstDt = new Date(`${firstDayIso}T00:00:00Z`);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const monthNamesEn = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const monthLabel = `${monthNamesEn[month - 1] || 'October'} ${year}`;

  const startDow = firstDt.getUTCDay(); // 0=Sun..6=Sat
  const leadingDays = startDow === 0 ? 6 : startDow - 1;
  const totalCells = Math.ceil((leadingDays + daysInMonth) / 7) * 7;
  const gridStartIso = addDaysIso(firstDayIso, -leadingDays);

  const days = Array.from({ length: totalCells }, (_, idx) => {
    const iso = addDaysIso(gridStartIso, idx);
    return {
      iso,
      inCurrentMonth: iso.startsWith(
        `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
      ),
      isWeekend: isWeekendIso(iso),
    };
  });

  return { monthLabel, days };
}

/**
 * Shifts a YYYY-MM string by deltaMonths (-1, +1, etc.).
 */
export function shiftYearMonth(yearMonth: string, deltaMonths: number): string {
  const [yStr, mStr] = (yearMonth || '2026-10').split('-');
  const dt = new Date(
    Date.UTC(Number(yStr) || 2026, (Number(mStr) || 10) - 1 + deltaMonths, 1)
  );
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export interface MigrationResult {
  status: 'ok' | 'corrupt';
  state: PrintOSState | null;
  migratedFromVersion: number;
  errorMessage?: string;
  rawCorruptPayload?: string;
}

const LEGACY_SEED_TITLES = new Set([
  'Tes Rendam Air 48 Jam: Kenapa Planter Voronoi Ini 0% Rembes?',
  'Bedah HPP & Harga Jual Naga Kristal Silk PLA (Transparan dalam Rupiah)',
  'Cerpen: "Lampu Indikator Hijau di Sudut Kamar Kos Jam 21:45"',
  'Mini Vlog Malam: Merakit 5 Macropad KBD-9 Sepulang Kerja (19:30–21:30 WIB)',
]);

const LEGACY_SEED_PROJECT_NAMES = new Set([
  'Eksperimen & Produk 3D Print Studio',
  'Jurnal Malam & Cerpen Pekerja 9-to-5 Jakarta',
]);

const LEGACY_SEED_SERIES_NAMES = new Set([
  'Uji Siksa & Bedah Kualitas 3D Print',
  'Bedah HPP & Tips Slicer Pemula',
  'Cerpen & Monolog Jam Sembilan Malam',
]);

/**
 * Backward-compatible, validated, idempotent migration for PrintOSState.
 * - Preserves all legacy v1 3D-printing entities & IDs.
 * - Normalizes any legacy Indonesian enum values to English.
 * - Never silently overwrites corrupt JSON or invalid objects with demo records.
 */
export function migratePrintOSState(
  rawInput: unknown,
  fallbackSeed: PrintOSState = INITIAL_PRINTOS_STATE
): MigrationResult {
  if (rawInput === null || rawInput === undefined || rawInput === '') {
    return {
      status: 'ok',
      state: structuredClone(fallbackSeed),
      migratedFromVersion: CURRENT_SCHEMA_VERSION,
    };
  }

  let parsedObj: any = rawInput;
  if (typeof rawInput === 'string') {
    try {
      parsedObj = JSON.parse(rawInput);
    } catch (err: any) {
      return {
        status: 'corrupt',
        state: null,
        migratedFromVersion: 0,
        errorMessage: `Corrupted or incomplete JSON data: ${err?.message || 'SyntaxError'}`,
        rawCorruptPayload: rawInput,
      };
    }
  }

  if (!parsedObj || typeof parsedObj !== 'object' || Array.isArray(parsedObj)) {
    return {
      status: 'corrupt',
      state: null,
      migratedFromVersion: 0,
      errorMessage: 'Root payload structure is not a valid PrintOS workspace object.',
      rawCorruptPayload:
        typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput),
    };
  }

  // Must have at least products and tasks arrays to be a valid v1 or v2 PrintOS workspace
  if (!Array.isArray(parsedObj.products) || !Array.isArray(parsedObj.tasks)) {
    return {
      status: 'corrupt',
      state: null,
      migratedFromVersion: 0,
      errorMessage: 'Workspace data is missing required arrays (products/tasks).',
      rawCorruptPayload:
        typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput),
    };
  }

  const fromVersion =
    typeof parsedObj.schemaVersion === 'number' ? parsedObj.schemaVersion : 1;

  const seedProductStockMap = new Map(
    fallbackSeed.products.map((p) => [p.id, p.stockQuantity])
  );
  const products: Product[] = parsedObj.products.map((p: any) => ({
    ...p,
    stockQuantity:
      typeof p.stockQuantity === 'number'
        ? p.stockQuantity
        : seedProductStockMap.get(p.id) ??
          (p.stage === 'Published' ? 6 : p.stage === 'Ready to Sell' ? 4 : 0),
  }));

  const seedTaskMap = new Map(fallbackSeed.tasks.map((t) => [t.id, t]));
  const tasks: TaskItem[] = parsedObj.tasks.map((t: any) => {
    const seedTask = seedTaskMap.get(t.id);
    const cleanTitle =
      typeof t.title === 'string'
        ? t.title.replace(/^\[Sesi Konten /, '[Content Session ')
        : t.title;
    return {
      ...t,
      title: cleanTitle,
      plannedStartDate:
        t.plannedStartDate || seedTask?.plannedStartDate || t.dueDate || '2026-10-22',
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
      sourceType: t.sourceType || 'manual',
    };
  });

  const seedProjectMap = new Map(
    (fallbackSeed.contentProjects || []).map((p) => [p.id, p])
  );
  const rawProjects: ContentProject[] = Array.isArray(parsedObj.contentProjects)
    ? parsedObj.contentProjects.map((p: ContentProject) => {
        const seedProj = seedProjectMap.get(p.id);
        if (seedProj && LEGACY_SEED_PROJECT_NAMES.has(p.name)) {
          return structuredClone(seedProj);
        }
        return p;
      })
    : structuredClone(fallbackSeed.contentProjects || []);

  const seedSeriesMap = new Map(
    (fallbackSeed.contentSeries || []).map((s) => [s.id, s])
  );
  const rawSeries: ContentSeries[] = Array.isArray(parsedObj.contentSeries)
    ? parsedObj.contentSeries.map((s: ContentSeries) => {
        const seedSer = seedSeriesMap.get(s.id);
        if (seedSer && LEGACY_SEED_SERIES_NAMES.has(s.name)) {
          return structuredClone(seedSer);
        }
        return s;
      })
    : structuredClone(fallbackSeed.contentSeries || []);

  const seedItemMap = new Map(
    (fallbackSeed.contentItems || []).map((c) => [c.id, c])
  );
  const rawItems: ContentItem[] = Array.isArray(parsedObj.contentItems)
    ? parsedObj.contentItems.map((item: ContentItem) => {
        const seedItem = seedItemMap.get(item.id);
        if (seedItem && LEGACY_SEED_TITLES.has(item.title)) {
          return {
            ...structuredClone(seedItem),
            stage: normalizeContentStage(item.stage),
          };
        }
        return {
          ...item,
          stage: normalizeContentStage(item.stage),
          localAssets: Array.isArray(item.localAssets)
            ? item.localAssets.map((a) => ({
                ...a,
                assetType:
                  LEGACY_ASSET_TYPE_MAP[a.assetType] ||
                  a.assetType ||
                  'iPhone Raw Video',
              }))
            : [],
        };
      })
    : structuredClone(fallbackSeed.contentItems || []);

  const seedPubMap = new Map(
    (fallbackSeed.contentPublications || []).map((p) => [p.id, p])
  );
  const rawPublications: ContentPublication[] = Array.isArray(
    parsedObj.contentPublications
  )
    ? parsedObj.contentPublications.map((pub: ContentPublication) => {
        const seedPub = seedPubMap.get(pub.id);
        const normalizedStatus = normalizePublicationStatus(pub.status);
        if (
          seedPub &&
          (pub.caption.includes('Beneran nggak rembes') ||
            pub.caption.includes('Uji rendam 48 jam') ||
            pub.caption.includes('Tes Bocor 48 Jam') ||
            pub.caption.includes('Transparansi HPP cetak 3D') ||
            pub.caption.includes('Bedah modal asli cetak') ||
            pub.caption.includes('Cerpen Malam: Lampu Indikator'))
        ) {
          return {
            ...structuredClone(seedPub),
            status: normalizedStatus,
            actualPublishedAtJakarta:
              pub.actualPublishedAtJakarta || seedPub.actualPublishedAtJakarta,
            actualPostUrl: pub.actualPostUrl || seedPub.actualPostUrl,
          };
        }
        return {
          ...pub,
          status: normalizedStatus,
        };
      })
    : structuredClone(fallbackSeed.contentPublications || []);

  const seedSessionMap = new Map(
    (fallbackSeed.productionSessions || []).map((s) => [s.id, s])
  );
  const rawSessions: ProductionSession[] = Array.isArray(parsedObj.productionSessions)
    ? parsedObj.productionSessions.map((sess: ProductionSession) => {
        const seedSess = seedSessionMap.get(sess.id);
        if (
          seedSess &&
          (sess.title.startsWith('Sesi Syuting Malam:') ||
            sess.title.startsWith('Sesi Akhir Pekan:'))
        ) {
          return {
            ...structuredClone(seedSess),
            completed: sess.completed,
          };
        }
        return {
          ...sess,
          activityType: normalizeSessionActivityType(sess.activityType),
        };
      })
    : structuredClone(fallbackSeed.productionSessions || []);

  const seedSponMap = new Map(
    (fallbackSeed.contentSponsorships || []).map((d) => [d.id, d])
  );
  const rawSponsorships: ContentSponsorship[] = Array.isArray(
    parsedObj.contentSponsorships
  )
    ? parsedObj.contentSponsorships.map((deal: ContentSponsorship) => {
        const seedDeal = seedSponMap.get(deal.id);
        const normStatus = normalizeSponsorshipStatus(deal.status);
        if (
          seedDeal &&
          (deal.title.includes('Uji Kekuatan eSUN') ||
            deal.title.includes('Bundling Konten Reels'))
        ) {
          return {
            ...structuredClone(seedDeal),
            status: normStatus,
            receivedDate: deal.receivedDate || seedDeal.receivedDate,
          };
        }
        return {
          ...deal,
          status: normStatus,
        };
      })
    : structuredClone(fallbackSeed.contentSponsorships || []);

  const migratedState: PrintOSState = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    syncMeta: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      lastSavedRevisionId:
        parsedObj.syncMeta?.lastSavedRevisionId ||
        fallbackSeed.syncMeta?.lastSavedRevisionId ||
        'rev-migrated-v2',
      lastSyncedAt:
        parsedObj.syncMeta?.lastSyncedAt || fallbackSeed.syncMeta?.lastSyncedAt,
      lastSpreadsheetTitle: parsedObj.syncMeta?.lastSpreadsheetTitle,
    },
    products,
    tasks,
    filaments: Array.isArray(parsedObj.filaments)
      ? parsedObj.filaments
      : structuredClone(fallbackSeed.filaments),
    printJobs: Array.isArray(parsedObj.printJobs)
      ? parsedObj.printJobs
      : structuredClone(fallbackSeed.printJobs),
    printers: Array.isArray(parsedObj.printers)
      ? parsedObj.printers
      : structuredClone(fallbackSeed.printers),
    researchNotes: Array.isArray(parsedObj.researchNotes)
      ? parsedObj.researchNotes
      : structuredClone(fallbackSeed.researchNotes),
    orders: Array.isArray(parsedObj.orders)
      ? parsedObj.orders
      : structuredClone(fallbackSeed.orders),
    financials: Array.isArray(parsedObj.financials)
      ? parsedObj.financials
      : structuredClone(fallbackSeed.financials),
    creatorCapacity:
      parsedObj.creatorCapacity && typeof parsedObj.creatorCapacity === 'object'
        ? {
            ...fallbackSeed.creatorCapacity!,
            ...parsedObj.creatorCapacity,
            strategyNotes:
              typeof parsedObj.creatorCapacity.strategyNotes === 'string' &&
              parsedObj.creatorCapacity.strategyNotes.startsWith('Kreator solo di Jakarta')
                ? fallbackSeed.creatorCapacity!.strategyNotes
                : parsedObj.creatorCapacity.strategyNotes ||
                  fallbackSeed.creatorCapacity!.strategyNotes,
            timezone: 'Asia/Jakarta',
          }
        : structuredClone(fallbackSeed.creatorCapacity!),
    contentProjects: rawProjects,
    contentSeries: rawSeries,
    contentItems: rawItems,
    contentPublications: rawPublications,
    metricSnapshots: Array.isArray(parsedObj.metricSnapshots)
      ? parsedObj.metricSnapshots
      : structuredClone(fallbackSeed.metricSnapshots || []),
    productionSessions: rawSessions,
    contentSponsorships: rawSponsorships,
    weeklyReviews: Array.isArray(parsedObj.weeklyReviews)
      ? parsedObj.weeklyReviews.map((r: any) =>
          r.id === 'wrev-1' &&
          typeof r.winsSummary === 'string' &&
          r.winsSummary.startsWith('Video tes rendam')
            ? structuredClone(fallbackSeed.weeklyReviews![0])
            : r
        )
      : structuredClone(fallbackSeed.weeklyReviews || []),
  };

  return {
    status: 'ok',
    state: migratedState,
    migratedFromVersion: fromVersion,
  };
}

/**
 * Parses "HH:mm" into minutes since 00:00.
 */
export function parseTimeWibToMinutes(hhmm: string): number {
  const [hStr, mStr] = (hhmm || '00:00').split(':');
  const h = Math.max(0, Math.min(23, Number(hStr) || 0));
  const m = Math.max(0, Math.min(59, Number(mStr) || 0));
  return h * 60 + m;
}

/**
 * Checks whether time range [startA, endA] overlaps [startB, endB].
 */
export function doTimeRangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  const sA = parseTimeWibToMinutes(startA);
  const eA = parseTimeWibToMinutes(endA);
  const sB = parseTimeWibToMinutes(startB);
  const eB = parseTimeWibToMinutes(endB);
  if (eA <= sA || eB <= sB) return false;
  return sA < eB && sB < eA;
}

/**
 * Idempotently syncs ProductionSessions into the existing TaskItem list.
 * - Uses deterministic `sourceRefId = "session:" + session.id`.
 * - Updates existing generated tasks in place without creating duplicates.
 * - Counts shared shooting effort (`session.durationMinutes`) ONLY ONCE even when
 *   a session covers multiple `contentItemIds`.
 */
export function syncContentTasksIdempotent(
  existingTasks: TaskItem[],
  sessions: ProductionSession[],
  contentItems: ContentItem[],
  referenceToday = '2026-10-23'
): { tasks: TaskItem[]; createdCount: number; updatedCount: number } {
  const contentMap = new Map(contentItems.map((c) => [c.id, c]));
  const nextTasks = [...existingTasks];
  let createdCount = 0;
  let updatedCount = 0;

  // Deduplicate sessions by id so shared sessions are processed once
  const uniqueSessions = Array.from(new Map(sessions.map((s) => [s.id, s])).values());

  for (const session of uniqueSessions) {
    const refId = `session:${session.id}`;
    const linkedItems = session.contentItemIds
      .map((id) => contentMap.get(id))
      .filter((c): c is ContentItem => Boolean(c));

    const firstLinkedProduct = linkedItems.find((c) => c.linkedProductId)?.linkedProductId;
    const firstContentId = linkedItems[0]?.id;
    const contentNames = linkedItems.map((c) => c.title).join(' + ');

    const desiredStage: TaskItem['stage'] = session.completed
      ? 'Completed'
      : session.date === referenceToday
      ? 'Today'
      : 'Backlog';

    const taskTitle = `[Content Session ${session.startTimeWib}–${session.endTimeWib} WIB] ${session.title}`;
    const taskNotes = `${session.activityType} (${session.device}) at ${session.location}. Covers ${
      linkedItems.length || 1
    } content item(s)${contentNames ? `: ${contentNames}` : ''}. ${session.notes}`.trim();

    const existingIdx = nextTasks.findIndex(
      (t) => t.sourceRefId === refId || t.id === `tsk-sess-${session.id}`
    );

    if (existingIdx !== -1) {
      const prev = nextTasks[existingIdx];
      const nextActualStart = session.completed
        ? prev.actualStartDate || session.date
        : prev.actualStartDate || '';
      const nextActualEnd = session.completed
        ? prev.actualEndDate || session.date
        : '';

      const updatedTask: TaskItem = {
        ...prev,
        title: taskTitle,
        stage: session.completed ? 'Completed' : prev.stage,
        plannedStartDate: session.date,
        dueDate: session.date,
        actualStartDate: nextActualStart,
        actualEndDate: nextActualEnd,
        linkedProductId: firstLinkedProduct || prev.linkedProductId,
        linkedContentItemId: firstContentId,
        sourceType: 'content_session',
        sourceRefId: refId,
        scheduledTimeSlotWib: `${session.startTimeWib}-${session.endTimeWib}`,
        category: 'Content',
        // Effort counted ONCE per session, never multiplied by number of content items
        estimatedMinutes: session.durationMinutes,
        notes: taskNotes,
      };

      if (JSON.stringify(prev) !== JSON.stringify(updatedTask)) {
        nextTasks[existingIdx] = updatedTask;
        updatedCount++;
      }
    } else {
      const newTask: TaskItem = {
        id: `tsk-sess-${session.id}`,
        title: taskTitle,
        stage: desiredStage,
        priority: 'High',
        plannedStartDate: session.date,
        dueDate: session.date,
        actualStartDate: session.completed ? session.date : '',
        actualEndDate: session.completed ? session.date : '',
        linkedProductId: firstLinkedProduct,
        linkedContentItemId: firstContentId,
        sourceType: 'content_session',
        sourceRefId: refId,
        scheduledTimeSlotWib: `${session.startTimeWib}-${session.endTimeWib}`,
        category: 'Content',
        estimatedMinutes: session.durationMinutes,
        checklist: linkedItems.map((item, idx) => ({
          id: `chk-${session.id}-${idx + 1}`,
          text: `Produce: ${item.title}`,
          completed: session.completed,
        })),
        notes: taskNotes,
      };
      nextTasks.unshift(newTask);
      createdCount++;
    }
  }

  return { tasks: nextTasks, createdCount, updatedCount };
}

export interface WorkloadAnalysis {
  weekStartIso: string;
  weekEndIso: string;
  weekdayEveningMinutesUsed: number;
  weekdayEveningMinutesMax: number;
  weekendMinutesUsed: number;
  weekendMinutesMax: number;
  totalSharedSessionMinutes: number;
  officeHourConflicts: {
    sessionId: string;
    title: string;
    date: string;
    dayName: string;
    timeSlot: string;
    reason: string;
  }[];
  capacityWarnings: string[];
  scheduledPublicationsThisWeek: number;
  targetPostsPerWeek: number;
}

/**
 * Analyzes creator workload and detects:
 * 1) Weekday office-hour conflicts (07:00–17:00 WIB Monday–Friday)
 * 2) Evening / Weekend capacity overloads
 * 3) Shared session effort counted strictly ONCE per unique ProductionSession
 */
export function analyzeCreatorWorkload(
  sessions: ProductionSession[],
  publications: ContentPublication[],
  capacity: CreatorCapacityConfig,
  anchorDateIso: string
): WorkloadAnalysis {
  const { weekStartIso, weekEndIso } = getWeekRangeForDateIso(anchorDateIso);

  // Deduplicate sessions by ID so multi-content batch sessions count effort only once
  const uniqueWeekSessions = Array.from(
    new Map(
      sessions
        .filter(
          (s) =>
            diffDaysISO(weekStartIso, s.date) >= 0 &&
            diffDaysISO(s.date, weekEndIso) >= 0
        )
        .map((s) => [s.id, s])
    ).values()
  );

  let weekdayEveningMinutesUsed = 0;
  let weekendMinutesUsed = 0;
  let totalSharedSessionMinutes = 0;
  const officeHourConflicts: WorkloadAnalysis['officeHourConflicts'] = [];

  for (const s of uniqueWeekSessions) {
    const mins = Math.max(0, s.durationMinutes);
    totalSharedSessionMinutes += mins;

    if (isWeekendIso(s.date)) {
      weekendMinutesUsed += mins;
    } else {
      weekdayEveningMinutesUsed += mins;
      // Check overlap with weekday office hours (e.g., 07:00–17:00 WIB)
      if (
        doTimeRangesOverlap(
          s.startTimeWib,
          s.endTimeWib,
          capacity.weekdayOfficeStart,
          capacity.weekdayOfficeEnd
        )
      ) {
        const dayName = getIndonesianDayName(s.date);
        officeHourConflicts.push({
          sessionId: s.id,
          title: s.title,
          date: s.date,
          dayName,
          timeSlot: `${s.startTimeWib}–${s.endTimeWib} WIB`,
          reason: `Conflicts with weekday office hours (${dayName}, ${capacity.weekdayOfficeStart}–${capacity.weekdayOfficeEnd} WIB). Move to evening (${capacity.weekdayEveningStart}–${capacity.weekdayEveningEnd} WIB) or weekend.`,
        });
      }
    }
  }

  const weekdayEveningMinutesMax = Math.max(
    60,
    capacity.maxWeekdayEveningHoursPerWeek * 60
  );
  const weekendMinutesMax = Math.max(60, capacity.maxWeekendHoursPerWeek * 60);

  const scheduledPublicationsThisWeek = publications.filter(
    (p) =>
      normalizePublicationStatus(p.status) !== 'Postponed' &&
      diffDaysISO(weekStartIso, p.scheduledDateJakarta) >= 0 &&
      diffDaysISO(p.scheduledDateJakarta, weekEndIso) >= 0
  ).length;

  const capacityWarnings: string[] = [];

  if (officeHourConflicts.length > 0) {
    capacityWarnings.push(
      `${officeHourConflicts.length} production session(s) conflict with primary office hours (${capacity.weekdayOfficeStart}–${capacity.weekdayOfficeEnd} WIB).`
    );
  }

  if (weekdayEveningMinutesUsed > weekdayEveningMinutesMax) {
    const overMins = weekdayEveningMinutesUsed - weekdayEveningMinutesMax;
    capacityWarnings.push(
      `Weekday evening production load (${Math.round((weekdayEveningMinutesUsed / 60) * 10) / 10}h) exceeds weekly capacity of ${capacity.maxWeekdayEveningHoursPerWeek}h/week (+${overMins}m).`
    );
  }

  if (weekendMinutesUsed > weekendMinutesMax) {
    const overMins = weekendMinutesUsed - weekendMinutesMax;
    capacityWarnings.push(
      `Weekend production load (${Math.round((weekendMinutesUsed / 60) * 10) / 10}h) exceeds weekly capacity of ${capacity.maxWeekendHoursPerWeek}h/week (+${overMins}m).`
    );
  }

  return {
    weekStartIso,
    weekEndIso,
    weekdayEveningMinutesUsed,
    weekdayEveningMinutesMax,
    weekendMinutesUsed,
    weekendMinutesMax,
    totalSharedSessionMinutes,
    officeHourConflicts,
    capacityWarnings,
    scheduledPublicationsThisWeek,
    targetPostsPerWeek: capacity.targetPostsPerWeek,
  };
}

/**
 * Formats a nullable metric value so `null` is strictly distinguished from `0`.
 * - `null` -> "— (Not recorded)"
 * - `0`    -> "0"
 */
export function formatMetricValue(
  val: number | null | undefined,
  suffix = ''
): string {
  if (val === null || val === undefined || Number.isNaN(val)) {
    return '— (Not recorded)';
  }
  const formatted = Math.round(val)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${formatted}${suffix}`;
}

export interface PublicationMetricComparison {
  publicationId: string;
  snapshot24h: MetricSnapshot | null;
  snapshot7d: MetricSnapshot | null;
  /**
   * Latest known views for this single publication (either 7d if available, else 24h, NEVER 24h + 7d).
   */
  latestViews: number | null;
  /**
   * Incremental growth between 24h and 7d (7d - 24h), only computed if BOTH 24h and 7d views are non-null numbers.
   */
  viewsGrowthAfter24h: number | null;
}

/**
 * Evaluates 24h and 7d snapshots for a single publication without ever summing cumulative 24h and 7d figures.
 */
export function summarizePublicationMetrics(
  snapshots: MetricSnapshot[],
  publicationId: string
): PublicationMetricComparison {
  const pubSnaps = snapshots.filter((s) => s.publicationId === publicationId);
  const snapshot24h = pubSnaps.find((s) => s.window === '24h') || null;
  const snapshot7d = pubSnaps.find((s) => s.window === '7d') || null;

  const latestViews =
    snapshot7d && snapshot7d.views !== null
      ? snapshot7d.views
      : snapshot24h && snapshot24h.views !== null
      ? snapshot24h.views
      : null;

  const viewsGrowthAfter24h =
    snapshot7d &&
    snapshot7d.views !== null &&
    snapshot24h &&
    snapshot24h.views !== null
      ? snapshot7d.views - snapshot24h.views
      : null;

  return {
    publicationId,
    snapshot24h,
    snapshot7d,
    latestViews,
    viewsGrowthAfter24h,
  };
}

/**
 * Summarizes metrics across multiple channel publications of a content item:
 * - Aggregates 24h window separately from 7d window.
 * - Never sums 24h + 7d of the same publication!
 * - Preserves `null` if no publication has reported a metric for that window.
 */
export function summarizeContentItemMetricsByWindow(
  snapshots: MetricSnapshot[],
  contentItemId: string
): {
  window24h: {
    views: number | null;
    likes: number | null;
    saves: number | null;
    productClicks: number | null;
    channelCount: number;
  };
  window7d: {
    views: number | null;
    likes: number | null;
    saves: number | null;
    productClicks: number | null;
    channelCount: number;
  };
} {
  const itemSnaps = snapshots.filter((s) => s.contentItemId === contentItemId);
  const snaps24 = itemSnaps.filter((s) => s.window === '24h');
  const snaps7d = itemSnaps.filter((s) => s.window === '7d');

  const sumNullable = (
    list: MetricSnapshot[],
    key: 'views' | 'likes' | 'saves' | 'productClicks'
  ): number | null => {
    const known = list
      .map((s) => s[key])
      .filter((v): v is number => typeof v === 'number');
    if (known.length === 0) return null;
    return known.reduce((acc, v) => acc + v, 0);
  };

  return {
    window24h: {
      views: sumNullable(snaps24, 'views'),
      likes: sumNullable(snaps24, 'likes'),
      saves: sumNullable(snaps24, 'saves'),
      productClicks: sumNullable(snaps24, 'productClicks'),
      channelCount: snaps24.length,
    },
    window7d: {
      views: sumNullable(snaps7d, 'views'),
      likes: sumNullable(snaps7d, 'likes'),
      saves: sumNullable(snaps7d, 'saves'),
      productClicks: sumNullable(snaps7d, 'productClicks'),
      channelCount: snaps7d.length,
    },
  };
}

export interface SponsorshipFinanceSummary {
  promisedIncomeRp: number;
  receivedIncomeRp: number;
  negotiatingIncomeRp: number;
  contentProductionExpenseRp: number;
  netReceivedCreatorRp: number;
}

/**
 * Calculates sponsorship & content expense summary, strictly separating
 * promised/invoiced income (`Promised / Invoiced`) from received cash (`Received / Paid`).
 */
export function calculateSponsorshipSummary(
  sponsorships: ContentSponsorship[]
): SponsorshipFinanceSummary {
  let promisedIncomeRp = 0;
  let receivedIncomeRp = 0;
  let negotiatingIncomeRp = 0;
  let contentProductionExpenseRp = 0;

  for (const deal of sponsorships) {
    const status = normalizeSponsorshipStatus(deal.status);
    if (status === 'Cancelled') continue;
    contentProductionExpenseRp += Math.max(0, deal.productionExpenseRp || 0);

    if (status === 'Received / Paid') {
      receivedIncomeRp += Math.max(0, deal.agreedAmountRp || 0);
    } else if (status === 'Promised / Invoiced') {
      promisedIncomeRp += Math.max(0, deal.agreedAmountRp || 0);
    } else if (status === 'Negotiating') {
      negotiatingIncomeRp += Math.max(0, deal.agreedAmountRp || 0);
    }
  }

  return {
    promisedIncomeRp,
    receivedIncomeRp,
    negotiatingIncomeRp,
    contentProductionExpenseRp,
    netReceivedCreatorRp: receivedIncomeRp - contentProductionExpenseRp,
  };
}

/**
 * Idempotently syncs ContentSponsorship records into the existing FinancialRecord ledger.
 * - ONLY posts `Income` when `status === 'Received / Paid'` (promised income is NEVER counted as received cash).
 * - Uses deterministic `sourceRefId` (`sponsorship_income:${deal.id}` and `sponsorship_expense:${deal.id}`)
 *   so repeated calls never create duplicate ledger entries.
 */
export function syncSponsorshipToFinancialsIdempotent(
  existingFinancials: FinancialRecord[],
  sponsorships: ContentSponsorship[],
  fallbackDateIso = '2026-10-23'
): { financials: FinancialRecord[]; addedCount: number; updatedCount: number } {
  let nextFinancials = [...existingFinancials];
  let addedCount = 0;
  let updatedCount = 0;

  for (const deal of sponsorships) {
    const status = normalizeSponsorshipStatus(deal.status);
    const incomeRefId = `sponsorship_income:${deal.id}`;
    const expenseRefId = `sponsorship_expense:${deal.id}`;

    // 1. Handle Received Sponsorship Income (ONLY if status === 'Received / Paid')
    const existingIncIdx = nextFinancials.findIndex(
      (f) => f.sourceRefId === incomeRefId
    );
    if (status === 'Received / Paid' && deal.agreedAmountRp > 0) {
      const desiredRecord: FinancialRecord = {
        id:
          existingIncIdx !== -1
            ? nextFinancials[existingIncIdx].id
            : `fin-spon-inc-${deal.id}`,
        date: deal.receivedDate || deal.promisedDate || fallbackDateIso,
        title: `Sponsorship Paid: ${deal.brandName} — ${deal.title}`,
        type: 'Income',
        category: 'Sponsorship & Creator Income',
        amountRp: deal.agreedAmountRp,
        linkedProductId: deal.linkedProductId,
        linkedContentItemId: deal.contentItemId,
        sourceRefId: incomeRefId,
        paymentStatus: 'Received',
        notes: `Invoice ${deal.invoiceRef}. Status: Received / Paid. ${deal.notes}`.trim(),
      };

      if (existingIncIdx !== -1) {
        if (
          JSON.stringify(nextFinancials[existingIncIdx]) !==
          JSON.stringify(desiredRecord)
        ) {
          nextFinancials[existingIncIdx] = desiredRecord;
          updatedCount++;
        }
      } else {
        nextFinancials = [desiredRecord, ...nextFinancials];
        addedCount++;
      }
    } else if (existingIncIdx !== -1) {
      // If deal was reverted from 'Received / Paid' back to 'Promised / Invoiced', remove it from settled cash ledger
      nextFinancials.splice(existingIncIdx, 1);
      updatedCount++;
    }

    // 2. Handle Content Production Expense
    const existingExpIdx = nextFinancials.findIndex(
      (f) => f.sourceRefId === expenseRefId
    );
    if (status !== 'Cancelled' && deal.productionExpenseRp > 0) {
      const desiredExpense: FinancialRecord = {
        id:
          existingExpIdx !== -1
            ? nextFinancials[existingExpIdx].id
            : `fin-spon-exp-${deal.id}`,
        date: deal.promisedDate || fallbackDateIso,
        title: `Content Production Expense: ${deal.title} (${deal.brandName})`,
        type: 'Expense',
        category: 'Content Production Expense',
        amountRp: deal.productionExpenseRp,
        linkedProductId: deal.linkedProductId,
        linkedContentItemId: deal.contentItemId,
        sourceRefId: expenseRefId,
        paymentStatus: 'Received',
        notes: `Content production props/filament expense. ${deal.notes}`.trim(),
      };

      if (existingExpIdx !== -1) {
        if (
          JSON.stringify(nextFinancials[existingExpIdx]) !==
          JSON.stringify(desiredExpense)
        ) {
          nextFinancials[existingExpIdx] = desiredExpense;
          updatedCount++;
        }
      } else {
        nextFinancials = [desiredExpense, ...nextFinancials];
        addedCount++;
      }
    }
  }

  return { financials: nextFinancials, addedCount, updatedCount };
}

/**
 * Repurposes an existing ContentItem into a new derivative ContentItem for another format or pillar.
 */
export function repurposeContentItem(
  source: ContentItem,
  targetFormat: ContentFormat,
  targetPillar: ContentPillar = source.pillar,
  todayIso = '2026-10-23'
): ContentItem {
  const formatLabelMap: Record<ContentFormat, string> = {
    short_video: 'Short Video',
    carousel: 'Carousel Slides',
    mini_vlog: 'Mini Vlog',
    cerpen: 'Short Story / Text',
  };

  const slides =
    targetFormat === 'carousel' && source.carouselSlides.length === 0
      ? [
          {
            id: `sld-rep-1-${Date.now()}`,
            slideNumber: 1,
            headline: source.brief.hook || source.title,
            bodyCopy: source.brief.keyMessage,
            visualPromptOrPhotoRef: 'Select best keyframe or photo from source content.',
          },
          {
            id: `sld-rep-2-${Date.now()}`,
            slideNumber: 2,
            headline: 'Core Breakdown & Findings',
            bodyCopy: source.scriptText.slice(0, 220),
            visualPromptOrPhotoRef: 'Technical details / step-by-step visuals.',
          },
          {
            id: `sld-rep-3-${Date.now()}`,
            slideNumber: 3,
            headline: 'Takeaway & Next Step',
            bodyCopy: source.brief.callToAction,
            visualPromptOrPhotoRef: 'Closing CTA slide.',
          },
        ]
      : structuredClone(source.carouselSlides);

  return {
    ...structuredClone(source),
    id: `cnt-rep-${Date.now()}`,
    title: `[Repurpose → ${formatLabelMap[targetFormat]}] ${source.title}`,
    pillar: targetPillar,
    format: targetFormat,
    stage: 'Brief',
    targetPublishDate: addDaysIso(todayIso, 4),
    voiceOverEnabled:
      targetFormat === 'short_video' || targetFormat === 'mini_vlog',
    carouselSlides: slides,
    shots:
      targetFormat === 'cerpen'
        ? []
        : structuredClone(source.shots).map((s) => ({ ...s, completed: false })),
    qcChecklist: source.qcChecklist.map((c, idx) => ({
      id: `cqc-rep-${Date.now()}-${idx}`,
      text: c.text,
      completed: false,
    })),
    repurposedFromId: source.id,
    nextAction: `Adapt repurposed script from "${source.title}" for ${formatLabelMap[targetFormat]} format.`,
    updatedAt: todayIso,
  };
}

/**
 * Exports a complete, connected ContentItem brief, script/slides, shot list, local assets,
 * QC checklist, publications, and metrics into clean English Markdown (for .md download & print).
 */
export function exportContentBriefMarkdown(
  item: ContentItem,
  context: {
    project?: ContentProject;
    series?: ContentSeries;
    product?: Product;
    publications: ContentPublication[];
    sessions: ProductionSession[];
    snapshots: MetricSnapshot[];
  }
): string {
  const lines: string[] = [];
  const pillarLabel =
    item.pillar === '3d_marketing'
      ? '3D Print Marketing (Products & Workshop)'
      : 'Personal / Story / Educational Content';

  lines.push(`# CONTENT PRODUCTION BRIEF — ${item.title}`);
  lines.push('');
  lines.push(`- **Content ID**: \`${item.id}\``);
  lines.push(`- **Pillar**: ${pillarLabel}`);
  lines.push(`- **Format**: \`${item.format}\``);
  lines.push(`- **Current Stage**: **${item.stage}**`);
  lines.push(`- **Project**: ${context.project?.name || 'General'}`);
  if (context.series) {
    lines.push(
      `- **Series**: ${context.series.name} (${context.series.cadenceLabel})`
    );
  }
  lines.push(
    `- **Linked 3D Print Product (Optional)**: ${
      context.product
        ? `${context.product.name} (${context.product.sku} — ${formatRupiah(
            context.product.sellingPriceRp
          )})`
        : 'Not linked to any product (Independent Content)'
    }`
  );
  lines.push(`- **Target Publish Date (WIB)**: ${item.targetPublishDate}`);
  lines.push(
    `- **Voice-Over (VO)**: ${
      item.voiceOverEnabled
        ? `Yes (${item.voiceOverScriptOrNotes || 'Record on iPhone'})`
        : 'No Voice-Over'
    }`
  );
  if (item.repurposedFromId) {
    lines.push(`- **Repurposed From ID**: \`${item.repurposedFromId}\``);
  }
  lines.push('');

  lines.push('## 1. Creative Brief');
  lines.push(`- **Hook (First 3 Seconds / Opening Line)**: ${item.brief.hook || '—'}`);
  lines.push(`- **Key Message**: ${item.brief.keyMessage || '—'}`);
  lines.push(`- **Target Audience**: ${item.brief.targetAudience || '—'}`);
  lines.push(`- **Call to Action (CTA)**: ${item.brief.callToAction || '—'}`);
  if (item.brief.estimatedDurationSec > 0) {
    lines.push(`- **Target Duration**: ${item.brief.estimatedDurationSec} seconds`);
  }
  lines.push('');

  lines.push('## 2. Research References & Fact Checks');
  if (item.references.length === 0) {
    lines.push('_No reference notes added yet._');
  } else {
    for (const ref of item.references) {
      lines.push(
        `- [${ref.verified ? 'x' : ' '}] **${ref.title}**${
          ref.url ? ` (${ref.url})` : ''
        } — ${ref.factCheckNote}`
      );
    }
  }
  lines.push('');

  lines.push('## 3. Script / Short Story / Carousel Slides');
  if (item.scriptText.trim()) {
    lines.push('### Main Script / Narrative Text');
    lines.push(item.scriptText);
    lines.push('');
  }
  if (item.carouselSlides.length > 0) {
    lines.push('### Carousel Slide Deck');
    for (const slide of item.carouselSlides) {
      lines.push(
        `${slide.slideNumber}. **${slide.headline}** — ${slide.bodyCopy} _(Visual: ${slide.visualPromptOrPhotoRef})_`
      );
    }
    lines.push('');
  }

  lines.push('## 4. Camera Shot List (iPhone)');
  if (item.shots.length === 0) {
    lines.push(
      '_No video shots required (Text / Short Story format or not added yet)._'
    );
  } else {
    for (const shot of item.shots) {
      lines.push(
        `- [${shot.completed ? 'x' : ' '}] **Shot #${shot.shotNumber}** (${
          shot.durationSec
        }s | ${shot.iphoneSetting} | ${shot.location}): ${
          shot.visualAngle
        } — _Audio/Action: ${shot.audioOrAction}_`
      );
    }
  }
  lines.push('');

  lines.push('## 5. Local Asset File References (Stored on Device / iPhone)');
  lines.push(
    '> _Note: The list below tracks local filenames on your device/iPhone storage, not cloud uploads._'
  );
  if (item.localAssets.length === 0) {
    lines.push('_No local file references recorded yet._');
  } else {
    for (const asset of item.localAssets) {
      lines.push(
        `- **\`${asset.fileName}\`** [${asset.assetType}] — Location: ${asset.devicePathOrAlbum} (${asset.notes})`
      );
    }
  }
  lines.push('');

  lines.push('## 6. Scheduled Production Sessions (WIB)');
  const linkedSessions = context.sessions.filter((s) =>
    s.contentItemIds.includes(item.id)
  );
  if (linkedSessions.length === 0) {
    lines.push('_Not yet assigned to an evening/weekend production session._');
  } else {
    for (const sess of linkedSessions) {
      lines.push(
        `- [${sess.completed ? 'x' : ' '}] **${sess.date} (${sess.startTimeWib}–${
          sess.endTimeWib
        } WIB, ${sess.durationMinutes} min)**: ${sess.title} — ${sess.device}`
      );
    }
  }
  lines.push('');

  lines.push('## 7. Quality Control (QC) Checklist');
  for (const qc of item.qcChecklist) {
    lines.push(`- [${qc.completed ? 'x' : ' '}] ${qc.text}`);
  }
  lines.push('');

  lines.push('## 8. Multi-Channel Publication Schedule & Status (Manual Confirmation)');
  const itemPubs = context.publications.filter((p) => p.contentItemId === item.id);
  if (itemPubs.length === 0) {
    lines.push('_No channel publications scheduled yet._');
  } else {
    for (const pub of itemPubs) {
      const cmp = summarizePublicationMetrics(context.snapshots, pub.id);
      lines.push(
        `### ${pub.channel} — Status: ${pub.status} (Scheduled: ${pub.scheduledDateJakarta} ${pub.scheduledTimeJakarta} WIB)`
      );
      lines.push(`- **Caption**: ${pub.caption}`);
      lines.push(`- **Hashtags**: ${pub.hashtags}`);
      lines.push(
        `- **Actual Published At**: ${
          pub.actualPublishedAtJakarta || 'Not yet confirmed live'
        }`
      );
      lines.push(`- **Actual Post URL**: ${pub.actualPostUrl || '—'}`);
      if (cmp.snapshot24h || cmp.snapshot7d) {
        lines.push(
          `- **24-Hour Metrics**: Views ${formatMetricValue(
            cmp.snapshot24h?.views
          )}, Likes ${formatMetricValue(
            cmp.snapshot24h?.likes
          )}, Saves ${formatMetricValue(
            cmp.snapshot24h?.saves
          )}, Product Clicks ${formatMetricValue(cmp.snapshot24h?.productClicks)}`
        );
        lines.push(
          `- **7-Day Metrics (Cumulative)**: Views ${formatMetricValue(
            cmp.snapshot7d?.views
          )}, Likes ${formatMetricValue(
            cmp.snapshot7d?.likes
          )}, Saves ${formatMetricValue(
            cmp.snapshot7d?.saves
          )}, Product Clicks ${formatMetricValue(cmp.snapshot7d?.productClicks)}`
        );
      }
      lines.push('');
    }
  }

  lines.push(`## 9. Next Action`);
  lines.push(item.nextAction || 'Proceed to the next workflow stage.');
  lines.push('');

  return lines.join('\n');
}
