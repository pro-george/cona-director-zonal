import { useEffect, useState } from "react";
import { api, post, useLoad, dayShort, when } from "./api";
import { Page, Card, H, Pill, Auto, Btn, Err, Loading, Empty, Dictate, Md, Icon, I, copy } from "./ui";

export function MaiMult({ me, logout }: { me: any; logout: () => void }) {
  const L = ({ href, t, d }: any) => <a className="navrow" href={href}><div><strong>{t}</strong><span className="small muted">{d}</span></div><Icon d={I.chev} size={18} /></a>;
  return (
    <Page title="Mai mult" eyebrow={me.user.name}>
      <div className="stack tight">
        <L href="#/sedinte" t="Ședințe" d="Dictezi ce s-a discutat, primești minuta și sarcinile" />
        <L href="#/sarcini" t="Sarcini" d="Tot ce e deschis, pe responsabili și termene" />
        <L href="#/conducere" t="Raport pentru conducere" d="Ciorna săptămânală, scrisă din rapoarte, ERP și BIM" />
        <L href="#/intreaba" t="Întreabă asistentul" d="Orice întrebare despre șantiere, bani sau termene" />
        <L href="#/raport" t="Raport de șantier" d="Trimite tu un raport, dacă ai fost pe teren" />
      </div>
      <Btn kind="ghost" onClick={async () => { await post("/reset"); location.hash = "#/"; location.reload(); }}>Resetează datele demo</Btn>
      <button className="btn ghost" onClick={logout}>Schimbă contul</button>
      <p className="foot">Datele se păstrează doar pe acest dispozitiv.</p>
    </Page>
  );
}

