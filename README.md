# Director zonal

Aplicație de telefon (PWA) pentru directorul zonal al unui antreprenor general: starea șantierelor, banii, aprobările,
stadiul fizic, meteo și ședințele, cu un **Autopilot** care face singur munca repetitivă și ține un jurnal cu ce a făcut.

Este un prototip de prezentare. Șantierele, firmele și cifrele sunt fictive; ERP-ul și BIM-ul sunt simulate.

## Cum rulează

Aplicația este **complet statică**: nu are server. Baza de date (SQLite în WebAssembly), automatizările și conectorii
rulează în browser, iar datele se salvează pe dispozitiv (IndexedDB). De aceea poate fi găzduită gratuit pe GitHub Pages.

```bash
npm install
npm run dev      # dezvoltare, http://localhost:5173
npm run build    # scrie site-ul în docs/
```

Publicare: GitHub Pages servește folderul `docs/` din ramura `main` (Settings → Pages → Deploy from a branch → `main` / `docs`).
După orice modificare: `npm run build`, commit, push.

## Ce face

- **Azi**: briefingul zilei, ce te așteaptă (aprobări, documente pregătite, sarcini), alertele din toate sistemele, șantierele.
- **Șantiere**: rezumat, bani (ERP), stadiu fizic și livrări (BIM), meteo suprapus peste lucrări, rapoarte.
- **Replanificări**: când vremea sau o livrare strică graficul, un grafic nou calculat din BIM, cu impactul pe termen și pe cost; se aplică doar după aprobare.
- **Import de proiect**: bugetul și graficul din Excel sau CSV, fără format fix; coloanele se potrivesc după denumire și pot fi corectate înainte de import.
- **Aprobări**: cererile din ERP, fiecare cu recomandare calculată față de bugetul rămas.
- **Autopilot**: automatizările (pornit/oprit, rulare la cerere), documentele pregătite și jurnalul de acțiuni.
- **Mai mult**: minute de ședință din dictare, sarcini, raportul către conducere, întrebări libere.
- **Șef de șantier** (alt cont): raport zilnic cu vocea și poze, sarcinile șantierului, mesajele primite.

Automatizările și orarul lor sunt definite în `web/src/core/automations.js`.

## Limitele variantei fără server

| Subiect | Cum stau lucrurile |
|---|---|
| Date | Rămân pe dispozitivul pe care e deschisă aplicația. Două telefoane nu văd aceleași date. |
| Conturi | Se alege un cont de pe ecranul de intrare; nu există parole. Oricine are linkul poate intra. |
| Automatizări | Rulează cât timp aplicația e deschisă și recuperează la următoarea deschidere. |
| AI | „Mod demo” (texte compuse din reguli) până când cineva pune o cheie Anthropic în ecranul Autopilot. Cheia rămâne în browserul acelui dispozitiv. |
| Meteo | Prognoză reală Open-Meteo, cerută direct din browser; dacă cererea eșuează, prognoză simulată, marcată în interfață. |
| ERP și BIM | Simulate: `web/src/core/connectors/erp.js` și `bim.js`. |
| E-mailuri și mesaje | Aplicația pregătește textul, omul îl trimite. |

`web/src/core/handlers.js` expune aceleași rute pe care le-ar avea un API real. Când aplicația primește un server
(date comune între telefoane, parole, cheie AI ținută pe server), interfața rămâne neschimbată.

## De știut

- Pragurile meteo pe tip de lucrare (`RULES` în `web/src/core/connectors/weather.js`) sunt orientative.
- Recomandările la aprobări sunt reguli față de bugetul rămas, nu AI: previzibile și ușor de verificat.
- „Timp economisit” este o estimare: fiecare tip de acțiune are un număr fix de minute.
- Dictarea folosește Web Speech API din browser (Chrome, Safari).
- Culorile și fontul sunt în `web/src/theme.css`, citite din stilurile cona.ro; logo-ul (varianta color, pentru fundal deschis) se pune în `web/public/brand/logo.svg`.
