import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_PRINTOS_STATE } from '../data/seedData';
import {
  buildWeeklyResearchDigest,
  computeExpirationDateIso,
  filterContentResearchNotes,
  getResearchFreshnessStatus,
  reverifyResearchNote,
  spawnContentItemFromResearch,
} from './contentResearch';

test('getResearchFreshnessStatus distinguishes fresh, expiring_soon, and expired research trends', () => {
  const referenceToday = '2026-10-25';

  // 1. Fresh note (cres-1 expires 2027-01-17)
  const freshNote = INITIAL_PRINTOS_STATE.contentResearchNotes![0];
  const freshStatus = getResearchFreshnessStatus(freshNote, referenceToday);
  assert.equal(freshStatus.status, 'fresh');
  assert.ok(freshStatus.daysRemaining > 14);

  // 2. Expiring soon note (cres-5 expires 2026-11-04, which is 10 days from 2026-10-25)
  const expiringNote = INITIAL_PRINTOS_STATE.contentResearchNotes![4];
  const expiringStatus = getResearchFreshnessStatus(expiringNote, referenceToday);
  assert.equal(expiringStatus.status, 'expiring_soon');
  assert.equal(expiringStatus.daysRemaining, 10);

  // 3. Expired trend note (cres-6 expired 2026-02-08)
  const expiredNote = INITIAL_PRINTOS_STATE.contentResearchNotes![5];
  const expiredStatus = getResearchFreshnessStatus(expiredNote, referenceToday);
  assert.equal(expiredStatus.status, 'expired');
  assert.ok(expiredStatus.daysRemaining < 0);
  assert.match(expiredStatus.label, /Expired \d+d ago/);
});

test('reverifyResearchNote extends expiration window from today', () => {
  const expiredNote = INITIAL_PRINTOS_STATE.contentResearchNotes![5];
  const reverified = reverifyResearchNote(expiredNote, '2026-10-25', 60);
  assert.equal(reverified.expiresAtDate, computeExpirationDateIso('2026-10-25', 60));
  const status = getResearchFreshnessStatus(reverified, '2026-10-25');
  assert.equal(status.status, 'fresh');
  assert.equal(status.daysRemaining, 60);
});

test('filterContentResearchNotes filters by pillar, researchType, decision, freshness, and raw evidence search', () => {
  const notes = INITIAL_PRINTOS_STATE.contentResearchNotes!;
  const refDate = '2026-10-25';

  // Filter by pillar 'personal'
  const personalNotes = filterContentResearchNotes(
    notes,
    { pillar: 'personal' },
    refDate
  );
  assert.equal(personalNotes.length, 1);
  assert.equal(personalNotes[0].id, 'cres-3');

  // Filter by researchType 'Pricing / Market'
  const pricingNotes = filterContentResearchNotes(
    notes,
    { researchType: 'Pricing / Market' },
    refDate
  );
  assert.equal(pricingNotes.length, 1);
  assert.equal(pricingNotes[0].id, 'cres-2');

  // Filter by decision 'rejected' and freshness 'expired'
  const expiredRejected = filterContentResearchNotes(
    notes,
    { decision: 'rejected', freshness: 'expired' },
    refDate
  );
  assert.equal(expiredRejected.length, 1);
  assert.equal(expiredRejected[0].id, 'cres-6');

  // Filter active_only excludes expired trend
  const activeOnly = filterContentResearchNotes(
    notes,
    { freshness: 'active_only' },
    refDate
  );
  assert.equal(activeOnly.some((n) => n.id === 'cres-6'), false);
  assert.equal(activeOnly.length, 5);

  // Search inside verbatim comment quotes
  const quoteMatch = filterContentResearchNotes(
    notes,
    { searchQuery: 'mur kuningan M3' },
    refDate
  );
  assert.equal(quoteMatch.length, 1);
  assert.equal(quoteMatch[0].id, 'cres-4');
});

