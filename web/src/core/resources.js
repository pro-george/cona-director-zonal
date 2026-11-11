// Resurse: utilaje închiriate (cât costă cât stau și unde ar fi mai de folos), oameni pe șantiere (din rapoartele zilnice)
// și subcontractori (efectiv promis față de efectiv venit). Propunerile sunt reguli simple, la vedere.
import { q, one, run, J, dayOf, addDays, daysBetween, lei } from "./db.js";
import * as bim from "./connectors/bim.js";
import { sitesAll, siteById, latestReports } from "./data.js";
import { params } from "./value.js";

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Ține data de la care un utilaj stă: se pune când trece în așteptare și se șterge când reintră în lucru.
export function normalize(today = dayOf()) {
  run("UPDATE erp_equipment SET idle_since=? WHERE status='in_asteptare' AND idle_since IS NULL", today);
  run("UPDATE erp_equipment SET idle_since=NULL WHERE status!='in_asteptare'");
}

export function equipment(today = dayOf()) {
  normalize(today);
  const sites = sitesAll(), reports = latestReports(today);
  return q("SELECT e.*, s.name AS site FROM erp_equipment e LEFT JOIN sites s ON s.id=e.site_id ORDER BY (e.status='in_asteptare') DESC, e.daily_cost DESC").map((e) => {
    const idleDays = e.status === "in_asteptare" ? Math.max(1, daysBetween(e.idle_since || today, today) + 1) : 0;
    let advice = null;
    if (idleDays) {
      const late = bim.deliveries(e.site_id, addDays(today, -7), addDays(today, 14)).filter((d) => d.late && d.eta).sort((a, b) => (a.eta < b.eta ? -1 : 1))[0];
      const wait = late ? Math.max(0, daysBetween(today, late.eta)) : 0;
      // Un alt șantier care e în urmă cu montajul și nu e blocat poate folosi utilajul.
      const other = sites.find((s) => s.id !== e.site_id && bim.physical(s.id, today).lag > 0 && reports[s.id]?.status !== "critic" && !one("SELECT id FROM erp_equipment WHERE site_id=? AND name=?", s.id, e.name));
      if (wait >= 2) advice = { text: `Livrarea care îl ține pe loc e estimată pe ${late.eta}. Eliberat până atunci, economisești ${wait} ${wait === 1 ? "zi" : "zile"} de chirie: ${lei(wait * e.daily_cost)}.`, saving: wait * e.daily_cost };
      if (other) advice = { ...(advice || { saving: 0 }), text: (advice ? advice.text + " " : "") + `Alternativ, ${other.name} este în urmă cu montajul și l-ar putea folosi.`, moveTo: other.id, moveName: other.name };
      if (!advice) advice = { text: "Nu am găsit unde să fie mutat. Dacă nu reintră în lucru mâine, merită eliberat.", saving: 0 };
    }
    return { ...e, idleDays, idleCost: idleDays * e.daily_cost, advice };
  });
}
export function moveEquipment(id, siteId) { if (!siteById(siteId)) return false; run("UPDATE erp_equipment SET site_id=?, status='activ', idle_since=NULL WHERE id=?", siteId, Number(id)); return true; }
export const releaseEquipment = (id) => run("DELETE FROM erp_equipment WHERE id=?", Number(id));

export function people(today = dayOf()) {
  const p = params(), reports = latestReports(today);
  return sitesAll().map((s) => {
    const hist = q("SELECT day, workers FROM reports WHERE site_id=? AND workers IS NOT NULL AND day>=? ORDER BY ts", s.id, addDays(today, -7));
    const r = reports[s.id], now = r?.workers ?? null, avg = hist.length ? Math.round(hist.reduce((a, h) => a + h.workers, 0) / hist.length) : null;
    const stopped = r?.status === "critic" && now;
    return { id: s.id, name: s.name, now, avg, day: r?.day || null, status: r?.status || "none", stopped: !!stopped, idleCost: stopped ? now * p.laborDay : 0, lag: bim.physical(s.id, today).lag };
  });
}

