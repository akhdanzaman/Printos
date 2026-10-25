import React, { useState } from 'react';
import {
  FilamentSpool,
  PrinterMachine,
  PrintJob,
  Product,
  PRODUCTION_STAGES,
  ProductionStage,
} from '../types/printos';
import { formatDuration, getChecklistProgress } from '../utils/calculations';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FolderKanban,
  Plus,
  Printer,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';

interface ProductionFleetBoardProps {
  printJobs: PrintJob[];
  printers: PrinterMachine[];
  products: Product[];
  filaments: FilamentSpool[];
  onSaveJob: (job: PrintJob, deductFilamentGrams?: number) => void;
  onDeleteJob: (jobId: string) => void;
  onMoveJobStage: (jobId: string, stage: ProductionStage, deductFilament?: boolean) => void;
  onUpdatePrinter: (printer: PrinterMachine) => void;
}

export const ProductionFleetBoard: React.FC<ProductionFleetBoardProps> = ({
  printJobs,
  printers,
  products,
  filaments,
  onSaveJob,
  onDeleteJob,
  onMoveJobStage,
  onUpdatePrinter,
}) => {
  const [activeTab, setActiveTab] = useState<'queue' | 'fleet'>('queue');
  const [editingJob, setEditingJob] = useState<PrintJob | null>(null);
  const [deductOnSave, setDeductOnSave] = useState(false);
  const [newAssemblyStep, setNewAssemblyStep] = useState('');

  const handleOpenNewJob = (defaultStage: ProductionStage = 'Queued') => {
    const defaultProd = products[0];
    setEditingJob({
      id: `job-${Date.now()}`,
      jobTitle: defaultProd ? `Batch — 2× ${defaultProd.name}` : 'Custom Print Batch',
      productId: defaultProd?.id || '',
      printerId: printers[0]?.id || 'prn-1',
      filamentId: defaultProd?.filamentId || filaments[0]?.id || 'fil-1',
      stage: defaultStage,
      batchQuantity: 2,
      printTimeMinutes: (defaultProd?.printTimeMinutes || 120) * 2,
      filamentGramsUsed: (defaultProd?.filamentGrams || 80) * 2,
      customerOrderRef: '',
      assemblySteps: [
        { id: `as-${Date.now()}-1`, text: 'Remove brim & support structures', completed: false },
        { id: `as-${Date.now()}-2`, text: 'Inspect dimensional tolerance & surface', completed: false },
      ],
      notes: '',
      updatedAt: new Date().toISOString().slice(0, 10),
    });
    setDeductOnSave(false);
  };

  const handleJobSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingJob || !editingJob.jobTitle.trim()) return;
    onSaveJob(
      {
        ...editingJob,
        jobTitle: editingJob.jobTitle.trim(),
        updatedAt: new Date().toISOString().slice(0, 10),
      },
      deductOnSave ? editingJob.filamentGramsUsed : 0
    );
    setEditingJob(null);
  };

  return (
    <div className="space-y-5 pb-10">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('queue')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                activeTab === 'queue'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <FolderKanban className="w-3.5 h-3.5" />
              Print Job Queue ({printJobs.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('fleet')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                activeTab === 'fleet'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Printer className="w-3.5 h-3.5" />
              Printer Fleet & Maintenance ({printers.length})
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleOpenNewJob('Queued')}
          className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg transition-colors flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          Log Print Job
        </button>
      </div>

      {/* Print Queue Kanban Board */}
      {activeTab === 'queue' && (
        <div className="flex gap-4 overflow-x-auto pb-4 items-start">
          {PRODUCTION_STAGES.map((stage, idx) => {
            const stageJobs = printJobs.filter((j) => j.stage === stage);

            return (
              <div
                key={stage}
                className="w-80 shrink-0 bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3 flex flex-col"
              >
                <div className="flex items-center justify-between px-1 pb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {stage}
                    </h3>
                    <span className="text-xs font-mono tabular-nums text-slate-500">
                      ({stageJobs.length})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenNewJob(stage)}
                    aria-label={`Add print job to ${stage}`}
                    className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-md"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-3 min-h-[120px]">
                  {stageJobs.map((job) => {
                    const printer = printers.find((p) => p.id === job.printerId);
                    const spool = filaments.find((f) => f.id === job.filamentId);
                    const assemblyProg = getChecklistProgress(job.assemblySteps);

                    return (
                      <div
                        key={job.id}
                        className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 hover:border-amber-500/60 transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setEditingJob(job);
                            setDeductOnSave(false);
                          }}
                          className="w-full text-left block"
                        >
                          <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                            <span>{printer?.name || 'Unassigned Printer'}</span>
                            <span>Qty: {job.batchQuantity}</span>
                          </div>

                          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1 leading-snug">
                            {job.jobTitle}
                          </h4>

                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 font-mono tabular-nums">
                            <span>{formatDuration(job.printTimeMinutes)}</span>
                            <span aria-hidden="true">·</span>
                            <span>{job.filamentGramsUsed}g used</span>
                            {spool && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="truncate max-w-[120px]">{spool.name}</span>
                              </>
                            )}
                          </div>

                          {job.failureReason && (
                            <div className="mt-2 p-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded text-xs text-red-700 dark:text-red-300 flex items-start gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span>{job.failureReason}</span>
                            </div>
                          )}

                          {assemblyProg.total > 0 && (
                            <div className="mt-3 flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500"
                                  style={{ width: `${assemblyProg.percent}%` }}
                                />
                              </div>
                              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                                Assembly {assemblyProg.completed}/{assemblyProg.total}
                              </span>
                            </div>
                          )}
                        </button>

                        <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            {idx > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  onMoveJobStage(job.id, PRODUCTION_STAGES[idx - 1], false)
                                }
                                aria-label="Previous production stage"
                                className="p-1 text-slate-400 hover:text-slate-700 rounded"
                              >
                                <ArrowLeft className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {stage !== 'Completed' && (
                              <button
                                type="button"
                                onClick={() => onMoveJobStage(job.id, 'Completed', true)}
                                className="px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 rounded flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                Finish & Deduct {job.filamentGramsUsed}g
                              </button>
                            )}
                          </div>

                          {idx < PRODUCTION_STAGES.length - 1 && stage !== 'Completed' && (
                            <button
                              type="button"
                              onClick={() =>
                                onMoveJobStage(job.id, PRODUCTION_STAGES[idx + 1], false)
                              }
                              aria-label="Next production stage"
                              className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded"
                            >
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}
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

      {/* Printer Fleet & Maintenance View */}
      {activeTab === 'fleet' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {printers.map((printer) => {
            const maintProg = getChecklistProgress(printer.maintenanceChecklist);
            return (
              <div
                key={printer.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {printer.name}
                    </h3>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      {printer.model} · Nozzle: {printer.nozzleSize}
                    </p>
                  </div>
                  <select
                    aria-label={`Status for ${printer.name}`}
                    value={printer.status}
                    onChange={(e) =>
                      onUpdatePrinter({
                        ...printer,
                        status: e.target.value as PrinterMachine['status'],
                      })
                    }
                    className="px-2.5 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="Printing">Printing</option>
                    <option value="Idle">Idle</option>
                    <option value="Maintenance">Maintenance</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg font-mono tabular-nums">
                  <div>
                    <div className="text-[11px] text-slate-500">Total Machine Hours</div>
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                      {printer.totalHours} hrs
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Hours Since Lubrication</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className={`text-sm font-bold ${
                          printer.hoursSinceMaintenance >= 150
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {printer.hoursSinceMaintenance} hrs
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdatePrinter({
                            ...printer,
                            hoursSinceMaintenance: 0,
                            status: 'Idle',
                            maintenanceChecklist: printer.maintenanceChecklist.map((c) => ({
                              ...c,
                              completed: true,
                            })),
                          })
                        }
                        className="text-[11px] text-amber-600 hover:underline font-sans"
                      >
                        Reset Service Timer
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    <span className="flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5 text-amber-500" />
                      Preventive Maintenance Checklist
                    </span>
                    <span className="font-mono tabular-nums text-slate-400">
                      {maintProg.completed}/{maintProg.total}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg px-3">
                    {printer.maintenanceChecklist.map((item) => (
                      <label
                        key={item.id}
                        className="py-2 flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={item.completed}
                          onChange={() =>
                            onUpdatePrinter({
                              ...printer,
                              maintenanceChecklist: printer.maintenanceChecklist.map((c) =>
                                c.id === item.id ? { ...c, completed: !c.completed } : c
                              ),
                            })
                          }
                        />
                        <span className={item.completed ? 'line-through text-slate-400' : ''}>
                          {item.text}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Print Job Modal */}
      {editingJob && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="job-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2
                id="job-modal-title"
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                {editingJob.jobTitle || 'Log Print Job'}
              </h2>
              <button
                type="button"
                onClick={() => setEditingJob(null)}
                aria-label="Close print job modal"
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleJobSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Print Job Title *
                </label>
                <input
                  type="text"
                  required
                  value={editingJob.jobTitle}
                  onChange={(e) => setEditingJob({ ...editingJob, jobTitle: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Stage
                  </label>
                  <select
                    value={editingJob.stage}
                    onChange={(e) =>
                      setEditingJob({
                        ...editingJob,
                        stage: e.target.value as ProductionStage,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    {PRODUCTION_STAGES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Assigned Printer
                  </label>
                  <select
                    value={editingJob.printerId}
                    onChange={(e) =>
                      setEditingJob({ ...editingJob, printerId: e.target.value })
                    }
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    {printers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Filament Spool
                  </label>
                  <select
                    value={editingJob.filamentId}
                    onChange={(e) =>
                      setEditingJob({ ...editingJob, filamentId: e.target.value })
                    }
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    {filaments.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.brand} {f.name} ({f.remainingWeightGrams}g left)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Batch Quantity
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={editingJob.batchQuantity}
                    onChange={(e) =>
                      setEditingJob({
                        ...editingJob,
                        batchQuantity: Number(e.target.value) || 1,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Total Print Time (min)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={editingJob.printTimeMinutes}
                    onChange={(e) =>
                      setEditingJob({
                        ...editingJob,
                        printTimeMinutes: Number(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Filament Used (grams)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={editingJob.filamentGramsUsed}
                    onChange={(e) =>
                      setEditingJob({
                        ...editingJob,
                        filamentGramsUsed: Number(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              {editingJob.stage === 'Failed / Reprint' && (
                <div>
                  <label className="block text-xs font-semibold text-red-600 mb-1">
                    Failed Print Root Cause & Diagnostics
                  </label>
                  <input
                    type="text"
                    value={editingJob.failureReason || ''}
                    onChange={(e) =>
                      setEditingJob({ ...editingJob, failureReason: e.target.value })
                    }
                    placeholder="e.g., First layer spaghetti / nozzle clog / chamber draft warping"
                    className="w-full px-3 py-1.5 text-xs bg-red-50/50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg"
                  />
                </div>
              )}

              <label className="flex items-center gap-2 p-3 bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-lg text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={deductOnSave}
                  onChange={(e) => setDeductOnSave(e.target.checked)}
                />
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  Automatically deduct {editingJob.filamentGramsUsed}g from linked filament spool in Inventory
                </span>
              </label>

              {/* Post-processing & Assembly Checklist */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Post-Processing & Assembly Steps
                </label>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg px-3">
                  {editingJob.assemblySteps.map((step) => (
                    <div key={step.id} className="py-2 flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-xs cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={step.completed}
                          onChange={() =>
                            setEditingJob({
                              ...editingJob,
                              assemblySteps: editingJob.assemblySteps.map((s) =>
                                s.id === step.id ? { ...s, completed: !s.completed } : s
                              ),
                            })
                          }
                        />
                        <span className={step.completed ? 'line-through text-slate-400' : ''}>
                          {step.text}
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newAssemblyStep}
                    onChange={(e) => setNewAssemblyStep(e.target.value)}
                    placeholder="Add assembly step..."
                    className="flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newAssemblyStep.trim()) return;
                      setEditingJob({
                        ...editingJob,
                        assemblySteps: [
                          ...editingJob.assemblySteps,
                          {
                            id: `as-${Date.now()}`,
                            text: newAssemblyStep.trim(),
                            completed: false,
                          },
                        ],
                      });
                      setNewAssemblyStep('');
                    }}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-200 dark:bg-slate-800 rounded-lg"
                  >
                    Add Step
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    onDeleteJob(editingJob.id);
                    setEditingJob(null);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg"
                >
                  Delete Job
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingJob(null)}
                    className="px-4 py-1.5 text-xs font-medium text-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg"
                  >
                    Save Print Job
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
