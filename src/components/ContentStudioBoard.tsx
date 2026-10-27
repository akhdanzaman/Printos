import React, { useMemo, useState } from 'react';
import {
  CHANNEL_PLATFORMS,
  ChannelPlatform,
  CONTENT_FORMATS,
  CONTENT_STAGES,
  ContentFormat,
  ContentItem,
  ContentPillar,
  ContentProject,
  ContentPublication,
  ContentSeries,
  ContentSponsorship,
  ContentStage,
  CreatorCapacityConfig,
  MetricSnapshot,
  MetricWindow,
  Product,
  ProductionSession,
  PUBLICATION_STATUSES,
  PublicationStatus,
  SessionActivityType,
  SponsorshipStatus,
  WeeklyContentReview,
} from '../types/printos';
import { formatDuration, formatRupiah, getChecklistProgress } from '../utils/calculations';
import {
  addDaysIso,
  analyzeCreatorWorkload,
  buildCalendarDaysForMonth,
  calculateSponsorshipSummary,
  exportContentBriefMarkdown,
  formatMetricValue,
  getIndonesianDayName,
  getJakartaDateIso,
  getJakartaTimeWib,
  getWeekRangeForDateIso,
  repurposeContentItem,
  shiftYearMonth,
  summarizeContentItemMetricsByWindow,
  summarizePublicationMetrics,
} from '../utils/contentStudio';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clapperboard,
  Clock,
  Copy,
  DollarSign,
  Download,
  ExternalLink,
  FileText,
  FolderKanban,
  List,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings,
  Smartphone,
  Sparkles,
  Trash2,
  Video,
  X,
} from 'lucide-react';

interface ContentStudioBoardProps {
  products: Product[];
  capacity: CreatorCapacityConfig;
  projects: ContentProject[];
  seriesList: ContentSeries[];
  contentItems: ContentItem[];
  publications: ContentPublication[];
  metricSnapshots: MetricSnapshot[];
  productionSessions: ProductionSession[];
  sponsorships: ContentSponsorship[];
  weeklyReviews: WeeklyContentReview[];
  globalSearch: string;
  openQuickCaptureTrigger?: boolean;
  onClearQuickCaptureTrigger?: () => void;
  onSaveContentItem: (item: ContentItem) => void;
  onDeleteContentItem: (id: string) => void;
  onMoveContentStage: (id: string, stage: ContentStage) => void;
  onReorderContentItem: (id: string, direction: 'up' | 'down') => void;
  onSaveProject: (project: ContentProject) => void;
  onSaveSeries: (series: ContentSeries) => void;
  onSavePublication: (pub: ContentPublication) => void;
  onDeletePublication: (id: string) => void;
  onSaveMetricSnapshot: (snapshot: MetricSnapshot) => void;
  onSaveProductionSession: (session: ProductionSession) => void;
  onDeleteProductionSession: (id: string) => void;
  onSyncSessionsToTasks: () => { createdCount: number; updatedCount: number };
  onSaveSponsorship: (deal: ContentSponsorship) => void;
  onDeleteSponsorship: (id: string) => void;
  onSyncSponsorshipsToLedger: () => { addedCount: number; updatedCount: number };
  onSaveWeeklyReview: (review: WeeklyContentReview) => void;
  onSaveCapacityConfig: (config: CreatorCapacityConfig) => void;
}

