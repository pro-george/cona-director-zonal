import { useEffect, useState } from "react";
import { post, useLoad, lei, mil, dayShort } from "./api";
import { Page, Card, H, Pill, Src, Auto, Btn, Err, Loading, Empty, Md, copy } from "./ui";
import { Sheet } from "./Edit";

export function Resurse() {
  const { data, err, reload } = useLoad<any>("/resources");
  const [sheet, setSheet] = useState<any>(null), [msg, setMsg] = useState("");
  if (!data) return <Page title="Resurse" back="#/mai-mult">{err ? <Err msg={err} /> : <Loading />}</Page>;
  const idle = data.equipment.filter((e: any) => e.idleDays), siteOpts = data.sites.map((s: any) => [s.id, s.name] as [string, string]);
  const act = async (path: string, body: any = {}) => { try { await post(path, body); setMsg(""); await reload(); } catch (e: any) { setMsg(e.message); } };
  const subForm = (b?: any) => setSheet({ title: b ? "Subcontractor" : "Subcontractor nou", fields: [{ key: "name", label: "Firmă" }, { key: "trade", label: "Ce lucrează", placeholder: "Ex.: Instalații electrice", hint: "După acest cuvânt îl recunoaște aplicația în rapoartele de șantier." }, { key: "site_id", label: "Proiect", type: "select", options: siteOpts }, { key: "promised", label: "Efectiv promis (oameni)", type: "number" }],
    initial: b || { site_id: siteOpts[0]?.[0] }, onSave: async (v: any) => { await post("/subs", { ...v, id: b?.id }); await reload(); }, onDelete: b ? async () => { await post(`/subs/${b.id}/delete`); await reload(); } : undefined });
  const logForm = (b: any) => setSheet({ title: "Prezență: " + b.name, fields: [{ key: "day", label: "Ziua", type: "date" }, { key: "present", label: "Câți au venit", type: "number" }, { key: "promised", label: "Câți erau promiși", type: "number" }, { key: "note", label: "Notă" }],
    initial: { day: new Date().toISOString().slice(0, 10), promised: b.promised }, saveLabel: "Notează", onSave: async (v: any) => { await post(`/subs/${b.id}/log`, v); await reload(); } });
  return (
    <Page title="Resurse" eyebrow="Utilaje, oameni, subcontractori" back="#/mai-mult">
      <Err msg={msg} />
      <H right={<span className="muted small">{idle.length ? lei(idle.reduce((a: number, e: any) => a + e.daily_cost, 0)) + " pe zi stau" : "toate lucrează"}</span>}>Utilaje închiriate</H>
      {data.equipment.length ? <div className="stack grid2">{data.equipment.map((e: any) => (
        <Card key={e.id} className={e.idleDays ? "over" : ""}>
          <div className="row between"><strong className="big">{e.name}</strong><span className={"pill " + (e.idleDays ? "s-critic" : "s-ok")}>{e.idleDays ? `Stă de ${e.idleDays} ${e.idleDays === 1 ? "zi" : "zile"}` : "Lucrează"}</span></div>
          <span className="small muted">{e.site || "Fără proiect"} · {lei(e.daily_cost)} pe zi{e.idleDays ? ` · ${lei(e.idleCost)} pierduți până acum` : ""}</span>
          {e.advice && <div className="rec"><div className="row between"><strong>Propunere</strong><Auto>Autopilot</Auto></div><p>{e.advice.text}</p></div>}
          {e.idleDays > 0 && <div className="row two">
            <Btn kind="ghost" onClick={() => act(`/equipment/${e.id}/release`)}>Eliberează-l</Btn>
            {e.advice?.moveTo ? <Btn onClick={() => act(`/equipment/${e.id}/move`, { site_id: e.advice.moveTo })}>Mută la {e.advice.moveName.split(" ").slice(0, 2).join(" ")}</Btn> : <Btn onClick={() => setSheet({ title: "Mută " + e.name, fields: [{ key: "site_id", label: "Pe ce proiect", type: "select", options: siteOpts }], initial: { site_id: siteOpts[0]?.[0] }, saveLabel: "Mută", onSave: async (v: any) => { await post(`/equipment/${e.id}/move`, v); await reload(); } })}>Mută pe alt proiect</Btn>}
          </div>}
        </Card>))}</div> : <Empty>Niciun utilaj trecut. Se adaugă din fișa proiectului.</Empty>}

      <H right={<span className="muted small">din rapoartele zilnice</span>}>Oameni pe șantiere</H>
      <ul className="plain">{data.people.map((p: any) => (
        <li key={p.id}><div className="row between"><strong>{p.name}</strong><b>{p.now ?? "–"}{p.now != null ? " oameni" : ""}</b></div>
          <span className="small muted">{p.now == null ? "Niciun raport recent cu număr de oameni" : `Media pe 7 zile: ${p.avg}`}{p.lag ? ` · ${p.lag} elemente în urmă` : ""}</span>
          {p.stopped && <span className="small t-crit">Lucrul e oprit: {p.now} oameni × {lei(data.laborDay)} = {lei(p.idleCost)} pe zi fără producție. Merită mutați pe un proiect rămas în urmă.</span>}</li>))}</ul>

      <H right={<button className="link" onClick={() => subForm()}>Adaugă</button>}>Subcontractori</H>
      {data.subs.length ? <div className="stack grid2">{data.subs.map((b: any) => (
        <Card key={b.id}>
          <div className="row between"><strong className="big">{b.name}</strong><span className={"pill s-" + (b.grade === "none" ? "none" : b.grade)}>{b.score === null ? "Fără date" : b.score + "% prezență"}</span></div>
          <span className="small muted">{b.trade} · {b.site} · promis {b.promised} oameni</span>
          {b.days > 0 && <><div className="att" aria-hidden="true">{[...b.log].reverse().map((l: any) => <i key={l.id} title={`${l.day}: ${l.present}/${l.promised}`} className={l.present >= l.promised ? "a-ok" : l.present >= l.promised * 0.7 ? "a-warn" : "a-crit"} style={{ height: Math.max(6, (l.present / Math.max(1, l.promised)) * 32) + "px" }} />)}</div>
            <span className="small muted">{b.short} din {b.days} zile sub efectivul promis. Ultima: {b.last.present} din {b.last.promised}, {dayShort(b.last.day)}.</span>
            {b.last.note && <p className="small evid">{b.last.note}</p>}</>}
          <div className="row"><button className="link" onClick={() => logForm(b)}>Notează prezența</button><button className="link" onClick={() => subForm(b)}>Modifică</button></div>
        </Card>))}</div> : <Empty>Niciun subcontractor trecut. Adaugă-i ca prezența să fie urmărită din rapoarte.</Empty>}
      <p className="small muted">Prezența se completează singură când raportul de șantier spune, de exemplu, „electricienii au venit cu 3 oameni în loc de 8”.</p>
      {sheet && <Sheet {...sheet} onClose={() => setSheet(null)} />}
    </Page>
  );
}

