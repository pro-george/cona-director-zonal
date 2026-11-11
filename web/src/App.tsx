import { useEffect, useState } from "react";
import { api, post, useLoad } from "./api";
import { Icon, I, Err, Btn } from "./ui";
import { Azi, Alerte, Santiere, Santier } from "./Director";
import { Aprobari, Autopilot } from "./Work";
import { MaiMult, Sedinte, Sarcini, Conducere, Intreaba, RaportNou, SefHome } from "./More";

function useRoute() {
  const read = () => (location.hash.replace(/^#\/?/, "") || "").split("/");
  const [r, setR] = useState(read);
  useEffect(() => { const f = () => { setR(read()); document.querySelector("main")?.scrollTo(0, 0); }; window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); }, []);
  return r;
}

function Login({ onDone }: { onDone: () => void }) {
  const { data, err } = useLoad<any>("/users");
  const enter = async (id: number) => { await post("/login", { user_id: id }); onDone(); };
  return (
    <div className="login">
      <div className="login-top"><Brand /><h1>Director zonal</h1><p>Șantierele, banii și deciziile zilei, pregătite de Autopilot.</p></div>
      <div className="content">
        <span className="label">Intră ca</span>
        <Err msg={err} />
        <div className="stack tight">{(data?.users || []).map((u: any) => (
          <button key={u.id} className="navrow" onClick={() => enter(u.id)}><div><strong>{u.name}</strong><span className="small muted">{u.role === "director" ? "Director zonal" : "Șef de șantier · " + u.site}</span></div><Icon d={I.chev} size={18} /></button>))}</div>
        <p className="muted small">Versiune demonstrativă: datele sunt fictive și se păstrează doar pe acest dispozitiv. Conturile nu au parolă.</p>
      </div>
    </div>
  );
}

export function Brand() {
  const [ok, setOk] = useState(true);
  return ok ? <img className="logo" src="./brand/logo.svg" alt="" onError={() => setOk(false)} /> : <span className="logo-fallback" aria-hidden="true" />;
}

export default function App() {
  const me = useLoad<any>("/me");
  const route = useRoute();
  const [badge, setBadge] = useState(0), [lost, setLost] = useState(0);
  useEffect(() => { const f = () => setLost((n) => n + 1); window.addEventListener("auth-lost", f); return () => window.removeEventListener("auth-lost", f); }, []);
  const user = me.data?.user;
  useEffect(() => { if (user?.role === "director") api("/approvals").then((d) => setBadge(d.items.filter((a: any) => a.status === "pending").length)).catch(() => {}); }, [user?.id, route.join("/")]);

  if (!user) return me.err || lost ? <Login onDone={() => { setLost(0); me.reload(); }} /> : <div className="splash"><p>Se pregătește aplicația…</p></div>;
  const logout = async () => { await post("/logout"); location.hash = ""; me.setData(null as any); setLost((n) => n + 1); };

  if (user.role !== "director") return <SefHome me={me.data} route={route} logout={logout} />;

  const [page, arg] = route;
  const tab = ["santiere", "santier"].includes(page) ? "santiere" : ["aprobari"].includes(page) ? "aprobari" : page === "autopilot" ? "autopilot" : ["mai-mult", "sedinte", "sarcini", "conducere", "intreaba", "raport"].includes(page) ? "mai-mult" : "azi";
  let screen;
  switch (page) {
    case "alerte": screen = <Alerte />; break;
    case "santiere": screen = <Santiere />; break;
    case "santier": screen = <Santier id={arg} />; break;
    case "aprobari": screen = <Aprobari />; break;
    case "autopilot": screen = <Autopilot />; break;
    case "mai-mult": screen = <MaiMult me={me.data} logout={logout} />; break;
    case "sedinte": screen = <Sedinte me={me.data} />; break;
    case "sarcini": screen = <Sarcini me={me.data} />; break;
    case "conducere": screen = <Conducere />; break;
    case "intreaba": screen = <Intreaba q={arg ? decodeURIComponent(arg) : ""} />; break;
    case "raport": screen = <RaportNou me={me.data} back="#/mai-mult" />; break;
    default: screen = <Azi me={me.data} logout={logout} />;
  }
  const T = ({ id, href, icon, label, n }: any) => (
    <a href={href} aria-current={tab === id ? "page" : undefined}><span className="ti"><Icon d={icon} />{n > 0 && <b className="badge">{n}</b>}</span>{label}</a>
  );
  return (
    <>
      <main>{screen}</main>
      <nav className="tabs" aria-label="Secțiuni">
        <T id="azi" href="#/" icon={I.home} label="Azi" />
        <T id="santiere" href="#/santiere" icon={I.sites} label="Șantiere" />
        <T id="aprobari" href="#/aprobari" icon={I.check} label="Aprobări" n={badge} />
        <T id="autopilot" href="#/autopilot" icon={I.bolt} label="Autopilot" />
        <T id="mai-mult" href="#/mai-mult" icon={I.more} label="Mai mult" />
      </nav>
    </>
  );
}
