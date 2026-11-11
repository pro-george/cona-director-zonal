import { useState } from "react";
import { post, useLoad, lei, mil, dayShort, when } from "./api";
import { Card, H, Src, Auto, Btn, Err, Loading, Empty, Icon, I } from "./ui";
import { Sheet } from "./Edit";

const nf = (n: number) => (Math.round(n * 100) / 100).toLocaleString("ro-RO");

// Același ecran pentru director (vede și comandă) și pentru gestionar (ține stocul și confirmă).
export function Stocuri({ me, logout }: { me: any; logout?: () => void }) {
  const { data, err, reload } = useLoad<any>("/stock");
  const [tab, setTab] = useState("stoc"), [sheet, setSheet] = useState<any>(null), [msg, setMsg] = useState(""), [openLoc, setOpenLoc] = useState<number | null>(null), [onlyLow, setOnlyLow] = useState(false);
  const gest = me.user.role === "gestionar";
  const head = (
    <header className="bar">{logout ? <span className="iconbtn" aria-hidden="true"><Icon d={I.sites} /></span> : null}
      <div className="bar-t"><span className="eyebrow">{gest ? me.user.name + " · gestiune" : "Fabrici, stație de betoane, depozit"}</span><h1>Stocuri</h1></div>
      {logout && <button className="link" onClick={logout}>Schimbă contul</button>}</header>
  );
  if (!data) return <div className="page">{head}<div className="content">{err ? <Err msg={err} /> : <Loading />}</div></div>;
  const act = async (path: string, body: any = {}) => { try { await post(path, body); setMsg(""); await reload(); } catch (e: any) { setMsg(e.message); } };
  const locOpts = data.locations.map((l: any) => [String(l.id), l.name] as [string, string]);
  const supOpts = [["", "Fără furnizor"], ...data.suppliers.map((s: any) => [String(s.id), s.name])] as [string, string][];
  const siteOpts = data.sites.map((s: any) => [s.id, s.name] as [string, string]);
  const all = data.locations.flatMap((l: any) => l.items);
  const itemOpts = all.map((i: any) => [String(i.id), `${i.name} · ${i.loc}`] as [string, string]);
  const save = (path: string, extra: any = {}) => async (v: any) => { await post(path, { ...v, ...extra }); await reload(); };

  const locForm = (l?: any) => setSheet({ title: l ? "Locație" : "Fabrică sau depozit nou", fields: [{ key: "name", label: "Nume" }, { key: "kind", label: "Tip", type: "select", options: Object.entries(data.kinds) }, { key: "place", label: "Localitate" }], initial: l || { kind: "depozit" }, onSave: save("/stock/locations", { id: l?.id }), onDelete: l ? async () => { await post(`/stock/locations/${l.id}/delete`); await reload(); } : undefined });
  const itemForm = (i?: any, loc?: number) => setSheet({ title: i ? "Articol" : "Articol nou", fields: [{ key: "name", label: "Denumire" }, { key: "loc_id", label: "Unde se ține", type: "select", options: locOpts }, { key: "unit", label: "Unitate", placeholder: "buc, t, mp, l" }, ...(i ? [] : [{ key: "qty", label: "Cantitate în stoc acum", type: "number" }]), { key: "min_qty", label: "Stoc minim", type: "number", hint: "Sub acest prag primești alertă și Autopilotul pregătește comanda." }, { key: "cost", label: "Cost pe unitate (lei)", type: "number" }, { key: "supplier_id", label: "Furnizor", type: "select", options: supOpts }],
    initial: i ? { ...i, loc_id: String(i.loc_id), supplier_id: i.supplier_id ? String(i.supplier_id) : "" } : { loc_id: String(loc || locOpts[0]?.[0] || ""), unit: "buc", supplier_id: "" }, onSave: save("/stock/items", { id: i?.id }), onDelete: i ? async () => { await post(`/stock/items/${i.id}/delete`); await reload(); } : undefined });
  const moveForm = (i: any, kind: string) => setSheet({ title: (kind === "intrare" ? "Intrare: " : kind === "iesire" ? "Ieșire: " : "Inventar: ") + i.name, note: kind === "inventar" ? `Scrie cantitatea numărată. Stocul scriptic este ${nf(i.qty)} ${i.unit}; diferența se trece ca mișcare de inventar.` : `În stoc: ${nf(i.qty)} ${i.unit}, din care libere ${nf(i.free)}.`, fields: [{ key: "qty", label: kind === "inventar" ? `Cantitate numărată (${i.unit})` : `Cantitate (${i.unit})`, type: "number" }, { key: "note", label: "Notă", placeholder: kind === "intrare" ? "Ex.: producție schimbul 1, aviz nr." : "" }], initial: {}, saveLabel: kind === "intrare" ? "Trece intrarea" : kind === "iesire" ? "Trece ieșirea" : "Salvează inventarul", onSave: save(`/stock/items/${i.id}/move`, { kind }) });
  const orderForm = (i?: any, kind = "intern") => setSheet({ title: kind === "intern" ? "Comandă pentru șantier" : "Comandă la furnizor", note: i ? `${i.name} · ${i.loc}. Libere acum: ${nf(i.free)} ${i.unit}${i.incoming ? `, pe drum ${nf(i.incoming)}` : ""}.` : undefined,
    fields: [...(i ? [] : [{ key: "item_id", label: "Articol", type: "select", options: itemOpts }]), { key: "qty", label: "Cantitate" + (i ? ` (${i.unit})` : ""), type: "number" }, kind === "intern" ? { key: "site_id", label: "Pentru șantierul", type: "select", options: siteOpts } : { key: "supplier_id", label: "Furnizor", type: "select", options: supOpts.slice(1) }, { key: "need_by", label: kind === "intern" ? "Necesar pe șantier la data" : "Livrare cerută la data", type: "date" }, { key: "note", label: "Notă" }],
    initial: { item_id: itemOpts[0]?.[0], site_id: siteOpts[0]?.[0], supplier_id: i?.supplier_id ? String(i.supplier_id) : supOpts[1]?.[0] || "" }, saveLabel: "Plasează comanda", onSave: save("/stock/orders", { kind, item_id: i?.id }) });
  const supForm = (s?: any) => setSheet({ title: s ? "Furnizor" : "Furnizor nou", fields: [{ key: "name", label: "Firmă" }, { key: "what", label: "Ce livrează" }, { key: "contact", label: "Persoană de contact" }, { key: "phone", label: "Telefon" }, { key: "email", label: "E-mail" }, { key: "lead_days", label: "Termen de livrare (zile)", type: "number" }], initial: s || {}, onSave: save("/stock/suppliers", { id: s?.id }), onDelete: s ? async () => { await post(`/stock/suppliers/${s.id}/delete`); await reload(); } : undefined });
  const itemMenu = (i: any) => setSheet({ menu: i });

  const st = data.stats, openOrders = data.orders.filter((o: any) => o.open), closed = data.orders.filter((o: any) => !o.open).slice(0, 12);
  return (
    <div className="page">{head}
      <div className="content">
        <Err msg={msg} />
        <div className="tiles four">
          <button className={"tile" + (onlyLow ? " on" : "")} onClick={() => { setTab("stoc"); setOnlyLow(!onlyLow); }}><b className={st.low ? "t-crit" : ""}>{st.low}</b><span>sub minim</span></button>
          <button className="tile" onClick={() => setTab("comenzi")}><b>{st.open}</b><span>comenzi deschise</span></button>
          <button className="tile" onClick={() => setTab("comenzi")}><b>{st.toConfirm + st.proposed}</b><span>de decis</span></button>
          <div className="tile"><b className="sm">{mil(st.value).replace(" lei", "")}</b><span>lei în stoc</span></div>
        </div>
        <div className="segctl four" role="tablist">{[["stoc", "Stoc"], ["comenzi", "Comenzi"], ["furnizori", "Furnizori"], ["miscari", "Mișcări"]].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>

        {tab === "stoc" && <>
          {data.locations.length === 0 && <Card><p className="headline">Începe cu prima locație</p><p className="muted">Adaugă o fabrică, stația de betoane sau depozitul, apoi articolele ținute acolo.</p><Btn onClick={() => locForm()}>Adaugă o locație</Btn></Card>}
          {data.locations.map((l: any) => { const list = onlyLow ? l.items.filter((i: any) => i.level !== "ok") : l.items, open = openLoc === l.id || onlyLow || data.locations.length === 1;
            if (onlyLow && !list.length) return null;
            return <Card key={l.id} className="loc">
              <button className="lochead" aria-expanded={open} onClick={() => setOpenLoc(open ? null : l.id)}>
                <div><strong className="big">{l.name}</strong><span className="small muted">{l.kindLabel} · {l.items.length} articole · {mil(l.value)}</span></div>
                {l.low > 0 ? <span className="pill s-critic">{l.low} sub minim</span> : <span className="pill s-ok">În regulă</span>}
              </button>
              {!open && l.items.length > 0 && <div className="lv-strip" aria-hidden="true">{l.items.map((i: any) => <i key={i.id} className={"lv-" + i.level} />)}</div>}
              {open && <>
                <ul className="plain stock">{list.map((i: any) => { const cap = Math.max(i.qty, i.min_qty * 2, 1);
                  return <li key={i.id} className="tap" onClick={() => itemMenu(i)}>
                    <div className="row between"><strong>{i.name}</strong><b className={i.level === "crit" ? "t-crit" : ""}>{nf(i.free)} <span className="unit">{i.unit}</span></b></div>
                    <div className="lvbar" aria-hidden="true"><i className={"lv-" + i.level} style={{ width: Math.min(100, (Math.max(0, i.free) / cap) * 100) + "%" }} />{i.reserved > 0 && <i className="lv-res" style={{ width: Math.min(100, (i.reserved / cap) * 100) + "%" }} />}{i.min_qty > 0 && <u style={{ left: Math.min(100, (i.min_qty / cap) * 100) + "%" }} />}</div>
                    <span className="small muted">libere{i.reserved ? ` · ${nf(i.reserved)} rezervate` : ""}{i.incoming ? ` · ${nf(i.incoming)} pe drum` : ""}{i.min_qty ? ` · minim ${nf(i.min_qty)}` : ""}</span>
                  </li>; })}</ul>
                <div className="row"><button className="link" onClick={() => itemForm(undefined, l.id)}>Adaugă articol</button><button className="link" onClick={() => locForm(l)}>Modifică locația</button></div>
              </>}
            </Card>; })}
          {data.locations.length > 0 && <div className="row two"><Btn kind="ghost" onClick={() => locForm()}>Locație nouă</Btn><Btn onClick={() => orderForm()}>Comandă</Btn></div>}
          <p className="small muted">Liniuța de pe bară este stocul minim. Partea mai deschisă este marfă rezervată pentru comenzi confirmate. <Src>gestiune simulată</Src></p>
        </>}

        {tab === "comenzi" && <>
          <div className="row two"><Btn kind="ghost" onClick={() => orderForm(undefined, "furnizor")}>La furnizor</Btn><Btn onClick={() => orderForm()}>Pentru șantier</Btn></div>
          <H>Deschise</H>
          {openOrders.length ? <div className="stack">{openOrders.map((o: any) => (
            <Card key={o.id} className={o.late ? "over" : ""}>
              <div className="row between"><strong className="big">{nf(o.qty)} {o.unit} · {o.item}</strong>{o.status === "propusa" ? <Auto>Autopilot</Auto> : <span className={"pill " + (o.status === "ceruta" ? "s-atentie" : "s-ok")}>{o.label}</span>}</div>
              <span className="small muted">{o.kind === "intern" ? `${o.loc} → ${o.site || "șantier șters"}` : `${o.supplier || "furnizor"} → ${o.loc}`}{o.need_by ? ` · necesar ${dayShort(o.need_by)}` : ""}{o.late ? " · termen depășit" : ""}</span>
              <span className="small muted">{o.by ? "Cerută de " + o.by : ""}{o.note ? " · " + o.note : ""}</span>
              <div className="row two">
                <Btn kind="ghost" onClick={() => act(`/stock/orders/${o.id}`, { action: "cancel" })}>Anulează</Btn>
                {o.kind === "intern" && o.status === "ceruta" && <Btn onClick={() => act(`/stock/orders/${o.id}`, { action: "confirm" })}>Confirmă</Btn>}
                {o.kind === "intern" && o.status === "confirmata" && <Btn onClick={() => act(`/stock/orders/${o.id}`, { action: "deliver" })}>Livrată</Btn>}
                {o.kind === "furnizor" && o.status === "propusa" && <Btn onClick={() => act(`/stock/orders/${o.id}`, { action: "send" })}>Trimite</Btn>}
                {o.kind === "furnizor" && o.status === "trimisa" && <Btn onClick={() => act(`/stock/orders/${o.id}`, { action: "receive" })}>Recepționează</Btn>}
              </div>
            </Card>))}</div> : <Empty>Nicio comandă deschisă.</Empty>}
          {closed.length > 0 && <><H>Închise</H><ul className="plain">{closed.map((o: any) => <li key={o.id}><div className="row between"><strong>{nf(o.qty)} {o.unit} · {o.item}</strong><span className={"pill " + (o.status === "livrata" ? "s-ok" : "s-none")}>{o.label}</span></div><span className="small muted">{o.kind === "intern" ? o.site || "șantier" : o.supplier || "furnizor"}{o.decided_by ? " · " + o.decided_by : ""}{o.decided_at ? ", " + when(o.decided_at) : ""}</span></li>)}</ul></>}
        </>}

        {tab === "furnizori" && <>
          <H right={<button className="link" onClick={() => supForm()}>Adaugă</button>}>Furnizori</H>
          {data.suppliers.length ? <ul className="plain">{data.suppliers.map((s: any) => <li key={s.id} className="tap" onClick={() => supForm(s)}>
            <div className="row between"><strong>{s.name}</strong>{s.open > 0 && <span className="pill s-atentie">{s.open} {s.open === 1 ? "comandă" : "comenzi"}</span>}</div>
            <span className="small muted">{s.what || "Fără descriere"}{s.lead_days ? ` · livrează în ${s.lead_days} zile` : ""} · {s.items} articole</span>
            {(s.contact || s.phone) && <span className="small muted">{[s.contact, s.phone, s.email].filter(Boolean).join(" · ")}</span>}</li>)}</ul> : <Empty>Niciun furnizor. Adaugă-i ca Autopilotul să poată pregăti comenzile de completare.</Empty>}
        </>}

        {tab === "miscari" && <>
          <H right={<span className="muted small">ultimele 40</span>}>Intrări și ieșiri</H>
          {data.moves.length ? <ul className="plain">{data.moves.map((m: any) => <li key={m.id}><div className="row between"><strong>{m.item}</strong><b className={m.qty < 0 ? "" : "rs-ok"}>{m.qty > 0 ? "+" : "−"}{nf(Math.abs(m.qty))} {m.unit}</b></div><span className="small muted">{m.reason} · {m.loc} · rămas {nf(m.after)}{m.by ? " · " + m.by : ""}, {when(m.ts)}</span></li>)}</ul> : <Empty>Nicio mișcare încă.</Empty>}
        </>}
      </div>
      {sheet?.menu && (() => { const i = sheet.menu; return (
        <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && setSheet(null)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label={i.name}>
            <div className="sheet-head"><h2>{i.name}</h2><button type="button" className="iconbtn" onClick={() => setSheet(null)} aria-label="Închide"><Icon d={I.close} size={18} /></button></div>
            <p className="small muted">{i.loc} · {nf(i.qty)} {i.unit} în stoc, {nf(i.free)} libere{i.supplier ? " · furnizor " + i.supplier : ""} · {lei(i.value)}</p>
            <div className="stack tight">
              <Btn onClick={() => orderForm(i)}>Comandă pentru șantier</Btn>
              <Btn kind="ghost" onClick={() => orderForm(i, "furnizor")}>Comandă la furnizor</Btn>
              <div className="row three"><Btn kind="ghost" onClick={() => moveForm(i, "intrare")}>Intrare</Btn><Btn kind="ghost" onClick={() => moveForm(i, "iesire")}>Ieșire</Btn><Btn kind="ghost" onClick={() => moveForm(i, "inventar")}>Inventar</Btn></div>
              <button className="link" onClick={() => itemForm(i)}>Modifică articolul</button>
            </div>
          </div>
        </div>); })()}
      {sheet && !sheet.menu && <Sheet {...sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}
