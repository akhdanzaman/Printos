import React, { useMemo, useState } from 'react';
import {
  CONTENT_RESEARCH_PLATFORMS,
  CONTENT_RESEARCH_TYPES,
  ConfidenceLevel,
  ContentItem,
  ContentPillar,
  ContentProject,
  ContentResearchNote,
  ContentResearchPlatform,
  ContentResearchType,
  ContentSeries,
  EpistemicStatus,
  MetricSnapshot,
  Product,
  RESEARCH_LINK_CATEGORIES,
  ResearchDecision,
  ResearchLinkCategory,
  ResearchReferenceLink,
  ResearchTestOutcome,
  VerificationMethod,
} from '../types/printos';
import { addDaysIso, getJakartaDateIso } from '../utils/contentStudio';
import {
  buildWeeklyResearchDigest,
  computeExpirationDateIso,
  filterContentResearchNotes,
  FreshnessStatus,
  getNormalizedResearchLinks,
  getResearchFreshnessStatus,
  recordStrategyUsed,
  reverifyResearchNote,
} from '../utils/contentResearch';
import {
  AlertTriangle,
  BookOpen,
  BookmarkCheck,
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  ExternalLink,
  FileCheck2,
  Filter,
  HelpCircle,
  Link2,
  MessageSquareQuote,
  Plus,
  RefreshCw,
  Repeat,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';

interface ContentResearchBoardProps {
  notes: ContentResearchNote[];
  contentItems: ContentItem[];
  projects: ContentProject[];
  seriesList: ContentSeries[];
  products: Product[];
  metricSnapshots: MetricSnapshot[];
  globalSearch: string;
  onSaveResearchNote: (note: ContentResearchNote) => void;
  onDeleteResearchNote: (id: string) => void;
  onSpawnContentItem?: (newItem: ContentItem, updatedNote: ContentResearchNote) => void;
  onNavigateToContentStudio?: (contentItemId?: string) => void;
}

const DECISION_META: Record<
  ResearchDecision,
  { label: string; shortLabel: string; badgeClass: string; borderClass: string }
> = {
  test_as_content: {
    label: 'Active Strategy (Use & Repeat)',
    shortLabel: 'Active Strategy',
    badgeClass:
      'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800',
    borderClass: 'border-l-4 border-l-emerald-500',
  },
  postponed: {
    label: 'Saved for Future Recall',
    shortLabel: 'Saved for Future',
    badgeClass:
      'bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-800',
    borderClass: 'border-l-4 border-l-amber-500',
  },
  rejected: {
    label: 'Avoid / Do Not Repeat',
    shortLabel: 'Avoid Strategy',
    badgeClass:
      'bg-rose-100 text-rose-900 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-300 dark:border-rose-800',
    borderClass: 'border-l-4 border-l-rose-500',
  },
  undecided: {
    label: 'Unverified Theory',
    shortLabel: 'Unverified',
    badgeClass:
      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700',
    borderClass: 'border-l-4 border-l-slate-400',
  },
};

const OUTCOME_META: Record<
  ResearchTestOutcome,
  { label: string; badgeClass: string }
> = {
  proven_winner: {
    label: 'Proven Winner',
    badgeClass:
      'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950',
  },
  in_testing: {
    label: 'Used in Field',
    badgeClass:
      'bg-sky-100 text-sky-900 dark:bg-sky-950/70 dark:text-sky-300 border border-sky-300 dark:border-sky-800',
  },
  inconclusive: {
    label: 'Needs Iteration',
    badgeClass:
      'bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-800',
  },
  disproven: {
    label: 'Disproven',
    badgeClass:
      'bg-rose-100 text-rose-900 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-300 dark:border-rose-800',
  },
};

const LINK_CATEGORY_STYLE: Record<
  ResearchLinkCategory,
  { shortBadge: string; chipClass: string }
> = {
  'Content Example': {
    shortBadge: 'Example',
    chipClass:
      'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-900/60 text-amber-950 dark:text-amber-200 border border-amber-200 dark:border-amber-800/80',
  },
  'Theory / Framework': {
    shortBadge: 'Theory',
    chipClass:
      'bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-950 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800/80',
  },
  'Competitor Reference': {
    shortBadge: 'Competitor',
    chipClass:
      'bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-950 dark:text-rose-200 border border-rose-200 dark:border-rose-800/80',
  },
  'Platform / Case Study': {
    shortBadge: 'Study',
    chipClass:
      'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 text-emerald-950 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/80',
  },
  Other: {
    shortBadge: 'Ref',
    chipClass:
      'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700',
  },
};

export const ContentResearchBoard: React.FC<ContentResearchBoardProps> = ({
  notes,
  contentItems,
  seriesList,
  products,
  metricSnapshots,
  globalSearch,
  onSaveResearchNote,
  onDeleteResearchNote,
}) => {
  const jakartaToday = useMemo(() => getJakartaDateIso(), []);

  // Primary View Mode: 'findings' (Strategy Recall Cards) vs 'weekly_digest' (Weekly Recall Digest)
  const [activeView, setActiveView] = useState<'findings' | 'weekly_digest'>(
    'findings'
  );

  // Filters
  const [localSearch, setLocalSearch] = useState('');
  const [pillarFilter, setPillarFilter] = useState<'ALL' | ContentPillar>('ALL');
  const [seriesFilter, setSeriesFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | ContentResearchType>('ALL');
  const [decisionFilter, setDecisionFilter] = useState<'ALL' | ResearchDecision>(
    'ALL'
  );
  const [linkCategoryFilter, setLinkCategoryFilter] = useState<
    'ALL' | ResearchLinkCategory
  >('ALL');
  const [verificationFilter, setVerificationFilter] = useState<
    'ALL' | VerificationMethod
  >('ALL');
  const [epistemicFilter, setEpistemicFilter] = useState<'ALL' | EpistemicStatus>(
    'ALL'
  );
  const [freshnessFilter, setFreshnessFilter] = useState<
    'ALL' | FreshnessStatus | 'active_only'
  >('ALL');

  // Weekly Digest Window Controls
  const [digestAnchorDate, setDigestAnchorDate] = useState<string>('2026-10-25');
  const [digestWindowDays, setDigestWindowDays] = useState<number>(7);

  // Full Research Reader Modal (for inspecting a compact card's full details)
  const [viewingNoteId, setViewingNoteId] = useState<string | null>(null);
  const viewingNote = useMemo(
    () => notes.find((n) => n.id === viewingNoteId) || null,
    [notes, viewingNoteId]
  );

  // Create / Edit Modal
  const [editingNote, setEditingNote] = useState<ContentResearchNote | null>(
    null
  );
  // Draft link inputs inside Create / Edit Modal
  const [draftLinkCategory, setDraftLinkCategory] =
    useState<ResearchLinkCategory>('Content Example');
  const [draftLinkLabel, setDraftLinkLabel] = useState('');
  const [draftLinkUrl, setDraftLinkUrl] = useState('');

  const [feedbackBanner, setFeedbackBanner] = useState<string>('');

  const combinedSearch = [globalSearch.trim(), localSearch.trim()]
    .filter(Boolean)
    .join(' ');

  const filteredNotes = useMemo(
    () =>
      filterContentResearchNotes(
        notes,
        {
          searchQuery: combinedSearch,
          pillar: pillarFilter,
          seriesId: seriesFilter,
          researchType: typeFilter,
          decision: decisionFilter,
          verificationMethod: verificationFilter,
          epistemicStatus: epistemicFilter,
          freshness: freshnessFilter,
          linkCategory: linkCategoryFilter,
        },
        jakartaToday
      ),
    [
      notes,
      combinedSearch,
      pillarFilter,
      seriesFilter,
      typeFilter,
      decisionFilter,
      verificationFilter,
      epistemicFilter,
      freshnessFilter,
      linkCategoryFilter,
      jakartaToday,
    ]
  );

  const weeklyDigest = useMemo(
    () =>
      buildWeeklyResearchDigest(
        notes,
        contentItems,
        metricSnapshots,
        digestAnchorDate,
        digestWindowDays
      ),
    [notes, contentItems, metricSnapshots, digestAnchorDate, digestWindowDays]
  );

  // Aggregate strategy recall & link stats
  const vaultStats = useMemo(() => {
    let totalLinks = 0;
    let exampleLinks = 0;
    let theoryLinks = 0;
    let repeatCount = 0;
    let totalUses = 0;

    for (const n of notes) {
      const links = getNormalizedResearchLinks(n);
      totalLinks += links.length;
      for (const l of links) {
        if (l.category === 'Content Example') exampleLinks += 1;
        if (l.category === 'Theory / Framework') theoryLinks += 1;
      }
      if (n.willUseAgain ?? n.decision !== 'rejected') {
        repeatCount += 1;
      }
      totalUses += Number(n.timesUsed) || 0;
    }

    return {
      totalLinks,
      exampleLinks,
      theoryLinks,
      repeatCount,
      totalUses,
    };
  }, [notes]);

  const seriesMap = useMemo(
    () => new Map(seriesList.map((s) => [s.id, s])),
    [seriesList]
  );
  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  const handleOpenNewModal = (
    defaultDecision: ResearchDecision = 'test_as_content'
  ) => {
    const defaultValidity = 90;
    const fresh: ContentResearchNote = {
      id: `cres-${Date.now()}`,
      title: '',
      sourcePlatform: 'TikTok',
      sourceAccount: '',
      sourceUrl: '',
      links: [],
      capturedDate: jakartaToday,
      pillar: '3d_marketing',
      seriesId: seriesList[0]?.id || '',
      linkedProductId: products[0]?.id || '',
      researchType: 'Hook',
      coreFinding: '',
      rawEvidence: {
        commentQuotes: '',
        metricsSnapshot: '',
        screenshotRef: '',
      },
      verificationMethod: 'desk_research',
      epistemicStatus: 'hypothesis',
      confidenceLevel: 'Medium',
      openQuestion: '',
      decision: defaultDecision,
      decisionReason: '',
      linkedContentItemIds: [],
      testOutcome: defaultDecision === 'test_as_content' ? 'in_testing' : undefined,
      testResultSummary: '',
      timesUsed: defaultDecision === 'test_as_content' ? 1 : 0,
      lastUsedDate: defaultDecision === 'test_as_content' ? jakartaToday : undefined,
      willUseAgain: defaultDecision !== 'rejected',
      validityDays: defaultValidity,
      expiresAtDate: computeExpirationDateIso(jakartaToday, defaultValidity),
      updatedAt: jakartaToday,
    };
    setDraftLinkCategory('Content Example');
    setDraftLinkLabel('');
    setDraftLinkUrl('');
    setEditingNote(fresh);
  };

  const handleOpenEditModal = (note: ContentResearchNote) => {
    const normalizedLinks = getNormalizedResearchLinks(note);
    setDraftLinkCategory('Content Example');
    setDraftLinkLabel('');
    setDraftLinkUrl('');
    setEditingNote({
      ...note,
      links: normalizedLinks,
    });
  };

  const handleAddDraftLink = () => {
    if (!editingNote || !draftLinkUrl.trim()) return;
    const rawUrl = draftLinkUrl.trim();
    const safeUrl =
      rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
        ? rawUrl
        : `https://${rawUrl}`;
    const newLink: ResearchReferenceLink = {
      id: `rlink-${Date.now()}-${(editingNote.links || []).length + 1}`,
      category: draftLinkCategory,
      label:
        draftLinkLabel.trim() ||
        `${draftLinkCategory}: ${editingNote.sourceAccount || safeUrl}`,
      url: safeUrl,
    };
    const nextLinks = [...(editingNote.links || []), newLink];
    setEditingNote({
      ...editingNote,
      links: nextLinks,
      sourceUrl: editingNote.sourceUrl || safeUrl,
    });
    setDraftLinkLabel('');
    setDraftLinkUrl('');
  };

  const handleRemoveLinkFromEditing = (linkId: string) => {
    if (!editingNote) return;
    const nextLinks = (editingNote.links || []).filter((l) => l.id !== linkId);
    setEditingNote({
      ...editingNote,
      links: nextLinks,
      sourceUrl: nextLinks[0]?.url || '',
    });
  };

  const handleSaveModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNote || !editingNote.title.trim()) return;

    // If user typed a URL into the draft link row without clicking "+ Add Link", include it automatically
    let finalLinks = [...(editingNote.links || [])];
    if (draftLinkUrl.trim()) {
      const rawUrl = draftLinkUrl.trim();
      const safeUrl =
        rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
          ? rawUrl
          : `https://${rawUrl}`;
      finalLinks.push({
        id: `rlink-${Date.now()}-auto`,
        category: draftLinkCategory,
        label:
          draftLinkLabel.trim() ||
          `${draftLinkCategory}: ${editingNote.sourceAccount || safeUrl}`,
        url: safeUrl,
      });
    }

    const expiresAt = computeExpirationDateIso(
      editingNote.capturedDate || jakartaToday,
      editingNote.validityDays || 60
    );
    const cleaned: ContentResearchNote = {
      ...editingNote,
      title: editingNote.title.trim(),
      coreFinding: editingNote.coreFinding.trim(),
      decisionReason: editingNote.decisionReason.trim(),
      links: finalLinks,
      sourceUrl: finalLinks[0]?.url || editingNote.sourceUrl || '',
      expiresAtDate: expiresAt,
      updatedAt: jakartaToday,
    };
    onSaveResearchNote(cleaned);
    setEditingNote(null);
    setDraftLinkLabel('');
    setDraftLinkUrl('');
    setFeedbackBanner(
      `Saved strategy note "${cleaned.title}" (${DECISION_META[cleaned.decision].shortLabel}) with ${finalLinks.length} reference link(s).`
    );
  };

  const handleQuickDecisionChange = (
    note: ContentResearchNote,
    nextDecision: ResearchDecision
  ) => {
    const defaultReasonMap: Record<ResearchDecision, string> = {
      test_as_content:
        note.decisionReason ||
        `Active strategy to recall and reuse in future content (${jakartaToday}).`,
      postponed:
        note.decisionReason ||
        `Saved in strategy vault on ${jakartaToday} for future recall.`,
      rejected:
        note.decisionReason ||
        `Marked as Avoid / Do Not Repeat on ${jakartaToday}.`,
      undecided: note.decisionReason,
    };
    const updated: ContentResearchNote = {
      ...note,
      decision: nextDecision,
      decisionReason: defaultReasonMap[nextDecision],
      willUseAgain: nextDecision !== 'rejected',
      testOutcome:
        nextDecision === 'test_as_content'
          ? note.testOutcome || 'in_testing'
          : note.testOutcome,
      updatedAt: jakartaToday,
    };
    onSaveResearchNote(updated);
  };

  const handleQuickOutcomeChange = (
    note: ContentResearchNote,
    nextOutcome: ResearchTestOutcome
  ) => {
    const updated: ContentResearchNote = {
      ...note,
      testOutcome: nextOutcome,
      willUseAgain: nextOutcome !== 'disproven',
      epistemicStatus:
        nextOutcome === 'proven_winner' || nextOutcome === 'disproven'
          ? 'confirmed'
          : note.epistemicStatus,
      verificationMethod:
        nextOutcome === 'proven_winner' || nextOutcome === 'disproven'
          ? 'self_verified'
          : note.verificationMethod,
      updatedAt: jakartaToday,
    };
    onSaveResearchNote(updated);
  };

  const handleMarkStrategyUsedAgain = (note: ContentResearchNote) => {
    const updated = recordStrategyUsed(note, jakartaToday);
    onSaveResearchNote(updated);
    setFeedbackBanner(
      `Logged strategy recall for "${note.title}" — used ${updated.timesUsed}x total (last used ${jakartaToday}).`
    );
  };

  const handleToggleWillUseAgain = (note: ContentResearchNote) => {
    const nextWillUse = !(note.willUseAgain ?? note.decision !== 'rejected');
    const updated: ContentResearchNote = {
      ...note,
      willUseAgain: nextWillUse,
      updatedAt: jakartaToday,
    };
    onSaveResearchNote(updated);
  };

  const handleReverify = (note: ContentResearchNote, days = 60) => {
    const updated = reverifyResearchNote(note, jakartaToday, days);
    onSaveResearchNote(updated);
    setFeedbackBanner(
      `Re-verified "${note.title}" — strategy freshness extended until ${updated.expiresAtDate}.`
    );
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Top Header & Strategy Recall Philosophy Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 max-w-3xl">
            <div className="flex items-center gap-2 flex-wrap">
              <Compass className="w-4 h-4 text-amber-500 shrink-0" />
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                Content & Marketing Research — Strategy & Recall Vault
              </h2>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300">
                Brain Recall Memory · Stays in This Menu
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              A dedicated memory vault for your brain to recall what content strategies, hooks, and theories have been used and will be used again in the future. Cards stay compact with titles, tags, and direct <strong className="text-slate-700 dark:text-slate-200">Content Example</strong> &amp; <strong className="text-slate-700 dark:text-slate-200">Theory</strong> links—click any card to read the full research notes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/80 p-0.5">
              <button
                type="button"
                onClick={() => setActiveView('findings')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  activeView === 'findings'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Strategy Cards ({notes.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveView('weekly_digest')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  activeView === 'weekly_digest'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Calendar className="w-3.5 h-3.5 text-amber-500" />
                Weekly Recall Digest
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleOpenNewModal('test_as_content')}
              className="px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Log Strategy & Links
            </button>
          </div>
        </div>

        {/* Strategy Recall KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <div className="p-3 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900/50">
            <div className="text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
              Strategies to Use Again
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-lg font-extrabold tabular-nums text-emerald-900 dark:text-emerald-200">
                {vaultStats.repeatCount}/{notes.length}
              </span>
              <span className="text-[11px] font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                Used {vaultStats.totalUses}x total
              </span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-900/50">
            <div className="text-[11px] font-medium text-indigo-900 dark:text-indigo-300">
              Example & Theory Links
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-1">
              <span className="text-lg font-extrabold tabular-nums text-indigo-950 dark:text-indigo-200">
                {vaultStats.totalLinks} Links
              </span>
              <span className="text-[11px] font-mono tabular-nums text-indigo-700 dark:text-indigo-400 truncate">
                {vaultStats.exampleLinks} ex · {vaultStats.theoryLinks} theory
              </span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/50">
            <div className="text-[11px] font-medium text-amber-900 dark:text-amber-300">
              Proven Strategies vs Hold
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="text-lg font-extrabold tabular-nums text-amber-950 dark:text-amber-200 whitespace-nowrap">
                {weeklyDigest.metrics.provenWinnersCount} Proven
              </span>
              <span className="text-[11px] font-mono tabular-nums text-amber-800 dark:text-amber-400 truncate">
                {weeklyDigest.metrics.postponedCount} saved · {weeklyDigest.metrics.rejectedCount} avoid
              </span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-sky-50/60 dark:bg-sky-950/30 border border-sky-200/70 dark:border-sky-900/50">
            <div className="text-[11px] font-medium text-sky-900 dark:text-sky-300">
              Open Questions / Theories
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-lg font-extrabold tabular-nums text-sky-950 dark:text-sky-200">
                {weeklyDigest.metrics.openQuestionsCount}
              </span>
              <span className="text-[11px] text-sky-700 dark:text-sky-400">
                To verify next
              </span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200/70 dark:border-rose-900/50">
            <div className="text-[11px] font-medium text-rose-900 dark:text-rose-300">
              Expired / Stale Trends
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-lg font-extrabold tabular-nums text-rose-950 dark:text-rose-200">
                {weeklyDigest.metrics.expiredCount}
              </span>
              <span className="text-[11px] text-rose-700 dark:text-rose-400">
                {weeklyDigest.expiredOrExpiringNotes.length} flagged total
              </span>
            </div>
          </div>
        </div>
      </div>

      {feedbackBanner && (
        <div
          role="status"
          className="px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-between"
        >
          <span className="font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            {feedbackBanner}
          </span>
          <button
            type="button"
            onClick={() => setFeedbackBanner('')}
            className="text-slate-400 hover:text-slate-700"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* =================================================================== */}
      {/* VIEW 1: WEEKLY STRATEGY RECALL DIGEST                               */}
      {/* =================================================================== */}
      {activeView === 'weekly_digest' && (
        <div className="space-y-5">
          {/* Weekly Digest Toolbar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-500" />
                Weekly Strategy & Recall Digest ({weeklyDigest.windowStartIso} to{' '}
                {weeklyDigest.windowEndIso})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Review newly logged strategies, proven strategies to repeat in the future, and open theories that still need answers.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Digest window days"
                value={digestWindowDays}
                onChange={(e) => setDigestWindowDays(Number(e.target.value))}
                className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-medium"
              >
                <option value={7}>7-Day Window</option>
                <option value={14}>14-Day Window</option>
                <option value={30}>30-Day Window</option>
              </select>

              <button
                type="button"
                onClick={() =>
                  setDigestAnchorDate((prev) => addDaysIso(prev, -7))
                }
                className="px-2.5 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg"
              >
                ← Prev Week
              </button>
              <button
                type="button"
                onClick={() => setDigestAnchorDate('2026-10-25')}
                className="px-2.5 py-1.5 text-xs font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 rounded-lg"
              >
                Oct 19–25
              </button>
              <button
                type="button"
                onClick={() => setDigestAnchorDate(jakartaToday)}
                className="px-2.5 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg"
              >
                Today ({jakartaToday})
              </button>
              <button
                type="button"
                onClick={() =>
                  setDigestAnchorDate((prev) => addDaysIso(prev, 7))
                }
                className="px-2.5 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg"
              >
                Next Week →
              </button>
            </div>
          </div>

          {/* 3-Column Weekly Digest Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            {/* Column 1: New Strategies Logged This Window */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  1. New Strategies Logged ({weeklyDigest.newFindings.length})
                </h4>
                <span className="text-[11px] font-mono tabular-nums text-slate-400">
                  {weeklyDigest.windowStartIso}..{weeklyDigest.windowEndIso}
                </span>
              </div>

              {weeklyDigest.newFindings.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500 space-y-2">
                  <p>No strategies captured in this date range.</p>
                  <button
                    type="button"
                    onClick={() => handleOpenNewModal('test_as_content')}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-semibold"
                  >
                    + Log Strategy
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {weeklyDigest.newFindings.map((note) => {
                    const dec = DECISION_META[note.decision];
                    const links = getNormalizedResearchLinks(note);
                    return (
                      <div
                        key={note.id}
                        className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                            {note.researchType} · {note.sourcePlatform}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded ${dec.badgeClass}`}
                          >
                            {dec.shortLabel}
                          </span>
                        </div>
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {note.title}
                        </div>
                        {links.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {links.map((link) => {
                              const style = LINK_CATEGORY_STYLE[link.category];
                              return (
                                <a
                                  key={link.id}
                                  href={link.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded inline-flex items-center gap-1 max-w-full truncate ${style.chipClass}`}
                                >
                                  <span className="font-bold">{style.shortBadge}:</span>
                                  <span className="truncate max-w-[150px]">{link.label}</span>
                                  <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                                </a>
                              );
                            })}
                          </div>
                        )}
                        <div className="pt-1 flex items-center justify-between text-[10px] text-slate-500">
                          <span className="font-mono tabular-nums">
                            Captured: {note.capturedDate}
                          </span>
                          <button
                            type="button"
                            onClick={() => setViewingNoteId(note.id)}
                            className="font-semibold text-amber-700 dark:text-amber-400 hover:underline"
                          >
                            Read Strategy →
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Column 2: Used Strategies & Future Recall Status */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                  2. Used & Proven Strategies ({weeklyDigest.testedFindings.length})
                </h4>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                  {weeklyDigest.metrics.provenWinnersCount} Proven
                </span>
              </div>

              {weeklyDigest.testedFindings.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  No active strategies logged yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {weeklyDigest.testedFindings.map(({ note }) => {
                    const outcomeKey: ResearchTestOutcome =
                      note.testOutcome || 'in_testing';
                    const outcomeMeta = OUTCOME_META[outcomeKey];
                    const willRepeat =
                      note.willUseAgain ?? note.decision !== 'rejected';
                    return (
                      <div
                        key={note.id}
                        className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-semibold text-slate-500 font-mono">
                            {note.researchType} · Used {note.timesUsed ?? 1}x
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${outcomeMeta.badgeClass}`}
                          >
                            {outcomeMeta.label}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setViewingNoteId(note.id)}
                          className="text-left text-xs font-bold text-slate-900 dark:text-slate-100 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                        >
                          {note.title}
                        </button>

                        {note.testResultSummary && (
                          <p className="text-[11px] text-emerald-900 dark:text-emerald-200 bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-900/50 rounded p-2">
                            {note.testResultSummary}
                          </p>
                        )}

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded inline-flex items-center gap-1 ${
                              willRepeat
                                ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-300'
                                : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            <Repeat className="w-2.5 h-2.5" />
                            {willRepeat ? 'Will Use Again in Future' : 'Archived'}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleMarkStrategyUsedAgain(note)}
                            className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-300 text-[10px] font-bold transition-colors"
                          >
                            +1 Used Today
                          </button>
                        </div>

                        {/* Quick Verdict Toggles */}
                        <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                          <span className="text-[10px] text-slate-400 mr-1">
                            Verdict:
                          </span>
                          {(
                            [
                              'proven_winner',
                              'in_testing',
                              'inconclusive',
                              'disproven',
                            ] as ResearchTestOutcome[]
                          ).map((out) => (
                            <button
                              key={out}
                              type="button"
                              onClick={() => handleQuickOutcomeChange(note, out)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                outcomeKey === out
                                  ? 'bg-slate-900 text-white dark:bg-amber-400 dark:text-slate-950'
                                  : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-300'
                              }`}
                            >
                              {OUTCOME_META[out].label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Column 3: Open Questions & Theories to Verify */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-sky-500" />
                  3. Open Theories & Questions ({weeklyDigest.unansweredQuestions.length})
                </h4>
                <span className="text-[11px] text-sky-600 dark:text-sky-400 font-semibold">
                  Needs Verification
                </span>
              </div>

              {weeklyDigest.unansweredQuestions.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  All research theories have been verified.
                </div>
              ) : (
                <div className="space-y-3">
                  {weeklyDigest.unansweredQuestions.map((note) => (
                    <div
                      key={note.id}
                      className="p-3 rounded-lg bg-sky-50/50 dark:bg-sky-950/20 border border-sky-200/80 dark:border-sky-900/50 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/60 text-sky-900 dark:text-sky-200">
                          {note.epistemicStatus === 'hypothesis'
                            ? 'Theory / Hypothesis'
                            : 'Open Question'}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          Confidence: {note.confidenceLevel}
                        </span>
                      </div>

                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        {note.openQuestion || note.coreFinding}
                      </div>

                      <div className="text-[11px] text-slate-600 dark:text-slate-300">
                        Strategy card: <strong>{note.title}</strong>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleMarkStrategyUsedAgain(note)}
                          className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-600 text-slate-950 text-[11px] font-semibold flex items-center gap-1"
                        >
                          <Repeat className="w-3 h-3" />
                          Mark Strategy Used
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewingNoteId(note.id)}
                          className="text-[11px] font-semibold text-sky-700 dark:text-sky-300 hover:underline"
                        >
                          Read Full Research →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Expired / Expiring Trend Watchlist inside Digest */}
              {weeklyDigest.expiredOrExpiringNotes.length > 0 && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Trend Staleness Watchlist ({weeklyDigest.expiredOrExpiringNotes.length})
                  </div>
                  {weeklyDigest.expiredOrExpiringNotes.map(({ note, freshness }) => (
                    <div
                      key={note.id}
                      className="p-2.5 rounded-lg bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-[11px] space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setViewingNoteId(note.id)}
                          className="text-left font-bold text-slate-900 dark:text-slate-100 hover:underline truncate"
                        >
                          {note.title}
                        </button>
                        <span className="text-[10px] font-mono font-semibold text-rose-700 dark:text-rose-300 shrink-0">
                          {freshness.label}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-600 dark:text-slate-400">
                        <span>Captured: {note.capturedDate}</span>
                        <button
                          type="button"
                          onClick={() => handleReverify(note, 60)}
                          className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Re-verify (+60d)
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* VIEW 2: COMPACT STRATEGY CARDS (TITLE + TAGS + REFERENCE LINKS)     */}
      {/* =================================================================== */}
      {activeView === 'findings' && (
        <div className="space-y-4">
          {/* Filter & Search Bar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  placeholder="Search strategy titles, example links, theories, quotes, or recall notes..."
                  aria-label="Search content research findings"
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-amber-500"
                />
              </div>

              <select
                aria-label="Filter by Pillar"
                value={pillarFilter}
                onChange={(e) =>
                  setPillarFilter(e.target.value as 'ALL' | ContentPillar)
                }
                className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-medium"
              >
                <option value="ALL">All Pillars</option>
                <option value="3d_marketing">3D Print Marketing</option>
                <option value="personal">Personal / Story</option>
              </select>

              <select
                aria-label="Filter by Link Category"
                value={linkCategoryFilter}
                onChange={(e) =>
                  setLinkCategoryFilter(
                    e.target.value as 'ALL' | ResearchLinkCategory
                  )
                }
                className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-medium"
              >
                <option value="ALL">All Link Categories</option>
                {RESEARCH_LINK_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    Link: {cat}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by Research Type"
                value={typeFilter}
                onChange={(e) =>
                  setTypeFilter(e.target.value as 'ALL' | ContentResearchType)
                }
                className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-medium"
              >
                <option value="ALL">All Research Types</option>
                {CONTENT_RESEARCH_TYPES.map((t) => (
                  <option key={t} value={t}>
                    Type: {t}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by Strategy Recall Status"
                value={decisionFilter}
                onChange={(e) =>
                  setDecisionFilter(e.target.value as 'ALL' | ResearchDecision)
                }
                className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-medium"
              >
                <option value="ALL">All Recall Statuses</option>
                <option value="test_as_content">Active Strategy (Use & Repeat)</option>
                <option value="postponed">Saved for Future Recall</option>
                <option value="rejected">Avoid / Do Not Repeat</option>
                <option value="undecided">Unverified Theory</option>
              </select>

              <select
                aria-label="Filter by Series"
                value={seriesFilter}
                onChange={(e) => setSeriesFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-medium"
              >
                <option value="ALL">All Series</option>
                {seriesList.map((s) => (
                  <option key={s.id} value={s.id}>
                    Series: {s.name}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by Verification Method"
                value={verificationFilter}
                onChange={(e) =>
                  setVerificationFilter(
                    e.target.value as 'ALL' | VerificationMethod
                  )
                }
                className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-medium"
              >
                <option value="ALL">All Verification</option>
                <option value="self_verified">Self-Verified (Checked)</option>
                <option value="desk_research">Desk Research</option>
              </select>

              <select
                aria-label="Filter by Epistemic Status"
                value={epistemicFilter}
                onChange={(e) =>
                  setEpistemicFilter(e.target.value as 'ALL' | EpistemicStatus)
                }
                className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-medium"
              >
                <option value="ALL">All Confidence States</option>
                <option value="confirmed">Confirmed</option>
                <option value="hypothesis">Hypothesis / Theory</option>
              </select>

              <select
                aria-label="Filter by Trend Freshness"
                value={freshnessFilter}
                onChange={(e) =>
                  setFreshnessFilter(
                    e.target.value as 'ALL' | FreshnessStatus | 'active_only'
                  )
                }
                className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-medium"
              >
                <option value="ALL">All Trend Freshness</option>
                <option value="active_only">Active Only (Hide Expired)</option>
                <option value="fresh">Fresh (&gt;14d left)</option>
                <option value="expiring_soon">Expiring Soon (≤14d)</option>
                <option value="expired">Expired Trends Only</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800/80">
              <span>
                Showing <strong className="text-slate-700 dark:text-slate-200">{filteredNotes.length}</strong> compact strategy cards — click any link chip to open the <strong className="text-slate-700 dark:text-slate-200">Content Example</strong> or <strong className="text-slate-700 dark:text-slate-200">Theory</strong> directly, or click the card to read the full research note.
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                Compact Strategy Recall Grid
              </span>
            </div>
          </div>

          {/* Compact Strategy Cards Grid (Title + Tags + Clickable Reference Links) */}
          {filteredNotes.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-3">
              <Filter className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                No strategy cards match your current filters
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Clear active filters or log a new content strategy with reference links (content examples, theories, or case studies).
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLocalSearch('');
                    setPillarFilter('ALL');
                    setSeriesFilter('ALL');
                    setTypeFilter('ALL');
                    setDecisionFilter('ALL');
                    setLinkCategoryFilter('ALL');
                    setVerificationFilter('ALL');
                    setEpistemicFilter('ALL');
                    setFreshnessFilter('ALL');
                  }}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-100 dark:bg-slate-800 rounded-lg"
                >
                  Reset Filters
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenNewModal('test_as_content')}
                  className="px-3 py-1.5 text-xs font-semibold bg-amber-500 text-slate-950 rounded-lg"
                >
                  + Log Strategy & Links
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredNotes.map((note) => {
                const decMeta = DECISION_META[note.decision];
                const freshness = getResearchFreshnessStatus(note, jakartaToday);
                const links = getNormalizedResearchLinks(note);
                const willRepeat =
                  note.willUseAgain ?? note.decision !== 'rejected';
                const usedCount = Number(note.timesUsed) || 0;

                return (
                  <article
                    key={note.id}
                    onClick={() => setViewingNoteId(note.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setViewingNoteId(note.id);
                      }
                    }}
                    aria-label={`Read full strategy research: ${note.title}`}
                    className={`group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-400 dark:hover:border-amber-500/70 ${decMeta.borderClass} rounded-xl p-3.5 transition-all cursor-pointer flex flex-col justify-between gap-2.5 shadow-2xs hover:shadow-md`}
                  >
                    <div className="space-y-2">
                      {/* Title */}
                      <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors leading-snug line-clamp-2">
                        {note.title}
                      </h3>

                      {/* Compact Tags */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${decMeta.badgeClass}`}
                        >
                          {decMeta.shortLabel}
                        </span>

                        {note.testOutcome && (
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              OUTCOME_META[note.testOutcome].badgeClass
                            }`}
                          >
                            {OUTCOME_META[note.testOutcome].label}
                          </span>
                        )}

                        {willRepeat && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80 inline-flex items-center gap-0.5">
                            <Repeat className="w-2.5 h-2.5" />
                            {usedCount > 0 ? `Used ${usedCount}x · Repeat` : 'Use in Future'}
                          </span>
                        )}

                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                          {note.researchType}
                        </span>

                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-300 border border-amber-200/80 dark:border-amber-900">
                          {note.pillar === '3d_marketing'
                            ? '3D Marketing'
                            : 'Personal'}
                        </span>

                        {freshness.status === 'expired' && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300">
                            Expired
                          </span>
                        )}

                        {freshness.status === 'expiring_soon' && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
                            Expiring Soon
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Reference Links Strip (Content Examples, Theories, etc.) */}
                    {links.length > 0 && (
                      <div
                        className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {links.map((link) => {
                          const style =
                            LINK_CATEGORY_STYLE[link.category] ||
                            LINK_CATEGORY_STYLE.Other;
                          return (
                            <a
                              key={link.id}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title={`${link.category}: ${link.label} (${link.url})`}
                              className={`text-[10px] font-medium px-2 py-0.5 rounded-md inline-flex items-center gap-1 transition-colors max-w-full ${style.chipClass}`}
                            >
                              <Link2 className="w-2.5 h-2.5 shrink-0" />
                              <span className="font-bold shrink-0">
                                {style.shortBadge}:
                              </span>
                              <span className="truncate max-w-[165px]">
                                {link.label}
                              </span>
                              <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-75" />
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 1: FULL RESEARCH & STRATEGY READER (SELF-CONTAINED RECALL)    */}
      {/* =================================================================== */}
      {viewingNote &&
        (() => {
          const decMeta = DECISION_META[viewingNote.decision];
          const freshness = getResearchFreshnessStatus(
            viewingNote,
            jakartaToday
          );
          const links = getNormalizedResearchLinks(viewingNote);
          const series = viewingNote.seriesId
            ? seriesMap.get(viewingNote.seriesId)
            : undefined;
          const product = viewingNote.linkedProductId
            ? productMap.get(viewingNote.linkedProductId)
            : undefined;
          const willRepeat =
            viewingNote.willUseAgain ?? viewingNote.decision !== 'rejected';
          const usedCount = Number(viewingNote.timesUsed) || 0;

          return (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="full-research-reader-title"
              className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
              onClick={() => setViewingNoteId(null)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 ${decMeta.borderClass} rounded-2xl max-w-3xl w-full p-5 space-y-4 shadow-2xl my-4 max-h-[92vh] overflow-y-auto`}
              >
                {/* Reader Header: Tags, Title, Source & Quick Edit/Delete/Close */}
                <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div className="space-y-2 max-w-xl">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded ${decMeta.badgeClass}`}
                      >
                        {decMeta.label}
                      </span>

                      {viewingNote.testOutcome && (
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                            OUTCOME_META[viewingNote.testOutcome].badgeClass
                          }`}
                        >
                          {OUTCOME_META[viewingNote.testOutcome].label}
                        </span>
                      )}

                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                        Type: {viewingNote.researchType}
                      </span>

                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
                        {viewingNote.pillar === '3d_marketing'
                          ? '3D Print Marketing'
                          : 'Personal / Story'}
                      </span>

                      {series && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          Series: {series.name}
                        </span>
                      )}

                      {product && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-orange-50 dark:bg-orange-950/40 text-orange-800 dark:text-orange-300">
                          Product: {product.name}
                        </span>
                      )}
                    </div>

                    <h3
                      id="full-research-reader-title"
                      className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100"
                    >
                      {viewingNote.title}
                    </h3>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>
                        Primary Source:{' '}
                        <strong className="text-slate-700 dark:text-slate-200">
                          {viewingNote.sourcePlatform}
                        </strong>{' '}
                        ({viewingNote.sourceAccount})
                      </span>
                      <span className="font-mono tabular-nums">
                        Captured: {viewingNote.capturedDate}
                      </span>
                      <span className="font-mono tabular-nums">
                        Used: <strong>{usedCount}x</strong>
                        {viewingNote.lastUsedDate
                          ? ` (Last: ${viewingNote.lastUsedDate})`
                          : ''}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <div
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono tabular-nums font-semibold flex items-center gap-1.5 ${
                        freshness.status === 'expired'
                          ? 'bg-rose-100 text-rose-900 dark:bg-rose-950/80 dark:text-rose-200 border border-rose-300 dark:border-rose-800'
                          : freshness.status === 'expiring_soon'
                          ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-200 border border-amber-300 dark:border-amber-800'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span>{freshness.label}</span>
                      {freshness.status !== 'fresh' && (
                        <button
                          type="button"
                          onClick={() => handleReverify(viewingNote, 60)}
                          className="ml-1 px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 hover:underline text-[10px] font-sans font-bold"
                        >
                          Re-verify +60d
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(viewingNote)}
                      className="px-2.5 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg"
                    >
                      Edit Strategy & Links
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteResearchNote(viewingNote.id);
                        setViewingNoteId(null);
                      }}
                      aria-label={`Delete ${viewingNote.title}`}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewingNoteId(null)}
                      aria-label="Close research reader"
                      className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Stale Trend Warning Banner */}
                {freshness.status === 'expired' && (
                  <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-900 dark:text-rose-200 flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-medium">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <strong>Stale Trend Warning:</strong> This strategy note expired on{' '}
                      <code className="font-mono">{freshness.expiresAtDate}</code>. Platform algorithms or market prices may have shifted—re-verify before reusing.
                    </span>
                    <button
                      type="button"
                      onClick={() => handleReverify(viewingNote, 60)}
                      className="px-2.5 py-1 rounded bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-700 text-[11px] font-semibold text-rose-800 dark:text-rose-200"
                    >
                      Confirm Still Valid (+60 Days)
                    </button>
                  </div>
                )}

                {/* Categorized Reference Links Block (Content Examples, Theories, Case Studies) */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-amber-500" />
                      Reference Links — Content Examples, Theories &amp; Case Studies ({links.length})
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(viewingNote)}
                      className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:underline"
                    >
                      + Add / Edit Links
                    </button>
                  </div>

                  {links.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No reference links attached yet. Click "+ Add / Edit Links" to attach content examples or theories.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {links.map((link) => {
                        const style =
                          LINK_CATEGORY_STYLE[link.category] ||
                          LINK_CATEGORY_STYLE.Other;
                        return (
                          <a
                            key={link.id}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`p-2.5 rounded-lg flex items-start justify-between gap-2 transition-colors ${style.chipClass}`}
                          >
                            <div className="min-w-0 space-y-0.5">
                              <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                                {link.category}
                              </div>
                              <div className="text-xs font-semibold truncate">
                                {link.label}
                              </div>
                              <div className="text-[10px] font-mono opacity-70 truncate">
                                {link.url}
                              </div>
                            </div>
                            <ExternalLink className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Core Finding & Raw Evidence */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <div className="lg:col-span-7 space-y-3">
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Core Strategy / Takeaway (1–2 Sentences)
                      </div>
                      <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
                        {viewingNote.coreFinding}
                      </p>
                    </div>

                    {/* Verification & Epistemic Confidence Strip */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`px-2.5 py-1 rounded-md font-semibold inline-flex items-center gap-1 ${
                          viewingNote.verificationMethod === 'self_verified'
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        {viewingNote.verificationMethod === 'self_verified'
                          ? 'Self-Verified (Tested in Field)'
                          : 'Desk Research'}
                      </span>

                      <span
                        className={`px-2.5 py-1 rounded-md font-semibold ${
                          viewingNote.epistemicStatus === 'confirmed'
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                        }`}
                      >
                        Status:{' '}
                        {viewingNote.epistemicStatus === 'confirmed'
                          ? 'Confirmed Strategy'
                          : 'Hypothesis / Theory'}
                      </span>

                      <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                        Confidence: <strong>{viewingNote.confidenceLevel}</strong>
                      </span>
                    </div>

                    {viewingNote.openQuestion && (
                      <div className="p-3 rounded-lg bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/60 text-xs text-sky-950 dark:text-sky-200 flex items-start gap-2">
                        <HelpCircle className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">Open Question to Verify: </span>
                          {viewingNote.openQuestion}
                        </div>
                      </div>
                    )}

                    {viewingNote.testResultSummary && (
                      <div className="p-3 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 text-xs text-emerald-950 dark:text-emerald-200">
                        <span className="font-bold">Past Usage &amp; Result Notes: </span>
                        {viewingNote.testResultSummary}
                      </div>
                    )}
                  </div>

                  {/* Raw Evidence Box */}
                  <div className="lg:col-span-5 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-2.5 text-xs">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <MessageSquareQuote className="w-3.5 h-3.5 text-amber-500" />
                      Raw Evidence (Quotes, Numbers &amp; Screenshot Ref)
                    </div>

                    {viewingNote.rawEvidence.commentQuotes && (
                      <div>
                        <span className="text-[11px] font-semibold text-slate-500 block">
                          Comment / Buyer Quotes:
                        </span>
                        <p className="italic text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 p-2 rounded border border-slate-200/70 dark:border-slate-700 mt-0.5">
                          {viewingNote.rawEvidence.commentQuotes}
                        </p>
                      </div>
                    )}

                    {viewingNote.rawEvidence.metricsSnapshot && (
                      <div>
                        <span className="text-[11px] font-semibold text-slate-500 block">
                          Views / Likes / Market Numbers:
                        </span>
                        <p className="font-mono tabular-nums text-[11px] text-slate-800 dark:text-slate-200 mt-0.5">
                          {viewingNote.rawEvidence.metricsSnapshot}
                        </p>
                      </div>
                    )}

                    {viewingNote.rawEvidence.screenshotRef && (
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 pt-1">
                        <FileCheck2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-mono truncate">
                          Ref: {viewingNote.rawEvidence.screenshotRef}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Block: Strategy Recall Status, Rationale & Memory Controls (Stays in Menu) */}
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1.5 max-w-xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        Strategy Recall Status:
                      </span>
                      {(
                        [
                          'test_as_content',
                          'postponed',
                          'rejected',
                        ] as ResearchDecision[]
                      ).map((dKey) => (
                        <button
                          key={dKey}
                          type="button"
                          onClick={() =>
                            handleQuickDecisionChange(viewingNote, dKey)
                          }
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                            viewingNote.decision === dKey
                              ? DECISION_META[dKey].badgeClass
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          {DECISION_META[dKey].shortLabel}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {viewingNote.decisionReason || (
                        <span className="text-rose-600 font-semibold">
                          No strategy recall rationale recorded yet — add a note on when and why to use this strategy.
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Self-Contained Strategy Recall Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleWillUseAgain(viewingNote)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                        willRepeat
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                          : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <BookmarkCheck className="w-3.5 h-3.5" />
                      {willRepeat
                        ? 'Will Use Again in Future'
                        : 'Do Not Repeat'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleMarkStrategyUsedAgain(viewingNote)}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Repeat className="w-3.5 h-3.5" />
                      Mark Strategy Used (+1 · {usedCount}x)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {/* =================================================================== */}
      {/* MODAL 2: CREATE / EDIT STRATEGY & REFERENCE LINKS                   */}
      {/* =================================================================== */}
      {editingNote && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="research-note-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <form
            onSubmit={handleSaveModalSubmit}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full p-5 sm:p-6 space-y-4 shadow-xl my-8 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3
                id="research-note-modal-title"
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                Log / Edit Strategy &amp; Reference Links
              </h3>
              <button
                type="button"
                onClick={() => setEditingNote(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Section 1: Headline & Classification */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
              <div className="sm:col-span-8">
                <label className="block font-semibold mb-1">
                  Strategy / Finding Title *
                </label>
                <input
                  type="text"
                  required
                  value={editingNote.title}
                  onChange={(e) =>
                    setEditingNote({ ...editingNote, title: e.target.value })
                  }
                  placeholder="e.g., 48-Hour Water Submersion Hook Outperforms Aesthetic B-Roll"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="block font-semibold mb-1">
                  Research Type *
                </label>
                <select
                  value={editingNote.researchType}
                  onChange={(e) =>
                    setEditingNote({
                      ...editingNote,
                      researchType: e.target.value as ContentResearchType,
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  {CONTENT_RESEARCH_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-4">
                <label className="block font-semibold mb-1">Content Pillar</label>
                <select
                  value={editingNote.pillar}
                  onChange={(e) =>
                    setEditingNote({
                      ...editingNote,
                      pillar: e.target.value as ContentPillar,
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  <option value="3d_marketing">3D Print Marketing</option>
                  <option value="personal">Personal / Story / Education</option>
                </select>
              </div>

              <div className="sm:col-span-4">
                <label className="block font-semibold mb-1">
                  Series (Optional)
                </label>
                <select
                  value={editingNote.seriesId || ''}
                  onChange={(e) =>
                    setEditingNote({
                      ...editingNote,
                      seriesId: e.target.value || undefined,
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  <option value="">— No Series —</option>
                  {seriesList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-4">
                <label className="block font-semibold mb-1">
                  Linked 3D Product (Optional)
                </label>
                <select
                  value={editingNote.linkedProductId || ''}
                  onChange={(e) =>
                    setEditingNote({
                      ...editingNote,
                      linkedProductId: e.target.value || undefined,
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  <option value="">— Independent / No Product —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Section 2: Reference Links (Content Examples, Theories, Case Studies) */}
            <div className="space-y-3 text-xs pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-amber-500" />
                  Reference Links (Content Examples, Theories, Competitor Refs)
                </label>
                <span className="text-[11px] text-slate-500">
                  Shown directly on the compact card
                </span>
              </div>

              {/* Existing Links List */}
              {(editingNote.links || []).length > 0 && (
                <div className="space-y-1.5">
                  {(editingNote.links || []).map((link) => {
                    const style =
                      LINK_CATEGORY_STYLE[link.category] ||
                      LINK_CATEGORY_STYLE.Other;
                    return (
                      <div
                        key={link.id}
                        className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${style.chipClass}`}
                          >
                            {link.category}
                          </span>
                          <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                            {link.label}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 truncate">
                            {link.url}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveLinkFromEditing(link.id)}
                          aria-label={`Remove link ${link.label}`}
                          className="text-slate-400 hover:text-rose-600 px-1.5 py-0.5 text-xs font-bold shrink-0"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add New Reference Link Row */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                <div className="sm:col-span-3">
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                    Link Role / Category
                  </label>
                  <select
                    aria-label="New link category"
                    value={draftLinkCategory}
                    onChange={(e) =>
                      setDraftLinkCategory(
                        e.target.value as ResearchLinkCategory
                      )
                    }
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                  >
                    {RESEARCH_LINK_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-4">
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                    Link Label (e.g., Content Example / Theory Name)
                  </label>
                  <input
                    type="text"
                    value={draftLinkLabel}
                    onChange={(e) => setDraftLinkLabel(e.target.value)}
                    placeholder="e.g., TikTok 48h Leak Test Example"
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                    URL
                  </label>
                  <input
                    type="text"
                    value={draftLinkUrl}
                    onChange={(e) => setDraftLinkUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                  />
                </div>

                <div className="sm:col-span-2 flex items-end">
                  <button
                    type="button"
                    onClick={handleAddDraftLink}
                    className="w-full py-1.5 px-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold rounded-lg text-xs"
                  >
                    + Add Link
                  </button>
                </div>
              </div>
            </div>

            {/* Section 3: Source Context & Trend Validity */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="sm:col-span-3">
                <label className="block font-semibold mb-1">Source Platform</label>
                <select
                  value={editingNote.sourcePlatform}
                  onChange={(e) =>
                    setEditingNote({
                      ...editingNote,
                      sourcePlatform: e.target.value as ContentResearchPlatform,
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  {CONTENT_RESEARCH_PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-4">
                <label className="block font-semibold mb-1">
                  Account / Creator / Reference *
                </label>
                <input
                  type="text"
                  required
                  value={editingNote.sourceAccount}
                  onChange={(e) =>
                    setEditingNote({
                      ...editingNote,
                      sourceAccount: e.target.value,
                    })
                  }
                  placeholder="e.g., @plantcraft.studio or Pricing Theory"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block font-semibold mb-1">Date Captured</label>
                <input
                  type="date"
                  value={editingNote.capturedDate}
                  onChange={(e) =>
                    setEditingNote({
                      ...editingNote,
                      capturedDate: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-semibold mb-1">
                  Trend Validity
                </label>
                <select
                  value={editingNote.validityDays}
                  onChange={(e) =>
                    setEditingNote({
                      ...editingNote,
                      validityDays: Number(e.target.value),
                    })
                  }
                  className="w-full px-2.5 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  <option value={14}>14 Days (Fast Trend)</option>
                  <option value={30}>30 Days</option>
                  <option value={60}>60 Days</option>
                  <option value={90}>90 Days</option>
                  <option value={180}>180 Days (Evergreen)</option>
                </select>
              </div>
            </div>

            {/* Section 4: Core Strategy Takeaway & Raw Evidence */}
            <div className="space-y-3 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>
                <label className="block font-semibold mb-1">
                  Core Strategy / Finding (1–2 Concise Sentences) *
                </label>
                <textarea
                  rows={2}
                  required
                  value={editingNote.coreFinding}
                  onChange={(e) =>
                    setEditingNote({
                      ...editingNote,
                      coreFinding: e.target.value,
                    })
                  }
                  placeholder="Summarize the strategy or theory so your future self can recall it immediately..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold mb-1">
                    Raw Evidence: Comment / Buyer Quotes
                  </label>
                  <textarea
                    rows={2}
                    value={editingNote.rawEvidence.commentQuotes}
                    onChange={(e) =>
                      setEditingNote({
                        ...editingNote,
                        rawEvidence: {
                          ...editingNote.rawEvidence,
                          commentQuotes: e.target.value,
                        },
                      })
                    }
                    placeholder='"Kirain cetakan 3D pasti rembes..."'
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1">
                    Raw Evidence: Views / Likes / Market Metrics
                  </label>
                  <textarea
                    rows={2}
                    value={editingNote.rawEvidence.metricsSnapshot}
                    onChange={(e) =>
                      setEditingNote({
                        ...editingNote,
                        rawEvidence: {
                          ...editingNote.rawEvidence,
                          metricsSnapshot: e.target.value,
                        },
                      })
                    }
                    placeholder="318K views, 24.1K likes, 6,420 saves..."
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1">
                    Raw Evidence: Local Screenshot Ref
                  </label>
                  <textarea
                    rows={2}
                    value={editingNote.rawEvidence.screenshotRef}
                    onChange={(e) =>
                      setEditingNote({
                        ...editingNote,
                        rawEvidence: {
                          ...editingNote.rawEvidence,
                          screenshotRef: e.target.value,
                        },
                      })
                    }
                    placeholder="IMG_8390_TikTok_Comments.PNG (iPhone Album)"
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>
            </div>

            {/* Section 5: Verification, Epistemic Status & Open Question */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="sm:col-span-4">
                <label className="block font-semibold mb-1">
                  Verification Method
                </label>
                <select
                  value={editingNote.verificationMethod}
                  onChange={(e) =>
                    setEditingNote({
                      ...editingNote,
                      verificationMethod: e.target.value as VerificationMethod,
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  <option value="desk_research">Desk Research (Observed)</option>
                  <option value="self_verified">
                    Self-Verified (Tested Hands-On)
                  </option>
                </select>
              </div>

              <div className="sm:col-span-4">
                <label className="block font-semibold mb-1">
                  Epistemic Status
                </label>
                <select
                  value={editingNote.epistemicStatus}
                  onChange={(e) =>
                    setEditingNote({
                      ...editingNote,
                      epistemicStatus: e.target.value as EpistemicStatus,
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  <option value="hypothesis">Theory / Still an Assumption</option>
                  <option value="confirmed">Confirmed Strategy / Fact</option>
                </select>
              </div>

              <div className="sm:col-span-4">
                <label className="block font-semibold mb-1">
                  Confidence Level
                </label>
                <select
                  value={editingNote.confidenceLevel}
                  onChange={(e) =>
                    setEditingNote({
                      ...editingNote,
                      confidenceLevel: e.target.value as ConfidenceLevel,
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  <option value="High">High Confidence</option>
                  <option value="Medium">Medium Confidence</option>
                  <option value="Low">Low Confidence</option>
                </select>
              </div>

              <div className="sm:col-span-12">
                <label className="block font-semibold mb-1">
                  Unanswered Question / Theory to Test Next (Optional)
                </label>
                <input
                  type="text"
                  value={editingNote.openQuestion || ''}
                  onChange={(e) =>
                    setEditingNote({
                      ...editingNote,
                      openQuestion: e.target.value,
                    })
                  }
                  placeholder="What question still needs to be verified in future experiments?"
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>
            </div>

            {/* Section 6: Strategy Recall Status, Usage Memory & Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="sm:col-span-4">
                <label className="block font-semibold mb-1">
                  Strategy Recall Status *
                </label>
                <select
                  value={editingNote.decision}
                  onChange={(e) =>
                    setEditingNote({
                      ...editingNote,
                      decision: e.target.value as ResearchDecision,
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-bold"
                >
                  <option value="test_as_content">
                    Active Strategy (Use &amp; Repeat)
                  </option>
                  <option value="postponed">Saved for Future Recall</option>
                  <option value="rejected">Avoid / Do Not Repeat</option>
                  <option value="undecided">Unverified Theory</option>
                </select>
              </div>

              <div className="sm:col-span-4">
                <label className="block font-semibold mb-1">
                  Strategy Verdict
                </label>
                <select
                  value={editingNote.testOutcome || ''}
                  onChange={(e) =>
                    setEditingNote({
                      ...editingNote,
                      testOutcome: (e.target.value || undefined) as
                        | ResearchTestOutcome
                        | undefined,
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  <option value="">— Not Rated Yet —</option>
                  <option value="proven_winner">Proven Winner</option>
                  <option value="in_testing">Used in Field</option>
                  <option value="inconclusive">Needs Iteration</option>
                  <option value="disproven">Disproven</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block font-semibold mb-1">Times Used</label>
                <input
                  type="number"
                  min={0}
                  value={editingNote.timesUsed ?? 0}
                  onChange={(e) =>
                    setEditingNote({
                      ...editingNote,
                      timesUsed: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="sm:col-span-2 flex items-end pb-1">
                <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={
                      editingNote.willUseAgain ??
                      editingNote.decision !== 'rejected'
                    }
                    onChange={(e) =>
                      setEditingNote({
                        ...editingNote,
                        willUseAgain: e.target.checked,
                      })
                    }
                    className="rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                  />
                  <span>Use Again</span>
                </label>
              </div>

              <div className="sm:col-span-12">
                <label className="block font-semibold mb-1">
                  When &amp; Why to Recall This Strategy *
                </label>
                <input
                  type="text"
                  required
                  value={editingNote.decisionReason}
                  onChange={(e) =>
                    setEditingNote({
                      ...editingNote,
                      decisionReason: e.target.value,
                    })
                  }
                  placeholder="State clearly when your brain should reuse (or avoid) this strategy in the future..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="sm:col-span-12">
                <label className="block font-semibold mb-1">
                  Past Usage &amp; Result Notes (Optional)
                </label>
                <input
                  type="text"
                  value={editingNote.testResultSummary || ''}
                  onChange={(e) =>
                    setEditingNote({
                      ...editingNote,
                      testResultSummary: e.target.value,
                    })
                  }
                  placeholder="e.g., Used on Voronoi Planter water test — reached 12,450 views & 510 saves in 7 days."
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditingNote(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg"
              >
                Save Strategy &amp; Links
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