export function Cash() {
  const { data, err } = useLoad<any>("/cash");
  const [open, setOpen] = useState<number | null>(null);
  if (!data) return <Page title="Cash" back="#/mai-mult">{err ? <Err msg={err} /> : <Loading />}</Page>;
  const W = 340, HT = 150, P = 8, max = Math.max(1, ...data.weeks.flatMap((w: any) => [w.inflow, w.outflow])), cmin = Math.min(0, ...data.weeks.map((w: any) => w.cum)), cmax = Math.max(1, ...data.weeks.map((w: any) => w.cum));
  const bw = (W - 2 * P) / data.weeks.length, bh = (v: number) => (v / max) * (HT - 2 * P) * 0.9, cy = (v: number) => HT - P - ((v - cmin) / Math.max(1, cmax - cmin)) * (HT - 2 * P);
  return (
    <Page title="Prognoză de cash" eyebrow="Următoarele 8 săptămâni" back="#/mai-mult" narrow>
      <div className="apstats"><div><b>{mil(data.inflow)}</b><span>de încasat</span></div><div><b>{mil(data.outflow)}</b><span>de plătit</span></div><div><b className={data.end < 0 ? "t-crit" : ""}>{mil(data.end)}</b><span>sold la final</span></div></div>
      {data.low && data.low.cum < 0 && <p className="err">Cea mai strânsă săptămână începe pe {dayShort(data.low.from)}: sold cumulat {mil(data.low.cum)}.</p>}
      <Card className="forecast">
        <div className="row between"><span className="label">Intrări și ieșiri pe săptămână</span><Src>ERP simulat</Src></div>
        <svg viewBox={`0 0 ${W} ${HT}`} role="img" aria-label="Intrări, ieșiri și sold cumulat pe 8 săptămâni">
          {data.weeks.map((w: any) => <g key={w.i}><rect x={P + w.i * bw + 3} y={HT - P - bh(w.inflow)} width={bw / 2 - 5} height={bh(w.inflow)} className="b-in" /><rect x={P + w.i * bw + bw / 2} y={HT - P - bh(w.outflow)} width={bw / 2 - 5} height={bh(w.outflow)} className="b-out" /></g>)}
          <path d={data.weeks.map((w: any, i: number) => (i ? "L" : "M") + (P + w.i * bw + bw / 2).toFixed(1) + " " + cy(w.cum).toFixed(1)).join(" ")} className="c-real" />
        </svg>
        <p className="legendline small muted"><span className="k k-in" />intrări<span className="k k-out" />ieșiri<span className="k k-real" />sold cumulat</p>
      </Card>
      <H>Pe săptămâni</H>
      <ul className="plain">{data.weeks.map((w: any) => (
        <li key={w.i} className="tap" onClick={() => setOpen(open === w.i ? null : w.i)}>
          <div className="row between"><strong>{dayShort(w.from)} – {dayShort(w.to)}</strong><b className={w.net < 0 ? "t-crit" : ""}>{w.net >= 0 ? "+" : ""}{mil(w.net)}</b></div>
          <span className="small muted">intră {mil(w.inflow)} · ies {mil(w.outflow)} · sold cumulat {mil(w.cum)}</span>
          {open === w.i && <ul className="sub">{w.items.slice(0, 8).map((i: any, k: number) => <li key={k} className="small">{i.kind === "inflow" ? "+" : "−"}{lei(i.amount)} · {i.site}: {i.text}</li>)}</ul>}
        </li>))}</ul>
      <H>Pe proiecte</H>
      <ul className="plain">{data.bySite.map((s: any) => <li key={s.id}><div className="row between"><strong>{s.name}</strong><b className={s.net < 0 ? "t-crit" : ""}>{s.net >= 0 ? "+" : ""}{mil(s.net)}</b></div><span className="small muted">de încasat {mil(s.inflow)} · de plătit {mil(s.outflow)}{s.later ? ` · ${mil(s.later)} după cele 8 săptămâni` : ""}</span></li>)}</ul>
      <p className="small muted">Cum se calculează: încasările sunt situațiile de lucrări emise și neîncasate, așteptate la {data.payDelay} zile după scadență. Plățile sunt sumele angajate, împărțite egal pe {data.spendWeeks} săptămâni, cererile în așteptare și chiriile de utilaje. Nu include situații care nu au fost încă emise, salarii sau taxe. Ipotezele se schimbă din ecranul Valoare.</p>
    </Page>
  );
}

