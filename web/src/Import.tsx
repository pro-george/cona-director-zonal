import { useState } from "react";
import { post, lei, useLoad } from "./api";
import { Page, Card, H, Auto, Btn, Err, Empty } from "./ui";
// @ts-ignore: modul JavaScript
import { analyze, build, TYPES } from "./core/importer.js";

const loadXlsx = () => import("xlsx");

async function downloadTemplate() {
  const XLSX = await loadXlsx();
  const d = (n: number) => { const t = new Date(); t.setDate(t.getDate() + n); return t; };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Capitol", "Buget (lei)", "Cheltuit (lei)", "Angajat (lei)"],
    ["Structură", 4200000, 1650000, 900000], ["Prefabricate", 3100000, 400000, 1200000], ["Fațade și închideri", 1800000, 0, 350000], ["Instalații", 2400000, 120000, 500000], ["Organizare de șantier", 600000, 210000, 60000],
  ]), "Buget");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Zonă", "Lucrare", "Nr. elemente", "Data început", "Data sfârșit", "Realizat %"],
    ["Fundații", "Turnare fundații și radier", 24, d(-30), d(-8), 100], ["Axe 1–4", "Montaj stâlpi și grinzi prefabricate", 36, d(-5), d(9), 30],
    ["Axe 5–8", "Montaj stâlpi și grinzi prefabricate", 36, d(10), d(24), 0], ["Fațada sud", "Montaj panouri sandwich", 28, d(12), d(26), 0], ["Acoperiș", "Montaj tablă cutată", 20, d(20), d(34), 0],
  ], { cellDates: true }), "Grafic");
  XLSX.writeFile(wb, "model-import-proiect.xlsx");
}

