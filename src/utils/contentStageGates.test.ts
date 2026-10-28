import test from 'node:test';
import assert from 'node:assert/strict';
import { ContentItem } from '../types/printos';
import {
  STAGE_GATES,
  buildDraft,
  completeStage,
  nextStageOf,
  stageLogFor,
  validateGate,
} from './contentStageGates';

function makeItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: 'cnt-test',
    title: 'Tes stage',
    pillar: 'personal',
    format: 'short_video',
    stage: 'Brief',
    projectId: 'prj-1',
    priority: 'Medium',
    orderIndex: 0,
    targetPublishDate: '2026-11-02',
    voiceOverEnabled: true,
    voiceOverScriptOrNotes: '',
    brief: {
      hook: 'Hook awal',
      keyMessage: '',
      callToAction: '',
      targetAudience: 'Pekerja Jakarta',
      estimatedDurationSec: 24,
    },
    references: [],
    scriptText: '',
    carouselSlides: [],
    shots: [],
    localAssets: [],
    qcChecklist: [],
    nextAction: '',
    updatedAt: '2026-10-28',
    ...overrides,
  } as ContentItem;
}

test('every content stage has a gate definition with at least one required field or check', () => {
  assert.equal(STAGE_GATES.length, 11);
  for (const gate of STAGE_GATES) {
    assert.ok(gate.fields.length > 0, `${gate.stage} has no fields`);
    const required = gate.fields.filter((f) => f.required).length;
    assert.ok(required > 0 || Boolean(gate.validate), `${gate.stage} cannot block anything`);
  }
});

test('advancing without the required brief output is blocked with explicit reasons', () => {
  const item = makeItem();
  const problems = validateGate(item, 'Brief', { keyMessage: '', callToAction: '', duration: '' });
  assert.ok(problems.length >= 3, 'expected missing fields to be reported');
  assert.ok(problems.some((p) => p.includes('Pesan inti')));
});

test('brief gate passes once the artefact exists and reports the next stage', () => {
  const item = makeItem();
  const draft = { keyMessage: 'Tempat gratis itu ada, bukan mitos', callToAction: 'Simpan daftar ini', duration: '24' };
  assert.deepEqual(validateGate(item, 'Brief', draft), []);
  assert.equal(nextStageOf('Brief'), 'Script / Slides');
});

test('script gate accepts either a written script or two carousel slides', () => {
  const blocked = makeItem({ stage: 'Script / Slides' });
  assert.ok(validateGate(blocked, 'Script / Slides', { script: '' }).length > 0);

  const withScript = makeItem({
    stage: 'Script / Slides',
    scriptText:
      'HOOK (0-2 dtk): Aku naik MRT tanpa tujuan.\nBEAT 2 (3-8 dtk): Peron masih kosong.\nBEAT 3 (9-16 dtk): Dua belas stasiun lewat.\nPENUTUP (17-24 dtk): Tidak buru-buru pulang.',
  });
  assert.deepEqual(validateGate(withScript, 'Script / Slides', { script: withScript.scriptText }), []);

  const withSlides = makeItem({
    stage: 'Script / Slides',
    carouselSlides: [
      { id: 's1', slideNumber: 1, headline: 'Judul', bodyCopy: 'Isi', visualPromptOrPhotoRef: '' },
      { id: 's2', slideNumber: 2, headline: 'Kedua', bodyCopy: 'Isi', visualPromptOrPhotoRef: '' },
    ],
  });
  assert.deepEqual(validateGate(withSlides, 'Script / Slides', { script: '' }), []);
});

test('QC gate blocks while checklist items are unchecked', () => {
  const item = makeItem({
    stage: 'QC',
    qcChecklist: [
      { id: 'q1', text: 'Fakta', completed: true },
      { id: 'q2', text: 'Privasi', completed: false },
    ],
  });
  const problems = validateGate(item, 'QC', { qcNotes: 'Sudah dicek' });
  assert.ok(problems.some((p) => p.includes('belum dicentang')));

  const done = { ...item, qcChecklist: item.qcChecklist.map((c) => ({ ...c, completed: true })) };
  assert.deepEqual(validateGate(done, 'QC', { qcNotes: 'Sudah dicek' }), []);
});

