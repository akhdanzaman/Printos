/**
 * PrintOS ⇄ Hermes bridge.
 *
 * One JSON snapshot in a small external store, protected by a bearer token.
 * Storage adapters (first configured wins):
 *   1. Upstash Redis REST  — UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *   2. GitHub contents API — PRINTOS_GITHUB_TOKEN + PRINTOS_GITHUB_REPO (+ PRINTOS_GITHUB_PATH)
 *   3. Local file          — .data/printos-workspace.json (only when running `vercel dev` locally)
 *
 * Endpoints (all require `Authorization: Bearer $PRINTOS_API_TOKEN`):
 *   GET  /api/workspace        → { ok, revision, updatedAt, workspace }
 *   PUT  /api/workspace        → body { workspace } replaces the snapshot
 *   POST /api/workspace        → body { action, payload } appends a task/content/publication
 *
 * This is an explicit snapshot store, not a realtime collaboration backend.
 */

const KEY = 'printos:workspace:v1';

const json = (res, status, body) => {
  res.status(status).json(body);
};

function cors(req, res) {
  const allowed = process.env.PRINTOS_ALLOWED_ORIGIN || '';
  const origin = req.headers.origin || '';
  if (allowed && origin === allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
}

function authorized(req) {
  const expected = process.env.PRINTOS_API_TOKEN;
  if (!expected) return false;
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token || token.length !== expected.length) return false;
  // Constant-time-ish comparison without extra deps.
  let diff = 0;
  for (let i = 0; i < token.length; i += 1) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function storageMode() {
  if (process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN) return 'blob';
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) return 'upstash';
  if (process.env.PRINTOS_GITHUB_TOKEN && process.env.PRINTOS_GITHUB_REPO) return 'github';
  if (!process.env.VERCEL) return 'file';
  return 'none';
}

const BLOB_PATH = process.env.PRINTOS_BLOB_PATH || 'hermes/printos-workspace.json';

async function blobPut(path, value) {
  const { put } = await import('@vercel/blob');
  return put(path, typeof value === 'string' ? value : JSON.stringify(value), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    storeId: process.env.BLOB_STORE_ID,
  });
}

async function blobGet(path) {
  const { get } = await import('@vercel/blob');
  try {
    const result = await get(path, {
      access: 'private',
      storeId: process.env.BLOB_STORE_ID,
      useCache: false,
    });
    if (!result || result.statusCode !== 200) return null;
    const chunks = [];
    for await (const chunk of result.stream) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString('utf8');
    return raw || null;
  } catch (error) {
    if (error?.name === 'BlobNotFoundError' || /not found/i.test(error?.message || '')) return null;
    throw error;
  }
}

async function upstash(command, body) {
  const url = process.env.UPSTASH_REDIS_REST_URL.replace(/\/$/, '');
  const res = await fetch(`${url}/${command}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Upstash HTTP ${res.status}`);
  return data.result;
}

async function githubRequest(method, suffix, body) {
  const repo = process.env.PRINTOS_GITHUB_REPO;
  const path = process.env.PRINTOS_GITHUB_PATH || 'hermes/printos-workspace.json';
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}${suffix || ''}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.PRINTOS_GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `GitHub HTTP ${res.status}`);
  return data;
}

const FILE_PATH = '.data/printos-workspace.json';

async function readStore() {
  const mode = storageMode();
  if (mode === 'blob') {
    const raw = await blobGet(BLOB_PATH);
    return raw ? JSON.parse(raw) : null;
  }
  if (mode === 'upstash') {
    const raw = await upstash(`get/${KEY}`);
    return raw ? JSON.parse(raw) : null;
  }
  if (mode === 'github') {
    const data = await githubRequest('GET');
    const raw = Buffer.from(data.content || '', 'base64').toString('utf8');
    return raw ? JSON.parse(raw) : null;
  }
  if (mode === 'file') {
    const { promises: fs } = await import('node:fs');
    try {
      return JSON.parse(await fs.readFile(FILE_PATH, 'utf8'));
    } catch {
      return null;
    }
  }
  throw new Error('BRIDGE_NOT_CONFIGURED');
}

async function writeStore(store) {
  const mode = storageMode();
  const raw = JSON.stringify(store);
  if (mode === 'blob') {
    await blobPut(BLOB_PATH, raw);
    return;
  }
  if (mode === 'upstash') {
    await upstash(`set/${KEY}`, raw);
    return;
  }
  if (mode === 'github') {
    let sha;
    try {
      const existing = await githubRequest('GET');
      sha = existing.sha;
    } catch {
      sha = undefined;
    }
    await githubRequest('PUT', '', {
      message: `printos: hermes bridge snapshot r${store.revision}`,
      content: Buffer.from(raw, 'utf8').toString('base64'),
      ...(sha ? { sha } : {}),
    });
    return;
  }
  if (mode === 'file') {
    const { promises: fs } = await import('node:fs');
    const { dirname } = await import('node:path');
    await fs.mkdir(dirname(FILE_PATH), { recursive: true });
    await fs.writeFile(FILE_PATH, raw, 'utf8');
    return;
  }
  throw new Error('BRIDGE_NOT_CONFIGURED');
}

