import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_ACTIONS, applyAgentAction } from '../../api/_actions.js';
import type { ContentResearchNote, MetricSnapshot } from '../types/printos';

const NOW = new Date('2026-10-30T12:00:00.000Z');

function makeWorkspace() {
  return {
    tasks: [{ id: 'tsk-1', title: 'Tugas yang tidak boleh berubah' }],
    contentItems: [{ id: 'cnt-1' }],
    contentResearchNotes: [] as ContentResearchNote[],
    metricSnapshots: [] as MetricSnapshot[],
    bridgeRequests: [] as Array<{
      requestId: string;
      action: string;
      resultId: string;
      at: string;
    }>,
  };
}

const BASE_RESEARCH = {
  title: 'Hook uji air 48 jam',
  sourcePlatform: 'TikTok',
  researchType: 'Hook',
  pillar: '3d_marketing',
  coreFinding: 'Hook uji air 48 jam menahan penonton jauh lebih lama.',
};

test('add-research creates a complete note and leaves other collections untouched', () => {
  const workspace = makeWorkspace();
  const tasksBefore = workspace.tasks;

  const result = applyAgentAction(workspace, 'add-research', BASE_RESEARCH, NOW);
  const note = result.created as ContentResearchNote;

  assert.equal(result.deduped, false);
  assert.equal(workspace.contentResearchNotes.length, 1);
  assert.match(note.id, /^rsr-[a-z0-9]+-[a-z0-9]{4}$/);
  assert.equal(note.capturedDate, '2026-10-30');
  assert.equal(note.validityDays, 60);
  assert.equal(note.expiresAtDate, '2026-12-29');
  assert.equal(note.updatedAt, '2026-10-30');
  assert.equal(note.decision, 'undecided');
  assert.equal(note.timesUsed, 0);
  assert.deepEqual(note.linkedContentItemIds, []);
  assert.deepEqual(note.links, []);
  assert.deepEqual(note.rawEvidence, {
    commentQuotes: '',
    metricsSnapshot: '',
    screenshotRef: '',
  });
  assert.equal('testOutcome' in note, false);
  assert.equal(workspace.tasks, tasksBefore);
  assert.equal(workspace.metricSnapshots.length, 0);
});

test('AGENT_ACTIONS lists exactly the three typed actions', () => {
  assert.deepEqual([...AGENT_ACTIONS], ['add-research', 'update-research', 'update-metric']);
});

test('the same requestId creates exactly one note and dedupes the retry', () => {
  const workspace = makeWorkspace();
  const payload = { ...BASE_RESEARCH, requestId: 'req-1' };

  const first = applyAgentAction(workspace, 'add-research', payload, NOW);
  const second = applyAgentAction(workspace, 'add-research', payload, NOW);

  assert.equal(first.deduped, false);
  assert.equal(second.deduped, true);
  assert.equal(workspace.contentResearchNotes.length, 1);
  assert.equal(second.created.id, first.created.id);
  assert.equal(workspace.bridgeRequests.length, 1);
});

test('add-research without requestId applies twice', () => {
  const workspace = makeWorkspace();
  applyAgentAction(workspace, 'add-research', BASE_RESEARCH, NOW);
  applyAgentAction(workspace, 'add-research', BASE_RESEARCH, NOW);
  assert.equal(workspace.contentResearchNotes.length, 2);
});

test('add-research rejects a short title and an empty finding', () => {
  const workspace = makeWorkspace();
  assert.throws(
    () => applyAgentAction(workspace, 'add-research', { ...BASE_RESEARCH, title: 'abc' }, NOW),
    /title minimal 4 karakter/
  );
  assert.throws(
    () => applyAgentAction(workspace, 'add-research', { ...BASE_RESEARCH, coreFinding: '' }, NOW),
    /coreFinding minimal 10 karakter/
  );
  assert.equal(workspace.contentResearchNotes.length, 0);
});

test('update-research changes only provided fields and bumps updatedAt', () => {
  const workspace = makeWorkspace();
  const created = applyAgentAction(workspace, 'add-research', BASE_RESEARCH, NOW)
    .created as ContentResearchNote;
  const title = created.title;
  const coreFinding = created.coreFinding;

  const later = new Date('2026-11-01T03:00:00.000Z');
  const note = applyAgentAction(
    workspace,
    'update-research',
    {
      researchId: created.id,
      decision: 'test_as_content',
      timesUsed: 2,
      validityDays: 90,
    },
    later
  ).created as ContentResearchNote;

  assert.equal(note.title, title);
  assert.equal(note.coreFinding, coreFinding);
  assert.equal(note.sourcePlatform, 'TikTok');
  assert.equal(note.decision, 'test_as_content');
  assert.equal(note.timesUsed, 2);
  assert.equal(note.validityDays, 90);
  assert.equal(note.expiresAtDate, '2027-01-28');
  assert.equal(note.updatedAt, '2026-11-01');
  assert.equal(workspace.contentResearchNotes.length, 1);
  assert.equal(workspace.metricSnapshots.length, 0);
});

test('update-research throws for an unknown id', () => {
  const workspace = makeWorkspace();
  assert.throws(
    () =>
      applyAgentAction(
        workspace,
        'update-research',
        { researchId: 'tidak-ada', decision: 'rejected' },
        NOW
      ),
    /Riset tidak ditemukan: tidak-ada/
  );
});

test('update-research rejects an invalid decision', () => {
  const workspace = makeWorkspace();
  const created = applyAgentAction(workspace, 'add-research', BASE_RESEARCH, NOW)
    .created as ContentResearchNote;

  assert.throws(
    () =>
      applyAgentAction(
        workspace,
        'update-research',
        { researchId: created.id, decision: 'maybe' },
        NOW
      ),
    /decision tidak dikenal: maybe/
  );
  assert.equal(created.decision, 'undecided');
});

test('update-metric keeps null as null and stamps recordedAtJakarta', () => {
  const workspace = makeWorkspace();
  const now = new Date('2026-10-30T12:05:00.000Z');

  const snapshot = applyAgentAction(
    workspace,
    'update-metric',
    {
      contentItemId: 'cnt-1',
      publicationId: 'pub-1',
      channel: 'TikTok',
      window: '24h',
      views: null,
      saves: 30,
    },
    now
  ).created as MetricSnapshot;

  assert.equal(snapshot.views, null);
  assert.equal(snapshot.likes, null);
  assert.equal(snapshot.saves, 30);
  assert.equal(snapshot.qualitativeNotes, '');
  assert.equal(snapshot.recordedAtJakarta, '2026-10-30 19:05');
  assert.match(snapshot.recordedAtJakarta, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.equal(workspace.metricSnapshots.length, 1);
  assert.equal(workspace.contentResearchNotes.length, 0);
});

test('the request ledger is capped at 200 entries, newest first', () => {
  const workspace = makeWorkspace();

  for (let i = 0; i < 205; i += 1) {
    applyAgentAction(
      workspace,
      'add-research',
      { ...BASE_RESEARCH, requestId: `req-${i}` },
      NOW
    );
  }

  assert.equal(workspace.bridgeRequests.length, 200);
  assert.equal(workspace.bridgeRequests[0].requestId, 'req-204');
  assert.equal(workspace.bridgeRequests[199].requestId, 'req-5');
});