test('buildWeeklyResearchDigest summarizes new findings, tested outcomes with 24h/7d metrics, and unanswered questions', () => {
  const notes = INITIAL_PRINTOS_STATE.contentResearchNotes!;
  const items = INITIAL_PRINTOS_STATE.contentItems!;
  const snapshots = INITIAL_PRINTOS_STATE.metricSnapshots!;

  const digest = buildWeeklyResearchDigest(
    notes,
    items,
    snapshots,
    '2026-10-25',
    7
  );

  // Window is 2026-10-19 .. 2026-10-25 (cres-1, cres-2, cres-3, cres-4 were captured in this window)
  assert.equal(digest.windowStartIso, '2026-10-19');
  assert.equal(digest.windowEndIso, '2026-10-25');
  assert.equal(digest.newFindings.length, 4);

  // Tested findings include cres-1..cres-4 and enrich cres-1 with cnt-1 metrics without summing 24h + 7d
  assert.equal(digest.testedFindings.length, 4);
  const cres1Tested = digest.testedFindings.find((t) => t.note.id === 'cres-1');
  assert.ok(cres1Tested);
  assert.equal(cres1Tested.linkedItems.length, 1);
  // cnt-1 has 24h views (4820 + 2190 = 7010 across TikTok & IG) and 7d views (12450 on TikTok), never summed together
  assert.equal(cres1Tested.linkedItems[0].views24h, 7010);
  assert.equal(cres1Tested.linkedItems[0].views7d, 12450);

  // Unanswered questions include notes with openQuestion or hypothesis status (cres-2, cres-3, cres-5)
  assert.equal(digest.unansweredQuestions.length, 3);
  assert.ok(digest.unansweredQuestions.some((n) => n.id === 'cres-3'));
  assert.ok(digest.unansweredQuestions.some((n) => n.id === 'cres-5'));

  // Conversion metrics
  assert.equal(digest.metrics.totalNotes, 6);
  assert.equal(digest.metrics.decidedCount, 6);
  assert.equal(digest.metrics.decisionConversionRatePercent, 100);
  assert.equal(digest.metrics.testedAsContentCount, 4);
  assert.equal(digest.metrics.spawnedContentCount, 4);
  assert.equal(digest.metrics.provenWinnersCount, 1);
  assert.equal(digest.metrics.expiredCount, 1);
});

test('spawnContentItemFromResearch creates connected ContentItem and updates research decision & links idempotently', () => {
  const postponedNote = INITIAL_PRINTOS_STATE.contentResearchNotes![4]; // cres-5
  const projects = INITIAL_PRINTOS_STATE.contentProjects!;

  const { newItem, updatedNote } = spawnContentItemFromResearch(postponedNote, {
    projects,
    defaultFormat: 'short_video',
    existingContentCount: 4,
    todayIso: '2026-10-25',
    customId: 'cnt-test-seo-1',
  });

  assert.equal(newItem.id, 'cnt-test-seo-1');
  assert.equal(newItem.pillar, '3d_marketing');
  assert.equal(newItem.linkedProductId, 'prod-3');
  assert.equal(newItem.seriesId, 'cser-1');
  assert.equal(newItem.references.length, 1);
  assert.match(newItem.references[0].title, /cres-5|Pot Tanaman/i);

  assert.equal(updatedNote.decision, 'test_as_content');
  assert.equal(updatedNote.testOutcome, 'in_testing');
  assert.deepEqual(updatedNote.linkedContentItemIds, ['cnt-test-seo-1']);

  // Calling again with same customId does not duplicate linkedContentItemIds
  const second = spawnContentItemFromResearch(updatedNote, {
    projects,
    defaultFormat: 'short_video',
    existingContentCount: 5,
    todayIso: '2026-10-25',
    customId: 'cnt-test-seo-1',
  });
  assert.deepEqual(second.updatedNote.linkedContentItemIds, ['cnt-test-seo-1']);
});

test('getNormalizedResearchLinks and recordStrategyUsed support multi-link references and strategy recall tracking', async () => {
  const { getNormalizedResearchLinks, recordStrategyUsed } = await import(
    './contentResearch'
  );
  const notes = INITIAL_PRINTOS_STATE.contentResearchNotes!;
  const cres1Links = getNormalizedResearchLinks(notes[0]);
  assert.equal(cres1Links.length, 2);
  assert.equal(cres1Links[0].category, 'Content Example');
  assert.equal(cres1Links[1].category, 'Theory / Framework');

  // Filter by linkCategory 'Theory / Framework'
  const theoryNotes = filterContentResearchNotes(
    notes,
    { linkCategory: 'Theory / Framework' },
    '2026-10-25'
  );
  assert.equal(theoryNotes.length, 5);

  // Record strategy used increments timesUsed and marks willUseAgain = true
  const recalled = recordStrategyUsed(notes[4], '2026-10-28');
  assert.equal(recalled.timesUsed, 1);
  assert.equal(recalled.lastUsedDate, '2026-10-28');
  assert.equal(recalled.willUseAgain, true);
});

