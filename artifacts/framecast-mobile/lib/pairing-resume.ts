const KEY = 'framecast-pairing-resume';
const TTL = 4 * 60 * 60 * 1000;

type Store = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

/** Only a short-lived room pointer, never media, purchases, or a device identity. */
export function createPairingResume(store: Store, now = Date.now) {
  let pending: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = pending.catch(() => undefined).then(operation);
    pending = next;
    return next;
  };
  return {
    read: () => enqueue(async () => {
      const raw = await store.getItem(KEY);
      if (!raw) return null;
      try {
        const value = JSON.parse(raw);
        if (typeof value.roomId === 'string' && /^[a-f0-9-]{36}$/i.test(value.roomId)
          && typeof value.expiresAt === 'number' && value.expiresAt > now()
          && value.expiresAt <= now() + TTL) return value.roomId as string;
      } catch { /* Invalid markers are discarded, never trusted as pairing proof. */ }
      await store.removeItem(KEY);
      return null;
    }),
    save: (roomId: string) => enqueue(() => store.setItem(KEY, JSON.stringify({ roomId, expiresAt: now() + TTL }))),
    clear: () => enqueue(() => store.removeItem(KEY)),
  };
}
