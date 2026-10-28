import { CONTENT_STAGES, ContentItem, ContentPublication, ContentStage } from '../types/printos';

/**
 * Stage gates: every stage has required inputs. You cannot move to the next stage until the
 * current stage produced its artefact — that is what turns the board into a project log instead
 * of a status dropdown.
 */
export interface StageField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date';
  placeholder: string;
  required: boolean;
  minLength?: number;
  help?: string;
  prefill?: (item: ContentItem) => string;
}

export interface StageGate {
  stage: ContentStage;
  title: string;
  intent: string;
  fields: StageField[];
  /** Extra validation that depends on the item itself rather than the form values. */
  validate?: (item: ContentItem, output: Record<string, string>) => string[];
}

const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** A real script has beats and is not just the hook + key message copied back. */
function isRealScript(item: ContentItem): boolean {
  const text = (item.scriptText || '').trim();
  if (text.length < 60) return false;
  const echo = `${item.brief.hook}\n\n${item.brief.keyMessage}`.replace(/\s+/g, ' ').trim();
  return text.replace(/\s+/g, ' ') !== echo;
}


export const STAGE_GATES: StageGate[] = [
  {
    stage: 'Strategy',
    title: 'Strategi',
    intent: 'Tentukan untuk siapa konten ini dan apa yang harus berubah setelah mereka menonton.',
    fields: [
      {
        id: 'objective',
        label: 'Tujuan konten (satu kalimat)',
        type: 'text',
        placeholder: 'Contoh: membuat orang menyimpan daftar tempat gratis di Jakarta',
        required: true,
        minLength: 15,
        prefill: (i) => i.brief.keyMessage,
      },
      {
        id: 'audience',
        label: 'Audiens spesifik',
        type: 'text',
        placeholder: 'Contoh: pekerja 22-30 di Jakarta yang weekend-nya kosong',
        required: true,
        minLength: 10,
        prefill: (i) => i.brief.targetAudience,
      },
      {
        id: 'constraints',
        label: 'Batasan / hal yang dihindari',
        type: 'textarea',
        placeholder: 'Contoh: tanpa konten kuliner, tanpa wajah orang lain, tanpa klaim harga yang belum dicek',
        required: false,
        prefill: () => '',
      },
    ],
    validate: (item) => (item.projectId ? [] : ['Project belum dipilih']),
  },
  {
    stage: 'Idea & Research Bank',
    title: 'Ide & Riset',
    intent: 'Simpan ide dalam satu kalimat yang bisa dieksekusi, plus sumber atau alasan kenapa ini layak dibuat.',
    fields: [
      {
        id: 'idea',
        label: 'Ide inti',
        type: 'text',
        placeholder: 'Satu kalimat: siapa melakukan apa, dan kenapa menarik',
        required: true,
        minLength: 15,
        prefill: (i) => i.brief.hook,
      },
      {
        id: 'source',
        label: 'Sumber / alasan',
        type: 'textarea',
        placeholder: 'Pengalaman sendiri, komentar orang, tren, atau link referensi',
        required: true,
        minLength: 8,
        prefill: (i) => i.references[0]?.title || '',
      },
      {
        id: 'hookOptions',
        label: '2-3 opsi hook',
        type: 'textarea',
        placeholder: 'Satu baris satu hook. Nanti dipilih saat menulis naskah.',
        required: false,
        prefill: (i) => i.brief.hook,
      },
    ],
    validate: (item) => {
      const verified = item.references.some((r) => r.factCheckNote?.trim());
      if (!verified && !item.references.length) {
        return ['Tambahkan minimal satu referensi/klaim yang perlu dicek'];
      }
      return [];
    },
  },
  {
    stage: 'Brief',
    title: 'Brief',
    intent: 'Kunci pesan utama dan satu ajakan. Semua produksi mengikuti ini, bukan ide di kepala.',
    fields: [
      {
        id: 'keyMessage',
        label: 'Pesan inti',
        type: 'textarea',
        placeholder: 'Satu kalimat yang harus diingat penonton',
        required: true,
        minLength: 15,
        prefill: (i) => i.brief.keyMessage,
      },
      {
        id: 'callToAction',
        label: 'Ajakan (CTA)',
        type: 'text',
        placeholder: 'Simpan, komentar, atau buka link',
        required: true,
        minLength: 5,
        prefill: (i) => i.brief.callToAction,
      },
      {
        id: 'duration',
        label: 'Target durasi (detik)',
        type: 'number',
        placeholder: '24',
        required: true,
        prefill: (i) => String(i.brief.estimatedDurationSec || 24),
      },
    ],
  },
  {
    stage: 'Script / Slides',
    title: 'Naskah / Slide',
    intent: 'Tulis naskah lengkap atau slide carousel. Ini artefak yang dipakai saat produksi.',
    fields: [
      {
        id: 'script',
        label: 'Naskah / teks cerita',
        type: 'textarea',
        placeholder: 'Hook, isi, penutup. Untuk carousel, tulis per slide.',
        required: false,
        prefill: (i) => (isRealScript(i) ? i.scriptText : ''),
        help: 'Naskah harus punya beat (0-2 dtk, 3-8 dtk, …), bukan salinan hook. Untuk carousel, minimal 2 slide terisi di tab Script.',
      },
      {
        id: 'beatNotes',
        label: 'Catatan beat / timing',
        type: 'textarea',
        placeholder: '0-2 dtk hook, 3-20 dtk isi, penutup',
        required: false,
        prefill: () => '',
      },
    ],
    validate: (item, output) => {
      const problems: string[] = [];
      const raw = s(output.script) || s(item.scriptText);
      const echo = `${item.brief.hook}\n\n${item.brief.keyMessage}`;
      const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
      const filledSlides = item.carouselSlides.filter((sl) => s(sl.headline) || s(sl.bodyCopy));
      const isEcho =
        raw.length > 0 && echo.trim().length > 0 && normalize(raw) === normalize(echo);

      if (isEcho) {
        problems.push('Naskah masih menyalin hook dan pesan inti — tulis beat per bagian');
      } else if (raw.length < 60 && filledSlides.length < 2) {
        problems.push('Tulis naskah lengkap (min. 60 karakter, ada beat) atau minimal 2 slide carousel');
      }
      return problems;
    },
  },
  {
    stage: 'Shot List',
    title: 'Shot List',
    intent: 'Daftar shot yang harus direkam. Tanpa ini, kamu pulang dengan bahan yang kurang.',
    fields: [
      {
        id: 'shotPlan',
        label: 'Rencana shot',
        type: 'textarea',
        placeholder: 'Satu baris satu shot: angle + aksi + durasi',
        required: true,
        minLength: 10,
        prefill: (i) =>
          i.shots.map((sh, idx) => `${idx + 1}. ${sh.visualAngle} (${sh.durationSec}s)`).join('\n'),
      },
      {
        id: 'shotCount',
        label: 'Jumlah shot minimal',
        type: 'number',
        placeholder: '3',
        required: true,
        prefill: (i) => String(i.shots.length || 3),
      },
    ],
    validate: (item, output) => {
      const count = item.shots.length;
      const declared = Number(output.shotCount) || 0;
      if (count < 3) return ['Isi minimal 3 shot di tab Shot List'];
      if (declared && count < declared) return [`Shot list baru ${count}, target ${declared}`];
      return [];
    },
  },
  {
    stage: 'Production Plan',
    title: 'Rencana Produksi',
    intent: 'Kapan, di mana, dengan alat apa. Ini yang membuat produksi benar-benar terjadi.',
    fields: [
      {
        id: 'shootDate',
        label: 'Tanggal produksi',
        type: 'date',
        placeholder: '',
        required: true,
        prefill: () => '',
      },
      {
        id: 'location',
        label: 'Lokasi',
        type: 'text',
        placeholder: 'Tempat spesifik, bukan "Jakarta"',
        required: true,
        minLength: 3,
        prefill: () => '',
      },
      {
        id: 'device',
        label: 'Alat & setelan',
        type: 'text',
        placeholder: 'iPhone, 4K 30fps, 9:16, clip-on mic',
        required: true,
        minLength: 5,
        prefill: () => 'iPhone 4K 30fps, 9:16',
      },
      {
        id: 'estimatedMinutes',
        label: 'Estimasi waktu (menit)',
        type: 'number',
        placeholder: '90',
        required: true,
        prefill: () => '90',
      },
    ],
  },
  {
    stage: 'Assets & Edit Notes',
    title: 'Aset & Edit',
    intent: 'Catat file mana yang dipakai dan bagaimana mengeditnya. Referensi lokal, bukan upload.',
    fields: [
      {
        id: 'finalFileName',
        label: 'Nama file final',
        type: 'text',
        placeholder: 'IMG_4821.MOV / CapCut_Reel_v2',
        required: true,
        minLength: 3,
        prefill: (i) => i.localAssets[0]?.fileName || '',
      },
      {
        id: 'editNotes',
        label: 'Catatan edit',
        type: 'textarea',
        placeholder: 'Potongan, subtitle, musik, warna, teks',
        required: true,
        minLength: 10,
        prefill: (i) => '',
      },
      {
        id: 'assetGaps',
        label: 'Aset yang masih kurang',
        type: 'textarea',
        placeholder: 'Shot yang belum ada / VO belum direkam',
        required: false,
        prefill: () => '',
      },
    ],
    validate: (item) => {
      const hasRef = item.localAssets.length > 0;
      const hasShots = item.shots.some((sh) => sh.completed);
      if (!hasRef && !hasShots) return ['Tandai minimal satu shot selesai atau tambah satu referensi aset'];
      return [];
    },
  },
  {
    stage: 'QC',
    title: 'QC',
    intent: 'Periksa sebelum tayang: fakta, privasi, subtitle, cover, file final.',
    fields: [
      {
        id: 'qcNotes',
        label: 'Catatan QC',
        type: 'textarea',
        placeholder: 'Apa yang diperbaiki, apa yang sengaja dibiarkan',
        required: true,
        minLength: 8,
        prefill: () => '',
      },
    ],
    validate: (item) => {
      const open = item.qcChecklist.filter((c) => !c.completed).length;
      if (item.qcChecklist.length === 0) return ['Tambahkan dan selesaikan checklist QC'];
      if (open > 0) return [`${open} item checklist QC belum dicentang`];
      return [];
    },
  },
  {
    stage: 'Ready to Publish',
    title: 'Siap Tayang',
    intent: 'Caption, cover, channel, dan jadwal sudah final. Tinggal unggah manual.',
    fields: [
      {
        id: 'channelPlan',
        label: 'Channel & jadwal',
        type: 'text',
        placeholder: 'TikTok 19:30, Instagram 20:00',
        required: true,
        minLength: 4,
        prefill: (i) => `${i.targetPublishDate || 'tanggal belum diisi'}`,
      },
      {
        id: 'caption',
        label: 'Caption final',
        type: 'textarea',
        placeholder: 'Hook + konteks + pertanyaan',
        required: true,
        minLength: 15,
        prefill: (i) => i.brief.hook,
      },
      {
        id: 'coverText',
        label: 'Teks cover',
        type: 'text',
        placeholder: 'Maks 7 kata',
        required: true,
        minLength: 3,
        prefill: () => '',
      },
    ],
    validate: (item) => (item.targetPublishDate ? [] : ['Isi target publish date']),
  },
  {
    stage: 'Published',
    title: 'Sudah Tayang',
    intent: 'Konfirmasi manual. Tanpa URL, status tidak boleh dianggap tayang.',
    fields: [
      {
        id: 'postUrl',
        label: 'URL postingan',
        type: 'text',
        placeholder: 'https://www.tiktok.com/@...',
        required: true,
        minLength: 10,
        prefill: () => '',
      },
      {
        id: 'publishedAt',
        label: 'Tanggal & jam tayang',
        type: 'date',
        placeholder: '',
        required: true,
        prefill: () => '',
      },
    ],
    validate: (item, output, ) => {
      const url = s(output.postUrl);
      if (!url.startsWith('http')) return ['URL postingan belum valid'];
      return [];
    },
  },
  {
    stage: 'Review & Repurpose',
    title: 'Review & Repurpose',
    intent: 'Lihat hasil, tulis satu pelajaran, lalu putuskan konten turunan.',
    fields: [
      {
        id: 'lesson',
        label: 'Pelajaran dari konten ini',
        type: 'textarea',
        placeholder: 'Apa yang bekerja, apa yang tidak, dan kenapa',
        required: true,
        minLength: 15,
        prefill: () => '',
      },
      {
        id: 'nextAction',
        label: 'Keputusan',
        type: 'text',
        placeholder: 'Ulangi pola ini / perbaiki hook / hentikan series',
        required: true,
        minLength: 5,
        prefill: () => '',
      },
    ],
  },
];

