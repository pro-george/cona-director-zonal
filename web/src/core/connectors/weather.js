// Conector meteo. Sursa reală este Open-Meteo (gratuit, fără cheie), interogat pe coordonatele șantierului.
// Cererea pleacă direct din browser. Dacă nu reușește, se folosește o prognoză simulată, marcată ca atare.
// Partea importantă este `risks`: suprapune prognoza peste lucrările planificate în BIM pentru următoarele 7 zile.
import { q, one, run, J, dayOf, addDays } from "../db.js";

// Praguri ORIENTATIVE pe tip de lucrare. Se ajustează aici după procedurile firmei și fișele tehnice.
export const RULES = {
  "stâlpi și grinzi": { activity: "montaj cu macaraua", gust: 50, rain: 15 },
  "fundații și radier": { activity: "betonare", frost: 0, rain: 12 },
  "panouri sandwich": { activity: "montaj fațade", gust: 45, rain: 8 },
  "tablă cutată": { activity: "lucru pe acoperiș", gust: 40, rain: 5 },
  "structură și zidării": { activity: "zidărie și structură", frost: 0, rain: 15 },
};

async function fetchOpenMeteo(site) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${site.lat}&longitude=${site.lon}&daily=temperature_2m_min,temperature_2m_max,precipitation_sum,wind_gusts_10m_max,snowfall_sum&timezone=Europe%2FBucharest&forecast_days=7`;
  const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const d = (await r.json()).daily;
  return d.time.map((day, i) => ({ day, tmin: Math.round(d.temperature_2m_min[i]), tmax: Math.round(d.temperature_2m_max[i]), rain: Math.round(d.precipitation_sum[i] * 10) / 10, gust: Math.round(d.wind_gusts_10m_max[i]), snow: Math.round((d.snowfall_sum?.[i] || 0) * 10) / 10 }));
}

// Prognoză simulată: vreme de sezon rece, cu câte un episod pe șantier ca demo-ul să arate legătura cu lucrările.
function simulate(site, today) {
  const base = [[2, 9, 0, 22], [1, 8, 0.4, 28], [3, 10, 1.2, 30], [0, 7, 0, 24], [1, 6, 2.5, 26], [2, 8, 0, 20], [3, 9, 0.6, 25]];
  const events = { hala: { 2: { gust: 64 }, 3: { gust: 52 } }, fabrica: { 3: { tmin: -4, tmax: 2 }, 4: { tmin: -3, tmax: 3 } }, depozit: { 1: { rain: 14, gust: 38 } }, campus: { 5: { tmin: -2, snow: 1.5 } } };
  return base.map(([tmin, tmax, rain, gust], i) => ({ day: addDays(today, i), tmin, tmax, rain, gust, snow: 0, ...(events[site.id]?.[i] || {}) }));
}

export async function refresh(site, today = dayOf()) {
  let days, source;
  if (site.lat == null || site.lon == null) { days = []; source = "Fără localizare"; }
  else try { days = await fetchOpenMeteo(site); source = "Open-Meteo"; }
  catch { days = simulate(site, today); source = "Meteo simulat"; }
  if (!days) { days = simulate(site, today); source = "Meteo simulat"; }
  run("INSERT INTO weather_cache(site_id,ts,source,data) VALUES(?,?,?,?) ON CONFLICT(site_id) DO UPDATE SET ts=excluded.ts, source=excluded.source, data=excluded.data", site.id, Date.now(), source, JSON.stringify(days));
  return source;
}

export function forecast(siteId) {
  const c = one("SELECT * FROM weather_cache WHERE site_id=?", siteId);
  return c ? { source: c.source, ts: c.ts, days: J(c.data, []) } : { source: "Fără prognoză", ts: null, days: [] };
}

// Motivele pentru care o lucrare de tipul `kind` nu se poate face în ziua cu prognoza `f` (listă goală = se poate).
export function check(kind, f) {
  const rule = RULES[kind], reasons = [];
  if (!rule || !f) return reasons;
  if (rule.gust != null && f.gust >= rule.gust) reasons.push(`rafale de ${f.gust} km/h (limită ${rule.gust})`);
  if (rule.frost != null && f.tmin <= rule.frost) reasons.push(`minimă de ${f.tmin}°C (îngheț)`);
  if (rule.rain != null && f.rain >= rule.rain) reasons.push(`ploaie ${f.rain} mm (limită ${rule.rain})`);
  return reasons;
}

export function risks(siteId, today = dayOf()) {
  const byDay = Object.fromEntries(forecast(siteId).days.map((d) => [d.day, d]));
  const work = q("SELECT planned, kind, zone, COUNT(*) n FROM bim_elements WHERE site_id=? AND status!='montat' AND planned BETWEEN ? AND ? GROUP BY planned, kind, zone ORDER BY planned", siteId, today, addDays(today, 6));
  const out = new Map();
  for (const w of work) {
    const f = byDay[w.planned], rule = RULES[w.kind];
    if (!f || !rule) continue;
    const reasons = check(w.kind, f);
    if (!reasons.length) continue;
    const key = w.planned + "|" + w.zone, r = out.get(key);
    if (r) r.count += w.n; else out.set(key, { day: w.planned, zone: w.zone, activity: rule.activity, count: w.n, reasons, sev: reasons.some((x) => /rafale|îngheț/.test(x)) ? "crit" : "warn" });
  }
  return [...out.values()];
}
// Aceleași riscuri, grupate pe zi: o alertă și o sarcină pe zi de șantier, nu una pe fiecare zonă.
export function risksByDay(siteId, today) {
  const m = new Map();
  for (const r of risks(siteId, today)) {
    const d = m.get(r.day) || { day: r.day, works: [], reasons: [], count: 0, sev: "warn" };
    d.works.push(`${r.activity} (${r.zone})`); d.count += r.count; if (r.sev === "crit") d.sev = "crit";
    for (const x of r.reasons) if (!d.reasons.includes(x)) d.reasons.push(x);
    m.set(r.day, d);
  }
  return [...m.values()];
}
export const riskDays = (siteId, today) => new Set(risks(siteId, today).map((r) => r.day)).size;
