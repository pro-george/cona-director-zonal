// Date demonstrative, toate fictive (directorul apare doar cu prenumele). Datele calendaristice sunt relative la ziua curentă,
// ca demo-ul să arate "viu" oricând e pornit. „Resetează datele demo” din aplicație șterge tot și repopulează.
import { exec, run, one, dayOf, addDays } from "./db.js";

// Datele demo se reîmprospătează singure când se schimbă versiunea lor. Odată ce omul a trecut pe datele lui
// (mode = "own"), aplicația nu mai șterge și nu mai rescrie nimic la actualizări.
const SEED_VERSION = 9;
const TABLES = ["users", "sessions", "sites", "reports", "briefs", "mgmt_reports", "meetings", "tasks", "drafts", "notifications", "automations", "automation_log", "settings", "weather_cache", "replans", "delays", "subs", "sub_log", "stock_locations", "stock_items", "stock_moves", "stock_suppliers", "stock_orders", "erp_equipment", "erp_budget", "erp_receivables", "erp_approvals", "bim_elements", "bim_deliveries"];
const get = (key) => { const r = one("SELECT value FROM settings WHERE key=?", key); return r ? r.value : null; };
export const mode = () => (get("mode") === '"own"' ? "own" : "demo");
export function seedIfEmpty() {
  if (one("SELECT COUNT(*) n FROM users").n === 0) return seed();
  if (mode() === "demo" && Number(get("seed_version")) !== SEED_VERSION) seed();
}
// Pornire cu date proprii: golește tot ce era demo și lasă doar contul directorului, cu numele dat.
export function startOwn(name) {
  for (const t of TABLES) exec(`DELETE FROM ${t}`);
  run("INSERT INTO users(name,email,role,pass,site_id) VALUES(?,?,?,?,?)", String(name || "").trim().slice(0, 60) || "Director zonal", "director@local", "director", "", null);
  run("INSERT INTO settings(key,value) VALUES('mode','\"own\"')"); run("INSERT INTO settings(key,value) VALUES('autoapprove_limit','3000')"); run("INSERT INTO settings(key,value) VALUES('seed_version',?)", String(SEED_VERSION));
}

