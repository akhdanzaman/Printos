/**
 * Typed agent actions for the PrintOS <> Hermes bridge.
 *
 * Each action touches exactly one collection and (when `requestId` is supplied)
 * records one ledger entry in `workspace.bridgeRequests`, so retries are safe.
 */

export const AGENT_ACTIONS = ['add-research', 'update-research', 'update-metric'];

const CHANNEL_PLATFORMS = ['TikTok', 'Instagram', 'YouTube', 'Threads/Blog'];
const METRIC_WINDOWS = ['24h', '7d'];
const RESEARCH_DECISIONS = ['test_as_content', 'postponed', 'rejected', 'undecided'];
const RESEARCH_TEST_OUTCOMES = ['in_testing', 'proven_winner', 'inconclusive', 'disproven'];
const VERIFICATION_METHODS = ['desk_research', 'self_verified'];
const EPISTEMIC_STATUSES = ['hypothesis', 'confirmed'];
const CONFIDENCE_LEVELS = ['Low', 'Medium', 'High'];

const LEDGER_LIMIT = 200;

function jakartaDate(now) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function jakartaStamp(now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const pick = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}`;
}

function addDaysIso(isoDate, deltaDays) {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(ms)) return isoDate;
  return new Date(ms + deltaDays * 86_400_000).toISOString().slice(0, 10);
}

function newId(prefix, now) {
  const random = Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  return `${prefix}-${now.getTime().toString(36)}-${random}`;
}

function text(value) {
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
}

function requireString(payload, field, message) {
  const value = text(payload[field]).trim();
  if (!value) throw new Error(message);
  return value;
}

function pickOne(value, allowed, fallback, field) {
  if (value === undefined || value === null || value === '') return fallback;
  if (!allowed.includes(value)) throw new Error(`${field} tidak dikenal: ${value}`);
  return value;
}

function optionalText(value) {
  const trimmed = text(value).trim();
  return trimmed ? trimmed : undefined;
}

function validity(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const days = Number(value);
  if (!Number.isFinite(days) || days <= 0) throw new Error('validityDays harus angka positif');
  return Math.max(1, Math.round(days));
}

function metricNumber(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${field} harus angka atau null`);
  return number;
}

function ledgerOf(workspace) {
  return Array.isArray(workspace.bridgeRequests) ? workspace.bridgeRequests : [];
}

function findApplied(workspace, requestId) {
  if (typeof requestId !== 'string' || !requestId.trim()) return null;
  return ledgerOf(workspace).find((entry) => entry?.requestId === requestId) || null;
}

function recordOf(workspace, action, resultId) {
  if (!resultId) return null;
  const collection =
    action === 'update-metric' ? workspace.metricSnapshots : workspace.contentResearchNotes;
  if (!Array.isArray(collection)) return null;
  return collection.find((record) => record?.id === resultId) || null;
}

function remember(workspace, requestId, action, resultId, now) {
  if (typeof requestId !== 'string' || !requestId.trim()) return;
  const entry = { requestId, action, resultId, at: now.toISOString() };
  workspace.bridgeRequests = [entry, ...ledgerOf(workspace)].slice(0, LEDGER_LIMIT);
}

function targetCollection(workspace, action) {
  if (action === 'update-metric') {
    if (!Array.isArray(workspace.metricSnapshots)) workspace.metricSnapshots = [];
    return workspace.metricSnapshots;
  }
  if (!Array.isArray(workspace.contentResearchNotes)) workspace.contentResearchNotes = [];
  return workspace.contentResearchNotes;
}

function addResearch(workspace, payload, now) {
  const title = requireString(payload, 'title', 'title minimal 4 karakter');
  if (title.length < 4) throw new Error('title minimal 4 karakter');

  const coreFinding = requireString(payload, 'coreFinding', 'coreFinding minimal 10 karakter');
  if (coreFinding.length < 10) throw new Error('coreFinding minimal 10 karakter');

  const sourcePlatform = requireString(payload, 'sourcePlatform', 'sourcePlatform wajib diisi');
  const researchType = requireString(payload, 'researchType', 'researchType wajib diisi');
  const pillar = requireString(payload, 'pillar', 'pillar wajib diisi');

  const capturedDate = jakartaDate(now);
  const validityDays = validity(payload.validityDays, 60);
  const evidence =
    payload.rawEvidence && typeof payload.rawEvidence === 'object' ? payload.rawEvidence : {};

  const note = {
    id: newId('rsr', now),
    title,
    sourcePlatform,
    sourceAccount: text(payload.sourceAccount),
    sourceUrl: optionalText(payload.sourceUrl),
    links: Array.isArray(payload.links) ? payload.links : [],
    capturedDate,
    pillar,
    seriesId: optionalText(payload.seriesId),
    researchType,
    coreFinding,
    rawEvidence: {
      commentQuotes: text(evidence.commentQuotes),
      metricsSnapshot: text(evidence.metricsSnapshot),
      screenshotRef: text(evidence.screenshotRef),
    },
    verificationMethod: pickOne(
      payload.verificationMethod,
      VERIFICATION_METHODS,
      'desk_research',
      'verificationMethod'
    ),
    epistemicStatus: pickOne(
      payload.epistemicStatus,
      EPISTEMIC_STATUSES,
      'hypothesis',
      'epistemicStatus'
    ),
    confidenceLevel: pickOne(
      payload.confidenceLevel,
      CONFIDENCE_LEVELS,
      'Medium',
      'confidenceLevel'
    ),
    openQuestion: optionalText(payload.openQuestion),
    decision: 'undecided',
    decisionReason: text(payload.decisionReason),
    linkedContentItemIds: [],
    timesUsed: 0,
    validityDays,
    expiresAtDate: addDaysIso(capturedDate, validityDays),
    updatedAt: capturedDate,
  };

  targetCollection(workspace, 'add-research').push(note);
  return note;
}

