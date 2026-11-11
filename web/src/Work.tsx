import { useState } from "react";
import { post, useLoad, lei, when, mins } from "./api";
import { Page, Card, H, Src, Auto, Btn, Err, Loading, Empty, copy } from "./ui";

const TYPE: any = { comanda: "Comandă", situatie_sub: "Situație subcontractor", pontaj: "Pontaj", decont: "Decont" };

export function Aprobari() {
  const { data, err, reload } = useLoad<any>("/approvals");
  const [msg, setMsg] = useState("");
  if (!data) return <Page title="Aprobări">{err ? <Err msg={err} /> : <Loading />}</Page>;
  const pending = data.items.filter((a: any) => a.status === "pending"), done = data.items.filter((a: any) => a.status !== "pending");
  const decide = async (id: number, decision: string) => { try { await post("/approvals/" + id, { decision }); setMsg(""); await reload(); } catch (e: any) { setMsg(e.message); } };
  return (
    <Page title="Aprobări" eyebrow={pending.length + " te așteaptă"} right={<Src>{data.source}</Src>}>
      <a className="autostrip inset" href="#/autopilot"><span>Cererile sub <b>{lei(data.limit)}</b> care se încadrează în buget se aprobă singure. Restul vin aici, deja verificate.</span></a>
      <Err msg={msg} />
      {pending.length === 0 && <Empty>Nicio cerere în așteptare.</Empty>}
      <div className="stack">{pending.map((a: any) => (
        <Card key={a.id}>
          <div className="row between"><span className="label">{TYPE[a.type] || a.type}</span><span className="muted small">{a.site}</span></div>
          <strong className="big">{a.title}</strong>
          <div className="row between"><span className="muted small">{a.supplier} · cerut de {a.requested_by}</span><b className="amount">{lei(a.amount)}</b></div>
          {a.rec && <div className={"rec rec-" + a.rec}><div className="row between"><strong>{a.rec === "aproba" ? "Recomandare: aprobă" : "Recomandare: verifică înainte"}</strong><Auto>verificat</Auto></div><p>{a.rec_reason}</p></div>}
          <div className="row two"><Btn kind="ghost" onClick={() => decide(a.id, "reject")}>Respinge</Btn><Btn onClick={() => decide(a.id, "approve")}>Aprobă</Btn></div>
        </Card>))}</div>
      <H>Rezolvate recent</H>
      <ul className="plain">{done.map((a: any) => (
        <li key={a.id}><div className="row between"><strong>{a.title}</strong><b>{lei(a.amount)}</b></div>
          <span className="small muted">{a.site} · {a.status === "approved" ? "aprobat" : "respins"} de {a.decided_by}{a.decided_at ? ", " + when(a.decided_at) : ""} {a.auto ? <Auto>automat</Auto> : null}</span></li>))}</ul>
    </Page>
  );
}

function Draft({ d, reload }: { d: any; reload: () => void }) {
  const [body, setBody] = useState(d.body), [open, setOpen] = useState(false), [note, setNote] = useState("");
  const save = (extra: any = {}) => post("/drafts/" + d.id, { body, ...extra }).then(reload);
  return (
    <Card className="draft">
      <div className="row between"><Auto>pregătit {when(d.ts)}</Auto><span className="muted small">{d.site}</span></div>
      <strong>{d.title}</strong>
      <span className="small muted">Către: {d.recipient}</span>
      {open ? <><label htmlFor={"dr" + d.id} className="sr">Textul documentului</label><textarea id={"dr" + d.id} rows={9} value={body} onChange={(e) => setBody(e.target.value)} /></> : <p className="clamp3">{body}</p>}
      <button className="link" onClick={() => setOpen(!open)}>{open ? "Restrânge" : "Citește și editează"}</button>
      {note && <p className="small muted">{note}</p>}
      <div className="row three">
        <Btn kind="ghost" onClick={() => save({ status: "dismissed" })}>Renunță</Btn>
        <Btn kind="ghost" onClick={async () => setNote((await copy(body)) ? "Text copiat." : "Copierea nu a reușit; selectează textul manual.")}>Copiază</Btn>
        <Btn onClick={() => save({ status: "sent" })}>Trimis</Btn>
      </div>
    </Card>
  );
}

