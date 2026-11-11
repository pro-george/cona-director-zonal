// Adăugare, modificare și ștergere pentru datele pe care omul le ține la zi: proiecte, buget, încasări,
// zone și stadiu, livrări, utilaje, cereri de aprobare, sarcini și echipă. Fiecare tabel are o listă fixă
// de câmpuri permise; orice altceva trimis din interfață este ignorat.
import { q, one, run, dayOf, addDays } from "./db.js";
import { kindOf } from "./importer.js";

export class Invalid extends Error {}
const num = (v) => { const n = Number(String(v ?? "").replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) && n >= 0 ? n : 0; };
const str = (v) => String(v ?? "").trim().slice(0, 160);
const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);

const ENTITIES = {
  budget: { table: "erp_budget", fields: { category: [str, "categoria"], budget: [num], actual: [num], committed: [num] } },
  receivable: { table: "erp_receivables", fields: { no: [str], title: [str, "denumirea"], amount: [num], issued: [day], due: [day, "scadența"], paid_at: [day] } },
  delivery: { table: "bim_deliveries", fields: { kind: [str, "ce se livrează"], zone: [str], count: [num], planned: [day, "data planificată"], eta: [day], status: [str], note: [str], truck: [str] } },
  equipment: { table: "erp_equipment", fields: { name: [str, "numele utilajului"], daily_cost: [num], status: [str] } },
  task: { table: "tasks", fields: { title: [str, "sarcina"], owner: [str], due: [day], status: [str], site_id: [(v) => (v ? String(v) : null)] } },
};
function clean(entity, body, partial) {
  const def = ENTITIES[entity]; if (!def) throw new Invalid("Tip de date necunoscut.");
  const out = {};
  for (const [k, [conv, required]] of Object.entries(def.fields)) {
    if (!(k in body)) { if (required && !partial) throw new Invalid(`Completează ${required}.`); continue; }
    const v = conv(body[k]);
    if (required && (v === null || v === "")) throw new Invalid(`Completează ${required}.`);
    out[k] = v;
  }
  if (entity === "delivery" && out.status !== "livrat") out.status = out.eta && out.planned && out.eta > out.planned ? "intarziat" : out.status || "planificat";
  return { def, out };
}
export function create(entity, siteId, body) {
  const { def, out } = clean(entity, body, false);
  if (entity === "task") { out.status = "open"; out.site_id = siteId || out.site_id || null; out.due = out.due || addDays(dayOf(), 2); Object.assign(out, { source: "manual:" + Date.now(), created: Date.now() }); }
  else out.site_id = siteId;
  if (entity === "equipment") out.status = out.status || "activ";
  const keys = Object.keys(out);
  return Number(run(`INSERT INTO ${def.table}(${keys.join(",")}) VALUES(${keys.map(() => "?").join(",")})`, ...keys.map((k) => out[k])).lastInsertRowid);
}
export function update(entity, id, body) {
  const { def, out } = clean(entity, body, true), keys = Object.keys(out);
  if (keys.length) run(`UPDATE ${def.table} SET ${keys.map((k) => k + "=?").join(",")} WHERE id=?`, ...keys.map((k) => out[k]), Number(id));
}
export function remove(entity, id) { const def = ENTITIES[entity]; if (!def) throw new Invalid("Tip de date necunoscut."); run(`DELETE FROM ${def.table} WHERE id=?`, Number(id)); }

