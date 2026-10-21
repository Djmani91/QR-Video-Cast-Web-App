type CacheEntry = {
  name: string;
  uri: string;
  directory?: boolean;
  delete(): void;
};

const transferCopy = /^framecast-transfer-\d{10,17}-[a-z0-9]{1,7}(?:\.[a-zA-Z0-9]{1,8})?$/;
const convertedCopy = /^framecast-converted-\d{10,17}-[a-z0-9]{1,7}\.mp4$/;
const receiverDirectory = /^framecast-receiver-[a-z0-9]{8,40}$/;

/** Only our generated copies/receiver folders directly inside the app cache.
 * Original picker URIs, nested paths and unrelated cache files are never owned.
 */
export function isFrameCastCacheEntry(cacheUri: string, entry: Pick<CacheEntry, 'name' | 'uri' | 'directory'>): boolean {
  if (!/^file:\/\/\/.+/.test(cacheUri) || /\/\.\.(?:\/|$)/.test(cacheUri)) return false;
  const pickerCache = entry.directory === true && (entry.name === 'ImagePicker' || entry.name === 'ImageManipulator');
  if (!transferCopy.test(entry.name) && !convertedCopy.test(entry.name) && !receiverDirectory.test(entry.name) && !pickerCache) return false;
  const root = cacheUri.replace(/\/+$/, '') + '/';
  return entry.uri.replace(/\/+$/, '') === root + entry.name;
}

export function clearFrameCastCache(cacheUri: string, entries: CacheEntry[]): number {
  if (!/^file:\/\/\/.+/.test(cacheUri) || /\/\.\.(?:\/|$)/.test(cacheUri)) {
    throw new Error('The app’s temporary folder is unavailable. Close and reopen FrameCast, then try again.');
  }
  let removed = 0;
  let failed = 0;
  for (const entry of entries) {
    if (!isFrameCastCacheEntry(cacheUri, entry)) continue;
    try {
      entry.delete();
      removed++;
    } catch {
      failed++;
    }
  }
  if (failed) throw new Error('Some FrameCast temporary copies could not be removed. Close and reopen the app, then try again.');
  return removed;
}
