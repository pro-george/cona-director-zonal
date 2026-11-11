// Jurnalul de întârzieri și dosarul de revendicare. Fiecare zi pierdută sau afectată primește o cauză și dovezile ei,
// adunate automat din rapoartele de șantier, din livrările întârziate și din vreme. La cerere, totul se leagă într-un dosar:
// cronologie, dovezi, zile solicitate și cost estimat. Încadrarea juridică rămâne a juristului firmei.
import { q, one, run, J, dayOf, addDays, daysBetween, setting, setSetting, lei } from "./db.js";
import * as wx from "./connectors/weather.js";
import * as bim from "./connectors/bim.js";
import { sitesAll, siteById } from "./data.js";
import { params } from "./value.js";

export const CAUSES = {
  beneficiar: { label: "Beneficiar", claim: "Revendicabil la beneficiar: zile și costuri" },
  vreme: { label: "Vreme", claim: "Prelungire de termen" },
  furnizor: { label: "Furnizor sau subcontractor", claim: "De recuperat de la furnizor" },
  intern: { label: "Intern", claim: "Nerevendicabil" },
};
const causeOf = (text) => {
  const t = String(text).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/(dispozi|beneficiar|proiectant|aviz|autoriza|diriginte|decizie|plansa|modificare ceruta|predare amplasament)/.test(t)) return "beneficiar";
  if (/(ploaie|ploua|vant|rafale|inghet|ninsoare|ninge|vreme|furtuna)/.test(t)) return "vreme";
  if (/(livr|fabric|furnizor|subcontract|nu au venit|nu a venit|camion|pompa|macara defect|efectiv)/.test(t)) return "furnizor";
  return "intern";
};
const roDay = (d) => new Intl.DateTimeFormat("ro-RO", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(new Date(d + "T12:00:00Z"));

// O intrare pe șantier, zi și cauză. Dacă există deja, i se adaugă doar dovada nouă.
function upsert(siteId, day, cause, title, days, ev) {
  const ref = `auto:${siteId}:${day}:${cause}`, row = one("SELECT * FROM delays WHERE source_ref=?", ref);
  if (!row) { run("INSERT INTO delays(site_id,day,cause,title,detail,evidence,source_ref,days,status) VALUES(?,?,?,?,?,?,?,?,'deschis')", siteId, day, cause, title.slice(0, 200), "", JSON.stringify([ev]), ref, days); return true; }
  const list = J(row.evidence, []);
  if (list.some((e) => e.ref === ev.ref)) return false;
  list.push(ev); run("UPDATE delays SET evidence=?, days=? WHERE id=?", JSON.stringify(list), Math.max(row.days, days), row.id);
  return false;
}

export function detect(today = dayOf()) {
  let fresh = 0;
  for (const r of q("SELECT r.*, s.name AS site FROM reports r JOIN sites s ON s.id=r.site_id WHERE r.status IN ('critic','atentie') AND r.day>=?", addDays(today, -30))) {
    const blockers = J(r.details, {}).blockers || [];
    for (const b of blockers.length ? blockers : [r.summary]) {
      const time = new Intl.DateTimeFormat("ro-RO", { timeZone: "Europe/Bucharest", hour: "2-digit", minute: "2-digit" }).format(new Date(r.ts));
      if (upsert(r.site_id, r.day, causeOf(b), b, r.status === "critic" ? 1 : 0.5, { type: "Raport de șantier", ref: `rep:${r.id}:${b.slice(0, 30)}`, text: `${r.author}, ${r.day} ora ${time}: „${b}”` })) fresh++;
    }
  }
  for (const s of sitesAll()) {
    for (const d of bim.deliveries(s.id, addDays(today, -30), today).filter((d) => d.late || (d.eta && d.eta > d.planned))) {
      for (let day = d.planned; day <= today && day < (d.eta || addDays(today, 1)); day = addDays(day, 1))
        if (upsert(s.id, day, "furnizor", `Livrare întârziată: ${d.count} × ${d.kind}, ${d.zone}`, 1, { type: "Livrare (BIM)", ref: `deliv:${d.id}:${day}`, text: `Planificată ${d.planned}, estimată ${d.eta || "necunoscut"}. ${d.note || ""}`.trim() })) fresh++;
    }
    const f = wx.forecast(s.id), f0 = f.days.find((x) => x.day === today);
    for (const r of wx.risksByDay(s.id, today).filter((x) => x.day === today))
      if (upsert(s.id, today, "vreme", `Vreme nefavorabilă: ${r.reasons.join(" și ")}`, 1, { type: "Meteo", ref: `wx:${today}`, text: `${f.source}, ${today}: minimă ${f0?.tmin}°C, rafale ${f0?.gust} km/h, precipitații ${f0?.rain} mm. Lucrări oprite: ${r.works.join(", ")}.` })) fresh++;
  }
  return fresh;
}

const noticeDays = (siteId) => Number(setting("claim_notice:" + siteId, 0)) || 0;
export const setNotice = (siteId, n) => setSetting("claim_notice:" + siteId, Math.max(0, Math.min(365, Math.round(Number(n) || 0))));

export function summary(siteId, today = dayOf()) {
  const rows = q("SELECT * FROM delays WHERE site_id=? ORDER BY day DESC, id DESC", siteId).map((r) => ({ ...r, evidence: J(r.evidence, []) }));
  const nd = noticeDays(siteId), p = params();
  const by = Object.fromEntries(Object.keys(CAUSES).map((k) => [k, rows.filter((r) => r.cause === k).reduce((a, r) => a + r.days, 0)]));
  for (const r of rows) r.noticeLeft = nd && r.status === "deschis" && (r.cause === "beneficiar" || r.cause === "vreme") ? daysBetween(today, addDays(r.day, nd)) : null;
  return { rows, by, total: rows.reduce((a, r) => a + r.days, 0), claimDays: by.beneficiar, extensionDays: by.beneficiar + by.vreme, cost: by.beneficiar * p.orgDay, orgDay: p.orgDay, noticeDays: nd,
    urgent: rows.filter((r) => r.noticeLeft !== null && r.noticeLeft <= 5).length };
}
export const overview = (today = dayOf()) => sitesAll().map((s) => { const x = summary(s.id, today); return { id: s.id, name: s.name, total: x.total, claimDays: x.claimDays, extensionDays: x.extensionDays, cost: x.cost, urgent: x.urgent, events: x.rows.length }; });

export function deadlineAlerts(today = dayOf()) {
  const out = [];
  for (const s of sitesAll()) for (const r of summary(s.id, today).rows.filter((r) => r.noticeLeft !== null && r.noticeLeft <= 5))
    out.push({ sev: r.noticeLeft <= 2 ? "crit" : "warn", source: "Dosar", site_id: s.id, site: s.name, text: r.noticeLeft < 0 ? `Termenul de notificare pentru întârzierea din ${r.day} a trecut de ${-r.noticeLeft} zile: ${r.title}` : `Mai ai ${r.noticeLeft} ${r.noticeLeft === 1 ? "zi" : "zile"} să notifici întârzierea din ${r.day}: ${r.title}` });
  return out;
}

export function save(siteId, id, body) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(body.day) ? body.day : dayOf(), cause = CAUSES[body.cause] ? body.cause : "intern", title = String(body.title || "").trim().slice(0, 200);
  if (!title) return "Scrie ce s-a întâmplat.";
  const days = Math.max(0, Math.min(60, Number(String(body.days ?? 1).replace(",", ".")) || 0)), status = ["deschis", "notificat", "inchis"].includes(body.status) ? body.status : "deschis", detail = String(body.detail || "").slice(0, 600);
  if (id) run("UPDATE delays SET day=?, cause=?, title=?, detail=?, days=?, status=? WHERE id=?", day, cause, title, detail, days, status, Number(id));
  else run("INSERT INTO delays(site_id,day,cause,title,detail,evidence,source_ref,days,status) VALUES(?,?,?,?,?,?,?,?,?)", siteId, day, cause, title, detail, JSON.stringify(detail ? [{ type: "Notă adăugată de mână", ref: "m", text: detail }] : []), "manual:" + Date.now(), days, status);
  return null;
}
export const remove = (id) => run("DELETE FROM delays WHERE id=?", Number(id));
export const setStatus = (id, status) => run("UPDATE delays SET status=?, notified_at=? WHERE id=?", status, status === "notificat" ? Date.now() : null, Number(id));

