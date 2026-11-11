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
    const z = zonesMap.get(e.zone) || { zone: e.zone, total: 0, mounted: 0, due: 0, delivered: 0 };
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
