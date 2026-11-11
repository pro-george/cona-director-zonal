import { useState } from "react";
import { post, useLoad, lei, mil, pct, dayLong, dayShort, time, mins, when } from "./api";
import { Page, Card, H, Pill, Src, Auto, Bar, Btn, Err, Loading, Empty, Icon, I, STATUS } from "./ui";
import { Brand } from "./App";

const order: any = { critic: 0, atentie: 1, ok: 2, none: 3 };

function SiteRow({ s }: { s: any }) {
  return (
    <a className={"siterow st-" + s.status} href={"#/santier/" + s.id}>
      <div className="siterow-top"><Pill s={s.status} /><span className="muted small">{s.location}{s.workers != null ? " · " + s.workers + " oameni" : ""}</span></div>
      <strong>{s.name}</strong>
      {s.summary && <p className="clamp">{s.summary}</p>}
      {s.wx && <span className="small muted wxline">Meteo azi: {s.wx.tmin}…{s.wx.tmax}°C, rafale {s.wx.gust} km/h{s.wx.rain >= 1 ? ", ploaie " + s.wx.rain + " mm" : ""}{s.riskDays > 0 && <b className="wxrisk">{s.riskDays} {s.riskDays === 1 ? "zi cu risc" : "zile cu risc"} în 7 zile</b>}</span>}
      <div className="twobars">
        <div><span className="small muted">Fizic {pct(s.realPct)} <em>plan {pct(s.planPct)}</em></span><Bar value={s.realPct} plan={s.planPct} tone={s.realPct + 0.02 < s.planPct ? "warn" : "ok"} label="Stadiu fizic față de plan" /></div>
        <div><span className="small muted">Buget cheltuit {pct(s.spentPct)}</span><Bar value={s.spentPct} tone="brand" label="Buget cheltuit" /></div>
      </div>
    </a>
  );
}

export function Alert({ a, showSite = true }: { a: any; showSite?: boolean }) {
  return (
    <li className={"alert sev-" + a.sev}>
      <div><Src>{a.source}</Src>{showSite && a.site && <strong className="small"> {a.site}</strong>}</div>
      <p>{a.text}</p>
    </li>
  );
}

