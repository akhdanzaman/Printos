import {
  ContentFormat,
  ContentItem,
  ContentPillar,
  ContentProject,
  ContentResearchNote,
  ContentResearchType,
  EpistemicStatus,
  MetricSnapshot,
  ResearchDecision,
  ResearchLinkCategory,
  ResearchReferenceLink,
  VerificationMethod,
} from '../types/printos';
import { diffDaysISO } from './calculations';
import {
  addDaysIso,
  summarizeContentItemMetricsByWindow,
} from './contentStudio';

export type FreshnessStatus = 'fresh' | 'expiring_soon' | 'expired';

export interface ResearchFreshnessInfo {
  status: FreshnessStatus;
  daysRemaining: number;
  ageDays: number;
  expiresAtDate: string;
  label: string;
}

/**
 * Returns normalized reference links (Content Examples, Theories/Frameworks, etc.)
 * for a research note, falling back to `sourceUrl` if `links` is empty.
 */
export function getNormalizedResearchLinks(
  note: Pick<
    ContentResearchNote,
    'id' | 'links' | 'sourceUrl' | 'sourcePlatform' | 'sourceAccount'
  >
): ResearchReferenceLink[] {
  if (Array.isArray(note.links) && note.links.length > 0) {
    return note.links.filter((l) => Boolean(l && l.url && l.url.trim()));
  }
  if (note.sourceUrl && note.sourceUrl.trim()) {
    return [
      {
        id: `rlink-fallback-${note.id}`,
        label: `${note.sourcePlatform} (${note.sourceAccount || 'Reference'})`,
        url: note.sourceUrl.trim(),
        category: 'Content Example',
      },
    ];
  }
  return [];
}

/**
 * Records that a strategy in the research vault was used again on `todayIso`,
 * incrementing `timesUsed` and marking `willUseAgain = true`.
 */
export function recordStrategyUsed(
  note: ContentResearchNote,
  todayIso: string
): ContentResearchNote {
  const nextCount = Math.max(0, Number(note.timesUsed) || 0) + 1;
  return {
    ...note,
    decision: note.decision === 'rejected' ? 'test_as_content' : note.decision,
    timesUsed: nextCount,
    lastUsedDate: todayIso,
    willUseAgain: true,
    updatedAt: todayIso,
  };
}

/**
 * Computes the expiration date YYYY-MM-DD from capturedDate + validityDays.
 */
export function computeExpirationDateIso(
  capturedDateIso: string,
  validityDays: number
): string {
  const safeDays = Math.max(1, Math.round(Number(validityDays) || 60));
  return addDaysIso(capturedDateIso, safeDays);
}

/**
 * Evaluates whether a research note is fresh, expiring soon (<= 14 days left),
 * or expired (< 0 days left) relative to referenceDateIso.
 */
export function getResearchFreshnessStatus(
  note: Pick<ContentResearchNote, 'capturedDate' | 'validityDays' | 'expiresAtDate'>,
  referenceDateIso: string
): ResearchFreshnessInfo {
  const expiresAtDate =
    note.expiresAtDate ||
    computeExpirationDateIso(note.capturedDate, note.validityDays || 60);

  const daysRemaining = diffDaysISO(referenceDateIso, expiresAtDate);
  const ageDays = Math.max(0, diffDaysISO(note.capturedDate, referenceDateIso));

  if (daysRemaining < 0) {
    const overdue = Math.abs(daysRemaining);
    return {
      status: 'expired',
      daysRemaining,
      ageDays,
      expiresAtDate,
      label: `Expired ${overdue}d ago (Trend may have shifted)`,
    };
  }

  if (daysRemaining <= 14) {
    return {
      status: 'expiring_soon',
      daysRemaining,
      ageDays,
      expiresAtDate,
      label: daysRemaining === 0 ? 'Expires today' : `Expiring in ${daysRemaining}d`,
    };
  }

  return {
    status: 'fresh',
    daysRemaining,
    ageDays,
    expiresAtDate,
    label: `Fresh (${daysRemaining}d left)`,
  };
}

