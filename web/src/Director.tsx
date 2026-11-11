import { useState } from "react";
import { api, post, useLoad, lei, mil, pct, dayLong, dayShort, time, mins, when, speak, stopSpeaking, canSpeak } from "./api";
import { Page, Card, H, Pill, Src, Auto, Bar, Btn, Err, Loading, Empty, Icon, I, STATUS } from "./ui";
import { Brand } from "./App";
import { Sheet, F, ShareBox } from "./Edit";
import { ForecastCard } from "./Dosar";

const order: any = { critic: 0, atentie: 1, ok: 2, none: 3 };

function SiteRow({ s, compact }: { s: any; compact?: boolean }) {
  if (compact) return (
    <a className="siterow compact" href={"#/santier/" + s.id}>
      <div className="siterow-top"><strong>{s.name}</strong><Pill s={s.status} /></div>
      {s.summary && <p className="clamp">{s.summary}</p>}
    </a>
  );
  return (
    <a className={"siterow st-" + s.status} href={"#/santier/" + s.id}>
      <div className="siterow-top"><Pill s={s.status} /><span className="muted small">{s.location}{s.workers != null ? " · " + s.workers + " oameni" : ""}</span></div>
      <strong>{s.name}</strong>
      {s.summary && <p className="clamp">{s.summary}</p>}
      {s.forecast?.date && <span className={"small " + (s.forecast.vsDeadline > 0 ? "t-crit" : "muted")}>Predare estimată: {dayShort(s.forecast.date)} ({s.forecast.vsDeadline > 0 ? "+" + s.forecast.vsDeadline + " zile față de termen" : -s.forecast.vsDeadline + " zile înainte de termen"})</span>}
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

export function Azi({ me, logout }: { me: any; logout: () => void }) {
  const { data, err, reload } = useLoad<any>("/home");
  const [more, setMore] = useState(false), [q, setQ] = useState(""), [reading, setReading] = useState(false);
  const listen = async () => { if (reading) { stopSpeaking(); setReading(false); return; } const r = await api("/brief/speech"); setReading(true); speak(r.say, () => setReading(false)); };
  if (!data) return err ? <div className="content"><Err msg={err} /></div> : <div className="splash" />;
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Bucharest", hour: "2-digit", hour12: false }).format(new Date()));
  const hello = h < 11 ? "Bună dimineața" : h < 18 ? "Bună ziua" : "Bună seara";
  const b = data.brief, st = data.stats.today;
  const count = (k: string) => data.sites.filter((s: any) => s.status === k).length;
  const state = [[count("critic"), "cu blocaj"], [count("atentie"), "de urmărit"], [count("ok"), "în grafic"], [count("none"), "fără raport"]].filter(([n]) => n).map(([n, t]) => n + " " + t).join(" · ");
  const crit = data.alerts.filter((a: any) => a.sev === "crit").length;
  const decisions = b?.decisions || [];
  return (
    <div className="page">
      <header className="hero">
        <div className="hero-brand"><Brand /><span>Director zonal</span><button className="link switch-acc" onClick={logout}>Schimbă contul</button></div>
        <p className="eyebrow">{dayLong(data.today)}</p>
        <h1>{hello}, {me.user.name.split(" ")[0]}</h1>
        {data.sites.length > 0 && <p className="state">{data.sites.length} {data.sites.length === 1 ? "proiect" : "proiecte"}: {state}</p>}
      </header>
      {data.sites.length === 0 ? <div className="content"><Card className="brief">
        <p className="headline">Începe cu primul proiect</p>
        <p className="muted">Adaugă-l de mână sau adu bugetul și graficul din Excel. Restul (meteo, alerte, replanificări, briefing) pornește singur din datele lui.</p>
        <div className="row two"><a className="btn ghost" href="#/import" style={{ textAlign: "center" }}>Din Excel</a><button className="btn" onClick={() => (document.querySelector(".fab") as HTMLElement)?.click()}>Proiect nou</button></div>
      </Card></div> :
      <div className="content azi">
        <div className="col-main">
        <Card className="brief">
          <div className="row between"><span className="label">Briefingul zilei</span>{b && <Auto>Autopilot · {time(b.ts)}</Auto>}</div>
          {b ? <>
            <p className="headline">{b.headline}</p>
            <p className="muted">{b.summary}</p>
            {decisions.length > 0 && <><span className="label">De decis azi</span><ol className="num">{(more ? decisions : decisions.slice(0, 3)).map((d: string, i: number) => <li key={i}>{d}</li>)}</ol></>}
            <div className="row between">
              {decisions.length > 3 ? <button className="link" onClick={() => setMore(!more)}>{more ? "Arată mai puține" : `Încă ${decisions.length - 3} decizii`}</button> : <span />}
              <button className="link" onClick={async () => { await post("/brief"); await reload(); }}>Rescrie</button>
            </div>
            {canSpeak && <button className="btn ghost listen" onClick={listen}><Icon d={reading ? I.stop : I.play} size={18} />{reading ? "Oprește citirea" : "Ascultă briefingul"}</button>}
          </> : <><Empty>Briefingul de azi nu a fost scris încă.</Empty><Btn onClick={async () => { await post("/brief"); await reload(); }}>Scrie briefingul</Btn></>}
        </Card>

        <H right={<a className="link" href="#/santiere">Detalii</a>}>Proiecte</H>
        <div className="stack tight">{[...data.sites].sort((a, b) => order[a.status] - order[b.status]).map((s: any) => <SiteRow key={s.id} s={s} compact />)}</div>

        </div>
        <div className="col-side">
        <div className="tiles">
          <a className="tile" href="#/aprobari"><b>{data.waiting.approvals}</b><span>aprobări</span></a>
          <a className="tile" href="#/autopilot"><b>{data.waiting.drafts}</b><span>documente pregătite</span></a>
          <a className="tile" href="#/sarcini"><b className={data.waiting.overdue ? "t-crit" : ""}>{data.waiting.overdue}</b><span>sarcini întârziate</span></a>
        </div>

        <div className="stack tight">
          {data.waiting.replans > 0 && <a className="navrow hl" href="#/replanificari"><div><strong>{data.waiting.replans} {data.waiting.replans === 1 ? "grafic nou propus" : "grafice noi propuse"}</strong><span className="small">Autopilotul a replanificat după vreme și livrări. Aprobă sau respinge.</span></div><Icon d={I.chev} size={18} /></a>}
          <a className="navrow" href="#/meteo"><div><strong>Meteo: {data.weather.days ? `${data.weather.days} zile de lucru cu risc` : "fără risc în 7 zile"}</strong><span className="small muted">{data.weather.days ? `Pe ${data.weather.sites} ${data.weather.sites === 1 ? "șantier" : "șantiere"}, în următoarele 7 zile` : "Nicio lucrare planificată nu este expusă"}</span></div><Icon d={I.chev} size={18} /></a>
          <a className="navrow" href="#/alerte"><div><strong>{data.alerts.length} alerte din sisteme</strong><span className="small muted">{crit ? crit + " critice · " : ""}rapoarte, ERP, BIM și meteo</span></div><Icon d={I.chev} size={18} /></a>
          <a className="navrow" href="#/valoare"><div><strong>Valoare estimată: {lei(data.value.realized + data.value.potential)}</strong><span className="small muted">{st.actions} acțiuni ale Autopilotului azi{data.value.potential > 0 ? " · " + lei(data.value.potential) + " așteaptă decizia ta" : ""}</span></div><Icon d={I.chev} size={18} /></a>
        </div>

        <form className="ask" onSubmit={(e) => { e.preventDefault(); if (q.trim()) location.hash = "#/intreaba/" + encodeURIComponent(q.trim()); }}>
          <label htmlFor="askq" className="sr">Întreabă asistentul</label>
          <input id="askq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Întreabă sau dă o comandă…" />
          {q.trim() ? <button className="iconbtn solid" aria-label="Trimite"><Icon d={I.send} size={18} /></button> : <a className="iconbtn solid" href="#/intreaba" aria-label="Deschide asistentul vocal"><Icon d={I.mic} size={18} /></a>}
        </form>
        </div>
        {me.mode !== "own" && <p className="foot">Date demonstrative. ERP și BIM simulate.</p>}
        {me.mode === "own" && (() => { let t = 0; try { t = Number(localStorage.getItem("dz.backup")) || 0; } catch { /* ignorat */ } const days = t ? Math.floor((Date.now() - t) / 86400000) : -1; return days < 0 || days >= 7 ? <a className="foot link" href="#/mai-mult">{days < 0 ? "Nu ai făcut încă o copie de siguranță a datelor." : `Ultima copie de siguranță e de acum ${days} zile.`} Fă una acum.</a> : null; })()}
      </div>}
    </div>
  );
}

export function Alerte() {
  const { data, err } = useLoad<any>("/home");
  const [src, setSrc] = useState("");
  const all = data?.alerts || [], sources = Array.from(new Set(all.map((a: any) => a.source))) as string[];
  const list = src ? all.filter((a: any) => a.source === src) : all;
  return (
    <Page title="Alerte" eyebrow={data ? all.length + " active" : ""} back="#/">
      <Err msg={err} />
      {!data ? <Loading /> : <>
        <div className="chips"><button className="chip" aria-pressed={!src} onClick={() => setSrc("")}>Toate</button>{sources.map((x) => <button key={x} className="chip" aria-pressed={src === x} onClick={() => setSrc(x)}>{x}</button>)}</div>
        {list.length ? <ul className="alerts grid2">{list.map((a: any, i: number) => <Alert key={i} a={a} />)}</ul> : <Empty>Nicio alertă activă.</Empty>}
      </>}
    </Page>
  );
}

export function Santiere() {
  const { data, err } = useLoad<any>("/home");
  return (
    <Page title="Proiecte" eyebrow="Zona ta" right={<a className="btn ghost sm" href="#/import">Din Excel</a>}>
      <Err msg={err} />
      {!data ? <Loading /> : <div className="stack grid2">{[...data.sites].sort((a, b) => order[a.status] - order[b.status]).map((s: any) => <SiteRow key={s.id} s={s} />)}</div>}
    </Page>
  );
}

export function Santier({ id }: { id: string }) {
  const { data, err, reload } = useLoad<any>("/sites/" + id);
  const [tab, setTab] = useState("rezumat"), [sheet, setSheet] = useState<any>(null), [share, setShare] = useState<any>(null);
  // Deschide un formular pentru un rând (buget, încasare, livrare, utilaj, sarcină): adăugare dacă nu are id, altfel modificare.
  const row = (entity: string, title: string, fields: any, item?: any, initial: any = {}) => setSheet({ title, fields, initial: item || initial,
    onSave: async (v: any) => { await post(item ? `/rows/${entity}/${item.id}` : `/sites/${id}/rows/${entity}`, v); await reload(); },
    onDelete: item ? async () => { await post(`/rows/${entity}/${item.id}/delete`); await reload(); } : undefined });
  if (!data) return <Page title="Șantier" back="#/santiere">{err ? <Err msg={err} /> : <Loading />}</Page>;
  const { site, finance: f, physical: p, deliveries, reports, tasks, alerts, weather: w, replan, equipment, team, forecast: fc, delays: dl } = data;
  const people = ["Cristian", ...team.map((u: any) => u.name)].filter((n, i, a) => a.indexOf(n) === i), zonesList = p.zones.map((z: any) => z.zone), today = new Date().toISOString().slice(0, 10);
  const editProject = () => setSheet({ title: "Editează proiectul", fields: F.project(team), initial: { ...site, manager_id: site.manager_id || "" }, onSave: async (v: any) => { await post("/projects/" + id, v); await reload(); }, onDelete: async () => { await post(`/projects/${id}/delete`); location.hash = "#/santiere"; } });
  const Add = ({ children, on }: any) => <button className="addrow" onClick={on}><Icon d={I.plus} size={16} />{children}</button>;
  const riskBy: any = {}; w.risks.forEach((r: any) => { (riskBy[r.day] = riskBy[r.day] || []).push(r); });
  const wd = (d: string) => new Intl.DateTimeFormat("ro-RO", { timeZone: "UTC", weekday: "short" }).format(new Date(d + "T12:00:00Z"));
  const last = reports[0];
  const DELIV: any = { livrat: "Livrat", planificat: "Planificat", intarziat: "Întârziat", in_drum: "În drum" };
  const ZS: any = { gata: "Gata", in_lucru: "În lucru", intarziat: "În urmă", planificat: "Planificat" };
  return (
    <Page title={site.name} eyebrow={[site.location, site.client].filter(Boolean).join(" · ") || "Proiect"} back="#/santiere" narrow right={<button className="btn ghost sm" onClick={editProject}>Editează</button>}>
      <div className="segctl" role="tablist">{[["rezumat", "Rezumat"], ["bani", "Bani"], ["stadiu", "Stadiu"], ["meteo", "Meteo"], ["rapoarte", "Rapoarte"]].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>

      {tab === "rezumat" && <>
        <Card>
          <div className="row between"><Pill s={last?.status || "none"} /><span className="muted small">Șef de șantier: {site.manager}</span></div>
          <p>{last ? last.summary : "Niciun raport primit."}</p>
          <div className="kpis"><div><b>{pct(p.realPct)}</b><span>montat (plan {pct(p.planPct)})</span></div><div><b>{pct(f.spentPct)}</b><span>buget cheltuit</span></div><div><b>{last?.workers ?? "–"}</b><span>oameni pe șantier</span></div></div>
        </Card>
        {fc?.date && fc.remaining > 0 && <button className={"navrow" + (fc.vsDeadline > 0 ? " warnrow" : "")} onClick={() => setTab("stadiu")}><div><strong>Predare estimată: {dayShort(fc.date)}</strong><span className="small muted">{fc.vsDeadline > 0 ? `Cu ${fc.vsDeadline} zile după termenul contractual` : `Cu ${-fc.vsDeadline} zile înainte de termen`}, în ritmul de acum</span></div><Icon d={I.chev} size={18} /></button>}
        <a className="navrow" href={"#/dosar/" + id}><div><strong>Dosar de întârzieri: {String(Math.round(dl.total * 10) / 10).replace(".", ",")} zile</strong><span className="small muted">{dl.events ? `${String(dl.claimDays).replace(".", ",")} revendicabile la beneficiar · ${lei(dl.cost)}` : "Nicio întârziere înregistrată"}{dl.urgent ? ` · ${dl.urgent} de notificat` : ""}</span></div><Icon d={I.chev} size={18} /></a>
        <H>Alerte</H>
        {alerts.length ? <ul className="alerts">{alerts.map((a: any, i: number) => <li key={i} className={"alert sev-" + a.sev}><div><Src>{a.source}</Src></div><p>{a.text}</p></li>)}</ul> : <Empty>Nicio alertă pe acest șantier.</Empty>}
        <H>Sarcini deschise</H>
        {tasks.length ? <ul className="plain">{tasks.map((t: any) => <li key={t.id} className="tap" onClick={() => row("task", "Sarcină", F.task(people, [{ id: site.id, name: site.name }]), t)}><strong>{t.title}</strong><span className="muted small">{t.owner} · termen {dayShort(t.due)}</span></li>)}</ul> : <Empty>Nicio sarcină deschisă.</Empty>}
        <Add on={() => row("task", "Sarcină nouă", F.task(people, [{ id: site.id, name: site.name }]), undefined, { owner: site.manager || "Cristian", site_id: site.id })}>Sarcină</Add>
        <H>Utilaje închiriate</H>
        {equipment.length ? <ul className="plain">{equipment.map((e: any) => <li key={e.id} className="tap" onClick={() => row("equipment", "Utilaj", F.equipment, e)}><div className="row between"><strong>{e.name}</strong><span className={"pill " + (e.status === "in_asteptare" ? "s-critic" : "s-ok")}>{e.status === "in_asteptare" ? "În așteptare" : "Lucrează"}</span></div><span className="small muted">{lei(e.daily_cost)} pe zi</span></li>)}</ul> : <Empty>Niciun utilaj trecut.</Empty>}
        <Add on={() => row("equipment", "Utilaj nou", F.equipment, undefined, { status: "activ" })}>Utilaj</Add>
        <a className="btn ghost" href="#/raport" style={{ textAlign: "center" }}>Trimite un raport de șantier</a>
        <H>Șeful de șantier</H>
        <Card>
          <p>{site.manager ? <><strong>{site.manager}</strong> trimite rapoartele și cererile de pe telefonul lui.</> : "Proiectul nu are încă un șef de șantier ales."}</p>
          <p className="small muted">Îi trimiți o invitație ca link. El raportează din aplicație și îți trimite fiecare raport tot ca link, pe care îl deschizi aici.</p>
          {site.manager ? <Btn onClick={async () => { const r = await api(`/sites/${id}/invite`); setShare({ title: "Invitație pentru " + r.sef, text: `Invitație în aplicația Director zonal pentru ${site.name}:`, link: r.link, note: "Trimite-i linkul. Când îl deschide pe telefonul lui, aplicația se pregătește pentru acest proiect." }); }}>Invită-l pe telefonul lui</Btn> : <Btn kind="ghost" onClick={editProject}>Alege șeful de șantier</Btn>}
        </Card>
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
          <Card key={l.id} className={(l.over ? "over " : "") + "tap"} onClick={() => row("budget", "Linie de buget", F.budget, l)}>
            <div className="row between"><strong>{l.category}</strong>{l.over && <span className="pill s-critic">Depășit</span>}</div>
            <div className="bar2 stacked"><i className="fill t-brand" style={{ width: Math.min(100, (l.actual / l.budget) * 100) + "%" }} /><i className="fill t-commit" style={{ width: Math.min(100 - Math.min(100, (l.actual / l.budget) * 100), (l.committed / l.budget) * 100) + "%" }} /></div>
            <p className="small muted">Cheltuit {lei(l.actual)} · angajat {lei(l.committed)} · buget {lei(l.budget)}</p>
            <p className={"small " + (l.remaining < 0 ? "t-crit" : "")}>{l.remaining < 0 ? "Depășire: " + lei(-l.remaining) : "Rămas: " + lei(l.remaining)}</p>
          </Card>))}</div>
        {f.lines.length === 0 && <Empty>Bugetul nu are încă nicio linie.</Empty>}
        <Add on={() => row("budget", "Linie de buget nouă", F.budget)}>Linie de buget</Add>
        <H>Încasări de la beneficiar</H>
        <ul className="plain">{f.receivables.map((r: any) => <li key={r.id} className="tap" onClick={() => row("receivable", "Situație de lucrări", F.receivable, r)}><div className="row between"><strong>{r.title}</strong><b>{lei(r.amount)}</b></div><span className={"small " + (r.overdueDays ? "t-crit" : "muted")}>{r.paid_at ? "Încasată pe " + dayShort(r.paid_at) : r.overdueDays ? `Restantă de ${r.overdueDays} zile (scadență ${dayShort(r.due)})` : "Scadentă pe " + dayShort(r.due)}</span>
          {!r.paid_at && <button className="link" onClick={async (e) => { e.stopPropagation(); await post(`/rows/receivable/${r.id}`, { paid_at: today }); await reload(); }}>Marchează încasată azi</button>}</li>)}</ul>
        <Add on={() => row("receivable", "Situație de lucrări nouă", F.receivable, undefined, { issued: today })}>Situație de lucrări</Add>
      </>}

      {replan && (tab === "stadiu" || tab === "meteo" || tab === "rezumat") && <a className="navrow hl" href="#/replanificari"><div><strong>Grafic nou propus de Autopilot</strong><span className="small">{replan.data.impact.elements} elemente de redatat. Deschide ca să aprobi sau să respingi.</span></div><Icon d={I.chev} size={18} /></a>}
      {tab === "stadiu" && <>
        <Card>
          <div className="row between"><span className="label">Stadiu fizic</span><Src>{p.source}</Src></div>
          <div className="kpis"><div><b>{p.mounted}/{p.total}</b><span>elemente montate</span></div><div><b>{pct(p.planPct)}</b><span>prevăzut până azi</span></div><div><b className={p.lag ? "t-crit" : ""}>{p.lag}</b><span>elemente în urmă</span></div></div>
          <Bar value={p.realPct} plan={p.planPct} tone={p.lag ? "warn" : "ok"} label="Montat față de plan" />
          {p.replanned > 0 && <p className="small muted">Grafic replanificat: {p.replanned} elemente mutate, cu cel mult {p.slip} zile față de graficul inițial.</p>}
        </Card>
        <ForecastCard f={fc} />
        <H>Pe zone</H>
        <div className="zones">{p.zones.map((z: any) => <div key={z.zone} role="button" tabIndex={0} className={"zone tap z-" + z.state} onClick={() => setSheet({ title: "Zonă: " + z.zone, fields: F.zoneEdit(z.total), initial: { zone: z.zone, mounted: z.mounted, start: z.start || "", end: z.end || "" }, note: "Actualizează câte elemente sunt montate sau mută restul lucrărilor.",
          onSave: async (v: any) => { await post(`/sites/${id}/zones`, { ...v, old: z.zone }); await reload(); }, onDelete: async () => { await post(`/sites/${id}/zones/delete`, { zone: z.zone }); await reload(); } })}><strong>{z.zone}</strong><b>{z.mounted}/{z.total}</b><span>{ZS[z.state]}{z.state === "intarziat" ? ` · ${z.due - z.mounted} în urmă` : ""}</span></div>)}</div>
        {p.zones.length === 0 && <Empty>Proiectul nu are încă zone. Adaugă prima lucrare.</Empty>}
        <Add on={() => setSheet({ title: "Zonă nouă", fields: F.zoneNew, initial: { count: 20, start: today, mounted: 0 }, onSave: async (v: any) => { await post(`/sites/${id}/zones`, v); await reload(); } })}>Zonă sau lucrare</Add>
        <H>Livrări din fabrică</H>
        {deliveries.length ? <ul className="plain">{deliveries.map((d: any) => <li key={d.id} className="tap" onClick={() => row("delivery", "Livrare", F.delivery(zonesList), d)}><div className="row between"><strong>{d.count} × {d.kind}</strong><span className={"pill " + (d.late ? "s-critic" : d.status === "livrat" ? "s-ok" : "s-none")}>{DELIV[d.status] || d.status}</span></div><span className="small muted">{d.zone} · planificat {dayShort(d.planned)}{d.late && d.eta ? " · estimat " + dayShort(d.eta) : ""}{d.note ? " · " + d.note : ""}</span></li>)}</ul> : <Empty>Nicio livrare în perioada apropiată.</Empty>}
        <Add on={() => row("delivery", "Livrare nouă", F.delivery(zonesList), undefined, { planned: today, status: "planificat" })}>Livrare</Add>
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
            <button className="link danger" onClick={async () => { await post(`/reports/${r.id}/delete`); await reload(); }}>Șterge raportul</button>
          </details>
        </Card>))}</div> : <Empty>Niciun raport pentru acest șantier.</Empty>)}
      {sheet && <Sheet {...sheet} onClose={() => setSheet(null)} />}
      {share && <ShareBox {...share} onClose={() => setShare(null)} />}
    </Page>
  );
}

