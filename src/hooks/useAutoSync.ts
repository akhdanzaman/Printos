import { useEffect, useRef, useState } from 'react';
import { createSyncEngine, SyncEngine, SyncSnapshot } from '../utils/syncEngine';
import { loadBridgeConfig } from '../utils/hermesBridge';

const AUTOSYNC_KEY = 'printos_autosync_v1';
const PULL_THROTTLE_MS = 30_000;

const DISABLED_SNAPSHOT: SyncSnapshot = {
  status: 'disabled',
  revision: null,
  lastSyncedAt: null,
  hasPendingChanges: false,
  conflictRemoteRevision: null,
  enabled: false,
};

interface Params {
  state: unknown;
  onRemote: (workspace: unknown) => void;
}

export function useAutoSync({ state, onRemote }: Params) {
  const engineRef = useRef<SyncEngine | null>(null);
  const onRemoteRef = useRef(onRemote);
  const readyRef = useRef(false);
  const applyingRemoteRef = useRef(false);
  const [snapshot, setSnapshot] = useState<SyncSnapshot>(DISABLED_SNAPSHOT);

  onRemoteRef.current = onRemote;

  useEffect(() => {
    const config = loadBridgeConfig();
    if (!config.token) return;

    const stored = (() => {
      try {
        return localStorage.getItem(AUTOSYNC_KEY);
      } catch {
        return null;
      }
    })();
    const enabled = stored !== 'off';

    const engine = createSyncEngine({
      url: config.url,
      token: config.token,
      onRemote: (workspace) => {
        applyingRemoteRef.current = true;
        try {
          onRemoteRef.current(workspace);
        } finally {
          window.setTimeout(() => {
            applyingRemoteRef.current = false;
          }, 100);
        }
      },
    });
    engineRef.current = engine;
    const unsubscribe = engine.subscribe(setSnapshot);
    engine.setEnabled(enabled);

    if (enabled) {
      void engine.pull().finally(() => {
        readyRef.current = true;
      });
    } else {
      readyRef.current = true;
    }

    return () => {
      unsubscribe();
      engine.dispose();
      engineRef.current = null;
      readyRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!readyRef.current || applyingRemoteRef.current) return;
    engineRef.current?.schedulePush(state);
  }, [state]);

  useEffect(() => {
    let lastPull = 0;
    const maybePull = () => {
      const engine = engineRef.current;
      if (!engine || document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastPull < PULL_THROTTLE_MS) return;
      lastPull = now;
      void engine.pull();
    };
    window.addEventListener('focus', maybePull);
    document.addEventListener('visibilitychange', maybePull);
    return () => {
      window.removeEventListener('focus', maybePull);
      document.removeEventListener('visibilitychange', maybePull);
    };
  }, []);

  const setEnabled = (enabled: boolean) => {
    try {
      localStorage.setItem(AUTOSYNC_KEY, enabled ? 'on' : 'off');
    } catch {
      /* preference is best effort */
    }
    engineRef.current?.setEnabled(enabled);
    if (enabled) void engineRef.current?.pull();
  };

  return {
    snapshot,
    setEnabled,
    takeRemote: () => void engineRef.current?.resolveConflict('take-remote'),
    keepLocal: () => void engineRef.current?.resolveConflict('keep-local'),
  };
}
