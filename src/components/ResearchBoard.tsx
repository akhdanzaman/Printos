import React, { useState } from 'react';
import {
  Product,
  RESEARCH_STAGES,
  ResearchNote,
  ResearchStage,
} from '../types/printos';
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  FlaskConical,
  Plus,
  Thermometer,
  Trash2,
  X,
} from 'lucide-react';

interface ResearchBoardProps {
  notes: ResearchNote[];
  products: Product[];
  globalSearch: string;
  onSaveNote: (note: ResearchNote) => void;
  onDeleteNote: (noteId: string) => void;
  onMoveNoteStage: (noteId: string, stage: ResearchStage) => void;
}

export const ResearchBoard: React.FC<ResearchBoardProps> = ({
  notes,
  products,
  globalSearch,
  onSaveNote,
  onDeleteNote,
  onMoveNoteStage,
}) => {
  const [editingNote, setEditingNote] = useState<ResearchNote | null>(null);
  const [tagsInput, setTagsInput] = useState('');

  const filteredNotes = notes.filter((n) => {
    if (!globalSearch.trim()) return true;
    const q = globalSearch.toLowerCase();
    return (
      n.title.toLowerCase().includes(q) ||
      n.material.toLowerCase().includes(q) ||
      n.problemSummary.toLowerCase().includes(q) ||
      n.solutionSummary.toLowerCase().includes(q) ||
      n.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  const handleOpenNewNote = (defaultStage: ResearchStage = 'Slicer Profiles') => {
    const fresh: ResearchNote = {
      id: `res-${Date.now()}`,
      title: '',
      stage: defaultStage,
      linkedProductId: products[0]?.id || '',
      printerModel: 'Bambu Lab P1S (0.4mm)',
      material: 'PETG',
      nozzleTemp: 240,
      bedTemp: 70,
      layerHeight: '0.16mm Optimal',
      printSpeed: '140 mm/s',
      problemSummary: '',
      solutionSummary: '',
      referenceUrl: '',
      tags: ['OrcaSlicer', 'Calibration'],
      checklist: [],
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    setEditingNote(fresh);
    setTagsInput(fresh.tags.join(', '));
  };

  const handleNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNote || !editingNote.title.trim()) return;
    const parsedTags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    onSaveNote({
      ...editingNote,
      title: editingNote.title.trim(),
      tags: parsedTags,
      updatedAt: new Date().toISOString().slice(0, 10),
    });
    setEditingNote(null);
  };

  return (
    <div className="space-y-5 pb-10">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-amber-500" />
            R&D Lab, Slicer Profiles, Troubleshooting & Idea Backlog
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Store tested nozzle/bed temperatures, retraction fixes, reference links, and product experiments
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleOpenNewNote('Slicer Profiles')}
          className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg transition-colors flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          Add Research / Slicer Note
        </button>
      </div>

      {/* 5-Column Research Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4 items-start">
        {RESEARCH_STAGES.map((stage, idx) => {
          const stageNotes = filteredNotes.filter((n) => n.stage === stage);

          return (
            <div
              key={stage}
              className="w-80 shrink-0 bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3 flex flex-col"
            >
              <div className="flex items-center justify-between px-1 pb-3">
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {stage} ({stageNotes.length})
                </h3>
                <button
                  type="button"
                  onClick={() => handleOpenNewNote(stage)}
                  aria-label={`Add note to ${stage}`}
                  className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-md"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-3 min-h-[120px]">
                {stageNotes.map((note) => {
                  const linkedProduct = products.find((p) => p.id === note.linkedProductId);

                  return (
                    <div
                      key={note.id}
                      className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-2.5 hover:border-amber-500/60 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNote(note);
                          setTagsInput(note.tags.join(', '));
                        }}
                        className="w-full text-left block"
                      >
                        <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                          <span>{note.material}</span>
                          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <Thermometer className="w-3 h-3" />
                            {note.nozzleTemp}°C / {note.bedTemp}°C
                          </span>
                        </div>

                        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1 leading-snug">
                          {note.title}
                        </h4>

                        <div className="mt-1.5 text-[11px] font-mono text-slate-500">
                          {note.layerHeight} · {note.printSpeed}
                        </div>

                        {note.problemSummary && (
                          <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              Problem:{' '}
                            </span>
                            {note.problemSummary}
                          </div>
                        )}

                        {note.solutionSummary && (
                          <div className="mt-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                            <span className="font-semibold">Fix / Setting: </span>
                            {note.solutionSummary}
                          </div>
                        )}

                        {linkedProduct && (
                          <div className="mt-2 text-[11px] text-slate-400 truncate">
                            Product: {linkedProduct.name}
                          </div>
                        )}
                      </button>

                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          {idx > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                onMoveNoteStage(note.id, RESEARCH_STAGES[idx - 1])
                              }
                              aria-label="Move note left"
                              className="p-1 text-slate-400 hover:text-slate-700 rounded"
                            >
                              <ArrowLeft className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {idx < RESEARCH_STAGES.length - 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                onMoveNoteStage(note.id, RESEARCH_STAGES[idx + 1])
                              }
                              aria-label="Move note right"
                              className="p-1 text-slate-400 hover:text-slate-700 rounded"
                            >
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {note.referenceUrl && (
                          <a
                            href={note.referenceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline inline-flex items-center gap-1"
                          >
                            Reference
                            <ExternalLink className="w-3 h-3" />
                          </a>
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

      {/* Research Note Edit Modal */}
      {editingNote && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="research-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2
                id="research-modal-title"
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                {editingNote.title || 'New Research & Slicer Profile Card'}
              </h2>
              <button
                type="button"
                onClick={() => setEditingNote(null)}
                aria-label="Close research modal"
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleNoteSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  required
                  value={editingNote.title}
                  onChange={(e) =>
                    setEditingNote({ ...editingNote, title: e.target.value })
                  }
                  placeholder="e.g., PETG Zero-Stringing Retraction & Scarf Seam Profile"
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Column Stage
                  </label>
                  <select
                    value={editingNote.stage}
                    onChange={(e) =>
                      setEditingNote({
                        ...editingNote,
                        stage: e.target.value as ResearchStage,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    {RESEARCH_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Material
                  </label>
                  <input
                    type="text"
                    value={editingNote.material}
                    onChange={(e) =>
                      setEditingNote({ ...editingNote, material: e.target.value })
                    }
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Linked Product
                  </label>
                  <select
                    value={editingNote.linkedProductId || ''}
                    onChange={(e) =>
                      setEditingNote({
                        ...editingNote,
                        linkedProductId: e.target.value,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="">General Lab Note</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nozzle (°C)
                  </label>
                  <input
                    type="number"
                    value={editingNote.nozzleTemp}
                    onChange={(e) =>
                      setEditingNote({
                        ...editingNote,
                        nozzleTemp: Number(e.target.value) || 220,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Bed (°C)
                  </label>
                  <input
                    type="number"
                    value={editingNote.bedTemp}
                    onChange={(e) =>
                      setEditingNote({
                        ...editingNote,
                        bedTemp: Number(e.target.value) || 60,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Layer Height
                  </label>
                  <input
                    type="text"
                    value={editingNote.layerHeight}
                    onChange={(e) =>
                      setEditingNote({ ...editingNote, layerHeight: e.target.value })
                    }
                    className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Print Speed
                  </label>
                  <input
                    type="text"
                    value={editingNote.printSpeed}
                    onChange={(e) =>
                      setEditingNote({ ...editingNote, printSpeed: e.target.value })
                    }
                    className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Problem / Observation
                </label>
                <textarea
                  rows={2}
                  value={editingNote.problemSummary}
                  onChange={(e) =>
                    setEditingNote({ ...editingNote, problemSummary: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Verified Solution / Slicer Parameters
                </label>
                <textarea
                  rows={2}
                  value={editingNote.solutionSummary}
                  onChange={(e) =>
                    setEditingNote({ ...editingNote, solutionSummary: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Reference URL (Optional)
                </label>
                <input
                  type="url"
                  value={editingNote.referenceUrl || ''}
                  onChange={(e) =>
                    setEditingNote({ ...editingNote, referenceUrl: e.target.value })
                  }
                  placeholder="https://wiki.bambulab.com/..."
                  className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    onDeleteNote(editingNote.id);
                    setEditingNote(null);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg"
                >
                  Delete Note
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingNote(null)}
                    className="px-4 py-1.5 text-xs font-medium text-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg"
                  >
                    Save Research Card
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
