// "Serverul" aplicației, rulat în browser. Aceleași rute pe care le-ar expune un API real,
// ca interfața să nu se schimbe în ziua în care aplicația primește un server adevărat.
import { openDb, flush, q, one, run, J, dayOf, addDays, setting, setSetting } from "./db.js";
import * as erp from "./connectors/erp.js";
import * as bim from "./connectors/bim.js";
import * as wx from "./connectors/weather.js";
import { sitesAll, siteById, latestReports, alerts, zoneContext, reportRow } from "./data.js";
import * as ai from "./ai.js";
import * as auto from "./automations.js";
import { seed, seedIfEmpty, startOwn, mode } from "./seed.js";
import * as replan from "./replan.js";
import { kindOf } from "./importer.js";
import * as value from "./value.js";
import * as commands from "./commands.js";
import * as crud from "./crud.js";
import * as share from "./share.js";

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };

let ready = null;
export function boot() {
  if (!ready) ready = (async () => {
    await openDb(); seedIfEmpty(); await auto.bootstrap();
    const tick = () => auto.tick().catch((e) => console.error("[autopilot]", e));
    tick(); setInterval(tick, 60000);
    // La trecerea în fundal sau la închidere, tot ce nu a apucat să fie scris pe dispozitiv se scrie acum.
    document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); else tick(); });
    window.addEventListener("pagehide", () => { flush(); });
  })();
  return ready;
}

const UID = "dz.uid";
const currentUser = () => { let id = null; try { id = Number(localStorage.getItem(UID)); } catch { /* ignorat */ } return id ? one("SELECT id,name,email,role,site_id FROM users WHERE id=?", id) : null; };

// Poze: micșorate în browser și păstrate în raport ca imagini încorporate.
async function shrink(file) {
  const bmp = await createImageBitmap(file), k = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.75);
}

