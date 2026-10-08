#!/usr/bin/env node
/**
 * 15-Day Institutional Swing Trading Validation Auditor
 * Usage: npm run check-15d   OR   node scripts/check_15d_validation.js
 */
const fs = require("fs");
const path = require("path");
const nepseProvider = require("../src/nepseProvider");

const DATA_DIR = path.join(__dirname, "..", "data");
const SWING_BENCHMARK_FILE = path.join(DATA_DIR, "swing_validation_benchmark.json");
const OCT06_BENCHMARK_FILE = path.join(DATA_DIR, "benchmark_oct06_2026.json");

function evaluateSwingSetup(pick, quote, barsAfterLock = []) {
  const curLtp = Number(quote?.ltp || pick.lockedLtp || pick.day0Ltp || 0);
  const entry = Number(pick.entry || pick.primaryBuy60Pct || pick.lockedLtp || pick.day0Ltp || curLtp);
  const dipLimit = Number(pick.dipLimit || pick.dipBuy40Pct || pick.dipBuyZone || entry);
  const stopLoss = Number(pick.stopLoss || pick.stopLoss3pmClose || entry * 0.95);
  const t1 = Number(pick.target1 || pick.t1 || entry * 1.07);
  const t2 = Number(pick.target2 || entry * 1.13);
  const t3 = Number(pick.target3 || entry * 1.20);

  let highestSinceLock = Math.max(curLtp, Number(quote?.high || curLtp));
  let lowestCloseSinceLock = curLtp;
  for (const b of barsAfterLock) {
    if (b.high > highestSinceLock) highestSinceLock = b.high;
    if (b.close > 0 && b.close < lowestCloseSinceLock) lowestCloseSinceLock = b.close;
  }

  const riskPerShare = Math.max(0.5, entry - stopLoss);
  const returnFromEntryPct = +(((curLtp - entry) / entry) * 100).toFixed(2);
  const maxGainPct = +(((highestSinceLock - entry) / entry) * 100).toFixed(2);
  const currentR = +((curLtp - entry) / riskPerShare).toFixed(2);

  let status = "⏳ ACTIVE / IN ENTRY ZONE";
  let isWin = false;
  let isInvalidated = false;

  if (highestSinceLock >= t3) {
    status = "🏆 TARGET 3 HIT (+3R+)";
    isWin = true;
  } else if (highestSinceLock >= t2) {
    status = "🎯 TARGET 2 HIT (+2R+)";
    isWin = true;
  } else if (highestSinceLock >= t1) {
    status = "✅ TARGET 1 HIT (50% LOCKED)";
    isWin = true;
  } else if (lowestCloseSinceLock < stopLoss || curLtp < stopLoss) {
    status = "🛑 INVALIDATED (< 3PM STOP)";
    isInvalidated = true;
  } else if (curLtp > entry * 1.005) {
    status = "🟢 IN PROFIT (HOLDING SWING)";
    isWin = true;
  } else if (curLtp <= entry && curLtp >= dipLimit * 0.995) {
    status = "🎯 IN OB/FIB BUY ZONE";
  }

  return {
    symbol: pick.symbol,
    sector: pick.sector || quote?.sector || "NEPSE",
    lockedLtp: pick.lockedLtp || pick.day0Ltp,
    entry,
    dipLimit,
    currentLtp: curLtp,
    highestSinceLock,
    stopLoss,
    target1: t1,
    target2: t2,
    target3: t3,
    returnFromEntryPct,
    maxGainPct,
    currentR,
    rT2: pick.rT2 || +((t2 - entry) / riskPerShare).toFixed(2),
    setupGrade: pick.setupGrade || "A+",
    status,
    isWin,
    isInvalidated
  };
}

