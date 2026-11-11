// Replanificare automată. Pentru fiecare șantier ia lucrările nemontate din BIM, prognoza meteo și livrările întârziate
// și calculează un grafic nou: lucrările care nu se pot face în ziua planificată se mută pe prima zi bună, iar restul
// zonei se decalează cu ele. Calculul este determinist (reguli), ca propunerea să poată fi verificată rând cu rând.
import { q, one, run, J, dayOf, addDays, daysBetween, lei } from "./db.js";
import * as wx from "./connectors/weather.js";
import * as bim from "./connectors/bim.js";
import { sitesAll, siteById } from "./data.js";

const max = (a, b) => (a > b ? a : b);

export function compute(site, today = dayOf()) {
  const fc = Object.fromEntries(wx.forecast(site.id).days.map((d) => [d.day, d]));
  const els = q("SELECT id, kind, zone, planned FROM bim_elements WHERE site_id=? AND status!='montat' ORDER BY zone, planned, id", site.id);
  const late = bim.deliveries(site.id, addDays(today, -7), addDays(today, 7)).filter((d) => d.late && d.eta);
  const changes = {}, moves = [], reasons = new Set(), lostDays = new Map();
  const zones = [...new Set(els.map((e) => e.zone))];
  for (const zone of zones) {
    const list = els.filter((e) => e.zone === zone), d = late.find((x) => x.zone === zone);
    let s = 0; const why = new Set(); const moved = [];
    for (const el of list) {
      let nd = addDays(el.planned, s);
      if (d && nd < d.eta) { s += daysBetween(nd, d.eta); nd = d.eta; why.add(`livrare întârziată (${d.count} × ${d.kind}, estimată ${d.eta})`); }
      if (nd >= today) {
        let guard = 0, r;
        while ((r = wx.check(el.kind, fc[nd])).length && guard++ < 14) {
          r.forEach((x) => why.add(x));
          if (!lostDays.has(nd)) lostDays.set(nd, new Set()); lostDays.get(nd).add(zone);
          s++; nd = addDays(nd, 1);
        }
      }
      if (nd !== el.planned) { changes[el.id] = nd; moved.push({ from: el.planned, to: nd }); }
    }
    if (!moved.length) continue;
    const activity = wx.RULES[list[0].kind]?.activity || list[0].kind;
    moves.push({ zone, activity, count: moved.length, fromFirst: moved[0].from, fromLast: moved.at(-1).from, toFirst: moved[0].to, toLast: moved.at(-1).to, shift: Math.max(...moved.map((m) => daysBetween(m.from, m.to))), why: [...why] });
    why.forEach((x) => reasons.add(x));
  }
  if (!moves.length) return null;

  // Ce se poate lucra în zilele pierdute: o altă zonă a șantierului pe care vremea din ziua aceea nu o oprește.
  const alternatives = [];
  for (const [day, blocked] of [...lostDays.entries()].sort().slice(0, 4)) {
    const cand = zones.find((z) => !blocked.has(z) && !late.some((x) => x.zone === z && day < x.eta) && els.some((e) => e.zone === z && wx.check(e.kind, fc[day]).length === 0));
    if (cand) alternatives.push({ day, text: `Echipa poate lucra în ${cand} (${wx.RULES[els.find((e) => e.zone === cand).kind]?.activity || "lucrări"}), neafectată de vreme în acea zi.` });
  }

  const all = q("SELECT id, planned FROM bim_elements WHERE site_id=?", site.id);
  const lastOld = all.reduce((m, e) => max(m, e.planned), ""), lastNew = all.reduce((m, e) => max(m, changes[e.id] || e.planned), "");
  const eq = late.length ? one("SELECT name, daily_cost FROM erp_equipment WHERE site_id=? AND status='in_asteptare'", site.id) : null;
  const idleDays = eq ? Math.max(1, daysBetween(today, late.reduce((m, d) => max(m, d.eta), today))) : 0;
  const impact = {
    elements: Object.keys(changes).length, zones: moves.length, lostDays: lostDays.size, lastOld, lastNew, finishShift: daysBetween(lastOld, lastNew),
    floatOld: daysBetween(lastOld, site.finish), floatNew: daysBetween(lastNew, site.finish), deadline: site.finish,
    idle: eq ? { name: eq.name, days: idleDays, cost: idleDays * eq.daily_cost } : null,
  };
  const summary = `${impact.elements} elemente din ${impact.zones} ${impact.zones === 1 ? "zonă" : "zone"} se mută, cu cel mult ${Math.max(...moves.map((m) => m.shift))} zile. ` +
    (impact.finishShift > 0 ? `Ultima lucrare planificată se mută cu ${impact.finishShift} zile, iar rezerva față de termenul contractual scade de la ${impact.floatOld} la ${impact.floatNew} zile.` : `Ultima lucrare planificată nu se mută, deci termenul de predare nu este afectat.`) +
    (impact.idle ? ` ${impact.idle.name} stă în așteptare ${impact.idle.days} ${impact.idle.days === 1 ? "zi" : "zile"}: circa ${lei(impact.idle.cost)}.` : "");
  const sig = Object.entries(changes).sort().map(([k, v]) => k + ":" + v).join("|");
  // Un singur motiv pe tip (livrare, rafale, îngheț, ploaie), ca lista să rămână scurtă.
  const short = [...new Map([...reasons].map((r) => [r.split(" ")[0], r])).values()];
  return { sig, data: { site: site.name, reasons: short, moves, alternatives, impact, summary, changes } };
}

