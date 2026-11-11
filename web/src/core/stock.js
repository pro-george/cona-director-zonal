// Fabrici și depozit: stocuri, mișcări, comenzi interne către șantiere și comenzi către furnizori.
// În aplicația reală datele vin din gestiunea ERP; aici sunt ținute local, cu aceeași formă.
import { q, one, run, dayOf, addDays, roDay, lei } from "./db.js";

const str = (v, n = 80) => String(v ?? "").trim().slice(0, n);
const num = (v) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : NaN; };
const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString("ro-RO");
export const KINDS = { fabrica: "Fabrică", statie: "Stație de betoane", depozit: "Depozit" };
export const STATUS = { propusa: "Propusă de Autopilot", ceruta: "Cerută", confirmata: "Confirmată", trimisa: "Trimisă furnizorului", livrata: "Livrată", anulata: "Anulată" };
const OPEN = "('propusa','ceruta','confirmata','trimisa')";

const reservedMap = () => Object.fromEntries(q("SELECT item_id, SUM(qty) n FROM stock_orders WHERE kind='intern' AND status='confirmata' GROUP BY item_id").map((r) => [r.item_id, r.n]));
const incomingMap = () => Object.fromEntries(q("SELECT item_id, SUM(qty) n FROM stock_orders WHERE kind='furnizor' AND status IN ('propusa','trimisa') GROUP BY item_id").map((r) => [r.item_id, r.n]));

export function items() {
  const res = reservedMap(), inc = incomingMap();
  return q("SELECT i.*, l.name AS loc, l.kind AS loc_kind, s.name AS supplier FROM stock_items i JOIN stock_locations l ON l.id=i.loc_id LEFT JOIN stock_suppliers s ON s.id=i.supplier_id ORDER BY l.id, i.name").map((i) => {
    const reserved = res[i.id] || 0, free = i.qty - reserved;
    return { ...i, reserved, free, incoming: inc[i.id] || 0, value: i.qty * (i.cost || 0), level: free <= 0 || (i.min_qty > 0 && free < i.min_qty * 0.5) ? "crit" : i.min_qty > 0 && free < i.min_qty ? "warn" : "ok" };
  });
}

export function orders(limit = 60) {
  return q(`SELECT o.*, i.name AS item, i.unit, i.loc_id, l.name AS loc, st.name AS site, s.name AS supplier FROM stock_orders o JOIN stock_items i ON i.id=o.item_id JOIN stock_locations l ON l.id=i.loc_id LEFT JOIN sites st ON st.id=o.site_id LEFT JOIN stock_suppliers s ON s.id=o.supplier_id ORDER BY CASE WHEN o.status IN ${OPEN} THEN 0 ELSE 1 END, o.ts DESC LIMIT ?`, limit).map((o) => ({ ...o, open: ["propusa", "ceruta", "confirmata", "trimisa"].includes(o.status), label: STATUS[o.status] || o.status }));
}

export function overview(today = dayOf()) {
  const all = items(), ord = orders();
  const locations = q("SELECT * FROM stock_locations ORDER BY id").map((l) => { const mine = all.filter((i) => i.loc_id === l.id); return { ...l, kindLabel: KINDS[l.kind] || "Depozit", items: mine, value: mine.reduce((a, i) => a + i.value, 0), low: mine.filter((i) => i.level !== "ok").length }; });
  return {
    today, locations, orders: ord.map((o) => ({ ...o, late: o.open && o.need_by && o.need_by < today })),
    suppliers: q("SELECT s.*, (SELECT COUNT(*) FROM stock_items i WHERE i.supplier_id=s.id) AS items, (SELECT COUNT(*) FROM stock_orders o WHERE o.supplier_id=s.id AND o.status IN ('propusa','trimisa')) AS open FROM stock_suppliers s ORDER BY s.name"),
    moves: q("SELECT m.*, i.name AS item, i.unit, l.name AS loc FROM stock_moves m JOIN stock_items i ON i.id=m.item_id JOIN stock_locations l ON l.id=i.loc_id ORDER BY m.ts DESC LIMIT 40"),
    sites: q("SELECT id, name FROM sites ORDER BY ord, name"), kinds: KINDS,
    stats: { items: all.length, low: all.filter((i) => i.level !== "ok").length, value: all.reduce((a, i) => a + i.value, 0), open: ord.filter((o) => o.open).length, toConfirm: ord.filter((o) => o.status === "ceruta").length, proposed: ord.filter((o) => o.status === "propusa").length },
  };
}

export function saveLocation(b) {
  const name = str(b.name); if (!name) return "Scrie numele.";
  const kind = KINDS[b.kind] ? b.kind : "depozit";
  if (b.id) run("UPDATE stock_locations SET name=?, kind=?, place=? WHERE id=?", name, kind, str(b.place), Number(b.id));
  else run("INSERT INTO stock_locations(name,kind,place) VALUES(?,?,?)", name, kind, str(b.place));
}
export function removeLocation(id) {
  if (one("SELECT COUNT(*) n FROM stock_items WHERE loc_id=?", Number(id)).n) return "Mută sau șterge întâi articolele din această locație.";
  run("DELETE FROM stock_locations WHERE id=?", Number(id));
}

