// Data layer.
//
// The app talks to `db` only. `db` keeps an in-memory copy of every table and
// writes through to a storage adapter. The shipped adapter is local-first
// (IndexedDB in the browser). A server adapter (e.g. Postgres behind an API,
// see docs/schema.sql) implements the same small interface:
//   loadTable(name) -> rows[]      saveTable(name, rows)
//   putBlob(id, blob)  getBlob(id)  deleteBlob(id)
//
// Every record carries id, createdAt, updatedAt. Append-only tables cannot be
// updated or deleted through this API.

import { uid, nowISO, UserError } from './util.js';

export const TABLES = [
  'users', 'profiles', 'businesses', 'subscriptions', 'sessions', 'emailTokens', 'authAttempts', 'outbox',
  'clients', 'projects', 'projectMembers', 'briefs', 'deliverables',
  'proposals', 'proposalItems', 'contracts', 'changeOrders',
  'files', 'fileVersions', 'feedback', 'revisionRounds', 'approvals',
  'invoices', 'invoiceItems', 'payments',
  'portfolioItems', 'notifications', 'activityLogs', 'reminders', 'aiRuns',
  // Organizations & collaboration
  'workspaceMembers', 'teams', 'projectOrgs', 'tasks', 'messages', 'events',
];
const APPEND_ONLY = new Set(['activityLogs']);

const DB_NAME = 'scopewise';
const DB_VERSION = 1;

class IndexedDBAdapter {
  async open() {
    this.idb = await new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('tables')) d.createObjectStore('tables');
        if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  tx(store, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = this.idb.transaction(store, mode);
      const s = t.objectStore(store);
      let out;
      const req = fn(s);
      if (req) req.onsuccess = () => { out = req.result; };
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Transaction aborted'));
    });
  }
  loadTable(name) { return this.tx('tables', 'readonly', (s) => s.get(name)).then((v) => v || []); }
  saveTable(name, rows) { return this.tx('tables', 'readwrite', (s) => s.put(rows, name)); }
  putBlob(id, blob) { return this.tx('blobs', 'readwrite', (s) => s.put(blob, id)); }
  getBlob(id) { return this.tx('blobs', 'readonly', (s) => s.get(id)); }
  deleteBlob(id) { return this.tx('blobs', 'readwrite', (s) => s.delete(id)); }
  clearAll() { return Promise.all([this.tx('tables', 'readwrite', (s) => s.clear()), this.tx('blobs', 'readwrite', (s) => s.clear())]); }
}

class MemoryAdapter {
  constructor() { this.t = {}; this.b = {}; }
  async open() {}
  async loadTable(n) { return this.t[n] || []; }
  async saveTable(n, rows) { this.t[n] = rows; }
  async putBlob(id, blob) { this.b[id] = blob; }
  async getBlob(id) { return this.b[id]; }
  async deleteBlob(id) { delete this.b[id]; }
  async clearAll() { this.t = {}; this.b = {}; }
}

const mem = {};           // table -> Map(id -> record)
const dirty = new Set();
let adapter;
let saveTimer = null;
let channel = null;
const listeners = new Set();
export let persistent = true;

export async function initStore() {
  try {
    if (!('indexedDB' in window)) throw new Error('no idb');
    adapter = new IndexedDBAdapter();
    await adapter.open();
  } catch (e) {
    console.warn('IndexedDB unavailable, using memory storage', e);
    adapter = new MemoryAdapter();
    persistent = false;
  }
  await Promise.all(TABLES.map(loadTable));
  if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel('scopewise-sync');
    channel.onmessage = async (ev) => {
      const tables = ev.data?.tables || [];
      await Promise.all(tables.filter((t) => TABLES.includes(t)).map(loadTable));
      listeners.forEach((fn) => fn(tables));
    };
  }
}

async function loadTable(name) {
  const rows = await adapter.loadTable(name);
  mem[name] = new Map(rows.map((r) => [r.id, r]));
}

export const onRemoteChange = (fn) => listeners.add(fn);

function scheduleSave(table) {
  dirty.add(table);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 40);
}

export async function flush() {
  clearTimeout(saveTimer);
  const tables = [...dirty];
  dirty.clear();
  if (!tables.length) return;
  await Promise.all(tables.map((t) => adapter.saveTable(t, [...mem[t].values()])));
  channel?.postMessage({ tables });
}

const clone = (r) => (r ? structuredClone(r) : r);
function table(name) {
  const t = mem[name];
  if (!t) throw new Error(`Unknown table ${name}`);
  return t;
}

export const db = {
  get(name, id) { return clone(table(name).get(id)); },
  all(name, pred) {
    const rows = [...table(name).values()];
    return (pred ? rows.filter(pred) : rows).map(clone);
  },
  where(name, match) {
    return db.all(name, (r) => Object.entries(match).every(([k, v]) => r[k] === v));
  },
  find(name, pred) {
    for (const r of table(name).values()) if (pred(r)) return clone(r);
    return null;
  },
  insert(name, rec) {
    const now = nowISO();
    const row = { id: uid(), createdAt: now, updatedAt: now, ...rec };
    if (table(name).has(row.id)) throw new Error('Duplicate id');
    table(name).set(row.id, row);
    scheduleSave(name);
    return clone(row);
  },
  update(name, id, patch) {
    if (APPEND_ONLY.has(name)) throw new UserError('This record is permanent and cannot be changed.');
    const cur = table(name).get(id);
    if (!cur) throw new UserError('That record no longer exists.');
    const row = { ...cur, ...patch, id, createdAt: cur.createdAt, updatedAt: nowISO() };
    table(name).set(id, row);
    scheduleSave(name);
    return clone(row);
  },
  remove(name, id) {
    if (APPEND_ONLY.has(name)) throw new UserError('This record is permanent and cannot be deleted.');
    table(name).delete(id);
    scheduleSave(name);
  },
  count(name, pred) { let n = 0; for (const r of table(name).values()) if (!pred || pred(r)) n++; return n; },
};

export const blobs = {
  put: (id, blob) => adapter.putBlob(id, blob),
  get: (id) => adapter.getBlob(id),
  remove: (id) => adapter.deleteBlob(id),
};

export async function resetAll() {
  await adapter.clearAll();
  TABLES.forEach((t) => { mem[t] = new Map(); });
  channel?.postMessage({ tables: TABLES });
}
