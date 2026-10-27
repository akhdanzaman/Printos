import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_PRINTOS_STATE } from '../data/seedData';
import {
  addDaysIso,
  analyzeCreatorWorkload,
  buildCalendarDaysForMonth,
  calculateSponsorshipSummary,
  CURRENT_SCHEMA_VERSION,
  exportContentBriefMarkdown,
  formatMetricValue,
  getIndonesianDayName,
  getJakartaDateIso,
  getJakartaTimeWib,
  getWeekRangeForDateIso,
  isWeekendIso,
  migratePrintOSState,
  repurposeContentItem,
  shiftYearMonth,
  summarizeContentItemMetricsByWindow,
  summarizePublicationMetrics,
  syncContentTasksIdempotent,
  syncSponsorshipToFinancialsIdempotent,
} from './contentStudio';
import {
  createVersionedSnapshotRow,
  deserializeSheetRowsToState,
  extractSpreadsheetId,
  parseVersionedSnapshotRow,
  sanitizeSpreadsheetText,
  serializeStateToSheetRows,
  splitJsonIntoChunks,
  unsanitizeSpreadsheetText,
} from '../services/spreadsheetService';
import {
  ContentItem,
  ContentSponsorship,
  MetricSnapshot,
  ProductionSession,
} from '../types/printos';

test('Asia/Jakarta timezone boundary and calendar helpers work accurately', () => {
  // 2026-10-23T18:30:00Z is 2026-10-24 01:30 WIB (UTC+7)
  const lateUtcDate = new Date('2026-10-23T18:30:00Z');
  assert.equal(getJakartaDateIso(lateUtcDate), '2026-10-24');
  assert.equal(getJakartaTimeWib(lateUtcDate), '01:30');

  // 2026-10-23T16:59:00Z is 2026-10-23 23:59 WIB
  const beforeMidnightWib = new Date('2026-10-23T16:59:00Z');
  assert.equal(getJakartaDateIso(beforeMidnightWib), '2026-10-23');
  assert.equal(getJakartaTimeWib(beforeMidnightWib), '23:59');

  // Weekend & day name helpers
  assert.equal(isWeekendIso('2026-10-24'), true); // Saturday
  assert.equal(isWeekendIso('2026-10-25'), true); // Sunday
  assert.equal(isWeekendIso('2026-10-26'), false); // Monday
  assert.equal(getIndonesianDayName('2026-10-24'), 'Saturday');
  assert.equal(getIndonesianDayName('2026-10-26'), 'Monday');

  // Week range (Monday to Sunday)
  const week = getWeekRangeForDateIso('2026-10-23'); // Friday
  assert.equal(week.weekStartIso, '2026-10-19');
  assert.equal(week.weekEndIso, '2026-10-25');
  assert.equal(week.days.length, 7);

  // Month grid & navigation
  const grid = buildCalendarDaysForMonth('2026-10'); // October 2026
  assert.equal(grid.monthLabel, 'October 2026');
  assert.equal(grid.days.length % 7, 0);
  const shiftedNext = shiftYearMonth('2026-12', 1);
  assert.equal(shiftedNext, '2027-01');
  assert.equal(addDaysIso('2026-10-23', 5), '2026-10-28');
});

