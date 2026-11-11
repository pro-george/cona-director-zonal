import { createRoot } from "react-dom/client";
import App from "./App";
import "./theme.css";
import "./styles.css";

const t0 = performance.now();
createRoot(document.getElementById("root")!).render(<App />);
// sigla rămâne cel puțin 1,5 s, apoi se stinge lin
const hideSplash = () => { const el = document.getElementById("splash"); if (!el) return; setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 700); }, Math.max(0, 1500 - (performance.now() - t0))); };
const waitApp = () => (document.querySelector("#root .navrow, #root .hero, #root main") ? hideSplash() : setTimeout(waitApp, 60));
waitApp(); setTimeout(hideSplash, 6000);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
