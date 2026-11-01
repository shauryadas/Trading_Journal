import { db } from "hatchable";

export const access = "user";
export const methods = ["GET", "POST", "PUT", "DELETE"];

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function evaluate(account, trades, payouts, requestAmount = 0) {
  const accountTrades = trades.filter((trade) => trade && typeof trade === "object" && trade.accountId === account.id);
  const byDay = {};
  for (const trade of accountTrades) {
    const date = String(trade.date || "");
    if (date) byDay[date] = (byDay[date] || 0) + num(trade.pnl);
  }
  const days = Object.keys(byDay).sort();
  const pnl = accountTrades.reduce((sum, trade) => sum + num(trade.pnl), 0);
  const startingBalance = num(account.startingBalance);
  const grossBalance = startingBalance + pnl;
  let equity = startingBalance;
  let peak = startingBalance;
  let maxDrawdown = 0;
  accountTrades
    .map((trade, index) => ({ trade, index }))
    .sort((a, b) => {
      const dateOrder = String(a.trade.date || "").localeCompare(String(b.trade.date || ""));
      if (dateOrder) return dateOrder;
      const aTime = Date.parse(a.trade.createdAt || "");
      const bTime = Date.parse(b.trade.createdAt || "");
      if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return aTime - bTime;
      return a.index - b.index;
    })
    .forEach(({ trade }) => {
      equity += num(trade.pnl);
      peak = Math.max(peak, equity);
      maxDrawdown = Math.max(maxDrawdown, peak - equity);
    });

  const positiveDays = days.map((day) => byDay[day]).filter((value) => value > 0);
  const minimumTradingDays = num(account.minimumTradingDays);
  const consistencyCap = num(account.consistencyCap);
  const consistencyTarget = num(account.profitTarget);
  const consistencyPct = consistencyTarget > 0 ? Math.max(0, ...positiveDays) / consistencyTarget * 100 : 0;
  const safetyNet = num(account.safetyNetBalance);
  const minimumProfitableDays = num(account.minimumProfitableDays);
  const minimumProfitPerDay = num(account.minimumProfitPerDay);
  const minimumPayoutAmount = num(account.minimumPayoutAmount);
  const minimumProfitAboveSafetyNet = num(account.minimumProfitAboveSafetyNet ?? 500);
  const qualifyingProfitDays = days.map((day) => byDay[day]).filter((value) => minimumProfitPerDay > 0 && value >= minimumProfitPerDay).length;
  const profitableDays = positiveDays.length;

  const mll = num(account.maxDrawdown);
  const failed = String(account.accountStatus || "").toLowerCase() === "failed" || (mll > 0 && maxDrawdown >= mll);
  const stageOk = String(account.accountStage || "").toLowerCase() === "funded";
  const activeOk = !failed && String(account.accountStatus || "Active").toLowerCase() === "active";
  const minDaysOk = minimumTradingDays <= 0 || days.length >= minimumTradingDays;
  const consistencyOk = consistencyCap > 0 && consistencyTarget > 0 && consistencyPct <= consistencyCap;
  const minProfitDaysOk = minimumProfitableDays > 0 && minimumProfitPerDay > 0 && qualifyingProfitDays >= minimumProfitableDays;

  const committed = payouts
    .filter((payout) => payout.account_id === account.id && ["Requested", "Paid"].includes(payout.status))
    .reduce((sum, payout) => sum + num(payout.amount), 0);
  const balanceAfterPayouts = grossBalance - committed;
  const safetyNetOk = safetyNet > 0 && balanceAfterPayouts >= safetyNet;
  const available = safetyNet > 0
    ? Math.max(0, Math.min(pnl - committed, balanceAfterPayouts - safetyNet))
    : 0;
  const minPayoutOk = minimumPayoutAmount > 0 && num(requestAmount) >= minimumPayoutAmount;
  const profitAboveSafetyOk = minimumProfitAboveSafetyNet > 0 && available >= minimumProfitAboveSafetyNet;

  const checks = [
    { key: "funded", label: "Funded account", passed: stageOk, detail: stageOk ? "Account is in funded stage" : "Payouts are only available on funded accounts" },
    { key: "status", label: "Account active / MLL clear", passed: activeOk, detail: failed ? "Account has failed its MLL" : activeOk ? "No MLL breach recorded" : "Account is not marked Active" },
    { key: "profit", label: "Profit above Safety Net Threshold", passed: profitAboveSafetyOk, detail: "Available above safety net: $" + available.toFixed(2) + " / required $" + minimumProfitAboveSafetyNet.toFixed(2) },
    { key: "profitPositive", label: "Positive available profit", passed: available > 0, detail: available > 0 ? "Available to request: $" + available.toFixed(2) : "No uncommitted realized profit above the safety net" },
    { key: "days", label: "Minimum trading days", passed: minDaysOk, detail: minimumTradingDays > 0 ? days.length + " / " + minimumTradingDays + " distinct days" : "No minimum trading-day requirement configured" },
    { key: "consistency", label: "Consistency rule", passed: consistencyOk, detail: consistencyCap > 0 && consistencyTarget > 0 ? "$" + Math.max(0, ...positiveDays).toFixed(2) + " best day / $" + consistencyTarget.toFixed(2) + " profit target = " + consistencyPct.toFixed(1) + "% (max " + consistencyCap + "%)" : "Set a profit target and consistency cap" },
    { key: "safety", label: "Safety-net threshold", passed: safetyNetOk, detail: safetyNet > 0 ? "Balance after payouts $" + balanceAfterPayouts.toFixed(2) + " / threshold $" + safetyNet.toFixed(2) : "Set a Safety Net Threshold" },
    { key: "profitDays", label: "Minimum profitable days", passed: minProfitDaysOk, detail: minimumProfitableDays > 0 && minimumProfitPerDay > 0 ? qualifyingProfitDays + " / " + minimumProfitableDays + " days with at least $" + minimumProfitPerDay.toFixed(2) + " profit (" + profitableDays + " green days total)" : "Set both minimum profitable days and minimum profit per day" },
    { key: "minPayout", label: "Minimum payout amount", passed: minPayoutOk, detail: minimumPayoutAmount > 0 ? "Request must be at least $" + minimumPayoutAmount.toFixed(2) : "Set a minimum payout amount" }
  ];

  return {
    eligible: checks.every((check) => check.passed),
    checks,
    available,
    metrics: { pnl, grossBalance, balanceAfterPayouts, maxDrawdown, activeDays: days.length, bestDayShare: consistencyPct, consistencyTarget, safetyNet, committed, profitableDays, qualifyingProfitDays, minimumPayoutAmount, minimumProfitAboveSafetyNet }
  };
}