export function Azi({ me }: { me: any }) {
  const { data, err, reload } = useLoad<any>("/home");
  const [all, setAll] = useState(false), [q, setQ] = useState("");
  if (!data) return err ? <div className="content"><Err msg={err} /></div> : <div className="splash" />;
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Bucharest", hour: "2-digit", hour12: false }).format(new Date()));
  const hello = h < 11 ? "Bună dimineața" : h < 18 ? "Bună ziua" : "Bună seara";
  const b = data.brief, st = data.stats.today;
  const count = (k: string) => data.sites.filter((s: any) => s.status === k).length;
  const alerts = all ? data.alerts : data.alerts.slice(0, 5);
  return (
    <div className="page">
      <header className="hero">
        <div className="hero-brand"><Brand /><span>Director zonal</span></div>
        <p className="eyebrow">{dayLong(data.today)}</p>
        <h1>{hello}, {me.user.name.split(" ")[0]}</h1>
        <div className="seg" aria-hidden="true">{["critic", "atentie", "ok", "none"].map((k) => count(k) > 0 && <i key={k} className={"sg-" + k} style={{ flex: count(k) }} />)}</div>
        <p className="legend">{["critic", "atentie", "ok", "none"].filter((k) => count(k)).map((k) => <span key={k} className={"lg-" + k}><b>{count(k)}</b> {STATUS[k].toLowerCase()}</span>)}</p>
      </header>
      <a className="autostrip" href="#/autopilot">
        <Icon d={I.bolt} size={20} />
        <span><b>Autopilot</b> a făcut azi {st.actions} acțiuni în locul tău și ți-a economisit cam {mins(st.minutes)}.</span>
        <Icon d={I.chev} size={18} />
      </a>
      <div className="content">
        <Card className="brief">
          <div className="row between"><span className="label">Briefingul zilei</span>{b && <Auto>scris la {time(b.ts)}</Auto>}</div>
          {b ? <>
            <p className="headline">{b.headline}</p>
            <p>{b.summary}</p>
            {b.decisions?.length > 0 && <><span className="label">De decis azi</span><ol className="num">{b.decisions.map((d: string, i: number) => <li key={i}>{d}</li>)}</ol></>}
            {b.risks?.length > 0 && <details><summary>Riscuri de urmărit ({b.risks.length})</summary><ul>{b.risks.map((d: string, i: number) => <li key={i}>{d}</li>)}</ul></details>}
          </> : <Empty>Briefingul de azi nu a fost scris încă.</Empty>}
          <Btn kind="ghost" onClick={async () => { await post("/brief"); await reload(); }}>{b ? "Rescrie briefingul acum" : "Scrie briefingul"}</Btn>
        </Card>

        <div className="tiles">
          <a className="tile" href="#/aprobari"><b>{data.waiting.approvals}</b><span>aprobări te așteaptă</span></a>
          <a className="tile ai" href="#/autopilot"><b>{data.waiting.drafts}</b><span>documente pregătite</span></a>
          <a className="tile" href="#/sarcini"><b className={data.waiting.overdue ? "t-crit" : ""}>{data.waiting.overdue}</b><span>sarcini întârziate</span></a>
        </div>

        <form className="ask" onSubmit={(e) => { e.preventDefault(); if (q.trim()) location.hash = "#/intreaba/" + encodeURIComponent(q.trim()); }}>
          <label htmlFor="askq" className="sr">Întreabă asistentul</label>
          <input id="askq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Întreabă orice despre zonă…" />
          <button className="iconbtn solid" aria-label="Trimite întrebarea"><Icon d={I.send} size={18} /></button>
        </form>

        <H right={<span className="muted small">{data.alerts.length} active</span>}>Alerte din sisteme</H>
        {data.alerts.length ? <ul className="alerts">{alerts.map((a: any, i: number) => <Alert key={i} a={a} />)}</ul> : <Empty>Nicio alertă activă.</Empty>}
        {data.alerts.length > 5 && <button className="link" onClick={() => setAll(!all)}>{all ? "Arată mai puține" : `Arată toate cele ${data.alerts.length}`}</button>}

        <H>Șantiere</H>
        <div className="stack">{[...data.sites].sort((a, b) => order[a.status] - order[b.status]).map((s: any) => <SiteRow key={s.id} s={s} />)}</div>
        <p className="foot">Datele ERP și BIM sunt simulate. Șantierele, firmele și cifrele sunt fictive.</p>
      </div>
    </div>
  );
}

export function Santiere() {
  const { data, err } = useLoad<any>("/home");
  return (
    <Page title="Șantiere" eyebrow="Zona ta">
      <Err msg={err} />
      {!data ? <Loading /> : <div className="stack">{[...data.sites].sort((a, b) => order[a.status] - order[b.status]).map((s: any) => <SiteRow key={s.id} s={s} />)}</div>}
    </Page>
  );
}