export function ImportProiect() {
  const [sheets, setSheets] = useState<any[] | null>(null), [err, setErr] = useState(""), [done, setDone] = useState<any>(null);
  const [f, setF] = useState({ name: "", location: "", client: "", contract: "" }), [target, setTarget] = useState("");
  const me = useLoad<any>("/me");

  const read = async (file?: File) => {
    if (!file) return; setErr(""); setDone(null);
    try {
      const XLSX = await loadXlsx();
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const found = analyze(wb.SheetNames.map((n: string) => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }) })));
      if (!found.length) { setErr("Nu am găsit nicio foaie cu tabel în acest fișier."); return; }
      setSheets(found); setF((x) => ({ ...x, name: x.name || file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ") }));
    } catch { setErr("Fișierul nu a putut fi citit. Merg fișiere .xlsx, .xls și .csv."); }
  };
  const setType = (i: number, type: string) => setSheets((s) => s!.map((x, j) => (j === i ? { ...x, type } : x)));
  const setCol = (i: number, key: string, col: number) => setSheets((s) => s!.map((x, j) => (j === i ? { ...x, maps: { ...x.maps, [x.type]: { ...x.maps[x.type], [key]: col } } } : x)));

  const out = sheets ? build(sheets) : null;
  const missing = (sheets || []).filter((s) => s.type !== "ignora").flatMap((s) => TYPES[s.type].fields.filter((x: any) => x.req && s.maps[s.type][x.key] < 0).map((x: any) => `${s.name}: alege coloana pentru „${x.label}”`));
  const send = async () => { setErr(""); try { setDone(await post("/projects/import", { ...f, target, contract: Number(String(f.contract).replace(/[^\d]/g, "")) || 0, budget: out!.budget, schedule: out!.schedule })); setSheets(null); } catch (e: any) { setErr(e.message); } };
  const fmt = (v: any) => (v instanceof Date ? v.toLocaleDateString("ro-RO") : v == null ? "" : String(v));

  return (
    <Page title="Importă proiect" eyebrow="Din Excel sau CSV" back="#/santiere" narrow>
      <div className="steps" aria-hidden="true"><i className="on" /><i className={sheets || done ? "on" : ""} /><i className={done ? "on" : ""} /></div>
      <Err msg={err} />

      {done && <Card className="brief">
        <Auto>importat</Auto>
        <p className="headline">{done.name}</p>
        <p>{done.budget} linii de buget, {done.schedule} lucrări și {done.elements} elemente de urmărit. {done.located ? "Autopilotul a luat deja prognoza meteo și a verificat graficul." : "Localitatea nu a fost găsită, deci proiectul nu are meteo."}</p>
        <a className="btn" href={"#/santier/" + done.id} style={{ textAlign: "center" }}>Deschide proiectul</a>
      </Card>}

      {!sheets && <>
        <label className="drop" htmlFor="imp"><strong>Alege fișierul proiectului</strong><span className="small">Bugetul și graficul de lucrări, așa cum le ai deja în Excel. Nu trebuie un format anume.</span>
          <input id="imp" type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => read(e.target.files?.[0])} /></label>
        <p className="small muted">Fișierul este citit doar pe acest dispozitiv; nu pleacă nicăieri.</p>
        <Btn kind="ghost" onClick={downloadTemplate}>Descarcă un model de fișier</Btn>
      </>}

      {sheets && out && <>
        <Card>
          <span className="label">Unde se importă</span>
          <label htmlFor="pt">Proiect<select id="pt" value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Proiect nou</option>{(me.data?.sites || []).map((s: any) => <option key={s.id} value={s.id}>Adaugă în: {s.name}</option>)}</select></label>
          {target ? <p className="small muted">Liniile de buget și lucrările din fișier se adaugă la cele existente; nu se șterge nimic.</p> : <>
          <label htmlFor="pn">Nume<input id="pn" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label htmlFor="pl">Localitate (pentru meteo)<input id="pl" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Ex.: Sibiu" /></label>
          <label htmlFor="pc">Beneficiar<input id="pc" value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })} /></label>
          <label htmlFor="pv">Valoare contract (lei, opțional)<input id="pv" inputMode="numeric" value={f.contract} onChange={(e) => setF({ ...f, contract: e.target.value })} /></label></>}
        </Card>

        {sheets.map((s, i) => (
          <Card key={s.name}>
            <div className="row between"><strong>Foaia „{s.name}”</strong><Auto>potrivit automat</Auto></div>
            <label htmlFor={"ty" + i}>Ce conține<select id={"ty" + i} value={s.type} onChange={(e) => setType(i, e.target.value)}><option value="buget">Buget</option><option value="grafic">Grafic de lucrări</option><option value="ignora">Nu importa această foaie</option></select></label>
            {s.type !== "ignora" && <div>{TYPES[s.type].fields.map((fd: any) => (
              <div className="maprow" key={fd.key}><label htmlFor={`c${i}${fd.key}`}>{fd.label}{fd.req ? " *" : ""}</label>
                <select id={`c${i}${fd.key}`} value={s.maps[s.type][fd.key]} onChange={(e) => setCol(i, fd.key, Number(e.target.value))}><option value={-1}>—</option>{s.headers.map((h: string, c: number) => <option key={c} value={c}>{h}</option>)}</select></div>))}</div>}
            <details><summary>Primele rânduri din fișier</summary><div className="tblwrap"><table><thead><tr>{s.headers.map((h: string, c: number) => <th key={c}>{h}</th>)}</tr></thead><tbody>{s.body.slice(0, 4).map((r: any[], k: number) => <tr key={k}>{s.headers.map((_: any, c: number) => <td key={c}>{fmt(r[c])}</td>)}</tr>)}</tbody></table></div></details>
          </Card>))}

        <Card>
          <span className="label">Ce se importă</span>
          <div className="kpis"><div><b>{out.budget.length}</b><span>linii de buget</span></div><div><b>{out.schedule.length}</b><span>lucrări în grafic</span></div><div><b>{lei(out.budget.reduce((a: number, b: any) => a + b.budget, 0)).replace(" lei", "")}</b><span>buget total, lei</span></div></div>
          {[...missing, ...out.notes].map((n: string, k: number) => <p key={k} className="small muted">{n}</p>)}
          {!out.budget.length && !out.schedule.length && <Empty>Cu potrivirea de acum nu rezultă niciun rând. Verifică tipul foii și coloanele.</Empty>}
          <div className="row two"><Btn kind="ghost" onClick={() => setSheets(null)}>Alt fișier</Btn><Btn disabled={missing.length > 0 || (!out.budget.length && !out.schedule.length)} onClick={send}>Importă proiectul</Btn></div>
        </Card>
      </>}
    </Page>
  );
}
