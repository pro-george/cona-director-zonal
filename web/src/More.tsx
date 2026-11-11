import { useEffect, useRef, useState } from "react";
import { api, post, useLoad, dayShort, when, speak, stopSpeaking, listenOnce, canSpeak, canListen } from "./api";
import { Page, Card, H, Pill, Auto, Btn, Err, Loading, Empty, Dictate, Md, Icon, I, copy } from "./ui";
import { Sheet, F, ShareBox } from "./Edit";
// @ts-ignore: modul JavaScript
import { exportBytes, importBytes } from "./core/db.js";

export function MaiMult({ me, logout }: { me: any; logout: () => void }) {
  const [own, setOwn] = useState(false), [msg, setMsg] = useState("");
  const backup = async () => {
    const blob = new Blob([exportBytes()], { type: "application/octet-stream" }), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `director-zonal-${new Date().toISOString().slice(0, 10)}.db`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    try { localStorage.setItem("dz.backup", String(Date.now())); } catch { /* ignorat */ }
    setMsg("Copia a fost descărcată. Păstreaz-o într-un loc sigur: conține toate datele.");
  };
  const restore = async (file?: File) => { if (!file) return; try { await importBytes(new Uint8Array(await file.arrayBuffer())); location.hash = "#/"; location.reload(); } catch (e: any) { setMsg(e.message || "Fișierul nu a putut fi citit."); } };
  const L = ({ href, t, d }: any) => <a className="navrow" href={href}><div><strong>{t}</strong><span className="small muted">{d}</span></div><Icon d={I.chev} size={18} /></a>;
  return (
    <Page title="Mai mult" eyebrow={me.user.name}>
      <div className="stack tight grid2">
        <L href="#/resurse" t="Resurse" d="Utilaje care stau, oameni pe șantiere, prezența subcontractorilor" />
        <L href="#/cash" t="Prognoză de cash" d="Ce intră și ce iese în următoarele 8 săptămâni" />
        <L href="#/dosare" t="Dosare de întârzieri" d="Zilele pierdute, cu cauze și dovezi, gata de revendicat" />
        <L href="#/echipa" t="Echipă" d="Șefii de șantier și proiectele lor" />
        <L href="#/meteo" t="Meteo și lucrări" d="Prognoza pe 7 zile a fiecărui șantier, suprapusă peste grafic" />
        <L href="#/valoare" t="Valoare" d="Ce a adus Autopilotul, în lei, cu formulele la vedere" />
        <L href="#/import" t="Importă proiect" d="Adu bugetul și graficul din Excel; coloanele se potrivesc singure" />
        <L href="#/sedinte" t="Ședințe" d="Dictezi ce s-a discutat, primești minuta și sarcinile" />
        <L href="#/sarcini" t="Sarcini" d="Tot ce e deschis, pe responsabili și termene" />
        <L href="#/conducere" t="Raport pentru conducere" d="Ciorna săptămânală, scrisă din rapoarte, ERP și BIM" />
        <L href="#/intreaba" t="Asistent vocal" d="Întrebări și comenzi cu vocea: aprobă, aplică graficul, notează o sarcină" />
        <L href="#/raport" t="Raport de șantier" d="Trimite tu un raport, dacă ai fost pe teren" />
      </div>
      <H>Datele aplicației</H>
      <Card>
        <p className="small muted">{me.mode === "own" ? "Lucrezi cu datele tale. Sunt păstrate doar pe acest dispozitiv, deci fă din când în când o copie de siguranță." : "Acum vezi date demonstrative. Când vrei să lucrezi cu proiectele tale, pornește de la zero."}</p>
        {me.mode !== "own" && <Btn onClick={async () => setOwn(true)}>Începe cu proiectele tale</Btn>}
        <Btn kind="ghost" onClick={backup}>Salvează o copie de siguranță</Btn>
        <label className="btn ghost filebtn" htmlFor="rst">Restaurează dintr-o copie<input id="rst" type="file" accept=".db,application/octet-stream" hidden onChange={(e) => restore(e.target.files?.[0])} /></label>
        <Btn kind="ghost" onClick={async () => { await post("/reset"); location.hash = "#/"; location.reload(); }}>{me.mode === "own" ? "Șterge tot și revino la datele demo" : "Resetează datele demo"}</Btn>
        {msg && <p className="small muted" role="status">{msg}</p>}
      </Card>
      <button className="btn ghost" onClick={logout}>Schimbă contul</button>
      {own && <Sheet title="Începe cu proiectele tale" fields={[{ key: "name", label: "Numele tău", hint: "Apare în salut, la aprobări și ca semnătură pe documente." }]} initial={{ name: me.user.name }} saveLabel="Șterge datele demo și pornește" note="Toate datele demonstrative se șterg de pe acest dispozitiv. Rămâi cu o aplicație goală, în care adaugi proiectele tale."
        onClose={() => setOwn(false)} onSave={async (v) => { await post("/workspace/own", v); location.hash = "#/"; location.reload(); }} />}
    </Page>
  );
}