/**
 * Re-verifies a research note as of `todayIso`, extending its expiration window
 * so verified evergreen or still-active trends stay current.
 */
export function reverifyResearchNote(
  note: ContentResearchNote,
  todayIso: string,
  extensionDays?: number
): ContentResearchNote {
  const nextValidity = Math.max(
    1,
    Math.round(extensionDays ?? (note.validityDays || 60))
  );
  return {
    ...note,
    validityDays: nextValidity,
    expiresAtDate: addDaysIso(todayIso, nextValidity),
    updatedAt: todayIso,
  };
}

export interface ContentResearchFilterCriteria {
  searchQuery?: string;
  pillar?: 'ALL' | ContentPillar;
  seriesId?: 'ALL' | string;
  researchType?: 'ALL' | ContentResearchType;
  decision?: 'ALL' | ResearchDecision;
  verificationMethod?: 'ALL' | VerificationMethod;
  epistemicStatus?: 'ALL' | EpistemicStatus;
  freshness?: 'ALL' | FreshnessStatus | 'active_only';
  linkCategory?: 'ALL' | ResearchLinkCategory;
}

/**
 * Filters ContentResearchNote items by search query, pillar, series, research type,
 * decision status, verification status, epistemic status, link category, and expiration state.
 */
export function filterContentResearchNotes(
  notes: ContentResearchNote[],
  criteria: ContentResearchFilterCriteria,
  referenceDateIso: string
): ContentResearchNote[] {
  const q = (criteria.searchQuery || '').trim().toLowerCase();

  return notes.filter((note) => {
    if (criteria.pillar && criteria.pillar !== 'ALL' && note.pillar !== criteria.pillar) {
      return false;
    }

    if (
      criteria.seriesId &&
      criteria.seriesId !== 'ALL' &&
      (note.seriesId || '') !== criteria.seriesId
    ) {
      return false;
    }

    if (
      criteria.researchType &&
      criteria.researchType !== 'ALL' &&
      note.researchType !== criteria.researchType
    ) {
      return false;
    }

    if (
      criteria.decision &&
      criteria.decision !== 'ALL' &&
      note.decision !== criteria.decision
    ) {
      return false;
    }

    if (
      criteria.verificationMethod &&
      criteria.verificationMethod !== 'ALL' &&
      note.verificationMethod !== criteria.verificationMethod
    ) {
      return false;
    }

    if (
      criteria.epistemicStatus &&
      criteria.epistemicStatus !== 'ALL' &&
      note.epistemicStatus !== criteria.epistemicStatus
    ) {
      return false;
    }

    if (criteria.linkCategory && criteria.linkCategory !== 'ALL') {
      const links = getNormalizedResearchLinks(note);
      if (!links.some((l) => l.category === criteria.linkCategory)) {
        return false;
      }
    }

    if (criteria.freshness && criteria.freshness !== 'ALL') {
      const freshness = getResearchFreshnessStatus(note, referenceDateIso);
      if (criteria.freshness === 'active_only') {
        if (freshness.status === 'expired') return false;
      } else if (freshness.status !== criteria.freshness) {
        return false;
      }
    }

    if (q) {
      const links = getNormalizedResearchLinks(note);
      const linksText = links
        .map((l) => `${l.category} ${l.label} ${l.url}`)
        .join(' ');
      const searchable = [
        note.title,
        note.coreFinding,
        note.sourcePlatform,
        note.sourceAccount,
        note.sourceUrl || '',
        linksText,
        note.researchType,
        note.rawEvidence?.commentQuotes || '',
        note.rawEvidence?.metricsSnapshot || '',
        note.rawEvidence?.screenshotRef || '',
        note.decisionReason,
        note.openQuestion || '',
        note.testResultSummary || '',
      ]
        .join(' ')
        .toLowerCase();

      if (!searchable.includes(q)) {
        return false;
      }
    }

    return true;
  });
}

