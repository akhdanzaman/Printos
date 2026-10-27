import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  ContentItem,
  ContentPublication,
  CustomerOrder,
  FilamentSpool,
  FinancialRecord,
  PrintJob,
  PrintOSState,
  Product,
  TaskItem,
} from '../types/printos';
import { CURRENT_SCHEMA_VERSION, migratePrintOSState } from '../utils/contentStudio';

export const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// App-owned Google Sheets tab names (never touches or wipes user's custom tabs)
export const APP_TAB_META = 'PrintOS_Meta';
export const APP_TAB_SNAPSHOTS = 'PrintOS_Snapshots';
export const APP_TAB_CATALOG = 'PrintOS_Catalog';
export const APP_TAB_TASKS = 'PrintOS_Tasks';
export const APP_TAB_CONTENT = 'PrintOS_Content';

export const REQUIRED_APP_TABS = [
  APP_TAB_META,
  APP_TAB_SNAPSHOTS,
  APP_TAB_CATALOG,
  APP_TAB_TASKS,
  APP_TAB_CONTENT,
];

const MAX_SNAPSHOT_HISTORY = 10;
const CHUNK_CHAR_LIMIT = 25000;

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
// Cache the access token in memory ONLY (never in localStorage or sessionStorage).
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google Sheets access token.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Google Sign-In error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logoutGoogle = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

/**
 * Extracts a Google Spreadsheet ID from a full sharing URL or raw ID string.
 */
