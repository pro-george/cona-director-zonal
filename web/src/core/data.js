// Citiri agregate: starea zonei, alerte calculate din rapoarte + ERP + BIM, și contextul trimis către AI.
import { q, one, J, dayOf, addDays, daysBetween } from "./db.js";
import * as erp from "./connectors/erp.js";
import * as bim from "./connectors/bim.js";
import * as wx from "./connectors/weather.js";

export const sitesAll = () => q("SELECT s.*, u.name AS manager FROM sites s LEFT JOIN users u ON u.id=s.manager_id ORDER BY s.ord");
export const siteById = (id) => one("SELECT s.*, u.name AS manager FROM sites s LEFT JOIN users u ON u.id=s.manager_id WHERE s.id=?", id);

export const reportRow = (r) => r && ({ ...r, details: J(r.details, {}), photos: J(r.photos, []) });
// Cel mai recent raport al fiecărui șantier din ultimele două zile (șefii raportează seara, directorul citește dimineața).
export function latestReports(today = dayOf()) {
  const rows = q("SELECT * FROM reports WHERE day>=? AND day<=? ORDER BY ts DESC", addDays(today, -1), today);
  const m = {};
  for (const r of rows) if (!m[r.site_id]) m[r.site_id] = reportRow(r);
  return m;
}

export function alerts(today = dayOf()) {
  const out = [];
  const reports = latestReports(today);
  for (const s of sitesAll()) {
    const add = (sev, source, text) => out.push({ sev, source, site_id: s.id, site: s.name, text });
    const r = reports[s.id];
    if (!r) add("warn", "Rapoarte", "Niciun raport de șantier în ultimele două zile.");
    else if (r.status === "critic") add("crit", "Rapoarte", r.summary);
    else if (r.status === "atentie") add("warn", "Rapoarte", r.summary);
    const f = erp.financeSummary(s, today);
    for (const l of f.overLines) add("warn", "ERP", `${l.category}: cheltuit + angajat depășesc bugetul cu ${fmt(l.actual + l.committed - l.budget)} lei.`);
    for (const o of f.overdue) add(o.overdueDays > 14 ? "crit" : "warn", "ERP", `${o.title} (${fmt(o.amount)} lei) neîncasată, scadență depășită cu ${o.overdueDays} zile.`);
    const p = bim.physical(s.id, today);
    if (p.lag > 0) add(p.lag >= 8 ? "crit" : "warn", "BIM", `${p.lag} elemente în urmă față de grafic (montat ${pct(p.realPct)}, plan ${pct(p.planPct)}).`);
    if (f.spentPct - p.realPct > 0.1) add("warn", "ERP × BIM", `Cheltuit ${pct(f.spentPct)} din buget la un stadiu fizic de ${pct(p.realPct)}.`);
    for (const d of bim.deliveries(s.id, addDays(today, -1), addDays(today, 1)).filter((d) => d.late))
      add("crit", "BIM", `Livrare întârziată: ${d.count} × ${d.kind}, zona ${d.zone}. Planificat ${d.planned}, estimat ${d.eta || "necunoscut"}.`);
  }
  for (const s of sitesAll()) for (const r of wx.risksByDay(s.id, today))
    out.push({ sev: r.sev, source: "Meteo", site_id: s.id, site: s.name, text: `${shortDay(r.day)}: ${r.reasons.join(" și ")}. Expuse: ${r.works.join(", ")}; ${r.count} ${r.count === 1 ? "element planificat" : "elemente planificate"}.` });
  for (const t of q("SELECT t.*, s.name AS site FROM tasks t LEFT JOIN sites s ON s.id=t.site_id WHERE t.status='open' AND t.due<?", today))
    out.push({ sev: "warn", source: "Sarcini", site_id: t.site_id, site: t.site || "", text: `Sarcină întârziată cu ${daysBetween(t.due, today)} zile: ${t.title} (${t.owner}).` });
  for (const a of erp.approvals("pending").filter((a) => daysBetween(a.created, today) >= 2))
    out.push({ sev: "warn", source: "ERP", site_id: a.site_id, site: siteById(a.site_id)?.name || "", text: `Aprobare în așteptare de ${daysBetween(a.created, today)} zile: ${a.title}.` });
  return out.sort((a, b) => (a.sev === b.sev ? 0 : a.sev === "crit" ? -1 : 1));
}

// Context compact pentru prompturi. Doar cifre și fapte din sisteme; modelul nu primește nimic altceva.
export function zoneContext(today = dayOf()) {
  const reports = latestReports(today);
  return {
    zi: today,
    santiere: sitesAll().map((s) => {
      const r = reports[s.id], f = erp.financeSummary(s, today), p = bim.physical(s.id, today);
      return {
        id: s.id, nume: s.name, localitate: s.location, beneficiar: s.client, sef_santier: s.manager,
        raport: r ? { zi: r.day, status: r.status, rezumat: r.summary, oameni: r.workers, ...r.details } : null,
        bani: { buget: f.budget, cheltuit: f.actual, angajat: f.committed, linii_depasite: f.overLines.map((l) => l.category), facturi_restante: f.overdue.map((o) => ({ titlu: o.title, suma: o.amount, zile: o.overdueDays })) },
        stadiu_fizic: { montat_pct: Math.round(p.realPct * 100), plan_pct: Math.round(p.planPct * 100), elemente_in_urma: p.lag },
        meteo: { sursa: wx.forecast(s.id).source, zile_cu_risc: wx.riskDays(s.id, today), riscuri: wx.risksByDay(s.id, today).map((r) => ({ zi: r.day, lucrari: r.works, motive: r.reasons, elemente: r.count })) },
        livrari: bim.deliveries(s.id, today, addDays(today, 2)).map((d) => ({ plan: d.planned, estimat: d.eta, ce: `${d.count} × ${d.kind}`, zona: d.zone, status: d.status })),
      };
    }),
    alerte: alerts(today).map((a) => `[${a.source}] ${a.site}: ${a.text}`),
    aprobari_in_asteptare: erp.approvals("pending").map((a) => ({ titlu: a.title, suma: a.amount, santier: siteById(a.site_id)?.name, recomandare: a.rec, motiv: a.rec_reason })),
    sarcini_deschise: q("SELECT title, owner, due, site_id FROM tasks WHERE status='open' ORDER BY due").map((t) => ({ titlu: t.title, responsabil: t.owner, termen: t.due })),
  };
}

const fmt = (n) => new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(Math.round(n));
const pct = (x) => Math.round(x * 100) + "%";
const shortDay = (d) => new Intl.DateTimeFormat("ro-RO", { timeZone: "UTC", weekday: "long", day: "numeric", month: "short" }).format(new Date(d + "T12:00:00Z")).replace(/^./, (c) => c.toUpperCase());
