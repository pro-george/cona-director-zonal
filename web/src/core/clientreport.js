// Raportul săptămânal către beneficiar: doar ce îl privește pe el. Stadiu, ce s-a executat, ce urmează,
// ce decizii se așteaptă de la el și riscurile de vreme. Fără bani interni, fără probleme cu furnizorii.
import { q, one, run, J, dayOf, addDays } from "./db.js";
import * as bim from "./connectors/bim.js";
import * as wx from "./connectors/weather.js";
import { siteById } from "./data.js";
import { aiText } from "./ai.js";

const roDay = (d) => new Intl.DateTimeFormat("ro-RO", { timeZone: "UTC", day: "numeric", month: "long" }).format(new Date(d + "T12:00:00Z"));

export async function generate(siteId, today = dayOf()) {
  const s = siteById(siteId); if (!s) return null;
  const from = addDays(today, -6), p = bim.physical(s.id, today), f = bim.forecast(s, today);
  const reports = q("SELECT * FROM reports WHERE site_id=? AND day BETWEEN ? AND ? ORDER BY ts", s.id, from, today);
  const done = [...new Set(reports.flatMap((r) => J(r.details, {}).done || []))].slice(0, 12);
  const next = q("SELECT zone, kind, COUNT(*) n, MIN(planned) a, MAX(planned) b FROM bim_elements WHERE site_id=? AND status!='montat' AND planned BETWEEN ? AND ? GROUP BY zone, kind ORDER BY a", s.id, addDays(today, 1), addDays(today, 7));
  const asks = q("SELECT day, title FROM delays WHERE site_id=? AND cause='beneficiar' AND status!='inchis' ORDER BY day", s.id);
  const risks = wx.risksByDay(s.id, today);
  const director = one("SELECT name FROM users WHERE role='director' LIMIT 1")?.name || "Director zonal";
  const facts = { proiect: s.name, perioada: `${roDay(from)} – ${roDay(today)}`, stadiu: `${p.mounted} din ${p.total} elemente montate (${Math.round(p.realPct * 100)}%)`, executat: done, urmeaza: next.map((n) => `${n.zone}: ${n.kind}, ${n.n} elemente, ${roDay(n.a)}–${roDay(n.b)}`), decizii_asteptate: asks.map((a) => `${a.title} (din ${roDay(a.day)})`), meteo: risks.map((r) => `${roDay(r.day)}: ${[...new Set(r.reasons.map((x) => x.replace(/\s*\(limită[^)]*\)/, "")))].join(" și ")}`), predare_estimata: f?.date ? roDay(f.date) : null, semnatura: director };
  const written = await aiText(`Scrie raportul săptămânal către beneficiar pentru proiectul de mai jos. Ton profesional și calm, maximum 220 de cuvinte, fără cifre de cost și fără probleme interne sau cu furnizorii. Titluri cu '## ' și liste cu '- '. Secțiuni: ## Stadiu, ## Executat în această săptămână, ## Urmează, ## Avem nevoie de la dumneavoastră (doar dacă există), ## Vreme. Încheie cu semnătura.\n${JSON.stringify(facts)}`, 700);
  const text = written || [`# Raport săptămânal – ${s.name}`, `Perioada ${facts.perioada}.`, "## Stadiu", `- ${facts.stadiu}.`, "## Executat în această săptămână", ...(done.length ? done.map((d) => "- " + d) : ["- Nu au fost raportate lucrări finalizate în această perioadă."]),
    "## Urmează", ...(facts.urmeaza.length ? facts.urmeaza.map((d) => "- " + d) : ["- Nu sunt lucrări de montaj planificate în următoarele 7 zile."]),
    ...(facts.decizii_asteptate.length ? ["## Avem nevoie de la dumneavoastră", ...facts.decizii_asteptate.map((d) => "- " + d)] : []),
    "## Vreme", ...(facts.meteo.length ? facts.meteo.map((d) => "- " + d + ". Lucrările expuse vor fi reprogramate.") : ["- Prognoza pe 7 zile nu afectează lucrările planificate."]), "", "Cu stimă,", `${director}, Director zonal`].join("\n");
  const ref = `client:${s.id}:${today}`, old = one("SELECT id FROM drafts WHERE ref=?", ref);
  if (old) run("UPDATE drafts SET body=?, ts=?, status='draft' WHERE id=?", text, Date.now(), old.id);
  else run("INSERT INTO drafts(ts,kind,ref,site_id,recipient,title,body,status) VALUES(?,?,?,?,?,?,?,'draft')", Date.now(), "beneficiar", ref, s.id, s.client || "Beneficiar", `Raport săptămânal – ${s.name}`, text);
  return { text, by: written ? "model" : "demo", site: s.name, client: s.client };
}
