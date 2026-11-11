import { ReactNode, useState } from "react";
import { useDictation } from "./api";

export const STATUS: Record<string, string> = { ok: "În grafic", atentie: "Atenție", critic: "Blocaj", none: "Fără raport" };

export const Icon = ({ d, size = 22 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
export const I = {
  home: "M4 11.5 12 5l8 6.5V20h-5v-5H9v5H4z",
  sites: "M3 20h18M5 20V9l7-4 7 4v11M9 20v-5h6v5",
  check: "M5 12.5l4.5 4.5L19 7.5",
  bolt: "M13 3 5 13.5h6L10 21l9-11.5h-6z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  back: "M15 5l-7 7 7 7",
  chev: "M9 6l6 6-6 6",
  mic: "M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  plus: "M12 5v14M5 12h14",
  send: "M4 12l16-8-6 16-3-7z",
};

export const Pill = ({ s }: { s: string }) => <span className={"pill s-" + (STATUS[s] ? s : "none")}>{STATUS[s] || STATUS.none}</span>;
export const Src = ({ children }: { children: ReactNode }) => <span className="src">{children}</span>;
export const Auto = ({ children = "Autopilot" }: { children?: ReactNode }) => <span className="auto"><Icon d={I.bolt} size={12} />{children}</span>;

export function Page({ title, eyebrow, back, children, right, narrow }: { title: string; eyebrow?: string; back?: string; children: ReactNode; right?: ReactNode; narrow?: boolean }) {
  return (
    <div className={"page" + (narrow ? " narrow" : "")}>
      <header className="bar">
        {back && <a className="iconbtn" href={back} aria-label="Înapoi"><Icon d={I.back} /></a>}
        <div className="bar-t">{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1></div>
        {right}
      </header>
      <div className="content">{children}</div>
    </div>
  );
}
export const Card = ({ children, className = "", ...p }: any) => <div className={"card " + className} {...p}>{children}</div>;
export const H = ({ children, right }: { children: ReactNode; right?: ReactNode }) => <div className="h"><h2>{children}</h2>{right}</div>;
export const Empty = ({ children }: { children: ReactNode }) => <p className="empty">{children}</p>;
export const Err = ({ msg }: { msg: string }) => (msg ? <p className="err" role="alert">{msg}</p> : null);
export const Loading = () => <p className="empty">Se încarcă…</p>;

// Bară cu două straturi: realizat (plin) față de plan (contur).
export function Bar({ value, plan, tone = "brand", label }: { value: number; plan?: number; tone?: string; label?: string }) {
  const w = (x: number) => Math.max(0, Math.min(100, x * 100)) + "%";
  return (
    <div className="bar2" role="img" aria-label={label}>
      <i className={"fill t-" + tone} style={{ width: w(value) }} />
      {plan != null && <i className="plan" style={{ left: w(plan) }} />}
    </div>
  );
}

export function Btn({ children, onClick, kind = "primary", busy, ...p }: any) {
  const [working, setWorking] = useState(false);
  const click = async (e: any) => { if (!onClick) return; setWorking(true); try { await onClick(e); } finally { setWorking(false); } };
  return <button type="button" {...p} className={"btn " + kind} disabled={working || busy || p.disabled} onClick={click}>{working || busy ? "Se lucrează…" : children}</button>;
}

// Câmp de text cu dictare: butonul de microfon apare doar unde browserul o permite.
export function Dictate({ value, onChange, placeholder, rows = 6, id }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; id: string }) {
  const d = useDictation((t) => onChange((value ? value.trimEnd() + " " : "") + t));
  return (
    <div className="dictate">
      {d.supported && (
        <div className="microw">
          <button type="button" className={"mic" + (d.on ? " rec" : "")} onClick={d.toggle} aria-label={d.on ? "Oprește dictarea" : "Dictează"}><Icon d={I.mic} size={28} /></button>
          <span className="muted">{d.on ? d.partial || "Ascult… apasă ca să oprești" : "Apasă și vorbește"}</span>
        </div>
      )}
      <textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function Md({ text }: { text: string }) {
  const out: ReactNode[] = []; let list: ReactNode[] = [];
  const flush = () => { if (list.length) { out.push(<ul key={"u" + out.length}>{list}</ul>); list = []; } };
  const inline = (s: string) => s.split(/\*\*(.+?)\*\*/g).map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : p));
  String(text || "").split(/\r?\n/).forEach((l, i) => {
    let m;
    if ((m = l.match(/^#{1,3}\s+(.*)/))) { flush(); out.push(<h3 key={i}>{m[1]}</h3>); }
    else if ((m = l.match(/^\s*[-*]\s+(.*)/))) list.push(<li key={i}>{inline(m[1])}</li>);
    else if (l.trim()) { flush(); out.push(<p key={i}>{inline(l)}</p>); }
  });
  flush();
  return <div className="md">{out}</div>;
}

export async function copy(text: string) { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } }
