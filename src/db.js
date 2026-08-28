/**
 * IndexedDB, wrapped just enough to be pleasant. No dependencies.
 *
 * One store, one index. At this scale (a few thousand rows over years) the
 * whole table loads into memory on boot and every mutation writes through —
 * far simpler than querying per view, and fast enough that you'd never notice
 * the difference.
 */

const DB_NAME = "ledger";
const DB_VERSION = 1;
const STORE = "transactions";

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("date", "date");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Database blocked by another tab."));
  });
  return dbPromise;
}

function run(mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        let result;
        try {
          result = fn(store);
        } catch (err) {
          reject(err);
          return;
        }
        tx.oncomplete = () => resolve(result?.result ?? result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

export const getAll = () => run("readonly", (s) => s.getAll());

export const put = (txn) => run("readwrite", (s) => s.put(txn));

export const remove = (id) => run("readwrite", (s) => s.delete(id));

export const clear = () => run("readwrite", (s) => s.clear());

export const bulkPut = (list) =>
  run("readwrite", (s) => {
    list.forEach((t) => s.put(t));
  });

/**
 * Ask the browser not to evict this data under storage pressure.
 *
 * On iOS an installed (Add to Home Screen) PWA is already treated as
 * persistent, so this usually resolves true there and is a no-op. It matters
 * more on desktop Safari and Chrome. Never throws — failure is not fatal.
 */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted) {
      if (await navigator.storage.persisted()) return true;
      if (navigator.storage.persist) return await navigator.storage.persist();
    }
  } catch {
    /* not supported — carry on */
  }
  return false;
}
