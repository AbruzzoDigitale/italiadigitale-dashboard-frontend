/* ============================================================
   DB.JS — Storage offline-first con IndexedDB
   Fallback a localStorage per ambienti senza IDB
   ============================================================ */

const DB_NAME = 'abruzzodigitale_preventivatore';
const DB_VERSION = 2;
const STORES = ['products', 'clients', 'quotes', 'users', 'settings', 'workitems'];

const DB = {
  _db: null,

  async open() {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        STORES.forEach(s => {
          if (!db.objectStoreNames.contains(s)) {
            db.createObjectStore(s, { keyPath: 'id', autoIncrement: true });
          }
        });
      };
      req.onsuccess = () => { this._db = req.result; resolve(req.result); };
    });
  },

  async all(store) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async get(store, id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async put(store, obj) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).put(obj);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async delete(store, id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async clear(store) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  /** Setting key/value rapido */
  async getSetting(key, fallback = null) {
    const all = await this.all('settings');
    const found = all.find(s => s.key === key);
    return found ? found.value : fallback;
  },
  async setSetting(key, value) {
    const all = await this.all('settings');
    const existing = all.find(s => s.key === key);
    if (existing) {
      existing.value = value;
      await this.put('settings', existing);
    } else {
      await this.put('settings', { key, value });
    }
  }
};

window.DB = DB;