// Documentul dosarului: compus din date, fără nimic inventat.
export function dossierText(siteId, today = dayOf()) {
  const s = siteById(siteId), x = summary(siteId, today), director = one("SELECT name FROM users WHERE role='director' LIMIT 1")?.name || "Director zonal";
  const pick = (c) => x.rows.filter((r) => r.cause === c).sort((a, b) => (a.day < b.day ? -1 : 1));
  const L = [`# Dosar de întârzieri – ${s.name}`, `Întocmit la ${roDay(today)}. Beneficiar: ${s.client || "necompletat"}. Termen contractual de predare: ${roDay(s.finish)}.`,
    "## Sinteză", `- Zile pierdute sau afectate, în total: ${fmt(x.total)}`, `- Din cauze ale beneficiarului: ${fmt(x.by.beneficiar)} zile`, `- Din cauza vremii: ${fmt(x.by.vreme)} zile`, `- Din cauze ale furnizorilor sau subcontractorilor: ${fmt(x.by.furnizor)} zile`, `- Interne: ${fmt(x.by.intern)} zile`,
    "## Ce se solicită", `- Prelungirea termenului de execuție cu ${fmt(x.extensionDays)} zile (cauze ale beneficiarului și vreme).`, `- Costuri suplimentare estimate: ${lei(x.cost)}, adică ${fmt(x.claimDays)} zile × ${lei(x.orgDay)} cost zilnic de organizare a șantierului.`];
  for (const [c, title] of [["beneficiar", "Cronologie: cauze ale beneficiarului"], ["vreme", "Cronologie: vreme nefavorabilă"]]) {
    const list = pick(c); if (!list.length) continue;
    L.push("## " + title);
    for (const r of list) { L.push(`- **${roDay(r.day)}** (${fmt(r.days)} ${r.days === 1 ? "zi" : "zile"}): ${r.title}`); for (const e of r.evidence) L.push(`- Dovadă, ${e.type.toLowerCase()}: ${e.text}`); }
  }
  const sup = pick("furnizor");
  if (sup.length) { L.push("## Întârzieri ale furnizorilor (de recuperat separat, nu de la beneficiar)"); for (const r of sup) L.push(`- ${roDay(r.day)}: ${r.title}`); }
  L.push("## Scrisoare de însoțire", `Stimate partener,`, `Vă transmitem alăturat situația întârzierilor înregistrate pe șantierul ${s.name}, cu dovezile aferente. Pe baza lor solicităm prelungirea termenului de execuție cu ${fmt(x.extensionDays)} zile și recunoașterea costurilor suplimentare de ${lei(x.cost)}.`, `Vă rugăm să ne comunicați punctul dumneavoastră de vedere.`, `Cu stimă,`, `${director}, Director zonal`,
    "## Notă", "Document pregătit automat din rapoartele de șantier, livrări și date meteo. Încadrarea fiecărei zile și temeiul contractual trebuie confirmate de juristul firmei înainte de trimitere.");
  return L.join("\n");
}
const fmt = (n) => String(Math.round(n * 10) / 10).replace(".", ",");
