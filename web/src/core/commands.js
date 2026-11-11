// Comenzi vocale și scrise. Înțelegerea e pe reguli (merge și fără cheie AI): recunoaște intenția după cuvinte-cheie
// și caută ținta (cererea, șantierul, omul) după cuvintele din denumire. Tot ce schimbă ceva cu bani sau în grafic
// cere confirmare înainte de execuție. Ce nu e recunoscut ca o comandă merge ca întrebare către asistent.
import { q, one, run, J, dayOf, addDays, lei } from "./db.js";
import * as erp from "./connectors/erp.js";
import * as bim from "./connectors/bim.js";
import * as wx from "./connectors/weather.js";
import { sitesAll, siteById, latestReports, zoneContext } from "./data.js";
import * as replan from "./replan.js";
import * as value from "./value.js";
import * as ai from "./ai.js";
import { log } from "./automations.js";

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\s:%-]/g, " ").replace(/\s+/g, " ").trim();
const stems = (s) => norm(s).split(" ").filter((w) => w.length > 3).map((w) => w.slice(0, 5));
const score = (text, name) => { const t = norm(text); return stems(name).filter((w) => t.includes(w)).length; };
const best = (text, list, nameOf) => { let top = null, sc = 0; for (const x of list) { const v = score(text, nameOf(x)); if (v > sc) { sc = v; top = x; } } return top; };
const roDay = (d) => new Intl.DateTimeFormat("ro-RO", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(d + "T12:00:00Z"));
// Pentru citit cu voce: un singur motiv pe tip (ploaie, rafale, îngheț), fără pragurile din paranteze.
const spoken = (reasons) => [...new Map(reasons.map((r) => [r.split(" ")[0], r.replace(/\s*\(limită[^)]*\)/, "")])).values()].join(" și ");
const findSite = (text) => best(text, sitesAll(), (s) => s.name + " " + s.location);

const PAGES = { aprobari: "#/aprobari", santiere: "#/santiere", meteo: "#/meteo", vremea: "#/meteo", valoare: "#/valoare", autopilot: "#/autopilot", alerte: "#/alerte", sarcini: "#/sarcini", replanificari: "#/replanificari", grafice: "#/replanificari", sedinte: "#/sedinte", briefing: "#/", acasa: "#/" };

export function briefSpeech() {
  const today = dayOf(), b = one("SELECT * FROM briefs WHERE day=?", today), d = b ? J(b.data, {}) : null;
  if (!d) return "Briefingul de azi nu a fost scris încă.";
  const pend = erp.approvals("pending").length, rp = replan.openCount();
  return [`Briefing pentru ${roDay(today)}.`, d.headline + ".", d.summary,
    d.decisions?.length ? "De decis azi. " + d.decisions.slice(0, 4).map((x, i) => `${i + 1}. ${x}.`).join(" ") : "",
    `Te așteaptă ${pend} ${pend === 1 ? "aprobare" : "aprobări"}` + (rp ? ` și ${rp} ${rp === 1 ? "grafic nou propus" : "grafice noi propuse"}.` : ".")].filter(Boolean).join(" ");
}

function siteStatus(s) {
  const today = dayOf(), r = latestReports(today)[s.id], p = bim.physical(s.id, today), f = erp.financeSummary(s, today), risk = wx.riskDays(s.id, today);
  const open = one("SELECT COUNT(*) n FROM tasks WHERE site_id=? AND status='open'", s.id).n;
  return `${s.name}. ${r ? r.summary : "Nu are raport recent."} Montat ${Math.round(p.realPct * 100)}% față de ${Math.round(p.planPct * 100)}% planificat${p.lag ? `, ${p.lag} elemente în urmă` : ""}. Cheltuit ${Math.round(f.spentPct * 100)}% din buget.` +
    (f.overdue.length ? ` ${f.overdue.length === 1 ? "O situație de lucrări restantă" : f.overdue.length + " situații de lucrări restante"}, ${lei(f.overdueAmount)}.` : "") +
    (risk ? ` Meteo: ${risk} ${risk === 1 ? "zi de lucru cu risc" : "zile de lucru cu risc"} în următoarele 7 zile.` : " Meteo fără risc în următoarele 7 zile.") + ` ${open} sarcini deschise.`;
}

