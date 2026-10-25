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
  CustomerOrder,
  FilamentSpool,
  FinancialRecord,
  PrinterMachine,
  PrintJob,
  PrintOSState,
  Product,
  ResearchNote,
  TaskItem,
} from '../types/printos';

export const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

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
 * Supports links like:
 * - https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?usp=sharing
 * - https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0
 * - Raw spreadsheet ID
 */
export function extractSpreadsheetId(input: string): string | null {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  // Raw ID check (alphanumeric, hyphens, underscores, typically 20+ chars)
  if (/^[a-zA-Z0-9-_]{15,}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Converts PrintOSState into structured 2D row arrays for Google Sheets tabs
 * so the spreadsheet is both human-readable AND 100% lossless on restore.
 */
export function serializeStateToSheetRows(state: PrintOSState): {
  summaryRows: (string | number)[][];
  productRows: (string | number)[][];
  taskRows: (string | number)[][];
} {
  const updatedAt = new Date().toISOString();

  // Tab 1 / Main Sheet: PrintOS Sync Header + Complete JSON Chunks + Human-Readable Tables
  const jsonString = JSON.stringify(state);
  // Split JSON into 30,000-char chunks so it never exceeds Google Sheets' 50,000-char cell limit
  const chunks: string[] = [];
  const chunkSize = 30000;
  for (let i = 0; i < jsonString.length; i += chunkSize) {
    chunks.push(jsonString.slice(i, i + chunkSize));
  }

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
      p.name,
      p.sku,
      p.stage,
      p.category,
      p.filamentMaterial,
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
      t.title,
      t.stage,
      t.priority,
      t.category,
      t.plannedStartDate || t.dueDate,
      t.dueDate,
      t.actualStartDate || '',
      t.actualEndDate || '',
      t.estimatedMinutes,
      t.notes,
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
      f.name,
      f.brand,
      f.material,
      f.colorName,
      f.remainingWeightGrams,
      f.initialWeightGrams,
      f.purchasePriceRp,
      f.stage,
      f.assignedPrinter || '',
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
      j.jobTitle,
      j.stage,
      j.printerId,
      j.batchQuantity,
      j.printTimeMinutes,
      j.filamentGramsUsed,
      j.customerOrderRef || '',
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
      o.orderNumber,
      o.customerName,
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
      fin.title,
      fin.date,
      fin.type,
      fin.category,
      fin.amountRp,
      fin.notes,
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
      p.name,
      p.sku,
      p.stage,
      p.category,
      p.dimensions,
      p.filamentMaterial,
      p.filamentGrams,
      p.printTimeMinutes,
      p.productionCostRp,
      p.sellingPriceRp,
      p.stockQuantity ?? 0,
      p.unitsSold,
      p.stlFileName,
      p.notes,
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
      'Notes',
    ],
    ...state.tasks.map((t) => [
      t.id,
      t.title,
      t.stage,
      t.priority,
      t.category,
      t.plannedStartDate || t.dueDate,
      t.dueDate,
      t.actualStartDate || '',
      t.actualEndDate || '',
      t.estimatedMinutes,
      t.notes,
    ]),
  ];

  return { summaryRows, productRows, taskRows };
}

/**
 * Parses rows retrieved from a PrintOS Google Sheet back into a complete PrintOSState.
 * Supports both lossless PRINTOS_SPREADSHEET_SYNC_V1 header rows and tabular product/task edits.
 */