async function runValidation() {
  console.log("\n🔄 Syncing latest live NEPSE market quotes from MeroLagani / ShareSansar / NepaliPaisa...");
  try {
    await nepseProvider.refreshLiveQuotes(true);
    if (nepseProvider._activeRefreshPromise) await nepseProvider._activeRefreshPromise;
  } catch (_) {}

  const swingBench = JSON.parse(fs.readFileSync(SWING_BENCHMARK_FILE, "utf8"));
  const lockDate = swingBench.lockedDate || "2026-10-08";

  console.log("================================================================================================================");
  console.log(`🌊 10-FACTOR INSTITUTIONAL SWING TRADING — 15-DAY VALIDATION SCORECARD`);
  console.log(`📅 Locked Date: ${lockDate}  |  15-Day Checkpoint: ${swingBench.day15CheckpointDate}  |  30-Day Checkpoint: ${swingBench.day30CheckpointDate}`);
  console.log("================================================================================================================");

  const results = swingBench.top10SwingSetups.map((pick) => {
    const q = nepseProvider.quotes.get(pick.symbol);
    const bars = (nepseProvider.getHistoricalBars(pick.symbol) || []).filter((b) => b.date && b.date > lockDate);
    return evaluateSwingSetup(pick, q, bars);
  });

  let wins = 0;
  let invalidated = 0;
  let active = 0;
  let totalReturnPct = 0;

  console.log(
    "Rank | Symbol | Entry     | Live LTP  | P&L %    | Current R | Stop Loss | Target 1  | Target 2  | Target 3  | Validation Status"
  );
  console.log(
    "-----+--------+-----------+-----------+----------+-----------+-----------+-----------+-----------+-----------+------------------------------"
  );

  results.forEach((r, idx) => {
    if (r.isWin) wins++;
    else if (r.isInvalidated) invalidated++;
    else active++;
    totalReturnPct += r.returnFromEntryPct;

    const pnlStr = (r.returnFromEntryPct >= 0 ? "+" : "") + r.returnFromEntryPct.toFixed(2) + "%";
    const rStr = (r.currentR >= 0 ? "+" : "") + r.currentR.toFixed(2) + "R";
    console.log(
      `${String("#" + (idx + 1)).padEnd(4)} | ${r.symbol.padEnd(6)} | Rs ${String(r.entry).padEnd(6)} | Rs ${String(r.currentLtp).padEnd(6)} | ${pnlStr.padEnd(8)} | ${rStr.padEnd(9)} | Rs ${String(r.stopLoss).padEnd(6)} | Rs ${String(r.target1).padEnd(6)} | Rs ${String(r.target2).padEnd(6)} | Rs ${String(r.target3).padEnd(6)} | ${r.status}`
    );
  });

  const avgRet = (totalReturnPct / Math.max(1, results.length)).toFixed(2);
  const safeOrWinning = results.length - invalidated;
  console.log("================================================================================================================");
  console.log(
    `📊 SUMMARY: Winning/Target Hit: ${wins}/${results.length} | Active in Zone (Unbroken Structure): ${active}/${results.length} | Invalidated (< Stop): ${invalidated}/${results.length}`
  );
  console.log(
    `🛡️ Structure Survival Rate: ${((safeOrWinning / results.length) * 100).toFixed(1)}% (${safeOrWinning}/${results.length} holding above ATR+HL Stop) | Avg Return vs Entry: ${avgRet >= 0 ? "+" : ""}${avgRet}%`
  );
  console.log("================================================================================================================\n");

  if (fs.existsSync(OCT06_BENCHMARK_FILE)) {
    const oct06 = JSON.parse(fs.readFileSync(OCT06_BENCHMARK_FILE, "utf8"));
    console.log("📈 BONUS AUDIT: OCT 6, 2026 LOCKED SWING PICKS (LIVE FORWARD TRACKING SINCE OCT 6)");
    console.log("----------------------------------------------------------------------------------------------------------------");
    const oct6Picks = [...(oct06.doubleConfirmedPicks || []), ...(oct06.top5Swing15OnlyPicks || [])];
    let oWins = 0;
    let oInv = 0;
    let oRetSum = 0;
    for (const p of oct6Picks) {
      const q = nepseProvider.quotes.get(p.symbol);
      const bars = (nepseProvider.getHistoricalBars(p.symbol) || []).filter((b) => b.date && b.date > "2026-10-06");
      const ev = evaluateSwingSetup(p, q, bars);
      if (ev.isWin) oWins++;
      if (ev.isInvalidated) oInv++;
      oRetSum += ev.returnFromEntryPct;
      const pnlStr = (ev.returnFromEntryPct >= 0 ? "+" : "") + ev.returnFromEntryPct.toFixed(2) + "%";
      console.log(
        `• ${ev.symbol.padEnd(6)} | Oct 6 Entry: Rs ${String(ev.entry).padEnd(7)} -> Live LTP: Rs ${String(ev.currentLtp).padEnd(7)} (${pnlStr.padEnd(7)}) | Stop: Rs ${String(ev.stopLoss).padEnd(7)} | T1: Rs ${String(ev.target1).padEnd(7)} | ${ev.status}`
      );
    }
    const oAvg = (oRetSum / Math.max(1, oct6Picks.length)).toFixed(2);
    console.log("----------------------------------------------------------------------------------------------------------------");
    console.log(
      `✅ Oct 6 Cohort Forward Result: ${oWins}/${oct6Picks.length} Profitable | ${oct6Picks.length - oInv}/${oct6Picks.length} Structure Intact (${(((oct6Picks.length - oInv) / oct6Picks.length) * 100).toFixed(1)}%) | Avg P&L: ${oAvg >= 0 ? "+" : ""}${oAvg}%\n`
    );
  }
  process.exit(0);
}

if (require.main === module) {
  runValidation();
}

module.exports = { evaluateSwingSetup };