export function extractSpreadsheetId(input: string): string | null {
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

/**
 * Protects human-readable cells against spreadsheet formula injection (`=`, `+`, `-`, `@`)
 * even if exported or viewed in external spreadsheet tools.
 */
export function sanitizeSpreadsheetText(value: string | number | null | undefined): string | number {
  if (typeof value === 'number') return value;
  const str = String(value ?? '');
  if (!str) return '';
  if (/^[=+\-@]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

export function unsanitizeSpreadsheetText(value: string | undefined): string {
  const str = String(value ?? '');
  if (str.length >= 2 && str.startsWith("'") && /^[=+\-@]/.test(str.slice(1))) {
    return str.slice(1);
  }
  return str;
}

/**
 * Splits a JSON string into dynamic chunks of at most `chunkSize` characters
 * so no cell ever exceeds Google Sheets' 50,000-character cell limit.
 */
export function splitJsonIntoChunks(jsonString: string, chunkSize = CHUNK_CHAR_LIMIT): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < jsonString.length; i += chunkSize) {
    chunks.push(jsonString.slice(i, i + chunkSize));
  }
  if (chunks.length === 0) chunks.push('{}');
  return chunks;
}

export interface SpreadsheetRevisionEntry {
  revisionId: string;
  savedAt: string;
  parentRevisionId: string;
  schemaVersion: number;
  summaryText: string;
  payloadLength: number;
  state: PrintOSState;
}

/**
 * Builds a single versioned snapshot row for `PrintOS_Snapshots`.
 */
export function createVersionedSnapshotRow(
  state: PrintOSState,
  options?: {
    revisionId?: string;
    savedAt?: string;
    parentRevisionId?: string;
  }
): {
  revisionId: string;
  savedAt: string;
  parentRevisionId: string;
  payloadLength: number;
  chunkCount: number;
  snapshotRow: (string | number)[];
} {
  const savedAt = options?.savedAt || new Date().toISOString();
  const revisionId =
    options?.revisionId ||
    `rev-${savedAt.replace(/[^0-9]/g, '').slice(0, 14)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
  const parentRevisionId =
    options?.parentRevisionId || state.syncMeta?.lastSavedRevisionId || 'root';

  const stateWithMeta: PrintOSState = {
    ...state,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    syncMeta: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      lastSavedRevisionId: revisionId,
      lastSyncedAt: savedAt,
      lastSpreadsheetTitle: state.syncMeta?.lastSpreadsheetTitle,
    },
  };

  const jsonPayload = JSON.stringify(stateWithMeta);
  const chunks = splitJsonIntoChunks(jsonPayload, CHUNK_CHAR_LIMIT);
  const summaryText = `${stateWithMeta.products.length} products, ${stateWithMeta.tasks.length} tasks, ${
    stateWithMeta.contentItems?.length || 0
  } content items`;

  const snapshotRow: (string | number)[] = [
    'PRINTOS_SNAPSHOT_V2',
    revisionId,
    savedAt,
    parentRevisionId,
    CURRENT_SCHEMA_VERSION,
    summaryText,
    jsonPayload.length,
    chunks.length,
    ...chunks,
  ];

  return {
    revisionId,
    savedAt,
    parentRevisionId,
    payloadLength: jsonPayload.length,
    chunkCount: chunks.length,
    snapshotRow,
  };
}

/**
 * Parses a `PRINTOS_SNAPSHOT_V2` row dynamically (regardless of how many chunks it spans).
 */
export function parseVersionedSnapshotRow(row: string[]): SpreadsheetRevisionEntry | null {
  if (!Array.isArray(row) || row[0] !== 'PRINTOS_SNAPSHOT_V2') {
    return null;
  }
  const revisionId = String(row[1] || '');
  const savedAt = String(row[2] || '');
  const parentRevisionId = String(row[3] || 'root');
  const schemaVersion = Number(row[4]) || 2;
  const summaryText = String(row[5] || '');
  const expectedLength = Number(row[6]) || 0;
  const chunkCount = Math.max(1, Number(row[7]) || 1);

  const chunks = row.slice(8, 8 + chunkCount);
  if (chunks.length < chunkCount) {
    throw new Error(
      `Snapshot revision ${revisionId} is truncated: expected ${chunkCount} chunks but only found ${chunks.length}.`
    );
  }

  const joinedJson = chunks.join('');
  if (expectedLength > 0 && joinedJson.length !== expectedLength) {
    throw new Error(
      `Snapshot length verification failed for revision ${revisionId}: expected ${expectedLength} characters, read ${joinedJson.length}.`
    );
  }

  const migrated = migratePrintOSState(joinedJson);
  if (migrated.status !== 'ok' || !migrated.state) {
    throw new Error(
      migrated.errorMessage || `Failed to validate snapshot payload for revision ${revisionId}.`
    );
  }

  return {
    revisionId,
    savedAt,
    parentRevisionId,
    schemaVersion,
    summaryText,
    payloadLength: joinedJson.length,
    state: migrated.state,
  };
}

/**
 * Converts PrintOSState into structured 2D row arrays for app-owned human-readable tabs
 * (`PrintOS_Catalog`, `PrintOS_Tasks`, `PrintOS_Content`) plus backward-compatible `summaryRows`.
 */
export function serializeStateToSheetRows(state: PrintOSState): {
  summaryRows: (string | number)[][];
  productRows: (string | number)[][];
  taskRows: (string | number)[][];
  contentRows: (string | number)[][];
} {
  const updatedAt = new Date().toISOString();
  const jsonString = JSON.stringify(state);
  const chunks = splitJsonIntoChunks(jsonString, 30000);

  const summaryRows: (string | number)[][] = [
    ['PRINTOS_SPREADSHEET_SYNC_V1', updatedAt, chunks.length, ...chunks],
    [],
    [
      '=== PRODUCT CATALOG ===',
      'SKU',
      'Stage',
      'Category',
      'Filament',
      'Grams',
      'Print Time (min)',
      'Cost (Rp)',
      'Selling Price (Rp)',
      'Ready Stock (pcs)',
      'Units Sold',
    ],
    ...state.products.map((p: Product) => [
      sanitizeSpreadsheetText(p.name),
      sanitizeSpreadsheetText(p.sku),
      p.stage,
      sanitizeSpreadsheetText(p.category),
      sanitizeSpreadsheetText(p.filamentMaterial),
      p.filamentGrams,
      p.printTimeMinutes,
      p.productionCostRp,
      p.sellingPriceRp,
      p.stockQuantity ?? 0,
      p.unitsSold,
    ]),
    [],
    [
      '=== TASKS & GANTT SCHEDULE ===',
      'Stage',
      'Priority',
      'Category',
      'Planned Start',
      'Planned Due',
      'Actual Start',
      'Actual Finished',
      'Est. Minutes',
      'Notes',
    ],
    ...state.tasks.map((t: TaskItem) => [
      sanitizeSpreadsheetText(t.title),
      t.stage,
      t.priority,
      t.category,
      t.plannedStartDate || t.dueDate,
      t.dueDate,
      t.actualStartDate || '',
      t.actualEndDate || '',
      t.estimatedMinutes,
      sanitizeSpreadsheetText(t.notes),
    ]),
    [],
    [
      '=== FILAMENT INVENTORY ===',
      'Brand',
      'Material',
      'Color',
      'Remaining (g)',
      'Initial (g)',
      'Price (Rp)',
      'Status',
      'Printer',
    ],
    ...state.filaments.map((f: FilamentSpool) => [
      sanitizeSpreadsheetText(f.name),
      sanitizeSpreadsheetText(f.brand),
      f.material,
      sanitizeSpreadsheetText(f.colorName),
      f.remainingWeightGrams,
      f.initialWeightGrams,
      f.purchasePriceRp,
      f.stage,
      sanitizeSpreadsheetText(f.assignedPrinter || ''),
    ]),
    [],
    [
      '=== PRINT JOBS ===',
      'Stage',
      'Printer ID',
      'Batch Qty',
      'Print Time (min)',
      'Filament Used (g)',
      'Order Ref',
    ],
    ...state.printJobs.map((j: PrintJob) => [
      sanitizeSpreadsheetText(j.jobTitle),
      j.stage,
      j.printerId,
      j.batchQuantity,
      j.printTimeMinutes,
      j.filamentGramsUsed,
      sanitizeSpreadsheetText(j.customerOrderRef || ''),
    ]),
    [],
    [
      '=== CUSTOMER ORDERS ===',
      'Customer',
      'Channel',
      'Stage',
      'Qty',
      'Total (Rp)',
      'Cost (Rp)',
      'Due Date',
    ],
    ...state.orders.map((o: CustomerOrder) => [
      sanitizeSpreadsheetText(o.orderNumber),
      sanitizeSpreadsheetText(o.customerName),
      o.channel,
      o.stage,
      o.quantity,
      o.totalAmountRp,
      o.costAmountRp,
      o.dueDate,
    ]),
    [],
    [
      '=== FINANCIAL LEDGER (Rp) ===',
      'Date',
      'Type',
      'Category',
      'Amount (Rp)',
      'Notes',
    ],
    ...state.financials.map((fin: FinancialRecord) => [
      sanitizeSpreadsheetText(fin.title),
      fin.date,
      fin.type,
      fin.category,
      fin.amountRp,
      sanitizeSpreadsheetText(fin.notes),
    ]),
  ];

  const productRows: (string | number)[][] = [
    [
      'ID',
      'Name',
      'SKU',
      'Stage',
      'Category',
      'Dimensions',
      'Filament Material',
      'Weight (g)',
      'Print Time (min)',
      'Production Cost (Rp)',
      'Selling Price (Rp)',
      'Stock Quantity (pcs)',
      'Units Sold',
      'STL File',
      'Notes',
    ],
    ...state.products.map((p) => [
      p.id,
      sanitizeSpreadsheetText(p.name),
      sanitizeSpreadsheetText(p.sku),
      p.stage,
      sanitizeSpreadsheetText(p.category),
      sanitizeSpreadsheetText(p.dimensions),
      sanitizeSpreadsheetText(p.filamentMaterial),
      p.filamentGrams,
      p.printTimeMinutes,
      p.productionCostRp,
      p.sellingPriceRp,
      p.stockQuantity ?? 0,
      p.unitsSold,
      sanitizeSpreadsheetText(p.stlFileName),
      sanitizeSpreadsheetText(p.notes),
    ]),
  ];

  const taskRows: (string | number)[][] = [
    [
      'ID',
      'Title',
      'Stage',
      'Priority',
      'Category',
      'Planned Start Date',
      'Planned Due Date',
      'Actual Start Date',
      'Actual Finished Date',
      'Estimated Minutes',
      'Source Type',
      'Notes',
    ],
    ...state.tasks.map((t) => [
      t.id,
      sanitizeSpreadsheetText(t.title),
      t.stage,
      t.priority,
      t.category,
      t.plannedStartDate || t.dueDate,
      t.dueDate,
      t.actualStartDate || '',
      t.actualEndDate || '',
      t.estimatedMinutes,
      t.sourceType || 'manual',
      sanitizeSpreadsheetText(t.notes),
    ]),
  ];

  const contentItems: ContentItem[] = state.contentItems || [];
  const publications: ContentPublication[] = state.contentPublications || [];

  const contentRows: (string | number)[][] = [
    [
      'Content ID',
      'Content Title',
      'Pillar',
      'Format',
      'Stage',
      'Target Publish Date (WIB)',
      'Linked Product',
      'Voice-Over',
      'Brief Hook',
      'Next Action',
    ],
    ...contentItems.map((c) => [
      c.id,
      sanitizeSpreadsheetText(c.title),
      c.pillar,
      c.format,
      c.stage,
      c.targetPublishDate,
      c.linkedProductId || '',
      c.voiceOverEnabled ? 'Yes' : 'No',
      sanitizeSpreadsheetText(c.brief.hook),
      sanitizeSpreadsheetText(c.nextAction),
    ]),
    [],
    [
      '=== MULTI-CHANNEL PUBLICATIONS ===',
      'Content ID',
      'Channel',
      'Status',
      'Schedule (WIB)',
      'Actual Published At',
      'Post URL',
      'Caption',
    ],
    ...publications.map((pub) => [
      pub.id,
      pub.contentItemId,
      pub.channel,
      pub.status,
      `${pub.scheduledDateJakarta} ${pub.scheduledTimeJakarta}`,
      pub.actualPublishedAtJakarta || '',
      sanitizeSpreadsheetText(pub.actualPostUrl || ''),
      sanitizeSpreadsheetText(pub.caption),
    ]),
  ];

  return { summaryRows, productRows, taskRows, contentRows };
}

/**
 * Parses rows retrieved from a PrintOS Google Sheet (either V2 `PrintOS_Snapshots` or legacy V1)
 * back into a validated, migrated PrintOSState.
 */
export function deserializeSheetRowsToState(
  rows: string[][],
  _fallbackState: PrintOSState
): {
  state: PrintOSState;
  syncedAt: string;
  revisionId?: string;
  revisions?: SpreadsheetRevisionEntry[];
} {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('The spreadsheet is empty or contains no readable rows.');
  }

  // Case A: App-owned `PrintOS_Snapshots` tab rows (row 0 may be header or `PRINTOS_SNAPSHOT_V2`)
  const snapshotRows = rows.filter((r) => Array.isArray(r) && r[0] === 'PRINTOS_SNAPSHOT_V2');
  if (snapshotRows.length > 0) {
    const parsedRevisions: SpreadsheetRevisionEntry[] = [];
    for (const r of snapshotRows) {
      const entry = parseVersionedSnapshotRow(r);
      if (entry) parsedRevisions.push(entry);
    }
    if (parsedRevisions.length === 0) {
      throw new Error('No valid PrintOS V2 snapshots found in PrintOS_Snapshots tab.');
    }
    const latest = parsedRevisions[0];
    return {
      state: latest.state,
      syncedAt: latest.savedAt,
      revisionId: latest.revisionId,
      revisions: parsedRevisions,
    };
  }

  // Case B: Legacy V1 single-tab format (`PRINTOS_SPREADSHEET_SYNC_V1`)
  const firstRow = rows[0] || [];
  if (firstRow[0] === 'PRINTOS_SPREADSHEET_SYNC_V1') {
    const syncedAt = String(firstRow[1] || new Date().toISOString());
    const chunkCount = Math.max(1, Number(firstRow[2]) || 1);
    const jsonPayload = firstRow.slice(3, 3 + chunkCount).join('');
    const migration = migratePrintOSState(jsonPayload);
    if (migration.status !== 'ok' || !migration.state) {
      throw new Error(
        migration.errorMessage || 'JSON data in the V1 spreadsheet is corrupted or unreadable.'
      );
    }
    const parsed = migration.state;

    // Apply any direct cell edits made by the user in the Product Catalog or Tasks tables below row 1
    const productHeaderIdx = rows.findIndex(
      (r) => r && r[0] === '=== PRODUCT CATALOG ==='
    );
    const taskHeaderIdx = rows.findIndex(
      (r) => r && r[0] === '=== TASKS & GANTT SCHEDULE ==='
    );

    if (productHeaderIdx !== -1 && Array.isArray(parsed.products)) {
      const updatedProducts: Product[] = [...parsed.products];
      for (let i = productHeaderIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r[0] || String(r[0]).startsWith('===')) break;
        const cleanName = unsanitizeSpreadsheetText(r[0]);
        const cleanSku = unsanitizeSpreadsheetText(r[1]);
        const matchIdx = updatedProducts.findIndex(
          (p) => p.sku === cleanSku || p.name === cleanName
        );
        if (matchIdx !== -1) {
          updatedProducts[matchIdx] = {
            ...updatedProducts[matchIdx],
            name: cleanName || updatedProducts[matchIdx].name,
            sku: cleanSku || updatedProducts[matchIdx].sku,
            stage: (r[2] as Product['stage']) || updatedProducts[matchIdx].stage,
            category:
              unsanitizeSpreadsheetText(r[3]) || updatedProducts[matchIdx].category,
            filamentMaterial:
              unsanitizeSpreadsheetText(r[4]) ||
              updatedProducts[matchIdx].filamentMaterial,
            filamentGrams: Number(r[5]) || updatedProducts[matchIdx].filamentGrams,
            printTimeMinutes:
              Number(r[6]) || updatedProducts[matchIdx].printTimeMinutes,
            productionCostRp:
              r[7] !== undefined && r[7] !== ''
                ? Number(r[7])
                : updatedProducts[matchIdx].productionCostRp,
            sellingPriceRp:
              r[8] !== undefined && r[8] !== ''
                ? Number(r[8])
                : updatedProducts[matchIdx].sellingPriceRp,
            stockQuantity:
              r[9] !== undefined && r[9] !== ''
                ? Number(r[9])
                : updatedProducts[matchIdx].stockQuantity,
            unitsSold:
              r[10] !== undefined && r[10] !== ''
                ? Number(r[10])
                : updatedProducts[matchIdx].unitsSold,
          };
        }
      }
      parsed.products = updatedProducts;
    }

    if (taskHeaderIdx !== -1 && Array.isArray(parsed.tasks)) {
      const updatedTasks: TaskItem[] = [...parsed.tasks];
      for (let i = taskHeaderIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r[0] || String(r[0]).startsWith('===')) break;
        const cleanTitle = unsanitizeSpreadsheetText(r[0]);
        const matchIdx = updatedTasks.findIndex((t) => t.title === cleanTitle);
        if (matchIdx !== -1) {
          updatedTasks[matchIdx] = {
            ...updatedTasks[matchIdx],
            title: cleanTitle || updatedTasks[matchIdx].title,
            stage: (r[1] as TaskItem['stage']) || updatedTasks[matchIdx].stage,
            priority:
              (r[2] as TaskItem['priority']) || updatedTasks[matchIdx].priority,
            category:
              (r[3] as TaskItem['category']) || updatedTasks[matchIdx].category,
            plannedStartDate: String(
              r[4] || updatedTasks[matchIdx].plannedStartDate
            ),
            dueDate: String(r[5] || updatedTasks[matchIdx].dueDate),
            actualStartDate: r[6] !== undefined ? String(r[6]) : '',
            actualEndDate: r[7] !== undefined ? String(r[7]) : '',
            estimatedMinutes:
              Number(r[8]) || updatedTasks[matchIdx].estimatedMinutes,
          };
        }
      }
      parsed.tasks = updatedTasks;
    }

    return {
      state: parsed,
      syncedAt,
      revisionId: 'rev-legacy-v1',
      revisions: [
        {
          revisionId: 'rev-legacy-v1',
          savedAt: syncedAt,
          parentRevisionId: 'root',
          schemaVersion: 1,
          summaryText: `${parsed.products.length} products (V1 Format)`,
          payloadLength: jsonPayload.length,
          state: parsed,
        },
      ],
    };
  }

  throw new Error(
    'This spreadsheet does not contain PrintOS data yet. Click "Save" first to initialize the PrintOS_Meta & PrintOS_Snapshots tabs.'
  );
}

/**
 * Fetches metadata of the spreadsheet (title & all sheet tab names) using Google Sheets API v4.
 */
export async function fetchSpreadsheetMetadata(
  spreadsheetId: string,
  accessToken: string
): Promise<{ title: string; firstSheetName: string; sheetNames: string[] }> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}?fields=properties.title,sheets.properties.title`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg =
      errBody?.error?.message ||
      `Google Sheets API returned status ${res.status}. Ensure you are signed in and have access to the spreadsheet.`;
    throw new Error(msg);
  }

  const data = await res.json();
  const title = data?.properties?.title || 'Shared Spreadsheet';
  const sheetNames: string[] = (data?.sheets || [])
    .map((s: any) => s?.properties?.title)
    .filter(Boolean);
  const firstSheetName = sheetNames[0] || 'Sheet1';
  return { title, firstSheetName, sheetNames };
}