export function saveItem(b, by) {
  const name = str(b.name), unit = str(b.unit, 12) || "buc", min = num(b.min_qty || 0), cost = num(b.cost || 0), loc = Number(b.loc_id);
  if (!name) return "Scrie denumirea articolului.";
  if (!one("SELECT id FROM stock_locations WHERE id=?", loc)) return "Alege fabrica sau depozitul.";
  if (Number.isNaN(min) || min < 0 || Number.isNaN(cost) || cost < 0) return "Stocul minim și costul trebuie să fie numere pozitive.";
  const sup = Number(b.supplier_id) || null;
  if (b.id) { run("UPDATE stock_items SET name=?, unit=?, min_qty=?, cost=?, loc_id=?, supplier_id=? WHERE id=?", name, unit, min, cost, loc, sup, Number(b.id)); return; }
  const qty = num(b.qty || 0); if (Number.isNaN(qty) || qty < 0) return "Cantitatea trebuie să fie un număr pozitiv.";
  const id = Number(run("INSERT INTO stock_items(loc_id,name,unit,qty,min_qty,cost,supplier_id) VALUES(?,?,?,?,?,?,?)", loc, name, unit, 0, min, cost, sup).lastInsertRowid);
  if (qty > 0) apply(id, qty, "Stoc inițial", by);
}
export function removeItem(id) {
  if (one(`SELECT COUNT(*) n FROM stock_orders WHERE item_id=? AND status IN ${OPEN}`, Number(id)).n) return "Articolul are comenzi deschise. Închide-le sau anulează-le întâi.";
  run("DELETE FROM stock_moves WHERE item_id=?", Number(id)); run("DELETE FROM stock_orders WHERE item_id=?", Number(id)); run("DELETE FROM stock_items WHERE id=?", Number(id));
}

function apply(itemId, delta, reason, by, ref = "") {
  const it = one("SELECT qty FROM stock_items WHERE id=?", itemId), after = Math.round((it.qty + delta) * 1000) / 1000;
  run("UPDATE stock_items SET qty=? WHERE id=?", after, itemId);
  run("INSERT INTO stock_moves(item_id,ts,qty,after,reason,by,ref) VALUES(?,?,?,?,?,?,?)", itemId, Date.now(), delta, after, reason, by || "", ref);
}

// intrare, ieșire sau inventar (cantitatea numărată înlocuiește stocul scriptic)
export function move(id, b, by) {
  const it = one("SELECT * FROM stock_items WHERE id=?", Number(id)); if (!it) return "Articolul nu există.";
  const n = num(b.qty); if (Number.isNaN(n) || n < 0) return "Scrie o cantitate validă.";
  const note = str(b.note, 120);
  if (b.kind === "inventar") { if (n !== it.qty) apply(it.id, n - it.qty, "Inventar" + (note ? ": " + note : ""), by); return; }
  if (n === 0) return "Cantitatea trebuie să fie mai mare decât zero.";
  if (b.kind === "iesire") {
    const free = it.qty - (reservedMap()[it.id] || 0);
    if (n > it.qty) return `În stoc sunt doar ${fmt(it.qty)} ${it.unit}.`;
    if (n > free) return `Doar ${fmt(free)} ${it.unit} sunt libere; restul sunt rezervate pentru comenzi confirmate.`;
    apply(it.id, -n, "Ieșire" + (note ? ": " + note : ""), by); return;
  }
  apply(it.id, n, "Intrare" + (note ? ": " + note : ""), by);
}

export function saveSupplier(b) {
  const name = str(b.name); if (!name) return "Scrie numele furnizorului.";
  const lead = Math.max(0, Math.round(num(b.lead_days || 0)) || 0), v = [name, str(b.what, 120), str(b.contact, 60), str(b.phone, 30), str(b.email, 80), lead];
  if (b.id) run("UPDATE stock_suppliers SET name=?, what=?, contact=?, phone=?, email=?, lead_days=? WHERE id=?", ...v, Number(b.id));
  else run("INSERT INTO stock_suppliers(name,what,contact,phone,email,lead_days) VALUES(?,?,?,?,?,?)", ...v);
}
export function removeSupplier(id) {
  if (one("SELECT COUNT(*) n FROM stock_orders WHERE supplier_id=? AND status IN ('propusa','trimisa')", Number(id)).n) return "Furnizorul are comenzi deschise.";
  run("UPDATE stock_items SET supplier_id=NULL WHERE supplier_id=?", Number(id)); run("DELETE FROM stock_suppliers WHERE id=?", Number(id));
}