/* ---------- subcontractori ---------- */
export function saveSub(body) {
  const name = String(body.name || "").trim().slice(0, 80); if (!name) return "Scrie numele subcontractorului.";
  if (!siteById(body.site_id)) return "Alege proiectul.";
  const v = [body.site_id, name, String(body.trade || "").trim().slice(0, 60), Math.max(0, Math.round(Number(body.promised) || 0))];
  if (body.id) run("UPDATE subs SET site_id=?, name=?, trade=?, promised=? WHERE id=?", ...v, Number(body.id)); else run("INSERT INTO subs(site_id,name,trade,promised) VALUES(?,?,?,?)", ...v);
  return null;
}
export const removeSub = (id) => { run("DELETE FROM sub_log WHERE sub_id=?", Number(id)); run("DELETE FROM subs WHERE id=?", Number(id)); };
export function logSub(id, body, ref) {
  const s = one("SELECT * FROM subs WHERE id=?", Number(id)); if (!s) return false;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(body.day) ? body.day : dayOf(), source = ref || `manual:${id}:${day}`;
  const present = Math.max(0, Math.round(Number(body.present) || 0)), promised = Math.max(0, Math.round(Number(body.promised) || s.promised || 0));
  const old = one("SELECT id FROM sub_log WHERE sub_id=? AND day=?", s.id, day);
  if (old) { if (ref) return false; run("UPDATE sub_log SET present=?, promised=?, note=? WHERE id=?", present, promised, String(body.note || "").slice(0, 200), old.id); }
  else run("INSERT INTO sub_log(sub_id,day,promised,present,note,source_ref) VALUES(?,?,?,?,?,?)", s.id, day, promised, present, String(body.note || "").slice(0, 200), source);
  return true;
}
// Din rapoarte: „a venit cu 3 oameni în loc de 8” sau „3 din 8”, legat de subcontractorul a cărui meserie apare în frază.
export function detectSubs(today = dayOf()) {
  let n = 0;
  for (const r of q("SELECT * FROM reports WHERE day>=?", addDays(today, -14))) {
    const subs = q("SELECT * FROM subs WHERE site_id=?", r.site_id); if (!subs.length) continue;
    for (const sentence of [...(J(r.details, {}).blockers || []), ...String(r.raw || "").split(/(?<=[.!?])\s+/)]) {
      const t = norm(sentence), m = t.match(/(\d+)\s*(?:oameni|muncitori|electricieni|instalatori)?\s*(?:in loc de|din(?: cei)?)\s*(\d+)/) || (/(nu au venit|nu a venit|nu s-au prezentat).*(deloc)?/.test(t) ? ["", "0", ""] : null);
      if (!m) continue;
      const sub = subs.find((s) => norm(s.trade + " " + s.name).split(/\s+/).filter((w) => w.length > 4).some((w) => t.includes(w.slice(0, 6))));
      if (sub && logSub(sub.id, { day: r.day, present: Number(m[1]), promised: Number(m[2]) || sub.promised, note: `Din raportul lui ${r.author}: „${sentence.slice(0, 140)}”` }, `rep:${r.id}:${sub.id}`)) n++;
    }
  }
  return n;
}
export function subs(today = dayOf()) {
  return q("SELECT b.*, s.name AS site FROM subs b LEFT JOIN sites s ON s.id=b.site_id ORDER BY b.id").map((b) => {
    const log = q("SELECT * FROM sub_log WHERE sub_id=? ORDER BY day DESC LIMIT 20", b.id);
    const prom = log.reduce((a, l) => a + l.promised, 0), pres = log.reduce((a, l) => a + Math.min(l.present, l.promised), 0);
    const score = prom ? Math.round((pres / prom) * 100) : null, short = log.filter((l) => l.present < l.promised).length;
    return { ...b, log, score, short, days: log.length, last: log[0] || null, grade: score === null ? "none" : score >= 90 ? "ok" : score >= 70 ? "atentie" : "critic" };
  });
}

export function alertsFor(today = dayOf()) {
  const out = [];
  for (const e of equipment(today).filter((e) => e.idleDays)) out.push({ sev: e.idleDays >= 2 ? "crit" : "warn", source: "Resurse", site_id: e.site_id, site: e.site || "", text: `${e.name} stă de ${e.idleDays} ${e.idleDays === 1 ? "zi" : "zile"}: ${lei(e.idleCost)} până acum, ${lei(e.daily_cost)} pe zi.` });
  for (const b of subs(today).filter((b) => b.grade === "critic")) out.push({ sev: "warn", source: "Resurse", site_id: b.site_id, site: b.site || "", text: `${b.name} (${b.trade}) a venit cu ${b.score}% din efectivul promis în ultimele ${b.days} zile urmărite.` });
  return out;
}
