// Stratul AI. Cu o cheie Anthropic pusă în aplicație, textele sunt scrise de model.
// Fără cheie, fiecare funcție are o variantă pe reguli ("mod demo"), ca aplicația să meargă complet.
import { roDay, lei } from "./db.js";

// Fără server nu există un loc sigur pentru o cheie comună. Cine vrea texte scrise de model își pune
// propria cheie Anthropic în aplicație; ea rămâne doar în browserul acelui dispozitiv.
const LS_KEY = "dz.ai_key", LS_MODEL = "dz.ai_model";
const ls = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
export const getKey = () => ls(LS_KEY);
export const setKey = (v) => { try { v ? localStorage.setItem(LS_KEY, v) : localStorage.removeItem(LS_KEY); } catch { /* ignorat */ } };
export const aiMode = () => (getKey() ? "model" : "demo");
let lastError = "";
export const aiLastError = () => lastError;

const SYSTEM = "Ești asistentul unui director zonal la un antreprenor general de construcții din România. Scrii în română, scurt și concret. Folosești doar datele primite; nu inventezi cifre, termene sau nume.";

async function llm(prompt, { images = [], max = 1200 } = {}) {
  const key = getKey();
  if (!key) return null;
  try {
    const content = [...images.map((i) => ({ type: "image", source: { type: "base64", media_type: i.type, data: i.data } })), { type: "text", text: prompt }];
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: AbortSignal.timeout(60000),
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({ model: ls(LS_MODEL) || "claude-sonnet-5-5", max_tokens: max, system: SYSTEM, messages: [{ role: "user", content }] }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "HTTP " + r.status);
    lastError = "";
    return j.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  } catch (e) {
    lastError = String(e.message || e);
    console.error("[ai] cererea a eșuat, folosesc varianta pe reguli:", lastError);
    return null;
  }
}
async function llmJSON(prompt, opts) {
  const t = await llm(prompt + "\n\nRăspunde DOAR cu obiectul JSON.", opts);
  if (!t) return null;
  try { const a = t.indexOf("{"), b = t.lastIndexOf("}"); return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}
const strs = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : []);
const sentences = (raw) => raw.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);

/* ---------- raport de șantier ---------- */
export async function structureReport(site, raw, images = []) {
  const j = await llmJSON(
    `Raportul zilnic liber (dictat sau scris) al șefului de șantier${images.length ? ", plus poze" : ""}.\nȘantier: ${site.name} (${site.location})\nRaport:\n"""\n${raw || "(doar poze)"}\n"""\n` +
    `Extrage în JSON: {"status":"ok|atentie|critic","summary":"o frază, max 25 de cuvinte","workers":număr sau null,"equipment":[],"done":[],"blockers":[],"needs":[],"photoNotes":[]}\n` +
    `critic = lucrarea e oprită sau termenul e în pericol; atentie = problemă de urmărit; ok = în grafic.`, { images, max: 700 });
  if (j) return { status: ["ok", "atentie", "critic"].includes(j.status) ? j.status : "atentie", summary: String(j.summary || raw.slice(0, 160)), workers: typeof j.workers === "number" ? j.workers : null,
    details: { equipment: strs(j.equipment), done: strs(j.done), blockers: strs(j.blockers), needs: strs(j.needs), photoNotes: strs(j.photoNotes) }, by: "model" };
  // varianta pe reguli
  const s = sentences(raw);
  const isBlock = (x) => /(nu a[u]? (venit|sosit|ajuns)|stăm|stă |oprit|blocat|lips|întârzi|fără dispozi|nu avem)/i.test(x);
  const isNeed = (x) => /(am nevoie|avem nevoie|necesar|trebuie să|vrea ședință|solicit)/i.test(x);
  const blockers = s.filter(isBlock), needs = s.filter((x) => isNeed(x) && !isBlock(x));
  const done = s.filter((x) => /(am (turnat|montat|terminat|armat|cofrat|executat|mutat)|montaj|turnare|zidări|cofr[ăa]m)/i.test(x) && !isBlock(x));
  const w = raw.match(/(\d{1,3})\s*(de\s+)?oameni/i) || raw.match(/suntem\s+(\d{1,3})/i);
  const critic = /(stăm|oprit|pierdem|degeaba|nu au venit|nu a venit)/i.test(raw);
  return { status: critic ? "critic" : blockers.length ? "atentie" : "ok", summary: (blockers[0] || done[0] || s[0] || "Raport fără text.").slice(0, 180), workers: w ? Number(w[1]) : null,
    details: { equipment: s.filter((x) => /(macara|pomp[ăa]|excavator|nacel)/i.test(x)), done, blockers, needs, photoNotes: [] }, by: "demo" };
}

