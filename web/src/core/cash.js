// Prognoză de cash pe 8 săptămâni, din ce există deja în ERP: situații de lucrări emise și neîncasate (intrări),
// sume angajate, cereri în așteptare și chirii de utilaje (ieșiri). Nu ghicește facturi viitoare.
import { q, dayOf, addDays, daysBetween } from "./db.js";
import { sitesAll } from "./data.js";
import { params } from "./value.js";

export function forecast(today = dayOf()) {
  const p = params(), W = 8, weeks = Array.from({ length: W }, (_, i) => ({ i, from: addDays(today, i * 7), to: addDays(today, i * 7 + 6), inflow: 0, outflow: 0, items: [] }));
  const put = (day, amount, kind, text, site) => { const k = Math.min(W - 1, Math.max(0, Math.floor(daysBetween(today, day) / 7))); if (daysBetween(today, day) >= W * 7) return false; weeks[k][kind] += amount; weeks[k].items.push({ kind, amount, text, site, day }); return true; };
  const bySite = [];
  for (const s of sitesAll()) {
    let inflow = 0, outflow = 0, later = 0;
    for (const r of q("SELECT * FROM erp_receivables WHERE site_id=? AND paid_at IS NULL", s.id)) {
      // Data așteptată: scadența plus întârzierea obișnuită la plată; dacă a trecut deja, peste tot atâtea zile de azi.
      const expected = addDays(r.due > today ? r.due : today, p.payDelay);
      if (put(expected, r.amount, "inflow", `${r.title}${r.due < today ? " (restantă)" : ""}`, s.name)) inflow += r.amount; else later += r.amount;
    }
    const committed = q("SELECT COALESCE(SUM(committed),0) c FROM erp_budget WHERE site_id=?", s.id)[0].c, n = Math.max(1, Math.min(W, Math.round(p.spendWeeks)));
    for (let i = 0; i < n; i++) if (committed > 0) { put(addDays(today, i * 7 + 3), committed / n, "outflow", "Plăți din sumele angajate", s.name); outflow += committed / n; }
    for (const a of q("SELECT * FROM erp_approvals WHERE site_id=? AND status='pending'", s.id)) { put(addDays(today, 10), a.amount, "outflow", `Cerere în așteptare: ${a.title}`, s.name); outflow += a.amount; }
    for (const e of q("SELECT * FROM erp_equipment WHERE site_id=?", s.id)) for (let i = 0; i < W; i++) { put(addDays(today, i * 7 + 5), e.daily_cost * 7, "outflow", `Chirie ${e.name}`, s.name); outflow += e.daily_cost * 7; }
    bySite.push({ id: s.id, name: s.name, inflow, outflow, net: inflow - outflow, later });
  }
  let cum = 0, low = null;
  for (const w of weeks) { w.net = w.inflow - w.outflow; cum += w.net; w.cum = cum; if (!low || w.cum < low.cum) low = w; w.items.sort((a, b) => b.amount - a.amount); }
  return { today, weeks, bySite, inflow: weeks.reduce((a, w) => a + w.inflow, 0), outflow: weeks.reduce((a, w) => a + w.outflow, 0), end: cum, low: low ? { i: low.i, from: low.from, cum: low.cum } : null, payDelay: p.payDelay, spendWeeks: p.spendWeeks };
}
