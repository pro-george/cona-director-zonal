// Baza de date rulează în browser: SQLite compilat în WebAssembly (sql.js), salvat în IndexedDB pe dispozitiv.
// Tot ce e "ERP" și "BIM" stă aici ca simulare; aplicația le citește doar prin core/connectors/*,
// ca să poată fi înlocuite cu sistemele reale atunci când aplicația primește un server.
import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";

let _db = null, saveTimer = null;
const IDB = "director-zonal", STORE = "files", KEY = "app.db";
const idb = () => new Promise((res, rej) => { const r = indexedDB.open(IDB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function idbGet() { try { const d = await idb(); return await new Promise((res) => { const g = d.transaction(STORE).objectStore(STORE).get(KEY); g.onsuccess = () => res(g.result || null); g.onerror = () => res(null); }); } catch { return null; } }
async function idbPut(bytes) { try { const d = await idb(); await new Promise((res) => { const t = d.transaction(STORE, "readwrite"); t.objectStore(STORE).put(bytes, KEY); t.oncomplete = res; t.onerror = res; }); } catch { /* fără IndexedDB datele trăiesc doar cât e deschisă pagina */ } }
const persist = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => _db && idbPut(_db.export()), 400); };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE, role TEXT, pass TEXT, site_id TEXT);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER, expires INTEGER);
CREATE TABLE IF NOT EXISTS sites (id TEXT PRIMARY KEY, name TEXT, location TEXT, client TEXT, manager_id INTEGER, contract REAL, start TEXT, finish TEXT, ord INTEGER, lat REAL, lon REAL);
CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY, site_id TEXT, user_id INTEGER, author TEXT, day TEXT, ts INTEGER, raw TEXT, status TEXT, summary TEXT, workers INTEGER, details TEXT, photos TEXT);
CREATE TABLE IF NOT EXISTS briefs (day TEXT PRIMARY KEY, ts INTEGER, data TEXT, auto INTEGER);
CREATE TABLE IF NOT EXISTS mgmt_reports (id INTEGER PRIMARY KEY, d_from TEXT, d_to TEXT, ts INTEGER, text TEXT, auto INTEGER);
CREATE TABLE IF NOT EXISTS meetings (id INTEGER PRIMARY KEY, site_id TEXT, title TEXT, day TEXT, ts INTEGER, raw TEXT, summary TEXT, decisions TEXT);
CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY, site_id TEXT, meeting_id INTEGER, title TEXT, owner TEXT, due TEXT, status TEXT, source TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS drafts (id INTEGER PRIMARY KEY, ts INTEGER, kind TEXT, ref TEXT, site_id TEXT, recipient TEXT, title TEXT, body TEXT, status TEXT);
CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY, user_id INTEGER, ts INTEGER, text TEXT, read INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS automations (key TEXT PRIMARY KEY, enabled INTEGER, last_run INTEGER, last_result TEXT);
CREATE TABLE IF NOT EXISTS automation_log (id INTEGER PRIMARY KEY, ts INTEGER, key TEXT, title TEXT, detail TEXT, site_id TEXT, minutes INTEGER);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS weather_cache (site_id TEXT PRIMARY KEY, ts INTEGER, source TEXT, data TEXT);
-- ERP simulat
CREATE TABLE IF NOT EXISTS erp_budget (id INTEGER PRIMARY KEY, site_id TEXT, category TEXT, budget REAL, actual REAL, committed REAL);
CREATE TABLE IF NOT EXISTS erp_receivables (id INTEGER PRIMARY KEY, site_id TEXT, no TEXT, title TEXT, amount REAL, issued TEXT, due TEXT, paid_at TEXT);
CREATE TABLE IF NOT EXISTS erp_approvals (id INTEGER PRIMARY KEY, site_id TEXT, type TEXT, title TEXT, supplier TEXT, amount REAL, category TEXT, requested_by TEXT, created TEXT, status TEXT, decided_at INTEGER, decided_by TEXT, note TEXT, rec TEXT, rec_reason TEXT, auto INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS erp_equipment (id INTEGER PRIMARY KEY, site_id TEXT, name TEXT, daily_cost REAL, status TEXT);
CREATE TABLE IF NOT EXISTS replans (id INTEGER PRIMARY KEY, ts INTEGER, site_id TEXT, sig TEXT, data TEXT, status TEXT, decided_at INTEGER, decided_by TEXT);
-- BIM simulat
CREATE TABLE IF NOT EXISTS bim_elements (id INTEGER PRIMARY KEY, site_id TEXT, code TEXT, kind TEXT, zone TEXT, planned TEXT, baseline TEXT, status TEXT, mounted_on TEXT);
CREATE TABLE IF NOT EXISTS bim_deliveries (id INTEGER PRIMARY KEY, site_id TEXT, planned TEXT, eta TEXT, truck TEXT, kind TEXT, zone TEXT, count INTEGER, status TEXT, note TEXT);
`;

export async function openDb({ fresh = false } = {}) {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const saved = fresh ? null : await idbGet();
  // Când se schimbă structura tabelelor, crește SCHEMA_VERSION: bazele vechi de pe dispozitive sunt înlocuite cu una nouă.
  const SCHEMA_VERSION = 2;
  try {
    _db = saved ? new SQL.Database(saved) : new SQL.Database();
    if (saved && _db.exec("PRAGMA user_version")[0].values[0][0] !== SCHEMA_VERSION) _db = new SQL.Database();
    _db.exec(SCHEMA);
  } catch { _db = new SQL.Database(); _db.exec(SCHEMA); }
  _db.exec("PRAGMA user_version = " + SCHEMA_VERSION);
}
const clean = (p) => p.map((v) => (v === undefined ? null : v));
export const q = (sql, ...p) => { const st = _db.prepare(sql); st.bind(clean(p)); const rows = []; while (st.step()) rows.push(st.getAsObject()); st.free(); return rows; };
export const one = (sql, ...p) => q(sql, ...p)[0];
export const run = (sql, ...p) => { _db.run(sql, clean(p)); const id = _db.exec("SELECT last_insert_rowid()")[0].values[0][0]; persist(); return { lastInsertRowid: id }; };
export const exec = (sql) => { _db.exec(sql); persist(); };
export const J = (s, fallback) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };

export const TZ = "Europe/Bucharest";
export const dayOf = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
export const hm = (d = new Date()) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
export const addDays = (day, n) => { const d = new Date(day + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const dow = (day) => new Date(day + "T12:00:00Z").getUTCDay();
export const daysBetween = (a, b) => Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 86400000);
export const roDay = (day) => new Intl.DateTimeFormat("ro-RO", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(day + "T12:00:00Z"));
export const lei = (n) => new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(Math.round(n || 0)) + " lei";

export const setting = (key, fallback) => { const r = one("SELECT value FROM settings WHERE key=?", key); return r ? J(r.value, fallback) : fallback; };
export const setSetting = (key, value) => run("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, JSON.stringify(value));