/* ---------- briefing de dimineață ---------- */
export async function makeBrief(ctx) {
  const j = await llmJSON(
    `Scrie briefingul de dimineață pentru ${roDay(ctx.zi)}, din datele de mai jos (rapoarte de șantier, ERP, BIM, prognoză meteo suprapusă peste lucrările planificate).\n${JSON.stringify(ctx)}\n\n` +
    `JSON: {"headline":"cel mai important lucru al zilei, max 14 cuvinte","summary":"2-3 fraze despre starea zonei","sites":[{"id":"...","line":"o frază"}],"decisions":["acțiune pe care trebuie să o ia directorul azi, cu șantierul numit"],"risks":["risc de termen, cost sau încasare"]}`, { max: 1100 });
  if (j && j.headline) return { headline: String(j.headline), summary: String(j.summary || ""), sites: Array.isArray(j.sites) ? j.sites.filter((x) => x && x.id).map((x) => ({ id: x.id, line: String(x.line || "") })) : [], decisions: strs(j.decisions), risks: strs(j.risks), by: "model" };
  const crit = ctx.santiere.filter((s) => s.raport?.status === "critic"), warn = ctx.santiere.filter((s) => s.raport?.status === "atentie"), ok = ctx.santiere.filter((s) => s.raport?.status === "ok");
  const decisions = [];
  for (const s of ctx.santiere) {
    for (const b of s.raport?.blockers || []) decisions.push(`${s.nume}: ${b}`);
    for (const n of s.raport?.needs || []) decisions.push(`${s.nume}: ${n}`);
  }
  if (ctx.aprobari_in_asteptare.length) decisions.push(`Ai ${ctx.aprobari_in_asteptare.length} aprobări în așteptare, în valoare de ${lei(ctx.aprobari_in_asteptare.reduce((a, x) => a + x.suma, 0))}.`);
  const rp = ctx.replanificari_propuse || [];
  if (rp.length) decisions.unshift(`Aprobă sau respinge ${rp.length === 1 ? "graficul nou propus" : rp.length + " grafice noi propuse"} de Autopilot (${rp.map((r) => r.santier).join(", ")}).`);
  const risks = ctx.alerte.filter((a) => /^\[(Meteo|ERP|BIM|ERP × BIM)\]/.test(a)).map((a) => a.replace(/^\[[^\]]+\]\s*/, "")).slice(0, 7);
  return {
    headline: crit[0] ? `Blocaj la ${crit[0].nume}${crit.length > 1 ? ` și încă ${crit.length - 1}` : ""}` : warn[0] ? `De urmărit: ${warn[0].nume}` : "Toate șantierele sunt în grafic",
    summary: `${crit[0] ? crit[0].raport.rezumat + " " : ""}În zonă: ${crit.length} cu blocaj, ${warn.length} de urmărit, ${ok.length} în grafic. ${ctx.santiere.filter((s) => !s.raport).length} fără raport recent.`,
    sites: ctx.santiere.filter((s) => s.raport).map((s) => ({ id: s.id, line: s.raport.rezumat })), decisions: decisions.slice(0, 6), risks, by: "demo" };
}

/* ---------- raport către conducere ---------- */
export async function mgmtReport(ctx, reports, from, to) {
  const t = await llm(
    `Scrie raportul săptămânal al directorului zonal către conducere, perioada ${from} – ${to}. Ton profesional, direct, fără introduceri. Maximum 380 de cuvinte.\n` +
    `Starea curentă (rapoarte, ERP, BIM):\n${JSON.stringify(ctx)}\n\nRapoartele zilnice din perioadă:\n${JSON.stringify(reports)}\n\n` +
    `Format: titluri cu '## ' și liste cu '- '. Secțiuni: ## Sinteză, câte o secțiune ## pe șantier (stadiu fizic, bani, probleme), ## Riscuri și blocaje, ## Ce am nevoie de la conducere.`, { max: 1400 });
  if (t) return { text: t, by: "model" };
  const L = ["## Sinteză", `Perioada ${from} – ${to}: ${ctx.santiere.length} șantiere active, ${reports.length} rapoarte zilnice primite.`];
  for (const s of ctx.santiere) {
    L.push(`## ${s.nume}`, `- Stadiu fizic: montat ${s.stadiu_fizic.montat_pct}% față de ${s.stadiu_fizic.plan_pct}% planificat.`, `- Bani: cheltuit ${lei(s.bani.cheltuit)} din ${lei(s.bani.buget)}, angajat ${lei(s.bani.angajat)}.`);
    if (s.raport) L.push(`- Ultimul raport (${s.raport.zi}): ${s.raport.rezumat}`);
    for (const b of s.raport?.blockers || []) L.push(`- Blocaj: ${b}`);
  }
  L.push("## Riscuri și blocaje", ...(ctx.alerte.length ? ctx.alerte.map((a) => "- " + a) : ["- Niciun risc semnalat de sisteme."]));
  L.push("## Ce am nevoie de la conducere", ...ctx.santiere.flatMap((s) => (s.raport?.needs || []).map((n) => `- ${s.nume}: ${n}`)));
  return { text: L.join("\n"), by: "demo" };
}