export function Meteo() {
  const { data, err, reload } = useLoad<any>("/weather");
  const [msg, setMsg] = useState("");
  const wd = (d: string) => new Intl.DateTimeFormat("ro-RO", { timeZone: "UTC", weekday: "short" }).format(new Date(d + "T12:00:00Z"));
  if (!data) return <Page title="Meteo" back="#/">{err ? <Err msg={err} /> : <Loading />}</Page>;
  const total = data.sites.reduce((a: number, s: any) => a + s.riskDays, 0);
  return (
    <Page title="Meteo și lucrări" eyebrow={total ? total + " zile de lucru cu risc" : "Fără risc în 7 zile"} back="#/" right={<Btn kind="ghost sm" onClick={async () => { const r = await post("/weather"); setMsg(r.result); await reload(); }}>Actualizează</Btn>}>
      <p className="small muted">Prognoza pe 7 zile a fiecărui șantier, suprapusă peste lucrările planificate în BIM. O zi e marcată doar dacă în ea e planificată o lucrare pe care vremea o oprește.</p>
      {msg && <p className="small muted" role="status">{msg}</p>}
      <div className="stack grid2">{[...data.sites].sort((a: any, b: any) => b.riskDays - a.riskDays).map((s: any) => { const risky = new Set(s.risks.map((r: any) => r.day)); return (
        <Card key={s.id}>
          <div className="row between"><strong className="big">{s.name}</strong><span className={"pill " + (s.riskDays ? "s-critic" : "s-ok")}>{s.riskDays ? s.riskDays + (s.riskDays === 1 ? " zi cu risc" : " zile cu risc") : "Fără risc"}</span></div>
          <div className="row between"><span className="small muted">{s.location}</span><Src>{s.source}</Src></div>
          {s.days.length ? <div className="wxgrid">{s.days.map((d: any) => <div key={d.day} className={"wxday" + (risky.has(d.day) ? " risk" : "")}><strong>{wd(d.day)}</strong><b>{d.tmax}°</b><span>{d.tmin}°</span><span>{d.gust}</span><span>{d.rain}</span></div>)}</div> : <Empty>Fără prognoză: proiectul nu are localitate.</Empty>}
          {s.risks.length > 0 && <ul className="moves">{s.risks.map((r: any) => <li key={r.day}><strong>{dayShort(r.day)}: {r.reasons.join(" și ")}</strong><span className="small muted">Expuse: {r.works.join(", ")} · {r.count} {r.count === 1 ? "element" : "elemente"}</span></li>)}</ul>}
          {s.replan ? <a className="btn sm" href="#/replanificari">Vezi graficul propus</a> : <a className="link" href={"#/santier/" + s.id}>Deschide șantierul</a>}
        </Card>); })}</div>
      <p className="small muted">Pe fiecare zi, de sus în jos: maxima, minima, rafalele (km/h) și precipitațiile (mm). Pragurile pe tip de lucrare sunt orientative.</p>
    </Page>
  );
}