export function seed() {
  const T = dayOf(), d = (n) => addDays(T, n);
  const at = (n, h, m) => new Date(`${d(n)}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+02:00`).getTime();
  for (const t of TABLES) exec(`DELETE FROM ${t}`);

  const user = (name, email, role, site) => Number(run("INSERT INTO users(name,email,role,pass,site_id) VALUES(?,?,?,?,?)", name, email, role, "", site).lastInsertRowid);
  user("Cristian", "director@demo.local", "director", null);
  const m = { hala: user("Andrei Pop", "sef1@demo.local", "sef", "hala"), fabrica: user("Mihai Rusu", "sef2@demo.local", "sef", "fabrica"), depozit: user("Ioana Dan", "sef3@demo.local", "sef", "depozit"), campus: user("Radu Stan", "sef4@demo.local", "sef", "campus") };

  const site = (id, name, location, client, contract, start, finish, ord, lat, lon) => run("INSERT INTO sites VALUES(?,?,?,?,?,?,?,?,?,?,?)", id, name, location, client, m[id], contract, start, finish, ord, lat, lon);
  site("hala", "Hală logistică 18.000 mp", "Sibiu Vest", "Logistic Park Demo SRL", 21500000, d(-70), d(32), 1, 45.79, 24.12);
  site("fabrica", "Fabrică componente auto", "Sebeș", "Auto Components Demo SRL", 34000000, d(-45), d(210), 2, 45.96, 23.57);
  site("depozit", "Extindere depozit frigorific", "Alba Iulia", "FrigoDemo SA", 9800000, d(-110), d(40), 3, 46.07, 23.57);
  site("campus", "Campus învățământ dual", "Mediaș", "Primăria Demo", 16200000, d(-150), d(180), 4, 46.16, 24.35);

  /* ----- ERP simulat: buget ----- */
  const B = (s, rows) => rows.forEach(([c, b, a, k]) => run("INSERT INTO erp_budget(site_id,category,budget,actual,committed) VALUES(?,?,?,?,?)", s, c, b, a, k));
  B("hala", [["Structură", 3200000, 2100000, 400000], ["Prefabricate", 6400000, 3900000, 1600000], ["Fațade și închideri", 3600000, 200000, 1100000], ["Instalații", 3100000, 100000, 600000], ["Finisaje", 1400000, 0, 0], ["Organizare de șantier", 800000, 520000, 100000]]);
  B("fabrica", [["Structură", 9800000, 3900000, 2200000], ["Prefabricate", 7200000, 1400000, 2600000], ["Fațade și închideri", 4100000, 0, 400000], ["Instalații", 5200000, 300000, 900000], ["Finisaje", 1600000, 0, 0], ["Organizare de șantier", 1100000, 610000, 150000]]);
  B("depozit", [["Structură", 2300000, 2180000, 60000], ["Fațade și închideri", 2100000, 1750000, 520000], ["Instalații", 2600000, 890000, 1100000], ["Finisaje", 700000, 60000, 120000], ["Organizare de șantier", 600000, 410000, 40000]]);
  B("campus", [["Structură", 5400000, 4350000, 500000], ["Fațade și închideri", 2600000, 620000, 700000], ["Instalații", 3300000, 1180000, 900000], ["Finisaje", 1700000, 190000, 100000], ["Organizare de șantier", 900000, 330000, 80000]]);

  /* ----- ERP simulat: situații de lucrări către beneficiar ----- */
  const R = (s, no, title, amount, issued, due, paid) => run("INSERT INTO erp_receivables(site_id,no,title,amount,issued,due,paid_at) VALUES(?,?,?,?,?,?,?)", s, no, title, amount, issued, due, paid);
  R("hala", "SL-01", "Situație de lucrări nr. 1", 2850000, d(-48), d(-18), d(-20)); R("hala", "SL-02", "Situație de lucrări nr. 2", 3400000, d(-20), d(10), null);
  R("fabrica", "SL-01", "Situație de lucrări nr. 1", 4100000, d(-25), d(5), null);
  R("depozit", "SL-03", "Situație de lucrări nr. 3", 1650000, d(-66), d(-36), d(-33)); R("depozit", "SL-04", "Situație de lucrări nr. 4", 480000, d(-36), d(-6), null);
  R("campus", "SL-04", "Situație de lucrări nr. 4", 1240000, d(-53), d(-23), null); R("campus", "SL-05", "Situație de lucrări nr. 5", 910000, d(-18), d(12), null);

  /* ----- ERP simulat: cereri de aprobare ----- */
  const A = (s, type, title, supplier, amount, cat, by, created, status = "pending", note = "") => run("INSERT INTO erp_approvals(site_id,type,title,supplier,amount,category,requested_by,created,status,decided_at,decided_by,note) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", s, type, title, supplier, amount, cat, by, created, status, status === "pending" ? null : at(-3, 16, 0), status === "pending" ? null : "Cristian", note);
  A("fabrica", "comanda", "Oțel beton fasonat – 12 t", "Secția de armături (intern)", 61200, "Structură", "Mihai Rusu", d(0));
  A("depozit", "comanda", "Panouri sandwich suplimentare – fațada nord", "Panel Demo SRL", 96000, "Fațade și închideri", "Ioana Dan", d(-1));
  A("hala", "comanda", "Prelungire închiriere macara 100 t – 5 zile", "Macarale Demo SRL", 42500, "Organizare de șantier", "Andrei Pop", d(0));
  A("campus", "situatie_sub", "Situație subcontractor electrice – octombrie", "Electro Demo SRL", 118400, "Instalații", "Radu Stan", d(-3));
  A("fabrica", "decont", "Decont deplasare șef de șantier", "Mihai Rusu", 640, "Organizare de șantier", "Mihai Rusu", d(-1));
  A("hala", "comanda", "Consumabile sudură", "Tehnic Demo SRL", 2150, "Organizare de șantier", "Andrei Pop", d(0));
  A("campus", "pontaj", "Pontaj suplimentar weekend – 6 oameni", "Echipa proprie", 2880, "Organizare de șantier", "Radu Stan", d(-1));
  A("depozit", "comanda", "Tablă cutată acoperiș – lot 2", "Tablă Demo SRL", 184000, "Fațade și închideri", "Ioana Dan", d(-9), "approved");
  A("hala", "situatie_sub", "Situație subcontractor terasamente – final", "Terra Demo SRL", 212000, "Structură", "Andrei Pop", d(-8), "approved");

  /* ----- BIM simulat: elemente pe zone ----- */
  const E = (s, zone, kind, n, from, to, mounted, delivered = mounted) => {
    for (let i = 0; i < n; i++) {
      const planned = d(Math.round(from + ((to - from) * i) / Math.max(1, n - 1)));
      const status = i < mounted ? "montat" : i < delivered ? "livrat" : "planificat";
      run("INSERT INTO bim_elements(site_id,code,kind,zone,planned,baseline,status,mounted_on) VALUES(?,?,?,?,?,?,?,?)", s, `${kind.slice(0, 2).toUpperCase()}-${zone.replace(/[^A-Z0-9]/gi, "")}-${String(i + 1).padStart(2, "0")}`, kind, zone, planned, planned, status, status === "montat" ? planned : null);
    }
  };
  E("hala", "Axe A–B", "stâlpi și grinzi", 30, -20, -8, 30); E("hala", "Axe C–D", "stâlpi și grinzi", 30, -7, 1, 14, 14); E("hala", "Axe E–F", "stâlpi și grinzi", 30, 2, 12, 0, 6); E("hala", "Axe G–H", "stâlpi și grinzi", 30, 13, 24, 0);
  E("fabrica", "Zona 1", "fundații și radier", 24, -40, -22, 24); E("fabrica", "Zona 2", "fundații și radier", 24, -21, -1, 24); E("fabrica", "Zona 3", "fundații și radier", 24, 3, 15, 0); E("fabrica", "Zona 4", "fundații și radier", 24, 16, 30, 0); E("fabrica", "Structură hală", "stâlpi și grinzi", 24, 31, 60, 0);
  E("depozit", "Fațada est", "panouri sandwich", 20, -15, -5, 20); E("depozit", "Fațada nord", "panouri sandwich", 20, -4, 4, 6, 14); E("depozit", "Acoperiș", "tablă cutată", 16, -2, 8, 5, 9); E("depozit", "Fațada vest", "panouri sandwich", 20, 9, 20, 0);
  E("campus", "Corp A", "structură și zidării", 30, -120, -30, 30); E("campus", "Corp B", "structură și zidării", 40, -8, 15, 12, 16); E("campus", "Corp C", "structură și zidării", 50, 20, 90, 0);

  const D = (s, planned, eta, truck, kind, zone, count, status, note = "") => run("INSERT INTO bim_deliveries(site_id,planned,eta,truck,kind,zone,count,status,note) VALUES(?,?,?,?,?,?,?,?,?)", s, planned, eta, truck, kind, zone, count, status, note);
  D("hala", d(-1), d(2), "Camion 2 din 3", "grinzi prefabricate", "Axe C–D", 12, "intarziat", "Fabrica a anunțat reprogramare.");
  D("hala", d(3), d(3), "Camion 1", "stâlpi prefabricați", "Axe E–F", 10, "planificat");
  D("fabrica", d(2), d(2), "Camion 1", "oțel beton fasonat", "Zona 3", 12, "planificat");
  D("depozit", d(0), d(0), "Camion 1", "panouri sandwich", "Fațada nord", 8, "livrat");
  D("campus", d(1), d(1), "Camion 1", "blocuri ceramice", "Corp B", 18, "planificat");

  /* ----- ERP simulat: utilaje închiriate ----- */
  const Q = (s, name, cost, status) => run("INSERT INTO erp_equipment(site_id,name,daily_cost,status) VALUES(?,?,?,?)", s, name, cost, status);
  Q("hala", "Macara 100 t", 8500, "in_asteptare"); Q("fabrica", "Pompă de beton", 2400, "activ"); Q("depozit", "Nacelă 26 m", 900, "activ"); Q("campus", "Macara turn", 3200, "activ");

  /* ----- rapoarte de șantier ----- */
  const P = (s, n, h, mi, author, raw, status, summary, workers, details) => run("INSERT INTO reports(site_id,user_id,author,day,ts,raw,status,summary,workers,details,photos) VALUES(?,?,?,?,?,?,?,?,?,?,'[]')", s, m[s], author, d(n), at(n, h, mi), raw, status, summary, workers, JSON.stringify({ equipment: [], done: [], blockers: [], needs: [], photoNotes: [], ...details }));
  P("hala", -2, 17, 10, "Andrei Pop", "Am avut 31 de oameni. Am montat stâlpii prefabricați pe axele C–D, 14 bucăți. Macaraua de 100 t a lucrat toată ziua.", "ok", "Stâlpi montați pe axele C–D, 14 bucăți, fără probleme.", 31, { done: ["Montaj 14 stâlpi prefabricați, axele C–D"], equipment: ["Macara 100 t – funcțională"] });
  P("fabrica", -2, 17, 40, "Mihai Rusu", "26 de oameni. Am terminat armarea radierului în zona 2. Betonul e programat pentru mâine dimineață, 210 mc.", "ok", "Armare radier zona 2 terminată; turnare de 210 mc programată a doua zi.", 26, { done: ["Armare radier zona 2"] });
  P("hala", -1, 17, 20, "Andrei Pop", "33 de oameni. Am pregătit reazemele pentru grinzi pe C–D. Din trei camioane de grinzi a ajuns doar unul, restul s-au reprogramat.", "atentie", "Reazeme pregătite pe C–D; livrarea de grinzi a venit incompletă.", 33, { done: ["Pregătire reazeme grinzi, axele C–D"], blockers: ["Livrare grinzi C–D incompletă: 1 camion din 3"] });
  P("fabrica", -1, 17, 35, "Mihai Rusu", "28 de oameni. Am turnat radierul în zona 2, 205 mc, cu două pompe. Dirigintele a semnat procesul-verbal. Începem cofrarea în zona 3.", "ok", "Radier zona 2 turnat, 205 mc; proces-verbal semnat de diriginte.", 28, { done: ["Turnare radier zona 2 – 205 mc"], equipment: ["2 pompe de beton"] });
  P("depozit", -1, 18, 0, "Ioana Dan", "19 oameni. Beneficiarul a cerut mutarea a două uși de andocare. Nu avem dispoziție de șantier scrisă, am oprit lucrul pe fațada nord.", "atentie", "Lucru oprit pe fațada nord: beneficiarul cere mutarea a două uși de andocare, fără dispoziție scrisă.", 19, { done: ["Montaj panouri sandwich fațada est – 320 mp"], blockers: ["Modificare cerută de beneficiar fără dispoziție de șantier"] });
  P("campus", -1, 18, 20, "Radu Stan", "22 de oameni. Zidării la etajul 1, corp B. Subcontractorul de instalații electrice a venit cu 3 oameni în loc de 8.", "atentie", "Zidării la etajul 1 corp B; subcontractorul de electrice a venit cu 3 oameni din 8.", 22, { done: ["Zidărie etaj 1, corp B – circa 140 mp"], blockers: ["Subcontractor electrice sub efectiv: 3 din 8"] });
  P("hala", 0, 7, 35, "Andrei Pop", "Azi suntem 30. Stăm cu macaraua de 100 t de la 7, nu au venit grinzile pentru axele C–D. Fabrica zice că vin abia poimâine. Pierdem două zile din montaj și plătim macaraua degeaba.", "critic", "Montajul stă: grinzile pentru axele C–D nu au sosit, macaraua de 100 t e în așteptare.", 30, { equipment: ["Macara 100 t – în așteptare de la ora 7"], blockers: ["Grinzile prefabricate pentru C–D nu au fost livrate; fabrica anunță poimâine"], needs: ["Devansarea livrării sau eliberarea macaralei"] });
  P("fabrica", 0, 7, 50, "Mihai Rusu", "29 de oameni. Cofrăm zona 3, cam 60% gata. Mâine armăm. Am nevoie de 12 tone de oțel beton fasonat până vineri.", "ok", "Cofrare zona 3 la circa 60%; armare programată mâine.", 29, { done: ["Cofrare radier zona 3 – circa 60%"], needs: ["12 t oțel beton fasonat până vineri"] });
  P("depozit", 0, 8, 10, "Ioana Dan", "18 oameni. Tot fără dispoziție de șantier pentru ușile de andocare. Am mutat echipa pe acoperiș ca să nu stea. Beneficiarul vrea ședință mâine la 10.", "atentie", "Fațada nord tot blocată fără dispoziție scrisă; echipa mutată pe acoperiș, ședință cu beneficiarul mâine la 10.", 18, { done: ["Montaj tablă cutată acoperiș – circa 400 mp"], blockers: ["Lipsă dispoziție de șantier pentru mutarea ușilor de andocare"], needs: ["Prezența directorului zonal la ședința de mâine, ora 10"] });

  /* ----- ședință și sarcini existente ----- */
  const mid = Number(run("INSERT INTO meetings(site_id,title,day,ts,raw,summary,decisions) VALUES(?,?,?,?,?,?,?)", "fabrica", "Comandament săptămânal – Fabrică componente auto", d(-3), at(-3, 10, 0), "Am stabilit că turnarea radierului din zona 2 se face joi. Mihai trimite beneficiarului graficul actualizat până vineri. Dirigintele cere buletinele de încercări pentru beton.", "Turnarea din zona 2 a fost confirmată, iar beneficiarul așteaptă graficul actualizat și buletinele de încercări.", JSON.stringify(["Turnarea radierului din zona 2 se face joi."])).lastInsertRowid);
  const K = (s, meeting, title, owner, due, src) => run("INSERT INTO tasks(site_id,meeting_id,title,owner,due,status,source,created) VALUES(?,?,?,?,?,'open',?,?)", s, meeting, title, owner, due, src, at(-3, 10, 30));
  K("fabrica", mid, "Trimite beneficiarului graficul actualizat", "Mihai Rusu", d(-2), "meeting:" + mid);
  K("fabrica", mid, "Predă dirigintelui buletinele de încercări pentru beton", "Mihai Rusu", d(1), "meeting:" + mid + ":b");
  K("depozit", null, "Verifică oferta de preț pentru mutarea ușilor de andocare", "Cristian", d(1), "manual:seed1");

  /* ----- subcontractori și prezența lor ----- */
  // fabrici, stație de betoane și depozit: stocuri, furnizori și comenzi fictive
  user("Dan Mureșan", "gestiune@demo.local", "gestionar", null);
  const L = (name, kind, place) => Number(run("INSERT INTO stock_locations(name,kind,place) VALUES(?,?,?)", name, kind, place).lastInsertRowid);
  const F = (name, what, contact, phone, lead) => Number(run("INSERT INTO stock_suppliers(name,what,contact,phone,email,lead_days) VALUES(?,?,?,?,?,?)", name, what, contact, phone, "", lead).lastInsertRowid);
  const fo = F("Oțel Demo SRL", "Oțel beton, profile laminate, plasă sudată", "Persoană de contact demo", "0700 000 001", 5), fa = F("Agregate Demo SRL", "Agregate sortate", "Persoană de contact demo", "0700 000 002", 2), fc = F("Ciment Demo SA", "Ciment vrac, aditivi", "Persoană de contact demo", "0700 000 003", 3), ff = F("Fixări Demo SRL", "Ancore, elemente de fixare, echipament de protecție", "Persoană de contact demo", "0700 000 004", 4);
  const it = {}, I = (loc, key, name, unit, qty, min, cost, sup) => { it[key] = Number(run("INSERT INTO stock_items(loc_id,name,unit,qty,min_qty,cost,supplier_id) VALUES(?,?,?,?,?,?,?)", loc, name, unit, qty, min, cost, sup || null).lastInsertRowid); run("INSERT INTO stock_moves(item_id,ts,qty,after,reason,by,ref) VALUES(?,?,?,?,?,?,?)", it[key], at(-6, 8, 0), qty, qty, "Stoc inițial", "Dan Mureșan", ""); };
  const lp = L("Fabrica de prefabricate", "fabrica", "Sibiu"), lm = L("Fabrica de confecții metalice", "fabrica", "Sibiu"), lb = L("Stația de betoane", "statie", "Sibiu"), ld = L("Depozitul central", "depozit", "Sibiu");
  I(lp, "stalpi", "Stâlpi prefabricați 60×60", "buc", 42, 20, 6800); I(lp, "grinzi", "Grinzi precomprimate 24 m", "buc", 9, 12, 14500); I(lp, "panouri", "Panouri de fațadă", "buc", 64, 30, 2100); I(lp, "pane", "Pane de acoperiș", "buc", 120, 60, 950);
  I(lm, "ferme", "Ferme metalice 18 m", "buc", 14, 8, 9200); I(lm, "contrav", "Contravântuiri", "buc", 85, 40, 640); I(lm, "tabla", "Tablă cutată", "mp", 3200, 2500, 42, fo); I(lm, "hea", "Profile laminate HEA", "t", 18, 25, 5200, fo);
  I(lb, "ciment", "Ciment vrac", "t", 140, 100, 520, fc); I(lb, "ag04", "Agregate 0–4 mm", "t", 620, 400, 68, fa); I(lb, "ag416", "Agregate 4–16 mm", "t", 380, 400, 74, fa); I(lb, "aditivi", "Aditivi", "l", 2400, 1000, 9, fc);
  I(ld, "otel", "Oțel beton BST500", "t", 46, 30, 4100, fo); I(ld, "cofraje", "Panouri de cofraj", "mp", 900, 400, 160); I(ld, "plasa", "Plasă sudată", "buc", 210, 250, 135, fo); I(ld, "epi", "Echipament de protecție", "set", 75, 50, 280, ff); I(ld, "ancore", "Ancore chimice", "buc", 480, 200, 24, ff);
  const O = (n, kind, key, qty, site, sup, need, status, by, note) => run("INSERT INTO stock_orders(ts,kind,item_id,qty,site_id,supplier_id,need_by,status,by,note) VALUES(?,?,?,?,?,?,?,?,?,?)", at(n, 9, 30), kind, it[key], qty, site, sup, need, status, by, note);
  O(-2, "intern", "grinzi", 8, "hala", null, d(2), "confirmata", "Cristian", "Axele C–D"); O(-1, "intern", "panouri", 20, "depozit", null, d(3), "ceruta", "Ioana Dan", "Fațada nord"); O(0, "intern", "otel", 6, "campus", null, d(1), "ceruta", "Radu Stan", "Fundații corp B");
  O(-1, "furnizor", "ag416", 300, null, fa, d(1), "trimisa", "Dan Mureșan", "Completare stoc");
  const S = (site, name, trade, promised, log) => { const id = Number(run("INSERT INTO subs(site_id,name,trade,promised) VALUES(?,?,?,?)", site, name, trade, promised).lastInsertRowid); log.forEach(([n, present]) => run("INSERT INTO sub_log(sub_id,day,promised,present,note,source_ref) VALUES(?,?,?,?,?,?)", id, d(n), promised, present, "", `seed:${id}:${n}`)); };
  S("campus", "Electro Demo SRL", "Instalații electrice", 8, [[-6, 8], [-5, 7], [-4, 6], [-2, 5]]);
  S("depozit", "Panel Demo SRL", "Montaj panouri fațadă", 6, [[-6, 6], [-5, 6], [-2, 5], [-1, 6]]);
  S("hala", "Macarale Demo SRL", "Macarale și montaj", 4, [[-5, 4], [-2, 4], [-1, 4]]);
  run("UPDATE erp_equipment SET idle_since=? WHERE status='in_asteptare'", d(-1));

  /* ----- întârzieri mai vechi, ca dosarul să aibă istoric ----- */
  const Y = (s, n, cause, title, days, type, txt) => run("INSERT INTO delays(site_id,day,cause,title,detail,evidence,source_ref,days,status) VALUES(?,?,?,?,?,?,?,?,'deschis')", s, d(n), cause, title, "", JSON.stringify([{ type, ref: "seed", text: txt }]), `auto:${s}:${d(n)}:${cause}`, days);
  Y("hala", -9, "vreme", "Vreme nefavorabilă: rafale de 61 km/h (limită 50)", 1, "Meteo", `Date demonstrative, ${d(-9)}: rafale 61 km/h. Lucrări oprite: montaj cu macaraua (Axe A–B).`);
  Y("depozit", -6, "beneficiar", "Planșa revizuită pentru fațada nord nu a fost predată", 1, "Raport de șantier", `Ioana Dan, ${d(-6)}: „Așteptăm planșa revizuită de la proiectantul beneficiarului; nu putem trasa golurile.”`);
  Y("campus", -12, "vreme", "Vreme nefavorabilă: minimă de -4°C (îngheț)", 1, "Meteo", `Date demonstrative, ${d(-12)}: minimă -4°C. Lucrări oprite: zidărie și structură (Corp B).`);
  run("INSERT INTO settings(key,value) VALUES('claim_notice:depozit','10')");

  run("INSERT INTO settings(key,value) VALUES('autoapprove_limit','3000')");
  run("INSERT INTO settings(key,value) VALUES('seed_version',?)", String(SEED_VERSION));
}

