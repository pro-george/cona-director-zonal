// Lucru în echipă fără server: datele circulă prin linkuri. Directorul îi trimite șefului de șantier o invitație;
// șeful completează rapoarte și cereri pe telefonul lui și le trimite înapoi tot ca link (WhatsApp, e-mail, SMS).
// Linkul conține chiar datele, codate în adresă: nu trec prin niciun server al aplicației.
import { q, one, run, exec, dayOf, J } from "./db.js";

const enc = (obj) => btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const dec = (s) => { try { return JSON.parse(decodeURIComponent(escape(atob(String(s).replace(/-/g, "+").replace(/_/g, "/"))))); } catch { return null; } };
const base = () => location.origin + location.pathname;
const text = (v, n = 200) => String(v ?? "").slice(0, n);

export function inviteLink(siteId) {
  const s = one("SELECT s.*, u.name AS manager FROM sites s LEFT JOIN users u ON u.id=s.manager_id WHERE s.id=?", siteId);
  if (!s) return null;
  const director = one("SELECT name FROM users WHERE role='director' LIMIT 1")?.name || "";
  return { sef: s.manager || "", link: `${base()}#/invitatie/${enc({ v: 1, t: "inv", site: { id: s.id, name: s.name, location: s.location || "" }, sef: s.manager || "", director })}` };
}

// Telefonul devine "telefonul șefului de șantier" pentru un singur proiect.
export function join(payload, name) {
  const p = dec(payload);
  if (!p || p.t !== "inv" || !p.site?.id) return null;
  for (const t of ["users", "sessions", "sites", "reports", "briefs", "mgmt_reports", "meetings", "tasks", "drafts", "notifications", "automations", "automation_log", "settings", "weather_cache", "replans", "delays", "subs", "sub_log", "erp_equipment", "erp_budget", "erp_receivables", "erp_approvals", "bim_elements", "bim_deliveries"]) exec(`DELETE FROM ${t}`);
  const uid = Number(run("INSERT INTO users(name,email,role,pass,site_id) VALUES(?,?,?,?,?)", text(name || p.sef, 60) || "Șef de șantier", "sef@local", "sef", "", text(p.site.id, 40)).lastInsertRowid);
  run("INSERT INTO sites(id,name,location,client,manager_id,contract,start,finish,ord,lat,lon) VALUES(?,?,?,?,?,?,?,?,?,?,?)", text(p.site.id, 40), text(p.site.name, 80), text(p.site.location, 60), "", uid, 0, dayOf(), dayOf(), 1, null, null);
  for (const [k, v] of [["mode", "own"], ["device", "sef"], ["director", text(p.director, 60)], ["seed_version", 8]]) run("INSERT INTO settings(key,value) VALUES(?,?)", k, JSON.stringify(v));
  return { uid, site: p.site.name };
}

export function reportLink(id) {
  const r = one("SELECT * FROM reports WHERE id=?", Number(id)); if (!r) return null;
  const s = one("SELECT name FROM sites WHERE id=?", r.site_id);
  return { link: `${base()}#/primit/${enc({ v: 1, t: "rep", site_id: r.site_id, site: s?.name || "", author: r.author, day: r.day, ts: r.ts, raw: text(r.raw, 3000), status: r.status, summary: text(r.summary, 300), workers: r.workers, details: J(r.details, {}) })}`, text: `Raport de șantier ${s?.name || ""}, ${r.day}: ${r.summary}` };
}
export function approvalLink(id) {
  const a = one("SELECT * FROM erp_approvals WHERE id=?", Number(id)); if (!a) return null;
  const s = one("SELECT name FROM sites WHERE id=?", a.site_id);
  return { link: `${base()}#/primit/${enc({ v: 1, t: "apr", site_id: a.site_id, site: s?.name || "", by: a.requested_by, created: a.created, type: a.type, title: a.title, supplier: a.supplier, amount: a.amount, category: a.category })}`, text: `Cerere de aprobare ${s?.name || ""}: ${a.title}` };
}

// Pe telefonul directorului: ce conține linkul, înainte de a fi primit.
export function preview(payload) {
  const p = dec(payload); if (!p || !["rep", "apr"].includes(p.t)) return null;
  const s = one("SELECT id, name FROM sites WHERE id=?", p.site_id) || one("SELECT id, name FROM sites WHERE name=?", p.site);
  return { kind: p.t, site: s?.name || p.site, known: !!s, author: p.author || p.by, day: p.day || p.created, summary: p.t === "rep" ? p.summary : `${p.title}, ${Math.round(p.amount || 0).toLocaleString("ro-RO")} lei`, status: p.status };
}
export function receive(payload) {
  const p = dec(payload); if (!p) return { error: "Linkul nu a putut fi citit." };
  const s = one("SELECT id, name FROM sites WHERE id=?", p.site_id) || one("SELECT id, name FROM sites WHERE name=?", p.site);
  if (!s) return { error: `Proiectul „${text(p.site, 80)}” nu există pe acest dispozitiv.` };
  if (p.t === "rep") {
    if (one("SELECT id FROM reports WHERE site_id=? AND ts=? AND author=?", s.id, Number(p.ts), text(p.author, 60))) return { site_id: s.id, kind: "rep", duplicate: true };
    const d = p.details || {}, arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 20).map((x) => text(x, 300)) : []);
    const id = Number(run("INSERT INTO reports(site_id,user_id,author,day,ts,raw,status,summary,workers,details,photos) VALUES(?,?,?,?,?,?,?,?,?,?,'[]')", s.id, null, text(p.author, 60), /^\d{4}-\d{2}-\d{2}$/.test(p.day) ? p.day : dayOf(), Number(p.ts) || Date.now(), text(p.raw, 3000), ["ok", "atentie", "critic"].includes(p.status) ? p.status : "atentie", text(p.summary, 300), typeof p.workers === "number" ? p.workers : null,
      JSON.stringify({ equipment: arr(d.equipment), done: arr(d.done), blockers: arr(d.blockers), needs: arr(d.needs), photoNotes: [] })).lastInsertRowid);
    return { site_id: s.id, kind: "rep", id };
  }
  if (p.t === "apr") {
    if (one("SELECT id FROM erp_approvals WHERE site_id=? AND title=? AND created=? AND requested_by=?", s.id, text(p.title), text(p.created, 10), text(p.by, 60))) return { site_id: s.id, kind: "apr", duplicate: true };
    run("INSERT INTO erp_approvals(site_id,type,title,supplier,amount,category,requested_by,created,status) VALUES(?,?,?,?,?,?,?,?,'pending')", s.id, ["comanda", "situatie_sub", "pontaj", "decont"].includes(p.type) ? p.type : "comanda", text(p.title), text(p.supplier), Math.max(0, Number(p.amount) || 0), text(p.category) || null, text(p.by, 60), /^\d{4}-\d{2}-\d{2}$/.test(p.created) ? p.created : dayOf());
    return { site_id: s.id, kind: "apr" };
  }
  return { error: "Linkul nu conține un raport sau o cerere." };
}