/* ---------- minută de ședință ---------- */
export async function minutes(raw, siteName, today) {
  const j = await llmJSON(
    `Notițe sau transcriere dintr-o ședință${siteName ? " pentru șantierul " + siteName : ""}. Azi este ${today}.\n"""\n${raw}\n"""\n` +
    `JSON: {"summary":"2-3 fraze","decisions":["decizie luată"],"tasks":[{"title":"ce e de făcut","owner":"cine, cum apare în text","due":"AAAA-LL-ZZ sau null"}]}`, { max: 900 });
  if (j) return { summary: String(j.summary || ""), decisions: strs(j.decisions), tasks: (Array.isArray(j.tasks) ? j.tasks : []).filter((t) => t && t.title).map((t) => ({ title: String(t.title), owner: String(t.owner || "Nealocat"), due: /^\d{4}-\d{2}-\d{2}$/.test(t.due) ? t.due : null })), by: "model" };
  const s = sentences(raw);
  const tasks = s.filter((x) => /(trebuie|până (la|vineri|luni|marți|miercuri|joi)|va trimite|se ocupă|rămâne să|termen)/i.test(x)).map((x) => ({ title: x.slice(0, 140), owner: (x.match(/^([A-ZĂÂÎȘȚ][a-zăâîșț]+)/) || [])[1] || "Nealocat", due: null }));
  return { summary: s.slice(0, 2).join(" "), decisions: s.filter((x) => /(am stabilit|s-a decis|am convenit|rămâne|aprobat)/i.test(x)), tasks, by: "demo" };
}

/* ---------- scrisori și mesaje pregătite ---------- */
export async function draftLetter(kind, f) {
  const briefs = {
    dispozitie: `Adresă către beneficiarul ${f.client} pentru șantierul ${f.site}: solicităm dispoziție de șantier scrisă pentru modificarea cerută ("${f.fact}"), menționăm că lucrul în zona afectată este oprit și că impactul de termen și cost se comunică după primirea dispoziției.`,
    livrare: `Mesaj intern către fabrica de prefabricate pentru șantierul ${f.site}: livrarea de ${f.fact} era planificată pe ${f.planned} și e estimată pe ${f.eta}. Cerem devansare sau grafic ferm și semnalăm costul macaralei în așteptare.`,
    incasare: `Notificare de plată către ${f.client} pentru ${f.fact}, în valoare de ${f.amount}, scadentă la ${f.due}, restantă de ${f.days} zile. Ton ferm și politicos.`,
  };
  const t = await llm(`Redactează textul următor, gata de trimis, fără antet și fără câmpuri de completat, maximum 130 de cuvinte. Semnătura: ${f.signer}, Director zonal.\n${briefs[kind]}`, { max: 500 });
  if (t) return t;
  const T = {
    dispozitie: `Stimate partener,\n\nPe șantierul ${f.site} ni s-a solicitat verbal următoarea modificare: ${f.fact}\n\nPentru a putea continua, vă rugăm să emiteți dispoziția de șantier scrisă. Până la primirea ei, lucrul în zona afectată este oprit. Impactul asupra termenului și costului îl vom comunica după primirea dispoziției.\n\nCu stimă,\n${f.signer}\nDirector zonal`,
    livrare: `Bună ziua,\n\nPentru șantierul ${f.site}, livrarea de ${f.fact} era planificată pe ${f.planned} și este estimată acum pe ${f.eta}. Montajul este oprit, iar macaraua stă în așteptare.\n\nVă rog să confirmați azi dacă livrarea poate fi devansată sau să transmiteți un grafic ferm.\n\nMulțumesc,\n${f.signer}`,
    incasare: `Stimate partener,\n\nVă reamintim că ${f.fact}, în valoare de ${f.amount}, cu scadența la ${f.due}, figurează neachitată de ${f.days} zile.\n\nVă rugăm să ne comunicați data plății.\n\nCu stimă,\n${f.signer}\nDirector zonal`,
  };
  return T[kind];
}

/* ---------- întrebări libere ---------- */
export async function answer(question, ctx) {
  const t = await llm(`Date curente ale zonei (rapoarte, ERP, BIM):\n${JSON.stringify(ctx)}\n\nÎntrebarea directorului: ${question}\nRăspunde în maximum 120 de cuvinte. Dacă datele nu conțin răspunsul, spune asta.`, { max: 500 });
  if (t) return { text: t, by: "model" };
  const ql = question.toLowerCase();
  const hit = ctx.santiere.find((s) => ql.includes(s.nume.toLowerCase().split(" ")[0]) || ql.includes(s.localitate.toLowerCase()));
  if (hit) return { by: "demo", text: `${hit.nume}: ${hit.raport ? hit.raport.rezumat : "fără raport recent"}. Stadiu fizic ${hit.stadiu_fizic.montat_pct}% (plan ${hit.stadiu_fizic.plan_pct}%). Cheltuit ${lei(hit.bani.cheltuit)} din ${lei(hit.bani.buget)}.` };
  return { by: "demo", text: ctx.alerte.length ? "Cele mai importante semnale acum:\n" + ctx.alerte.slice(0, 5).map((a) => "- " + a).join("\n") : "Nu există alerte active în zonă." };
}