export const STAGE_INDEX: Record<string, number> = CONTENT_STAGES.reduce(
  (acc, stage, idx) => ({ ...acc, [stage]: idx }),
  {} as Record<string, number>
);

export function nextStageOf(stage: ContentStage): ContentStage | null {
  const idx = STAGE_INDEX[stage];
  if (idx === undefined || idx >= CONTENT_STAGES.length - 1) return null;
  return CONTENT_STAGES[idx + 1];
}

export function gateFor(stage: ContentStage): StageGate | undefined {
  return STAGE_GATES.find((g) => g.stage === stage);
}

export function buildDraft(item: ContentItem, stage: ContentStage): Record<string, string> {
  const gate = gateFor(stage);
  const saved = (item.stageHistory || []).find((log) => log.stage === stage)?.output || {};
  const draft: Record<string, string> = {};
  (gate?.fields || []).forEach((field) => {
    draft[field.id] = saved[field.id] ?? field.prefill?.(item) ?? '';
  });
  return draft;
}

export function validateGate(
  item: ContentItem,
  stage: ContentStage,
  draft: Record<string, string>
): string[] {
  const gate = gateFor(stage);
  if (!gate) return [];
  const problems: string[] = [];

  gate.fields.forEach((field) => {
    if (!field.required) return;
    const value = s(draft[field.id]);
    if (!value) {
      problems.push(`${field.label} wajib diisi`);
      return;
    }
    if (field.minLength && value.length < field.minLength) {
      problems.push(`${field.label} minimal ${field.minLength} karakter`);
    }
  });

  if (gate.validate) problems.push(...gate.validate(item, draft));
  return Array.from(new Set(problems));
}

