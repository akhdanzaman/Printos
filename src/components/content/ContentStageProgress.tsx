import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  Lock,
  Save,
  SkipForward,
  Sparkles,
} from 'lucide-react';
import { CONTENT_STAGES, ContentItem, ContentPublication, ContentStage } from '../../types/printos';
import {
  STAGE_GATES,
  STAGE_INDEX,
  buildDraft,
  completeStage,
  gateFor,
  stageLogFor,
  validateGate,
} from '../../utils/contentStageGates';

interface Props {
  item: ContentItem;
  publications: ContentPublication[];
  onSave: (next: ContentItem) => void;
}

const actorLabel: Record<string, string> = { user: 'Kamu', agent: 'Hermes' };

export function ContentStageProgress({ item, publications, onSave }: Props) {
  const currentStage = item.stage;
  const currentIndex = STAGE_INDEX[currentStage] ?? 0;

  const [draft, setDraft] = useState<Record<string, string>>(() => buildDraft(item, currentStage));
  const [errors, setErrors] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<ContentStage | null>(currentStage);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [savedFlash, setSavedFlash] = useState('');

  useEffect(() => {
    setDraft(buildDraft(item, currentStage));
    setErrors([]);
    setExpanded(currentStage);
    setOverrideOpen(false);
    setOverrideReason('');
  }, [item.id, currentStage]);

  // Prefill the publish URL from an existing confirmed publication.
  useEffect(() => {
    if (currentStage !== 'Published') return;
    const published = publications.find(
      (p) => p.contentItemId === item.id && p.status === 'Published' && p.actualPostUrl
    );
    if (published?.actualPostUrl) {
      setDraft((prev) => ({
        ...prev,
        postUrl: prev.postUrl || published.actualPostUrl || '',
        publishedAt: prev.publishedAt || (published.actualPublishedAtJakarta || '').slice(0, 10),
      }));
    }
  }, [currentStage, item.id, publications]);

  const gate = gateFor(currentStage);
  const nextStage = useMemo(() => {
    const idx = STAGE_INDEX[currentStage];
    return idx !== undefined && idx < CONTENT_STAGES.length - 1 ? CONTENT_STAGES[idx + 1] : null;
  }, [currentStage]);

  const commit = (advance: boolean, override = false) => {
    const problems = validateGate(item, currentStage, draft);
    if (advance && !override && problems.length > 0) {
      setErrors(problems);
      return;
    }
    if (override && overrideReason.trim().length < 8) {
      setErrors(['Alasan override minimal 8 karakter']);
      return;
    }
    const next = completeStage(item, currentStage, draft, {
      actor: 'user',
      advance,
      overrideReason: override ? overrideReason.trim() : '',
    });
    onSave(next);
    setErrors([]);
    setOverrideOpen(false);
    setOverrideReason('');
    setSavedFlash(
      advance && nextStage
        ? `Stage "${currentStage}" selesai. Konten naik ke "${nextStage}".`
        : `Progres stage "${currentStage}" tersimpan.`
    );
    window.setTimeout(() => setSavedFlash(''), 4000);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Progress per stage</h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Setiap stage punya output wajib. Stage tidak bisa dilanjutkan sebelum isinya lengkap —
            semua tersimpan dengan timestamp Asia/Jakarta.
          </p>
        </div>
        <span className="text-[11px] px-2 py-1 rounded-lg bg-amber-100 dark:bg-amber-500/20 text-amber-900 dark:text-amber-300 font-semibold">
          Stage {currentIndex + 1}/{CONTENT_STAGES.length}: {currentStage}
        </span>
      </div>

      {savedFlash && (
        <div className="text-[11px] px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300">
          {savedFlash}
        </div>
      )}

      <ol className="space-y-2">
        {CONTENT_STAGES.map((stage, idx) => {
          const log = stageLogFor(item, stage);
          const isCurrent = stage === currentStage;
          const isDone = Boolean(log?.completedAtJakarta) && idx < currentIndex;
          const isLocked = idx > currentIndex;
          const isOpen = expanded === stage;
          const stageGate = gateFor(stage);

          return (
            <li
              key={stage}
              className={`rounded-xl border ${
                isCurrent
                  ? 'border-amber-400 dark:border-amber-500/60 bg-amber-50/40 dark:bg-amber-950/20'
                  : isDone
                  ? 'border-emerald-200 dark:border-emerald-900/60 bg-white dark:bg-slate-900'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60'
              }`}
            >
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : stage)}
                className="w-full flex items-start gap-2.5 p-3 text-left"
              >
                <span className="mt-0.5 shrink-0">
                  {isDone ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : isCurrent ? (
                    <Clock className="w-4 h-4 text-amber-500" />
                  ) : isLocked ? (
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <Circle className="w-4 h-4 text-slate-300" />
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-xs font-semibold ${
                        isLocked ? 'text-slate-400' : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {idx + 1}. {stageGate?.title || stage}
                    </span>
                    {log?.completedAtJakarta && (
                      <span className="text-[10px] text-slate-500 font-mono tabular-nums">
                        {log.completedAtJakarta}
                      </span>
                    )}
                    {log?.actor && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {actorLabel[log.actor] || log.actor}
                      </span>
                    )}
                    {log?.overrideReason && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300">
                        override
                      </span>
                    )}
                  </span>
                  {log?.summary && !isOpen && (
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                      {log.summary}
                    </span>
                  )}
                  {!log?.summary && isCurrent && (
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {stageGate?.intent}
                    </span>
                  )}
                </span>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 space-y-3">
                  {log && !isCurrent && (
                    <div className="text-[11px] space-y-1 bg-slate-50 dark:bg-slate-800/60 rounded-lg p-2.5">
                      <div className="text-slate-500">
                        Mulai: {log.startedAtJakarta} · Selesai: {log.completedAtJakarta}
                      </div>
                      {Object.entries(log.output || {})
                        .filter(([, value]) => String(value).trim())
                        .map(([key, value]) => {
                          const field = stageGate?.fields.find((f) => f.id === key);
                          return (
                            <div key={key}>
                              <span className="font-semibold text-slate-600 dark:text-slate-300">
                                {field?.label || key}:
                              </span>{' '}
                              <span className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                                {value}
                              </span>
                            </div>
                          );
                        })}
                      {log.overrideReason && (
                        <div className="text-rose-600 dark:text-rose-300">
                          Alasan override: {log.overrideReason}
                        </div>
                      )}
                    </div>
                  )}

                  {isCurrent && (
                    <div className="space-y-3">
                      <div className="text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                        {stageGate?.intent}
                      </div>

                      {stage === 'Script / Slides' && (
                        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-2.5 text-[11px] space-y-1">
                          <div className="text-slate-400 uppercase tracking-wide text-[10px]">
                            Konteks brief — bukan naskah
                          </div>
                          <div>
                            <span className="font-semibold text-slate-600 dark:text-slate-300">Hook: </span>
                            <span className="text-slate-700 dark:text-slate-300">{item.brief.hook}</span>
                          </div>
                          <div>
                            <span className="font-semibold text-slate-600 dark:text-slate-300">Pesan: </span>
                            <span className="text-slate-700 dark:text-slate-300">{item.brief.keyMessage}</span>
                          </div>
                          <div>
                            <span className="font-semibold text-slate-600 dark:text-slate-300">CTA: </span>
                            <span className="text-slate-700 dark:text-slate-300">{item.brief.callToAction}</span>
                          </div>
                        </div>
                      )}

                      {(stageGate?.fields || []).map((field) => (
                        <label key={field.id} className="block">
                          <span className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                            {field.label}
                            {field.required && <span className="text-rose-500"> *</span>}
                          </span>
                          {field.type === 'textarea' ? (
                            <textarea
                              rows={4}
                              value={draft[field.id] || ''}
                              onChange={(e) =>
                                setDraft((prev) => ({ ...prev, [field.id]: e.target.value }))
                              }
                              placeholder={field.placeholder}
                              className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 leading-relaxed"
                            />
                          ) : (
                            <input
                              type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                              value={draft[field.id] || ''}
                              onChange={(e) =>
                                setDraft((prev) => ({ ...prev, [field.id]: e.target.value }))
                              }
                              placeholder={field.placeholder}
                              className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                            />
                          )}
                          {field.help && (
                            <span className="block text-[10px] text-slate-400 mt-1">{field.help}</span>
                          )}
                        </label>
                      ))}

                      {errors.length > 0 && (
                        <div className="text-[11px] rounded-lg p-2.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 space-y-1">
                          {errors.map((e) => (
                            <div key={e} className="flex items-start gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span>{e}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => commit(false)}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
                        >
                          <Save className="w-3.5 h-3.5" /> Simpan progres
                        </button>
                        <button
                          type="button"
                          onClick={() => commit(true)}
                          disabled={!nextStage}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 flex items-center gap-1.5"
                        >
                          {nextStage ? `Selesaikan & naik ke "${nextStage}"` : 'Selesaikan stage terakhir'}
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setOverrideOpen((v) => !v)}
                          className="px-2.5 py-1.5 text-[11px] rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1"
                        >
                          <SkipForward className="w-3 h-3" /> Lewati dengan alasan
                        </button>
                      </div>

                      {overrideOpen && (
                        <div className="rounded-lg border border-rose-200 dark:border-rose-900/60 p-2.5 space-y-2 bg-rose-50/50 dark:bg-rose-950/20">
                          <p className="text-[11px] text-rose-700 dark:text-rose-300">
                            Override tetap dicatat di log. Dipakai kalau stage ini memang tidak relevan
                            untuk format ini (misal shot list untuk cerpen teks).
                          </p>
                          <input
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                            placeholder="Alasan melewati stage ini"
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-slate-900"
                          />
                          <button
                            type="button"
                            onClick={() => commit(true, true)}
                            className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-rose-600 text-white"
                          >
                            Lewati & naik stage
                          </button>
                        </div>
                      )}

                      <p className="text-[10px] text-slate-400">
                        Stage ini juga bisa diisi oleh Hermes lewat bridge; log akan mencatat aktornya.
                      </p>
                    </div>
                  )}

                  {isLocked && (
                    <p className="text-[11px] text-slate-400">
                      Terkunci. Selesaikan stage {currentIndex + 1} dulu.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