export function Sedinte({ me }: { me: any }) {
  const { data, err, reload } = useLoad<any>("/meetings");
  const [title, setTitle] = useState(""), [site, setSite] = useState(""), [text, setText] = useState(""), [msg, setMsg] = useState("");
  const save = async () => { try { await post("/meetings", { title: title || "Ședință", site_id: site || null, text }); setText(""); setTitle(""); setMsg(""); await reload(); } catch (e: any) { setMsg(e.message); } };
  return (
    <Page title="Ședințe" back="#/mai-mult">
      <Card>
        <span className="label">Ședință nouă</span>
        <label htmlFor="mt">Titlu<input id="mt" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Comandament cu beneficiarul" /></label>
        <label htmlFor="ms">Șantier<select id="ms" value={site} onChange={(e) => setSite(e.target.value)}><option value="">Fără șantier anume</option>{me.sites.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label htmlFor="mx">Ce s-a discutat</label>
        <Dictate id="mx" value={text} onChange={setText} placeholder="Dictează în timpul sau după ședință: cine ce a spus, ce s-a stabilit, cine ce are de făcut și până când." />
        <Err msg={msg} />
        <Btn onClick={save}>Scrie minuta și sarcinile</Btn>
      </Card>
      <H>Minute</H>
      <Err msg={err} />
      {!data ? <Loading /> : data.meetings.length ? <div className="stack tight">{data.meetings.map((m: any) => (
        <Card key={m.id}>
          <div className="row between"><Auto>minută</Auto><span className="muted small">{dayShort(m.day)}{m.site ? " · " + m.site : ""}</span></div>
          <strong>{m.title}</strong><p>{m.summary}</p>
          {m.decisions.length > 0 && <><span className="label">Decizii</span><ul>{m.decisions.map((d: string, i: number) => <li key={i}>{d}</li>)}</ul></>}
          {m.tasks.length > 0 && <><span className="label">Sarcini</span><ul>{m.tasks.map((t: any) => <li key={t.id} className={t.status === "done" ? "done" : ""}>{t.title} <span className="muted small">({t.owner}, {dayShort(t.due)})</span></li>)}</ul></>}
        </Card>))}</div> : <Empty>Nicio ședință încă.</Empty>}
    </Page>
  );
}

export function TaskList({ tasks, today, reload }: { tasks: any[]; today: string; reload: () => void }) {
  const toggle = async (t: any) => { await post("/tasks/" + t.id, { done: t.status !== "done" }); reload(); };
  return (
    <ul className="tasks">{tasks.map((t) => (
      <li key={t.id} className={t.status === "done" ? "done" : ""}>
        <label><input type="checkbox" checked={t.status === "done"} onChange={() => toggle(t)} /><span><strong>{t.title}</strong>
          <span className={"small " + (t.status !== "done" && t.due < today ? "t-crit" : "muted")}>{t.owner} · {t.status !== "done" && t.due < today ? "întârziată, termen " : "termen "}{dayShort(t.due)}{t.site ? " · " + t.site : ""} {/^(report|delivery)/.test(t.source || "") && <Auto>deschisă automat</Auto>}</span></span></label>
      </li>))}</ul>
  );
}

export function Sarcini({ me }: { me: any }) {
  const { data, err, reload } = useLoad<any>("/tasks");
  const [title, setTitle] = useState(""), [msg, setMsg] = useState("");
  const add = async (e: any) => { e.preventDefault(); try { await post("/tasks", { title }); setTitle(""); setMsg(""); reload(); } catch (x: any) { setMsg(x.message); } };
  const open = data?.tasks.filter((t: any) => t.status === "open") || [], done = data?.tasks.filter((t: any) => t.status === "done") || [];
  return (
    <Page title="Sarcini" eyebrow={data ? open.length + " deschise" : ""} back="#/mai-mult">
      <form className="ask" onSubmit={add}><label htmlFor="nt" className="sr">Sarcină nouă</label><input id="nt" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Adaugă o sarcină…" /><button className="iconbtn solid" aria-label="Adaugă sarcina"><Icon d={I.plus} size={18} /></button></form>
      <Err msg={msg || err} />
      {!data ? <Loading /> : <>
        {open.length ? <TaskList tasks={open} today={data.today} reload={reload} /> : <Empty>Nimic deschis.</Empty>}
        {done.length > 0 && <><H>Încheiate</H><TaskList tasks={done} today={data.today} reload={reload} /></>}
      </>}
    </Page>
  );
}

export function Conducere() {
  const { data, err, reload } = useLoad<any>("/mgmt");
  const [msg, setMsg] = useState("");
  const r = data?.reports[0];
  return (
    <Page title="Raport pentru conducere" back="#/mai-mult">
      <Card>
        <p className="small muted">Ciorna se scrie singură vinerea la 14:00, din rapoartele de șantier, ERP și BIM. O poți cere oricând.</p>
        <Btn onClick={async () => { try { await post("/mgmt"); setMsg(""); await reload(); } catch (e: any) { setMsg(e.message); } }}>{r ? "Scrie din nou acum" : "Scrie raportul acum"}</Btn>
        {r && <Btn kind="ghost" onClick={async () => setMsg((await copy(r.text)) ? "Text copiat." : "Copierea nu a reușit; selectează textul manual.")}>Copiază textul</Btn>}
        <Err msg={err} />{msg && <p className="small muted" role="status">{msg}</p>}
      </Card>
      {!data ? <Loading /> : r ? <Card><div className="row between"><Auto>ciornă</Auto><span className="muted small">{dayShort(r.d_from)} – {dayShort(r.d_to)} · {when(r.ts)}</span></div><Md text={r.text} /></Card> : <Empty>Niciun raport scris încă.</Empty>}
    </Page>
  );
}

export function Intreaba({ q }: { q: string }) {
  const [question, setQuestion] = useState(q), [log, setLog] = useState<any[]>([]), [busy, setBusy] = useState(false);
  const ask = async (text: string) => {
    const t = text.trim(); if (!t || busy) return;
    setBusy(true); setQuestion("");
    try { const r = await post("/ask", { question: t }); setLog((l) => [...l, { q: t, a: r.text, by: r.by }]); } catch (e: any) { setLog((l) => [...l, { q: t, a: e.message, err: true }]); }
    setBusy(false);
  };
  useEffect(() => { if (q) ask(q); }, []);
  const ideas = ["Ce mă costă întârzierea de la hală?", "Unde cheltuim mai repede decât avansăm?", "Ce facturi sunt restante?", "Ce am de decis azi?"];
  return (
    <Page title="Întreabă asistentul" back="#/mai-mult">
      <p className="small muted">Răspunde doar din datele aplicației: rapoarte, ERP și BIM.</p>
      {log.length === 0 && !busy && <div className="chips">{ideas.map((i) => <button key={i} className="chip" onClick={() => ask(i)}>{i}</button>)}</div>}
      <div className="stack tight">{log.map((m, i) => <div key={i} className="qa"><p className="q">{m.q}</p><Card className={m.err ? "over" : ""}><Md text={m.a} />{m.by === "demo" && <span className="small muted">Răspuns compus din reguli (mod demo).</span>}</Card></div>)}</div>
      {busy && <Loading />}
      <form className="ask" onSubmit={(e) => { e.preventDefault(); ask(question); }}><label htmlFor="aq" className="sr">Întrebarea ta</label><input id="aq" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Scrie întrebarea…" /><button className="iconbtn solid" aria-label="Trimite"><Icon d={I.send} size={18} /></button></form>
    </Page>
  );
}

export function RaportNou({ me, back, onSent }: { me: any; back?: string; onSent?: () => void }) {
  const [site, setSite] = useState(me.sites.length === 1 ? me.sites[0].id : ""), [text, setText] = useState(""), [files, setFiles] = useState<File[]>([]), [msg, setMsg] = useState(""), [res, setRes] = useState<any>(null), [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true); setMsg("");
    try {
      const fd = new FormData(); fd.append("site_id", site); fd.append("text", text); files.forEach((f) => fd.append("photos", f));
      const r = await api("/reports", { method: "POST", body: fd });
      setRes(r); setText(""); setFiles([]); onSent?.();
    } catch (e: any) { setMsg(e.message); }
    setBusy(false);
  };
  return (
    <Page title="Raport de șantier" eyebrow="Două minute, cu vocea" back={back}>
      {res && <Card className="brief">
        <div className="row between"><Pill s={res.report.status} /><Auto>structurat automat</Auto></div>
        <p className="headline sm">{res.report.summary}</p>
        {res.tasks.length > 0 && <><span className="label">Sarcini deschise automat</span><ul>{res.tasks.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul></>}
        <p className="small muted">Raportul a ajuns la directorul zonal.{res.by === "demo" ? " Structurat pe reguli (mod demo)." : ""}</p>
      </Card>}
      <Card>
        {me.sites.length > 1 && <><span className="label">Șantier</span><div className="chips">{me.sites.map((s: any) => <button key={s.id} type="button" className="chip" aria-pressed={site === s.id} onClick={() => setSite(s.id)}>{s.name}</button>)}</div></>}
        {me.sites.length === 1 && <p><strong>{me.sites[0].name}</strong> <span className="muted small">{me.sites[0].location}</span></p>}
        <label htmlFor="rt">Ce s-a întâmplat azi</label>
        <Dictate id="rt" value={text} onChange={setText} placeholder="Câți oameni, ce s-a executat, ce utilaje, ce blochează, de ce ai nevoie." />
        <span className="label">Poze (maximum 3)</span>
        <div className="thumbs">
          {files.map((f, i) => <img key={i} src={URL.createObjectURL(f)} alt="Poză atașată" />)}
          <label className="addphoto" htmlFor="ph" aria-label="Adaugă poze"><Icon d={I.plus} /></label>
          <input id="ph" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 3))} />
        </div>
        <Err msg={msg} />
        <Btn busy={busy} onClick={send}>Trimite raportul</Btn>
      </Card>
    </Page>
  );
}