/* ---------- proiecte ---------- */
export async function geocode(location) {
  if (!location) return [null, null];
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=5&language=ro&format=json`, { signal: AbortSignal.timeout(6000) });
    const hits = (await r.json()).results || [], hit = hits.find((h) => h.country_code === "RO") || hits[0];
    return hit ? [hit.latitude, hit.longitude] : [null, null];
  } catch { return [null, null]; }
}
export async function createProject(body) {
  const name = str(body.name); if (!name) throw new Invalid("Scrie numele proiectului.");
  const today = dayOf(), id = "p-" + Date.now().toString(36), location = str(body.location), [lat, lon] = await geocode(location);
  run("INSERT INTO sites(id,name,location,client,manager_id,contract,start,finish,ord,lat,lon) VALUES(?,?,?,?,?,?,?,?,?,?,?)", id, name, location, str(body.client), Number(body.manager_id) || null, num(body.contract), day(body.start) || today, day(body.finish) || addDays(today, 180), (one("SELECT MAX(ord) m FROM sites").m || 0) + 1, lat, lon);
  if (Number(body.manager_id)) run("UPDATE users SET site_id=? WHERE id=?", id, Number(body.manager_id));
  return { id, located: lat != null };
}
export async function updateProject(id, body) {
  const s = one("SELECT * FROM sites WHERE id=?", id); if (!s) throw new Invalid("Proiectul nu există.");
  const name = str(body.name ?? s.name); if (!name) throw new Invalid("Scrie numele proiectului.");
  const location = str(body.location ?? s.location); let { lat, lon } = s;
  if (location !== s.location) [lat, lon] = await geocode(location);
  const manager = "manager_id" in body ? Number(body.manager_id) || null : s.manager_id;
  run("UPDATE sites SET name=?, location=?, client=?, contract=?, start=?, finish=?, manager_id=?, lat=?, lon=? WHERE id=?", name, location, str(body.client ?? s.client), "contract" in body ? num(body.contract) : s.contract, day(body.start) || s.start, day(body.finish) || s.finish, manager, lat, lon, id);
  if (manager) run("UPDATE users SET site_id=? WHERE id=?", id, manager);
  return { relocated: location !== s.location };
}
export function deleteProject(id) {
  for (const t of ["reports", "tasks", "drafts", "replans", "meetings", "erp_budget", "erp_receivables", "erp_approvals", "erp_equipment", "bim_elements", "bim_deliveries"]) run(`DELETE FROM ${t} WHERE site_id=?`, id);
  run("DELETE FROM weather_cache WHERE site_id=?", id); run("UPDATE users SET site_id=NULL WHERE site_id=?", id); run("DELETE FROM sites WHERE id=?", id);
}

/* ---------- zone și stadiu (BIM) ---------- */
const spread = (start, end, i, n) => addDays(start, Math.round((Math.max(0, Math.round((new Date(end) - new Date(start)) / 86400000)) * i) / Math.max(1, n - 1)));
export function createZone(siteId, body) {
  const zone = str(body.zone), work = str(body.work) || zone; if (!zone) throw new Invalid("Scrie numele zonei.");
  if (one("SELECT id FROM bim_elements WHERE site_id=? AND zone=? LIMIT 1", siteId, zone)) throw new Invalid("Există deja o zonă cu acest nume.");
  const start = day(body.start) || dayOf(), end = day(body.end) || start, n = Math.max(1, Math.min(300, Math.round(num(body.count)) || 10)), mounted = Math.min(n, Math.round(num(body.mounted)));
  const kind = kindOf(work + " " + zone) || work;
  for (let i = 0; i < n; i++) { const p = spread(start <= end ? start : end, start <= end ? end : start, i, n); run("INSERT INTO bim_elements(site_id,code,kind,zone,planned,baseline,status,mounted_on) VALUES(?,?,?,?,?,?,?,?)", siteId, `Z-${Date.now().toString(36)}-${i + 1}`, kind, zone, p, p, i < mounted ? "montat" : "planificat", i < mounted ? dayOf() : null); }
}
export function updateZone(siteId, zone, body) {
  const els = q("SELECT id, planned, status FROM bim_elements WHERE site_id=? AND zone=? ORDER BY planned, id", siteId, zone);
  if (!els.length) throw new Invalid("Zona nu există.");
  const today = dayOf(), mounted = "mounted" in body ? Math.max(0, Math.min(els.length, Math.round(num(body.mounted)))) : els.filter((e) => e.status === "montat").length;
  els.forEach((e, i) => { if (i < mounted) { if (e.status !== "montat") run("UPDATE bim_elements SET status='montat', mounted_on=? WHERE id=?", today, e.id); } else if (e.status === "montat") run("UPDATE bim_elements SET status='livrat', mounted_on=NULL WHERE id=?", e.id); });
  const rest = els.slice(mounted), start = day(body.start), end = day(body.end);
  if (rest.length && start && end && (start !== rest[0].planned || end !== rest.at(-1).planned)) rest.forEach((e, i) => run("UPDATE bim_elements SET planned=? WHERE id=?", spread(start <= end ? start : end, start <= end ? end : start, i, rest.length), e.id));
  const name = str(body.zone);
  if (name && name !== zone) { run("UPDATE bim_elements SET zone=? WHERE site_id=? AND zone=?", name, siteId, zone); run("UPDATE bim_deliveries SET zone=? WHERE site_id=? AND zone=?", name, siteId, zone); }
}
export function deleteZone(siteId, zone) { run("DELETE FROM bim_elements WHERE site_id=? AND zone=?", siteId, zone); }

/* ---------- cereri de aprobare și echipă ---------- */
export function createApproval(siteId, body, user) {
  const title = str(body.title); if (!title) throw new Invalid("Scrie ce se cere.");
  if (!siteId) throw new Invalid("Alege proiectul.");
  return Number(run("INSERT INTO erp_approvals(site_id,type,title,supplier,amount,category,requested_by,created,status) VALUES(?,?,?,?,?,?,?,?,'pending')", siteId, ["comanda", "situatie_sub", "pontaj", "decont"].includes(body.type) ? body.type : "comanda", title, str(body.supplier), num(body.amount), str(body.category) || null, user.name, dayOf()).lastInsertRowid);
}
export function createUser(body) {
  const name = str(body.name); if (!name) throw new Invalid("Scrie numele.");
  const id = Number(run("INSERT INTO users(name,email,role,pass,site_id) VALUES(?,?,?,?,?)", name, "u" + Date.now() + "@demo.local", "sef", "", body.site_id || null).lastInsertRowid);
  if (body.site_id) run("UPDATE sites SET manager_id=? WHERE id=?", id, body.site_id);
  return id;
}
export function removeUser(id) { run("UPDATE sites SET manager_id=NULL WHERE manager_id=?", Number(id)); run("DELETE FROM users WHERE id=? AND role!='director'", Number(id)); }
export function updateUser(id, body) {
  const name = str(body.name); if (!name) throw new Invalid("Scrie numele.");
  const u = one("SELECT * FROM users WHERE id=?", Number(id)); if (!u) throw new Invalid("Omul nu există.");
  run("UPDATE users SET name=? WHERE id=?", name, u.id);
  for (const [t, c] of [["tasks", "owner"], ["reports", "author"], ["erp_approvals", "requested_by"]]) run(`UPDATE ${t} SET ${c}=? WHERE ${c}=?`, name, u.name);
  if (u.role !== "director" && "site_id" in body) { run("UPDATE sites SET manager_id=NULL WHERE manager_id=?", u.id); run("UPDATE users SET site_id=? WHERE id=?", body.site_id || null, u.id); if (body.site_id) run("UPDATE sites SET manager_id=? WHERE id=?", u.id, body.site_id); }
}
export function updateApproval(id, body) {
  const a = one("SELECT * FROM erp_approvals WHERE id=? AND status='pending'", Number(id)); if (!a) throw new Invalid("Cererea a fost deja rezolvată și nu mai poate fi schimbată.");
  const title = str(body.title ?? a.title); if (!title) throw new Invalid("Scrie ce se cere.");
  run("UPDATE erp_approvals SET title=?, supplier=?, amount=?, category=?, type=?, rec=NULL, rec_reason=NULL WHERE id=?", title, str(body.supplier ?? a.supplier), "amount" in body ? num(body.amount) : a.amount, str(body.category ?? a.category) || null, ["comanda", "situatie_sub", "pontaj", "decont"].includes(body.type) ? body.type : a.type, a.id);
}
export const removeApproval = (id) => run("DELETE FROM erp_approvals WHERE id=? AND status='pending'", Number(id));
export const removeReport = (id) => { run("DELETE FROM tasks WHERE source LIKE ? AND status='open'", `report:${Number(id)}:%`); run("DELETE FROM reports WHERE id=?", Number(id)); };
export const removeMeeting = (id) => { run("DELETE FROM tasks WHERE meeting_id=? AND status='open'", Number(id)); run("DELETE FROM meetings WHERE id=?", Number(id)); };
