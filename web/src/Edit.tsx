import { useEffect, useState } from "react";
import { post, useLoad } from "./api";
import { Icon, I, Err } from "./ui";

export type Field = { key: string; label: string; type?: "text" | "number" | "date" | "select" | "textarea"; options?: [string | number, string][]; hint?: string; placeholder?: string };

// Formular într-un panou: de jos pe telefon, în centru pe desktop. Folosit pentru orice adăugare sau modificare.
export function Sheet({ title, fields, initial = {}, onSave, onDelete, onClose, saveLabel = "Salvează", note }: { title: string; fields: Field[]; initial?: any; onSave: (v: any) => Promise<any>; onDelete?: () => Promise<any>; onClose: () => void; saveLabel?: string; note?: string }) {
  const [v, setV] = useState<any>(() => Object.fromEntries(fields.map((f) => [f.key, initial[f.key] ?? ""])));
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false), [sure, setSure] = useState(false);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, []);
  const run = async (fn: () => Promise<any>) => { setBusy(true); setErr(""); try { await fn(); onClose(); } catch (e: any) { setErr(e.message); setBusy(false); } };
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label={title} onSubmit={(e) => { e.preventDefault(); run(() => onSave(v)); }}>
        <div className="sheet-head"><h2>{title}</h2><button type="button" className="iconbtn" onClick={onClose} aria-label="Închide"><Icon d={I.close} size={18} /></button></div>
        {note && <p className="small muted">{note}</p>}
        {fields.map((f) => (
          <label key={f.key} htmlFor={"sf-" + f.key}>{f.label}
            {f.type === "select" ? <select id={"sf-" + f.key} value={v[f.key] ?? ""} onChange={(e) => setV({ ...v, [f.key]: e.target.value })}>{f.options!.map(([val, lab]) => <option key={String(val)} value={val}>{lab}</option>)}</select>
              : f.type === "textarea" ? <textarea id={"sf-" + f.key} rows={3} value={v[f.key] ?? ""} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
              : <input id={"sf-" + f.key} type={f.type || "text"} inputMode={f.type === "number" ? "decimal" : undefined} min={f.type === "number" ? 0 : undefined} step={f.type === "number" ? "any" : undefined} placeholder={f.placeholder} value={v[f.key] ?? ""} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />}
            {f.hint && <span className="small muted hint">{f.hint}</span>}
          </label>))}
        <Err msg={err} />
        <button className="btn" type="submit" disabled={busy}>{busy ? "Se salvează…" : saveLabel}</button>
        {onDelete && (sure ? <button type="button" className="btn danger" disabled={busy} onClick={() => run(onDelete)}>Sigur? Șterge definitiv</button> : <button type="button" className="link danger" onClick={() => setSure(true)}>Șterge</button>)}
      </form>
    </div>
  );
}