test('migratePrintOSState preserves legacy v1 3D-printing data and is strictly idempotent', () => {
  // Simulate a legacy v1 state from before Content Studio existed
  const legacyV1State = {
    products: INITIAL_PRINTOS_STATE.products.map((p) => {
      const copy = { ...p } as Record<string, unknown>;
      delete copy.stockQuantity; // Test legacy missing stockQuantity field too
      return copy;
    }),
    tasks: INITIAL_PRINTOS_STATE.tasks.filter((t) => !t.sourceType || t.sourceType === 'manual'),
    printers: INITIAL_PRINTOS_STATE.printers,
    printJobs: INITIAL_PRINTOS_STATE.printJobs,
    filaments: INITIAL_PRINTOS_STATE.filaments,
    researchNotes: INITIAL_PRINTOS_STATE.researchNotes,
    orders: INITIAL_PRINTOS_STATE.orders,
    financials: INITIAL_PRINTOS_STATE.financials.filter((f) => !f.sourceRefId),
  };

  const firstMigration = migratePrintOSState(legacyV1State);
  assert.equal(firstMigration.status, 'ok');
  assert.equal(firstMigration.migratedFromVersion, 1);
  assert.ok(firstMigration.state);
  const state1 = firstMigration.state!;

  assert.equal(state1.schemaVersion, CURRENT_SCHEMA_VERSION);
  // Preserves all 8 products, 7 legacy tasks, 6 filaments, 4 printers, 5 jobs, 5 orders
  assert.equal(state1.products.length, 8);
  assert.equal(state1.products[0].id, 'prod-1');
  assert.equal(typeof state1.products[0].stockQuantity, 'number');
  assert.equal(state1.filaments.length, 6);
  assert.equal(state1.filaments[0].id, 'fil-1');
  assert.equal(state1.printers.length, 4);
  assert.equal(state1.printJobs.length, 5);
  assert.equal(state1.orders.length, 5);

  // Seeded Content Studio entities are added cleanly
  assert.ok((state1.contentProjects || []).length >= 2);
  assert.ok((state1.contentItems || []).length >= 4);
  assert.ok((state1.contentPublications || []).length >= 4);

  // Idempotency check: migrating an already-migrated state produces identical data
  const secondMigration = migratePrintOSState(state1);
  assert.equal(secondMigration.status, 'ok');
  assert.equal(secondMigration.migratedFromVersion, CURRENT_SCHEMA_VERSION);
  assert.ok(secondMigration.state);
  const state2 = secondMigration.state!;
  assert.equal(state2.products.length, state1.products.length);
  assert.equal(state2.tasks.length, state1.tasks.length);
  assert.equal(state2.financials.length, state1.financials.length);
  assert.equal((state2.contentItems || []).length, (state1.contentItems || []).length);
  assert.equal(
    (state2.contentPublications || []).length,
    (state1.contentPublications || []).length
  );
});

test('migratePrintOSState never overwrites corrupt payloads with demo records', () => {
  const corruptJson = '{ "products": [ { "id": "prod-1", BROKEN_JSON ';
  const result = migratePrintOSState(corruptJson);
  assert.equal(result.status, 'corrupt');
  assert.equal(result.state, null);
  assert.equal(result.rawCorruptPayload, corruptJson);
  assert.ok(result.errorMessage && result.errorMessage.length > 0);

  const nonObjectPayload = '["not", "an", "object"]';
  const result2 = migratePrintOSState(nonObjectPayload);
  assert.equal(result2.status, 'corrupt');
  assert.equal(result2.state, null);
});

test('Personal content (short story without product or shots) and 3D-printing marketing workflows + repurpose work', () => {
  const items = INITIAL_PRINTOS_STATE.contentItems || [];
  const cerpenItem = items.find((c) => c.format === 'cerpen');
  assert.ok(cerpenItem, 'Seed state includes a text-only short story item');
  assert.equal(cerpenItem!.pillar, 'personal');
  assert.equal(cerpenItem!.linkedProductId, undefined, 'Personal story requires no product link');
  assert.equal(cerpenItem!.shots.length, 0, 'Text-only story requires no shot list');
  assert.equal(cerpenItem!.voiceOverEnabled, false);
  assert.ok(cerpenItem!.scriptText.length > 50);

  const marketingVideo = items.find(
    (c) => c.id === 'cnt-1' && c.pillar === '3d_marketing'
  );
  assert.ok(marketingVideo);
  assert.equal(marketingVideo!.linkedProductId, 'prod-3');
  assert.equal(marketingVideo!.voiceOverEnabled, true);
  assert.ok(marketingVideo!.shots.length >= 2);

  // Repurpose short video into carousel while preserving linkedProductId and references
  const repurposedCarousel: ContentItem = repurposeContentItem(
    marketingVideo!,
    'carousel',
    '3d_marketing',
    '2026-10-23'
  );
  assert.equal(repurposedCarousel.format, 'carousel');
  assert.equal(repurposedCarousel.linkedProductId, 'prod-3');
  assert.equal(repurposedCarousel.repurposedFromId, 'cnt-1');
  assert.ok(repurposedCarousel.carouselSlides.length >= 3);
  assert.equal(repurposedCarousel.voiceOverEnabled, false);
});

