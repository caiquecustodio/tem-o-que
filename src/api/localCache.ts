/**
 * Cache local (IndexedDB) do último estado conhecido da loja.
 * Serve para abrir o app instantaneamente e para continuar utilizável sem rede.
 * Toda falha é silenciosa: sem cache o app apenas volta ao comportamento normal.
 */
const DB_NAME = 'tem-o-que-cache';
const STORE_NAME = 'kv';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  try {
    const database = await openDatabase();
    return await new Promise<T | null>((resolve) => {
      const request = action(database.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
      request.onsuccess = () => { resolve(request.result ?? null); database.close(); };
      request.onerror = () => { resolve(null); database.close(); };
    });
  } catch {
    return null;
  }
}

export const localCache = {
  get: <T>(key: string) => withStore<T>('readonly', (store) => store.get(key)),
  set: (key: string, value: unknown) => withStore('readwrite', (store) => store.put(value, key)),
  remove: (key: string) => withStore('readwrite', (store) => store.delete(key)),
  clear: () => withStore('readwrite', (store) => store.clear()),
};