const ROUTES = [
  ["GET", "users", { open: true }, () => ({ mode: mode(), users: q("SELECT u.id,u.name,u.role,s.name AS site FROM users u LEFT JOIN sites s ON s.id=u.site_id ORDER BY u.id") })],
  ["POST", "login", { open: true }, ({ body }) => { const u = one("SELECT id FROM users WHERE id=?", Number(body.user_id)); if (!u) fail(401, "Contul nu există."); try { localStorage.setItem(UID, String(u.id)); } catch { fail(500, "Browserul nu permite salvarea sesiunii."); } return { ok: true }; }],
  ["POST", "logout", { open: true }, () => { try { localStorage.removeItem(UID); } catch { /* ignorat */ } return { ok: true }; }],
  ["POST", "reset", { director: true }, async () => { seed(); await auto.bootstrap(); try { localStorage.setItem(UID, String(one("SELECT id FROM users WHERE role='director'").id)); } catch { /* ignorat */ } await flush(); return { ok: true }; }],
  ["POST", "workspace/own", { director: true }, async ({ body }) => { startOwn(body.name); auto.ensure(); try { localStorage.setItem(UID, String(one("SELECT id FROM users WHERE role='director'").id)); } catch { /* ignorat */ } await flush(); return { ok: true }; }],
  ["POST", "team/:id", { director: true }, ({ params, body }) => { crud.updateUser(params.id, body); return { ok: true }; }],
  ["POST", "approvals/:id/edit", { director: true }, async ({ params, body }) => { crud.updateApproval(params.id, body); await auto.runNow("precheck"); return { ok: true }; }],
  ["POST", "approvals/:id/delete", { director: true }, ({ params }) => { crud.removeApproval(params.id); return { ok: true }; }],
  ["POST", "reports/:id/delete", { director: true }, ({ params }) => { crud.removeReport(params.id); return { ok: true }; }],
  ["POST", "meetings/:id/delete", { director: true }, ({ params }) => { crud.removeMeeting(params.id); return { ok: true }; }],
  /* ----- echipă fără server: invitații și date trimise prin link ----- */
  ["GET", "sites/:id/invite", { director: true }, ({ params }) => share.inviteLink(params.id) || fail(404, "Proiectul nu există.")],
  ["POST", "join", { open: true }, async ({ body }) => { const r = share.join(body.payload, body.name) || fail(400, "Invitația nu a putut fi citită. Cere un link nou."); auto.ensure(); try { localStorage.setItem(UID, String(r.uid)); } catch { /* ignorat */ } await flush(); return r; }],
  ["GET", "reports/:id/link", {}, ({ params }) => share.reportLink(params.id) || fail(404, "Raportul nu există.")],
  ["GET", "approvals/:id/link", {}, ({ params }) => share.approvalLink(params.id) || fail(404, "Cererea nu există.")],
  ["POST", "preview", { open: true }, ({ body }) => share.preview(body.payload) || fail(400, "Linkul nu a putut fi citit.")],
  ["POST", "receive", { director: true }, async ({ body }) => {
    const r = share.receive(body.payload); if (r.error) fail(400, r.error);
    if (r.kind === "rep" && r.id) await auto.onReport(r.id);
    if (r.kind === "apr" && !r.duplicate) await auto.runNow("precheck");
    return r;
  }],
  ["GET", "me", {}, ({ user }) => ({ user, mode: mode(), device: setting("device", "director"), director: setting("director", ""), ai: ai.aiMode(), today: dayOf(), sites: sitesAll().filter((s) => user.role === "director" || s.id === user.site_id).map((s) => ({ id: s.id, name: s.name, location: s.location })) })],

  ["GET", "home", { director: true }, () => {
    const today = dayOf(), reports = latestReports(today), b = one("SELECT * FROM briefs WHERE day=?", today);
    return {
      today, brief: b ? { ...J(b.data, {}), ts: b.ts } : null, stats: auto.stats(today), alerts: alerts(today), value: (() => { const v = value.compute(); return { realized: v.realized, potential: v.potential }; })(),
      weather: (() => { const list = sitesAll().map((s) => wx.riskDays(s.id, today)); return { sites: list.filter((n) => n > 0).length, days: list.reduce((a, n) => a + n, 0) }; })(),
      waiting: { approvals: erp.approvals("pending").length, drafts: one("SELECT COUNT(*) n FROM drafts WHERE status='draft'").n, overdue: one("SELECT COUNT(*) n FROM tasks WHERE status='open' AND due<?", today).n, replans: replan.openCount(), open: one("SELECT COUNT(*) n FROM tasks WHERE status='open'").n },
      sites: sitesAll().map((s) => { const r = reports[s.id], p = bim.physical(s.id, today), f = erp.financeSummary(s, today);
        return { id: s.id, name: s.name, location: s.location, manager: s.manager, status: r ? r.status : "none", summary: r?.summary || "", workers: r?.workers ?? null, reportDay: r?.day || null, realPct: p.realPct, planPct: p.planPct, spentPct: f.spentPct, wx: wx.forecast(s.id).days.find((d) => d.day === today) || null, riskDays: wx.riskDays(s.id, today) }; }),
    };
  }],
  ["POST", "brief", { director: true }, async () => { await auto.runNow("brief"); const b = one("SELECT * FROM briefs WHERE day=?", dayOf()); return { brief: { ...J(b.data, {}), ts: b.ts } }; }],

  ["GET", "sites/:id", { director: true }, ({ params }) => {
    const s = siteById(params.id) || fail(404, "Șantierul nu există."), today = dayOf();
    return { site: s, finance: erp.financeSummary(s, today), physical: bim.physical(s.id, today), deliveries: bim.deliveries(s.id, addDays(today, -3), addDays(today, 10)),
      weather: { ...wx.forecast(s.id), risks: wx.risks(s.id, today), riskDays: wx.riskDays(s.id, today) },
      reports: q("SELECT * FROM reports WHERE site_id=? ORDER BY ts DESC LIMIT 10", s.id).map(reportRow),
      tasks: q("SELECT * FROM tasks WHERE site_id=? AND status='open' ORDER BY due", s.id), alerts: alerts(today).filter((a) => a.site_id === s.id),
      replan: replan.list().find((r) => r.site_id === s.id && r.status === "proposed") || null,
      equipment: q("SELECT * FROM erp_equipment WHERE site_id=? ORDER BY id", s.id), team: q("SELECT id, name FROM users WHERE role='sef' ORDER BY name") };
  }],

  ["POST", "projects/import", { director: true }, async ({ body }) => {
    const target = body.target ? siteById(String(body.target)) || fail(404, "Proiectul ales nu mai există.") : null;
    const name = target ? target.name : String(body.name || "").trim().slice(0, 80) || fail(400, "Scrie numele proiectului.");
    const budget = Array.isArray(body.budget) ? body.budget.slice(0, 200) : [], schedule = Array.isArray(body.schedule) ? body.schedule.slice(0, 400) : [];
    if (!budget.length && !schedule.length) fail(400, "Fișierul nu conține nici buget, nici grafic de lucrări care să poată fi importat.");
    const location = target ? target.location : String(body.location || "").trim().slice(0, 60);
    let lat = target ? target.lat : null, lon = target ? target.lon : null;
    if (location && !target) try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=5&language=ro&format=json`, { signal: AbortSignal.timeout(6000) });
      const hits = (await r.json()).results || [], hit = hits.find((h) => h.country_code === "RO") || hits[0];
      if (hit) { lat = hit.latitude; lon = hit.longitude; }
    } catch { /* fără coordonate proiectul rămâne fără meteo */ }
    const today = dayOf(), id = target ? target.id : "imp-" + Date.now().toString(36);
    const dates = schedule.flatMap((r) => [r.start, r.end]).filter(Boolean).sort();
    const total = budget.reduce((a, b) => a + b.budget, 0);
    if (target) { const used = new Set(q("SELECT DISTINCT zone FROM bim_elements WHERE site_id=?", id).map((r) => r.zone)); for (const r of schedule) { let z = r.zone, k = 2; while (used.has(z)) z = `${r.zone} (${k++})`; r.zone = z; used.add(z); } }
    else run("INSERT INTO sites(id,name,location,client,manager_id,contract,start,finish,ord,lat,lon) VALUES(?,?,?,?,?,?,?,?,?,?,?)", id, name, location, String(body.client || "").slice(0, 80), null, Number(body.contract) > 0 ? Number(body.contract) : total, dates[0] || today, dates.at(-1) || addDays(today, 90), (one("SELECT MAX(ord) m FROM sites").m || 0) + 1, lat, lon);
    for (const b of budget) run("INSERT INTO erp_budget(site_id,category,budget,actual,committed) VALUES(?,?,?,?,?)", id, String(b.category).slice(0, 80), b.budget, b.actual || 0, b.committed || 0);
    let elements = 0;
    for (const r of schedule) {
      if (elements > 3000) break;
      const kind = kindOf(r.work + " " + r.zone) || String(r.work).slice(0, 60), n = r.qty > 0 ? (r.qty <= 300 ? r.qty : 60) : 10;
      const span = Math.max(0, Math.round((new Date(r.end) - new Date(r.start)) / 86400000)), mounted = Math.round((n * (r.done || 0)) / 100);
      for (let i = 0; i < n; i++) {
        const planned = addDays(r.start, Math.round((span * i) / Math.max(1, n - 1)));
        run("INSERT INTO bim_elements(site_id,code,kind,zone,planned,baseline,status,mounted_on) VALUES(?,?,?,?,?,?,?,?)", id, `IMP-${elements + 1}`, kind, String(r.zone).slice(0, 60), planned, planned, i < mounted ? "montat" : "planificat", i < mounted ? planned : null);
        elements++;
      }
    }
    auto.log("import", target ? `Am adăugat date din Excel în ${name}` : `Am importat proiectul ${name}`, `${budget.length} linii de buget și ${schedule.length} lucrări (${elements} elemente de urmărit). ${lat != null ? "Localizat pentru meteo: " + location + "." : "Fără localizare, deci fără meteo."}`, id, 90);
    await auto.runNow("weather"); await auto.runNow("replan");
    return { id, name, budget: budget.length, schedule: schedule.length, elements, located: lat != null };
  }],

  /* ----- date ținute la zi de om: proiecte, rânduri din ERP/BIM, echipă ----- */
  ["POST", "projects", { director: true }, async ({ body }) => { const r = await crud.createProject(body); await auto.runNow("weather"); return r; }],
  ["POST", "projects/:id", { director: true }, async ({ params, body }) => { const r = await crud.updateProject(params.id, body); if (r.relocated) { await auto.runNow("weather"); replan.generate(); } return { ok: true }; }],
  ["POST", "projects/:id/delete", { director: true }, ({ params }) => { crud.deleteProject(params.id); return { ok: true }; }],
  ["POST", "sites/:id/zones", { director: true }, ({ params, body }) => { body.old ? crud.updateZone(params.id, String(body.old), body) : crud.createZone(params.id, body); replan.generate(); return { ok: true }; }],
  ["POST", "sites/:id/zones/delete", { director: true }, ({ params, body }) => { crud.deleteZone(params.id, String(body.zone)); replan.generate(); return { ok: true }; }],
  ["POST", "sites/:id/approvals", {}, async ({ user, params, body }) => { if (user.role !== "director" && user.site_id !== params.id) fail(403, "Poți cere aprobări doar pentru șantierul tău."); const id = crud.createApproval(params.id, body, user); await auto.runNow("precheck"); return { id }; }],
  ["POST", "sites/:id/rows/:entity", { director: true }, ({ params, body }) => { const id = crud.create(params.entity, params.id, body); replan.generate(); return { id }; }],
  ["POST", "rows/:entity", { director: true }, ({ params, body }) => ({ id: crud.create(params.entity, body.site_id || null, body) })],
  ["POST", "rows/:entity/:id", { director: true }, ({ params, body }) => { crud.update(params.entity, params.id, body); replan.generate(); return { ok: true }; }],
  ["POST", "rows/:entity/:id/delete", { director: true }, ({ params }) => { crud.remove(params.entity, params.id); replan.generate(); return { ok: true }; }],
  ["GET", "team", { director: true }, () => ({ users: q("SELECT u.id,u.name,u.role,u.site_id,s.name AS site FROM users u LEFT JOIN sites s ON s.id=u.site_id ORDER BY u.id"), sites: sitesAll().map((s) => ({ id: s.id, name: s.name })) })],
  ["POST", "team", { director: true }, ({ body }) => ({ id: crud.createUser(body) })],
  ["POST", "team/:id/delete", { director: true }, ({ params }) => { crud.removeUser(params.id); return { ok: true }; }],

  ["GET", "weather", { director: true }, () => {
    const today = dayOf(), open = replan.list().filter((r) => r.status === "proposed");
    return { today, sites: sitesAll().map((s) => ({ id: s.id, name: s.name, location: s.location, ...wx.forecast(s.id), risks: wx.risksByDay(s.id, today), riskDays: wx.riskDays(s.id, today), replan: open.some((r) => r.site_id === s.id) })) };
  }],
  ["POST", "weather", { director: true }, async () => ({ result: await auto.runNow("weather"), replan: await auto.runNow("replan") })],
  ["POST", "command", { director: true }, async ({ user, body }) => (body.confirm ? commands.confirm(body.confirm, user) : commands.interpret(String(body.text || "").slice(0, 500), user))],
  ["GET", "brief/speech", { director: true }, () => ({ say: commands.briefSpeech() })],
  ["GET", "value", { director: true }, () => value.compute()],
  ["POST", "value", { director: true }, ({ body }) => { const bad = value.saveParams(body || {}); if (bad) fail(400, `Valoare nepotrivită la „${bad}”.`); return value.compute(); }],

  ["GET", "replans", { director: true }, () => ({ items: replan.list() })],
  ["POST", "replans/:id", { director: true }, ({ user, params, body }) => {
    const r = replan.decide(Number(params.id), body.decision === "accept", user.name) || fail(409, "Propunerea a fost deja rezolvată.");
    if (body.decision === "accept") auto.log("replan", `Am scris graficul nou în BIM pentru ${r.site.name}`, `${r.data.impact.elements} elemente redatate. Șeful de șantier a fost anunțat, iar sarcinile de replanificare au fost închise.`, r.site.id, 20);
    return { ok: true };
  }],

  ["POST", "reports", {}, async ({ user, body }) => {
    const site = siteById(body.get("site_id")) || fail(400, "Alege șantierul."), raw = String(body.get("text") || "").trim();
    if (user.role !== "director" && user.site_id !== site.id) fail(403, "Poți raporta doar pentru șantierul tău.");
    const files = body.getAll("photos").filter((f) => f instanceof File && /^image\//.test(f.type)).slice(0, 3);
    if (!raw && !files.length) fail(400, "Scrie, dictează sau adaugă cel puțin o poză.");
    const photos = []; for (const f of files) { try { photos.push(await shrink(f)); } catch { /* poză necitibilă, sărită */ } }
    const st = await ai.structureReport(site, raw, photos.map((u) => ({ type: "image/jpeg", data: u.split(",")[1] })));
    const id = Number(run("INSERT INTO reports(site_id,user_id,author,day,ts,raw,status,summary,workers,details,photos) VALUES(?,?,?,?,?,?,?,?,?,?,?)", site.id, user.id, user.name, dayOf(), Date.now(), raw, st.status, st.summary, st.workers, JSON.stringify(st.details), JSON.stringify(photos)).lastInsertRowid);
    await auto.onReport(id);
    return { report: reportRow(one("SELECT * FROM reports WHERE id=?", id)), by: st.by, tasks: q("SELECT title FROM tasks WHERE source LIKE ?", `report:${id}:%`).map((t) => t.title) };
  }],
  ["GET", "my", {}, ({ user }) => ({
    reports: q("SELECT * FROM reports WHERE user_id=? ORDER BY ts DESC LIMIT 8", user.id).map(reportRow),
    notifications: q("SELECT * FROM notifications WHERE user_id=? ORDER BY ts DESC LIMIT 20", user.id),
    tasks: user.site_id ? q("SELECT * FROM tasks WHERE site_id=? AND status='open' ORDER BY due", user.site_id) : [],
  })],

  ["GET", "approvals", { director: true }, () => ({ source: erp.SOURCE, limit: setting("autoapprove_limit", 3000), items: erp.approvals().slice(0, 40).map((a) => ({ ...a, site: siteById(a.site_id)?.name || "" })) })],
  ["POST", "approvals/:id", { director: true }, ({ user, params, body }) => {
    const status = body.decision === "approve" ? "approved" : body.decision === "reject" ? "rejected" : fail(400, "Decizie necunoscută.");
    return { approval: erp.decideApproval(Number(params.id), { status, by: user.name, note: String(body.note || "").slice(0, 300) }) || fail(409, "Cererea a fost deja rezolvată.") };
  }],

  ["GET", "autopilot", { director: true }, () => ({ ai: ai.aiMode(), aiError: ai.aiLastError(), hasKey: !!ai.getKey(), stats: auto.stats(), limit: setting("autoapprove_limit", 3000), automations: auto.list(),
    drafts: q("SELECT d.*, s.name AS site FROM drafts d LEFT JOIN sites s ON s.id=d.site_id ORDER BY (d.status='draft') DESC, d.ts DESC LIMIT 30"),
    log: q("SELECT l.*, s.name AS site FROM automation_log l LEFT JOIN sites s ON s.id=l.site_id ORDER BY l.ts DESC LIMIT 40") })],
  ["POST", "autopilot/:key", { director: true }, async ({ params, body }) => {
    if (typeof body.enabled === "boolean") run("UPDATE automations SET enabled=? WHERE key=?", body.enabled ? 1 : 0, params.key);
    return { ok: true, result: body.run ? await auto.runNow(params.key) : null };
  }],
  ["POST", "settings", { director: true }, ({ body }) => {
    if ("autoapprove_limit" in body) { const n = Number(body.autoapprove_limit); if (!(n >= 0 && n <= 100000)) fail(400, "Pragul trebuie să fie între 0 și 100.000 lei."); setSetting("autoapprove_limit", n); }
    if ("ai_key" in body) ai.setKey(String(body.ai_key || "").trim());
    return { ok: true };
  }],
  ["POST", "drafts/:id", { director: true }, ({ params, body }) => {
    if (typeof body.body === "string") run("UPDATE drafts SET body=? WHERE id=?", body.body.slice(0, 5000), Number(params.id));
    if (["sent", "dismissed", "draft"].includes(body.status)) run("UPDATE drafts SET status=? WHERE id=?", body.status, Number(params.id));
    return { ok: true };
  }],

  ["GET", "meetings", { director: true }, () => ({ meetings: q("SELECT m.*, s.name AS site FROM meetings m LEFT JOIN sites s ON s.id=m.site_id ORDER BY m.ts DESC LIMIT 20").map((m) => ({ ...m, decisions: J(m.decisions, []), tasks: q("SELECT * FROM tasks WHERE meeting_id=?", m.id) })) })],
  ["POST", "meetings", { director: true }, async ({ body }) => {
    const raw = String(body.text || "").trim(), site = body.site_id ? siteById(body.site_id) : null, today = dayOf(), title = String(body.title || "Ședință").slice(0, 120);
    if (raw.length < 20) fail(400, "Dictează sau scrie ce s-a discutat (cel puțin o frază).");
    const m = await ai.minutes(raw, site?.name, today);
    const id = Number(run("INSERT INTO meetings(site_id,title,day,ts,raw,summary,decisions) VALUES(?,?,?,?,?,?,?)", site?.id || null, title, today, Date.now(), raw, m.summary, JSON.stringify(m.decisions)).lastInsertRowid);
    m.tasks.forEach((t, i) => run("INSERT INTO tasks(site_id,meeting_id,title,owner,due,status,source,created) VALUES(?,?,?,?,?,'open',?,?)", site?.id || null, id, t.title, t.owner, t.due || addDays(today, 3), `meeting:${id}:${i}`, Date.now()));
    run("UPDATE automations SET last_run=?, last_result=? WHERE key='minutes'", Date.now(), `${m.tasks.length} sarcini create`);
    auto.log("minutes", `Am scris minuta: ${title}`, `${m.decisions.length} decizii, ${m.tasks.length} sarcini cu responsabili.`, site?.id, 20);
    return { id, by: m.by };
  }],
  ["GET", "tasks", { director: true }, () => ({ today: dayOf(), tasks: q("SELECT t.*, s.name AS site FROM tasks t LEFT JOIN sites s ON s.id=t.site_id ORDER BY (t.status='open') DESC, t.due LIMIT 80") })],
  ["POST", "tasks", { director: true }, ({ user, body }) => { const title = String(body.title || "").trim() || fail(400, "Scrie sarcina.");
    run("INSERT INTO tasks(site_id,title,owner,due,status,source,created) VALUES(?,?,?,?,'open',?,?)", body.site_id || null, title.slice(0, 200), String(body.owner || user.name), body.due || addDays(dayOf(), 2), "manual:" + Date.now(), Date.now()); return { ok: true }; }],
  ["POST", "tasks/:id", {}, ({ params, body }) => { run("UPDATE tasks SET status=? WHERE id=?", body.done ? "done" : "open", Number(params.id)); return { ok: true }; }],

  ["GET", "mgmt", { director: true }, () => ({ reports: q("SELECT * FROM mgmt_reports ORDER BY ts DESC LIMIT 5") })],
  ["POST", "mgmt", { director: true }, async () => { await auto.runNow("weekly"); return { report: one("SELECT * FROM mgmt_reports ORDER BY ts DESC LIMIT 1") }; }],
  ["POST", "ask", { director: true }, async ({ body }) => { const question = String(body.question || "").trim().slice(0, 500) || fail(400, "Scrie întrebarea."); return ai.answer(question, zoneContext()); }],
];

export async function handle(method, path, body) {
  await boot();
  const parts = path.replace(/^\/+/, "").split("/");
  for (const [m, pattern, opt, fn] of ROUTES) {
    const pp = pattern.split("/");
    if (m !== method || pp.length !== parts.length) continue;
    const params = {}; let ok = true;
    pp.forEach((seg, i) => { if (seg.startsWith(":")) params[seg.slice(1)] = decodeURIComponent(parts[i]); else if (seg !== parts[i]) ok = false; });
    if (!ok) continue;
    const user = currentUser();
    if (!opt.open && !user) fail(401, "Alege un cont ca să intri.");
    if (opt.director && user.role !== "director") fail(403, "Doar directorul zonal are acces aici.");
    try { return await fn({ user, params, body: body || {} }); }
    catch (e) { if (e instanceof crud.Invalid) fail(400, e.message); throw e; }
  }
  fail(404, "Rută necunoscută: " + path);
}
