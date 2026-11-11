// Autopilot: automatizările care rulează singure (la oră fixă, din oră în oră sau la un eveniment)
// și jurnalul cu tot ce au făcut. Fiecare acțiune notează minutele pe care le-ar fi luat făcută de mână.
import * as stock from "./stock.js";
import { q, one, run, dayOf, hm, addDays, dow, lei, setting } from "./db.js";
import * as erp from "./connectors/erp.js";
import * as bim from "./connectors/bim.js";
import * as wx from "./connectors/weather.js";
import { sitesAll, siteById, zoneContext, latestReports, reportRow } from "./data.js";
import { makeBrief, mgmtReport, draftLetter } from "./ai.js";
import * as replan from "./replan.js";
import * as delays from "./delays.js";
import * as resources from "./resources.js";
import * as clientreport from "./clientreport.js";

export const DEFS = [
  { key: "brief", name: "Briefing de dimineață", desc: "Citește rapoartele de șantier, ERP-ul și BIM-ul și scrie rezumatul zilei, cu deciziile care te așteaptă.", schedule: { type: "daily", at: "06:45" }, when: "Zilnic, 06:45" },
  { key: "weather", name: "Meteo sincronizat cu lucrările", desc: "Ia prognoza pe 7 zile pentru fiecare șantier, o suprapune peste lucrările planificate în BIM și anunță din timp ce trebuie replanificat.", schedule: { type: "hourly" }, when: "Din oră în oră" },
  { key: "replan", name: "Replanificare automată", desc: "Când vremea sau o livrare strică graficul, calculează unul nou din BIM, cu impactul pe termen și pe cost, și ți-l propune spre aprobare.", schedule: { type: "hourly" }, when: "Din oră în oră" },
  { key: "delays", name: "Jurnal de întârzieri", desc: "Notează fiecare zi pierdută, cu cauza și dovezile ei (raport, livrare, meteo), ca dosarul de revendicare să fie gata oricând.", schedule: { type: "hourly" }, when: "Din oră în oră" },
  { key: "triage", name: "Triaj rapoarte de șantier", desc: "La fiecare raport primit: îl structurează, deschide sarcini din blocaje și pregătește adresele către beneficiar.", schedule: { type: "event" }, when: "La fiecare raport" },
  { key: "chase", name: "Reamintire rapoarte lipsă", desc: "Le scrie șefilor de șantier care nu au raportat până la sfârșitul zilei.", schedule: { type: "daily", at: "17:30" }, when: "Zilnic, 17:30" },
  { key: "precheck", name: "Verificare aprobări față de buget", desc: "Compară fiecare cerere cu bugetul rămas din ERP și îți dă o recomandare motivată.", schedule: { type: "hourly" }, when: "Din oră în oră" },
  { key: "autoapprove", name: "Aprobare automată sub prag", desc: "Aprobă singur cererile mici care se încadrează în buget. Pragul se schimbă din setări.", schedule: { type: "hourly" }, when: "Din oră în oră" },
  { key: "deliveries", name: "Supraveghere livrări din fabrică", desc: "Compară livrările din BIM cu graficul; la întârziere deschide o sarcină și pregătește mesajul către fabrică.", schedule: { type: "hourly" }, when: "Din oră în oră" },
  { key: "cash", name: "Urmărire încasări", desc: "Găsește situațiile de lucrări cu scadența depășită și pregătește notificarea de plată.", schedule: { type: "daily", at: "09:00" }, when: "Zilnic, 09:00" },
  { key: "weekly", name: "Raport săptămânal către conducere", desc: "Scrie ciorna raportului din rapoartele zilei, ERP și BIM.", schedule: { type: "weekly", dow: 5, at: "14:00" }, when: "Vinerea, 14:00" },
  { key: "stock", name: "Completare de stoc", desc: "Urmărește stocurile din fabrici și din depozit. Când un articol scade sub minim, pregătește comanda către furnizorul lui și ți-o propune.", schedule: { type: "hourly" }, when: "Din oră în oră" },
  { key: "clientreports", name: "Raport săptămânal către beneficiari", desc: "Scrie pentru fiecare proiect ciorna raportului către beneficiar: stadiu, ce s-a executat, ce urmează și ce decizii se așteaptă de la el.", schedule: { type: "weekly", dow: 5, at: "13:00" }, when: "Vinerea, 13:00" },
  { key: "minutes", name: "Minute de ședință", desc: "Din dictare sau notițe scoate rezumatul, deciziile și sarcinile cu responsabili.", schedule: { type: "event" }, when: "La fiecare ședință" },
];