export function placeOrder(b, by) {
  const it = one("SELECT * FROM stock_items WHERE id=?", Number(b.item_id)); if (!it) return "Alege articolul.";
  const n = num(b.qty); if (Number.isNaN(n) || n <= 0) return "Scrie cantitatea.";
  const need = /^\d{4}-\d{2}-\d{2}$/.test(b.need_by || "") ? b.need_by : null, note = str(b.note, 160);
  if (b.kind === "furnizor") {
    const sup = Number(b.supplier_id) || it.supplier_id; if (!sup || !one("SELECT id FROM stock_suppliers WHERE id=?", sup)) return "Alege furnizorul. Îl poți adăuga din fila Furnizori.";
    run("INSERT INTO stock_orders(ts,kind,item_id,qty,supplier_id,need_by,status,by,note) VALUES(?,?,?,?,?,?,?,?,?)", Date.now(), "furnizor", it.id, n, sup, need, "trimisa", by || "", note); return;
  }
  if (!one("SELECT id FROM sites WHERE id=?", b.site_id)) return "Alege șantierul pentru care comanzi.";
  run("INSERT INTO stock_orders(ts,kind,item_id,qty,site_id,need_by,status,by,note) VALUES(?,?,?,?,?,?,?,?,?)", Date.now(), "intern", it.id, n, b.site_id, need, "ceruta", by || "", note);
}

export function act(id, action, by) {
  const o = one("SELECT o.*, i.qty AS stock, i.unit, i.name AS item FROM stock_orders o JOIN stock_items i ON i.id=o.item_id WHERE o.id=?", Number(id)); if (!o) return "Comanda nu există.";
  const set = (s) => run("UPDATE stock_orders SET status=?, decided_by=?, decided_at=? WHERE id=?", s, by || "", Date.now(), o.id);
  if (action === "cancel") { if (!["propusa", "ceruta", "confirmata", "trimisa"].includes(o.status)) return "Comanda este deja închisă."; set("anulata"); return; }
  if (o.kind === "intern") {
    if (action === "confirm" && o.status === "ceruta") { const free = o.stock - (reservedMap()[o.item_id] || 0); if (o.qty > free) return `Stoc liber insuficient: ${fmt(Math.max(0, free))} ${o.unit} din ${fmt(o.qty)} cerute. Confirmă după ce intră marfă sau comandă la furnizor.`; set("confirmata"); return; }
    if (action === "deliver" && o.status === "confirmata") { if (o.qty > o.stock) return `În stoc sunt doar ${fmt(o.stock)} ${o.unit}.`; set("livrata"); apply(o.item_id, -o.qty, "Livrare către șantier", by, "order:" + o.id); return; }
  } else {
    if (action === "send" && o.status === "propusa") { set("trimisa"); return; }
    if (action === "receive" && o.status === "trimisa") { set("livrata"); apply(o.item_id, o.qty, "Recepție de la furnizor", by, "order:" + o.id); return; }
  }
  return "Acțiunea nu se potrivește cu starea comenzii.";
}

// Autopilot: pentru articolele sub minim care au furnizor și nicio comandă pe drum, pregătește o comandă de completare.
export function autopropose() {
  const made = [];
  for (const i of items().filter((i) => i.min_qty > 0 && i.free + i.incoming < i.min_qty && i.supplier_id)) {
    const qty = Math.ceil(i.min_qty * 1.5 - i.free - i.incoming); if (qty <= 0) continue;
    const lead = one("SELECT lead_days FROM stock_suppliers WHERE id=?", i.supplier_id)?.lead_days || 0;
    run("INSERT INTO stock_orders(ts,kind,item_id,qty,supplier_id,need_by,status,by,note) VALUES(?,?,?,?,?,?,?,?,?)", Date.now(), "furnizor", i.id, qty, i.supplier_id, addDays(dayOf(), lead), "propusa", "Autopilot", `Stoc liber ${fmt(i.free)} ${i.unit}, sub minimul de ${fmt(i.min_qty)}`);
    made.push({ item: i.name, loc: i.loc, qty, unit: i.unit, supplier: i.supplier, value: qty * (i.cost || 0) });
  }
  return made;
}

export function alertsFor(today = dayOf()) {
  const out = [];
  for (const i of items().filter((i) => i.level !== "ok" && i.min_qty > 0)) out.push({ sev: i.level, source: "Stocuri", site_id: null, site: i.loc, text: `${i.name}: ${fmt(i.free)} ${i.unit} libere, sub minimul de ${fmt(i.min_qty)}${i.incoming ? `. Pe drum: ${fmt(i.incoming)} ${i.unit}` : i.supplier ? "" : i.loc_kind === "depozit" ? ". Fără furnizor ales" : ". Trebuie programată producția"}.` });
  for (const o of orders().filter((o) => o.kind === "intern" && o.status === "ceruta" && o.need_by && o.need_by <= addDays(today, 2))) out.push({ sev: "warn", source: "Stocuri", site_id: o.site_id, site: o.site || "", text: `Comanda de ${fmt(o.qty)} ${o.unit} ${o.item} e necesară pe ${roDay(o.need_by)} și nu a fost confirmată de ${o.loc}.` });
  return out;
}
export const summary = () => { const s = overview().stats; return { low: s.low, open: s.open, value: s.value, text: lei(s.value) }; };