export default async function (req, res) {
  try {
    const ownerId = String(req.user?.id || "");
    if (!ownerId) return res.status(401).json({ error: "A signed-in payout user is required." });
    if (req.method === "GET") {
      const { rows } = await db.query(
        "SELECT id, account_id, account_name, firm, amount, currency, status, eligibility_snapshot, note, created_at, updated_at, archived_at FROM payout_requests WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 500",
        [ownerId]
      );
      return res.json({ payouts: rows });
    }

    if (req.method === "POST") {
      const accountId = String(req.body?.accountId || "").trim();
      const amount = Math.round(num(req.body?.amount) * 100) / 100;
      const note = String(req.body?.note || "").trim().slice(0, 500);
      if (!accountId || !Number.isFinite(amount) || amount < 0.01) {
        return res.status(400).json({ error: "Choose an account and enter a payout amount greater than zero." });
      }

      const journalResult = await db.query("SELECT payload, updated_at FROM journal_data WHERE owner_id = $1", [ownerId]);
      const payload = journalResult.rows[0]?.payload;
      const journalUpdatedAt = journalResult.rows[0]?.updated_at;
      if (!payload || !Array.isArray(payload.accounts) || !Array.isArray(payload.trades) || !journalUpdatedAt) {
        return res.status(409).json({ error: "Your journal data is not available yet. Sync your journal and try again." });
      }
      const account = payload.accounts.find((item) => item && typeof item === "object" && item.id === accountId);
      if (!account) return res.status(404).json({ error: "That account was not found in your journal." });

      const payoutResult = await db.query("SELECT id, account_id, amount, status FROM payout_requests WHERE owner_id = $1 ORDER BY created_at DESC", [ownerId]);
      const result = evaluate(account, payload.trades, payoutResult.rows, amount);
      if (!result.eligible) {
        return res.status(409).json({ error: "This account does not meet every required payout condition. Check all account rules and the requested amount.", eligibility: result });
      }
      if (amount > result.available + 0.00001) {
        return res.status(400).json({ error: "Requested amount exceeds the available payout profit of $" + result.available.toFixed(2) + ".", eligibility: result });
      }
      const protectedSafetyNet = num(account.safetyNetBalance);
      const balanceAfterRequest = result.metrics.balanceAfterPayouts - amount;
      if (protectedSafetyNet > 0 && balanceAfterRequest < protectedSafetyNet - 0.00001) {
        return res.status(400).json({ error: "This payout would use the protected safety-net threshold. Reduce the request amount.", eligibility: result });
      }

      const snapshot = {
        checks: result.checks,
        metrics: result.metrics,
        availableAtRequest: result.available,
        accountBalanceAfterRequest: result.metrics.balanceAfterPayouts - amount
      };
      // Lock this user's journal row while reserving a payout. Concurrent
      // requests then re-check the committed total inside the same transaction.
      const committedSql = "COALESCE((SELECT SUM(amount) FROM payout_requests WHERE owner_id = $1 AND account_id = $2 AND status IN ('Requested','Paid')), 0)";
      const transaction = await db.transaction([
        {
          sql: "SELECT owner_id FROM journal_data WHERE owner_id = $1 FOR UPDATE",
          params: [ownerId]
        },
        {
          sql: "INSERT INTO payout_requests (owner_id, account_id, account_name, firm, amount, currency, status, eligibility_snapshot, note) SELECT $1, $2, $3, $4, $5::numeric, 'USD', 'Requested', $9::jsonb, $10 WHERE $5::numeric <= GREATEST(0::numeric, LEAST($6::numeric - " + committedSql + ", $7::numeric + $6::numeric - " + committedSql + " - $8::numeric)) + 0.00001::numeric AND $7::numeric + $6::numeric - " + committedSql + " - $5::numeric >= $8::numeric - 0.00001::numeric AND EXISTS (SELECT 1 FROM journal_data WHERE owner_id = $1 AND updated_at = $11) RETURNING id, account_id, account_name, firm, amount, currency, status, eligibility_snapshot, note, created_at, updated_at",
          params: [ownerId, account.id, String(account.name || "Account"), String(account.firm || ""), amount, result.metrics.pnl, num(account.startingBalance), protectedSafetyNet, JSON.stringify(snapshot), note, journalUpdatedAt]
        }
      ]);
      const inserted = transaction.results?.[1];
      if (!inserted?.rows?.length) {
        return res.status(409).json({ error: "Journal data or payout availability changed while this request was being submitted. Refresh the eligibility checks and try again.", eligibility: result });
      }
      let finalBalanceAfterRequest = balanceAfterRequest;
      let finalAvailableAfterRequest = Math.max(0, result.available - amount);
      try {
        const latestPayouts = await db.query(
          "SELECT id, account_id, amount, status FROM payout_requests WHERE owner_id = $1 ORDER BY created_at DESC",
          [ownerId]
        );
        const latestState = evaluate(account, payload.trades, latestPayouts.rows, 0);
        finalBalanceAfterRequest = latestState.metrics.balanceAfterPayouts;
        finalAvailableAfterRequest = latestState.available;
      } catch (refreshError) {
        console.error("Payout balance refresh failed after request:", refreshError);
      }
      return res.status(201).json({
        payout: inserted.rows[0],
        eligibility: result,
        balanceAfterRequest: finalBalanceAfterRequest,
        availableAfterRequest: finalAvailableAfterRequest
      });
    }

    if (req.method === "DELETE") {
      const archived = await db.query(
        "UPDATE payout_requests SET archived_at = NOW(), updated_at = NOW() WHERE owner_id = $1 AND archived_at IS NULL AND status IN ('Paid', 'Cancelled') RETURNING id",
        [ownerId]
      );
      return res.json({ archivedCount: archived.rows.length });
    }

    const id = Number(req.body?.id);
    const status = String(req.body?.status || "");
    if (!Number.isSafeInteger(id) || id <= 0 || !["Paid", "Cancelled"].includes(status)) {
      return res.status(400).json({ error: "A valid payout ID and Paid or Cancelled status are required." });
    }
    const updated = await db.query(
      "UPDATE payout_requests SET status = $1, updated_at = NOW() WHERE id = $2 AND owner_id = $3 AND status = 'Requested' RETURNING id, account_id, account_name, firm, amount, currency, status, eligibility_snapshot, note, created_at, updated_at",
      [status, id, ownerId]
    );
    if (!updated.rows.length) return res.status(404).json({ error: "Pending payout request not found." });
    return res.json({ payout: updated.rows[0] });
  } catch (error) {
    console.error("Payout request error:", error);
    return res.status(500).json({ error: "Unable to access payout history." });
  }
}