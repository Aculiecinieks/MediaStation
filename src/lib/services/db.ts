import { isVideoFile } from '../constants';

export const DB_NAME = 'VideoPlayerDB';
export const DB_VERSION = 1;
export const HANDLE_STORE = 'directoryHandles';
export const SAVE_FILE_KEY = 'currentSaveFile';

let db: IDBDatabase | null = null;

export function initDB(): Promise<IDBDatabase> {
  if (db) return Promise.resolve(db);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(HANDLE_STORE)) {
        database.createObjectStore(HANDLE_STORE);
      }
    };
  });
}

export function getHandleFromDB(key: string): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!db) return resolve(null);
    const transaction = db.transaction([HANDLE_STORE], 'readonly');
    const store = transaction.objectStore(HANDLE_STORE);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function storeDirectoryHandle(key: string, handle: any): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) return resolve();
    const transaction = db.transaction([HANDLE_STORE], 'readwrite');
    const store = transaction.objectStore(HANDLE_STORE);
    const request = store.put(handle, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function deleteHandle(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) return resolve();
    const transaction = db.transaction([HANDLE_STORE], 'readwrite');
    const store = transaction.objectStore(HANDLE_STORE);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getDirectoryHandle(key: string): Promise<any> {
  const handle = await getHandleFromDB(key);
  if (!handle) return null;

  if (handle.queryPermission) {
    try {
      const permission = await handle.queryPermission({ mode: 'read' });
      if (permission === 'granted') return handle;

      const newPermission = await handle.requestPermission({ mode: 'read' });
      if (newPermission === 'granted') return handle;

      console.warn(`[HANDLE] Permission denied for handle key: ${key}`);
      return null;
    } catch (e: any) {
      if (e.name === 'SecurityError') {
        console.log(`[HANDLE] Permission required for key ${key} (will prompt user)`);
        return null;
      }
      console.error(`[HANDLE] Failed to request permission for key ${key}:`, e);
      return null;
    }
  }

  return handle;
}

export interface ValidationResult {
  isValid: boolean;
  foundFiles: string[];
  missingFiles: string[];
  matchRate: number;
  matchCount: number;
  error?: unknown;
}

export async function validateDirectoryHandle(dirHandle: any, expectedVideoNames: Array<string | { name: string }> | undefined): Promise<ValidationResult> {
  if (!dirHandle) {
    return { isValid: false, foundFiles: [], missingFiles: (expectedVideoNames as any[])?.map(v => typeof v === 'string' ? v : v.name) || [], matchRate: 0, matchCount: 0 };
  }
  if (!expectedVideoNames || expectedVideoNames.length === 0) {
    return { isValid: true, foundFiles: [], missingFiles: [], matchRate: 1, matchCount: 0 };
  }

  const foundFiles: string[] = [];
  const expectedSet = new Set(expectedVideoNames.map(v => typeof v === 'string' ? v : v.name));

  try {
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && isVideoFile(entry.name)) {
        foundFiles.push(entry.name);
      }
    }

    const matchCount = foundFiles.filter(f => expectedSet.has(f)).length;
    const matchRate = matchCount / expectedVideoNames.length;

    return {
      isValid: matchRate >= 0.5,
      foundFiles,
      missingFiles: Array.from(expectedSet).filter(name => !foundFiles.includes(name)),
      matchRate,
      matchCount
    };
  } catch (e) {
    console.error('Directory validation failed:', e);
    return { isValid: false, foundFiles: [], missingFiles: Array.from(expectedSet), matchRate: 0, matchCount: 0, error: e };
  }
}

export async function promptDirectoryRepair(groupName: string, expectedVideos: Array<string | { name: string }>, allowPartial = false): Promise<any> {
  const { uiState } = await import('../stores/ui.svelte');
  const confirmed = await uiState.showConfirmModal(
    `The saved directory for "${groupName}" doesn't match the expected videos. Would you like to select the correct folder now?`,
    'OK', 'primary'
  );

  if (!confirmed) return null;

  try {
    const dirHandle = await (window as any).showDirectoryPicker();
    const validation = await validateDirectoryHandle(dirHandle, expectedVideos);

    if (validation.isValid || (allowPartial && validation.matchCount > 0)) {
      return dirHandle;
    } else {
      alert(`The selected folder doesn't contain the expected videos for "${groupName}".\n\nExpected files like: ${expectedVideos.slice(0, 3).map(v => typeof v === 'string' ? v : v.name).join(', ')}...\n\nFound files like: ${validation.foundFiles.slice(0, 3).join(', ')}...`);
      return null;
    }
  } catch (e: any) {
    if (e.name !== 'AbortError') {
      console.error('[REPAIR] Directory selection failed:', e);
    }
    return null;
  }
}
