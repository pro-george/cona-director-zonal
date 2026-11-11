// Conector BIM (SIMULAT). Modelul real ar veni dintr-un CDE sau din exporturi IFC/Tekla;
// aici elementele și livrările sunt rânduri într-un tabel, cu aceeași formă pe care ar întoarce-o un conector real.
import { q, run } from "../db.js";

export const SOURCE = "BIM simulat";

export function physical(siteId, today) {
  const els = q("SELECT kind, zone, planned, baseline, status FROM bim_elements WHERE site_id=?", siteId);
  const moved = els.filter((e) => e.baseline && e.planned > e.baseline);
  const slip = moved.reduce((m, e) => Math.max(m, Math.round((new Date(e.planned) - new Date(e.baseline)) / 86400000)), 0);
  const total = els.length;
  const mounted = els.filter((e) => e.status === "montat").length;
  const due = els.filter((e) => e.planned <= today).length;
  const zonesMap = new Map();
  for (const e of els) {
    const z = zonesMap.get(e.zone) || { zone: e.zone, kind: e.kind, total: 0, mounted: 0, due: 0, delivered: 0, start: null, end: null };
    if (e.status !== "montat") { if (!z.start || e.planned < z.start) z.start = e.planned; if (!z.end || e.planned > z.end) z.end = e.planned; }
    z.total++; if (e.status === "montat") z.mounted++; if (e.planned <= today) z.due++;
    if (e.status === "livrat" || e.status === "montat") z.delivered++;
    zonesMap.set(e.zone, z);
  }
  const zones = [...zonesMap.values()].sort((a, b) => a.zone.localeCompare(b.zone, "ro", { numeric: true }))
    .map((z) => ({ ...z, state: z.mounted >= z.total ? "gata" : z.mounted < z.due ? "intarziat" : z.mounted > 0 || z.due > 0 ? "in_lucru" : "planificat" }));
  return {
    source: SOURCE, total, mounted, due, lag: Math.max(0, due - mounted),
    realPct: total ? mounted / total : 0, planPct: total ? due / total : 0, zones,
    replanned: moved.length, slip, // elemente mutate față de graficul inițial și decalajul maxim, în zile
  };
}

export function deliveries(siteId, from, to) {
  const rows = siteId
    ? q("SELECT * FROM bim_deliveries WHERE site_id=? AND planned BETWEEN ? AND ? ORDER BY planned", siteId, from, to)
    : q("SELECT * FROM bim_deliveries WHERE planned BETWEEN ? AND ? ORDER BY planned", from, to);
  return rows.map((d) => ({ ...d, late: d.status !== "livrat" && ((d.eta && d.eta > d.planned) || d.status === "intarziat") }));
}

// Scrierea unei replanificări aprobate înapoi în model: noile date pe elemente și livrările aduse la data estimată.
export function applyPlan(siteId, changes) {
  for (const [id, day] of Object.entries(changes)) run("UPDATE bim_elements SET planned=? WHERE id=? AND site_id=? AND status!='montat'", day, Number(id), siteId);
  run("UPDATE bim_deliveries SET planned=eta, status='planificat', note='Replanificat pe data estimată.' WHERE site_id=? AND status='intarziat' AND eta IS NOT NULL", siteId);
}

// Data reală de predare: extrapolare liniară din ritmul de montaj al ultimelor 14 zile.
// E o estimare simplă și transparentă, nu un grafic de execuție: nu știe de dependențe, echipe sau sezon.
export function forecast(site, today) {
  const els = q("SELECT planned, baseline, status, mounted_on FROM bim_elements WHERE site_id=?", site.id);
  const total = els.length, done = els.filter((e) => e.status === "montat"), mounted = done.length, remaining = total - mounted;
  if (!total) return null;
  const add = (day, n) => { const d = new Date(day + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const diff = (a, b) => Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 86400000);
  const from = add(today, -14), recent = done.filter((e) => e.mounted_on && e.mounted_on > from && e.mounted_on <= today).length;
  const first = done.map((e) => e.mounted_on).filter(Boolean).sort()[0];
  const pace = recent > 0 ? recent / 14 : first && diff(first, today) > 0 ? mounted / diff(first, today) : 0;
  const lastPlanned = els.reduce((m, e) => (e.planned > m ? e.planned : m), ""), lastBaseline = els.reduce((m, e) => ((e.baseline || e.planned) > m ? e.baseline || e.planned : m), "");
  const date = remaining === 0 ? today : pace > 0 ? add(today, Math.ceil(remaining / pace)) : null;
  const left = Math.max(1, diff(today, site.finish));
  const cum = (dates) => { const s = dates.filter(Boolean).sort(), step = Math.max(1, Math.ceil(s.length / 40)), pts = []; s.forEach((d, i) => { if (i % step === 0 || i === s.length - 1) pts.push([d, i + 1]); }); return pts; };
  return { total, mounted, remaining, pace, recent, date, lastPlanned, lastBaseline, deadline: site.finish, vsDeadline: date ? diff(site.finish, date) : null, vsPlan: date ? diff(lastPlanned, date) : null,
    neededPace: remaining / left, today, planned: cum(els.map((e) => e.baseline || e.planned)), actual: cum(done.map((e) => e.mounted_on)) };
}
