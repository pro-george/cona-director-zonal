import { useState } from "react";
import { api, post, useLoad, lei, dayShort } from "./api";
import { Page, Card, H, Auto, Btn, Err, Loading, Empty, Md, Icon, I, copy } from "./ui";
import { Sheet } from "./Edit";

const zile = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",") + (n === 1 ? " zi" : " zile");
const TONE: any = { beneficiar: "s-critic", vreme: "s-atentie", furnizor: "s-none", intern: "s-none" };

export function Dosare() {
  const { data, err } = useLoad<any>("/delays");
  return (
    <Page title="Dosare de întârzieri" eyebrow="Zile pierdute, cu dovezi" back="#/mai-mult">
      <p className="small muted">Autopilotul notează fiecare zi pierdută, cu cauza și dovada ei. Când ai nevoie, dosarul pentru prelungire de termen și costuri e deja adunat.</p>
      <Err msg={err} />
      {!data ? <Loading /> : data.sites.length ? <div className="stack grid2">{data.sites.map((s: any) => (
        <a key={s.id} className="siterow" href={"#/dosar/" + s.id}>
          <div className="siterow-top"><strong>{s.name}</strong>{s.urgent > 0 && <span className="pill s-critic">{s.urgent} de notificat</span>}</div>
          <div className="kpis"><div><b>{zile(s.total)}</b><span>pierdute sau afectate</span></div><div><b>{zile(s.claimDays)}</b><span>revendicabile la beneficiar</span></div><div><b>{lei(s.cost)}</b><span>cost estimat</span></div></div>
        </a>))}</div> : <Empty>Niciun proiect încă.</Empty>}
    </Page>
  );
}

export function Dosar({ id }: { id: string }) {
  const { data, err, reload } = useLoad<any>("/delays/" + id);
  const [sheet, setSheet] = useState<any>(null), [doc, setDoc] = useState(""), [msg, setMsg] = useState(""), [notice, setNotice] = useState<string | null>(null);
  if (!data) return <Page title="Dosar de întârzieri" back={"#/santier/" + id}>{err ? <Err msg={err} /> : <Loading />}</Page>;
  const causes = Object.entries(data.causes).map(([k, v]: any) => [k, v.label] as [string, string]);
  const fields = [{ key: "day", label: "Ziua", type: "date" as const }, { key: "cause", label: "Cauza", type: "select" as const, options: causes }, { key: "title", label: "Ce s-a întâmplat" }, { key: "days", label: "Zile pierdute", type: "number" as const, hint: "Poate fi și 0,5 pentru o zi afectată parțial." }, { key: "detail", label: "Dovadă sau notă", type: "textarea" as const },
    { key: "status", label: "Stare", type: "select" as const, options: [["deschis", "Deschisă"], ["notificat", "Notificată beneficiarului"], ["inchis", "Închisă"]] as [string, string][] }];
  const edit = (r?: any) => setSheet({ title: r ? "Întârziere" : "Întârziere nouă", fields, initial: r || { day: new Date().toISOString().slice(0, 10), cause: "beneficiar", days: 1, status: "deschis" },
    onSave: async (v: any) => { await post("/delays/" + id, { ...v, id: r?.id }); await reload(); }, onDelete: r ? async () => { await post(`/delays/${id}/${r.id}`, { delete: true }); await reload(); } : undefined });
  const download = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([doc.replace(/\*\*/g, "")], { type: "text/plain;charset=utf-8" })); a.download = `dosar-intarzieri-${data.site.name.replace(/[^\w]+/g, "-").toLowerCase()}.txt`; a.click(); };
  return (
    <Page title="Dosar de întârzieri" eyebrow={data.site.name} back={"#/santier/" + id} narrow right={<button className="btn ghost sm" onClick={() => edit()}>Adaugă</button>}>
      <Card>
        <div className="kpis"><div><b>{zile(data.total)}</b><span>pierdute sau afectate</span></div><div><b>{zile(data.extensionDays)}</b><span>de cerut ca prelungire</span></div><div><b>{lei(data.cost)}</b><span>costuri de revendicat</span></div></div>
        <ul className="causes">{Object.entries(data.causes).map(([k, v]: any) => <li key={k}><div className="row between"><span className={"pill " + TONE[k]}>{v.label}</span><b>{zile(data.by[k])}</b></div><span className="small muted">{v.claim}</span></li>)}</ul>
        <p className="small muted">Costul este {zile(data.claimDays)} × {lei(data.orgDay)} pe zi (ipoteza din ecranul Valoare).</p>
      </Card>
      <Card>
        <form className="row limit" onSubmit={async (e) => { e.preventDefault(); await post("/delays/" + id, { noticeDays: Number(notice ?? data.noticeDays) }); setNotice(null); setMsg("Termen salvat."); await reload(); }}>
          <label htmlFor="nd" className="small" style={{ flex: 1 }}>Termenul de notificare din contract (zile de la eveniment)</label>
          <input id="nd" type="number" min={0} value={notice ?? data.noticeDays} onChange={(e) => setNotice(e.target.value)} /><button className="btn ghost sm" type="submit">Salvează</button>
        </form>
        <p className="small muted">{data.noticeDays ? "Aplicația te avertizează când mai sunt cel mult 5 zile până la termen." : "Pune 0 dacă nu îl știi. Cu un termen completat, primești avertizări înainte să expire."}</p>
        {msg && <p className="small muted" role="status">{msg}</p>}
      </Card>
      <Btn onClick={async () => setDoc((await api(`/delays/${id}/dossier`)).text)}>Generează dosarul</Btn>
      {doc && <Card><div className="row between"><Auto>dosar generat</Auto><div className="row"><button className="link" onClick={async () => setMsg((await copy(doc.replace(/\*\*/g, ""))) ? "Text copiat." : "Copierea nu a reușit.")}>Copiază</button><button className="link" onClick={download}>Descarcă</button></div></div><Md text={doc} /></Card>}

      <H right={<span className="muted small">{data.rows.length} intrări</span>}>Cronologie</H>
      {data.rows.length ? <ul className="timeline">{data.rows.map((r: any) => (
        <li key={r.id}>
          <div className="row between"><span className="small muted">{dayShort(r.day)} · {zile(r.days)}</span><span className={"pill " + TONE[r.cause]}>{data.causes[r.cause]?.label}</span></div>
          <strong>{r.title}</strong>
          {r.noticeLeft !== null && <span className={"small " + (r.noticeLeft <= 5 ? "t-crit" : "muted")}>{r.noticeLeft < 0 ? `Termenul de notificare a trecut de ${-r.noticeLeft} zile.` : `Mai sunt ${r.noticeLeft} zile până la termenul de notificare.`}</span>}
          {r.evidence.map((e: any, i: number) => <p key={i} className="small evid"><b>{e.type}:</b> {e.text}</p>)}
          <div className="row">
            {r.status === "deschis" && (r.cause === "beneficiar" || r.cause === "vreme") && <button className="link" onClick={async () => { await post(`/delays/${id}/${r.id}`, { status: "notificat" }); await reload(); }}>Marchează notificată</button>}
            {r.status === "notificat" && <span className="pill s-ok">Notificată</span>}
            <button className="link" onClick={() => edit(r)}>Modifică</button>
          </div>
        </li>))}</ul> : <Empty>Nicio întârziere înregistrată pe acest proiect.</Empty>}
      <p className="small muted">Încadrarea unei zile ca revendicabilă depinde de contract. Dosarul adună faptele și dovezile; temeiul îl confirmă juristul firmei.</p>
      {sheet && <Sheet {...sheet} onClose={() => setSheet(null)} />}
    </Page>
  );
}

