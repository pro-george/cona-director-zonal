// Conector ERP (SIMULAT). Aplicația cunoaște doar funcțiile exportate aici.
// Pentru ERP-ul real al clientului, se rescrie corpul funcțiilor (API, view-uri SQL, export) și restul rămâne neschimbat.
import { q, one, run } from "../db.js";

export const SOURCE = "ERP simulat";

export function budgetLines(siteId) {
  return q("SELECT category, budget, actual, committed FROM erp_budget WHERE site_id=? ORDER BY id", siteId)
    .map((l) => ({ ...l, remaining: l.budget - l.actual - l.committed, over: l.actual + l.committed > l.budget }));
}

export function receivables(siteId, today) {
  return q("SELECT * FROM erp_receivables WHERE site_id=? ORDER BY issued", siteId)
    .map((r) => ({ ...r, overdueDays: !r.paid_at && r.due < today ? Math.round((new Date(today) - new Date(r.due)) / 86400000) : 0 }));
}

export function financeSummary(site, today) {
  const lines = budgetLines(site.id);
  const sum = (k) => lines.reduce((a, l) => a + l[k], 0);
  const rec = receivables(site.id, today);
  const invoiced = rec.reduce((a, r) => a + r.amount, 0);
  const collected = rec.filter((r) => r.paid_at).reduce((a, r) => a + r.amount, 0);
  const overdue = rec.filter((r) => r.overdueDays > 0);
  const budget = sum("budget"), actual = sum("actual"), committed = sum("committed");
  return {
    source: SOURCE, contract: site.contract, budget, actual, committed,
    spentPct: budget ? actual / budget : 0, exposurePct: budget ? (actual + committed) / budget : 0,
    overLines: lines.filter((l) => l.over), lines, invoiced, collected,
    overdue, overdueAmount: overdue.reduce((a, r) => a + r.amount, 0), receivables: rec,
  };
}

export const approvals = (status) => status
  ? q("SELECT * FROM erp_approvals WHERE status=? ORDER BY created DESC, id DESC", status)
  : q("SELECT * FROM erp_approvals ORDER BY (status='pending') DESC, created DESC, id DESC");
export const approval = (id) => one("SELECT * FROM erp_approvals WHERE id=?", id);

// Scrierea deciziei înapoi în ERP. La angajarea unei comenzi aprobate, suma trece în "angajat" pe linia de buget.
export function decideApproval(id, { status, by, note = "", auto = 0 }) {
  const a = approval(id);
  if (!a || a.status !== "pending") return null;
  run("UPDATE erp_approvals SET status=?, decided_at=?, decided_by=?, note=?, auto=? WHERE id=?", status, Date.now(), by, note, auto, id);
  if (status === "approved" && a.category) run("UPDATE erp_budget SET committed=committed+? WHERE site_id=? AND category=?", a.amount, a.site_id, a.category);
  return approval(id);
}
export const setRecommendation = (id, rec, reason) => run("UPDATE erp_approvals SET rec=?, rec_reason=? WHERE id=?", rec, reason, id);