export function RaportBeneficiar({ id }: { id: string }) {
  const [r, setR] = useState<any>(null), [err, setErr] = useState(""), [text, setText] = useState(""), [msg, setMsg] = useState(""), [edit, setEdit] = useState(false);
  const make = async () => { setErr(""); try { const x = await post(`/sites/${id}/client-report`); setR(x); setText(x.text); } catch (e: any) { setErr(e.message); } };
  useEffect(() => { make(); }, [id]);
  const download = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text.replace(/\*\*/g, "")], { type: "text/plain;charset=utf-8" })); a.download = "raport-beneficiar.txt"; a.click(); };
  return (
    <Page title="Raport către beneficiar" eyebrow={r ? r.site + (r.client ? " · " + r.client : "") : ""} back={"#/santier/" + id} narrow>
      <Err msg={err} />
      {!r ? <Loading /> : <>
        <p className="small muted">Conține doar ce îl privește pe beneficiar: stadiu, ce s-a executat, ce urmează, ce decizii aștepți de la el și vremea. Fără costuri interne și fără probleme cu furnizorii.</p>
        <Card><div className="row between"><Auto>{r.by === "model" ? "scris de AI" : "compus automat"}</Auto><button className="link" onClick={() => setEdit(!edit)}>{edit ? "Gata" : "Modifică textul"}</button></div>
          {edit ? <><label htmlFor="cr" className="sr">Textul raportului</label><textarea id="cr" rows={18} value={text} onChange={(e) => setText(e.target.value)} /></> : <Md text={text} />}</Card>
        <div className="row three"><Btn kind="ghost" onClick={make}>Rescrie</Btn><Btn kind="ghost" onClick={download}>Descarcă</Btn><Btn onClick={async () => setMsg((await copy(text.replace(/\*\*/g, "").replace(/^#+\s*/gm, ""))) ? "Text copiat." : "Copierea nu a reușit.")}>Copiază</Btn></div>
        {msg && <p className="small muted" role="status">{msg}</p>}
        <p className="small muted">Ciorna e salvată și la „Documente pregătite”, în Autopilot. Se scrie singură în fiecare vineri la 13:00.</p>
      </>}
    </Page>
  );
}
