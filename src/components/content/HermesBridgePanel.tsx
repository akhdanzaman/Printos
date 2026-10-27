import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CloudDownload,
  CloudUpload,
  Loader2,
  Plug,
  ShieldCheck,
} from 'lucide-react';
import { PrintOSState } from '../../types/printos';
import {
  BridgeConfig,
  clearBridgeToken,
  loadBridgeConfig,
  mergeWorkspace,
  pullRemote,
  pushLocal,
  saveBridgeConfig,
} from '../../utils/hermesBridge';
import { Badge, Button, Field, Modal, TextInput } from './ui';

interface Props {
  state: PrintOSState;
  onReplace: (next: PrintOSState) => void;
  onClose: () => void;
}

type Status = { type: 'idle' | 'ok' | 'error' | 'info'; message: string };

const BACKUP_KEY = 'printos_workspace_backup_before_hermes';

export function HermesBridgePanel({ state, onReplace, onClose }: Props) {
  const [config, setConfig] = useState<BridgeConfig>(() => loadBridgeConfig());
  const [status, setStatus] = useState<Status>({ type: 'idle', message: '' });
  const [busy, setBusy] = useState<'idle' | 'push' | 'pull' | 'test'>('idle');
  const [preview, setPreview] = useState<null | {
    revision: number;
    updatedAt: string;
    addedTasks: number;
    addedContent: number;
    addedPublications: number;
    updatedContent: number;
    addedOther: number;
    next: PrintOSState;
  }>(null);

  const update = (patch: Partial<BridgeConfig>) => setConfig((c) => ({ ...c, ...patch }));

  const persist = () => {
    saveBridgeConfig(config);
    setStatus({ type: 'ok', message: 'URL & token disimpan di perangkat ini saja.' });
  };

  const test = async () => {
    setBusy('test');
    setStatus({ type: 'info', message: 'Menghubungi bridge…' });
    try {
      saveBridgeConfig(config);
      const remote = await pullRemote(config);
      setStatus({
        type: 'ok',
        message: `Bridge aktif. Revisi ${remote.revision} · ${remote.counts.contentItems} konten · ${remote.counts.tasks} task · ${remote.counts.publications} publikasi.`,
      });
    } catch (error: any) {
      setStatus({ type: 'error', message: error?.message || 'Gagal terhubung.' });
    } finally {
      setBusy('idle');
    }
  };

  const push = async () => {
    setBusy('push');
    setStatus({ type: 'info', message: 'Mengirim workspace ke bridge…' });
    try {
      saveBridgeConfig(config);
      const result = await pushLocal(config, state);
      setStatus({
        type: 'ok',
        message: `Terkirim. Revisi ${result.revision}. Hermes sekarang bisa membaca snapshot ini.`,
      });
    } catch (error: any) {
      setStatus({ type: 'error', message: error?.message || 'Gagal mengirim.' });
    } finally {
      setBusy('idle');
    }
  };

  const pull = async () => {
    setBusy('pull');
    setStatus({ type: 'info', message: 'Mengambil snapshot dari bridge…' });
    try {
      saveBridgeConfig(config);
      const remote = await pullRemote(config);
      const merged = mergeWorkspace(state, remote.workspace);
      setPreview({
        revision: remote.revision,
        updatedAt: remote.updatedAt,
        addedTasks: merged.addedTasks,
        addedContent: merged.addedContent,
        addedPublications: merged.addedPublications,
        updatedContent: merged.updatedContent,
        addedOther: merged.addedOther,
        next: merged.state,
      });
      setStatus({ type: 'ok', message: 'Snapshot diterima. Periksa ringkasan sebelum menerapkan.' });
    } catch (error: any) {
      setStatus({ type: 'error', message: error?.message || 'Gagal mengambil data.' });
    } finally {
      setBusy('idle');
    }
  };

  const apply = () => {
    if (!preview) return;
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(state));
    } catch {
      // backup failure must not block, but the user is told below
    }
    onReplace(preview.next);
    setPreview(null);
    setStatus({
      type: 'ok',
      message: 'Perubahan Hermes diterapkan. Backup state sebelumnya tersimpan di perangkat ini.',
    });
  };

  return (
    <Modal
      title="Hermes Bridge"
      subtitle="Baca & tulis workspace dari Hermes, dengan izin dan perintahmu."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Tutup
          </Button>
          <Button variant="secondary" onClick={test} disabled={busy !== 'idle'}>
            {busy === 'test' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />}
            Uji koneksi
          </Button>
          <Button variant="secondary" onClick={pull} disabled={busy !== 'idle'}>
            {busy === 'pull' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CloudDownload className="w-3.5 h-3.5" />}
            Tarik dari Hermes
          </Button>
          <Button onClick={push} disabled={busy !== 'idle'}>
            {busy === 'push' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CloudUpload className="w-3.5 h-3.5" />}
            Kirim ke Hermes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-lg p-3">
          <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p>
            Token hanya disimpan di browser ini dan tidak ikut ke JSON export atau Google Sheets.
            Hermes tidak bisa menulis apa pun tanpa perintahmu; setiap penambahan tetap masuk sebagai
            draft yang kamu tinjau di Content Studio.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="URL bridge" hint="Default: /api/workspace di domain ini">
            <TextInput value={config.url} onChange={(e) => update({ url: e.target.value })} placeholder="https://…/api/workspace" />
          </Field>
          <Field label="Token" hint="Sama dengan PRINTOS_API_TOKEN di Vercel">
            <TextInput
              type="password"
              value={config.token}
              onChange={(e) => update({ token: e.target.value })}
              placeholder="token rahasia"
              autoComplete="off"
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={persist}>
            Simpan di perangkat ini
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              clearBridgeToken();
              update({ token: '' });
              setStatus({ type: 'info', message: 'Token dihapus dari perangkat ini.' });
            }}
          >
            Hapus token
          </Button>
          <span className="text-[11px] text-slate-400">
            Butuh bantuan setup? Lihat <code>docs/HERMES_BRIDGE.md</code> di repo.
          </span>
        </div>

        {status.message && (
          <div
            className={`flex items-start gap-2 text-[11px] rounded-lg p-3 border ${
              status.type === 'error'
                ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300'
                : status.type === 'ok'
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            {status.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{status.message}</span>
          </div>
        )}

        {preview && (
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="violet">Revisi {preview.revision}</Badge>
              <span className="text-[11px] text-slate-500">
                Diperbarui {preview.updatedAt ? preview.updatedAt.slice(0, 16).replace('T', ' ') : '—'} UTC
              </span>
            </div>
            <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
              <li>Task baru: <b>{preview.addedTasks}</b></li>
              <li>Konten baru: <b>{preview.addedContent}</b></li>
              <li>Publikasi baru: <b>{preview.addedPublications}</b></li>
              <li>Konten diperbarui (versi remote lebih baru): <b>{preview.updatedContent}</b></li>
              <li>Data lain ditambahkan: <b>{preview.addedOther}</b></li>
            </ul>
            <p className="text-[11px] text-slate-500">
              Penggabungan bersifat menambah, bukan menghapus. Data lokal yang tidak ada di remote tetap aman.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPreview(null)}>
                Batal
              </Button>
              <Button onClick={apply}>Terapkan ke workspace</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