export function deserializeSheetRowsToState(
  rows: string[][],
  fallbackState: PrintOSState
): { state: PrintOSState; syncedAt: string } {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('The spreadsheet is empty or contains no readable rows.');
  }

  const firstRow = rows[0] || [];
  if (firstRow[0] === 'PRINTOS_SPREADSHEET_SYNC_V1') {
    const syncedAt = String(firstRow[1] || new Date().toISOString());
    const chunkCount = Number(firstRow[2]) || 1;
    const jsonPayload = firstRow.slice(3, 3 + chunkCount).join('');
    const parsed = JSON.parse(jsonPayload) as PrintOSState;

    // Also apply any direct cell edits made by the user in the Product Catalog or Tasks tables below row 1!
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
        const matchIdx = updatedProducts.findIndex(
          (p) => p.sku === r[1] || p.name === r[0]
        );
        if (matchIdx !== -1) {
          updatedProducts[matchIdx] = {
            ...updatedProducts[matchIdx],
            name: String(r[0] || updatedProducts[matchIdx].name),
            sku: String(r[1] || updatedProducts[matchIdx].sku),
            stage: (r[2] as Product['stage']) || updatedProducts[matchIdx].stage,
            category: String(r[3] || updatedProducts[matchIdx].category),
            filamentMaterial: String(
              r[4] || updatedProducts[matchIdx].filamentMaterial
            ),
            filamentGrams:
              Number(r[5]) || updatedProducts[matchIdx].filamentGrams,
            printTimeMinutes:
              Number(r[6]) || updatedProducts[matchIdx].printTimeMinutes,
            productionCostRp:
              Number(r[7]) ?? updatedProducts[matchIdx].productionCostRp,
            sellingPriceRp:
              Number(r[8]) ?? updatedProducts[matchIdx].sellingPriceRp,
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
        const matchIdx = updatedTasks.findIndex((t) => t.title === r[0]);
        if (matchIdx !== -1) {
          updatedTasks[matchIdx] = {
            ...updatedTasks[matchIdx],
            title: String(r[0] || updatedTasks[matchIdx].title),
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

    return { state: parsed, syncedAt };
  }

  throw new Error(
    'This spreadsheet does not contain PrintOS workspace data yet. Click "Save" first to initialize the spreadsheet with your PrintOS data.'
  );
}

/**
 * Fetches metadata of the spreadsheet (title & first sheet tab name) using Google Sheets API v4.
 * Follows the best practice of never hardcoding "Sheet1".
 */
export async function fetchSpreadsheetMetadata(
  spreadsheetId: string,
  accessToken: string
): Promise<{ title: string; firstSheetName: string }> {
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
      `Google Sheets API returned status ${res.status}. Make sure the link is shared and you are signed in.`;
    throw new Error(msg);
  }

  const data = await res.json();
  const title = data?.properties?.title || 'Shared Spreadsheet';
  const firstSheetName = data?.sheets?.[0]?.properties?.title || 'Sheet1';
  return { title, firstSheetName };
}

/**
 * Saves the entire PrintOS workspace state to the first sheet tab of the connected Google Spreadsheet.
 */
export async function saveWorkspaceToSpreadsheet(
  spreadsheetUrlOrId: string,
  state: PrintOSState,
  accessToken: string
): Promise<{ spreadsheetTitle: string; sheetTabName: string; rowCount: number }> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrlOrId);
  if (!spreadsheetId) {
    throw new Error('Please paste a valid Google Sheets sharing link or Spreadsheet ID.');
  }

  const { title, firstSheetName } = await fetchSpreadsheetMetadata(
    spreadsheetId,
    accessToken
  );

  const { summaryRows } = serializeStateToSheetRows(state);
  const encodedRange = encodeURIComponent(`${firstSheetName}!A1`);

  // Clear existing values in the first tab so stale rows don't remain
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`${firstSheetName}!A1:Z500`)}:clear`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  // Write the updated workspace tables and sync header
  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodedRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        majorDimension: 'ROWS',
        values: summaryRows,
      }),
    }
  );

  if (!updateRes.ok) {
    const errBody = await updateRes.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message ||
        `Failed to save data to spreadsheet (HTTP ${updateRes.status}). Ensure the spreadsheet is shared with edit access.`
    );
  }

  return {
    spreadsheetTitle: title,
    sheetTabName: firstSheetName,
    rowCount: summaryRows.length,
  };
}

/**
 * Parses CSV text (from a public link-shared Google Sheet export) into a 2D array of strings.
 */
function parseCsvToRows(csvText: string): string[][] {
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
 * Fetches PrintOS workspace data from a connected Google Spreadsheet.
 * - Uses the authenticated Google Sheets v4 API when accessToken is available.
 * - Also supports public link-shared CSV fetch fallback if the spreadsheet is shared with "Anyone with the link".
 */
export async function fetchWorkspaceFromSpreadsheet(
  spreadsheetUrlOrId: string,
  fallbackState: PrintOSState,
  accessToken?: string | null
): Promise<{
  state: PrintOSState;
  spreadsheetTitle: string;
  syncedAt: string;
}> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrlOrId);
  if (!spreadsheetId) {
    throw new Error('Please paste a valid Google Sheets sharing link or Spreadsheet ID.');
  }

  // Path 1: Authenticated Google Sheets API v4 (preferred)
  if (accessToken) {
    const { title, firstSheetName } = await fetchSpreadsheetMetadata(
      spreadsheetId,
      accessToken
    );
    const range = encodeURIComponent(`${firstSheetName}!A1:Z500`);
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${range}`,
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
          `Failed to fetch spreadsheet values (HTTP ${res.status}).`
      );
    }

    const data = await res.json();
    const rows: string[][] = data?.values || [];
    const { state, syncedAt } = deserializeSheetRowsToState(rows, fallbackState);
    return {
      state,
      spreadsheetTitle: title,
      syncedAt,
    };
  }

  // Path 2: Public link-shared spreadsheet fetch via CSV export endpoint
  const publicCsvUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
    spreadsheetId
  )}/export?format=csv`;
  const csvRes = await fetch(publicCsvUrl);
  if (!csvRes.ok) {
    throw new Error(
      'Sign in with Google or ensure the spreadsheet is shared with "Anyone with the link" to fetch data.'
    );
  }
  const csvText = await csvRes.text();
  const rows = parseCsvToRows(csvText);
  const { state, syncedAt } = deserializeSheetRowsToState(rows, fallbackState);
  return {
    state,
    spreadsheetTitle: 'Link-Shared Spreadsheet',
    syncedAt,
  };
}