export function summarizeOutput(stage: ContentStage, draft: Record<string, string>): string {
  const gate = gateFor(stage);
  const firstField = gate?.fields.find((f) => s(draft[f.id]));
  if (!firstField) return `Stage ${stage} diselesaikan tanpa catatan`;
  const value = s(draft[firstField.id]);
  return value.length > 90 ? `${value.slice(0, 90)}…` : value;
}

export function jakartaStamp(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')} WIB`;
}

export interface StageCompletionOptions {
  actor: 'user' | 'agent';
  advance: boolean;
  overrideReason?: string;
}

/** Appends a stage log (with timestamp + output) and optionally advances the item. */
export function completeStage(
  item: ContentItem,
  stage: ContentStage,
  output: Record<string, string>,
  options: StageCompletionOptions
): ContentItem {
  const now = jakartaStamp();
  const existing = (item.stageHistory || []).filter((log) => log.stage !== stage);
  const log = {
    id: `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    stage,
    startedAtJakarta: (item.stageHistory || []).find((l) => l.stage === stage)?.startedAtJakarta || now,
    completedAtJakarta: now,
    actor: options.actor,
    summary: summarizeOutput(stage, output),
    output,
    overrideReason: options.overrideReason || '',
  };

  const next = options.advance ? nextStageOf(stage) : null;
  return {
    ...item,
    stage: next || item.stage,
    stageHistory: [...existing, log].sort(
      (a, b) => (STAGE_INDEX[a.stage] ?? 0) - (STAGE_INDEX[b.stage] ?? 0)
    ),
    updatedAt: now,
  };
}

export function stageLogFor(item: ContentItem, stage: ContentStage) {
  return (item.stageHistory || []).find((log) => log.stage === stage);
}

export function publishedUrlFrom(pubs: ContentPublication[]): string {
  return pubs.find((p) => p.status === 'Published' && p.actualPostUrl)?.actualPostUrl || '';
}