export interface EnrichedTestedFinding {
  note: ContentResearchNote;
  linkedItems: {
    item: ContentItem;
    views24h: number | null;
    views7d: number | null;
    saves24h: number | null;
    saves7d: number | null;
    productClicks7d: number | null;
  }[];
}

export interface WeeklyResearchDigest {
  windowStartIso: string;
  windowEndIso: string;
  newFindings: ContentResearchNote[];
  testedFindings: EnrichedTestedFinding[];
  unansweredQuestions: ContentResearchNote[];
  expiredOrExpiringNotes: {
    note: ContentResearchNote;
    freshness: ResearchFreshnessInfo;
  }[];
  metrics: {
    totalNotes: number;
    decidedCount: number;
    decisionConversionRatePercent: number;
    testedAsContentCount: number;
    contentExecutionRatePercent: number;
    spawnedContentCount: number;
    provenWinnersCount: number;
    postponedCount: number;
    rejectedCount: number;
    undecidedCount: number;
    openQuestionsCount: number;
    expiredCount: number;
  };
}

/**
 * Builds the Weekly Research & Decision Digest:
 * 1) New findings captured during the 7-day window ending on `referenceDateIso`
 * 2) Tested findings & their actual linked ContentItem metrics/results
 * 3) Unanswered questions & open hypotheses requiring verification
 * 4) Decision & content conversion metrics (measuring how many findings turn into real decisions/content vs link graveyard)
 */
export function buildWeeklyResearchDigest(
  notes: ContentResearchNote[],
  contentItems: ContentItem[],
  metricSnapshots: MetricSnapshot[],
  referenceDateIso: string,
  windowDays = 7
): WeeklyResearchDigest {
  const safeWindow = Math.max(1, windowDays);
  const windowStartIso = addDaysIso(referenceDateIso, -(safeWindow - 1));
  const windowEndIso = referenceDateIso;

  const contentMap = new Map(contentItems.map((c) => [c.id, c]));

  const newFindings = notes
    .filter(
      (n) =>
        diffDaysISO(windowStartIso, n.capturedDate) >= 0 &&
        diffDaysISO(n.capturedDate, windowEndIso) >= 0
    )
    .sort((a, b) => b.capturedDate.localeCompare(a.capturedDate));

  const testedFindings: EnrichedTestedFinding[] = notes
    .filter(
      (n) =>
        n.decision === 'test_as_content' ||
        (Array.isArray(n.linkedContentItemIds) && n.linkedContentItemIds.length > 0)
    )
    .map((note) => {
      const linkedItems = (note.linkedContentItemIds || [])
        .map((id) => contentMap.get(id))
        .filter((item): item is ContentItem => Boolean(item))
        .map((item) => {
          const summary = summarizeContentItemMetricsByWindow(
            metricSnapshots,
            item.id
          );
          return {
            item,
            views24h: summary.window24h.views,
            views7d: summary.window7d.views,
            saves24h: summary.window24h.saves,
            saves7d: summary.window7d.saves,
            productClicks7d: summary.window7d.productClicks,
          };
        });

      return {
        note,
        linkedItems,
      };
    });

  const unansweredQuestions = notes
    .filter(
      (n) =>
        n.decision !== 'rejected' &&
        (Boolean(n.openQuestion && n.openQuestion.trim().length > 0) ||
          n.epistemicStatus === 'hypothesis')
    )
    .sort((a, b) => b.capturedDate.localeCompare(a.capturedDate));

  const expiredOrExpiringNotes = notes
    .map((note) => ({
      note,
      freshness: getResearchFreshnessStatus(note, referenceDateIso),
    }))
    .filter((entry) => entry.freshness.status !== 'fresh');

  const totalNotes = notes.length;
  const decidedCount = notes.filter(
    (n) => n.decision !== 'undecided' && n.decisionReason.trim().length > 0
  ).length;
  const testedAsContentCount = notes.filter(
    (n) => n.decision === 'test_as_content'
  ).length;
  const postponedCount = notes.filter((n) => n.decision === 'postponed').length;
  const rejectedCount = notes.filter((n) => n.decision === 'rejected').length;
  const undecidedCount = notes.filter(
    (n) => n.decision === 'undecided' || !n.decisionReason.trim()
  ).length;
  const provenWinnersCount = notes.filter(
    (n) => n.testOutcome === 'proven_winner'
  ).length;

  const uniqueSpawnedIds = new Set<string>();
  for (const n of notes) {
    for (const cid of n.linkedContentItemIds || []) {
      if (cid) uniqueSpawnedIds.add(cid);
    }
  }

  const expiredCount = expiredOrExpiringNotes.filter(
    (e) => e.freshness.status === 'expired'
  ).length;

  const decisionConversionRatePercent =
    totalNotes > 0 ? Math.round((decidedCount / totalNotes) * 100) : 0;

  const contentExecutionRatePercent =
    totalNotes > 0 ? Math.round((testedAsContentCount / totalNotes) * 100) : 0;

  return {
    windowStartIso,
    windowEndIso,
    newFindings,
    testedFindings,
    unansweredQuestions,
    expiredOrExpiringNotes,
    metrics: {
      totalNotes,
      decidedCount,
      decisionConversionRatePercent,
      testedAsContentCount,
      contentExecutionRatePercent,
      spawnedContentCount: uniqueSpawnedIds.size,
      provenWinnersCount,
      postponedCount,
      rejectedCount,
      undecidedCount,
      openQuestionsCount: unansweredQuestions.length,
      expiredCount,
    },
  };
}