/**
 * Ensures all app-owned tabs (`PrintOS_Meta`, `PrintOS_Snapshots`, `PrintOS_Catalog`, `PrintOS_Tasks`, `PrintOS_Content`)
 * exist in the spreadsheet without modifying or deleting any user-created tabs.
 */
export async function ensureAppOwnedTabsExist(
  spreadsheetId: string,
  existingSheetNames: string[],
  accessToken: string
): Promise<void> {
  const missingTabs = REQUIRED_APP_TABS.filter(
    (tab) => !existingSheetNames.includes(tab)
  );
  if (missingTabs.length === 0) return;

  const requests = missingTabs.map((title) => ({
    addSheet: {
      properties: {
        title,
      },
    },
  }));

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    }
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message ||
        `Failed to create PrintOS_* application tabs (HTTP ${res.status}). Ensure you have Edit permissions.`
    );
  }
}

/**
 * Checks the remote spreadsheet's `PrintOS_Meta` tab to detect whether a newer revision
 * exists remotely than the local workspace's `lastSavedRevisionId` (stale revision detection).
 */
export async function checkRemoteSpreadsheetRevision(
  spreadsheetUrlOrId: string,
  localRevisionId: string | undefined,
  accessToken: string
): Promise<{
  hasRemoteData: boolean;
  isStale: boolean;
  remoteRevisionId?: string;
  remoteSavedAt?: string;
  spreadsheetTitle: string;
}> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrlOrId);
  if (!spreadsheetId) {
    throw new Error('Invalid Google Spreadsheet link or ID.');
  }

  const { title, sheetNames } = await fetchSpreadsheetMetadata(
    spreadsheetId,
    accessToken
  );

  if (!sheetNames.includes(APP_TAB_META)) {
    return {
      hasRemoteData: false,
      isStale: false,
      spreadsheetTitle: title,
    };
  }

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`${APP_TAB_META}!A1:H5`)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    return {
      hasRemoteData: false,
      isStale: false,
      spreadsheetTitle: title,
    };
  }

  const data = await res.json();
  const rows: string[][] = data?.values || [];
  const metaRow = rows.find((r) => r && r[0] === 'PRINTOS_META_V2');
  if (!metaRow) {
    return {
      hasRemoteData: false,
      isStale: false,
      spreadsheetTitle: title,
    };
  }

  const remoteRevisionId = String(metaRow[1] || '');
  const remoteSavedAt = String(metaRow[2] || '');
  const isStale = Boolean(
    remoteRevisionId &&
      localRevisionId &&
      localRevisionId !== 'rev-seed-v2' &&
      remoteRevisionId !== localRevisionId
  );

  return {
    hasRemoteData: Boolean(remoteRevisionId),
    isStale,
    remoteRevisionId,
    remoteSavedAt,
    spreadsheetTitle: title,
  };
}

