import { useState } from "react";
import { post, useLoad, lei, when, mins, dayShort } from "./api";
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
      <div className="stack grid2">{pending.map((a: any) => (
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
      <a className="navrow" href="#/valoare"><div><strong>Vezi valoarea în lei</strong><span className="small muted">Zile de șantier, încasări, utilaje și timp, cu formulele la vedere</span></div><span aria-hidden="true">→</span></a>
      <AiKey data={data} reload={reload} />

      <H right={<span className="muted small">{drafts.length} de trimis</span>}>Documente pregătite</H>
      {drafts.length ? <div className="stack grid2">{drafts.map((d: any) => <Draft key={d.id} d={d} reload={reload} />)}</div> : <Empty>Nimic de trimis acum.</Empty>}
      <p className="small muted">Aplicația nu trimite nimic singură: tu copiezi textul și apeși „Trimis” după ce l-ai expediat.</p>

      <H>Automatizări</H>
      {msg && <p className="small muted" role="status">{msg}</p>}
      <div className="stack tight grid2">{data.automations.map((a: any) => (
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

const range = (a: string, b: string) => (a === b ? dayShort(a) : dayShort(a) + " – " + dayShort(b));

export function Replanificari() {
  const { data, err, reload } = useLoad<any>("/replans");
  const [msg, setMsg] = useState("");
  if (!data) return <Page title="Replanificări" back="#/">{err ? <Err msg={err} /> : <Loading />}</Page>;
  const open = data.items.filter((r: any) => r.status === "proposed"), done = data.items.filter((r: any) => r.status !== "proposed");
  const decide = async (id: number, decision: string) => { try { await post("/replans/" + id, { decision }); setMsg(""); await reload(); } catch (e: any) { setMsg(e.message); } };
  return (
    <Page title="Replanificări" eyebrow={open.length + " de aprobat"} back="#/">
      <p className="small muted">Când vremea sau o livrare strică graficul, Autopilotul calculează unul nou din BIM. Nimic nu se schimbă până nu aprobi.</p>
      <Err msg={msg} />
      {open.length === 0 && <Empty>Nicio propunere acum. Graficele sunt în regulă cu prognoza și livrările.</Empty>}
      <div className="stack grid2">{open.map((r: any) => { const d = r.data, im = d.impact; return (
        <Card key={r.id}>
          <div className="row between"><Auto>propus {when(r.ts)}</Auto><Src>Meteo × BIM</Src></div>
          <strong className="big">{d.site}</strong>
          <p>{d.summary}</p>
          <span className="label">De ce</span>
          <ul>{d.reasons.map((x: string, i: number) => <li key={i}>{x.charAt(0).toUpperCase() + x.slice(1)}</li>)}</ul>
          <span className="label">Ce se mută</span>
          <ul className="moves">{d.moves.map((m: any) => (
            <li key={m.zone}><strong>{m.zone}</strong><span className="small muted">{m.activity} · {m.count} elemente</span>
              <div className="mv"><span>{range(m.fromFirst, m.fromLast)}</span><span aria-hidden="true">→</span><b>{range(m.toFirst, m.toLast)}</b><em>+{m.shift} {m.shift === 1 ? "zi" : "zile"}</em></div></li>))}</ul>
          <div className="kpis"><div><b>{im.elements}</b><span>elemente redatate</span></div><div><b>{im.finishShift > 0 ? "+" + im.finishShift + " zile" : "neschimbat"}</b><span>ultima lucrare ({dayShort(im.lastNew)})</span></div><div><b>{im.floatNew} zile</b><span>rezervă până la termen</span></div></div>
          {im.idle && <p className="small">Utilaj în așteptare: {im.idle.name}, {im.idle.days} {im.idle.days === 1 ? "zi" : "zile"}, circa {lei(im.idle.cost)}.</p>}
          {d.alternatives?.length > 0 && <><span className="label">Ce se poate lucra în zilele pierdute</span><ul>{d.alternatives.map((a: any, i: number) => <li key={i}>{dayShort(a.day)}: {a.text}</li>)}</ul></>}
          <div className="row two"><Btn kind="ghost" onClick={() => decide(r.id, "reject")}>Respinge</Btn><Btn onClick={() => decide(r.id, "accept")}>Aplică în grafic</Btn></div>
        </Card>); })}</div>
      {done.length > 0 && <><H>Rezolvate</H><ul className="plain">{done.map((r: any) => <li key={r.id}><div className="row between"><strong>{r.data.site}</strong><span className={"pill " + (r.status === "accepted" ? "s-ok" : "s-none")}>{r.status === "accepted" ? "Aplicat" : "Respins"}</span></div><span className="small muted">{r.data.impact.elements} elemente · {r.decided_by}, {when(r.decided_at)}</span></li>)}</ul></>}
    </Page>
  );
}

export function Valoare() {
  const { data, err, setData } = useLoad<any>("/value");
  const [form, setForm] = useState<any>(null), [msg, setMsg] = useState("");
  if (!data) return <Page title="Valoare" back="#/">{err ? <Err msg={err} /> : <Loading />}</Page>;
  const f = form || data.params;
  const save = async () => { try { setData(await post("/value", f)); setForm(null); setMsg("Ipoteze salvate; sumele au fost recalculate."); } catch (e: any) { setMsg(e.message); } };
  return (
    <Page title="Valoare" eyebrow="Ce a adus Autopilotul, în lei" back="#/">
      <div className="apstats two">
        <div><b>{lei(data.realized)}</b><span>realizat: ai acționat pe propunere</span></div>
        <div><b>{lei(data.potential)}</b><span>potențial: așteaptă decizia ta</span></div>
      </div>
      <p className="small muted">Estimări calculate din datele aplicației cu ipotezele de mai jos. Sunt ordine de mărime pentru discuție, nu cifre contabile.</p>
      <div className="stack grid2">{data.cats.map((c: any) => (
        <Card key={c.key}>
          <div className="row between"><strong className="big">{c.label}</strong><b className="amount">{lei(c.realized + c.potential)}</b></div>
          {c.items.length === 0 && <Empty>Nimic de numărat aici deocamdată.</Empty>}
          <ul className="moves">{c.items.map((i: any, k: number) => (
            <li key={k}><div className="row between"><span className={"pill " + (i.realized ? "s-ok" : "s-none")}>{i.realized ? "Realizat" : "Potențial"}</span><b>{lei(i.amount)}</b></div>
              <span>{i.site ? i.site + ": " : ""}{i.text}.</span><span className="small muted">Calcul: {i.formula}</span></li>))}</ul>
        </Card>))}</div>
      <H>Ipoteze</H>
      <Card>
        <p className="small muted">Valorile implicite sunt presupuneri. Înlocuiește-le cu cifrele firmei și totul se recalculează.</p>
        {data.fields.map((fd: any) => <label key={fd.key} htmlFor={"vp" + fd.key}>{fd.label} ({fd.unit})<input id={"vp" + fd.key} type="number" min={0} inputMode="decimal" value={f[fd.key]} onChange={(e) => setForm({ ...f, [fd.key]: e.target.value })} /></label>)}
        {msg && <p className="small muted" role="status">{msg}</p>}
        <Btn onClick={save}>Salvează ipotezele</Btn>
      </Card>
    </Page>
  );
}