export function Santier({ id }: { id: string }) {
  const { data, err } = useLoad<any>("/sites/" + id);
  const [tab, setTab] = useState("rezumat");
  if (!data) return <Page title="Șantier" back="#/santiere">{err ? <Err msg={err} /> : <Loading />}</Page>;
  const { site, finance: f, physical: p, deliveries, reports, tasks, alerts, weather: w } = data;
  const riskBy: any = {}; w.risks.forEach((r: any) => { (riskBy[r.day] = riskBy[r.day] || []).push(r); });
  const wd = (d: string) => new Intl.DateTimeFormat("ro-RO", { timeZone: "UTC", weekday: "short" }).format(new Date(d + "T12:00:00Z"));
  const last = reports[0];
  const DELIV: any = { livrat: "Livrat", planificat: "Planificat", intarziat: "Întârziat", in_drum: "În drum" };
  const ZS: any = { gata: "Gata", in_lucru: "În lucru", intarziat: "În urmă", planificat: "Planificat" };
  return (
    <Page title={site.name} eyebrow={site.location + " · " + site.client} back="#/santiere">
      <div className="segctl" role="tablist">{[["rezumat", "Rezumat"], ["bani", "Bani"], ["stadiu", "Stadiu"], ["meteo", "Meteo"], ["rapoarte", "Rapoarte"]].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>

      {tab === "rezumat" && <>
        <Card>
          <div className="row between"><Pill s={last?.status || "none"} /><span className="muted small">Șef de șantier: {site.manager}</span></div>
          <p>{last ? last.summary : "Niciun raport primit."}</p>
          <div className="kpis"><div><b>{pct(p.realPct)}</b><span>montat (plan {pct(p.planPct)})</span></div><div><b>{pct(f.spentPct)}</b><span>buget cheltuit</span></div><div><b>{last?.workers ?? "–"}</b><span>oameni pe șantier</span></div></div>
        </Card>
        <H>Alerte</H>
        {alerts.length ? <ul className="alerts">{alerts.map((a: any, i: number) => <li key={i} className={"alert sev-" + a.sev}><div><Src>{a.source}</Src></div><p>{a.text}</p></li>)}</ul> : <Empty>Nicio alertă pe acest șantier.</Empty>}
        <H>Sarcini deschise</H>
        {tasks.length ? <ul className="plain">{tasks.map((t: any) => <li key={t.id}><strong>{t.title}</strong><span className="muted small">{t.owner} · termen {dayShort(t.due)}</span></li>)}</ul> : <Empty>Nicio sarcină deschisă.</Empty>}
      </>}

      {tab === "bani" && <>
        <Card>
          <div className="row between"><span className="label">Buget de execuție</span><Src>{f.source}</Src></div>
          <div className="kpis"><div><b>{mil(f.actual)}</b><span>cheltuit din {mil(f.budget)}</span></div><div><b>{mil(f.committed)}</b><span>angajat</span></div><div><b>{mil(f.contract)}</b><span>valoare contract</span></div></div>
          <Bar value={f.spentPct} plan={p.realPct} label="Cheltuit față de stadiul fizic" />
          <p className="small muted">Bara arată banii cheltuiți; linia verticală este stadiul fizic din BIM ({pct(p.realPct)}).</p>
        </Card>
        <H>Pe categorii</H>
        <div className="stack tight">{f.lines.map((l: any) => (
          <Card key={l.category} className={l.over ? "over" : ""}>
            <div className="row between"><strong>{l.category}</strong>{l.over && <span className="pill s-critic">Depășit</span>}</div>
            <div className="bar2 stacked"><i className="fill t-brand" style={{ width: Math.min(100, (l.actual / l.budget) * 100) + "%" }} /><i className="fill t-commit" style={{ width: Math.min(100 - Math.min(100, (l.actual / l.budget) * 100), (l.committed / l.budget) * 100) + "%" }} /></div>
            <p className="small muted">Cheltuit {lei(l.actual)} · angajat {lei(l.committed)} · buget {lei(l.budget)}</p>
            <p className={"small " + (l.remaining < 0 ? "t-crit" : "")}>{l.remaining < 0 ? "Depășire: " + lei(-l.remaining) : "Rămas: " + lei(l.remaining)}</p>
          </Card>))}</div>
        <H>Încasări de la beneficiar</H>
        <ul className="plain">{f.receivables.map((r: any) => <li key={r.id}><div className="row between"><strong>{r.title}</strong><b>{lei(r.amount)}</b></div><span className={"small " + (r.overdueDays ? "t-crit" : "muted")}>{r.paid_at ? "Încasată pe " + dayShort(r.paid_at) : r.overdueDays ? `Restantă de ${r.overdueDays} zile (scadență ${dayShort(r.due)})` : "Scadentă pe " + dayShort(r.due)}</span></li>)}</ul>
      </>}

      {tab === "stadiu" && <>
        <Card>
          <div className="row between"><span className="label">Stadiu fizic</span><Src>{p.source}</Src></div>
          <div className="kpis"><div><b>{p.mounted}/{p.total}</b><span>elemente montate</span></div><div><b>{pct(p.planPct)}</b><span>prevăzut până azi</span></div><div><b className={p.lag ? "t-crit" : ""}>{p.lag}</b><span>elemente în urmă</span></div></div>
          <Bar value={p.realPct} plan={p.planPct} tone={p.lag ? "warn" : "ok"} label="Montat față de plan" />
        </Card>
        <H>Pe zone</H>
        <div className="zones">{p.zones.map((z: any) => <div key={z.zone} className={"zone z-" + z.state}><strong>{z.zone}</strong><b>{z.mounted}/{z.total}</b><span>{ZS[z.state]}{z.state === "intarziat" ? ` · ${z.due - z.mounted} în urmă` : ""}</span></div>)}</div>
        <H>Livrări din fabrică</H>
        {deliveries.length ? <ul className="plain">{deliveries.map((d: any) => <li key={d.id}><div className="row between"><strong>{d.count} × {d.kind}</strong><span className={"pill " + (d.late ? "s-critic" : d.status === "livrat" ? "s-ok" : "s-none")}>{DELIV[d.status] || d.status}</span></div><span className="small muted">{d.zone} · planificat {dayShort(d.planned)}{d.late && d.eta ? " · estimat " + dayShort(d.eta) : ""}{d.note ? " · " + d.note : ""}</span></li>)}</ul> : <Empty>Nicio livrare în perioada apropiată.</Empty>}
      </>}

      {tab === "meteo" && <>
        <Card>
          <div className="row between"><span className="label">Prognoză 7 zile, suprapusă peste lucrări</span><Src>{w.source}</Src></div>
          <div className="kpis"><div><b className={w.riskDays ? "t-crit" : ""}>{w.riskDays}</b><span>zile de lucru cu risc</span></div><div><b>{w.risks.reduce((a: number, r: any) => a + r.count, 0)}</b><span>elemente planificate afectate</span></div><div><b>{w.riskDays ? "până la " + w.riskDays : "0"}</b><span>zile de întârziere posibilă</span></div></div>
          <div className="wxgrid">{w.days.map((d: any) => <div key={d.day} className={"wxday" + (riskBy[d.day] ? " risk" : "")}><strong>{wd(d.day)}</strong><b>{d.tmax}°</b><span>{d.tmin}°</span><span>{d.gust}</span><span>{d.rain}</span></div>)}</div>
          <p className="small muted">Pe fiecare zi, de sus în jos: maxima, minima, rafalele (km/h) și precipitațiile (mm). Zilele marcate au lucrări planificate în BIM care depășesc pragurile pentru acel tip de lucrare. Întârzierea este o estimare: câte zile de lucru sunt expuse.</p>
        </Card>
        <H>Lucrări expuse</H>
        {w.risks.length ? <ul className="alerts">{w.risks.map((r: any, i: number) => <li key={i} className={"alert sev-" + r.sev}><div><Src>Meteo × BIM</Src> <strong className="small">{dayShort(r.day)} · {r.zone}</strong></div><p>{r.activity.charAt(0).toUpperCase() + r.activity.slice(1)}: {r.reasons.join(" și ")}. {r.count} {r.count === 1 ? "element planificat" : "elemente planificate"}.</p></li>)}</ul> : <Empty>Nicio lucrare planificată nu este expusă în următoarele 7 zile.</Empty>}
      </>}

      {tab === "rapoarte" && (reports.length ? <div className="stack tight">{reports.map((r: any) => (
        <Card key={r.id}>
          <div className="row between"><Pill s={r.status} /><span className="muted small">{r.author} · {when(r.ts)}</span></div>
          <p>{r.summary}</p>
          <details><summary>Detalii</summary>
            {[["Blocaje", r.details.blockers], ["Necesar", r.details.needs], ["Executat", r.details.done], ["Utilaje", r.details.equipment], ["Din poze", r.details.photoNotes]].map(([t, v]: any) => v?.length > 0 && <div key={t}><span className="label">{t}</span><ul>{v.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>)}
            {r.photos?.length > 0 && <div className="thumbs">{r.photos.map((src: string) => <img key={src} src={src} alt="Poză din raport" />)}</div>}
            <span className="label">Text original</span><p className="raw">{r.raw}</p>
          </details>
        </Card>))}</div> : <Empty>Niciun raport pentru acest șantier.</Empty>)}
    </Page>
  );
}