/**
 * Non-destructively saves the PrintOS workspace state to app-owned tabs (`PrintOS_Meta`, `PrintOS_Snapshots`,
 * `PrintOS_Catalog`, `PrintOS_Tasks`, `PrintOS_Content`):
 * - Preserves up to 10 previous snapshot revisions in `PrintOS_Snapshots` so previous versions are recoverable.
 * - Uses `valueInputOption=RAW` for safe literal text storage (preventing formula injection).
 * - Performs read-back verification of `PrintOS_Meta` and `PrintOS_Snapshots` before confirming success.
 */
export async function saveWorkspaceToSpreadsheet(
  spreadsheetUrlOrId: string,
  state: PrintOSState,
  accessToken: string
): Promise<{
  spreadsheetTitle: string;
  sheetTabName: string;
  rowCount: number;
  revisionId: string;
  savedAt: string;
  verifiedReadBack: boolean;
}> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrlOrId);
  if (!spreadsheetId) {
    throw new Error('Please enter a valid Google Sheets sharing link or Spreadsheet ID.');
  }

  const { title, sheetNames } = await fetchSpreadsheetMetadata(
    spreadsheetId,
    accessToken
  );

  await ensureAppOwnedTabsExist(spreadsheetId, sheetNames, accessToken);

  // 1. Read existing snapshots from `PrintOS_Snapshots` so we preserve recoverable previous revisions
  let existingSnapshotRows: string[][] = [];
  if (sheetNames.includes(APP_TAB_SNAPSHOTS)) {
    const snapRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${encodeURIComponent(`${APP_TAB_SNAPSHOTS}!1:25`)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (snapRes.ok) {
      const snapData = await snapRes.json();
      const rawRows: string[][] = snapData?.values || [];
      existingSnapshotRows = rawRows.filter(
        (r) => Array.isArray(r) && r[0] === 'PRINTOS_SNAPSHOT_V2'
      );
    }
  }

  // 2. Build new versioned snapshot row
  const {
    revisionId,
    savedAt,
    parentRevisionId,
    payloadLength,
    chunkCount,
    snapshotRow,
  } = createVersionedSnapshotRow(state);

  const retainedSnapshots = [
    snapshotRow,
    ...existingSnapshotRows.slice(0, MAX_SNAPSHOT_HISTORY - 1),
  ];

  const snapshotHeaderRow = [
    'SNAPSHOT_FORMAT',
    'REVISION_ID',
    'SAVED_AT_ISO',
    'PARENT_REVISION_ID',
    'SCHEMA_VERSION',
    'SUMMARY',
    'PAYLOAD_LENGTH',
    'CHUNK_COUNT',
    'JSON_CHUNK_1..N',
  ];

  const metaRows: (string | number)[][] = [
    [
      'META_FORMAT',
      'LATEST_REVISION_ID',
      'LAST_SAVED_AT',
      'PARENT_REVISION_ID',
      'SCHEMA_VERSION',
      'PAYLOAD_LENGTH',
      'CHUNK_COUNT',
      'SNAPSHOT_HISTORY_COUNT',
    ],
    [
      'PRINTOS_META_V2',
      revisionId,
      savedAt,
      parentRevisionId,
      CURRENT_SCHEMA_VERSION,
      payloadLength,
      chunkCount,
      retainedSnapshots.length,
    ],
  ];

  const { productRows, taskRows, contentRows } = serializeStateToSheetRows({
    ...state,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    syncMeta: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      lastSavedRevisionId: revisionId,
      lastSyncedAt: savedAt,
      lastSpreadsheetTitle: title,
    },
  });

  // Clear only the human-readable projection tabs (`PrintOS_Catalog`, `PrintOS_Tasks`, `PrintOS_Content`)
  // and `PrintOS_Snapshots` before writing the updated ring buffer — NEVER touches user's own tabs!
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchClear`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ranges: [
          `${APP_TAB_META}!A1:Z20`,
          `${APP_TAB_SNAPSHOTS}!1:30`,
          `${APP_TAB_CATALOG}!A1:Z500`,
          `${APP_TAB_TASKS}!A1:Z500`,
          `${APP_TAB_CONTENT}!A1:Z500`,
        ],
      }),
    }
  );

  // 3. Batch write all app-owned tabs with valueInputOption: 'RAW' (prevents formula injection)
  const batchWriteRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data: [
          {
            range: `${APP_TAB_META}!A1`,
            majorDimension: 'ROWS',
            values: metaRows,
          },
          {
            range: `${APP_TAB_SNAPSHOTS}!A1`,
            majorDimension: 'ROWS',
            values: [snapshotHeaderRow, ...retainedSnapshots],
          },
          {
            range: `${APP_TAB_CATALOG}!A1`,
            majorDimension: 'ROWS',
            values: productRows,
          },
          {
            range: `${APP_TAB_TASKS}!A1`,
            majorDimension: 'ROWS',
            values: taskRows,
          },
          {
            range: `${APP_TAB_CONTENT}!A1`,
            majorDimension: 'ROWS',
            values: contentRows,
          },
        ],
      }),
    }
  );

  if (!batchWriteRes.ok) {
    const errBody = await batchWriteRes.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message ||
        `Failed to save to Google Sheets (HTTP ${batchWriteRes.status}). Ensure your account has Edit access.`
    );
  }

  // 4. Read-Back Verification: verify the written revisionId and snapshot row can be read back intact
  const verifyRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`${APP_TAB_SNAPSHOTS}!2:2`)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!verifyRes.ok) {
    throw new Error(
      'Data was written, but read-back verification failed to reach Google Sheets.'
    );
  }

  const verifyData = await verifyRes.json();
  const verifyRow: string[] = verifyData?.values?.[0] || [];
  const verifiedEntry = parseVersionedSnapshotRow(verifyRow);
  if (
    !verifiedEntry ||
    verifiedEntry.revisionId !== revisionId ||
    verifiedEntry.payloadLength !== payloadLength
  ) {
    throw new Error(
      'Read-back verification failed: stored revision does not match the payload sent.'
    );
  }

  const totalRowsWritten =
    metaRows.length +
    1 +
    retainedSnapshots.length +
    productRows.length +
    taskRows.length +
    contentRows.length;

  return {
    spreadsheetTitle: title,
    sheetTabName: `${APP_TAB_SNAPSHOTS} (${retainedSnapshots.length} revisions)`,
    rowCount: totalRowsWritten,
    revisionId,
    savedAt,
    verifiedReadBack: true,
  };
}

/**
 * Parses CSV text (from a public link-shared Google Sheet export) into a 2D array of strings.
 */
export function parseCsvToRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(currentCell);
        currentCell = '';
      } else if (ch === '\r' && next === '\n') {
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
        i++;
      } else if (ch === '\n') {
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += ch;
      }
    }
  }
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }
  return rows;
}

/**
 * Fetches PrintOS workspace data and recoverable snapshot history from a connected Google Spreadsheet.
 * - Uses authenticated Google Sheets v4 API by default (reading unbounded rows from `PrintOS_Snapshots`,
 *   with automatic fallback to legacy first-tab V1 data if `PrintOS_Snapshots` is not present).
 * - Supports public link-shared CSV fetch fallback when unauthenticated if the sheet is explicitly shared publicly.
 */
export async function fetchWorkspaceFromSpreadsheet(
  spreadsheetUrlOrId: string,
  fallbackState: PrintOSState,
  accessToken?: string | null
): Promise<{
  state: PrintOSState;
  spreadsheetTitle: string;
  syncedAt: string;
  revisionId?: string;
  revisions: SpreadsheetRevisionEntry[];
}> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrlOrId);
  if (!spreadsheetId) {
    throw new Error('Please enter a valid Google Sheets sharing link or Spreadsheet ID.');
  }

  // Path 1: Authenticated Google Sheets API v4 (Private by default)
  if (accessToken) {
    const { title, firstSheetName, sheetNames } = await fetchSpreadsheetMetadata(
      spreadsheetId,
      accessToken
    );

    // Prefer app-owned `PrintOS_Snapshots` tab if present
    if (sheetNames.includes(APP_TAB_SNAPSHOTS)) {
      const snapRange = encodeURIComponent(`${APP_TAB_SNAPSHOTS}!1:25`);
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}/values/${snapRange}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (res.ok) {
        const data = await res.json();
        const rows: string[][] = data?.values || [];
        const hasV2Row = rows.some((r) => r && r[0] === 'PRINTOS_SNAPSHOT_V2');
        if (hasV2Row) {
          const parsed = deserializeSheetRowsToState(rows, fallbackState);
          return {
            state: parsed.state,
            spreadsheetTitle: title,
            syncedAt: parsed.syncedAt,
            revisionId: parsed.revisionId,
            revisions: parsed.revisions || [],
          };
        }
      }
    }

    // Fallback to legacy V1 first-tab format (using unbounded rows `1:1000` so large chunks are never clipped at Z)
    const legacyRange = encodeURIComponent(`${firstSheetName}!1:1000`);
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${legacyRange}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(
        errBody?.error?.message ||
          `Failed to read spreadsheet values (HTTP ${res.status}).`
      );
    }

    const data = await res.json();
    const rows: string[][] = data?.values || [];
    const parsed = deserializeSheetRowsToState(rows, fallbackState);
    return {
      state: parsed.state,
      spreadsheetTitle: title,
      syncedAt: parsed.syncedAt,
      revisionId: parsed.revisionId,
      revisions: parsed.revisions || [],
    };
  }

  // Path 2: Optional public link-shared spreadsheet fetch via CSV export endpoint
  const publicCsvUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
    spreadsheetId
  )}/export?format=csv`;
  const csvRes = await fetch(publicCsvUrl);
  if (!csvRes.ok) {
    throw new Error(
      'Please sign in with Google (private access by default) or ensure the spreadsheet is shared with "Anyone with the link" to read without signing in.'
    );
  }
  const csvText = await csvRes.text();
  const rows = parseCsvToRows(csvText);
  const parsed = deserializeSheetRowsToState(rows, fallbackState);
  return {
    state: parsed.state,
    spreadsheetTitle: 'Link-Shared Spreadsheet',
    syncedAt: parsed.syncedAt,
    revisionId: parsed.revisionId,
    revisions: parsed.revisions || [],
  };
}