test('Manual metric snapshots distinguish null (unknown) from 0 and never sum cumulative 24h and 7d results', () => {
  const snapshots: MetricSnapshot[] = [
    {
      id: 'snap-24h',
      publicationId: 'pub-test-1',
      contentItemId: 'cnt-test-1',
      channel: 'TikTok',
      window: '24h',
      recordedAtJakarta: '2026-10-20 21:00',
      views: 1000,
      likes: 80,
      comments: 0, // explicit zero
      shares: null, // unknown (not yet recorded)
      saves: 25,
      watchTimeSeconds: 15,
      completionRatePercent: null,
      profileVisits: 12,
      productClicks: 0,
      qualitativeNotes: '24h check',
    },
    {
      id: 'snap-7d',
      publicationId: 'pub-test-1',
      contentItemId: 'cnt-test-1',
      channel: 'TikTok',
      window: '7d',
      recordedAtJakarta: '2026-10-26 21:00',
      views: 3500,
      likes: 280,
      comments: 12,
      shares: 19,
      saves: 90,
      watchTimeSeconds: 16.2,
      completionRatePercent: 38,
      profileVisits: 45,
      productClicks: 40,
      qualitativeNotes: '7d check',
    },
  ];

  // Formatting distinguishes null vs 0
  assert.equal(formatMetricValue(null), '— (Not recorded)');
  assert.equal(formatMetricValue(0), '0');
  assert.equal(formatMetricValue(1000), '1,000');

  const summary = summarizePublicationMetrics(snapshots, 'pub-test-1');
  assert.ok(summary.snapshot24h);
  assert.ok(summary.snapshot7d);
  assert.equal(summary.snapshot24h!.comments, 0);
  assert.equal(summary.snapshot24h!.shares, null);

  // Latest views is 7d (3500 views), NOT 1000 + 3500 = 4500!
  assert.equal(summary.latestViews, 3500);
  assert.notEqual(summary.latestViews, 4500);

  // Growth delta is 7d minus 24h when both exist
  assert.equal(summary.viewsGrowthAfter24h, 2500); // 3500 - 1000

  // Windowed aggregation across multiple publications of the same content item keeps 24h and 7d strictly separate
  const byWindow = summarizeContentItemMetricsByWindow(
    INITIAL_PRINTOS_STATE.metricSnapshots || [],
    'cnt-1'
  );
  assert.equal(byWindow.window24h.channelCount, 2);
  assert.equal(byWindow.window7d.channelCount, 1);
  // 24h views across pub-1 (4820) + pub-2 (2190) = 7010
  assert.equal(byWindow.window24h.views, 7010);
  // 7d views is only pub-1 7d (12450), never summed with 24h
  assert.equal(byWindow.window7d.views, 12450);
});

test('Task synchronization is idempotent and counts shared batch shooting session duration only once', () => {
  const sharedSession: ProductionSession = {
    id: 'psess-shared-batch',
    title: 'Batch Shoot 2 Content Items Together',
    date: '2026-10-24', // Saturday
    startTimeWib: '09:30',
    endTimeWib: '11:30',
    durationMinutes: 120,
    activityType: 'iPhone Shooting',
    location: 'Jakarta Desk Studio',
    device: 'iPhone 15 Pro + Desk Tripod',
    contentItemIds: ['cnt-1', 'cnt-2'], // 2 content items in 1 session
    completed: false,
    notes: 'Shared lighting setup',
  };

  const baseTasks = INITIAL_PRINTOS_STATE.tasks.filter(
    (t) => !t.sourceType || t.sourceType === 'manual'
  );
  const contentItems = INITIAL_PRINTOS_STATE.contentItems || [];

  const sync1 = syncContentTasksIdempotent(baseTasks, [sharedSession], contentItems);
  const sync2 = syncContentTasksIdempotent(sync1.tasks, [sharedSession], contentItems);
  const sync3 = syncContentTasksIdempotent(sync2.tasks, [sharedSession], contentItems);

  // No duplicate generated tasks after repeated calls
  assert.equal(sync1.tasks.length, sync2.tasks.length);
  assert.equal(sync2.tasks.length, sync3.tasks.length);
  assert.equal(sync2.createdCount, 0);
  assert.equal(sync3.createdCount, 0);

  const generatedForBatch = sync3.tasks.filter(
    (t) => t.sourceType === 'content_session' && t.sourceRefId === 'session:psess-shared-batch'
  );
  assert.equal(generatedForBatch.length, 1, 'Shared session generates exactly 1 task');
  assert.equal(
    generatedForBatch[0].estimatedMinutes,
    120,
    'Shared session effort is 120m once, never multiplied by 2 items'
  );

  // Workload analysis counts the 120-minute batch session ONCE, not 2 x 120 = 240 minutes
  const workload = analyzeCreatorWorkload(
    [sharedSession],
    INITIAL_PRINTOS_STATE.contentPublications || [],
    INITIAL_PRINTOS_STATE.creatorCapacity!,
    '2026-10-23'
  );
  assert.equal(workload.totalSharedSessionMinutes, 120);
  assert.equal(workload.weekendMinutesUsed, 120);
  assert.equal(workload.officeHourConflicts.length, 0);

  // Test weekday office hour conflict (07:00 - 17:00 WIB on Monday 2026-10-19)
  const conflictSession: ProductionSession = {
    ...sharedSession,
    id: 'psess-conflict',
    date: '2026-10-19', // Monday
    startTimeWib: '10:00',
    endTimeWib: '11:30',
    durationMinutes: 90,
  };
  const conflictWorkload = analyzeCreatorWorkload(
    [conflictSession],
    INITIAL_PRINTOS_STATE.contentPublications || [],
    INITIAL_PRINTOS_STATE.creatorCapacity!,
    '2026-10-23'
  );
  assert.equal(conflictWorkload.officeHourConflicts.length, 1);
  assert.ok(
    conflictWorkload.capacityWarnings.some((w) =>
      w.includes('conflict with primary office hours')
    )
  );
});