const newId = (prefix) => `${prefix}-${crypto.randomUUID()}`;
const todayJakarta = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

function assertWorkspace(workspace) {
  if (!workspace || typeof workspace !== 'object') throw new Error('workspace harus objek');
  const required = ['products', 'tasks', 'filaments', 'printJobs', 'printers', 'researchNotes', 'orders', 'financials'];
  const missing = required.filter((k) => !Array.isArray(workspace[k]));
  if (missing.length) throw new Error(`koleksi wajib hilang: ${missing.join(', ')}`);
  const size = JSON.stringify(workspace).length;
  if (size > 4_000_000) throw new Error(`workspace terlalu besar (${size} byte)`);
}

function makeTask(payload) {
  const due = payload.dueDate || todayJakarta();
  return {
    id: newId('tsk'),
    title: String(payload.title || '').slice(0, 300) || 'Task dari Hermes',
    stage: 'Backlog',
    priority: ['Low', 'Medium', 'High', 'Urgent'].includes(payload.priority) ? payload.priority : 'Medium',
    plannedStartDate: payload.plannedStartDate || due,
    dueDate: due,
    actualStartDate: '',
    actualEndDate: '',
    linkedProductId: payload.linkedProductId || '',
    linkedContentItemId: payload.linkedContentItemId || undefined,
    domain: 'content',
    category: payload.category === 'content' ? 'Content' : 'Content',
    estimatedMinutes: Number.isFinite(payload.estimatedMinutes) ? payload.estimatedMinutes : 30,
    checklist: [],
    notes: String(payload.notes || 'Ditambahkan oleh Hermes.'),
  };
}

function makeContent(payload) {
  const now = new Date().toISOString();
  return {
    id: newId('cnt'),
    title: String(payload.title || '').slice(0, 300) || 'Konten dari Hermes',
    pillar: payload.pillar === '3d_marketing' ? '3d_marketing' : 'personal',
    format: ['short_video', 'carousel', 'mini_vlog', 'cerpen'].includes(payload.format)
      ? payload.format
      : 'short_video',
    stage: 'Idea & Research Bank',
    projectId: payload.projectId || '',
    seriesId: payload.seriesId || undefined,
    linkedProductId: payload.linkedProductId || undefined,
    priority: ['Low', 'Medium', 'High', 'Urgent'].includes(payload.priority) ? payload.priority : 'Medium',
    orderIndex: Number.isFinite(payload.orderIndex) ? payload.orderIndex : 999,
    targetPublishDate: payload.targetPublishDate || todayJakarta(),
    voiceOverEnabled: Boolean(payload.voiceOverEnabled),
    voiceOverScriptOrNotes: String(payload.voiceOverScriptOrNotes || ''),
    brief: {
      hook: String(payload.hook || ''),
      keyMessage: String(payload.keyMessage || ''),
      callToAction: String(payload.callToAction || ''),
      targetAudience: String(payload.targetAudience || ''),
      estimatedDurationSec: Number(payload.estimatedDurationSec) || 25,
    },
    references: [],
    scriptText: String(payload.scriptText || ''),
    carouselSlides: [],
    shots: [],
    localAssets: [],
    qcChecklist: [],
    nextAction: 'Lengkapi brief dari Hermes',
    updatedAt: now,
  };
}