function AiKey({ data, reload }: { data: any; reload: () => void }) {
  const [key, setKey] = useState(""), [open, setOpen] = useState(false);
  const save = async (v: string) => { await post("/settings", { ai_key: v }); setKey(""); setOpen(false); reload(); };
  return (
    <div className={"mode " + data.ai}>
      <p>{data.ai === "model" ? "AI conectat: textele sunt scrise de model, cu cheia salvată pe acest dispozitiv." : "Mod demo: fără cheie AI, textele sunt compuse din reguli. Automatizările rulează la fel."}</p>
      {data.aiError && <p className="t-crit">Ultima cerere către model a eșuat: {data.aiError}</p>}
      {open ? (
        <form className="stack tight" onSubmit={(e) => { e.preventDefault(); save(key); }}>
          <label htmlFor="aikey">Cheie Anthropic<input id="aikey" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-…" /></label>
          <p className="muted">Cheia rămâne doar în browserul acestui dispozitiv și e trimisă direct la Anthropic. Nu o pune pe un telefon care nu e al tău.</p>
          <div className="row two"><button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>Renunță</button><button className="btn sm" type="submit">Salvează cheia</button></div>
        </form>
      ) : (
        <div className="row"><button className="link" onClick={() => setOpen(true)}>{data.hasKey ? "Schimbă cheia" : "Conectează AI cu o cheie"}</button>{data.hasKey && <button className="link" onClick={() => save("")}>Șterge cheia</button>}</div>
      )}
    </div>
  );
}

export function Autopilot() {
  const { data, err, reload } = useLoad<any>("/autopilot");
  const [msg, setMsg] = useState(""), [limit, setLimit] = useState<string | null>(null);
  if (!data) return <Page title="Autopilot">{err ? <Err msg={err} /> : <Loading />}</Page>;
  const drafts = data.drafts.filter((d: any) => d.status === "draft");
  const act = async (key: string, body: any) => { try { const r = await post("/autopilot/" + key, body); setMsg(r.result ? r.result : ""); await reload(); } catch (e: any) { setMsg(e.message); } };
  return (
    <Page title="Autopilot" eyebrow="Ce face aplicația singură">
      <div className="apstats">
        <div><b>{data.stats.today.actions}</b><span>acțiuni azi</span></div>
        <div><b>{mins(data.stats.today.minutes)}</b><span>economisite azi</span></div>
        <div><b>{mins(data.stats.week.minutes)}</b><span>în ultimele 7 zile</span></div>
      </div>
      <p className="small muted">Timpul economisit este o estimare: fiecare tip de acțiune are un număr fix de minute pe care le-ar lua făcută de mână.</p>
      <AiKey data={data} reload={reload} />

      <H right={<span className="muted small">{drafts.length} de trimis</span>}>Documente pregătite</H>
      {drafts.length ? <div className="stack">{drafts.map((d: any) => <Draft key={d.id} d={d} reload={reload} />)}</div> : <Empty>Nimic de trimis acum.</Empty>}
      <p className="small muted">Aplicația nu trimite nimic singură: tu copiezi textul și apeși „Trimis” după ce l-ai expediat.</p>

      <H>Automatizări</H>
      {msg && <p className="small muted" role="status">{msg}</p>}
      <div className="stack tight">{data.automations.map((a: any) => (
        <Card key={a.key} className={a.enabled ? "" : "off"}>
          <div className="row between">
            <strong>{a.name}</strong>
            <label className="switch"><input type="checkbox" checked={a.enabled} onChange={(e) => act(a.key, { enabled: e.target.checked })} /><span className="sr">{a.enabled ? "Oprește" : "Pornește"} {a.name}</span><i /></label>
          </div>
          <p className="small">{a.desc}</p>
          <div className="row between"><span className="small muted">{a.when}{a.last_run ? " · ultima rulare " + when(a.last_run) + (a.last_result ? ": " + a.last_result : "") : " · nu a rulat încă"}</span></div>
          {a.key === "autoapprove" && (
            <form className="row limit" onSubmit={async (e) => { e.preventDefault(); try { await post("/settings", { autoapprove_limit: Number(limit ?? data.limit) }); setMsg("Prag salvat."); await reload(); } catch (x: any) { setMsg(x.message); } }}>
              <label htmlFor="lim" className="small">Prag (lei)</label>
              <input id="lim" type="number" min={0} step={500} value={limit ?? data.limit} onChange={(e) => setLimit(e.target.value)} />
              <button className="btn ghost sm" type="submit">Salvează</button>
            </form>)}
          {a.manual && a.enabled && <Btn kind="ghost sm" onClick={() => act(a.key, { run: true })}>Rulează acum</Btn>}
        </Card>))}</div>

      <H>Jurnal</H>
      <ul className="log">{data.log.map((l: any) => <li key={l.id}><span className="small muted">{when(l.ts)}{l.site ? " · " + l.site : ""}{l.minutes ? " · ~" + l.minutes + " min" : ""}</span><strong>{l.title}</strong>{l.detail && <p className="small">{l.detail}</p>}</li>)}</ul>
    </Page>
  );
}