export const ContentStudioBoard: React.FC<ContentStudioBoardProps> = ({
  products,
  capacity,
  projects,
  seriesList,
  contentItems,
  publications,
  metricSnapshots,
  productionSessions,
  sponsorships,
  weeklyReviews,
  globalSearch,
  openQuickCaptureTrigger,
  onClearQuickCaptureTrigger,
  onSaveContentItem,
  onDeleteContentItem,
  onMoveContentStage,
  onReorderContentItem,
  onSaveProject,
  onSaveSeries,
  onSavePublication,
  onDeletePublication,
  onSaveMetricSnapshot,
  onSaveProductionSession,
  onDeleteProductionSession,
  onSyncSessionsToTasks,
  onSaveSponsorship,
  onDeleteSponsorship,
  onSyncSponsorshipsToLedger,
  onSaveWeeklyReview,
  onSaveCapacityConfig,
}) => {
  const jakartaToday = useMemo(() => getJakartaDateIso(), []);

  const [activeTab, setActiveTab] = useState<
    'pipeline' | 'publications' | 'schedule' | 'capture' | 'finance'
  >('pipeline');
  const [pipelineLayout, setPipelineLayout] = useState<'board' | 'table'>('board');
  const [showAllStages, setShowAllStages] = useState<boolean>(false);

  // Filters
  const [localSearch, setLocalSearch] = useState('');
  const [pillarFilter, setPillarFilter] = useState<'ALL' | ContentPillar>('ALL');
  const [formatFilter, setFormatFilter] = useState<'ALL' | ContentFormat>('ALL');
  const [projectFilter, setProjectFilter] = useState<string>('ALL');

  // Connected Content Workbench Modal State
  const [editingItem, setEditingItem] = useState<ContentItem | null>(null);
  const [workbenchSection, setWorkbenchSection] = useState<
    'brief' | 'script' | 'shots' | 'assets' | 'qc' | 'channels'
  >('brief');

  // Markdown / Print Export Preview Modal
  const [markdownPreviewItem, setMarkdownPreviewItem] = useState<ContentItem | null>(null);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);

  // Publication & Manual Publish Confirmation Modal
  const [editingPub, setEditingPub] = useState<ContentPublication | null>(null);
  const [confirmingPub, setConfirmingPub] = useState<{
    pub: ContentPublication;
    actualDateTimeWib: string;
    actualUrl: string;
  } | null>(null);

  // Manual Metric Snapshot Modal
  const [editingMetricModal, setEditingMetricModal] = useState<{
    pub: ContentPublication;
    window: MetricWindow;
    views: string;
    likes: string;
    comments: string;
    shares: string;
    saves: string;
    watchTimeSeconds: string;
    completionRatePercent: string;
    profileVisits: string;
    productClicks: string;
    qualitativeNotes: string;
  } | null>(null);

  // Production Session Modal & Navigable Calendar State
  const [calendarViewMode, setCalendarViewMode] = useState<'week' | 'month' | 'agenda'>('week');
  const [calendarAnchorDate, setCalendarAnchorDate] = useState<string>('2026-10-23');
  const [calendarYearMonth, setCalendarYearMonth] = useState<string>('2026-10');
  const [editingSession, setEditingSession] = useState<ProductionSession | null>(null);
  const [syncBanner, setSyncBanner] = useState<string>('');

  // Quick Capture Form State
  const [quickTitle, setQuickTitle] = useState('');
  const [quickHook, setQuickHook] = useState('');
  const [quickPillar, setQuickPillar] = useState<ContentPillar>('3d_marketing');
  const [quickFormat, setQuickFormat] = useState<ContentFormat>('short_video');
  const [quickProductId, setQuickProductId] = useState<string>('');
  const [quickVoiceOver, setQuickVoiceOver] = useState<boolean>(true);
  const [quickNotes, setQuickNotes] = useState('');

  // Sponsorship & Review Modals
  const [editingDeal, setEditingDeal] = useState<ContentSponsorship | null>(null);
  const [editingReview, setEditingReview] = useState<WeeklyContentReview | null>(null);
  const [editingProjectModal, setEditingProjectModal] = useState<ContentProject | null>(null);
  const [editingSeriesModal, setEditingSeriesModal] = useState<ContentSeries | null>(null);

  React.useEffect(() => {
    if (openQuickCaptureTrigger) {
      setActiveTab('capture');
      if (onClearQuickCaptureTrigger) onClearQuickCaptureTrigger();
    }
  }, [openQuickCaptureTrigger, onClearQuickCaptureTrigger]);

  const effectiveSearch = (localSearch || globalSearch).trim().toLowerCase();

  const filteredItems = useMemo(() => {
    return [...contentItems]
      .filter((item) => {
        if (pillarFilter !== 'ALL' && item.pillar !== pillarFilter) return false;
        if (formatFilter !== 'ALL' && item.format !== formatFilter) return false;
        if (projectFilter !== 'ALL' && item.projectId !== projectFilter) return false;
        if (effectiveSearch) {
          const prod = products.find((p) => p.id === item.linkedProductId);
          const hay = [
            item.title,
            item.brief.hook,
            item.brief.keyMessage,
            item.scriptText,
            item.nextAction,
            prod?.name || '',
          ]
            .join(' ')
            .toLowerCase();
          return hay.includes(effectiveSearch);
        }
        return true;
      })
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }, [contentItems, pillarFilter, formatFilter, projectFilter, effectiveSearch, products]);

  const workload = useMemo(
    () =>
      analyzeCreatorWorkload(
        productionSessions,
        publications,
        capacity,
        calendarAnchorDate
      ),
    [productionSessions, publications, capacity, calendarAnchorDate]
  );

  const sponsorshipSummary = useMemo(
    () => calculateSponsorshipSummary(sponsorships),
    [sponsorships]
  );

  const handleCreateNewContentItem = (defaultStage: ContentStage = 'Idea & Research Bank') => {
    const defaultProj = projects[0];
    const newItem: ContentItem = {
      id: `cnt-${Date.now()}`,
      title: '',
      pillar: defaultProj?.pillar || '3d_marketing',
      format: 'short_video',
      stage: defaultStage,
      projectId: defaultProj?.id || 'cproj-1',
      seriesId: seriesList[0]?.id || '',
      linkedProductId: '',
      priority: 'High',
      orderIndex: contentItems.length + 1,
      targetPublishDate: addDaysIso(jakartaToday, 3),
      voiceOverEnabled: true,
      voiceOverScriptOrNotes: 'Record evening VO (19:30–21:00 WIB) on iPhone.',
      brief: {
        hook: '',
        keyMessage: '',
        callToAction: 'Check catalog in bio / share your thoughts in the comments!',
        targetAudience: defaultProj?.targetAudience || 'Indonesian makers & creators',
        estimatedDurationSec: 40,
      },
      references: [],
      scriptText: '',
      carouselSlides: [],
      shots: [
        {
          id: `shot-${Date.now()}-1`,
          shotNumber: 1,
          visualAngle: 'Close-up of main subject on workshop desk (2x Telephoto)',
          audioOrAction: 'Opening 3-second visual hook',
          durationSec: 5,
          location: 'Evening Workshop Desk',
          iphoneSetting: 'iPhone 4K 60fps',
          completed: false,
        },
      ],
      localAssets: [],
      qcChecklist: [
        {
          id: `cqc-${Date.now()}-1`,
          text: 'Verify factual accuracy & alignment with brief',
          completed: false,
        },
        {
          id: `cqc-${Date.now()}-2`,
          text: 'Ensure text/subtitles stay inside the 9:16 vertical safe-zone',
          completed: false,
        },
      ],
      nextAction: 'Complete brief hook and script outline.',
      updatedAt: jakartaToday,
    };
    setEditingItem(newItem);
    setWorkbenchSection('brief');
  };

  const handleQuickCaptureSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;
    const targetProject =
      projects.find((p) => p.pillar === quickPillar) || projects[0];
    const created: ContentItem = {
      id: `cnt-${Date.now()}`,
      title: quickTitle.trim(),
      pillar: quickPillar,
      format: quickFormat,
      stage: 'Idea & Research Bank',
      projectId: targetProject?.id || 'cproj-1',
      seriesId: seriesList.find((s) => s.projectId === targetProject?.id)?.id,
      linkedProductId: quickProductId || undefined,
      priority: 'Medium',
      orderIndex: contentItems.length + 1,
      targetPublishDate: addDaysIso(jakartaToday, 5),
      voiceOverEnabled: quickFormat === 'cerpen' ? false : quickVoiceOver,
      voiceOverScriptOrNotes:
        quickFormat === 'cerpen'
          ? 'Text Short Story Format (No VO)'
          : quickVoiceOver
          ? 'Use iPhone Voice Memos'
          : 'No Voice-Over',
      brief: {
        hook: quickHook.trim() || quickTitle.trim(),
        keyMessage: quickNotes.trim(),
        callToAction:
          quickPillar === '3d_marketing'
            ? 'Check product link in bio / comments for details!'
            : 'Share your story in the comments below!',
        targetAudience: targetProject?.targetAudience || 'General Audience',
        estimatedDurationSec: quickFormat === 'cerpen' || quickFormat === 'carousel' ? 0 : 45,
      },
      references: [],
      scriptText: quickNotes.trim(),
      carouselSlides: [],
      shots: [],
      localAssets: [],
      qcChecklist: [
        { id: `cqc-${Date.now()}`, text: 'Expand idea into a full brief & script', completed: false },
      ],
      nextAction: 'Flesh out script during evening window (19:30 WIB).',
      updatedAt: jakartaToday,
    };
    onSaveContentItem(created);
    setQuickTitle('');
    setQuickHook('');
    setQuickNotes('');
    setQuickProductId('');
    setSyncBanner(`Idea "${created.title}" saved to Idea & Research Bank!`);
    setTimeout(() => setSyncBanner(''), 4000);
  };

  const handleOpenMetricSnapshotModal = (pub: ContentPublication, window: MetricWindow) => {
    const existing = metricSnapshots.find(
      (s) => s.publicationId === pub.id && s.window === window
    );
    const numToStr = (v: number | null | undefined) =>
      v === null || v === undefined ? '' : String(v);

    setEditingMetricModal({
      pub,
      window,
      views: numToStr(existing?.views),
      likes: numToStr(existing?.likes),
      comments: numToStr(existing?.comments),
      shares: numToStr(existing?.shares),
      saves: numToStr(existing?.saves),
      watchTimeSeconds: numToStr(existing?.watchTimeSeconds),
      completionRatePercent: numToStr(existing?.completionRatePercent),
      profileVisits: numToStr(existing?.profileVisits),
      productClicks: numToStr(existing?.productClicks),
      qualitativeNotes: existing?.qualitativeNotes || '',
    });
  };

  const handleSaveMetricModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMetricModal) return;
    const parseNullableNum = (raw: string): number | null => {
      const trimmed = raw.trim();
      if (trimmed === '') return null;
      const n = Number(trimmed);
      return Number.isFinite(n) ? Math.max(0, n) : null;
    };

    const existing = metricSnapshots.find(
      (s) =>
        s.publicationId === editingMetricModal.pub.id &&
        s.window === editingMetricModal.window
    );

    const snapshot: MetricSnapshot = {
      id: existing?.id || `msnap-${Date.now()}`,
      publicationId: editingMetricModal.pub.id,
      contentItemId: editingMetricModal.pub.contentItemId,
      channel: editingMetricModal.pub.channel,
      window: editingMetricModal.window,
      recordedAtJakarta: `${getJakartaDateIso()} ${getJakartaTimeWib()}`,
      views: parseNullableNum(editingMetricModal.views),
      likes: parseNullableNum(editingMetricModal.likes),
      comments: parseNullableNum(editingMetricModal.comments),
      shares: parseNullableNum(editingMetricModal.shares),
      saves: parseNullableNum(editingMetricModal.saves),
      watchTimeSeconds: parseNullableNum(editingMetricModal.watchTimeSeconds),
      completionRatePercent: parseNullableNum(editingMetricModal.completionRatePercent),
      profileVisits: parseNullableNum(editingMetricModal.profileVisits),
      productClicks: parseNullableNum(editingMetricModal.productClicks),
      qualitativeNotes: editingMetricModal.qualitativeNotes.trim(),
    };

    onSaveMetricSnapshot(snapshot);
    setEditingMetricModal(null);
  };

  const handleDownloadMarkdown = (item: ContentItem) => {
    const md = exportContentBriefMarkdown(item, {
      project: projects.find((p) => p.id === item.projectId),
      series: seriesList.find((s) => s.id === item.seriesId),
      product: products.find((p) => p.id === item.linkedProductId),
      publications,
      sessions: productionSessions,
      snapshots: metricSnapshots,
    });
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `content-brief-${item.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatBadgeLabel = (fmt: ContentFormat) =>
    CONTENT_FORMATS.find((f) => f.id === fmt)?.badge || fmt;

  return (
    <div className="space-y-6 pb-12">
      {/* Top KPI Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Total Content Items</span>
            <Clapperboard className="w-4 h-4 text-orange-500" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {contentItems.length} Items
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {contentItems.filter((c) => c.pillar === '3d_marketing').length} 3D Marketing ·{' '}
            {contentItems.filter((c) => c.pillar === 'personal').length} Personal / Stories
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Channel Publications & Live</span>
            <Video className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
            {publications.filter((p) => p.status === 'Published').length} / {publications.length} Live
          </div>
          <div className="mt-1 text-xs text-slate-500">
            This week: {workload.scheduledPublicationsThisWeek} of {capacity.targetPostsPerWeek} target posts
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Production Workload This Week (WIB)</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {formatDuration(workload.totalSharedSessionMinutes)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Evenings: {formatDuration(workload.weekdayEveningMinutesUsed)}/{capacity.maxWeekdayEveningHoursPerWeek}h · Weekend:{' '}
            {formatDuration(workload.weekendMinutesUsed)}/{capacity.maxWeekendHoursPerWeek}h
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Paid vs Promised Sponsorships</span>
            <DollarSign className="w-4 h-4 text-sky-500" />
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
            Received: {formatRupiah(sponsorshipSummary.receivedIncomeRp)}
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-amber-600 dark:text-amber-400">
            Promised (Invoiced): {formatRupiah(sponsorshipSummary.promisedIncomeRp)}
          </div>
        </div>
      </div>

      {/* Workload / Office Hours Conflict Alert Banner */}
      {(workload.officeHourConflicts.length > 0 || workload.capacityWarnings.length > 0) && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-950 dark:text-amber-200 space-y-1.5"
        >
          <div className="font-bold flex items-center gap-2 text-amber-900 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0" />
            <span>Creator Schedule & Capacity Warnings (Asia/Jakarta — WIB)</span>
          </div>
          <ul className="list-disc list-inside space-y-1">
            {workload.officeHourConflicts.map((c) => (
              <li key={c.sessionId}>
                <strong>{c.title}</strong> ({c.date} {c.timeSlot}): {c.reason}
              </li>
            ))}
            {workload.capacityWarnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {syncBanner && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between">
          <span className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            {syncBanner}
          </span>
          <button
            type="button"
            onClick={() => setSyncBanner('')}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Sub-Navigation & Visible Search Bar (Desktop & Mobile) */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('pipeline')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                activeTab === 'pipeline'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <FolderKanban className="w-3.5 h-3.5" />
              Pipeline & Workbench ({contentItems.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('publications')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                activeTab === 'publications'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Channel Publications & Metrics ({publications.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('schedule')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                activeTab === 'schedule'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Production Sessions & WIB Calendar ({productionSessions.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('capture')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                activeTab === 'capture'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Quick Capture & Strategy
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('finance')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                activeTab === 'finance'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              Sponsorships, Reviews & Capacity
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('capture')}
              className="px-3 py-1.5 text-xs font-semibold bg-amber-100 hover:bg-amber-200 text-amber-950 rounded-lg flex items-center gap-1.5"
            >
              <Smartphone className="w-3.5 h-3.5 text-orange-600" />
              Quick Idea Capture
            </button>
            <button
              type="button"
              onClick={() => handleCreateNewContentItem('Brief')}
              className="px-3.5 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white dark:bg-amber-500 dark:text-slate-950 rounded-lg flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              + New Content Item
            </button>
          </div>
        </div>

        {/* Always-visible Search and Filter Row (works on Mobile & Desktop) */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search content title, hook, script, short story, or linked product..."
              aria-label="Search content in Content Studio"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            />
          </div>

          <select
            aria-label="Filter Content Pillar"
            value={pillarFilter}
            onChange={(e) => setPillarFilter(e.target.value as 'ALL' | ContentPillar)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
          >
            <option value="ALL">All Pillars (Personal & 3D)</option>
            <option value="3d_marketing">3D Print Marketing</option>
            <option value="personal">Personal / Story / Education</option>
          </select>

          <select
            aria-label="Filter Content Format"
            value={formatFilter}
            onChange={(e) => setFormatFilter(e.target.value as 'ALL' | ContentFormat)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
          >
            <option value="ALL">All Formats</option>
            {CONTENT_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.badge}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter Content Project"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
          >
            <option value="ALL">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {activeTab === 'pipeline' && (
            <div className="flex items-center gap-2">
              {pipelineLayout === 'board' && (
                <button
                  type="button"
                  onClick={() => setShowAllStages((prev) => !prev)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    showAllStages
                      ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-300'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {showAllStages ? 'Show: All 11 Stages' : 'Show: Active Stages (Click for all 11)'}
                </button>
              )}
              <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => setPipelineLayout('board')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md flex items-center gap-1 ${
                    pipelineLayout === 'board'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                      : 'text-slate-500'
                  }`}
                >
                  <FolderKanban className="w-3 h-3" />
                  Stage Board
                </button>
                <button
                  type="button"
                  onClick={() => setPipelineLayout('table')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md flex items-center gap-1 ${
                    pipelineLayout === 'table'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                      : 'text-slate-500'
                  }`}
                >
                  <List className="w-3 h-3" />
                  Table
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: PIPELINE & CONNECTED CONTENT WORKBENCH                         */}
      {/* ===================================================================== */}
      {activeTab === 'pipeline' && (
        <>
          {pipelineLayout === 'board' ? (
            <div className="flex gap-3.5 overflow-x-auto pb-4 items-start">
              {CONTENT_STAGES.map((stage, stageIdx) => {
                const stageItems = filteredItems.filter((item) => item.stage === stage);
                if (!showAllStages && filteredItems.length > 0 && stageItems.length === 0) {
                  return null;
                }

                return (
                  <div
                    key={stage}
                    className="w-[295px] shrink-0 bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3 flex flex-col"
                  >
                    <div className="flex items-center justify-between px-1 pb-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-slate-400">
                          {stageIdx + 1}.
                        </span>
                        <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {stage}
                        </h3>
                        <span className="text-xs font-mono tabular-nums text-slate-500">
                          ({stageItems.length})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCreateNewContentItem(stage)}
                        aria-label={`Add content in ${stage}`}
                        className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-md"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="space-y-3 min-h-[120px]">
                      {stageItems.map((item) => {
                        const prod = products.find((p) => p.id === item.linkedProductId);
                        const itemPubs = publications.filter((p) => p.contentItemId === item.id);
                        const qcProg = getChecklistProgress(item.qcChecklist);

                        return (
                          <div
                            key={item.id}
                            className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-2.5 hover:border-amber-500/60 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span
                                className={`font-semibold ${
                                  item.pillar === '3d_marketing'
                                    ? 'text-orange-600 dark:text-amber-400'
                                    : 'text-sky-600 dark:text-sky-400'
                                }`}
                              >
                                {item.pillar === '3d_marketing' ? '3D Marketing' : 'Personal'} ·{' '}
                                {formatBadgeLabel(item.format)}
                              </span>
                              <span className="font-mono tabular-nums text-slate-500">
                                {item.targetPublishDate}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setEditingItem(item);
                                setWorkbenchSection('brief');
                              }}
                              className="w-full text-left block"
                            >
                              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug hover:text-orange-600">
                                {item.title}
                              </h4>
                              {item.brief.hook && (
                                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                                  Hook: "{item.brief.hook}"
                                </p>
                              )}
                            </button>

                            {prod ? (
                              <div className="text-[11px] text-slate-500 truncate">
                                Product: <strong className="text-slate-700 dark:text-slate-300">{prod.name}</strong>
                              </div>
                            ) : (
                              <div className="text-[11px] text-slate-400">
                                Standalone Content (No Product Link)
                              </div>
                            )}

                            {/* Connected summary counts */}
                            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">
                              <span>
                                {item.format === 'cerpen'
                                  ? 'Text Story'
                                  : `${item.shots.filter((s) => s.completed).length}/${item.shots.length} Shots`}
                              </span>
                              <span>·</span>
                              <span>{item.localAssets.length} Local Files</span>
                              <span>·</span>
                              <span>{itemPubs.length} Channels</span>
                              <span>·</span>
                              <span>
                                QC {qcProg.completed}/{qcProg.total}
                              </span>
                            </div>

                            {/* Tap-based Stage & Ordering Controls (No Drag Required) */}
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1">
                                {stageIdx > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onMoveContentStage(item.id, CONTENT_STAGES[stageIdx - 1])
                                    }
                                    title={`Move to ${CONTENT_STAGES[stageIdx - 1]}`}
                                    aria-label={`Move ${item.title} to ${CONTENT_STAGES[stageIdx - 1]}`}
                                    className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-slate-100 dark:bg-slate-800 rounded"
                                  >
                                    <ArrowLeft className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {stageIdx < CONTENT_STAGES.length - 1 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onMoveContentStage(item.id, CONTENT_STAGES[stageIdx + 1])
                                    }
                                    title={`Move to ${CONTENT_STAGES[stageIdx + 1]}`}
                                    aria-label={`Move ${item.title} to ${CONTENT_STAGES[stageIdx + 1]}`}
                                    className="px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-950/50 hover:bg-amber-200 rounded flex items-center gap-1"
                                  >
                                    <span>{CONTENT_STAGES[stageIdx + 1]}</span>
                                    <ArrowRight className="w-3 h-3" />
                                  </button>
                                )}
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => onReorderContentItem(item.id, 'up')}
                                  aria-label={`Move ${item.title} up`}
                                  className="p-1 text-slate-400 hover:text-slate-700"
                                >
                                  <ArrowUp className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onReorderContentItem(item.id, 'down')}
                                  aria-label={`Move ${item.title} down`}
                                  className="p-1 text-slate-400 hover:text-slate-700"
                                >
                                  <ArrowDown className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setMarkdownPreviewItem(item)}
                                  title="Preview & Export Brief Document (.md / Print)"
                                  aria-label={`Export brief for ${item.title}`}
                                  className="p-1 text-slate-500 hover:text-orange-600"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 bg-slate-50/70 dark:bg-slate-800/50">
                      <th className="py-3 px-4">Content Title & Hook</th>
                      <th className="py-3 px-3">Pillar & Format</th>
                      <th className="py-3 px-3">Stage</th>
                      <th className="py-3 px-3">Linked Product</th>
                      <th className="py-3 px-3">Target Publish (WIB)</th>
                      <th className="py-3 px-3">Channels</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                    {filteredItems.map((item) => {
                      const prod = products.find((p) => p.id === item.linkedProductId);
                      const pubs = publications.filter((p) => p.contentItemId === item.id);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-4">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingItem(item);
                                setWorkbenchSection('brief');
                              }}
                              className="font-semibold text-slate-900 dark:text-slate-100 hover:text-orange-600 text-left block"
                            >
                              {item.title}
                            </button>
                            <span className="text-xs text-slate-500 block mt-0.5 line-clamp-1">
                              {item.brief.hook}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-xs">
                            <span className="font-semibold">
                              {item.pillar === '3d_marketing' ? '3D Marketing' : 'Personal'}
                            </span>{' '}
                            · {formatBadgeLabel(item.format)}
                          </td>
                          <td className="py-3 px-3">
                            <select
                              aria-label={`Change stage for ${item.title}`}
                              value={item.stage}
                              onChange={(e) =>
                                onMoveContentStage(item.id, e.target.value as ContentStage)
                              }
                              className="text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1"
                            >
                              {CONTENT_STAGES.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 px-3 text-xs text-slate-600 dark:text-slate-300">
                            {prod ? prod.name : 'Standalone (No Product)'}
                          </td>
                          <td className="py-3 px-3 font-mono tabular-nums text-xs">
                            {item.targetPublishDate}
                          </td>
                          <td className="py-3 px-3 text-xs font-mono">
                            {pubs.map((p) => p.channel).join(', ') || '—'}
                          </td>
                          <td className="py-3 px-4 text-right space-x-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingItem(item);
                                setWorkbenchSection('brief');
                              }}
                              className="text-xs font-semibold text-orange-600 hover:underline"
                            >
                              Workbench
                            </button>
                            <button
                              type="button"
                              onClick={() => setMarkdownPreviewItem(item)}
                              className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:underline"
                            >
                              Export MD
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: MULTI-CHANNEL PUBLICATIONS, MANUAL PUBLISH & METRIC SNAPSHOTS  */}
      {/* ===================================================================== */}
      {activeTab === 'publications' && (
        <div className="space-y-4">
          <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Multi-Channel Publication Distribution & Manual Metric Snapshots (24h vs 7d)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                A single creative item can have independent schedules, captions, live post URLs, and metrics across TikTok, Instagram, YouTube, & Threads. Scheduling acts as a manual reminder (never auto-publishes).
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setEditingPub({
                  id: `pub-${Date.now()}`,
                  contentItemId: contentItems[0]?.id || 'cnt-1',
                  channel: 'TikTok',
                  caption: '',
                  hashtags: '#3dprintingindonesia #printos',
                  scheduledDateJakarta: jakartaToday,
                  scheduledTimeJakarta: '19:30',
                  status: 'Scheduled',
                  platformNotes: '',
                })
              }
              className="px-3.5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              + Add Channel Schedule
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 bg-slate-50/70 dark:bg-slate-800/50">
                    <th className="py-3 px-4">Content & Channel</th>
                    <th className="py-3 px-3">Status & Schedule (WIB)</th>
                    <th className="py-3 px-3">Manual Publish Confirmation</th>
                    <th className="py-3 px-3 text-right">24-Hour Snapshot</th>
                    <th className="py-3 px-3 text-right">7-Day Snapshot (Cumulative)</th>
                    <th className="py-3 px-3 text-right">Delta (7d - 24h)</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {publications.map((pub) => {
                    const parentItem = contentItems.find((c) => c.id === pub.contentItemId);
                    const cmp = summarizePublicationMetrics(metricSnapshots, pub.id);

                    return (
                      <tr key={pub.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3.5 px-4 max-w-[280px]">
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            [{pub.channel}] {parentItem?.title || pub.contentItemId}
                          </div>
                          <div className="text-slate-500 line-clamp-2 mt-0.5">
                            {pub.caption}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 font-mono tabular-nums">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            {pub.status}
                          </div>
                          <div className="text-slate-500">
                            {pub.scheduledDateJakarta} {pub.scheduledTimeJakarta} WIB
                          </div>
                        </td>
                        <td className="py-3.5 px-3">
                          {pub.status === 'Published' ? (
                            <div className="space-y-1">
                              <div className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Live: {pub.actualPublishedAtJakarta || 'Confirmed'}
                              </div>
                              {pub.actualPostUrl && (
                                <a
                                  href={pub.actualPostUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[11px] text-sky-600 hover:underline flex items-center gap-1 truncate max-w-[180px]"
                                >
                                  <ExternalLink className="w-3 h-3 shrink-0" />
                                  {pub.actualPostUrl}
                                </a>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmingPub({
                                  pub,
                                  actualDateTimeWib: `${getJakartaDateIso()} ${getJakartaTimeWib()}`,
                                  actualUrl: pub.actualPostUrl || '',
                                })
                              }
                              className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-100 hover:bg-emerald-200 text-emerald-950 rounded-md"
                            >
                              Confirm Published
                            </button>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums">
                          {cmp.snapshot24h ? (
                            <div>
                              <div className="font-bold text-slate-900 dark:text-slate-100">
                                {formatMetricValue(cmp.snapshot24h.views)} views
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Likes: {formatMetricValue(cmp.snapshot24h.likes)} · Clicks:{' '}
                                {formatMetricValue(cmp.snapshot24h.productClicks)}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleOpenMetricSnapshotModal(pub, '24h')}
                                className="text-[10px] text-amber-600 hover:underline mt-0.5"
                              >
                                Edit 24h
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenMetricSnapshotModal(pub, '24h')}
                              className="px-2 py-1 text-[11px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded text-slate-700 dark:text-slate-300"
                            >
                              + Log 24h Snapshot
                            </button>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums">
                          {cmp.snapshot7d ? (
                            <div>
                              <div className="font-bold text-slate-900 dark:text-slate-100">
                                {formatMetricValue(cmp.snapshot7d.views)} views
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Likes: {formatMetricValue(cmp.snapshot7d.likes)} · Clicks:{' '}
                                {formatMetricValue(cmp.snapshot7d.productClicks)}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleOpenMetricSnapshotModal(pub, '7d')}
                                className="text-[10px] text-amber-600 hover:underline mt-0.5"
                              >
                                Edit 7d
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenMetricSnapshotModal(pub, '7d')}
                              className="px-2 py-1 text-[11px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded text-slate-700 dark:text-slate-300"
                            >
                              + Log 7d Snapshot
                            </button>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums">
                          {cmp.viewsGrowthAfter24h !== null ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                              +{formatMetricValue(cmp.viewsGrowthAfter24h)} views
                            </span>
                          ) : (
                            <span className="text-slate-400">— (Needs 24h & 7d)</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => setEditingPub(pub)}
                            className="text-amber-600 hover:underline font-medium"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeletePublication(pub.id)}
                            aria-label={`Delete ${pub.channel} publication`}
                            className="text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5 inline" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: PRODUCTION SESSIONS & NAVIGABLE CALENDAR (ASIA/JAKARTA WIB)    */}
      {/* ===================================================================== */}
      {activeTab === 'schedule' && (
        <div className="space-y-5">
          {/* Session Controls & Idempotent Task Sync */}
          <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Production Session Planning (iPhone Shooting / Editing) vs Channel Publish Schedule
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Production sessions are separated from publication dates. A batch shooting session covering multiple items counts its duration <strong>once</strong> and syncs idempotently to the Tasks & Schedule board.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const res = onSyncSessionsToTasks();
                  setSyncBanner(
                    `Task Sync Complete: ${res.createdCount} new session tasks created, ${res.updatedCount} tasks updated (0 duplicates).`
                  );
                }}
                className="px-3 py-1.5 text-xs font-semibold bg-amber-100 hover:bg-amber-200 text-amber-950 rounded-lg flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5 text-orange-600" />
                Sync Sessions to Tasks & Gantt
              </button>

              <button
                type="button"
                onClick={() =>
                  setEditingSession({
                    id: `psess-${Date.now()}`,
                    title: '',
                    date: calendarAnchorDate,
                    startTimeWib: capacity.weekdayEveningStart || '19:30',
                    endTimeWib: '21:30',
                    durationMinutes: 120,
                    activityType: 'iPhone Shooting',
                    device: capacity.primaryCameraDevice,
                    location: 'Evening Workshop Desk',
                    contentItemIds: contentItems[0] ? [contentItems[0].id] : [],
                    completed: false,
                    notes: '',
                  })
                }
                className="px-3.5 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white dark:bg-amber-500 dark:text-slate-950 rounded-lg flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                + Schedule Production Session
              </button>
            </div>
          </div>

          {/* Navigable Calendar Header (Weekly / Monthly / Agenda) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  {(['week', 'month', 'agenda'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setCalendarViewMode(m)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md ${
                        calendarViewMode === m
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {m === 'week'
                        ? 'Weekly Calendar'
                        : m === 'month'
                        ? 'Monthly Calendar'
                        : 'Daily Agenda'}
                    </button>
                  ))}
                </div>

                <span className="text-xs font-mono text-slate-500">
                  Today (Asia/Jakarta): <strong>{jakartaToday}</strong>
                </span>
              </div>

              {/* Navigation Controls (Prev / Today / Next) */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (calendarViewMode === 'month') {
                      setCalendarYearMonth((ym) => shiftYearMonth(ym, -1));
                    } else {
                      setCalendarAnchorDate((d) => addDaysIso(d, -7));
                    }
                  }}
                  className="px-2.5 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCalendarAnchorDate('2026-10-23');
                    setCalendarYearMonth('2026-10');
                  }}
                  className="px-2.5 py-1 text-xs font-semibold bg-amber-100 text-amber-950 rounded-lg"
                >
                  Active Week (Oct 2026)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCalendarAnchorDate(jakartaToday);
                    setCalendarYearMonth(jakartaToday.slice(0, 7));
                  }}
                  className="px-2.5 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-800 rounded-lg"
                >
                  Today ({jakartaToday})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (calendarViewMode === 'month') {
                      setCalendarYearMonth((ym) => shiftYearMonth(ym, 1));
                    } else {
                      setCalendarAnchorDate((d) => addDaysIso(d, 7));
                    }
                  }}
                  className="px-2.5 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg flex items-center gap-1"
                >
                  Next
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Weekly Calendar Grid */}
            {calendarViewMode === 'week' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
                {getWeekRangeForDateIso(calendarAnchorDate).days.map((iso) => {
                  const daySessions = productionSessions.filter((s) => s.date === iso);
                  const dayPubs = publications.filter((p) => p.scheduledDateJakarta === iso);
                  const dayName = getIndonesianDayName(iso);
                  const isToday = iso === jakartaToday || iso === '2026-10-23';

                  return (
                    <div
                      key={iso}
                      className={`min-h-[180px] p-3 rounded-xl border flex flex-col justify-between ${
                        isToday
                          ? 'border-amber-500 bg-amber-50/20 dark:bg-amber-950/15'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {dayName}
                          </span>
                          <span className="font-mono text-slate-500">{iso.slice(5)}</span>
                        </div>

                        {/* Production Sessions on this day */}
                        {daySessions.map((sess) => (
                          <button
                            key={sess.id}
                            type="button"
                            onClick={() => setEditingSession(sess)}
                            className="w-full text-left p-2 rounded-lg bg-amber-100/80 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-[11px]"
                          >
                            <div className="font-mono font-bold text-amber-950 dark:text-amber-300">
                              🎬 {sess.startTimeWib}–{sess.endTimeWib} ({sess.durationMinutes}m)
                            </div>
                            <div className="font-semibold text-slate-900 dark:text-slate-100 line-clamp-2 mt-0.5">
                              {sess.title}
                            </div>
                            <div className="text-[10px] text-slate-600 dark:text-slate-400 mt-0.5">
                              {sess.contentItemIds.length} linked item(s)
                            </div>
                          </button>
                        ))}

                        {/* Channel Publications on this day */}
                        {dayPubs.map((pub) => {
                          const item = contentItems.find((c) => c.id === pub.contentItemId);
                          return (
                            <button
                              key={pub.id}
                              type="button"
                              onClick={() => setEditingPub(pub)}
                              className="w-full text-left p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-[11px]"
                            >
                              <div className="font-mono font-bold text-emerald-800 dark:text-emerald-300">
                                📲 Post {pub.channel} · {pub.scheduledTimeJakarta}
                              </div>
                              <div className="text-slate-800 dark:text-slate-200 truncate">
                                {item?.title || pub.caption}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setEditingSession({
                            id: `psess-${Date.now()}`,
                            title: '',
                            date: iso,
                            startTimeWib: '19:30',
                            endTimeWib: '21:00',
                            durationMinutes: 90,
                            activityType: 'iPhone Shooting',
                            device: capacity.primaryCameraDevice,
                            location: 'Evening Workshop',
                            contentItemIds: contentItems[0] ? [contentItems[0].id] : [],
                            completed: false,
                            notes: '',
                          })
                        }
                        className="mt-2 text-[11px] text-slate-400 hover:text-orange-600 text-left"
                      >
                        + Session {iso.slice(8)}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Monthly Calendar Grid */}
            {calendarViewMode === 'month' && (
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">
                  {buildCalendarDaysForMonth(calendarYearMonth).monthLabel}
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                    <div
                      key={d}
                      className="text-center text-xs font-semibold text-slate-500 py-1"
                    >
                      {d}
                    </div>
                  ))}
                  {buildCalendarDaysForMonth(calendarYearMonth).days.map((cell) => {
                    const daySessions = productionSessions.filter((s) => s.date === cell.iso);
                    const dayPubs = publications.filter(
                      (p) => p.scheduledDateJakarta === cell.iso
                    );
                    return (
                      <div
                        key={cell.iso}
                        className={`min-h-[92px] p-2 rounded-lg border text-[11px] ${
                          cell.inCurrentMonth
                            ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                            : 'bg-slate-50/50 dark:bg-slate-950 border-slate-100 dark:border-slate-900 opacity-50'
                        }`}
                      >
                        <div className="font-mono text-slate-500 mb-1">
                          {cell.iso.slice(8)}
                        </div>
                        <div className="space-y-1">
                          {daySessions.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => setEditingSession(s)}
                              className="w-full text-left px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 truncate"
                            >
                              🎬 {s.startTimeWib} {s.title}
                            </button>
                          ))}
                          {dayPubs.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setEditingPub(p)}
                              className="w-full text-left px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 truncate"
                            >
                              📲 {p.channel} {p.scheduledTimeJakarta}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Agenda View */}
            {calendarViewMode === 'agenda' && (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {productionSessions.map((sess) => {
                  const linkedTitles = sess.contentItemIds
                    .map((id) => contentItems.find((c) => c.id === id)?.title)
                    .filter(Boolean);
                  return (
                    <div
                      key={sess.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center gap-2 text-xs font-mono text-amber-700 dark:text-amber-400">
                          <span>
                            {sess.date} ({getIndonesianDayName(sess.date)}) · {sess.startTimeWib}–
                            {sess.endTimeWib} WIB
                          </span>
                          <span>·</span>
                          <span>{sess.durationMinutes} min (Counted 1x)</span>
                        </div>
                        <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                          {sess.title}
                        </div>
                        <div className="text-xs text-slate-500">
                          {sess.activityType} · {sess.device} · Content:{' '}
                          {linkedTitles.join(' + ') || 'General'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            onSaveProductionSession({ ...sess, completed: !sess.completed })
                          }
                          className={`px-2.5 py-1 text-xs font-semibold rounded-lg ${
                            sess.completed
                              ? 'bg-emerald-100 text-emerald-900'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {sess.completed ? 'Completed' : 'Mark Completed'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingSession(sess)}
                          className="px-2.5 py-1 text-xs font-medium text-amber-600 hover:underline"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: MOBILE QUICK CAPTURE & STRATEGY / PROJECTS / SERIES            */}
      {/* ===================================================================== */}
      {activeTab === 'capture' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left 5 cols: Mobile Quick Capture Form */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-orange-500" />
                Mobile Quick Capture
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Jot down spontaneous ideas during your commute or between 3D print jobs straight to the Idea & Research Bank.
              </p>
            </div>

            <form onSubmit={handleQuickCaptureSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Idea Title / Content Topic *
                </label>
                <input
                  type="text"
                  required
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  placeholder="Example: Zero-stringing TPU 95A print experiment or Commuter Rain Short Story..."
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Content Pillar
                  </label>
                  <select
                    value={quickPillar}
                    onChange={(e) => setQuickPillar(e.target.value as ContentPillar)}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="3d_marketing">3D Print Marketing</option>
                    <option value="personal">Personal / Stories / Education</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Format
                  </label>
                  <select
                    value={quickFormat}
                    onChange={(e) => setQuickFormat(e.target.value as ContentFormat)}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    {CONTENT_FORMATS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.badge}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Link to Catalog Product (Optional — Leave Blank for Personal Content)
                </label>
                <select
                  value={quickProductId}
                  onChange={(e) => setQuickProductId(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  <option value="">No Product Link (Independent / Personal Content)</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Opening Hook Line
                </label>
                <input
                  type="text"
                  value={quickHook}
                  onChange={(e) => setQuickHook(e.target.value)}
                  placeholder="First 3-second hook line that sparks curiosity..."
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Quick Notes / Short Story Draft Paragraph
                </label>
                <textarea
                  rows={3}
                  value={quickNotes}
                  onChange={(e) => setQuickNotes(e.target.value)}
                  placeholder="Write idea bullet points or short story excerpt..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              {quickFormat !== 'cerpen' && (
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={quickVoiceOver}
                    onChange={(e) => setQuickVoiceOver(e.target.checked)}
                  />
                  <span>Include Voice-Over (VO)</span>
                </label>
              )}

              <button
                type="submit"
                className="w-full py-2.5 px-4 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg"
              >
                Save to Idea & Research Bank
              </button>
            </form>
          </div>

          {/* Right 7 cols: Projects & Series Organization */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Content Projects & Series
                  </h3>
                  <p className="text-xs text-slate-500">
                    Organize content by Personal vs 3D Print Marketing pillars and series cadence
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setEditingProjectModal({
                        id: `cproj-${Date.now()}`,
                        name: '',
                        pillar: '3d_marketing',
                        targetAudience: '',
                        coreAngle: '',
                        active: true,
                      })
                    }
                    className="px-3 py-1.5 text-xs font-semibold bg-slate-100 dark:bg-slate-800 rounded-lg"
                  >
                    + New Project
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingSeriesModal({
                        id: `cser-${Date.now()}`,
                        projectId: projects[0]?.id || 'cproj-1',
                        name: '',
                        cadenceLabel: '1x Weekly (Weekend)',
                        defaultFormat: 'short_video',
                        defaultChannels: ['TikTok', 'Instagram'],
                        description: '',
                      })
                    }
                    className="px-3 py-1.5 text-xs font-semibold bg-amber-100 text-amber-950 rounded-lg"
                  >
                    + New Series
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {projects.map((proj) => {
                  const projSeries = seriesList.filter((s) => s.projectId === proj.id);
                  return (
                    <div
                      key={proj.id}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-orange-600 dark:text-amber-400">
                          {proj.pillar === '3d_marketing' ? '3D Print Marketing' : 'Personal / Story'}
                        </span>
                        <span className="text-slate-400 font-mono">
                          {contentItems.filter((c) => c.projectId === proj.id).length} items
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {proj.name}
                      </h4>
                      <p className="text-xs text-slate-500">{proj.coreAngle}</p>
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                        <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                          Series in this project ({projSeries.length}):
                        </div>
                        {projSeries.map((ser) => (
                          <div key={ser.id} className="text-xs text-slate-600 dark:text-slate-300">
                            • <strong>{ser.name}</strong> ({ser.cadenceLabel})
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 5: SPONSORSHIP, WEEKLY REVIEWS & CREATOR CAPACITY CONFIG          */}
      {/* ===================================================================== */}
      {activeTab === 'finance' && (
        <div className="space-y-6">
          {/* Sponsorship & Content Expense Tracking */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Sponsorships, Endorsements & Content Production Expenses (Linked to Rp Ledger)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Strictly separates <strong>Promised Income (Invoiced)</strong> from <strong>Received Money (Paid)</strong>. Only deals marked "Received / Paid" are posted as realized income in the finance ledger.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const res = onSyncSponsorshipsToLedger();
                    setSyncBanner(
                      `Finance Ledger Sync Complete: ${res.addedCount} new ledger entries added, ${res.updatedCount} updated (0 duplicates).`
                    );
                  }}
                  className="px-3 py-1.5 text-xs font-semibold bg-emerald-100 hover:bg-emerald-200 text-emerald-950 rounded-lg flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Sync to Finance Ledger (Idempotent)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setEditingDeal({
                      id: `spon-${Date.now()}`,
                      brandName: '',
                      title: '',
                      contentItemId: contentItems[0]?.id,
                      agreedAmountRp: 1500000,
                      productionExpenseRp: 100000,
                      status: 'Promised / Invoiced',
                      promisedDate: jakartaToday,
                      invoiceRef: `INV-CREATOR-${sponsorships.length + 1}`,
                      notes: '',
                    })
                  }
                  className="px-3.5 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg"
                >
                  + Add Sponsorship / Expense
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 bg-slate-50/70 dark:bg-slate-800/50">
                    <th className="py-2.5 px-3">Brand & Campaign Title</th>
                    <th className="py-2.5 px-3">Payment Status</th>
                    <th className="py-2.5 px-3 text-right">Sponsorship Value (Rp)</th>
                    <th className="py-2.5 px-3 text-right">Production Expense (Rp)</th>
                    <th className="py-2.5 px-3">Promised / Paid Date</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {sponsorships.map((deal) => (
                    <tr key={deal.id}>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                          {deal.brandName} — {deal.title}
                        </div>
                        <div className="text-slate-500 font-mono text-[11px]">
                          {deal.invoiceRef} · {deal.notes}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`font-semibold ${
                            deal.status === 'Received / Paid'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : deal.status === 'Promised / Invoiced'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-500'
                          }`}
                        >
                          {deal.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-bold">
                        {formatRupiah(deal.agreedAmountRp)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {formatRupiah(deal.productionExpenseRp)}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-500">
                        {deal.status === 'Received / Paid'
                          ? `Paid: ${deal.receivedDate || deal.promisedDate}`
                          : `Promised: ${deal.promisedDate}`}
                      </td>
                      <td className="py-3 px-3 text-right space-x-2">
                        {deal.status !== 'Received / Paid' && (
                          <button
                            type="button"
                            onClick={() => {
                              onSaveSponsorship({
                                ...deal,
                                status: 'Received / Paid',
                                receivedDate: jakartaToday,
                              });
                            }}
                            className="px-2 py-1 text-[11px] font-semibold bg-emerald-100 text-emerald-900 rounded"
                          >
                            Mark Paid
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditingDeal(deal)}
                          className="text-amber-600 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteSponsorship(deal.id)}
                          className="text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5 inline" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Weekly Reviews & Creator Capacity Config */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Weekly Reviews & Content Repurposing
                  </h3>
                  <p className="text-xs text-slate-500">
                    Log wins, evening time bottlenecks, and repurpose top-performing items into new formats
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setEditingReview({
                      id: `wrev-${Date.now()}`,
                      weekStartDate: workload.weekStartIso,
                      weekEndDate: workload.weekEndIso,
                      targetPosts: capacity.targetPostsPerWeek,
                      actualPublishedPosts: publications.filter(
                        (p) => p.status === 'Published'
                      ).length,
                      topPerformingContentId: contentItems[0]?.id,
                      winsSummary: '',
                      bottleneckSummary: '',
                      repurposePlan: '',
                      nextWeekPriority: '',
                    })
                  }
                  className="px-3 py-1.5 text-xs font-semibold bg-amber-100 text-amber-950 rounded-lg"
                >
                  + Review This Week
                </button>
              </div>

              <div className="space-y-3">
                {weeklyReviews.map((rev) => (
                  <div
                    key={rev.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between font-mono text-slate-500">
                      <span>
                        Week: {rev.weekStartDate} to {rev.weekEndDate}
                      </span>
                      <span className="font-bold text-emerald-600">
                        Published: {rev.actualPublishedPosts} / Target {rev.targetPosts}
                      </span>
                    </div>
                    <div>
                      <strong>Wins:</strong> {rev.winsSummary}
                    </div>
                    <div>
                      <strong>Bottlenecks:</strong> {rev.bottleneckSummary}
                    </div>
                    <div>
                      <strong>Repurpose Plan:</strong> {rev.repurposePlan}
                    </div>
                    <div>
                      <strong>Next Week Priority:</strong> {rev.nextWeekPriority}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Creator Capacity Config Form */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-orange-500" />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Creator Capacity & Office Hours Config (WIB)
                </h3>
              </div>
              <p className="text-xs text-slate-500">
                Designed for a solo creator working Monday–Friday in Jakarta. The system warns whenever a production session overlaps with weekday office hours.
              </p>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold mb-1">Office Start Time (WIB)</label>
                  <input
                    type="time"
                    value={capacity.weekdayOfficeStart}
                    onChange={(e) =>
                      onSaveCapacityConfig({
                        ...capacity,
                        weekdayOfficeStart: e.target.value,
                      })
                    }
                    className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Office End Time (WIB)</label>
                  <input
                    type="time"
                    value={capacity.weekdayOfficeEnd}
                    onChange={(e) =>
                      onSaveCapacityConfig({
                        ...capacity,
                        weekdayOfficeEnd: e.target.value,
                      })
                    }
                    className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Max Evening Hrs / Week</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={capacity.maxWeekdayEveningHoursPerWeek}
                    onChange={(e) =>
                      onSaveCapacityConfig({
                        ...capacity,
                        maxWeekdayEveningHoursPerWeek: Number(e.target.value) || 6,
                      })
                    }
                    className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Max Weekend Hrs / Week</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={capacity.maxWeekendHoursPerWeek}
                    onChange={(e) =>
                      onSaveCapacityConfig({
                        ...capacity,
                        maxWeekendHoursPerWeek: Number(e.target.value) || 8,
                      })
                    }
                    className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Target Posts / Week</label>
                  <input
                    type="number"
                    min={1}
                    max={14}
                    value={capacity.targetPostsPerWeek}
                    onChange={(e) =>
                      onSaveCapacityConfig({
                        ...capacity,
                        targetPostsPerWeek: Number(e.target.value) || 3,
                      })
                    }
                    className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Primary Device</label>
                  <input
                    type="text"
                    value={capacity.primaryCameraDevice}
                    onChange={(e) =>
                      onSaveCapacityConfig({
                        ...capacity,
                        primaryCameraDevice: e.target.value,
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: CONNECTED CONTENT WORKBENCH (ALL-IN-ONE CREATIVE ITEM)       */}
      {/* ===================================================================== */}
      {editingItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="content-workbench-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-4xl w-full p-6 space-y-5 shadow-xl my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-orange-600 dark:text-amber-400">
                  Connected Content Workbench · {editingItem.stage}
                </span>
                <h2
                  id="content-workbench-title"
                  className="text-base font-bold text-slate-900 dark:text-slate-100"
                >
                  {editingItem.title || 'New Creative Content'}
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMarkdownPreviewItem(editingItem)}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Export MD / Print
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const nextFmt: ContentFormat =
                      editingItem.format === 'short_video' ? 'carousel' : 'short_video';
                    const repurposed = repurposeContentItem(
                      editingItem,
                      nextFmt,
                      editingItem.pillar,
                      jakartaToday
                    );
                    onSaveContentItem(repurposed);
                    setEditingItem(repurposed);
                    setSyncBanner(
                      `Content repurposed into a new draft: "${repurposed.title}"`
                    );
                  }}
                  className="px-3 py-1.5 text-xs font-semibold bg-amber-100 hover:bg-amber-200 text-amber-950 rounded-lg"
                >
                  Repurpose Format
                </button>
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  aria-label="Close workbench"
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Core Metadata Row */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-semibold mb-1">Content Title *</label>
                <input
                  type="text"
                  value={editingItem.title}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, title: e.target.value })
                  }
                  placeholder="Title for short video, carousel, mini vlog, or short story..."
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Workflow Stage</label>
                <select
                  value={editingItem.stage}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      stage: e.target.value as ContentStage,
                    })
                  }
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  {CONTENT_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1">Target Publish Date (WIB)</label>
                <input
                  type="date"
                  value={editingItem.targetPublishDate}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      targetPublishDate: e.target.value,
                    })
                  }
                  className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Content Pillar</label>
                <select
                  value={editingItem.pillar}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      pillar: e.target.value as ContentPillar,
                    })
                  }
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  <option value="3d_marketing">3D Print Marketing</option>
                  <option value="personal">Personal / Story / Education</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1">Content Format</label>
                <select
                  value={editingItem.format}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      format: e.target.value as ContentFormat,
                    })
                  }
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  {CONTENT_FORMATS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1">Project</label>
                <select
                  value={editingItem.projectId}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, projectId: e.target.value })
                  }
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1">
                  Linked 3D Print Product (Optional)
                </label>
                <select
                  value={editingItem.linkedProductId || ''}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      linkedProductId: e.target.value || undefined,
                    })
                  }
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  <option value="">Not Linked to Any Product</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Workbench Section Switcher */}
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs">
              {[
                { id: 'brief', label: '1. Brief & Fact Checks' },
                { id: 'script', label: '2. Script / Slides / Story' },
                {
                  id: 'shots',
                  label: `3. iPhone Shot List (${editingItem.shots.length})`,
                },
                {
                  id: 'assets',
                  label: `4. Local File References (${editingItem.localAssets.length})`,
                },
                {
                  id: 'qc',
                  label: `5. QC Checklist (${editingItem.qcChecklist.length})`,
                },
                {
                  id: 'channels',
                  label: `6. Channels & Metrics (${
                    publications.filter((p) => p.contentItemId === editingItem.id).length
                  })`,
                },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setWorkbenchSection(tab.id as any)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                    workbenchSection === tab.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* SECTION 1: BRIEF & FACT CHECK REFERENCES */}
            {workbenchSection === 'brief' && (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-semibold mb-1">
                      Hook (First 3 Seconds / Story Opening)
                    </label>
                    <input
                      type="text"
                      value={editingItem.brief.hook}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          brief: { ...editingItem.brief, hook: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Key Message</label>
                    <textarea
                      rows={2}
                      value={editingItem.brief.keyMessage}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          brief: { ...editingItem.brief, keyMessage: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Call to Action (CTA)</label>
                    <textarea
                      rows={2}
                      value={editingItem.brief.callToAction}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          brief: { ...editingItem.brief, callToAction: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                </div>

                {/* References & Fact Checks */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">Research References & Fact Checks</span>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingItem({
                          ...editingItem,
                          references: [
                            ...editingItem.references,
                            {
                              id: `cref-${Date.now()}`,
                              title: 'New Reference',
                              factCheckNote: 'Fact / technical data verification note',
                              verified: true,
                            },
                          ],
                        })
                      }
                      className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded font-medium"
                    >
                      + Add Reference
                    </button>
                  </div>
                  {editingItem.references.map((ref, idx) => (
                    <div
                      key={ref.id}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg"
                    >
                      <input
                        type="text"
                        value={ref.title}
                        onChange={(e) => {
                          const next = [...editingItem.references];
                          next[idx] = { ...ref, title: e.target.value };
                          setEditingItem({ ...editingItem, references: next });
                        }}
                        placeholder="Source / research title"
                        className="sm:col-span-4 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded"
                      />
                      <input
                        type="text"
                        value={ref.factCheckNote}
                        onChange={(e) => {
                          const next = [...editingItem.references];
                          next[idx] = { ...ref, factCheckNote: e.target.value };
                          setEditingItem({ ...editingItem, references: next });
                        }}
                        placeholder="Verified fact-check note"
                        className="sm:col-span-6 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded"
                      />
                      <div className="sm:col-span-2 flex items-center justify-end gap-2">
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={ref.verified}
                            onChange={() => {
                              const next = [...editingItem.references];
                              next[idx] = { ...ref, verified: !ref.verified };
                              setEditingItem({ ...editingItem, references: next });
                            }}
                          />
                          <span>Verified</span>
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setEditingItem({
                              ...editingItem,
                              references: editingItem.references.filter(
                                (r) => r.id !== ref.id
                              ),
                            })
                          }
                          className="text-slate-400 hover:text-red-500"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SECTION 2: SCRIPT, SHORT STORY & CAROUSEL SLIDES */}
            {workbenchSection === 'script' && (
              <div className="space-y-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingItem.voiceOverEnabled}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          voiceOverEnabled: e.target.checked,
                        })
                      }
                    />
                    <span>Enable Voice-Over (VO)</span>
                  </label>
                  {editingItem.voiceOverEnabled && (
                    <input
                      type="text"
                      value={editingItem.voiceOverScriptOrNotes}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          voiceOverScriptOrNotes: e.target.value,
                        })
                      }
                      placeholder="Intonation / iPhone VO mic notes..."
                      className="flex-1 px-3 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  )}
                </div>

                <div>
                  <label className="block font-semibold mb-1">
                    {editingItem.format === 'cerpen'
                      ? 'Full Short Story / Narrative Text'
                      : 'Video Script / Voice-Over / Primary Narrative'}
                  </label>
                  <textarea
                    rows={6}
                    value={editingItem.scriptText}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, scriptText: e.target.value })
                    }
                    placeholder="Write full script or short story text here..."
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-sans leading-relaxed"
                  />
                </div>

                {/* Carousel Slides Builder */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">
                      Carousel Slides ({editingItem.carouselSlides.length} Slide(s))
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingItem({
                          ...editingItem,
                          carouselSlides: [
                            ...editingItem.carouselSlides,
                            {
                              id: `sld-${Date.now()}`,
                              slideNumber: editingItem.carouselSlides.length + 1,
                              headline: `Slide Headline #${editingItem.carouselSlides.length + 1}`,
                              bodyCopy: '',
                              visualPromptOrPhotoRef: '',
                            },
                          ],
                        })
                      }
                      className="px-2.5 py-1 bg-amber-100 text-amber-950 font-semibold rounded"
                    >
                      + Add Slide
                    </button>
                  </div>

                  {editingItem.carouselSlides.map((slide, idx) => (
                    <div
                      key={slide.id}
                      className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold">
                          Slide #{slide.slideNumber}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setEditingItem({
                              ...editingItem,
                              carouselSlides: editingItem.carouselSlides.filter(
                                (s) => s.id !== slide.id
                              ),
                            })
                          }
                          className="text-slate-400 hover:text-red-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={slide.headline}
                          onChange={(e) => {
                            const next = [...editingItem.carouselSlides];
                            next[idx] = { ...slide, headline: e.target.value };
                            setEditingItem({ ...editingItem, carouselSlides: next });
                          }}
                          placeholder="Slide headline"
                          className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded"
                        />
                        <input
                          type="text"
                          value={slide.visualPromptOrPhotoRef}
                          onChange={(e) => {
                            const next = [...editingItem.carouselSlides];
                            next[idx] = {
                              ...slide,
                              visualPromptOrPhotoRef: e.target.value,
                            };
                            setEditingItem({ ...editingItem, carouselSlides: next });
                          }}
                          placeholder="Visual / photo reference"
                          className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded"
                        />
                      </div>
                      <textarea
                        rows={2}
                        value={slide.bodyCopy}
                        onChange={(e) => {
                          const next = [...editingItem.carouselSlides];
                          next[idx] = { ...slide, bodyCopy: e.target.value };
                          setEditingItem({ ...editingItem, carouselSlides: next });
                        }}
                        placeholder="Slide body copy..."
                        className="w-full px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SECTION 3: SHOT LIST (iPhone) */}
            {workbenchSection === 'shots' && (
              <div className="space-y-3 text-xs">
                {editingItem.format === 'cerpen' && (
                  <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-200">
                    This item uses the <strong>Short Story / Text</strong> format, so camera shot lists are optional.
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="font-bold">
                    iPhone Camera Shot List ({editingItem.shots.length} Shot(s))
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingItem({
                        ...editingItem,
                        shots: [
                          ...editingItem.shots,
                          {
                            id: `shot-${Date.now()}`,
                            shotNumber: editingItem.shots.length + 1,
                            visualAngle: '',
                            audioOrAction: '',
                            durationSec: 6,
                            location: 'Evening Workshop Desk',
                            iphoneSetting: 'iPhone 15 Pro 1x 4K 60fps',
                            completed: false,
                          },
                        ],
                      })
                    }
                    className="px-2.5 py-1 bg-amber-100 text-amber-950 font-semibold rounded"
                  >
                    + Add Shot
                  </button>
                </div>

                {editingItem.shots.map((shot, idx) => (
                  <div
                    key={shot.id}
                    className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                  >
                    <label className="sm:col-span-1 flex items-center gap-1.5 font-mono font-bold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={shot.completed}
                        onChange={() => {
                          const next = [...editingItem.shots];
                          next[idx] = { ...shot, completed: !shot.completed };
                          setEditingItem({ ...editingItem, shots: next });
                        }}
                      />
                      <span>#{shot.shotNumber}</span>
                    </label>
                    <input
                      type="text"
                      value={shot.visualAngle}
                      onChange={(e) => {
                        const next = [...editingItem.shots];
                        next[idx] = { ...shot, visualAngle: e.target.value };
                        setEditingItem({ ...editingItem, shots: next });
                      }}
                      placeholder="Visual angle / camera framing"
                      className="sm:col-span-4 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded"
                    />
                    <input
                      type="text"
                      value={shot.audioOrAction}
                      onChange={(e) => {
                        const next = [...editingItem.shots];
                        next[idx] = { ...shot, audioOrAction: e.target.value };
                        setEditingItem({ ...editingItem, shots: next });
                      }}
                      placeholder="Action / dialogue / ASMR"
                      className="sm:col-span-3 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded"
                    />
                    <input
                      type="text"
                      value={shot.iphoneSetting}
                      onChange={(e) => {
                        const next = [...editingItem.shots];
                        next[idx] = { ...shot, iphoneSetting: e.target.value };
                        setEditingItem({ ...editingItem, shots: next });
                      }}
                      placeholder="iPhone lens & FPS"
                      className="sm:col-span-3 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded"
                    />
                    <div className="sm:col-span-1 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          setEditingItem({
                            ...editingItem,
                            shots: editingItem.shots.filter((s) => s.id !== shot.id),
                          })
                        }
                        className="text-slate-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5 inline" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* SECTION 4: LOCAL DEVICE ASSET REFERENCES (NO FAKE UPLOADS) */}
            {workbenchSection === 'assets' && (
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-slate-800 border border-amber-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                  <strong>Media Storage Honesty Note:</strong> This section stores <em>local filename & album references</em> on your iPhone or laptop (e.g., <code>IMG_8412.MOV</code> in the PrintOS Album). The app never uploads or syncs large video files to the cloud.
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-bold">
                    Local File & Edit Project References ({editingItem.localAssets.length})
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingItem({
                        ...editingItem,
                        localAssets: [
                          ...editingItem.localAssets,
                          {
                            id: `ast-${Date.now()}`,
                            fileName: 'IMG_0001.MOV',
                            devicePathOrAlbum: 'iPhone Album: PrintOS October',
                            assetType: 'iPhone Raw Video',
                            notes: '',
                          },
                        ],
                      })
                    }
                    className="px-2.5 py-1 bg-amber-100 text-amber-950 font-semibold rounded"
                  >
                    + Add Local File Reference
                  </button>
                </div>

                {editingItem.localAssets.map((ast, idx) => (
                  <div
                    key={ast.id}
                    className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                  >
                    <input
                      type="text"
                      value={ast.fileName}
                      onChange={(e) => {
                        const next = [...editingItem.localAssets];
                        next[idx] = { ...ast, fileName: e.target.value };
                        setEditingItem({ ...editingItem, localAssets: next });
                      }}
                      placeholder="Filename (e.g. IMG_8412.MOV)"
                      className="sm:col-span-3 px-2 py-1 font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded"
                    />
                    <input
                      type="text"
                      value={ast.devicePathOrAlbum}
                      onChange={(e) => {
                        const next = [...editingItem.localAssets];
                        next[idx] = { ...ast, devicePathOrAlbum: e.target.value };
                        setEditingItem({ ...editingItem, localAssets: next });
                      }}
                      placeholder="iPhone Album / Local Folder"
                      className="sm:col-span-4 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded"
                    />
                    <input
                      type="text"
                      value={ast.notes}
                      onChange={(e) => {
                        const next = [...editingItem.localAssets];
                        next[idx] = { ...ast, notes: e.target.value };
                        setEditingItem({ ...editingItem, localAssets: next });
                      }}
                      placeholder="Duration / color / CapCut notes"
                      className="sm:col-span-4 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded"
                    />
                    <div className="sm:col-span-1 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          setEditingItem({
                            ...editingItem,
                            localAssets: editingItem.localAssets.filter(
                              (a) => a.id !== ast.id
                            ),
                          })
                        }
                        className="text-slate-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5 inline" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* SECTION 5: QC CHECKLIST & NEXT ACTION */}
            {workbenchSection === 'qc' && (
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold">Pre-Publish Quality Control (QC) Checklist</span>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingItem({
                        ...editingItem,
                        qcChecklist: [
                          ...editingItem.qcChecklist,
                          {
                            id: `cqc-${Date.now()}`,
                            text: 'New QC inspection item',
                            completed: false,
                          },
                        ],
                      })
                    }
                    className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded font-medium"
                  >
                    + Add QC Item
                  </button>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg px-3">
                  {editingItem.qcChecklist.map((qc, idx) => (
                    <div
                      key={qc.id}
                      className="py-2 flex items-center justify-between gap-2"
                    >
                      <label className="flex items-center gap-2 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={qc.completed}
                          onChange={() => {
                            const next = [...editingItem.qcChecklist];
                            next[idx] = { ...qc, completed: !qc.completed };
                            setEditingItem({ ...editingItem, qcChecklist: next });
                          }}
                        />
                        <input
                          type="text"
                          value={qc.text}
                          onChange={(e) => {
                            const next = [...editingItem.qcChecklist];
                            next[idx] = { ...qc, text: e.target.value };
                            setEditingItem({ ...editingItem, qcChecklist: next });
                          }}
                          className="flex-1 bg-transparent focus:outline-none"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setEditingItem({
                            ...editingItem,
                            qcChecklist: editingItem.qcChecklist.filter(
                              (c) => c.id !== qc.id
                            ),
                          })
                        }
                        className="text-slate-400 hover:text-red-500"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block font-semibold mb-1">
                    Next Action
                  </label>
                  <input
                    type="text"
                    value={editingItem.nextAction}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, nextAction: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>
            )}

            {/* SECTION 6: INDEPENDENT CHANNEL PUBLICATIONS & METRICS SUMMARY */}
            {workbenchSection === 'channels' && (
              <div className="space-y-4 text-xs">
                {(() => {
                  const itemPubs = publications.filter(
                    (p) => p.contentItemId === editingItem.id
                  );
                  const winSummary = summarizeContentItemMetricsByWindow(
                    metricSnapshots,
                    editingItem.id
                  );

                  return (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                          <div className="font-bold text-slate-800 dark:text-slate-200">
                            Total 24-Hour Window Metrics ({winSummary.window24h.channelCount} Channel(s))
                          </div>
                          <div className="mt-1 font-mono">
                            Views: {formatMetricValue(winSummary.window24h.views)} · Likes:{' '}
                            {formatMetricValue(winSummary.window24h.likes)} · Saves:{' '}
                            {formatMetricValue(winSummary.window24h.saves)} · Product Clicks:{' '}
                            {formatMetricValue(winSummary.window24h.productClicks)}
                          </div>
                        </div>

                        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                          <div className="font-bold text-slate-800 dark:text-slate-200">
                            Total 7-Day Cumulative Metrics ({winSummary.window7d.channelCount} Channel(s) — Never Summed with 24h)
                          </div>
                          <div className="mt-1 font-mono">
                            Views: {formatMetricValue(winSummary.window7d.views)} · Likes:{' '}
                            {formatMetricValue(winSummary.window7d.likes)} · Saves:{' '}
                            {formatMetricValue(winSummary.window7d.saves)} · Product Clicks:{' '}
                            {formatMetricValue(winSummary.window7d.productClicks)}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {itemPubs.map((pub) => (
                          <div
                            key={pub.id}
                            className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2"
                          >
                            <div>
                              <span className="font-bold">[{pub.channel}]</span> Status:{' '}
                              <strong>{pub.status}</strong> · Schedule: {pub.scheduledDateJakarta}{' '}
                              {pub.scheduledTimeJakarta} WIB
                              {pub.actualPostUrl && (
                                <span className="block text-sky-600 font-mono">
                                  URL: {pub.actualPostUrl}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenMetricSnapshotModal(pub, '24h')}
                                className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded"
                              >
                                24h Metrics
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenMetricSnapshotModal(pub, '7d')}
                                className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded"
                              >
                                7d Metrics
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Workbench Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  onDeleteContentItem(editingItem.id);
                  setEditingItem(null);
                }}
                className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg"
              >
                Delete Content
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-1.5 text-xs font-medium text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!editingItem.title.trim()) return;
                    onSaveContentItem({
                      ...editingItem,
                      title: editingItem.title.trim(),
                      updatedAt: jakartaToday,
                    });
                    setEditingItem(null);
                  }}
                  className="px-5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg"
                >
                  Save Content Workbench
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: MARKDOWN & PRINT-FRIENDLY BRIEF EXPORT PREVIEW               */}
      {/* ===================================================================== */}
      {markdownPreviewItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="md-export-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full p-6 space-y-4 shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2
                id="md-export-title"
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                Ekspor Dokumen Brief & Produksi (Markdown / Siap Cetak)
              </h2>
              <button
                type="button"
                onClick={() => setMarkdownPreviewItem(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <pre className="flex-1 overflow-y-auto p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono whitespace-pre-wrap text-slate-800 dark:text-slate-200">
              {exportContentBriefMarkdown(markdownPreviewItem, {
                project: projects.find((p) => p.id === markdownPreviewItem.projectId),
                series: seriesList.find((s) => s.id === markdownPreviewItem.seriesId),
                product: products.find((p) => p.id === markdownPreviewItem.linkedProductId),
                publications,
                sessions: productionSessions,
                snapshots: metricSnapshots,
              })}
            </pre>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  const md = exportContentBriefMarkdown(markdownPreviewItem, {
                    project: projects.find((p) => p.id === markdownPreviewItem.projectId),
                    series: seriesList.find((s) => s.id === markdownPreviewItem.seriesId),
                    product: products.find((p) => p.id === markdownPreviewItem.linkedProductId),
                    publications,
                    sessions: productionSessions,
                    snapshots: metricSnapshots,
                  });
                  navigator.clipboard?.writeText(md);
                  setCopiedMarkdown(true);
                  setTimeout(() => setCopiedMarkdown(false), 2500);
                }}
                className="px-3.5 py-1.5 text-xs font-semibold bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                {copiedMarkdown ? 'Tersalin!' : 'Salin Markdown'}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3.5 py-1.5 text-xs font-semibold bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                Cetak Halaman (Print)
              </button>
              <button
                type="button"
                onClick={() => handleDownloadMarkdown(markdownPreviewItem)}
                className="px-4 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Unduh File .MD
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: MANUAL PUBLISHING CONFIRMATION                               */}
      {/* ===================================================================== */}
      {confirmingPub && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-pub-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h2
                id="confirm-pub-title"
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                Konfirmasi Manual Sudah Tayang ({confirmingPub.pub.channel})
              </h2>
              <button
                type="button"
                onClick={() => setConfirmingPub(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              PrintOS tidak memposting otomatis ke API sosial media. Setelah Anda mengunggah konten secara manual dari iPhone ke <strong>{confirmingPub.pub.channel}</strong>, catat waktu tayang aktual dan tautan postingannya di bawah ini:
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">
                  Waktu Tayang Aktual (Asia/Jakarta WIB)
                </label>
                <input
                  type="text"
                  value={confirmingPub.actualDateTimeWib}
                  onChange={(e) =>
                    setConfirmingPub({
                      ...confirmingPub,
                      actualDateTimeWib: e.target.value,
                    })
                  }
                  className="w-full px-3 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">
                  URL Postingan Aktual (TikTok / IG / YouTube / Threads)
                </label>
                <input
                  type="url"
                  value={confirmingPub.actualUrl}
                  onChange={(e) =>
                    setConfirmingPub({
                      ...confirmingPub,
                      actualUrl: e.target.value,
                    })
                  }
                  placeholder="https://www.tiktok.com/@username/video/..."
                  className="w-full px-3 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setConfirmingPub(null)}
                className="px-4 py-1.5 text-xs font-medium text-slate-600"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  onSavePublication({
                    ...confirmingPub.pub,
                    status: 'Published',
                    actualPublishedAtJakarta: confirmingPub.actualDateTimeWib.trim(),
                    actualPostUrl: confirmingPub.actualUrl.trim(),
                  });
                  onMoveContentStage(confirmingPub.pub.contentItemId, 'Published');
                  setConfirmingPub(null);
                }}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                Simpan Konfirmasi Tayang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 4: MANUAL METRIC SNAPSHOT EDITOR (NULL UNKNOWN VS ZERO)         */}
      {/* ===================================================================== */}
      {editingMetricModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="metric-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h2
                id="metric-modal-title"
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                Snapshot Metrik Manual ({editingMetricModal.pub.channel} — Jendela{' '}
                {editingMetricModal.window === '24h' ? '24 Jam' : '7 Hari Kumulatif'})
              </h2>
              <button
                type="button"
                onClick={() => setEditingMetricModal(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-lg bg-amber-50 dark:bg-slate-800 text-[11px] text-slate-700 dark:text-slate-300">
              <strong>Aturan Akurasi Data:</strong> Biarkan kolom <strong>kosong</strong> bila angka belum diketahui/tidak tersedia di aplikasi sosial media (disimpan sebagai <code>null / Belum diisi</code>). Ketik <strong>0</strong> hanya jika angkanya benar-benar nol. Angka 24 jam dan 7 hari bersifat kumulatif dan tidak pernah dijumlahkan bersama.
            </div>

            <form onSubmit={handleSaveMetricModalSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Views / Tayangan</label>
                  <input
                    type="number"
                    min={0}
                    value={editingMetricModal.views}
                    onChange={(e) =>
                      setEditingMetricModal({
                        ...editingMetricModal,
                        views: e.target.value,
                      })
                    }
                    placeholder="Kosong = belum diisi"
                    className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Likes / Suka</label>
                  <input
                    type="number"
                    min={0}
                    value={editingMetricModal.likes}
                    onChange={(e) =>
                      setEditingMetricModal({
                        ...editingMetricModal,
                        likes: e.target.value,
                      })
                    }
                    placeholder="Kosong = belum diisi"
                    className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Comments / Komentar</label>
                  <input
                    type="number"
                    min={0}
                    value={editingMetricModal.comments}
                    onChange={(e) =>
                      setEditingMetricModal({
                        ...editingMetricModal,
                        comments: e.target.value,
                      })
                    }
                    placeholder="Kosong = belum diisi"
                    className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Shares / Bagikan</label>
                  <input
                    type="number"
                    min={0}
                    value={editingMetricModal.shares}
                    onChange={(e) =>
                      setEditingMetricModal({
                        ...editingMetricModal,
                        shares: e.target.value,
                      })
                    }
                    placeholder="Kosong = belum diisi"
                    className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Saves / Simpan</label>
                  <input
                    type="number"
                    min={0}
                    value={editingMetricModal.saves}
                    onChange={(e) =>
                      setEditingMetricModal({
                        ...editingMetricModal,
                        saves: e.target.value,
                      })
                    }
                    placeholder="Kosong = belum diisi"
                    className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Klik Produk / Bio</label>
                  <input
                    type="number"
                    min={0}
                    value={editingMetricModal.productClicks}
                    onChange={(e) =>
                      setEditingMetricModal({
                        ...editingMetricModal,
                        productClicks: e.target.value,
                      })
                    }
                    placeholder="Kosong = belum diisi"
                    className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Rata-rata Tonton (detik)</label>
                  <input
                    type="number"
                    min={0}
                    value={editingMetricModal.watchTimeSeconds}
                    onChange={(e) =>
                      setEditingMetricModal({
                        ...editingMetricModal,
                        watchTimeSeconds: e.target.value,
                      })
                    }
                    placeholder="Kosong = belum diisi"
                    className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Completion Rate (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={editingMetricModal.completionRatePercent}
                    onChange={(e) =>
                      setEditingMetricModal({
                        ...editingMetricModal,
                        completionRatePercent: e.target.value,
                      })
                    }
                    placeholder="Kosong = belum diisi"
                    className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Kunjungan Profil</label>
                  <input
                    type="number"
                    min={0}
                    value={editingMetricModal.profileVisits}
                    onChange={(e) =>
                      setEditingMetricModal({
                        ...editingMetricModal,
                        profileVisits: e.target.value,
                      })
                    }
                    placeholder="Kosong = belum diisi"
                    className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Catatan Kualitatif / Komentar Audiens</label>
                <textarea
                  rows={2}
                  value={editingMetricModal.qualitativeNotes}
                  onChange={(e) =>
                    setEditingMetricModal({
                      ...editingMetricModal,
                      qualitativeNotes: e.target.value,
                    })
                  }
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingMetricModal(null)}
                  className="px-4 py-1.5 text-xs font-medium text-slate-600"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg"
                >
                  Simpan Snapshot {editingMetricModal.window}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 5: CHANNEL PUBLICATION EDITOR                                   */}
      {/* ===================================================================== */}
      {editingPub && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pub-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h2
                id="pub-modal-title"
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                Jadwal & Caption Publikasi Channel
              </h2>
              <button
                type="button"
                onClick={() => setEditingPub(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSavePublication(editingPub);
                setEditingPub(null);
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block font-semibold mb-1">Item Konten</label>
                <select
                  value={editingPub.contentItemId}
                  onChange={(e) =>
                    setEditingPub({ ...editingPub, contentItemId: e.target.value })
                  }
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  {contentItems.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Channel Platform</label>
                  <select
                    value={editingPub.channel}
                    onChange={(e) =>
                      setEditingPub({
                        ...editingPub,
                        channel: e.target.value as ChannelPlatform,
                      })
                    }
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    {CHANNEL_PLATFORMS.map((ch) => (
                      <option key={ch} value={ch}>
                        {ch}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1">Status Publikasi</label>
                  <select
                    value={editingPub.status}
                    onChange={(e) =>
                      setEditingPub({
                        ...editingPub,
                        status: e.target.value as PublicationStatus,
                      })
                    }
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    {PUBLICATION_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Tanggal Jadwal (WIB)</label>
                  <input
                    type="date"
                    value={editingPub.scheduledDateJakarta}
                    onChange={(e) =>
                      setEditingPub({
                        ...editingPub,
                        scheduledDateJakarta: e.target.value,
                      })
                    }
                    className="w-full px-3 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Jam Jadwal (WIB)</label>
                  <input
                    type="time"
                    value={editingPub.scheduledTimeJakarta}
                    onChange={(e) =>
                      setEditingPub({
                        ...editingPub,
                        scheduledTimeJakarta: e.target.value,
                      })
                    }
                    className="w-full px-3 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Caption Spesifik Channel</label>
                <textarea
                  rows={3}
                  value={editingPub.caption}
                  onChange={(e) =>
                    setEditingPub({ ...editingPub, caption: e.target.value })
                  }
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Hashtags</label>
                <input
                  type="text"
                  value={editingPub.hashtags}
                  onChange={(e) =>
                    setEditingPub({ ...editingPub, hashtags: e.target.value })
                  }
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingPub(null)}
                  className="px-4 py-1.5 text-xs font-medium text-slate-600"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg"
                >
                  Simpan Jadwal Channel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 6: PRODUCTION SESSION MODAL                                     */}
      {/* ===================================================================== */}
      {editingSession && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="session-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h2
                id="session-modal-title"
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                Jadwalkan Sesi Produksi Konten (WIB)
              </h2>
              <button
                type="button"
                onClick={() => setEditingSession(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!editingSession.title.trim()) return;
                onSaveProductionSession({
                  ...editingSession,
                  title: editingSession.title.trim(),
                });
                setEditingSession(null);
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block font-semibold mb-1">Nama Sesi Produksi *</label>
                <input
                  type="text"
                  required
                  value={editingSession.title}
                  onChange={(e) =>
                    setEditingSession({ ...editingSession, title: e.target.value })
                  }
                  placeholder="Contoh: Batch Syuting 2 Video Malam Hari di Workshop"
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-semibold mb-1">Tanggal (WIB)</label>
                  <input
                    type="date"
                    value={editingSession.date}
                    onChange={(e) =>
                      setEditingSession({ ...editingSession, date: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Mulai (WIB)</label>
                  <input
                    type="time"
                    value={editingSession.startTimeWib}
                    onChange={(e) =>
                      setEditingSession({
                        ...editingSession,
                        startTimeWib: e.target.value,
                      })
                    }
                    className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Selesai (WIB)</label>
                  <input
                    type="time"
                    value={editingSession.endTimeWib}
                    onChange={(e) =>
                      setEditingSession({
                        ...editingSession,
                        endTimeWib: e.target.value,
                      })
                    }
                    className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Jenis Aktivitas</label>
                  <select
                    value={editingSession.activityType}
                    onChange={(e) =>
                      setEditingSession({
                        ...editingSession,
                        activityType: e.target.value as SessionActivityType,
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="Shooting iPhone">Shooting iPhone</option>
                    <option value="Voice-Over & Audio">Voice-Over & Audio</option>
                    <option value="Editing CapCut/VN">Editing CapCut/VN</option>
                    <option value="Penulisan Naskah/Cerpen">Penulisan Naskah/Cerpen</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">
                    Total Durasi Sesi Bersama (Menit)
                  </label>
                  <input
                    type="number"
                    min={15}
                    step={15}
                    value={editingSession.durationMinutes}
                    onChange={(e) =>
                      setEditingSession({
                        ...editingSession,
                        durationMinutes: Number(e.target.value) || 60,
                      })
                    }
                    className="w-full px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">
                  Konten yang Diproduksi dalam Sesi Ini (Usaha dihitung 1x walau pilih beberapa konten)
                </label>
                <div className="max-h-32 overflow-y-auto p-2 border border-slate-200 dark:border-slate-700 rounded-lg space-y-1">
                  {contentItems.map((c) => {
                    const checked = editingSession.contentItemIds.includes(c.id);
                    return (
                      <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const nextIds = checked
                              ? editingSession.contentItemIds.filter((id) => id !== c.id)
                              : [...editingSession.contentItemIds, c.id];
                            setEditingSession({
                              ...editingSession,
                              contentItemIds: nextIds,
                            });
                          }}
                        />
                        <span className="truncate">{c.title}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    onDeleteProductionSession(editingSession.id);
                    setEditingSession(null);
                  }}
                  className="text-red-600 font-medium"
                >
                  Hapus Sesi
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingSession(null)}
                    className="px-4 py-1.5 text-slate-600"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 font-semibold bg-amber-500 text-slate-950 rounded-lg"
                  >
                    Simpan Sesi
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 7: SPONSORSHIP DEAL MODAL                                       */}
      {/* ===================================================================== */}
      {editingDeal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="spon-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h2
              id="spon-modal-title"
              className="text-base font-bold text-slate-900 dark:text-slate-100"
            >
              Data Sponsor & Biaya Produksi Konten (Rp)
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!editingDeal.brandName.trim() || !editingDeal.title.trim()) return;
                onSaveSponsorship(editingDeal);
                setEditingDeal(null);
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block font-semibold mb-1">Nama Brand / Klien *</label>
                <input
                  type="text"
                  required
                  value={editingDeal.brandName}
                  onChange={(e) =>
                    setEditingDeal({ ...editingDeal, brandName: e.target.value })
                  }
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Judul Kampanye / Deliverables *</label>
                <input
                  type="text"
                  required
                  value={editingDeal.title}
                  onChange={(e) =>
                    setEditingDeal({ ...editingDeal, title: e.target.value })
                  }
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Nilai Sponsor (Rp)</label>
                  <input
                    type="number"
                    step={50000}
                    value={editingDeal.agreedAmountRp}
                    onChange={(e) =>
                      setEditingDeal({
                        ...editingDeal,
                        agreedAmountRp: Number(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Biaya Produksi (Rp)</label>
                  <input
                    type="number"
                    step={10000}
                    value={editingDeal.productionExpenseRp}
                    onChange={(e) =>
                      setEditingDeal({
                        ...editingDeal,
                        productionExpenseRp: Number(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Status Pembayaran</label>
                  <select
                    value={editingDeal.status}
                    onChange={(e) =>
                      setEditingDeal({
                        ...editingDeal,
                        status: e.target.value as SponsorshipStatus,
                      })
                    }
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="Negosiasi">Negosiasi</option>
                    <option value="Dijanjikan / Invoice">Dijanjikan / Invoice (Belum Cair)</option>
                    <option value="Diterima / Cair">Diterima / Cair (Masuk Kas)</option>
                    <option value="Dibatalkan">Dibatalkan</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Tanggal Janji / Cair</label>
                  <input
                    type="date"
                    value={editingDeal.promisedDate}
                    onChange={(e) =>
                      setEditingDeal({
                        ...editingDeal,
                        promisedDate: e.target.value,
                      })
                    }
                    className="w-full px-3 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingDeal(null)}
                  className="px-4 py-1.5 text-slate-600"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-semibold bg-amber-500 text-slate-950 rounded-lg"
                >
                  Simpan Sponsor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 8: WEEKLY REVIEW MODAL                                          */}
      {/* ===================================================================== */}
      {editingReview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h2
              id="review-modal-title"
              className="text-base font-bold text-slate-900 dark:text-slate-100"
            >
              Catat Evaluasi Mingguan Kreator
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSaveWeeklyReview(editingReview);
                setEditingReview(null);
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block font-semibold mb-1">Kemenangan Minggu Ini (Wins)</label>
                <textarea
                  rows={2}
                  required
                  value={editingReview.winsSummary}
                  onChange={(e) =>
                    setEditingReview({ ...editingReview, winsSummary: e.target.value })
                  }
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Kendala Waktu / Produksi</label>
                <textarea
                  rows={2}
                  value={editingReview.bottleneckSummary}
                  onChange={(e) =>
                    setEditingReview({
                      ...editingReview,
                      bottleneckSummary: e.target.value,
                    })
                  }
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Rencana Repurpose & Fokus Minggu Depan</label>
                <textarea
                  rows={2}
                  value={editingReview.nextWeekPriority}
                  onChange={(e) =>
                    setEditingReview({
                      ...editingReview,
                      nextWeekPriority: e.target.value,
                      repurposePlan: e.target.value,
                    })
                  }
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingReview(null)}
                  className="px-4 py-1.5 text-slate-600"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-semibold bg-amber-500 text-slate-950 rounded-lg"
                >
                  Simpan Evaluasi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Project & Series Quick Modals */}
      {editingProjectModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-3 text-xs">
            <h3 className="text-sm font-bold">Tambah Proyek Konten</h3>
            <input
              type="text"
              placeholder="Nama Proyek"
              value={editingProjectModal.name}
              onChange={(e) =>
                setEditingProjectModal({ ...editingProjectModal, name: e.target.value })
              }
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
            />
            <select
              value={editingProjectModal.pillar}
              onChange={(e) =>
                setEditingProjectModal({
                  ...editingProjectModal,
                  pillar: e.target.value as ContentPillar,
                })
              }
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
            >
              <option value="3d_marketing">Pemasaran 3D Print</option>
              <option value="personal">Personal / Cerita / Edukasi</option>
            </select>
            <input
              type="text"
              placeholder="Sudut pandang utama (Core Angle)"
              value={editingProjectModal.coreAngle}
              onChange={(e) =>
                setEditingProjectModal({
                  ...editingProjectModal,
                  coreAngle: e.target.value,
                })
              }
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingProjectModal(null)}
                className="px-3 py-1.5"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!editingProjectModal.name.trim()) return;
                  onSaveProject(editingProjectModal);
                  setEditingProjectModal(null);
                }}
                className="px-4 py-1.5 bg-amber-500 text-slate-950 font-semibold rounded-lg"
              >
                Simpan Proyek
              </button>
            </div>
          </div>
        </div>
      )}

      {editingSeriesModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-3 text-xs">
            <h3 className="text-sm font-bold">Tambah Seri Konten</h3>
            <input
              type="text"
              placeholder="Nama Seri"
              value={editingSeriesModal.name}
              onChange={(e) =>
                setEditingSeriesModal({ ...editingSeriesModal, name: e.target.value })
              }
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
            />
            <input
              type="text"
              placeholder="Jadwal / Cadence (mis. 2x Seminggu Malam)"
              value={editingSeriesModal.cadenceLabel}
              onChange={(e) =>
                setEditingSeriesModal({
                  ...editingSeriesModal,
                  cadenceLabel: e.target.value,
                })
              }
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingSeriesModal(null)}
                className="px-3 py-1.5"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!editingSeriesModal.name.trim()) return;
                  onSaveSeries(editingSeriesModal);
                  setEditingSeriesModal(null);
                }}
                className="px-4 py-1.5 bg-amber-500 text-slate-950 font-semibold rounded-lg"
              >
                Simpan Seri
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