// Rulată de Autopilot după meteo și livrări. O singură propunere deschisă pe șantier; dacă situația se schimbă, propunerea se actualizează.
export function generate(today = dayOf()) {
  const fresh = [];
  for (const s of sitesAll()) {
    const p = compute(s, today), open = one("SELECT * FROM replans WHERE site_id=? AND status='proposed'", s.id);
    if (!p) { if (open) run("UPDATE replans SET status='expired' WHERE id=?", open.id); continue; }
    if (open) { if (open.sig !== p.sig) run("UPDATE replans SET sig=?, data=?, ts=? WHERE id=?", p.sig, JSON.stringify(p.data), Date.now(), open.id); continue; }
    if (one("SELECT id FROM replans WHERE site_id=? AND sig=? AND status='rejected'", s.id, p.sig)) continue;
    run("INSERT INTO replans(ts,site_id,sig,data,status) VALUES(?,?,?,?,'proposed')", Date.now(), s.id, p.sig, JSON.stringify(p.data));
    fresh.push({ site: s, data: p.data });
  }
  return fresh;
}

export const list = () => q("SELECT * FROM replans WHERE status IN ('proposed','accepted','rejected') ORDER BY (status='proposed') DESC, ts DESC LIMIT 20").map((r) => ({ ...r, data: J(r.data, {}) }));
export const openCount = () => one("SELECT COUNT(*) n FROM replans WHERE status='proposed'").n;

export function decide(id, accept, by) {
  const r = one("SELECT * FROM replans WHERE id=? AND status='proposed'", id);
  if (!r) return null;
  const data = J(r.data, {}), s = siteById(r.site_id);
  if (accept) {
    bim.applyPlan(r.site_id, data.changes || {});
    run("UPDATE tasks SET status='done' WHERE site_id=? AND status='open' AND (source LIKE 'meteo:%' OR source LIKE 'delivery:%')", r.site_id);
    if (s?.manager_id) run("INSERT INTO notifications(user_id,ts,text) VALUES(?,?,?)", s.manager_id, Date.now(), `Grafic nou aprobat de ${by} pentru ${s.name}: ${data.moves.map((m) => `${m.zone} începe pe ${m.toFirst}`).join("; ")}.`);
  }
  run("UPDATE replans SET status=?, decided_at=?, decided_by=? WHERE id=?", accept ? "accepted" : "rejected", Date.now(), by, id);
  return { site: s, data };
}
