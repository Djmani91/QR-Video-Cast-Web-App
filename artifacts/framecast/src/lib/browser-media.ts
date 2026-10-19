// Memory only: never upload or persist a copy. Bound the whole selection so a
// long film (or a large photo queue) is not copied into the browser's RAM.
export const SELECTION_MEMORY_BUDGET = 32 * 1024 * 1024;
const PROBE_BYTES = 64 * 1024;

export class SelectedMediaAccessError extends Error {
  constructor() {
    super('The phone could not read this selection. Choose the photo or video again. If it is stored in Google Photos, iCloud or another cloud service, download it to this phone first.');
    this.name = 'SelectedMediaAccessError';
  }
}

export function isSelectedMediaAccessError(error: unknown): boolean {
  return error instanceof SelectedMediaAccessError
    || (typeof error === 'object' && error !== null && 'name' in error
      && ['NotReadableError', 'NotFoundError', 'SecurityError'].includes(String(error.name)));
}

export async function assertBrowserFileReadable(file: File): Promise<void> {
  try {
    if (!file.size) throw new SelectedMediaAccessError();
    const firstEnd = Math.min(PROBE_BYTES, file.size);
    const first = await file.slice(0, firstEnd).arrayBuffer();
    if (first.byteLength !== firstEnd) throw new SelectedMediaAccessError();
    if (file.size > firstEnd) {
      const lastStart = Math.max(firstEnd, file.size - PROBE_BYTES);
      const last = await file.slice(lastStart, file.size).arrayBuffer();
      if (last.byteLength !== file.size - lastStart) throw new SelectedMediaAccessError();
    }
  } catch {
    throw new SelectedMediaAccessError();
  }
}

export async function preserveBrowserSelection(
  files: File[],
  isCancelled: () => boolean = () => false,
  options: { liveVideo?: boolean } = {},
): Promise<File[] | null> {
  let remainingBudget = SELECTION_MEMORY_BUDGET;
  const readable: File[] = [];
  for (const file of files) {
    if (isCancelled()) return null;
    try {
      if (!file.size) throw new SelectedMediaAccessError();
      if (options.liveVideo && file.type.startsWith('video/')) {
        // The media element reads this Blob on demand. Copying or probing its
        // tail can make Android/cloud providers fetch the entire movie first.
        // Keep input.files intact; actual decoder/read failures are surfaced
        // by bounded phone-video startup, not by a whole-file preflight.
        readable.push(file);
        continue;
      }
      if (file.size <= remainingBudget) {
        // Read immediately while the picker grant is still held. This File no
        // longer depends on a temporary Android/cloud-provider file handle.
        const bytes = await file.arrayBuffer();
        if (bytes.byteLength !== file.size) throw new SelectedMediaAccessError();
        if (isCancelled()) return null;
        readable.push(new File([bytes], file.name, { type: file.type, lastModified: file.lastModified }));
        remainingBudget -= file.size;
      } else {
        await assertBrowserFileReadable(file);
        readable.push(file);
      }
    } catch {
      if (isCancelled()) return null;
      throw new SelectedMediaAccessError();
    }
  }
  return isCancelled() ? null : readable;
}