export function ensure() {
  for (const d of DEFS) run("INSERT OR IGNORE INTO automations(key,enabled,last_run,last_result) VALUES(?,1,NULL,NULL)", d.key);
}
export const log = (key, title, detail, site_id, minutes) => run("INSERT INTO automation_log(ts,key,title,detail,site_id,minutes) VALUES(?,?,?,?,?,?)", Date.now(), key, title, detail || "", site_id || null, minutes || 0);
const enabled = (key) => one("SELECT enabled FROM automations WHERE key=?", key)?.enabled === 1;
const director = () => one("SELECT name FROM users WHERE role='director' ORDER BY id LIMIT 1")?.name || "Director zonal";
const addTask = (site_id, title, owner, due, source) => {
  if (one("SELECT id FROM tasks WHERE source=?", source)) return false;
  run("INSERT INTO tasks(site_id,title,owner,due,status,source,created) VALUES(?,?,?,?,'open',?,?)", site_id, title.slice(0, 200), owner, due, source, Date.now());
  return true;
};
async function addDraft(kind, ref, site, recipient, title, facts) {
  if (one("SELECT id FROM drafts WHERE ref=?", ref)) return false;
  const body = await draftLetter(kind, { ...facts, site: site.name, client: site.client, signer: director() });
  run("INSERT INTO drafts(ts,kind,ref,site_id,recipient,title,body,status) VALUES(?,?,?,?,?,?,?,'draft')", Date.now(), kind, ref, site.id, recipient, title, body);
  return true;
}