export function Sedinte({ me }: { me: any }) {
  const { data, err, reload } = useLoad<any>("/meetings");
  const [title, setTitle] = useState(""), [site, setSite] = useState(""), [text, setText] = useState(""), [msg, setMsg] = useState("");
  const save = async () => { try { await post("/meetings", { title: title || "Ședință", site_id: site || null, text }); setText(""); setTitle(""); setMsg(""); await reload(); } catch (e: any) { setMsg(e.message); } };
  return (
    <Page title="Ședințe" back="#/mai-mult" narrow>
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
  const team = useLoad<any>("/team"), [edit, setEdit] = useState<any>(null);
  return (<>
    {edit && <Sheet title="Sarcină" fields={F.task((team.data?.users || []).map((u: any) => u.name), team.data?.sites || [])} initial={{ ...edit, site_id: edit.site_id || "" }} onClose={() => setEdit(null)} onSave={async (v) => { await post("/rows/task/" + edit.id, v); reload(); }} onDelete={async () => { await post(`/rows/task/${edit.id}/delete`); reload(); }} />}
    <ul className="tasks">{tasks.map((t) => (
      <li key={t.id} className={t.status === "done" ? "done" : ""}>
        <label><input type="checkbox" checked={t.status === "done"} onChange={() => toggle(t)} /><span><strong>{t.title}</strong>
          <span className={"small " + (t.status !== "done" && t.due < today ? "t-crit" : "muted")}>{t.owner} · {t.status !== "done" && t.due < today ? "întârziată, termen " : "termen "}{dayShort(t.due)}{t.site ? " · " + t.site : ""} {/^(report|delivery|meteo)/.test(t.source || "") && <Auto>deschisă automat</Auto>}</span></span></label>
        <button className="iconbtn bare" onClick={() => setEdit(t)} aria-label={"Editează: " + t.title}><Icon d={I.edit} size={18} /></button>
      </li>))}</ul>
  </>);
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
    <Page title="Raport pentru conducere" back="#/mai-mult" narrow>
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
  const [text, setText] = useState(""), [log, setLog] = useState<any[]>([]), [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<any>(null), [voice, setVoice] = useState(canSpeak), [mic, setMic] = useState({ on: false, partial: "" });
  const stopRef = useRef<null | (() => void)>(null);
  const reply = (r: any, question?: string) => {
    setLog((l) => [...l, { q: question, a: r.say, kind: r.kind }]);
    setPending(r.kind === "confirm" ? r.confirm : null);
    if (voice) speak(r.say);
    if (r.kind === "navigate" && r.go) setTimeout(() => { location.hash = r.go; }, 500);
  };
  const send = async (raw: string) => {
    const t = raw.trim(); if (!t || busy) return;
    setText(""); stopSpeaking();
    if (pending && /^(da|sigur|confirm|aproba|aplica|ok)\b/i.test(t.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) return confirm(true, t);
    if (pending && /^(nu|anuleaza|renunta|stop)\b/i.test(t.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) return confirm(false, t);
    setBusy(true);
    try { reply(await post("/command", { text: t }), t); } catch (e: any) { setLog((l) => [...l, { q: t, a: e.message, err: true }]); }
    setBusy(false);
  };
  const confirm = async (yes: boolean, said?: string) => {
    const c = pending; setPending(null);
    if (!yes) { setLog((l) => [...l, { q: said, a: "Am renunțat. Nu s-a schimbat nimic.", kind: "answer" }]); if (voice) speak("Am renunțat."); return; }
    setBusy(true);
    try { reply(await post("/command", { confirm: c }), said || c.label); } catch (e: any) { setLog((l) => [...l, { q: said, a: e.message, err: true }]); }
    setBusy(false);
  };
  const toggleMic = () => {
    if (mic.on) { stopRef.current?.(); return; }
    stopSpeaking();
    stopRef.current = listenOnce(send, (on, partial) => setMic({ on, partial }));
  };
  useEffect(() => { if (q) send(q); return () => stopSpeaking(); }, []);
  const ideas = ["Citește briefingul", "Ce e nou la hală?", "Aprobă macaraua", "Cum e vremea la depozit?", "Aplică graficul la campus", "Sarcină pentru Ioana: trimite oferta până vineri"];
  return (
    <Page title="Asistent" eyebrow="Întreabă sau dă o comandă" back="#/" narrow>
      <div className="voicebar">
        {canListen ? <button type="button" className={"mic" + (mic.on ? " rec" : "")} onClick={toggleMic} aria-label={mic.on ? "Oprește ascultarea" : "Dă o comandă cu vocea"}><Icon d={I.mic} size={28} /></button> : null}
        <div><strong>{mic.on ? mic.partial || "Ascult…" : canListen ? "Apasă și spune comanda" : "Scrie comanda mai jos"}</strong>
          <span className="small muted">{canListen ? "Aprobările și graficele cer confirmare: spui „da” sau „nu”." : "Acest browser nu are recunoaștere vocală."}</span></div>
      </div>
      {canSpeak && <label className="check"><input type="checkbox" checked={voice} onChange={(e) => { setVoice(e.target.checked); if (!e.target.checked) stopSpeaking(); }} />Răspunde și cu voce</label>}
      {log.length === 0 && !busy && <div className="chips">{ideas.map((i) => <button key={i} className="chip" onClick={() => send(i)}>{i}</button>)}</div>}
      <div className="stack tight">{log.map((m, i) => <div key={i} className="qa">{m.q && <p className="q">{m.q}</p>}<Card className={m.err ? "over" : ""}>{m.kind === "done" && <Auto>făcut</Auto>}<Md text={m.a} /></Card></div>)}</div>
      {pending && <div className="row two"><Btn kind="ghost" onClick={() => confirm(false)}>Nu</Btn><Btn onClick={() => confirm(true)}>{pending.label}</Btn></div>}
      {busy && <Loading />}
      <form className="ask" onSubmit={(e) => { e.preventDefault(); send(text); }}><label htmlFor="aq" className="sr">Întrebare sau comandă</label><input id="aq" value={text} onChange={(e) => setText(e.target.value)} placeholder={pending ? "Scrie da sau nu…" : "Scrie o întrebare sau o comandă…"} /><button className="iconbtn solid" aria-label="Trimite"><Icon d={I.send} size={18} /></button></form>
    </Page>
  );
}

export function RaportNou({ me, back, onSent }: { me: any; back?: string; onSent?: () => void }) {
  const [site, setSite] = useState(me.sites.length === 1 ? me.sites[0].id : ""), [text, setText] = useState(""), [files, setFiles] = useState<File[]>([]), [msg, setMsg] = useState(""), [res, setRes] = useState<any>(null), [busy, setBusy] = useState(false), [share, setShare] = useState<any>(null);
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
    <Page title="Raport de șantier" eyebrow="Două minute, cu vocea" back={back} narrow>
      {res && <Card className="brief">
        <div className="row between"><Pill s={res.report.status} /><Auto>structurat automat</Auto></div>
        <p className="headline sm">{res.report.summary}</p>
        {res.tasks.length > 0 && <><span className="label">Sarcini deschise automat</span><ul>{res.tasks.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul></>}
        {me.device === "sef" ? <><p className="small muted">Raportul e salvat pe telefonul tău. Trimite-l directorului{me.director ? " (" + me.director + ")" : ""} ca să-l vadă.</p>
          <Btn onClick={async () => { const r = await api(`/reports/${res.report.id}/link`); setShare({ title: "Trimite raportul", text: r.text, link: r.link }); }}>Trimite directorului</Btn></>
          : <p className="small muted">Raportul a fost salvat.{res.by === "demo" ? " Structurat pe reguli (mod demo)." : ""}</p>}
      </Card>}
      {share && <ShareBox {...share} onClose={() => setShare(null)} />}
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
  const [req, setReq] = useState(false), [sent, setSent] = useState(""), [share, setShare] = useState<any>(null);
  const sendLink = async (path: string, title: string) => { const r = await api(path); setShare({ title, text: r.text, link: r.link }); };
  const T = ({ id, href, icon, label }: any) => <a href={href} aria-current={tab === id ? "page" : undefined}><span className="ti"><Icon d={icon} /></span>{label}</a>;
  return (
    <>
      <main>
        <div className="whoami"><div><strong>{me.user.name}</strong><span className="small muted">Șef de șantier{me.sites[0] ? " · " + me.sites[0].name : ""}</span></div><button className="btn ghost sm" onClick={logout}>Schimbă contul</button></div>
        {tab === "raport" && <>
          <RaportNou me={me} onSent={my.reload} />
          {me.sites[0] && <div className="content" style={{ paddingTop: 0, paddingBottom: 0 }}><button className="btn ghost" onClick={() => setReq(true)}>Cere o aprobare</button>{sent && <p className="small muted" role="status">{sent}</p>}</div>}
          {req && <Sheet title="Cerere de aprobare" fields={F.approval([]).filter((x) => x.key !== "site_id")} initial={{ type: "comanda" }} saveLabel="Trimite cererea" onClose={() => setReq(false)} onSave={async (v) => { const r = await post(`/sites/${me.sites[0].id}/approvals`, v); if (me.device === "sef") await sendLink(`/approvals/${r.id}/link`, "Trimite cererea"); else setSent("Cererea a fost adăugată."); }} />}
          {share && <ShareBox {...share} onClose={() => setShare(null)} />}
          <div className="content"><H>Rapoartele mele</H>{my.data?.reports.length ? <ul className="plain">{my.data.reports.map((r: any) => <li key={r.id}><div className="row between"><Pill s={r.status} /><span className="small muted">{when(r.ts)}</span></div><span>{r.summary}</span>{me.device === "sef" && <button className="link" onClick={() => sendLink(`/reports/${r.id}/link`, "Trimite raportul")}>Trimite directorului</button>}</li>)}</ul> : <Empty>Niciun raport trimis.</Empty>}</div>
        </>}
        {tab === "sarcini" && <Page title="Sarcinile șantierului">{my.data?.tasks.length ? <ul className="tasks">{my.data.tasks.map((t: any) => <li key={t.id}><label><input type="checkbox" onChange={async () => { await post("/tasks/" + t.id, { done: true }); my.reload(); }} /><span><strong>{t.title}</strong><span className="small muted">{t.owner} · termen {dayShort(t.due)}</span></span></label></li>)}</ul> : <Empty>Nicio sarcină deschisă.</Empty>}</Page>}
        {tab === "mesaje" && <Page title="Mesaje" eyebrow={me.user.name}>{my.data?.notifications.length ? <ul className="plain">{my.data.notifications.map((n: any) => <li key={n.id}><span className="small muted">{when(n.ts)}</span><span>{n.text}</span></li>)}</ul> : <Empty>Niciun mesaj.</Empty>}</Page>}
      </main>
      <nav className="tabs three" aria-label="Secțiuni">
        <div className="side-brand"><span className="logo-fallback" aria-hidden="true" /><span>Director zonal</span></div>
        <T id="raport" href="#/" icon={I.mic} label="Raport" />
        <T id="sarcini" href="#/sarcini" icon={I.check} label="Sarcini" />
        <T id="mesaje" href="#/mesaje" icon={I.more} label="Mesaje" />
      </nav>
    </>
  );
}
