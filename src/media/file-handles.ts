// Remembers which local file belongs to which project, so reopening needs a permission click instead of a file picker.
// File System Access handles can only be stored in IndexedDB (not in Supabase: they point at this machine).

const DB = "flitscript";
const STORE = "source-handles";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const request = fn(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  }).finally(() => db.close());
}

export const saveHandle = (projectId: string, handle: FileSystemFileHandle) => run<void>("readwrite", (s) => s.put(handle, projectId));
export const loadHandle = (projectId: string) => run<FileSystemFileHandle | undefined>("readonly", (s) => s.get(projectId));
export const forgetHandle = (projectId: string) => run<void>("readwrite", (s) => s.delete(projectId));

/** The file behind a stored handle, asking the user for read permission again if needed (must run in a click handler). */
export async function fileFromHandle(handle: FileSystemFileHandle): Promise<File | null> {
  const h = handle as FileSystemFileHandle & {
    queryPermission(o: { mode: "read" }): Promise<PermissionState>;
    requestPermission(o: { mode: "read" }): Promise<PermissionState>;
  };
  if ((await h.queryPermission({ mode: "read" })) !== "granted" && (await h.requestPermission({ mode: "read" })) !== "granted") return null;
  try {
    return await handle.getFile();
  } catch {
    return null; // moved or deleted
  }
}

/** Opens Chrome's file picker for a video and returns the file plus its handle; null when dismissed. */
export async function pickVideo(): Promise<{ file: File; handle: FileSystemFileHandle } | null> {
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: "Video", accept: { "video/*": [".mov", ".mp4", ".m4v"] } }],
    });
    return { file: await handle!.getFile(), handle: handle! };
  } catch {
    return null;
  }
}