test('completing a stage appends a timestamped log and advances the item', () => {
  const item = makeItem();
  const next = completeStage(
    item,
    'Brief',
    { keyMessage: 'Pesan inti yang cukup panjang', callToAction: 'Simpan', duration: '24' },
    { actor: 'user', advance: true }
  );

  assert.equal(next.stage, 'Script / Slides');
  const log = stageLogFor(next, 'Brief');
  assert.ok(log);
  assert.match(log!.completedAtJakarta, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} WIB$/);
  assert.equal(log!.actor, 'user');
  assert.equal(log!.output.keyMessage, 'Pesan inti yang cukup panjang');
});

test('saving progress without advancing keeps the stage but records the output', () => {
  const item = makeItem();
  const next = completeStage(item, 'Brief', { keyMessage: 'Draf pesan' }, { actor: 'agent', advance: false });
  assert.equal(next.stage, 'Brief');
  assert.equal(stageLogFor(next, 'Brief')?.actor, 'agent');
});

test('override records the reason and still advances', () => {
  const item = makeItem({ stage: 'Shot List', format: 'cerpen' });
  const next = completeStage(
    item,
    'Shot List',
    {},
    { actor: 'user', advance: true, overrideReason: 'Cerpen teks tidak memerlukan shot list' }
  );
  assert.equal(next.stage, 'Production Plan');
  assert.equal(stageLogFor(next, 'Shot List')?.overrideReason, 'Cerpen teks tidak memerlukan shot list');
});

test('completed stages keep their previous output when the item moves on', () => {
  let item = makeItem();
  item = completeStage(item, 'Brief', { keyMessage: 'Pesan A' }, { actor: 'user', advance: true });
  item = completeStage(
    item,
    'Script / Slides',
    { script: 'Naskah yang cukup panjang untuk lolos validasi.' },
    { actor: 'user', advance: true }
  );
  assert.equal(item.stage, 'Shot List');
  assert.equal(stageLogFor(item, 'Brief')?.output.keyMessage, 'Pesan A');
  assert.equal((item.stageHistory || []).length, 2);
});

test('buildDraft prefills from the item so the form is not empty on first open', () => {
  const item = makeItem({ brief: { ...makeItem().brief, keyMessage: 'Pesan tersimpan' } });
  const draft = buildDraft(item, 'Brief');
  assert.equal(draft.keyMessage, 'Pesan tersimpan');
});

test('the board really has 11 stages and each one is gated in order', async () => {
  const { CONTENT_STAGES } = await import('../types/printos');
  assert.equal(CONTENT_STAGES.length, 11);
  assert.deepEqual(
    STAGE_GATES.map((g) => g.stage),
    [...CONTENT_STAGES]
  );
  assert.equal(nextStageOf('Review & Repurpose'), null);
});

test('migration keeps an existing stageHistory intact', async () => {
  const { migratePrintOSState } = await import('./contentStudio');
  const item = makeItem({
    stageHistory: [
      {
        id: 'log-1',
        stage: 'Brief',
        startedAtJakarta: '2026-10-28 09:12 WIB',
        completedAtJakarta: '2026-10-28 09:40 WIB',
        actor: 'agent',
        summary: 'Pesan inti ditetapkan',
        output: { keyMessage: 'Pesan inti ditetapkan' },
      },
    ],
  });
  const payload = JSON.stringify({
    schemaVersion: 2,
    products: [],
    tasks: [],
    contentProjects: [{ id: 'prj-1', name: 'P', pillar: 'personal', targetAudience: 'a', coreAngle: 'b', active: true }],
    contentSeries: [],
    contentItems: [item],
    contentPublications: [],
  });
  const result = migratePrintOSState(payload);
  assert.equal(result.status, 'ok');
  const migrated = result.state!.contentItems![0]!;
  assert.equal(migrated.stageHistory?.length, 1);
  assert.equal(migrated.stageHistory?.[0].completedAtJakarta, '2026-10-28 09:40 WIB');
  assert.equal(migrated.stageHistory?.[0].actor, 'agent');
});

test('a "script" that only repeats hook + key message is rejected', () => {
  const item = makeItem({
    stage: 'Script / Slides',
    brief: {
      hook: 'Ada 40 menit di mana semua orang pulang bersamaan.',
      keyMessage: 'Waktu adalah rute yang tidak ada di peta.',
      callToAction: 'Sebut jam pulang yang paling kamu hindari',
      targetAudience: 'Pekerja kantor',
      estimatedDurationSec: 24,
    },
    scriptText: '',
  });
  const echo = `${item.brief.hook}\n\n${item.brief.keyMessage}`;
  const problems = validateGate(item, 'Script / Slides', {
    script: echo,
    beatNotes: echo,
  });
  assert.ok(problems.some((p) => p.includes('menyalin hook')), problems.join(' | '));
});