// Întoarce { say, kind: "answer" | "done" | "confirm" | "navigate", confirm?, go? }
export async function interpret(text, user) {
  const t = norm(text);
  if (!t) return { kind: "answer", say: "Nu am auzit nimic. Mai spune o dată." };

  if (/^(da|nu|ok|sigur|anuleaza|renunta)$/.test(t)) return { kind: "answer", say: "Nu am nimic de confirmat acum." };
  let m;
  if ((m = t.match(/^(aproba|aprob|respinge|resping|refuza)\b/))) {
    const approve = m[1].startsWith("aprob"), pend = erp.approvals("pending");
    if (!pend.length) return { kind: "answer", say: "Nu ai nicio cerere în așteptare." };
    const a = best(t, pend, (x) => x.title + " " + x.supplier + " " + (siteById(x.site_id)?.name || "")) || (pend.length === 1 ? pend[0] : null);
    if (!a) return { kind: "answer", say: "Nu am găsit cererea. În așteptare sunt: " + pend.map((x) => x.title).join("; ") + "." };
    return { kind: "confirm", say: `${approve ? "Aprobi" : "Respingi"} „${a.title}”, ${lei(a.amount)}, ${siteById(a.site_id)?.name || ""}?` + (a.rec === "verifica" ? ` Atenție: ${a.rec_reason}` : ""), confirm: { action: approve ? "approve" : "reject", id: a.id, label: approve ? "Da, aprobă" : "Da, respinge" } };
  }
  if (/(aplica|accepta|aproba).*(grafic|replanific)/.test(t) || /^(aplica|accepta)\b/.test(t)) {
    const open = replan.list().filter((r) => r.status === "proposed");
    if (!open.length) return { kind: "answer", say: "Nu există niciun grafic propus acum." };
    const s = findSite(t), r = s ? open.find((x) => x.site_id === s.id) : open.length === 1 ? open[0] : null;
    if (!r) return { kind: "answer", say: "Pentru ce șantier? Grafice propuse sunt la: " + open.map((x) => x.data.site).join(", ") + "." };
    return { kind: "confirm", say: `Aplici graficul nou la ${r.data.site}? ${r.data.summary}`, confirm: { action: "replan", id: r.id, label: "Da, aplică" } };
  }
  if (/^(sarcina|adauga (o )?sarcina|deschide (o )?sarcina|task|noteaza)\b/.test(t)) {
    const raw = String(text).trim(), people = q("SELECT name FROM users");
    const who = people.find((p) => t.includes(norm(p.name.split(" ")[0])));
    let title = raw.includes(":") ? raw.slice(raw.indexOf(":") + 1) : raw.replace(/^(adaugă|adauga|deschide|notează|noteaza)?\s*(o\s+)?(sarcină|sarcina|task)?\s*(nouă|noua)?\s*(pentru\s+\S+)?[\s,]*/i, "");
    title = title.trim().replace(/^(să|sa)\s+/i, ""); if (title) title = title.charAt(0).toUpperCase() + title.slice(1);
    if (title.length < 4) return { kind: "answer", say: "Ce sarcină să notez? Spune, de exemplu: sarcină pentru Ioana: trimite oferta până vineri." };
    const site = findSite(t), owner = who ? who.name : user.name;
    run("INSERT INTO tasks(site_id,title,owner,due,status,source,created) VALUES(?,?,?,?,'open',?,?)", site?.id || null, title.slice(0, 200), owner, addDays(dayOf(), 2), "voice:" + Date.now(), Date.now());
    return { kind: "done", say: `Am notat sarcina pentru ${owner}: ${title}. Termen peste două zile.` };
  }
  if (/(citeste|asculta|spune|zi-mi).*(briefing|rezumat)|^briefing/.test(t)) return { kind: "answer", say: briefSpeech() };
  if ((m = t.match(/^(deschide|arata|arata-mi|mergi la|du-ma la|vreau)\s+(la\s+)?(\w+)/)) && PAGES[m[3]]) return { kind: "navigate", say: "Deschid.", go: PAGES[m[3]] };
  if (/(ce am de aprobat|ce aprobari|cate aprobari)/.test(t)) { const pend = erp.approvals("pending"); return { kind: "answer", say: pend.length ? `Ai ${pend.length} ${pend.length === 1 ? "cerere" : "cereri"}: ` + pend.map((a) => `${a.title}, ${lei(a.amount)}`).join("; ") + "." : "Nu ai nicio cerere în așteptare." }; }
  if (/(ce am de (facut|decis)|ce ma asteapta|ce e urgent)/.test(t)) return { kind: "answer", say: briefSpeech() };
  if (/(valoare|economisit|cat a adus|cati bani)/.test(t)) { const v = value.compute(); return { kind: "answer", say: `Valoare estimată: ${lei(v.realized)} realizat și ${lei(v.potential)} potențial, care așteaptă decizia ta. Cea mai mare parte vine din ${[...v.cats].sort((a, b) => b.realized + b.potential - a.realized - a.potential)[0].label.toLowerCase()}.` }; }
  const site = findSite(t);
  if (/(vreme|meteo|ploua|ploaie|vant|inghet|ninge|prognoz)/.test(t)) {
    const today = dayOf(), list = (site ? [site] : sitesAll()).map((s) => ({ s, r: wx.risksByDay(s.id, today) })).filter((x) => x.r.length);
    if (!list.length) return { kind: "answer", say: site ? `La ${site.name}, nicio lucrare planificată nu este expusă la vreme în următoarele 7 zile.` : "Nicio lucrare planificată nu este expusă la vreme în următoarele 7 zile." };
    return { kind: "answer", say: list.map((x) => `${x.s.name}: ` + x.r.slice(0, 3).map((r) => `${roDay(r.day)}, ${spoken(r.reasons)}`).join("; ") + ".").join(" ") + (replan.openCount() ? " Am pregătit grafice noi; spune „aplică graficul” și numele șantierului." : "") };
  }
  if (site) return { kind: "answer", say: siteStatus(site) };
  const a = await ai.answer(String(text).slice(0, 500), zoneContext());
  return { kind: "answer", say: a.text };
}

export function confirm(c, user) {
  if (c.action === "approve" || c.action === "reject") {
    const a = erp.decideApproval(Number(c.id), { status: c.action === "approve" ? "approved" : "rejected", by: user.name, note: "Decizie dată prin comandă vocală." });
    if (!a) return { kind: "answer", say: "Cererea a fost deja rezolvată." };
    log("voice", `Comandă vocală: ${c.action === "approve" ? "aprobat" : "respins"} „${a.title}”`, lei(a.amount), a.site_id, 2);
    return { kind: "done", say: `${c.action === "approve" ? "Aprobat" : "Respins"}: ${a.title}.` };
  }
  if (c.action === "replan") {
    const r = replan.decide(Number(c.id), true, user.name);
    if (!r) return { kind: "answer", say: "Propunerea a fost deja rezolvată." };
    log("voice", `Comandă vocală: grafic nou aplicat la ${r.site.name}`, `${r.data.impact.elements} elemente redatate.`, r.site.id, 5);
    return { kind: "done", say: `Am aplicat graficul nou la ${r.site.name} și l-am anunțat pe șeful de șantier.` };
  }
  return { kind: "answer", say: "Nu am înțeles confirmarea." };
}