export const F = {
  project: (team: any[]): Field[] => [
    { key: "name", label: "Numele proiectului" }, { key: "location", label: "Localitate", hint: "Folosită pentru prognoza meteo." }, { key: "client", label: "Beneficiar" },
    { key: "contract", label: "Valoare contract (lei)", type: "number" }, { key: "start", label: "Început", type: "date" }, { key: "finish", label: "Termen de predare", type: "date" },
    { key: "manager_id", label: "Șef de șantier", type: "select", options: [["", "Neales"], ...team.map((u: any) => [u.id, u.name] as [number, string])] },
  ],
  budget: [{ key: "category", label: "Categorie / capitol" }, { key: "budget", label: "Buget (lei)", type: "number" }, { key: "actual", label: "Cheltuit (lei)", type: "number" }, { key: "committed", label: "Angajat (lei)", type: "number" }] as Field[],
  receivable: [{ key: "title", label: "Denumire", placeholder: "Situație de lucrări nr. …" }, { key: "no", label: "Număr" }, { key: "amount", label: "Sumă (lei)", type: "number" }, { key: "issued", label: "Emisă la", type: "date" }, { key: "due", label: "Scadentă la", type: "date" }, { key: "paid_at", label: "Încasată la", type: "date", hint: "Lasă gol dacă nu a fost încasată." }] as Field[],
  zoneNew: [{ key: "zone", label: "Zonă / etapă" }, { key: "work", label: "Lucrare", placeholder: "Ex.: Montaj panouri sandwich", hint: "Tipul lucrării decide pragurile meteo." }, { key: "count", label: "Număr de elemente", type: "number" }, { key: "start", label: "Început", type: "date" }, { key: "end", label: "Sfârșit", type: "date" }, { key: "mounted", label: "Deja montate", type: "number" }] as Field[],
  zoneEdit: (total: number): Field[] => [{ key: "zone", label: "Zonă / etapă" }, { key: "mounted", label: `Elemente montate (din ${total})`, type: "number" }, { key: "start", label: "Restul începe la", type: "date" }, { key: "end", label: "Restul se termină la", type: "date" }],
  delivery: (zones: string[]): Field[] => [{ key: "kind", label: "Ce se livrează" }, { key: "zone", label: "Pentru zona", type: "select", options: [["", "Nicio zonă anume"], ...zones.map((z) => [z, z] as [string, string])] }, { key: "count", label: "Bucăți", type: "number" }, { key: "planned", label: "Planificată la", type: "date" }, { key: "eta", label: "Estimată la", type: "date", hint: "Dacă e după data planificată, livrarea apare ca întârziată." }, { key: "status", label: "Stare", type: "select", options: [["planificat", "Planificată"], ["in_drum", "În drum"], ["livrat", "Livrată"], ["intarziat", "Întârziată"]] }, { key: "note", label: "Notă" }],
  equipment: [{ key: "name", label: "Utilaj" }, { key: "daily_cost", label: "Chirie zilnică (lei)", type: "number" }, { key: "status", label: "Stare", type: "select", options: [["activ", "Lucrează"], ["in_asteptare", "În așteptare"]] }] as Field[],
  task: (people: string[], sites: any[]): Field[] => [{ key: "title", label: "Sarcină" }, { key: "owner", label: "Responsabil", type: "select", options: people.map((n) => [n, n] as [string, string]) }, { key: "due", label: "Termen", type: "date" }, { key: "site_id", label: "Proiect", type: "select", options: [["", "Fără proiect"], ...sites.map((s: any) => [s.id, s.name] as [string, string])] }],
  approval: (sites: any[]): Field[] => [{ key: "site_id", label: "Proiect", type: "select", options: sites.map((s: any) => [s.id, s.name] as [string, string]) }, { key: "type", label: "Tip", type: "select", options: [["comanda", "Comandă"], ["situatie_sub", "Situație subcontractor"], ["pontaj", "Pontaj"], ["decont", "Decont"]] }, { key: "title", label: "Ce se cere" }, { key: "supplier", label: "Furnizor" }, { key: "amount", label: "Sumă (lei)", type: "number" }, { key: "category", label: "Categoria de buget", hint: "Scrisă la fel ca în buget, ca cererea să fie verificată față de el." }],
};