const RUN = {
  async stock() {
    const made = stock.autopropose();
    for (const m of made) log("stock", `Am pregătit comanda: ${m.qty} ${m.unit} ${m.item}`, `${m.loc} · ${m.supplier}`, null, 15);
    return made.length;
  },
  async clientreports() {
    let n = 0;
    for (const s of sitesAll()) if (await clientreport.generate(s.id)) { log("clientreports", `Am scris raportul către beneficiar pentru ${s.name}`, s.client || "", s.id, 45); n++; }
    return n ? `${n} ciorne pregătite` : "Niciun proiect";
  },
  async delays() {
    const n = delays.detect(dayOf());
    if (n) log("delays", `Am trecut ${n} ${n === 1 ? "întârziere nouă" : "întârzieri noi"} în dosare`, "Cu cauza și dovezile fiecăreia.", null, n * 10);
    return n ? `${n} intrări noi` : "Nimic nou";
  },
  async replan() {
    const fresh = replan.generate(dayOf());
    for (const f of fresh) log("replan", `Am pregătit un grafic nou pentru ${f.site.name}`, f.data.summary, f.site.id, 40);
    return fresh.length ? `${fresh.length} propuneri noi` : "Nicio propunere nouă";
  },
  async weather() {
    const today = dayOf(); let n = 0, source = "";
    for (const s of sitesAll()) {
      source = await wx.refresh(s, today);
      for (const r of wx.risksByDay(s.id, today)) {
        const due = r.day > today ? addDays(r.day, -1) : today, why = r.reasons.join(" și ");
        if (!addTask(s.id, `Replanifică lucrările din ${r.day}: ${why}. Expuse: ${r.works.join(", ")}`, s.manager || director(), due, `meteo:${s.id}:${r.day}`)) continue;
        if (s.manager_id) run("INSERT INTO notifications(user_id,ts,text) VALUES(?,?,?)", s.manager_id, Date.now(), `Meteo ${r.day}: ${why}. Lucrări expuse: ${r.works.join(", ")}. Propune replanificarea.`);
        log("weather", `Am găsit un risc meteo la ${s.name}`, `${r.day}: ${why}. Expuse: ${r.works.join(", ")} (${r.count} elemente). Am deschis sarcina de replanificare și l-am anunțat pe șeful de șantier.`, s.id, 15); n++;
      }
    }
    return (n ? `${n} riscuri noi` : "Niciun risc nou") + ` · sursă: ${source}`;
  },
  async brief() {
    const today = dayOf(), data = await makeBrief(zoneContext(today));
    run("INSERT INTO briefs(day,ts,data,auto) VALUES(?,?,?,1) ON CONFLICT(day) DO UPDATE SET ts=excluded.ts, data=excluded.data", today, Date.now(), JSON.stringify(data));
    log("brief", "Am scris briefingul zilei", data.headline, null, 25);
    return "Briefing scris";
  },
  async chase() {
    const today = dayOf(), have = new Set(q("SELECT DISTINCT site_id FROM reports WHERE day=?", today).map((r) => r.site_id));
    let n = 0;
    for (const s of sitesAll().filter((s) => !have.has(s.id) && s.manager_id)) {
      run("INSERT INTO notifications(user_id,ts,text) VALUES(?,?,?)", s.manager_id, Date.now(), `Lipsește raportul de azi pentru ${s.name}. Durează două minute: dictează ce s-a întâmplat.`);
      log("chase", `I-am reamintit lui ${s.manager} raportul de azi`, s.name, s.id, 5); n++;
    }
    return n ? `${n} reamintiri trimise` : "Toate șantierele au raportat";
  },
  async precheck() {
    let n = 0;
    for (const a of erp.approvals("pending").filter((a) => !a.rec)) {
      const line = erp.budgetLines(a.site_id).find((l) => l.category === a.category);
      let rec = "aproba", reason;
      if (!line) reason = "Nu are linie de buget asociată; sumă mică, de regulă se aprobă.";
      else if (a.amount <= line.remaining) reason = `Se încadrează în bugetul rămas pe ${a.category}: ${lei(line.remaining)} disponibili.`;
      else { rec = "verifica"; reason = `Depășește bugetul rămas pe ${a.category} cu ${lei(a.amount - line.remaining)} (rămas ${lei(Math.max(0, line.remaining))}).`; }
      erp.setRecommendation(a.id, rec, reason);
      log("precheck", `Am verificat „${a.title}” față de buget`, reason, a.site_id, 4); n++;
    }
    return n ? `${n} cereri verificate` : "Nimic nou de verificat";
  },
  async autoapprove() {
    const limit = setting("autoapprove_limit", 3000);
    let n = 0;
    for (const a of erp.approvals("pending").filter((a) => a.rec === "aproba" && a.amount <= limit)) {
      erp.decideApproval(a.id, { status: "approved", by: "Autopilot", note: `Aprobat automat: sub pragul de ${lei(limit)} și în buget.`, auto: 1 });
      log("autoapprove", `Am aprobat automat „${a.title}”`, `${lei(a.amount)}, sub pragul de ${lei(limit)} și în buget.`, a.site_id, 3); n++;
    }
    return n ? `${n} cereri aprobate automat` : "Nicio cerere sub prag";
  },
  async deliveries() {
    const today = dayOf(); let n = 0;
    for (const d of bim.deliveries(null, addDays(today, -1), addDays(today, 2)).filter((d) => d.late)) {
      const s = siteById(d.site_id); if (!s) continue;
      const what = `${d.count} × ${d.kind}, zona ${d.zone}`;
      const t = addTask(s.id, `Deblochează livrarea întârziată: ${what}`, director(), today, `delivery:${d.id}`);
      const dr = await addDraft("livrare", `delivery:${d.id}`, s, "Fabrica de prefabricate", `Livrare întârziată – ${s.name}`, { fact: what, planned: d.planned, eta: d.eta || "necunoscut" });
      if (t || dr) { log("deliveries", `Am prins o livrare întârziată la ${s.name}`, `${what}. Planificat ${d.planned}, estimat ${d.eta || "necunoscut"}. Am deschis sarcina și am pregătit mesajul către fabrică.`, s.id, 20); n++; }
    }
    return n ? `${n} întârzieri noi` : "Nicio întârziere nouă";
  },
  async cash() {
    const today = dayOf(); let n = 0;
    for (const s of sitesAll()) for (const r of erp.receivables(s.id, today).filter((r) => r.overdueDays > 0)) {
      if (await addDraft("incasare", `rec:${r.id}`, s, s.client, `Notificare de plată – ${r.title}`, { fact: `${r.title} (${r.no})`, amount: lei(r.amount), due: r.due, days: r.overdueDays })) {
        log("cash", `Am pregătit notificarea de plată pentru ${s.client}`, `${r.title}: ${lei(r.amount)}, restantă de ${r.overdueDays} zile.`, s.id, 15); n++;
      }
    }
    return n ? `${n} notificări pregătite` : "Nicio restanță nouă";
  },
  async weekly() {
    const to = dayOf(), from = addDays(to, -6);
    const reports = q("SELECT r.day, s.name AS santier, r.status, r.summary FROM reports r JOIN sites s ON s.id=r.site_id WHERE r.day BETWEEN ? AND ? ORDER BY r.ts", from, to);
    const out = await mgmtReport(zoneContext(to), reports, from, to);
    run("INSERT INTO mgmt_reports(d_from,d_to,ts,text,auto) VALUES(?,?,?,?,1)", from, to, Date.now(), out.text);
    log("weekly", "Am scris ciorna raportului către conducere", `${from} – ${to}, din ${reports.length} rapoarte zilnice.`, null, 60);
    return "Ciornă pregătită";
  },
};

