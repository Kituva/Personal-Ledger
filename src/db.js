/**
 * IndexedDB, wrapped just enough to be pleasant. No dependencies.
 *
 * One store, one index. At this scale (a few thousand rows over years) the
 * whole table loads into memory on boot and every mutation writes through —
 * far simpler than querying per view, and fast enough that you'd never notice
 * the difference.
 */

import { DEFAULT_CATS } from "./categories.js";

const DB_NAME = "ledger";
/* v2 added the categories store, v3 the meta store behind the Google Sheet
   push. Each upgrade only creates what it needs — transactions are never read,
   rewritten or migrated, so an existing install comes through with every entry
   exactly as it was. */
const DB_VERSION = 3;
const STORE = "transactions";
const CATS = "categories";
const META = "meta";

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
      /* Seeded inside the upgrade transaction, so a fresh install and an
         upgrade from v1 land in exactly the same state. Guarded by the store's
         own absence, so a later version bump can never re-seed over edits. */
      if (!db.objectStoreNames.contains(CATS)) {
        const store = db.createObjectStore(CATS, { keyPath: "id" });
        DEFAULT_CATS.forEach((c) => store.add(c));
      }
      /* Where the sheet's address, code and last-push time live. Keys are
         out of line because none of these values carries an id of its own. */
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Database blocked by another tab."));
  });
  return dbPromise;
}

function run(mode, fn, name = STORE) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(name, mode);
        const store = tx.objectStore(name);
        let result;
        try {
          result = fn(store);
        } catch (err) {
          reject(err);
          return;
        }
        /* Unwrap a request, pass anything else straight through. `??` would
           not do: a get on a missing key leaves `result` undefined on the
           request, and the fallback would hand back the request itself. */
        tx.oncomplete = () => resolve(result instanceof IDBRequest ? result.result : result);
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

export const getAllCats = () => run("readonly", (s) => s.getAll(), CATS);

export const putCat = (cat) => run("readwrite", (s) => s.put(cat), CATS);

export const removeCat = (id) => run("readwrite", (s) => s.delete(id), CATS);

export const bulkPutCats = (list) =>
  run("readwrite", (s) => { list.forEach((c) => s.put(c)); }, CATS);

/* The sheet connection. `clear` above empties transactions only, so Start
   fresh keeps you connected — and the push's removal guard is what stands
   between that and an emptied archive. */
export const getMeta = (key) => run("readonly", (s) => s.get(key), META);

export const setMeta = (key, value) => run("readwrite", (s) => s.put(value, key), META);

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
