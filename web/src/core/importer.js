// Import de proiect din Excel/CSV. Fișierele reale arată diferit de la om la om, așa că importul nu cere un format fix:
// găsește singur rândul de antet, ghicește ce reprezintă fiecare foaie (buget sau grafic) și potrivește coloanele
// după denumire. Omul vede potrivirea, o poate corecta și abia apoi importă.
const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

export const TYPES = {
  buget: { label: "Buget", fields: [
    { key: "category", label: "Categorie / capitol", req: true, keys: ["categor", "capitol", "articol", "denumire", "lucrare", "descriere"] },
    { key: "budget", label: "Buget", req: true, keys: ["buget", "deviz", "planificat", "valoare", "total"] },
    { key: "actual", label: "Cheltuit", keys: ["cheltuit", "realizat", "executat", "consumat", "actual", "facturat"] },
    { key: "committed", label: "Angajat", keys: ["angajat", "comandat", "contractat", "comenzi"] },
  ] },
  grafic: { label: "Grafic de lucrări", fields: [
    { key: "start", label: "Data de început", req: true, keys: ["data inceput", "inceput", "start", "de la", "data start"] },
    { key: "end", label: "Data de sfârșit", keys: ["data sfarsit", "sfarsit", "final", "pana la", "termen", "end", "finish"] },
    { key: "zone", label: "Zonă / etapă", keys: ["zona", "etapa", "faza", "corp", "tronson", "axe", "sector"] },
    { key: "work", label: "Lucrare", req: true, keys: ["lucrare", "activitate", "denumire", "operatie", "descriere", "task"] },
    { key: "qty", label: "Număr de elemente", keys: ["buc", "elemente", "numar", "nr.", "cantitate", "cant"] },
    { key: "done", label: "Realizat (%)", keys: ["realizat", "executat", "stadiu", "progres", "%", "montat"] },
  ] },
};

function mapColumns(type, headers) {
  const used = new Set(), map = {};
  for (const f of TYPES[type].fields) {
    let hit = -1;
    for (const k of f.keys) { hit = headers.findIndex((h, i) => !used.has(i) && norm(h).includes(k)); if (hit >= 0) break; }
    map[f.key] = hit; if (hit >= 0) used.add(hit);
  }
  return map;
}
const complete = (type, map) => TYPES[type].fields.filter((f) => f.req).every((f) => map[f.key] >= 0);
const score = (type, map) => (complete(type, map) ? 10 : 0) + Object.values(map).filter((v) => v >= 0).length;

// sheets: [{ name, rows: any[][] }]
export function analyze(sheets) {
  return sheets.map((sh) => {
    const rows = sh.rows.filter((r) => r && r.some((c) => c !== null && c !== undefined && String(c).trim() !== ""));
    let hi = 0, best = -1;
    rows.slice(0, 15).forEach((r, i) => { const n = r.filter((c) => typeof c === "string" && c.trim()).length; if (n > best) { best = n; hi = i; } });
    const headers = (rows[hi] || []).map((c, i) => (String(c ?? "").trim() || "Coloana " + (i + 1)));
    const body = rows.slice(hi + 1);
    const maps = { buget: mapColumns("buget", headers), grafic: mapColumns("grafic", headers) };
    const sb = score("buget", maps.buget), sg = score("grafic", maps.grafic);
    const type = Math.max(sb, sg) < 10 ? "ignora" : sg >= sb ? "grafic" : "buget";
    return { name: sh.name, headers, body, maps, type };
  }).filter((s) => s.headers.length > 1 && s.body.length);
}

export const num = (v) => {
  if (typeof v === "number") return v;
  let t = String(v ?? "").replace(/[^\d.,-]/g, "");
  if (!t) return 0;
  if (t.includes(",") && t.includes(".")) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (t.includes(",")) t = /,\d{3}(,|$)/.test(t) ? t.replace(/,/g, "") : t.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t); return Number.isFinite(n) ? n : 0;
};
const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
export const date = (v) => {
  if (v instanceof Date && !isNaN(v)) { const d = new Date(v.getTime() + 12 * 3600000); return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
  if (typeof v === "number" && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
  const t = String(v ?? "").trim(); let m;
  if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return iso(m[1], m[2], m[3]);
  if ((m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/))) return iso(m[3], m[2], m[1]);
  return null;
};

// Tipul lucrării decide ce praguri meteo i se aplică.
export const kindOf = (text) => {
  const t = norm(text);
  if (/(beton|radier|fundat|turnare|sapa)/.test(t)) return "fundații și radier";
  if (/(panou|fatad|inchider|sandwich|tamplar)/.test(t)) return "panouri sandwich";
  if (/(acoper|tabla|invelitoare|hidroizol)/.test(t)) return "tablă cutată";
  if (/(stalp|grind|prefabric|montaj struct|structura metal|macara)/.test(t)) return "stâlpi și grinzi";
  if (/(zidar|structur|cofra|armare|placa|planseu)/.test(t)) return "structură și zidării";
  return null;
};

// Transformă foile, cu potrivirea aleasă de om, în rânduri curate + lista a ce a fost sărit.
export function build(sheets) {
  const budget = [], schedule = [], notes = [];
  for (const sh of sheets) {
    if (sh.type === "ignora") continue;
    const m = sh.maps[sh.type], cell = (r, k) => (m[k] >= 0 ? r[m[k]] : undefined);
    let skipped = 0;
    for (const r of sh.body) {
      if (sh.type === "buget") {
        const category = String(cell(r, "category") ?? "").trim(), b = num(cell(r, "budget"));
        if (!category || b <= 0 || /^total/i.test(category)) { skipped++; continue; }
        budget.push({ category, budget: b, actual: Math.max(0, num(cell(r, "actual"))), committed: Math.max(0, num(cell(r, "committed"))) });
      } else {
        const work = String(cell(r, "work") ?? "").trim(), start = date(cell(r, "start"));
        if (!work || !start) { skipped++; continue; }
        let done = num(cell(r, "done")); if (done > 0 && done <= 1) done *= 100;
        const end = date(cell(r, "end")) || start;
        schedule.push({ zone: String(cell(r, "zone") ?? "").trim() || work, work, qty: Math.round(num(cell(r, "qty"))) || 0, start: start <= end ? start : end, end: start <= end ? end : start, done: Math.max(0, Math.min(100, done)) });
      }
    }
    if (skipped) notes.push(`${sh.name}: ${skipped} ${skipped === 1 ? "rând sărit" : "rânduri sărite"} (gol, total sau fără ${sh.type === "buget" ? "sumă" : "dată de început"}).`);
  }
  return { budget, schedule, notes };
}