function makePublication(workspace, payload) {
  const item = (workspace.contentItems || []).find((c) => c.id === payload.contentItemId);
  if (!item) throw new Error('contentItemId tidak ditemukan');
  return {
    id: newId('pub'),
    contentItemId: item.id,
    channel: ['TikTok', 'Instagram', 'YouTube', 'Threads/Blog'].includes(payload.channel)
      ? payload.channel
      : 'TikTok',
    caption: String(payload.caption || ''),
    hashtags: String(payload.hashtags || ''),
    scheduledDateJakarta: payload.scheduledDateJakarta || todayJakarta(),
    scheduledTimeJakarta: payload.scheduledTimeJakarta || '19:30',
    status: 'Draft',
    platformNotes: 'Dibuat oleh Hermes — konfirmasi manual sebelum tayang.',
  };
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!process.env.PRINTOS_API_TOKEN) {
    return json(res, 503, {
      ok: false,
      error: 'Bridge belum dikonfigurasi: set PRINTOS_API_TOKEN di environment Vercel.',
      storage: storageMode(),
    });
  }
  if (!authorized(req)) {
    return json(res, 401, { ok: false, error: 'Token tidak valid.' });
  }
  if (storageMode() === 'none') {
    return json(res, 503, {
      ok: false,
      error:
        'Penyimpanan bridge belum diset. Isi UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, atau PRINTOS_GITHUB_TOKEN + PRINTOS_GITHUB_REPO.',
    });
  }

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url || '/', 'http://localhost');
      if (url.searchParams.get('selftest') === '1') {
        const stamp = new Date().toISOString();
        const probePath = 'hermes/selftest.json';
        await blobPut(probePath, JSON.stringify({ stamp }));
        const back = await blobGet(probePath);
        return json(res, 200, {
          ok: true,
          storage: storageMode(),
          wroteAt: stamp,
          readBack: back ? JSON.parse(back) : null,
        });
      }
      const store = await readStore();
      if (!store) return json(res, 404, { ok: false, error: 'Snapshot belum ada. Kirim workspace dari aplikasi dulu.' });
      return json(res, 200, {
        ok: true,
        revision: store.revision,
        updatedAt: store.updatedAt,
        counts: {
          tasks: store.workspace.tasks?.length || 0,
          contentItems: store.workspace.contentItems?.length || 0,
          publications: store.workspace.contentPublications?.length || 0,
        },
        workspace: store.workspace,
      });
    }

    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      assertWorkspace(body.workspace);
      const previous = await readStore().catch(() => null);
      const store = {
        revision: (previous?.revision || 0) + 1,
        updatedAt: new Date().toISOString(),
        workspace: body.workspace,
      };
      await writeStore(store);
      return json(res, 200, { ok: true, revision: store.revision, updatedAt: store.updatedAt });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const action = body.action;
      const payload = body.payload || {};
      const current = (await readStore()) || {
        revision: 0,
        updatedAt: new Date().toISOString(),
        workspace: null,
      };
      if (!current.workspace) {
        return json(res, 409, {
          ok: false,
          error: 'Snapshot kosong. Kirim workspace dari aplikasi (tombol "Kirim ke Hermes") dulu.',
        });
      }
      const workspace = current.workspace;
      let created = null;

      if (action === 'add-task') {
        const task = makeTask(payload);
        workspace.tasks = [task, ...(workspace.tasks || [])];
        created = task;
      } else if (action === 'add-content') {
        const item = makeContent(payload);
        workspace.contentItems = [item, ...(workspace.contentItems || [])];
        created = item;
      } else if (action === 'add-publication') {
        const pub = makePublication(workspace, payload);
        workspace.contentPublications = [pub, ...(workspace.contentPublications || [])];
        created = pub;
      } else if (action === 'move-content-stage') {
        const item = (workspace.contentItems || []).find((c) => c.id === payload.contentItemId);
        if (!item) throw new Error('contentItemId tidak ditemukan');
        item.stage = payload.stage;
        item.updatedAt = new Date().toISOString();
        created = item;
      } else if (action === 'log-stage') {
        const STAGES = [
          'Strategy',
          'Idea & Research Bank',
          'Brief',
          'Script / Slides',
          'Shot List',
          'Production Plan',
          'Assets & Edit Notes',
          'QC',
          'Ready to Publish',
          'Published',
          'Review & Repurpose',
        ];
        const item = (workspace.contentItems || []).find((c) => c.id === payload.contentItemId);
        if (!item) throw new Error('contentItemId tidak ditemukan');
        const stage = String(payload.stage || '');
        if (!STAGES.includes(stage)) throw new Error(`stage tidak dikenal: ${stage}`);

        const output =
          payload.output && typeof payload.output === 'object' && !Array.isArray(payload.output)
            ? Object.fromEntries(
                Object.entries(payload.output).map(([k, v]) => [k, typeof v === 'string' ? v : String(v ?? '')])
              )
            : {};
        const filled = Object.values(output).filter((v) => String(v).trim().length > 0);
        if (filled.length === 0 && !payload.overrideReason) {
          throw new Error('output stage kosong: isi minimal satu field atau sertakan overrideReason');
        }

        const now = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Jakarta',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
          .formatToParts(new Date())
          .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
        const stamp = `${now.year}-${now.month}-${now.day} ${now.hour}:${now.minute} WIB`;

        const history = Array.isArray(item.stageHistory) ? item.stageHistory : [];
        const previous = history.find((log) => log.stage === stage);
        const log = {
          id: `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          stage,
          startedAtJakarta: previous?.startedAtJakarta || stamp,
          completedAtJakarta: stamp,
          actor: payload.actor === 'agent' ? 'agent' : 'user',
          summary: String(payload.summary || filled[0] || '').slice(0, 160),
          output,
          overrideReason: String(payload.overrideReason || ''),
        };
        item.stageHistory = [...history.filter((entry) => entry.stage !== stage), log].sort(
          (a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage)
        );

        if (payload.advance) {
          const idx = STAGES.indexOf(stage);
          item.stage = idx >= 0 && idx < STAGES.length - 1 ? STAGES[idx + 1] : stage;
        }
        item.updatedAt = stamp;
        created = { item, log };
      } else {
        return json(res, 400, {
          ok: false,
          error: 'action tidak dikenal',
          allowed: ['add-task', 'add-content', 'add-publication', 'move-content-stage', 'log-stage'],
        });
      }

      const store = {
        revision: current.revision + 1,
        updatedAt: new Date().toISOString(),
        workspace,
      };
      await writeStore(store);
      return json(res, 200, { ok: true, revision: store.revision, created });
    }

    return json(res, 405, { ok: false, error: 'Method tidak didukung.' });
  } catch (error) {
    const message = error?.message || 'Bridge error';
    const status = message === 'BRIDGE_NOT_CONFIGURED' ? 503 : 400;
    return json(res, status, { ok: false, error: message });
  }
}
