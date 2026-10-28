#!/usr/bin/env node
/**
 * PrintOS ⇄ Hermes CLI.
 *
 * Reads and writes the bridge snapshot that the deployed PrintOS app uses.
 * Every write requires --yes so an agent can never mutate your workspace implicitly.
 *
 *   node tools/printos-hermes.mjs status
 *   node tools/printos-hermes.mjs read --out workspace.json
 *   node tools/printos-hermes.mjs add-task --title "Riset taman Jakarta" --yes
 *   node tools/printos-hermes.mjs add-content --title "Ide carousel" --format carousel --yes
 *   node tools/printos-hermes.mjs add-publication --content-id cnt_123 --channel TikTok --date 2026-11-02 --time 19:30 --yes
 *   node tools/printos-hermes.mjs stage --content-id cnt_123 --stage QC --yes
 *
 * Env: PRINTOS_BRIDGE_URL, PRINTOS_API_TOKEN (also read from .env.local)
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const command = args[0] || 'status';

function flag(name, fallback = undefined) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = args[i + 1];
  return next && !next.startsWith('--') ? next : true;
}

async function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    const text = await readFile(file, 'utf8');
    text.split(/\r?\n/).forEach((line) => {
      const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!match) return;
      const [, key, raw] = match;
      if (process.env[key]) return;
      process.env[key] = raw.replace(/^["']|["']$/g, '');
    });
  }
}

await loadEnv();

const url = process.env.PRINTOS_BRIDGE_URL || '';
const token = process.env.PRINTOS_API_TOKEN || '';

function assertConfig() {
  if (!url) {
    console.error('PRINTOS_BRIDGE_URL belum diset (contoh: https://printos.example.vercel.app/api/workspace).');
    process.exit(2);
  }
  if (!token) {
    console.error('PRINTOS_API_TOKEN belum diset. Gunakan token yang sama dengan environment Vercel.');
    process.exit(2);
  }
}

async function request(method, body) {
  assertConfig();
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`Gagal (${res.status}): ${data?.error || 'tanpa pesan'}`);
    process.exit(1);
  }
  return data;
}

function requireYes() {
  if (!flag('yes')) {
    console.error('Perintah tulis butuh --yes. Ini mencegah perubahan tanpa perintah eksplisit.');
    process.exit(3);
  }
}

function printCounts(workspace) {
  const rows = {
    products: workspace.products?.length || 0,
    tasks: workspace.tasks?.length || 0,
    contentItems: workspace.contentItems?.length || 0,
    publications: workspace.contentPublications?.length || 0,
    metricSnapshots: workspace.metricSnapshots?.length || 0,
  };
  console.log(JSON.stringify(rows, null, 2));
}

const handlers = {
  async status() {
    const data = await request('GET');
    console.log(
      JSON.stringify(
        { ok: true, revision: data.revision, updatedAt: data.updatedAt, counts: data.counts },
        null,
        2
      )
    );
  },

  async read() {
    const data = await request('GET');
    const out = flag('out');
    if (typeof out === 'string') {
      await writeFile(out, JSON.stringify(data.workspace, null, 2), 'utf8');
      console.log(`Workspace ditulis ke ${out} (revisi ${data.revision}).`);
    }
    printCounts(data.workspace || {});
  },

  async 'add-task'() {
    requireYes();
    const title = flag('title');
    if (!title) {
      console.error('--title wajib.');
      process.exit(2);
    }
    const data = await request('POST', {
      action: 'add-task',
      payload: {
        title,
        dueDate: flag('due'),
        estimatedMinutes: Number(flag('minutes')) || 30,
        priority: flag('priority') || 'Medium',
        notes: flag('notes') || 'Ditambahkan oleh Hermes.',
        linkedContentItemId: flag('content-id') || undefined,
      },
    });
    console.log(JSON.stringify({ ok: true, revision: data.revision, task: data.created }, null, 2));
  },

  async 'add-content'() {
    requireYes();
    const title = flag('title');
    if (!title) {
      console.error('--title wajib.');
      process.exit(2);
    }
    const data = await request('POST', {
      action: 'add-content',
      payload: {
        title,
        pillar: flag('pillar') || 'personal',
        format: flag('format') || 'short_video',
        hook: flag('hook') || '',
        keyMessage: flag('message') || '',
        projectId: flag('project') || '',
        targetPublishDate: flag('date') || undefined,
      },
    });
    console.log(JSON.stringify({ ok: true, revision: data.revision, content: data.created }, null, 2));
  },

  async 'add-publication'() {
    requireYes();
    const contentId = flag('content-id');
    if (!contentId) {
      console.error('--content-id wajib.');
      process.exit(2);
    }
    const data = await request('POST', {
      action: 'add-publication',
      payload: {
        contentItemId: contentId,
        channel: flag('channel') || 'TikTok',
        scheduledDateJakarta: flag('date'),
        scheduledTimeJakarta: flag('time') || '19:30',
        caption: flag('caption') || '',
        hashtags: flag('hashtags') || '',
      },
    });
    console.log(JSON.stringify({ ok: true, revision: data.revision, publication: data.created }, null, 2));
  },

  async stage() {
    requireYes();
    const contentId = flag('content-id');
    const stage = flag('stage');
    if (!contentId || !stage) {
      console.error('--content-id dan --stage wajib.');
      process.exit(2);
    }
    const data = await request('POST', {
      action: 'move-content-stage',
      payload: { contentItemId: contentId, stage },
    });
    console.log(JSON.stringify({ ok: true, revision: data.revision, content: data.created }, null, 2));
  },

  /**
   * Records what a stage produced and (optionally) advances the item.
   * node tools/printos-hermes.mjs log-stage --content-id cnt_1 --stage Brief \
   *   --output '{"keyMessage":"...","callToAction":"...","duration":"24"}' --advance --yes
   */
  async 'log-stage'() {
    requireYes();
    const contentId = flag('content-id');
    const stage = flag('stage');
    if (!contentId || !stage) {
      console.error('--content-id dan --stage wajib.');
      process.exit(2);
    }
    let output = {};
    const rawOutput = flag('output');
    if (rawOutput) {
      try {
        output = JSON.parse(rawOutput);
      } catch {
        console.error('--output harus JSON valid, contoh: {"keyMessage":"..."}');
        process.exit(2);
      }
    }
    const data = await request('POST', {
      action: 'log-stage',
      payload: {
        contentItemId: contentId,
        stage,
        output,
        advance: args.includes('--advance'),
        actor: flag('actor') || 'agent',
        overrideReason: flag('reason') || '',
      },
    });
    console.log(JSON.stringify({ ok: true, revision: data.revision, result: data.created }, null, 2));
  },
};

if (!handlers[command]) {
  console.error(`Perintah tidak dikenal: ${command}`);
  console.error(`Tersedia: ${Object.keys(handlers).join(', ')}`);
  process.exit(2);
}

await handlers[command]();
