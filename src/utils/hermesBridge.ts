import { PrintOSState } from '../types/printos';

const URL_KEY = 'printos_bridge_url_v1';
const TOKEN_KEY = 'printos_bridge_token_v1';

export interface BridgeConfig {
  url: string;
  token: string;
}

export function defaultBridgeUrl(): string {
  if (typeof window === 'undefined') return '/api/workspace';
  return `${window.location.origin}/api/workspace`;
}

export function loadBridgeConfig(): BridgeConfig {
  try {
    return {
      url: localStorage.getItem(URL_KEY) || defaultBridgeUrl(),
      token: localStorage.getItem(TOKEN_KEY) || '',
    };
  } catch {
    return { url: defaultBridgeUrl(), token: '' };
  }
}

export function saveBridgeConfig(config: BridgeConfig) {
  try {
    localStorage.setItem(URL_KEY, config.url.trim());
    // The token lives only on this device. It is never written into the workspace
    // snapshot, JSON export or Google Sheets payload.
    localStorage.setItem(TOKEN_KEY, config.token.trim());
  } catch {
    // ignore storage errors — the UI reports the failure on the next action
  }
}

export function clearBridgeToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

async function call(config: BridgeConfig, init: RequestInit) {
  if (!config.url.trim()) throw new Error('URL bridge belum diisi.');
  if (!config.token.trim()) throw new Error('Token bridge belum diisi.');
  const res = await fetch(config.url.trim(), {
    ...init,
    headers: {
      Authorization: `Bearer ${config.token.trim()}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Bridge HTTP ${res.status}`);
  return data;
}

export interface RemoteSnapshot {
  revision: number;
  updatedAt: string;
  workspace: PrintOSState;
  counts: { tasks: number; contentItems: number; publications: number };
}

export async function pullRemote(config: BridgeConfig): Promise<RemoteSnapshot> {
  const data = await call(config, { method: 'GET' });
  if (!data?.workspace) throw new Error('Bridge tidak mengembalikan workspace.');
  return {
    revision: data.revision ?? 0,
    updatedAt: data.updatedAt ?? '',
    workspace: data.workspace as PrintOSState,
    counts: data.counts ?? { tasks: 0, contentItems: 0, publications: 0 },
  };
}

export async function pushLocal(config: BridgeConfig, state: PrintOSState) {
  const data = await call(config, { method: 'PUT', body: JSON.stringify({ workspace: state }) });
  return { revision: data.revision as number, updatedAt: data.updatedAt as string };
}

const byId = <T extends { id: string }>(rows: T[] | undefined): Map<string, T> =>
  new Map((rows || []).map((r) => [r.id, r]));

export interface MergeReport {
  state: PrintOSState;
  addedTasks: number;
  addedContent: number;
  addedPublications: number;
  updatedContent: number;
  addedOther: number;
}

/**
 * Additive merge used when Hermes writes into the bridge while this browser kept working.
 * Existing local records win, except content items whose remote `updatedAt` is newer.
 * Nothing is deleted, so a pull cannot erase work that only exists on this device.
 */
export function mergeWorkspace(local: PrintOSState, remote: PrintOSState): MergeReport {
  const next: PrintOSState = { ...local };
  let addedTasks = 0;
  let addedContent = 0;
  let addedPublications = 0;
  let updatedContent = 0;
  let addedOther = 0;

  const mergeSimple = <T extends { id: string }>(localRows: T[] | undefined, remoteRows: T[] | undefined): T[] => {
    const map = byId(localRows);
    (remoteRows || []).forEach((row) => {
      if (!row?.id) return;
      if (!map.has(row.id)) {
        map.set(row.id, row);
        addedOther += 1;
      }
    });
    return Array.from(map.values());
  };

  // Printing data: additive only.
  next.products = mergeSimple(local.products, remote.products);
  next.filaments = mergeSimple(local.filaments, remote.filaments);
  next.printJobs = mergeSimple(local.printJobs, remote.printJobs);
  next.printers = mergeSimple(local.printers, remote.printers);
  next.researchNotes = mergeSimple(local.researchNotes, remote.researchNotes);
  next.orders = mergeSimple(local.orders, remote.orders);
  next.financials = mergeSimple(local.financials, remote.financials);

  const taskMap = byId(local.tasks);
  (remote.tasks || []).forEach((task) => {
    if (!task?.id) return;
    if (!taskMap.has(task.id)) {
      taskMap.set(task.id, task);
      addedTasks += 1;
    }
  });
  next.tasks = Array.from(taskMap.values());

  const itemMap = byId(local.contentItems);
  (remote.contentItems || []).forEach((item) => {
    if (!item?.id) return;
    const current = itemMap.get(item.id);
    if (!current) {
      itemMap.set(item.id, item);
      addedContent += 1;
    } else if ((item.updatedAt || '') > (current.updatedAt || '')) {
      itemMap.set(item.id, item);
      updatedContent += 1;
    }
  });
  next.contentItems = Array.from(itemMap.values());

  const pubMap = byId(local.contentPublications);
  (remote.contentPublications || []).forEach((pub) => {
    if (!pub?.id) return;
    if (!pubMap.has(pub.id)) {
      pubMap.set(pub.id, pub);
      addedPublications += 1;
    }
  });
  next.contentPublications = Array.from(pubMap.values());

  next.contentProjects = mergeSimple(local.contentProjects, remote.contentProjects);
  next.contentSeries = mergeSimple(local.contentSeries, remote.contentSeries);
  next.metricSnapshots = mergeSimple(local.metricSnapshots, remote.metricSnapshots);
  next.productionSessions = mergeSimple(local.productionSessions, remote.productionSessions);
  next.contentSponsorships = mergeSimple(local.contentSponsorships, remote.contentSponsorships);
  next.weeklyReviews = mergeSimple(local.weeklyReviews, remote.weeklyReviews);
  next.contentResearchNotes = mergeSimple(local.contentResearchNotes, remote.contentResearchNotes);
  next.creatorCapacity = local.creatorCapacity ?? remote.creatorCapacity;

  return { state: next, addedTasks, addedContent, addedPublications, updatedContent, addedOther };
}