test('Sponsorship finance ledger sync distinguishes promised vs received income and is idempotent', () => {
  const sponsorships: ContentSponsorship[] = [
    {
      id: 'spon-promised',
      brandName: 'Brand A (Promised Only)',
      title: 'Unsettled Sponsorship Deal',
      contentItemId: 'cnt-1',
      agreedAmountRp: 1500000,
      productionExpenseRp: 100000,
      status: 'Promised / Invoiced',
      promisedDate: '2026-10-20',
      receivedDate: '',
      invoiceRef: 'INV-PROMISED-01',
      notes: '',
    },
    {
      id: 'spon-received',
      brandName: 'Brand B (Received Cash)',
      title: 'Settled Sponsorship Deal',
      contentItemId: 'cnt-2',
      agreedAmountRp: 900000,
      productionExpenseRp: 75000,
      status: 'Received / Paid',
      promisedDate: '2026-10-15',
      receivedDate: '2026-10-21',
      invoiceRef: 'INV-RECEIVED-02',
      notes: '',
    },
  ];

  const summary = calculateSponsorshipSummary(sponsorships);
  assert.equal(summary.promisedIncomeRp, 1500000);
  assert.equal(summary.receivedIncomeRp, 900000);
  assert.equal(summary.contentProductionExpenseRp, 175000);
  assert.equal(summary.netReceivedCreatorRp, 725000);

  const baseFinancials = INITIAL_PRINTOS_STATE.financials.filter((f) => !f.sourceRefId);
  const synced1 = syncSponsorshipToFinancialsIdempotent(baseFinancials, sponsorships);
  const synced2 = syncSponsorshipToFinancialsIdempotent(synced1.financials, sponsorships);

  // Strictly idempotent
  assert.equal(synced1.financials.length, synced2.financials.length);
  assert.equal(synced2.addedCount, 0);
  assert.equal(synced2.updatedCount, 0);

  // Promised sponsorship must NOT create an Income record in realized financials
  const promisedIncomeRecord = synced2.financials.find(
    (f) => f.sourceRefId === 'sponsorship_income:spon-promised'
  );
  assert.equal(promisedIncomeRecord, undefined);

  // Received sponsorship MUST create exactly 1 Income record
  const receivedIncomeRecords = synced2.financials.filter(
    (f) => f.sourceRefId === 'sponsorship_income:spon-received'
  );
  assert.equal(receivedIncomeRecords.length, 1);
  assert.equal(receivedIncomeRecords[0].amountRp, 900000);
  assert.equal(receivedIncomeRecords[0].type, 'Income');
});