// Ecranul șefului de șantier: raport, sarcinile lui și reamintirile primite de la Autopilot.
export function SefHome({ me, route, logout }: { me: any; route: string[]; logout: () => void }) {
  const my = useLoad<any>("/my");
  const tab = route[0] === "sarcini" ? "sarcini" : route[0] === "mesaje" ? "mesaje" : "raport";
  const T = ({ id, href, icon, label }: any) => <a href={href} aria-current={tab === id ? "page" : undefined}><span className="ti"><Icon d={icon} /></span>{label}</a>;
  return (
    <>
      <main>
        {tab === "raport" && <>
          <RaportNou me={me} onSent={my.reload} />
          <div className="content"><H>Rapoartele mele</H>{my.data?.reports.length ? <ul className="plain">{my.data.reports.map((r: any) => <li key={r.id}><div className="row between"><Pill s={r.status} /><span className="small muted">{when(r.ts)}</span></div><span>{r.summary}</span></li>)}</ul> : <Empty>Niciun raport trimis.</Empty>}</div>
        </>}
        {tab === "sarcini" && <Page title="Sarcinile șantierului">{my.data?.tasks.length ? <ul className="tasks">{my.data.tasks.map((t: any) => <li key={t.id}><label><input type="checkbox" onChange={async () => { await post("/tasks/" + t.id, { done: true }); my.reload(); }} /><span><strong>{t.title}</strong><span className="small muted">{t.owner} · termen {dayShort(t.due)}</span></span></label></li>)}</ul> : <Empty>Nicio sarcină deschisă.</Empty>}</Page>}
        {tab === "mesaje" && <Page title="Mesaje" eyebrow={me.user.name}>{my.data?.notifications.length ? <ul className="plain">{my.data.notifications.map((n: any) => <li key={n.id}><span className="small muted">{when(n.ts)}</span><span>{n.text}</span></li>)}</ul> : <Empty>Niciun mesaj.</Empty>}<button className="btn ghost" onClick={logout}>Schimbă contul</button></Page>}
      </main>
      <nav className="tabs three" aria-label="Secțiuni">
        <T id="raport" href="#/" icon={I.mic} label="Raport" />
        <T id="sarcini" href="#/sarcini" icon={I.check} label="Sarcini" />
        <T id="mesaje" href="#/mesaje" icon={I.more} label="Mesaje" />
      </nav>
    </>
  );
}
