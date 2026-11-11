import { useCallback, useEffect, useRef, useState } from "react";
// @ts-ignore: modul JavaScript
import { handle } from "./core/handlers.js";

// Nu există server: cererile sunt rezolvate local de core/handlers.js, cu aceeași formă ca un API real.
export async function api(path: string, opts: RequestInit = {}) {
  const method = (opts.method || "GET").toUpperCase();
  const body = opts.body instanceof FormData ? opts.body : opts.body ? JSON.parse(String(opts.body)) : undefined;
  try { return await handle(method, path, body); }
  catch (e: any) {
    if (e?.status === 401 && path !== "/login") window.dispatchEvent(new Event("auth-lost"));
    if (!e?.status) console.error(e);
    throw new Error(e?.status ? e.message : "Ceva nu a mers. Încearcă din nou.");
  }
}
export const post = (path: string, body: any = {}) => api(path, { method: "POST", body: JSON.stringify(body) });

export function useLoad<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState("");
  const reload = useCallback(() => { if (!path) return Promise.resolve(); return api(path).then((d) => { setData(d); setErr(""); }).catch((e) => setErr(e.message)); }, [path]);
  useEffect(() => { setData(null); reload(); }, [reload]);
  return { data, err, reload, setData };
}

const nf = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 });
export const lei = (n: number) => nf.format(Math.round(n || 0)) + " lei";
export const mil = (n: number) => (Math.abs(n) >= 1e6 ? (n / 1e6).toLocaleString("ro-RO", { maximumFractionDigits: 2 }) + " mil. lei" : lei(n));
export const pct = (x: number) => Math.round((x || 0) * 100) + "%";
export const dayLong = (d: string) => new Intl.DateTimeFormat("ro-RO", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(d + "T12:00:00Z"));
export const dayShort = (d: string) => new Intl.DateTimeFormat("ro-RO", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(d + "T12:00:00Z"));
export const time = (ts: number) => new Intl.DateTimeFormat("ro-RO", { timeZone: "Europe/Bucharest", hour: "2-digit", minute: "2-digit" }).format(new Date(ts));
export const when = (ts: number) => { const d = new Date(ts), t = new Date(); return (d.toDateString() === t.toDateString() ? "azi" : new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "short" }).format(d)) + ", " + time(ts); };
export const mins = (m: number) => (m >= 60 ? Math.floor(m / 60) + " h " + (m % 60 ? (m % 60) + " min" : "") : m + " min").trim();

// Dictare în browser (Web Speech API): merge în Chrome și Safari; unde lipsește, butonul nu apare.
export function useDictation(onText: (t: string) => void) {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const rec = useRef<any>(null);
  const [on, setOn] = useState(false);
  const [partial, setPartial] = useState("");
  const cb = useRef(onText); cb.current = onText;
  const toggle = () => {
    if (!SR) return;
    if (on) { rec.current?.stop(); return; }
    const r = new SR(); r.lang = "ro-RO"; r.continuous = true; r.interimResults = true;
    r.onresult = (e: any) => { let interim = ""; for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) cb.current(t.trim()); else interim += t; } setPartial(interim); };
    r.onend = () => { setOn(false); setPartial(""); };
    r.onerror = () => { setOn(false); setPartial(""); };
    rec.current = r; try { r.start(); setOn(true); } catch { setOn(false); }
  };
  useEffect(() => () => rec.current?.abort?.(), []);
  return { supported: !!SR, on, partial, toggle };
}