// Graficul „data reală de predare”: planificat, realizat și prelungirea ritmului actual până la ultimul element.
export function ForecastCard({ f }: { f: any }) {
  if (!f) return null;
  const W = 340, H = 150, P = 6, t = (d: string) => new Date(d + "T12:00:00Z").getTime();
  const start = Math.min(t(f.planned[0]?.[0] || f.today), t(f.actual[0]?.[0] || f.today)), end = Math.max(t(f.deadline), t(f.lastPlanned), f.date ? t(f.date) : 0, t(f.today)) + 2 * 86400000;
  const x = (d: string) => P + ((t(d) - start) / Math.max(1, end - start)) * (W - 2 * P), y = (n: number) => H - P - (n / f.total) * (H - 2 * P);
  const path = (pts: any[]) => pts.map((p: any, i: number) => (i ? "L" : "M") + x(p[0]).toFixed(1) + " " + y(p[1]).toFixed(1)).join(" ");
  const late = f.vsDeadline !== null && f.vsDeadline > 0, d = (s: string) => new Intl.DateTimeFormat("ro-RO", { timeZone: "UTC", day: "numeric", month: "long" }).format(new Date(s + "T12:00:00Z"));
  const per = (p: number) => (p <= 0 ? "niciun element" : p >= 0.75 ? (Math.round(p * 10) / 10 === 1 ? "un element pe zi" : (Math.round(p * 10) / 10).toString().replace(".", ",") + " elemente pe zi") : "un element la " + Math.round(1 / p) + " zile");
  const nz = (n: number) => (Math.abs(n) === 1 ? "o zi" : Math.abs(n) + " zile");
  return (
    <Card className="forecast">
      <div className="row between"><span className="label">Data reală de predare</span><Auto>din ritmul ultimelor 14 zile</Auto></div>
      {f.remaining === 0 ? <p className="headline">Montaj încheiat</p> : f.date ? <>
        <p className="headline">{d(f.date)}</p>
        <p className={late ? "t-crit" : ""}>{late ? `Cu ${nz(f.vsDeadline)} după termenul contractual (${d(f.deadline)}).` : `Cu ${nz(f.vsDeadline)} înainte de termenul contractual (${d(f.deadline)}).`} {f.vsPlan > 0 ? `Graficul actual se termină pe ${d(f.lastPlanned)}, deci ritmul real e în urmă cu ${nz(f.vsPlan)}.` : ""}</p>
      </> : <p className="headline">Încă nu se poate estima</p>}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Elemente montate în timp: planificat, realizat și estimat">
        <line x1={x(f.deadline)} x2={x(f.deadline)} y1={P} y2={H - P} className="c-deadline" />
        <line x1={x(f.today)} x2={x(f.today)} y1={P} y2={H - P} className="c-today" />
        <path d={path(f.planned)} className="c-plan" />
        {f.actual.length > 0 && <path d={path([...f.actual, [f.today, f.mounted]])} className="c-real" />}
        {f.date && f.remaining > 0 && <path d={path([[f.today, f.mounted], [f.date, f.total]])} className="c-proj" />}
        {f.date && f.remaining > 0 && <circle cx={x(f.date)} cy={y(f.total)} r="4" className="c-dot" />}
      </svg>
      <p className="legendline small muted"><span className="k k-plan" />planificat<span className="k k-real" />realizat<span className="k k-proj" />estimat<span className="k k-dead" />termen</p>
      {f.remaining > 0 && <p className="small">Ritm acum: {per(f.pace)} ({f.recent} montate în 14 zile). Ca să prinzi termenul: {per(f.neededPace)} pentru cele {f.remaining} rămase.</p>}
      <p className="small muted">Estimare liniară: presupune că ritmul rămâne același și nu ține cont de dependențe, echipe sau sezon.</p>
    </Card>
  );
}