// Evenimente
export async function onReport(reportId, rebrief = true) {
  if (!enabled("triage")) return;
  const r = reportRow(one("SELECT * FROM reports WHERE id=?", reportId)), s = siteById(r.site_id);
  let tasks = 0, drafts = 0;
  const items = [...(r.details.blockers || []), ...(r.details.needs || [])];
  for (let i = 0; i < items.length; i++) if (addTask(s.id, items[i], director(), dayOf(), `report:${r.id}:${i}`)) tasks++;
  const disp = (r.details.blockers || []).find((b) => /dispozi/i.test(b));
  if (disp && await addDraft("dispozitie", `disp:${s.id}`, s, s.client, `Solicitare dispoziție de șantier – ${s.name}`, { fact: disp })) drafts++;
  run("UPDATE automations SET last_run=?, last_result=? WHERE key='triage'", Date.now(), `${tasks} sarcini, ${drafts} adrese`);
  log("triage", `Am procesat raportul de la ${s.name}`, `Status: ${r.status}. ${tasks} sarcini deschise${drafts ? ", o adresă către beneficiar pregătită" : ""}.`, s.id, 8 + drafts * 15);
  if (enabled("delays")) delays.detect(dayOf());
  resources.detectSubs(dayOf());
  if (rebrief && r.status === "critic" && enabled("brief")) await RUN.brief().catch(() => {});
}

export async function runNow(key) {
  if (!RUN[key]) return null;
  let result;
  try { result = await RUN[key](); } catch (e) { result = "Eroare: " + e.message; console.error("[autopilot]", key, e); }
  run("UPDATE automations SET last_run=?, last_result=? WHERE key=?", Date.now(), result, key);
  return result;
}

export async function tick() {
  const today = dayOf(), now = hm();
  for (const d of DEFS) {
    const row = one("SELECT * FROM automations WHERE key=?", d.key);
    if (!row?.enabled || !RUN[d.key]) continue;
    const last = row.last_run ? dayOf(new Date(row.last_run)) : null, s = d.schedule;
    const dueNow = (s.type === "daily" && now >= s.at && last !== today) || (s.type === "weekly" && dow(today) === s.dow && now >= s.at && last !== today) || (s.type === "hourly" && (!row.last_run || Date.now() - row.last_run > 3600000));
    if (dueNow) await runNow(d.key);
  }
}

export function list() {
  const rows = Object.fromEntries(q("SELECT * FROM automations").map((r) => [r.key, r]));
  return DEFS.map((d) => ({ key: d.key, name: d.name, desc: d.desc, when: d.when, manual: !!RUN[d.key], enabled: rows[d.key]?.enabled === 1, last_run: rows[d.key]?.last_run || null, last_result: rows[d.key]?.last_result || null }));
}
export function stats(today = dayOf()) {
  const start = new Date(today + "T00:00:00+02:00").getTime() - 3600000; // miezul nopții la București, cu marjă pentru ora de vară
  const day = one("SELECT COUNT(*) n, COALESCE(SUM(minutes),0) m FROM automation_log WHERE ts>=?", start);
  const week = one("SELECT COUNT(*) n, COALESCE(SUM(minutes),0) m FROM automation_log WHERE ts>=?", Date.now() - 7 * 86400000);
  return { today: { actions: day.n, minutes: day.m }, week: { actions: week.n, minutes: week.m } };
}
// Prima pornire: rulează tot o dată, ca aplicația să nu fie goală.
export async function bootstrap() {
  ensure();
  if (one("SELECT COUNT(*) n FROM automation_log").n > 0) return;
  for (const r of q("SELECT id FROM reports WHERE day=? ORDER BY ts", dayOf())) await onReport(r.id, false);
  resources.detectSubs(dayOf());
  for (const k of ["weather", "replan", "delays", "precheck", "autoapprove", "deliveries", "cash", "stock", "brief"]) await runNow(k);
}