test('Markdown brief export includes all connected workbench sections and honest local asset note', () => {
  const item = (INITIAL_PRINTOS_STATE.contentItems || [])[0];
  const project = (INITIAL_PRINTOS_STATE.contentProjects || [])[0];
  const series = (INITIAL_PRINTOS_STATE.contentSeries || [])[0];
  const product = INITIAL_PRINTOS_STATE.products[0];
  const pubs = (INITIAL_PRINTOS_STATE.contentPublications || []).filter(
    (p) => p.contentItemId === item.id
  );
  const sessions = INITIAL_PRINTOS_STATE.productionSessions || [];
  const snaps = INITIAL_PRINTOS_STATE.metricSnapshots || [];

  const md = exportContentBriefMarkdown(item, {
    project,
    series,
    product,
    publications: pubs,
    sessions,
    snapshots: snaps,
  });
  assert.ok(md.includes(item.title));
  assert.ok(md.includes('## 1. Creative Brief'));
  assert.ok(md.includes('## 2. Research References & Fact Checks'));
  assert.ok(md.includes('## 3. Script / Short Story / Carousel Slides'));
  assert.ok(md.includes('## 4. Camera Shot List (iPhone)'));
  assert.ok(md.includes('local filenames on your device/iPhone storage, not cloud uploads'));
  assert.ok(md.includes('## 8. Multi-Channel Publication Schedule & Status'));
});

test('Google Sheets versioned snapshots support large multi-chunk round-trips and safe formula characters', () => {
  assert.equal(
    extractSpreadsheetId(
      'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz_123456/edit#gid=0'
    ),
    '1AbCdEfGhIjKlMnOpQrStUvWxYz_123456'
  );

  // Formula-like text should be sanitized with leading apostrophe for human-readable cells and unsanitized cleanly
  const trickyText = '=SUM(A1:A10) + @creator_handle - 100%';
  const sanitized = String(sanitizeSpreadsheetText(trickyText));
  assert.equal(sanitized, `'${trickyText}`);
  assert.equal(unsanitizeSpreadsheetText(sanitized), trickyText);

  // Create a large state exceeding 60,000 characters to test multi-chunk splitting and reassembly
  const largeNotes = 'Long Short Story & Production Notes '.repeat(2200); // ~79,200 chars
  const items = INITIAL_PRINTOS_STATE.contentItems || [];
  const largeState = {
    ...INITIAL_PRINTOS_STATE,
    contentItems: items.map((item, idx) =>
      idx === 0
        ? {
            ...item,
            brief: {
              ...item.brief,
              hook: trickyText,
            },
            scriptText: largeNotes,
          }
        : item
    ),
  };

  const jsonPayload = JSON.stringify(largeState);
  assert.ok(jsonPayload.length > 60000, 'Payload exceeds single-cell 50k limit');

  const chunks = splitJsonIntoChunks(jsonPayload, 25000);
  assert.ok(chunks.length >= 3, 'Splits into multiple safe chunks');

  const createdSnap = createVersionedSnapshotRow(largeState, {
    revisionId: 'rev-7-large-test',
    savedAt: '2026-10-23T14:00:00.000Z',
    parentRevisionId: 'rev-6-prev',
  });
  assert.equal(createdSnap.chunkCount, chunks.length);

  const parsedSnapshot = parseVersionedSnapshotRow(createdSnap.snapshotRow.map(String));
  assert.ok(parsedSnapshot);
  assert.equal(parsedSnapshot!.revisionId, 'rev-7-large-test');
  assert.equal(parsedSnapshot!.parentRevisionId, 'rev-6-prev');
  assert.equal(parsedSnapshot!.state.contentItems?.[0].brief.hook, trickyText);
  assert.equal(parsedSnapshot!.state.contentItems?.[0].scriptText.length, largeNotes.length);

  // Also verify serializeStateToSheetRows -> deserializeSheetRowsToState round-trip (both V2 and legacy V1)
  const serialized = serializeStateToSheetRows(largeState);
  const restoredV1 = deserializeSheetRowsToState(
    serialized.summaryRows.map((r) => r.map(String)),
    INITIAL_PRINTOS_STATE
  );
  assert.ok(restoredV1.state);
  assert.equal(restoredV1.state.products.length, largeState.products.length);
  assert.equal(restoredV1.state.contentItems?.[0].brief.hook, trickyText);
  assert.equal(restoredV1.state.contentItems?.[0].scriptText.length, largeNotes.length);

  const restoredV2 = deserializeSheetRowsToState(
    [createdSnap.snapshotRow.map(String)],
    INITIAL_PRINTOS_STATE
  );
  assert.equal(restoredV2.revisionId, 'rev-7-large-test');
  assert.equal(restoredV2.state.contentItems?.[0].brief.hook, trickyText);
});
