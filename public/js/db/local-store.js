// Generic IndexedDB wrapper for Crave & Care's local-first data.
// Entity-specific stores (dispatch-store.js, comfort-store.js, etc.) build on top of this.

const DB_NAME = "crave-and-care";
const DB_VERSION = 2;

const STORES = {
  appointments: { keyPath: "id" },
  questions: { keyPath: "id" },
  comfortEntries: { keyPath: "date" },
  dispatches: { keyPath: "id" },
  supportMembers: { keyPath: "id" },
  syncQueue: { keyPath: "id", autoIncrement: true, indexes: ["createdAt"] },
  memories: { keyPath: "id" },
};

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [name, config] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, {
          keyPath: config.keyPath,
          autoIncrement: !!config.autoIncrement,
        });
        for (const indexName of config.indexes || []) {
          store.createIndex(indexName, indexName);
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function tx(db, storeName, mode) {
  return db.transaction(storeName, mode).objectStore(storeName);
}

export async function getAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = tx(db, storeName, "readonly").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function get(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = tx(db, storeName, "readonly").get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function put(storeName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = tx(db, storeName, "readwrite").put(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function remove(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = tx(db, storeName, "readwrite").delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function queryByIndex(storeName, indexName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = tx(db, storeName, "readonly").index(indexName).getAll(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function clearAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = tx(db, storeName, "readwrite").clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
