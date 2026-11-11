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
- **Import de proiect**: bugetul și graficul din Excel sau CSV, într-un proiect nou sau într-unul existent, fără format fix; coloanele se potrivesc după denumire și pot fi corectate înainte de import.
- **Valoare**: ce a adus Autopilotul, în lei, pe patru categorii (zile de șantier, încasări, utilaje, timp), cu formula fiecărei sume și ipoteze editabile (`web/src/core/value.js`).
- **Asistent vocal**: briefingul citit cu voce și comenzi spuse sau scrise (aprobă, respinge, aplică graficul, notează o sarcină, întrebări despre un șantier sau vreme). Aprobările și graficele cer confirmare. Regulile sunt în `web/src/core/commands.js`.
- **Data reală de predare**: din ritmul de montaj al ultimelor 14 zile, când se termină de fapt proiectul, față de grafic și de termenul contractual, cu un grafic planificat / realizat / estimat (`forecast` în `web/src/core/connectors/bim.js`).
- **Dosar de întârzieri**: fiecare zi pierdută, cu cauza (beneficiar, vreme, furnizor, intern) și dovezile ei, adunate automat din rapoarte, livrări și meteo; termen de notificare cu avertizări; dosarul complet generat la cerere (`web/src/core/delays.js`).
- **Stocuri**: fabrici, stație de betoane și depozit; stoc liber, rezervat și pe drum, intrări, ieșiri și inventar, comenzi interne către șantiere, comenzi la furnizori, furnizori. Autopilotul pregătește comanda când un articol scade sub minim. Cont separat de gestionar (`web/src/core/stock.js`).
- **Resurse**: utilaje care stau (cost pe zi, propunere de mutare sau eliberare), oameni pe șantiere din rapoarte, prezența subcontractorilor completată din rapoarte (`web/src/core/resources.js`).
- **Prognoză de cash**: intrări și ieșiri pe 8 săptămâni din situațiile neîncasate, sumele angajate, cererile în așteptare și chiriile de utilaje (`web/src/core/cash.js`).
- **Raport către beneficiar**: ciornă săptămânală pe proiect, doar cu ce îl privește pe beneficiar (`web/src/core/clientreport.js`).
- **Aprobări**: cererile din ERP, fiecare cu recomandare calculată față de bugetul rămas.
- **Autopilot**: automatizările (pornit/oprit, rulare la cerere), documentele pregătite și jurnalul de acțiuni.
- **Mai mult**: minute de ședință din dictare, sarcini, raportul către conducere, întrebări libere.
- **Șef de șantier** (alt cont): raport zilnic cu vocea și poze, sarcinile șantierului, mesajele primite.

Automatizările și orarul lor sunt definite în `web/src/core/automations.js`.

## Lucrul cu date proprii

- **Adăugare și modificare peste tot.** Butonul „Adaugă” (proiect, proiect din Excel, raport, sarcină, cerere de aprobare, ședință, om în echipă) e pe orice ecran. În fișa unui proiect se editează proiectul, liniile de buget, situațiile de lucrări, zonele și stadiul lor, livrările, utilajele și sarcinile; orice rând se atinge ca să fie modificat sau șters.
- **Date proprii în loc de demo.** Din „Mai mult → Datele aplicației → Începe cu proiectele tale”: datele demonstrative se șterg și aplicația rămâne goală, pe numele tău. Din acel moment actualizările aplicației nu mai ating datele.
- **Copie de siguranță.** Același ecran descarcă întreaga bază de date ca fișier `.db` și o restaurează. Așa se mută datele și pe alt dispozitiv.

## Echipă fără server: date trimise prin link

- Din fișa proiectului, directorul îi trimite șefului de șantier o **invitație** ca link. Deschisă pe telefonul șefului, pregătește aplicația pentru acel proiect.
- Șeful scrie sau dictează raportul zilnic și cererile de aprobare, apoi apasă „Trimite directorului”: se generează un link pe care îl trimite pe WhatsApp, e-mail sau SMS.
- Directorul deschide linkul pe telefonul lui, vede ce conține și apasă „Adaugă în aplicație”. Autopilotul procesează raportul ca pe oricare altul. Un link deschis de două ori nu se adaugă de două ori.
- Datele sunt chiar în link (codate în adresă), nu pe un server. Pozele nu încap în link, deci rămân pe telefonul șefului.

Logica este în `web/src/core/share.js`.

## Limitele variantei fără server

| Subiect | Cum stau lucrurile |
|---|---|
| Date | Rămân pe dispozitivul pe care e deschisă aplicația. Două telefoane nu văd aceleași date; se pot muta doar cu o copie de siguranță. Ștergerea datelor browserului le pierde. |
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