// Meniul „Adaugă”, disponibil de oriunde.
export function AddMenu({ me, onClose, onChanged }: { me: any; onClose: () => void; onChanged: (go?: string) => void }) {
  const team = useLoad<any>("/team");
  const [form, setForm] = useState<string>("");
  const users = team.data?.users || [], sites = team.data?.sites || me.sites;
  const go = (h: string) => { onClose(); location.hash = h; };
  if (form === "project") return <Sheet title="Proiect nou" fields={F.project(users.filter((u: any) => u.role === "sef"))} saveLabel="Creează proiectul" onClose={onClose} note="După creare adaugi bugetul și zonele din fișa proiectului, sau le imporți din Excel."
    onSave={async (v) => { const r = await post("/projects", v); onChanged("#/santier/" + r.id); }} />;
  if (form === "task") return <Sheet title="Sarcină nouă" fields={F.task(users.map((u: any) => u.name), sites)} initial={{ owner: me.user.name }} saveLabel="Adaugă sarcina" onClose={onClose} onSave={async (v) => { await post("/rows/task", v); onChanged("#/sarcini"); }} />;
  if (form === "approval") return <Sheet title="Cerere de aprobare" fields={F.approval(sites)} initial={{ site_id: sites[0]?.id, type: "comanda" }} saveLabel="Trimite cererea" onClose={onClose} onSave={async (v) => { await post(`/sites/${v.site_id}/approvals`, v); onChanged("#/aprobari"); }} />;
  const Row = ({ t, d, on }: any) => <button type="button" className="navrow" onClick={on}><div><strong>{t}</strong><span className="small muted">{d}</span></div><Icon d={I.chev} size={18} /></button>;
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Adaugă">
        <div className="sheet-head"><h2>Adaugă</h2><button type="button" className="iconbtn" onClick={onClose} aria-label="Închide"><Icon d={I.close} size={18} /></button></div>
        <Row t="Proiect nou" d="Completezi datele de bază, apoi bugetul și zonele" on={() => setForm("project")} />
        <Row t="Proiect din Excel" d="Imporți bugetul și graficul dintr-un fișier" on={() => go("#/import")} />
        <Row t="Raport de șantier" d="Dictezi ce s-a întâmplat azi" on={() => go("#/raport")} />
        <Row t="Sarcină" d="Cu responsabil și termen" on={() => setForm("task")} />
        <Row t="Cerere de aprobare" d="Comandă, situație de subcontractor, pontaj sau decont" on={() => setForm("approval")} />
        <Row t="Ședință" d="Dictezi discuția, primești minuta și sarcinile" on={() => go("#/sedinte")} />
        <Row t="Om în echipă" d="Șef de șantier nou" on={() => go("#/echipa")} />
      </div>
    </div>
  );
}

export function Echipa() {
  const { data, err, reload } = useLoad<any>("/team");
  const [sheet, setSheet] = useState(false), [msg, setMsg] = useState(""), [edit, setEdit] = useState<any>(null);
  return (
    <div className="page narrow">
      <header className="bar"><a className="iconbtn" href="#/mai-mult" aria-label="Înapoi"><Icon d={I.back} /></a><div className="bar-t"><span className="eyebrow">Cine folosește aplicația</span><h1>Echipă</h1></div><button className="btn sm" onClick={() => setSheet(true)}>Adaugă</button></header>
      <div className="content">
        <Err msg={err || msg} />
        <ul className="plain">{(data?.users || []).map((u: any) => (
          <li key={u.id} className="tap" onClick={() => setEdit(u)}><div className="row between"><strong>{u.name}</strong>{u.role !== "director" && <button className="link danger" onClick={async (e) => { e.stopPropagation(); try { await post(`/team/${u.id}/delete`); reload(); } catch (e: any) { setMsg(e.message); } }}>Scoate</button>}</div>
            <span className="small muted">{u.role === "director" ? "Director zonal" : "Șef de șantier" + (u.site ? " · " + u.site : " · fără proiect")}</span></li>))}</ul>
        <p className="small muted">Atinge un nume ca să-l schimbi sau să muți omul pe alt proiect.</p>
      </div>
      {edit && <Sheet title={edit.role === "director" ? "Numele tău" : "Om din echipă"} fields={[{ key: "name", label: "Nume și prenume" }, ...(edit.role === "director" ? [] : [{ key: "site_id", label: "Proiect", type: "select" as const, options: [["", "Fără proiect"], ...(data?.sites || []).map((s: any) => [s.id, s.name])] as [string, string][] }])]} initial={{ ...edit, site_id: edit.site_id || "" }} onClose={() => setEdit(null)} onSave={async (v) => { await post("/team/" + edit.id, v); reload(); }} />}
      {sheet && <Sheet title="Om nou în echipă" fields={[{ key: "name", label: "Nume și prenume" }, { key: "site_id", label: "Proiect", type: "select", options: [["", "Fără proiect deocamdată"], ...(data?.sites || []).map((s: any) => [s.id, s.name] as [string, string])] }]} saveLabel="Adaugă" onClose={() => setSheet(false)} onSave={async (v) => { await post("/team", v); reload(); }} />}
    </div>
  );
}