/**
 * Spawns a connected ContentItem in Content Studio directly from a ContentResearchNote,
 * pre-populating the brief, references, pillar, series, and product link, and idempotently
 * linking the new ContentItem ID back into `note.linkedContentItemIds`.
 */
export function spawnContentItemFromResearch(
  note: ContentResearchNote,
  options: {
    projects: ContentProject[];
    defaultFormat?: ContentFormat;
    existingContentCount: number;
    todayIso: string;
    customId?: string;
  }
): {
  newItem: ContentItem;
  updatedNote: ContentResearchNote;
} {
  const matchingProject =
    options.projects.find((p) => p.pillar === note.pillar) ||
    options.projects[0];

  const format: ContentFormat =
    options.defaultFormat ||
    (note.pillar === 'personal' ? 'cerpen' : 'short_video');

  const newContentId = options.customId || `cnt-res-${Date.now()}`;

  const factCheckParts = [
    `[${note.researchType} | ${note.verificationMethod === 'self_verified' ? 'Self-Verified' : 'Desk Research'} | ${note.epistemicStatus === 'confirmed' ? 'Confirmed' : 'Hypothesis'}]`,
    note.coreFinding,
    note.rawEvidence.metricsSnapshot
      ? `Metrics: ${note.rawEvidence.metricsSnapshot}`
      : '',
    note.rawEvidence.commentQuotes
      ? `Quotes: ${note.rawEvidence.commentQuotes}`
      : '',
  ].filter(Boolean);

  const newItem: ContentItem = {
    id: newContentId,
    title: `[Test: ${note.researchType}] ${note.title}`,
    pillar: note.pillar,
    format,
    stage: 'Brief',
    projectId: matchingProject?.id || 'cproj-1',
    seriesId: note.seriesId,
    linkedProductId: note.linkedProductId,
    priority: note.confidenceLevel === 'High' ? 'High' : 'Medium',
    orderIndex: options.existingContentCount + 1,
    targetPublishDate: addDaysIso(options.todayIso, 4),
    voiceOverEnabled: format === 'short_video' || format === 'mini_vlog',
    voiceOverScriptOrNotes:
      format === 'cerpen' || format === 'carousel'
        ? 'Text / slide format — no voice-over required.'
        : 'Record natural voice-over on iPhone testing this research hypothesis.',
    brief: {
      hook: note.coreFinding,
      keyMessage:
        note.decisionReason ||
        `Testing ${note.researchType.toLowerCase()} insight from ${note.sourcePlatform} (${note.sourceAccount}).`,
      callToAction:
        note.pillar === '3d_marketing'
          ? 'Check the catalog link in bio or drop a question in the comments!'
          : 'Share your thoughts in the comments below.',
      targetAudience:
        matchingProject?.targetAudience ||
        'Jakarta makers, desk setup enthusiasts, and 9-to-5 creators',
      estimatedDurationSec:
        format === 'short_video' ? 40 : format === 'mini_vlog' ? 55 : 0,
    },
    references: [
      {
        id: `cref-from-${note.id}`,
        title: `Research Finding: ${note.title} (${note.sourcePlatform} — ${note.sourceAccount})`,
        url: note.sourceUrl || '',
        factCheckNote: factCheckParts.join(' — '),
        verified: note.verificationMethod === 'self_verified',
      },
    ],
    scriptText: `[Research Hypothesis to Test]\n${note.coreFinding}\n\n[Raw Evidence & Quotes]\n${note.rawEvidence.commentQuotes || '—'}\n\n[Draft Outline]\n1. Hook: Open with the core tension/question from research.\n2. Body: Demonstrate proof or narrative.\n3. Takeaway / CTA.`,
    carouselSlides:
      format === 'carousel'
        ? [
            {
              id: `sld-${newContentId}-1`,
              slideNumber: 1,
              headline: note.title,
              bodyCopy: note.coreFinding,
              visualPromptOrPhotoRef:
                note.rawEvidence.screenshotRef || 'Cover slide visual.',
            },
          ]
        : [],
    shots:
      format === 'cerpen'
        ? []
        : [
            {
              id: `shot-${newContentId}-1`,
              shotNumber: 1,
              visualAngle: `Opening hook shot testing: ${note.title}`,
              audioOrAction: note.coreFinding,
              durationSec: 6,
              location: 'Home Workshop Desk',
              iphoneSetting: 'iPhone 15 Pro 4K 60fps',
              completed: false,
            },
          ],
    localAssets: note.rawEvidence.screenshotRef
      ? [
          {
            id: `ast-${newContentId}-1`,
            fileName: note.rawEvidence.screenshotRef,
            devicePathOrAlbum: 'iPhone Album: Research References',
            assetType: 'Photo / Carousel',
            notes: `Captured on ${note.capturedDate} from ${note.sourcePlatform} (${note.sourceAccount}).`,
          },
        ]
      : [],
    qcChecklist: [
      {
        id: `cqc-${newContentId}-1`,
        text: `Verify content directly tests research finding #${note.id} (${note.researchType})`,
        completed: false,
      },
      {
        id: `cqc-${newContentId}-2`,
        text: 'Record 24h and 7d metric snapshots after publishing to validate hypothesis',
        completed: false,
      },
    ],
    nextAction: `Complete script & shot list in Content Studio to test research finding "${note.title}".`,
    updatedAt: options.todayIso,
  };

  const nextLinkedIds = Array.from(
    new Set([...(note.linkedContentItemIds || []), newContentId])
  );

  const updatedNote: ContentResearchNote = {
    ...note,
    decision: 'test_as_content',
    decisionReason:
      note.decisionReason.trim() ||
      `Approved for content production test (#${newContentId}) on ${options.todayIso}.`,
    linkedContentItemIds: nextLinkedIds,
    testOutcome: note.testOutcome || 'in_testing',
    updatedAt: options.todayIso,
  };

  return { newItem, updatedNote };
}
