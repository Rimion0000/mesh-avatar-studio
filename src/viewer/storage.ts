import type { ViewerPackage } from './package';

// Images stay in the browser's storage. No upload or remote asset URL is used.
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('mio-viewer', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('avatar');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function savedAvatar(): Promise<unknown> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('avatar', 'readonly').objectStore('avatar').get('current');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
export async function saveAvatar(pack: ViewerPackage | null): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('avatar', 'readwrite');
      const store = transaction.objectStore('avatar');
      if (pack) store.put(pack, 'current'); else store.delete('current');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
