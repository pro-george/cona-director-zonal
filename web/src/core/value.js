// Tabloul de valoare: transformă ce a făcut Autopilotul în lei, cu formule simple și ipoteze care se pot schimba din aplicație.
// "Realizat" = ai acționat pe propunere (grafic aplicat, notificare trimisă). "Potențial" = te așteaptă o decizie.
import { q, one, J, setting, setSetting, lei } from "./db.js";

// IPOTEZE implicite, nu cifre ale firmei. Se înlocuiesc din ecranul Valoare cu cele reale.
export const DEFAULTS = { orgDay: 6000, penaltyDay: 0, moneyRate: 8, gainDays: 7, hourCost: 150, laborDay: 350, payDelay: 10, spendWeeks: 6 };
export const FIELDS = [
  { key: "orgDay", label: "Cost zilnic de organizare a unui șantier", unit: "lei/zi", max: 1e6 },
  { key: "penaltyDay", label: "Penalitate de întârziere din contract", unit: "lei/zi", max: 1e7 },
  { key: "moneyRate", label: "Costul banilor (credit sau numerar propriu)", unit: "% pe an", max: 50 },
  { key: "gainDays", label: "Zile câștigate la încasare printr-o notificare promptă", unit: "zile", max: 120 },
  { key: "hourCost", label: "Costul unei ore a directorului zonal", unit: "lei/oră", max: 5000 },
  { key: "laborDay", label: "Costul unui muncitor pe zi", unit: "lei/zi", max: 5000 },
  { key: "payDelay", label: "Întârzierea obișnuită a beneficiarilor la plată", unit: "zile peste scadență", max: 180 },
  { key: "spendWeeks", label: "În câte săptămâni se plătesc sumele angajate", unit: "săptămâni", max: 8 },
];
export const params = () => ({ ...DEFAULTS, ...setting("value_params", {}) });
export function saveParams(input) {
  const out = {};
  for (const f of FIELDS) { const n = Number(input[f.key]); if (!(n >= 0 && n <= f.max)) return f.label; out[f.key] = n; }
  setSetting("value_params", out); return null;
}

export function compute() {
  const p = params(), items = [];
  for (const r of q("SELECT * FROM replans WHERE status IN ('proposed','accepted')")) {
    const d = J(r.data, {}), im = d.impact || {}, realized = r.status === "accepted";
    if (im.lostDays > 0) items.push({ cat: "zile", site: d.site, realized, amount: im.lostDays * (p.orgDay + p.penaltyDay),
      text: `${im.lostDays} ${im.lostDays === 1 ? "zi de lucru oprită" : "zile de lucru oprite"} de vreme, văzute din prognoză și replanificate din timp`, formula: `${im.lostDays} × (${lei(p.orgDay)} organizare + ${lei(p.penaltyDay)} penalitate)` });
    if (im.idle && im.idle.days > 1) { const daily = im.idle.cost / im.idle.days;
      items.push({ cat: "utilaje", site: d.site, realized, amount: (im.idle.days - 1) * daily, text: `${im.idle.name}: ${im.idle.days} zile în așteptare. Eliberat după prima zi, se evită ${im.idle.days - 1} ${im.idle.days - 1 === 1 ? "zi" : "zile"} de chirie`, formula: `${im.idle.days - 1} × ${lei(daily)} pe zi` }); }
  }
  for (const dr of q("SELECT d.*, s.name AS site FROM drafts d LEFT JOIN sites s ON s.id=d.site_id WHERE d.kind='incasare' AND d.status!='dismissed'")) {
    const rec = one("SELECT * FROM erp_receivables WHERE id=?", Number(String(dr.ref).split(":")[1]));
    if (!rec) continue;
    items.push({ cat: "incasari", site: dr.site, realized: dr.status === "sent", amount: (rec.amount * (p.moneyRate / 100) * p.gainDays) / 365,
      text: `${rec.title}: ${lei(rec.amount)} restanți, notificare pregătită în ziua în care a fost prinsă restanța`, formula: `${lei(rec.amount)} × ${p.moneyRate}% × ${p.gainDays} zile ÷ 365` });
  }
  const week = one("SELECT COALESCE(SUM(minutes),0) m, COUNT(*) n FROM automation_log WHERE ts>=?", Date.now() - 7 * 86400000);
  if (week.m > 0) items.push({ cat: "timp", site: "", realized: true, amount: (week.m / 60) * p.hourCost, text: `${week.n} acțiuni făcute de Autopilot în locul tău în ultimele 7 zile, circa ${Math.round(week.m / 60)} ore`, formula: `${(week.m / 60).toFixed(1)} ore × ${lei(p.hourCost)}` });

  const CATS = [["zile", "Meteo: zile de șantier salvate"], ["incasari", "Încasări"], ["utilaje", "Utilaje"], ["timp", "Timpul tău"]];
  const sum = (list, real) => list.filter((i) => i.realized === real).reduce((a, i) => a + i.amount, 0);
  return {
    params: p, fields: FIELDS,
    realized: sum(items, true), potential: sum(items, false),
    cats: CATS.map(([key, label]) => { const list = items.filter((i) => i.cat === key); return { key, label, realized: sum(list, true), potential: sum(list, false), items: list }; }),
  };
}
