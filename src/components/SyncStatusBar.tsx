import { useState } from 'react';
import { AlertTriangle, Check, CloudOff, Loader2, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react';
import { SyncSnapshot } from '../utils/syncEngine';

interface Props {
  snapshot: SyncSnapshot;
  onToggle: (enabled: boolean) => void;
  onTakeRemote: () => void;
  onKeepLocal: () => void;
}

const STATUS_META: Record<
  SyncSnapshot['status'],
  { label: string; dot: string; text: string }
> = {
  disabled: { label: 'Auto-sync mati', dot: 'bg-slate-400', text: 'text-slate-500' },
  idle: { label: 'Siap', dot: 'bg-slate-400', text: 'text-slate-500' },
  syncing: { label: 'Menyinkronkan', dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400' },
  synced: { label: 'Tersinkron', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400' },
  offline: { label: 'Offline', dot: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-400' },
  conflict: { label: 'Konflik', dot: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-400' },
  unauthorized: { label: 'Token ditolak', dot: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-400' },
};

function timeLabel(iso: string | null): string {
  if (!iso) return 'belum pernah';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'belum pernah';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function SyncStatusBar({ snapshot, onToggle, onTakeRemote, onKeepLocal }: Props) {
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[snapshot.status];
  const Icon =
    snapshot.status === 'syncing'
      ? Loader2
      : snapshot.status === 'offline'
      ? WifiOff
      : snapshot.status === 'conflict'
      ? ShieldAlert
      : snapshot.status === 'unauthorized'
      ? AlertTriangle
      : snapshot.status === 'disabled'
      ? CloudOff
      : Check;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Status sinkronisasi PrintOS dengan Hermes"
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-amber-400 transition-colors"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
        <Icon
          className={`w-3.5 h-3.5 ${meta.text} ${
            snapshot.status === 'syncing' ? 'animate-spin' : ''
          }`}
        />
        <span className={`text-[11px] font-semibold hidden sm:inline ${meta.text}`}>
          {meta.label}
        </span>
        {snapshot.revision !== null && (
          <span className="text-[10px] font-mono text-slate-400 hidden md:inline">
            rev {snapshot.revision}
          </span>
        )}
        {snapshot.hasPendingChanges && (
          <RefreshCw className="w-3 h-3 text-amber-500" aria-label="Ada perubahan belum terkirim" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-72 z-50 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-3 space-y-2.5 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-700 dark:text-slate-200">Sinkronisasi</span>
            <button
              type="button"
              onClick={() => onToggle(!snapshot.enabled)}
              className={`px-2 py-0.5 rounded-full font-semibold ${
                snapshot.enabled
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {snapshot.enabled ? 'Aktif' : 'Mati'}
            </button>
          </div>

          <div className="space-y-1 text-slate-500 dark:text-slate-400">
            <div className="flex justify-between">
              <span>Status</span>
              <span className={`font-semibold ${meta.text}`}>{meta.label}</span>
            </div>
            <div className="flex justify-between">
              <span>Revision</span>
              <span className="font-mono">{snapshot.revision ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span>Terakhir</span>
              <span className="font-mono">{timeLabel(snapshot.lastSyncedAt)}</span>
            </div>
            <div className="flex justify-between">
              <span>Perubahan lokal</span>
              <span>{snapshot.hasPendingChanges ? 'belum terkirim' : 'tidak ada'}</span>
            </div>
          </div>

          {snapshot.status === 'conflict' && (
            <div className="rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 p-2 space-y-2">
              <p className="text-rose-700 dark:text-rose-300">
                Server punya revisi lebih baru
                {snapshot.conflictRemoteRevision !== null
                  ? ` (rev ${snapshot.conflictRemoteRevision})`
                  : ''}
                . Perubahan lokalmu masih tersimpan di memori.
              </p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onTakeRemote();
                    setOpen(false);
                  }}
                  className="flex-1 px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-rose-300 dark:border-rose-800 font-semibold text-rose-700 dark:text-rose-300"
                >
                  Muat versi server
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onKeepLocal();
                    setOpen(false);
                  }}
                  className="flex-1 px-2 py-1 rounded-lg bg-rose-600 text-white font-semibold"
                >
                  Timpa dengan lokal
                </button>
              </div>
            </div>
          )}

          {snapshot.status === 'unauthorized' && (
            <p className="text-rose-600 dark:text-rose-300">
              Token bridge ditolak. Perbarui token di panel Hermes Bridge, lalu aktifkan ulang.
            </p>
          )}

          {snapshot.status === 'offline' && (
            <p className="text-slate-500 dark:text-slate-400">
              Tidak bisa menghubungi bridge. Perubahan tetap tersimpan lokal dan akan dikirim saat
              koneksi pulih.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
