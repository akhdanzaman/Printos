import React, { useState } from 'react';
import {
  ChecklistItem,
  PriorityLevel,
  Product,
  TASK_STAGES,
  TaskItem,
  TaskStage,
} from '../types/printos';
import {
  calculateTaskTimelineMetrics,
  computeGanttRangePercent,
  diffDaysISO,
  formatDuration,
  GanttTimeScale,
  getChecklistProgress,
} from '../utils/calculations';
import {
  ArrowLeft,
  ArrowRight,
  BarChartHorizontal,
  Calendar,
  Clock,
  FolderKanban,
  List,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

interface TasksCalendarBoardProps {
  tasks: TaskItem[];
  products: Product[];
  globalSearch: string;
  openNewTaskModalTrigger: boolean;
  onClearNewTaskTrigger: () => void;
  onSaveTask: (task: TaskItem) => void;
  onDeleteTask: (taskId: string) => void;
  onMoveTaskStage: (taskId: string, stage: TaskStage) => void;
}

const REFERENCE_TODAY = '2026-10-23';

interface GanttColumnBucket {
  id: string;
  topLabel: string;
  mainLabel: string;
  subLabel?: string;
  startIso: string;
  endIso: string;
  weightDays: number;
  isCurrent: boolean;
}

export const TasksCalendarBoard: React.FC<TasksCalendarBoardProps> = ({
  tasks,
  products,
  globalSearch,
  openNewTaskModalTrigger,
  onClearNewTaskTrigger,
  onSaveTask,
  onDeleteTask,
  onMoveTaskStage,
}) => {
  // Default view is Gantt Chart (most left tab)
  const [viewMode, setViewMode] = useState<'gantt' | 'board' | 'list' | 'calendar'>('gantt');
  const [ganttScale, setGanttScale] = useState<GanttTimeScale>('daily');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<TaskStage | null>(null);

  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [newStepText, setNewStepText] = useState('');
  const [formError, setFormError] = useState('');
  const [calendarOffsetDays, setCalendarOffsetDays] = useState<number>(0);

  React.useEffect(() => {
    if (openNewTaskModalTrigger) {
      handleOpenNewTask('Today');
      onClearNewTaskTrigger();
    }
  }, [openNewTaskModalTrigger]);

  const handleOpenNewTask = (
    defaultStage: TaskStage = 'Today',
    defaultStartDate = REFERENCE_TODAY,
    defaultDueDate = '2026-10-25'
  ) => {
    const isStarted =
      defaultStage === 'In Progress' ||
      defaultStage === 'Review' ||
      defaultStage === 'Completed';
    const isCompleted = defaultStage === 'Completed';

    setEditingTask({
      id: `tsk-${Date.now()}`,
      title: '',
      stage: defaultStage,
      priority: 'High',
      plannedStartDate: defaultStartDate,
      dueDate:
        diffDaysISO(defaultStartDate, defaultDueDate) >= 0
          ? defaultDueDate
          : defaultStartDate,
      actualStartDate: isStarted ? defaultStartDate : '',
      actualEndDate: isCompleted ? defaultDueDate : '',
      linkedProductId: products[0]?.id || '',
      category: 'Production',
      estimatedMinutes: 45,
      checklist: [
        { id: `tc-${Date.now()}-1`, text: 'Prepare build plate & filament', completed: false },
      ],
      notes: '',
    });
    setFormError('');
  };

  const filteredTasks = tasks.filter((t) => {
    if (priorityFilter !== 'All' && t.priority !== priorityFilter) return false;
    if (categoryFilter !== 'All' && t.category !== categoryFilter) return false;
    if (globalSearch.trim()) {
      const q = globalSearch.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        t.notes.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Sort tasks chronologically by planned start date for the Gantt chart
  const ganttSortedTasks = [...filteredTasks].sort((a, b) => {
    const startA = a.plannedStartDate || a.dueDate;
    const startB = b.plannedStartDate || b.dueDate;
    const cmp = startA.localeCompare(startB);
    if (cmp !== 0) return cmp;
    return a.dueDate.localeCompare(b.dueDate);
  });

  // Navigable 14-day schedule window around October 2026 for Daily Gantt & Calendar View
  const baseCalendarStartMs = Date.parse('2026-10-19T00:00:00Z');
  const calendarDays = Array.from({ length: 14 }, (_, idx) => {
    const dt = new Date(baseCalendarStartMs + (calendarOffsetDays + idx) * 86_400_000);
    return dt.toISOString().slice(0, 10);
  });

  // Build column buckets based on active Gantt Time Scale (Daily / Weekly / Monthly)
  const ganttBuckets: GanttColumnBucket[] = React.useMemo(() => {
    if (ganttScale === 'daily') {
      return calendarDays.map((iso) => {
        const dt = new Date(`${iso}T00:00:00Z`);
        const weekday = dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
        const dayNum = iso.slice(8, 10);
        const monthShort = iso.slice(5, 7) === '11' ? 'Nov' : 'Oct';
        const isCurrent = iso === REFERENCE_TODAY;
        return {
          id: iso,
          topLabel: weekday,
          mainLabel: `${monthShort} ${dayNum}`,
          subLabel: isCurrent ? 'Today' : undefined,
          startIso: iso,
          endIso: iso,
          weightDays: 1,
          isCurrent,
        };
      });
    }

    if (ganttScale === 'weekly') {
      const weeks = [
        { id: 'w1', top: 'Week 41', label: 'Oct 05 – Oct 11', start: '2026-10-05', end: '2026-10-11' },
        { id: 'w2', top: 'Week 42', label: 'Oct 12 – Oct 18', start: '2026-10-12', end: '2026-10-18' },
        { id: 'w3', top: 'Week 43', label: 'Oct 19 – Oct 25', start: '2026-10-19', end: '2026-10-25' },
        { id: 'w4', top: 'Week 44', label: 'Oct 26 – Nov 01', start: '2026-10-26', end: '2026-11-01' },
        { id: 'w5', top: 'Week 45', label: 'Nov 02 – Nov 08', start: '2026-11-02', end: '2026-11-08' },
        { id: 'w6', top: 'Week 46', label: 'Nov 09 – Nov 15', start: '2026-11-09', end: '2026-11-15' },
      ];
      return weeks.map((w) => {
        const isCurrent =
          diffDaysISO(w.start, REFERENCE_TODAY) >= 0 &&
          diffDaysISO(REFERENCE_TODAY, w.end) >= 0;
        return {
          id: w.id,
          topLabel: w.top,
          mainLabel: w.label,
          subLabel: isCurrent ? 'Current Week' : undefined,
          startIso: w.start,
          endIso: w.end,
          weightDays: 7,
          isCurrent,
        };
      });
    }

    // Monthly scale
    const months = [
      { id: 'm-sep', top: 'Q3 2026', label: 'September 2026', start: '2026-09-01', end: '2026-09-30', days: 30 },
      { id: 'm-oct', top: 'Q4 2026', label: 'October 2026', start: '2026-10-01', end: '2026-10-31', days: 31 },
      { id: 'm-nov', top: 'Q4 2026', label: 'November 2026', start: '2026-11-01', end: '2026-11-30', days: 30 },
      { id: 'm-dec', top: 'Q4 2026', label: 'December 2026', start: '2026-12-01', end: '2026-12-31', days: 31 },
    ];
    return months.map((m) => {
      const isCurrent = m.id === 'm-oct';
      return {
        id: m.id,
        topLabel: m.top,
        mainLabel: m.label,
        subLabel: isCurrent ? 'Current Month' : `${m.days} days`,
        startIso: m.start,
        endIso: m.end,
        weightDays: m.days,
        isCurrent,
      };
    });
  }, [ganttScale]);

  const ganttWindowStart = ganttBuckets[0].startIso;
  const ganttWindowEnd = ganttBuckets[ganttBuckets.length - 1].endIso;
  const ganttGridTemplateColumns = ganttBuckets.map((b) => `${b.weightDays}fr`).join(' ');

  const formatShortDate = (iso?: string) => {
    if (!iso || !iso.trim()) return '—';
    const monthNames: Record<string, string> = {
      '09': 'Sep',
      '10': 'Oct',
      '11': 'Nov',
      '12': 'Dec',
    };
    const month = monthNames[iso.slice(5, 7)] || iso.slice(5, 7);
    const day = iso.slice(8, 10);
    return `${month} ${day}`;
  };

  const handleSaveTaskModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;
    if (!editingTask.title.trim()) {
      setFormError('Task title is required.');
      return;
    }
    const pStart = editingTask.plannedStartDate || editingTask.dueDate;
    const pEnd = editingTask.dueDate || pStart;
    if (diffDaysISO(pStart, pEnd) < 0) {
      setFormError('Planned Due Date cannot be earlier than Planned Start Date.');
      return;
    }
    if (
      editingTask.actualStartDate &&
      editingTask.actualEndDate &&
      diffDaysISO(editingTask.actualStartDate, editingTask.actualEndDate) < 0
    ) {
      setFormError('Actual Finished Date cannot be earlier than Actual Start Date.');
      return;
    }

    onSaveTask({
      ...editingTask,
      title: editingTask.title.trim(),
      plannedStartDate: pStart,
      dueDate: pEnd,
    });
    setEditingTask(null);
  };

  const handleAddChecklistStep = () => {
    if (!editingTask || !newStepText.trim()) return;
    const item: ChecklistItem = {
      id: `tc-${Date.now()}`,
      text: newStepText.trim(),
      completed: false,
    };
    setEditingTask({
      ...editingTask,
      checklist: [...editingTask.checklist, item],
    });
    setNewStepText('');
  };

  // Summary counts for Gantt header
  const timelineMetricsList = ganttSortedTasks.map((t) =>
    calculateTaskTimelineMetrics(t, REFERENCE_TODAY)
  );
  const completedCount = timelineMetricsList.filter((m) =>
    m.status.startsWith('completed_')
  ).length;
  const activeCount = timelineMetricsList.filter(
    (m) => m.status === 'in_progress_on_track'
  ).length;
  const delayedCount = timelineMetricsList.filter(
    (m) => m.status === 'completed_late' || m.status === 'in_progress_delayed'
  ).length;

  return (
    <div className="space-y-5 pb-10">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          {/* Gantt (Default Leftmost) / Board / List / Calendar View Switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('gantt')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                viewMode === 'gantt'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <BarChartHorizontal className="w-3.5 h-3.5" />
              Gantt Chart
            </button>
            <button
              type="button"
              onClick={() => setViewMode('board')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                viewMode === 'board'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <FolderKanban className="w-3.5 h-3.5" />
              Task Board
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Checklist Table
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                viewMode === 'calendar'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Calendar Schedule
            </button>
          </div>

          <select
            aria-label="Filter tasks by priority"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200"
          >
            <option value="All">All Priorities</option>
            <option value="Urgent">Urgent</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          <select
            aria-label="Filter tasks by category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200"
          >
            <option value="All">All Categories</option>
            <option value="Production">Production</option>
            <option value="Modeling">Modeling</option>
            <option value="Maintenance">Maintenance</option>
            <option value="Marketing">Marketing</option>
            <option value="Content">Content Studio</option>
            <option value="R&D">R&D</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => handleOpenNewTask('Today')}
          className="px-3.5 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Task
        </button>
      </div>

      {/* Gantt Chart View (Default Leftmost View) */}
      {viewMode === 'gantt' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {/* Gantt Top Summary, Time Scale Switcher (Daily / Weekly / Monthly) & Legend Bar */}
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 bg-slate-50/60 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Planned vs. Actual Production Gantt Timeline
                  </h3>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-amber-100/90 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 tabular-nums">
                    Today: Oct 23, 2026
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Top bar: <strong>Planned Schedule</strong> (Planned Start → Planned Due). Bottom bar: <strong>Actual Execution</strong> (Actual Start → Actual Finished).
                </p>
              </div>

              {/* Daily / Weekly / Monthly Scale Switcher */}
              <div
                role="group"
                aria-label="Gantt chart time scale"
                className="flex items-center gap-1 p-1 bg-slate-200/75 dark:bg-slate-800 rounded-lg"
              >
                {(['daily', 'weekly', 'monthly'] as GanttTimeScale[]).map((scale) => (
                  <button
                    key={scale}
                    type="button"
                    onClick={() => setGanttScale(scale)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md capitalize transition-colors cursor-pointer ${
                      ganttScale === scale
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {scale}
                  </button>
                ))}
              </div>
            </div>

            {/* Legend & Schedule Metrics */}
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-2.5 rounded-xs bg-amber-200 dark:bg-amber-500/40 border border-amber-400 dark:border-amber-400 inline-block" />
                <span className="text-slate-600 dark:text-slate-300 font-medium">
                  Planned Timeline
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-2.5 rounded-xs bg-emerald-500 inline-block" />
                <span className="text-slate-600 dark:text-slate-300 font-medium">
                  Actual Completed ({completedCount})
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-2.5 rounded-xs bg-sky-500 inline-block" />
                <span className="text-slate-600 dark:text-slate-300 font-medium">
                  Actual In Progress ({activeCount})
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-2.5 rounded-xs bg-rose-500 inline-block" />
                <span className="text-slate-600 dark:text-slate-300 font-medium">
                  Delayed / Overdue ({delayedCount})
                </span>
              </div>
            </div>
          </div>

          {/* Scrollable Gantt Matrix */}
          <div className="overflow-x-auto">
            <div className="min-w-[980px]">
              {/* Column Headers */}
              <div className="grid grid-cols-[260px_1fr] border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <div className="px-4 py-3 border-r border-slate-200 dark:border-slate-800 flex items-center">
                  <span>Task</span>
                </div>
                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: ganttGridTemplateColumns,
                  }}
                >
                  {ganttBuckets.map((bucket) => (
                    <div
                      key={bucket.id}
                      className={`py-2.5 px-1.5 text-center border-r last:border-r-0 border-slate-200/70 dark:border-slate-800/80 ${
                        bucket.isCurrent
                          ? 'bg-amber-100/70 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 font-bold'
                          : ''
                      }`}
                    >
                      <div className="text-[10px] uppercase tracking-wider opacity-75">
                        {bucket.topLabel}
                      </div>
                      <div className="text-xs font-mono tabular-nums mt-0.5">
                        {bucket.mainLabel}
                      </div>
                      {bucket.subLabel && (
                        <div
                          className={`text-[9px] font-extrabold uppercase tracking-wider mt-0.5 ${
                            bucket.isCurrent
                              ? 'text-orange-600 dark:text-amber-400'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          {bucket.subLabel}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Task Rows: Leftmost column shows ONLY the task title */}
              <div className="divide-y divide-slate-200/80 dark:divide-slate-800">
                {ganttSortedTasks.map((task) => {
                  const metrics = calculateTaskTimelineMetrics(task, REFERENCE_TODAY);
                  const plannedPos = computeGanttRangePercent(
                    metrics.plannedStart,
                    metrics.plannedEnd,
                    ganttWindowStart,
                    ganttWindowEnd
                  );
                  const hasActualBar = metrics.actualStart.length > 0;
                  const actualPos = hasActualBar
                    ? computeGanttRangePercent(
                        metrics.actualStart,
                        metrics.effectiveActualEnd,
                        ganttWindowStart,
                        ganttWindowEnd
                      )
                    : { visible: false, leftPercent: 0, widthPercent: 0, spanDays: 0 };

                  const isDelayed =
                    metrics.status === 'completed_late' ||
                    metrics.status === 'in_progress_delayed';
                  const isCompleted =
                    task.stage === 'Completed' || Boolean(task.actualEndDate?.trim());

                  const minVisualWidth =
                    ganttScale === 'monthly' ? 9 : ganttScale === 'weekly' ? 7 : 0;

                  const plannedWidth = Math.min(
                    100 - plannedPos.leftPercent,
                    Math.max(plannedPos.widthPercent, minVisualWidth)
                  );
                  const actualWidth = Math.min(
                    100 - actualPos.leftPercent,
                    Math.max(actualPos.widthPercent, minVisualWidth)
                  );

                  return (
                    <div
                      key={task.id}
                      className="grid grid-cols-[260px_1fr] hover:bg-amber-50/25 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      {/* Leftmost Column: ONLY Task Title */}
                      <div className="px-4 py-3.5 border-r border-slate-200 dark:border-slate-800 flex items-center">
                        <button
                          type="button"
                          onClick={() => setEditingTask(task)}
                          className="text-xs font-semibold text-slate-900 dark:text-slate-100 hover:text-orange-600 dark:hover:text-amber-400 text-left leading-snug line-clamp-2"
                        >
                          {task.title}
                        </button>
                      </div>

                      {/* Right Column: Dual-Track Timeline Grid (Planned Bar on Top, Actual Bar on Bottom) */}
                      <div className="relative py-2.5 px-0 flex flex-col justify-center gap-1.5">
                        {/* Background Bucket Grid Lines */}
                        <div
                          className="absolute inset-0 grid pointer-events-none"
                          style={{
                            gridTemplateColumns: ganttGridTemplateColumns,
                          }}
                        >
                          {ganttBuckets.map((bucket) => (
                            <div
                              key={bucket.id}
                              className={`border-r last:border-r-0 border-slate-100 dark:border-slate-800/70 h-full ${
                                bucket.isCurrent
                                  ? 'bg-amber-50/35 dark:bg-amber-950/15 border-r-orange-200 dark:border-r-amber-800/50'
                                  : ''
                              }`}
                            />
                          ))}
                        </div>

                        {/* Track 1: Planned Timeline Bar */}
                        <div className="relative z-10 h-6 w-full">
                          {plannedPos.visible && (
                            <button
                              type="button"
                              onClick={() => setEditingTask(task)}
                              style={{
                                left: `${plannedPos.leftPercent}%`,
                                width: `${plannedWidth}%`,
                              }}
                              title={`Planned: ${metrics.plannedStart} to ${metrics.plannedEnd} (${metrics.plannedDurationDays} days)`}
                              className="absolute top-0.5 h-5 rounded-md bg-amber-100 dark:bg-amber-500/25 border border-amber-400 dark:border-amber-400/70 px-2 flex items-center justify-between text-[10px] font-semibold text-amber-950 dark:text-amber-200 hover:brightness-95 transition-all overflow-hidden whitespace-nowrap"
                            >
                              <span className="truncate">
                                Plan: {formatShortDate(metrics.plannedStart)} –{' '}
                                {formatShortDate(metrics.plannedEnd)}
                              </span>
                              <span className="font-mono tabular-nums ml-1.5 opacity-80">
                                {metrics.plannedDurationDays}d
                              </span>
                            </button>
                          )}
                        </div>

                        {/* Track 2: Actual Timeline Bar */}
                        <div className="relative z-10 h-6 w-full">
                          {actualPos.visible ? (
                            <button
                              type="button"
                              onClick={() => setEditingTask(task)}
                              style={{
                                left: `${actualPos.leftPercent}%`,
                                width: `${actualWidth}%`,
                              }}
                              title={`Actual: ${metrics.actualStart} to ${
                                task.actualEndDate?.trim() || `${REFERENCE_TODAY} (Ongoing)`
                              } (${metrics.actualDurationDays} days)`}
                              className={`absolute top-0.5 h-5 rounded-md px-2 flex items-center justify-between text-[10px] font-semibold text-white hover:brightness-95 transition-all overflow-hidden whitespace-nowrap shadow-2xs ${
                                isDelayed
                                  ? 'bg-rose-500 dark:bg-rose-600'
                                  : isCompleted
                                  ? 'bg-emerald-500 dark:bg-emerald-600'
                                  : 'bg-sky-500 dark:bg-sky-600 border border-dashed border-white/50'
                              }`}
                            >
                              <span className="truncate">
                                Actual: {formatShortDate(metrics.actualStart)} –{' '}
                                {task.actualEndDate?.trim()
                                  ? formatShortDate(task.actualEndDate)
                                  : 'Ongoing'}
                              </span>
                              <span className="font-mono tabular-nums ml-1.5">
                                {metrics.actualDurationDays}d
                              </span>
                            </button>
                          ) : (
                            plannedPos.visible && (
                              <button
                                type="button"
                                onClick={() => setEditingTask(task)}
                                style={{
                                  left: `${plannedPos.leftPercent}%`,
                                  width: `${Math.max(plannedWidth, 12)}%`,
                                }}
                                className="absolute top-0.5 h-5 rounded-md border border-dashed border-slate-300 dark:border-slate-700 px-2 flex items-center text-[10px] text-slate-400 dark:text-slate-500 hover:border-amber-400 whitespace-nowrap overflow-hidden"
                              >
                                Not started yet
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Board View */}
      {viewMode === 'board' && (
        <div className="flex gap-3.5 overflow-x-auto pb-4 items-start">
          {TASK_STAGES.map((stage, idx) => {
            const stageTasks = filteredTasks.filter((t) => t.stage === stage);
            const isOver = dragOverStage === stage;

            return (
              <div
                key={stage}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverStage(stage);
                }}
                onDragLeave={() => setDragOverStage(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverStage(null);
                  if (draggedTaskId) {
                    onMoveTaskStage(draggedTaskId, stage);
                    setDraggedTaskId(null);
                  }
                }}
                className={`w-[272px] shrink-0 bg-slate-100/90 dark:bg-slate-900/90 border rounded-xl p-3 flex flex-col transition-colors ${
                  isOver
                    ? 'border-amber-500 bg-amber-50/40 dark:bg-amber-950/20'
                    : 'border-slate-200/80 dark:border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between px-1 pb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {stage}
                    </h3>
                    <span className="text-xs font-mono tabular-nums text-slate-500">
                      ({stageTasks.length})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenNewTask(stage)}
                    aria-label={`Add task to ${stage}`}
                    className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-md"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-3 min-h-[120px]">
                  {stageTasks.map((task) => {
                    const linkedProduct = products.find((p) => p.id === task.linkedProductId);
                    const progress = getChecklistProgress(task.checklist);
                    const metrics = calculateTaskTimelineMetrics(task, REFERENCE_TODAY);

                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={() => setDraggedTaskId(task.id)}
                        onDragEnd={() => {
                          setDraggedTaskId(null);
                          setDragOverStage(null);
                        }}
                        className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3 hover:border-amber-500/60 transition-colors cursor-grab active:cursor-grabbing"
                      >
                        <button
                          type="button"
                          onClick={() => setEditingTask(task)}
                          className="w-full text-left block"
                        >
                          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                            <span
                              className={
                                task.priority === 'Urgent'
                                  ? 'text-red-600 dark:text-red-400 font-semibold'
                                  : task.priority === 'High'
                                  ? 'text-amber-600 dark:text-amber-400 font-medium'
                                  : ''
                              }
                            >
                              {task.priority} · {task.category}
                            </span>
                            <span className="font-mono tabular-nums">
                              {formatShortDate(metrics.plannedStart)} →{' '}
                              {formatShortDate(metrics.plannedEnd)}
                            </span>
                          </div>

                          <h4
                            className={`text-sm font-semibold mt-1 leading-snug ${
                              task.stage === 'Completed'
                                ? 'line-through text-slate-400 dark:text-slate-500'
                                : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {task.title}
                          </h4>

                          {linkedProduct && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 truncate">
                              Product: {linkedProduct.name}
                            </p>
                          )}

                          {/* Planned vs Actual compact info on card */}
                          <div className="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800/70 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 flex items-center justify-between">
                            <span>
                              Actual:{' '}
                              {task.actualStartDate?.trim()
                                ? `${formatShortDate(task.actualStartDate)} → ${
                                    task.actualEndDate?.trim()
                                      ? formatShortDate(task.actualEndDate)
                                      : 'Now'
                                  }`
                                : 'Not started'}
                            </span>
                            <span className="text-[10px] font-sans font-semibold text-amber-700 dark:text-amber-400">
                              {metrics.statusLabel}
                            </span>
                          </div>

                          {progress.total > 0 && (
                            <div className="mt-2.5 flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-amber-500 transition-all"
                                  style={{ width: `${progress.percent}%` }}
                                />
                              </div>
                              <span className="text-[11px] font-mono tabular-nums text-slate-500">
                                {progress.completed}/{progress.total}
                              </span>
                            </div>
                          )}
                        </button>

                        <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            {idx > 0 && (
                              <button
                                type="button"
                                onClick={() => onMoveTaskStage(task.id, TASK_STAGES[idx - 1])}
                                aria-label={`Move ${task.title} to ${TASK_STAGES[idx - 1]}`}
                                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
                              >
                                <ArrowLeft className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {idx < TASK_STAGES.length - 1 && (
                              <button
                                type="button"
                                onClick={() => onMoveTaskStage(task.id, TASK_STAGES[idx + 1])}
                                aria-label={`Move ${task.title} to ${TASK_STAGES[idx + 1]}`}
                                className="px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded flex items-center gap-1"
                              >
                                {TASK_STAGES[idx + 1]}
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          <span className="text-[11px] font-mono tabular-nums text-slate-400">
                            {formatDuration(task.estimatedMinutes)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 bg-slate-50/70 dark:bg-slate-800/50">
                  <th className="py-3 px-4">Task</th>
                  <th className="py-3 px-3">Stage</th>
                  <th className="py-3 px-3">Priority & Category</th>
                  <th className="py-3 px-3">Planned Timeline</th>
                  <th className="py-3 px-3">Actual Timeline</th>
                  <th className="py-3 px-3 text-right">Checklist</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {filteredTasks.map((task) => {
                  const linked = products.find((p) => p.id === task.linkedProductId);
                  const prog = getChecklistProgress(task.checklist);
                  const metrics = calculateTaskTimelineMetrics(task, REFERENCE_TODAY);
                  return (
                    <tr key={task.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => setEditingTask(task)}
                          className="font-semibold text-slate-900 dark:text-slate-100 hover:text-amber-600 text-left block"
                        >
                          {task.title}
                        </button>
                        {linked && (
                          <span className="text-xs text-slate-400 block mt-0.5">
                            {linked.name}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <select
                          aria-label={`Stage for ${task.title}`}
                          value={task.stage}
                          onChange={(e) =>
                            onMoveTaskStage(task.id, e.target.value as TaskStage)
                          }
                          className="text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1"
                        >
                          {TASK_STAGES.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-600 dark:text-slate-300">
                        {task.priority} · {task.category}
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-xs text-slate-700 dark:text-slate-300">
                        {metrics.plannedStart} → {metrics.plannedEnd}
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-xs text-slate-700 dark:text-slate-300">
                        {task.actualStartDate?.trim()
                          ? `${task.actualStartDate} → ${
                              task.actualEndDate?.trim() || 'Ongoing'
                            }`
                          : 'Not started'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-xs text-slate-500">
                        {prog.completed}/{prog.total}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setEditingTask(task)}
                          className="px-2 py-1 text-xs font-medium text-amber-600 hover:underline mr-2"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteTask(task.id)}
                          aria-label={`Delete ${task.title}`}
                          className="p-1 text-slate-400 hover:text-red-600"
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
      )}

      {/* Calendar View */}
      {viewMode === 'calendar' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Production & Task Schedule ({calendarDays[0]} → {calendarDays[calendarDays.length - 1]})
              </h3>
              <p className="text-xs text-slate-500">
                Click any date cell to schedule a task or navigate across weeks
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCalendarOffsetDays((d) => d - 7)}
                className="px-2.5 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Prev 7d
              </button>
              <button
                type="button"
                onClick={() => setCalendarOffsetDays(0)}
                className="px-2.5 py-1 text-xs font-semibold bg-amber-100 text-amber-950 rounded-lg"
              >
                Today ({REFERENCE_TODAY})
              </button>
              <button
                type="button"
                onClick={() => setCalendarOffsetDays((d) => d + 7)}
                className="px-2.5 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg flex items-center gap-1"
              >
                Next 7d
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mt-4">
            {calendarDays.map((dateStr) => {
              const dayTasks = filteredTasks.filter((t) => t.dueDate === dateStr);
              const isToday = dateStr === REFERENCE_TODAY;

              return (
                <div
                  key={dateStr}
                  className={`min-h-[145px] p-2.5 rounded-xl border flex flex-col justify-between ${
                    isToday
                      ? 'border-amber-500 bg-amber-50/20 dark:bg-amber-950/15'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between text-xs font-mono tabular-nums mb-2">
                      <span
                        className={
                          isToday
                            ? 'font-bold text-amber-600 dark:text-amber-400'
                            : 'text-slate-500'
                        }
                      >
                        {dateStr.slice(5)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenNewTask('Today', dateStr, dateStr)}
                        aria-label={`Schedule task on ${dateStr}`}
                        className="text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      {dayTasks.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setEditingTask(t)}
                          className="w-full text-left p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-amber-500 transition-colors"
                        >
                          <div className="text-[11px] font-semibold text-slate-900 dark:text-slate-100 line-clamp-2">
                            {t.title}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                            {t.priority} · {t.stage}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {dayTasks.length === 0 && (
                    <button
                      type="button"
                      onClick={() => handleOpenNewTask('Today', dateStr, dateStr)}
                      className="text-[11px] text-slate-400 hover:text-amber-600 text-left mt-2"
                    >
                      + Schedule
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Task Edit Modal */}
      {editingTask && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="task-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-xl my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2
                id="task-modal-title"
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                {editingTask.title || 'New Workshop Task'}
              </h2>
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                aria-label="Close task modal"
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTaskModal} className="space-y-4">
              {formError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Task Title *
                </label>
                <input
                  type="text"
                  required
                  value={editingTask.title}
                  onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                  placeholder="e.g., Calibrate flow rate on Bambu P1S"
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Stage
                  </label>
                  <select
                    value={editingTask.stage}
                    onChange={(e) => {
                      const nextStage = e.target.value as TaskStage;
                      const autoStart =
                        (nextStage === 'In Progress' ||
                          nextStage === 'Review' ||
                          nextStage === 'Completed') &&
                        !editingTask.actualStartDate
                          ? REFERENCE_TODAY
                          : editingTask.actualStartDate || '';
                      const autoEnd =
                        nextStage === 'Completed' && !editingTask.actualEndDate
                          ? REFERENCE_TODAY
                          : editingTask.actualEndDate || '';
                      setEditingTask({
                        ...editingTask,
                        stage: nextStage,
                        actualStartDate: autoStart,
                        actualEndDate: autoEnd,
                      });
                    }}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    {TASK_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Priority
                  </label>
                  <select
                    value={editingTask.priority}
                    onChange={(e) =>
                      setEditingTask({
                        ...editingTask,
                        priority: e.target.value as PriorityLevel,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="Urgent">Urgent</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={editingTask.category}
                    onChange={(e) =>
                      setEditingTask({
                        ...editingTask,
                        category: e.target.value as TaskItem['category'],
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="Production">Production</option>
                    <option value="Modeling">Modeling</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Content">Content Studio</option>
                    <option value="R&D">R&D</option>
                  </select>
                </div>
              </div>

              {/* Planned vs. Actual Gantt Timeline Dates Box */}
              <div className="p-3.5 rounded-xl bg-amber-50/50 dark:bg-slate-800/60 border border-amber-200/70 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-orange-500" />
                    Gantt Timeline — Planned vs. Actual Dates
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Used for dual-bar Gantt comparison
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Planned Start Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={editingTask.plannedStartDate || editingTask.dueDate}
                      onChange={(e) =>
                        setEditingTask({
                          ...editingTask,
                          plannedStartDate: e.target.value,
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Planned Due Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={editingTask.dueDate}
                      onChange={(e) =>
                        setEditingTask({ ...editingTask, dueDate: e.target.value })
                      }
                      className="w-full px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Actual Start Date
                      </label>
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <button
                          type="button"
                          onClick={() =>
                            setEditingTask({
                              ...editingTask,
                              actualStartDate: REFERENCE_TODAY,
                            })
                          }
                          className="text-amber-700 dark:text-amber-400 hover:underline font-semibold"
                        >
                          Today
                        </button>
                        {editingTask.actualStartDate && (
                          <button
                            type="button"
                            onClick={() =>
                              setEditingTask({
                                ...editingTask,
                                actualStartDate: '',
                              })
                            }
                            className="text-slate-400 hover:text-slate-600"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                    <input
                      type="date"
                      value={editingTask.actualStartDate || ''}
                      onChange={(e) =>
                        setEditingTask({
                          ...editingTask,
                          actualStartDate: e.target.value,
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Actual Finished Date
                      </label>
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <button
                          type="button"
                          onClick={() =>
                            setEditingTask({
                              ...editingTask,
                              actualStartDate:
                                editingTask.actualStartDate ||
                                editingTask.plannedStartDate ||
                                REFERENCE_TODAY,
                              actualEndDate: REFERENCE_TODAY,
                              stage: 'Completed',
                            })
                          }
                          className="text-emerald-700 dark:text-emerald-400 hover:underline font-semibold"
                        >
                          Finish Today
                        </button>
                        {editingTask.actualEndDate && (
                          <button
                            type="button"
                            onClick={() =>
                              setEditingTask({
                                ...editingTask,
                                actualEndDate: '',
                              })
                            }
                            className="text-slate-400 hover:text-slate-600"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                    <input
                      type="date"
                      value={editingTask.actualEndDate || ''}
                      onChange={(e) =>
                        setEditingTask({
                          ...editingTask,
                          actualEndDate: e.target.value,
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Linked Product (Optional)
                  </label>
                  <select
                    value={editingTask.linkedProductId || ''}
                    onChange={(e) =>
                      setEditingTask({ ...editingTask, linkedProductId: e.target.value })
                    }
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="">None (General Workshop)</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Estimated Minutes
                  </label>
                  <input
                    type="number"
                    min={5}
                    value={editingTask.estimatedMinutes}
                    onChange={(e) =>
                      setEditingTask({
                        ...editingTask,
                        estimatedMinutes: Number(e.target.value) || 15,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              {/* Checklist */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Sub-steps Checklist
                </label>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg px-3">
                  {editingTask.checklist.map((item) => (
                    <div key={item.id} className="py-2 flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-xs cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={item.completed}
                          onChange={() =>
                            setEditingTask({
                              ...editingTask,
                              checklist: editingTask.checklist.map((c) =>
                                c.id === item.id ? { ...c, completed: !c.completed } : c
                              ),
                            })
                          }
                        />
                        <span className={item.completed ? 'line-through text-slate-400' : ''}>
                          {item.text}
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setEditingTask({
                            ...editingTask,
                            checklist: editingTask.checklist.filter((c) => c.id !== item.id),
                          })
                        }
                        className="text-slate-400 hover:text-red-500"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newStepText}
                    onChange={(e) => setNewStepText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddChecklistStep();
                      }
                    }}
                    placeholder="Add checklist item..."
                    className="flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={handleAddChecklistStep}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-200 dark:bg-slate-800 rounded-lg"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={editingTask.notes}
                  onChange={(e) => setEditingTask({ ...editingTask, notes: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    onDeleteTask(editingTask.id);
                    setEditingTask(null);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg"
                >
                  Delete
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingTask(null)}
                    className="px-4 py-1.5 text-xs font-medium text-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg"
                  >
                    Save Task
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