function updateResearch(workspace, payload, now) {
  const researchId = requireString(payload, 'researchId', 'researchId wajib diisi');
  const notes = Array.isArray(workspace.contentResearchNotes)
    ? workspace.contentResearchNotes
    : [];
  const note = notes.find((entry) => entry?.id === researchId);
  if (!note) throw new Error(`Riset tidak ditemukan: ${researchId}`);

  if (payload.decision !== undefined) {
    note.decision = pickOne(payload.decision, RESEARCH_DECISIONS, undefined, 'decision');
  }
  if (payload.testOutcome !== undefined) {
    note.testOutcome = pickOne(
      payload.testOutcome,
      RESEARCH_TEST_OUTCOMES,
      undefined,
      'testOutcome'
    );
  }
  if (payload.decisionReason !== undefined) note.decisionReason = text(payload.decisionReason);
  if (payload.testResultSummary !== undefined) {
    note.testResultSummary = text(payload.testResultSummary);
  }
  if (payload.openQuestion !== undefined) note.openQuestion = text(payload.openQuestion);
  if (payload.timesUsed !== undefined) {
    const used = Number(payload.timesUsed);
    if (!Number.isFinite(used)) throw new Error('timesUsed harus angka');
    note.timesUsed = Math.max(0, Math.round(used));
  }
  if (payload.willUseAgain !== undefined) note.willUseAgain = Boolean(payload.willUseAgain);
  if (payload.validityDays !== undefined) {
    const days = validity(payload.validityDays, note.validityDays || 60);
    note.validityDays = days;
    note.expiresAtDate = addDaysIso(note.capturedDate, days);
  }

  note.updatedAt = jakartaDate(now);
  return note;
}

function updateMetric(workspace, payload, now) {
  const contentItemId = requireString(payload, 'contentItemId', 'contentItemId wajib diisi');
  const publicationId = requireString(payload, 'publicationId', 'publicationId wajib diisi');
  const channel = requireString(payload, 'channel', 'channel wajib diisi');
  if (!CHANNEL_PLATFORMS.includes(channel)) {
    throw new Error(`channel tidak dikenal: ${channel}`);
  }
  const window = requireString(payload, 'window', 'window wajib diisi');
  if (!METRIC_WINDOWS.includes(window)) {
    throw new Error('window harus 24h atau 7d');
  }

  const snapshot = {
    id: newId('msnap', now),
    publicationId,
    contentItemId,
    channel,
    window,
    recordedAtJakarta: jakartaStamp(now),
    views: metricNumber(payload.views, 'views'),
    likes: metricNumber(payload.likes, 'likes'),
    comments: metricNumber(payload.comments, 'comments'),
    shares: metricNumber(payload.shares, 'shares'),
    saves: metricNumber(payload.saves, 'saves'),
    watchTimeSeconds: metricNumber(payload.watchTimeSeconds, 'watchTimeSeconds'),
    completionRatePercent: metricNumber(
      payload.completionRatePercent,
      'completionRatePercent'
    ),
    profileVisits: metricNumber(payload.profileVisits, 'profileVisits'),
    productClicks: metricNumber(payload.productClicks, 'productClicks'),
    qualitativeNotes: text(payload.qualitativeNotes),
  };

  targetCollection(workspace, 'update-metric').push(snapshot);
  return snapshot;
}

export function applyAgentAction(workspace, action, payload, now = new Date()) {
  if (!workspace || typeof workspace !== 'object') throw new Error('workspace harus objek');
  if (!AGENT_ACTIONS.includes(action)) throw new Error(`action tidak dikenal: ${action}`);
  const input = payload && typeof payload === 'object' ? payload : {};
  const requestId = typeof input.requestId === 'string' ? input.requestId.trim() : '';

  const applied = findApplied(workspace, requestId);
  if (applied) {
    return {
      workspace,
      created: recordOf(workspace, applied.action, applied.resultId),
      deduped: true,
    };
  }

  let created;
  if (action === 'add-research') created = addResearch(workspace, input, now);
  else if (action === 'update-research') created = updateResearch(workspace, input, now);
  else created = updateMetric(workspace, input, now);

  remember(workspace, requestId, action, created.id, now);
  return { workspace, created, deduped: false };
}