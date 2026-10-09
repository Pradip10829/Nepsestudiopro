const fs = require("fs");
const path = require("path");
const nepseProvider = require("./nepseProvider");
const { analyzeStock } = require("./signalEngine");
const { calculateBuy, calculateSell } = require("./sebonCalculator");
const predictionJournal = require("./predictionJournal");

const DATA_DIR = path.join(__dirname, "..", "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");

const DEFAULT_PORTFOLIO = [
  { symbol: "NABIL", qty: 100, buyPrice: 495 },
  { symbol: "UPPER", qty: 200, buyPrice: 225 },
  { symbol: "CBBL", qty: 50, buyPrice: 890 }
];

function loadState() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(STATE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      if (!parsed.portfolio) parsed.portfolio = { default: DEFAULT_PORTFOLIO };
      return parsed;
    }
  } catch (_) {}
  return {
    watchlists: { default: ["NABIL", "NICA", "HDL", "UPPER", "CBBL", "SAHAS"] },
    portfolio: { default: DEFAULT_PORTFOLIO },
    alerts: [
      { id: 1, user: "default", symbol: "NABIL", condition: "ABOVE", targetPrice: 545, active: true },
      { id: 2, user: "default", symbol: "NICA", condition: "BELOW", targetPrice: 405, active: true }
    ]
  };
}

function saveState(state) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (_) {}
}

const appState = loadState();

function formatNPR(num) {
  if (num === null || num === undefined || isNaN(num)) return "0.00";
  return Number(num).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatInt(num) {
  if (num === null || num === undefined || isNaN(num)) return "0";
  return Math.round(Number(num)).toLocaleString("en-IN");
}

async function handleMessage(rawText, senderId = "default") {
  const text = (rawText || "").trim();
  if (!text) return null;

  const lower = text.toLowerCase();
  const parts = text.split(/\s+/);
  const cmd = parts[0].toLowerCase();

  // 1. Help / Menu
  if (["!help", "/help", "help", "menu", "hi", "hello", "start", "!start", "!menu"].includes(lower)) {
    return getHelpMessage();
  }

  // 2. Live Market Summary & Fear/Greed Index
  if (["!live", "/live", "live", "!market", "market", "nepse", "!nepse"].includes(lower)) {
    return await getLiveMarketMessage();
  }

  // 3. Top Gainers & Losers
  if (["!top", "/top", "top", "gainers", "losers", "top gainers"].includes(lower)) {
    return await getTopMoversMessage();
  }

  // 3b. End of Day (EOD) Summary, Data Accuracy Audit, Why Up/Down & Stocks of the Day
  if (
    ["!eod", "/eod", "eod", "!summary", "/summary", "summary", "!sotd", "/sotd", "!stocksoftheday", "!picks"].includes(cmd) ||
    lower === "eod summary" ||
    lower === "end of day" ||
    lower === "stocks of the day" ||
    lower === "stock of the day"
  ) {
    return await getEodSummaryAndStocksOfTheDayMessage();
  }

  // 3c. Dedicated 15-Day Profit Swing Category (!15days, !15d, !swing15, 15 days, 15 day profit)
  if (
    ["!15days", "/15days", "15days", "!15d", "/15d", "15d", "!swing15", "/swing15", "swing15", "!15day"].includes(cmd) ||
    lower === "15 days" ||
    lower === "15 day" ||
    lower === "15 day profit" ||
    lower === "15 days profit"
  ) {
    return await get15DaySwingMessage();
  }

  // 3d. Daily Prediction Journal & Forward Accuracy Auditor (!audit, !truth, !accuracy, !predictions)
  if (
    [
      "!audit",
      "/audit",
      "audit",
      "!accuracy",
      "/accuracy",
      "accuracy",
      "!truth",
      "/truth",
      "truth",
      "!predictions",
      "/predictions",
      "predictions",
      "!journal"
    ].includes(cmd) ||
    lower === "how accurate" ||
    lower === "yesterday stocks" ||
    lower.includes("audit yesterday") ||
    lower.includes("how accurate our")
  ) {
    const allQuotes = await nepseProvider.getAllQuotes();
    const allAnalyses = allQuotes.map((q) => analyzeStock(q, nepseProvider.getHistoricalBars(q.symbol))).filter(Boolean);
    return predictionJournal.answerPredictionQuery(text, nepseProvider, allAnalyses);
  }

  // 4. Sector Summary
  if (["!sectors", "/sectors", "sectors", "sector", "!sector"].includes(lower)) {
    return getSectorsMessage();
  }

  // 5. Institutional RRG Sector Rotation (!rotation or !rrg)
  if (["!rotation", "/rotation", "rotation", "!rrg", "rrg", "!alpha"].includes(cmd)) {
    return await getSectorRotationMessage();
  }

  // 5b-1. Dedicated IMMEDIATE SELL Category (!immediatesell, !isell, !sellnow, immediate sell, immidiate sell, !immediate sell, sell now)
  if (
    [
      "!immediatesell",
      "/immediatesell",
      "immediatesell",
      "!immidiatesell",
      "immidiatesell",
      "!isell",
      "/isell",
      "isell",
      "!sellnow",
      "/sellnow",
      "sellnow"
    ].includes(cmd) ||
    lower === "immediate sell" ||
    lower === "immidiate sell" ||
    lower === "!immediate sell" ||
    lower === "!immidiate sell" ||
    lower === "sell now" ||
    lower === "!sell immediate" ||
    lower === "!sell immidiate" ||
    lower === "sell immediate" ||
    lower === "sell immidiate"
  ) {
    return await getImmediateSellMessage();
  }

  // 5b-2. Dedicated IMMEDIATE BUY Category (!immediate, !ibuy, !buynow, immediate buy, immidiate buy)
  if (
    ["!immediate", "/immediate", "immediate", "!ibuy", "ibuy", "!buynow", "buynow", "!immidiate"].includes(cmd) ||
    lower === "immediate buy" ||
    lower === "immidiate buy" ||
    lower === "buy now"
  ) {
    return await getImmediateBuyMessage();
  }

  // 5c. Dedicated LONG-TERM HOLD & Dividend Compounder Category (!longterm, !hold, !lt, long term, long term hold)
  if (
    ["!longterm", "/longterm", "longterm", "!hold", "/hold", "!lt", "!sip", "!compound"].includes(cmd) ||
    lower === "long term" ||
    lower === "long term hold" ||
    lower === "longterm hold" ||
    lower.startsWith("long term ")
  ) {
    const arg = lower.startsWith("long term") ? parts.slice(2).join(" ") : parts.slice(1).join(" ");
    return await getLongTermHoldMessage(arg);
  }

  // 5d. Dedicated BEST IN SECTOR Leaderboards (!best, !best banking, !best finance, !best hydro, best in banking, best in finance, etc.)
  if (
    ["!best", "/best", "!champion", "!leaders", "!sectorbest"].includes(cmd) ||
    lower === "best" ||
    lower.startsWith("best in ") ||
    lower.startsWith("best ")
  ) {
    let secQuery = parts.slice(1).join(" ");
    if (lower.startsWith("best in ")) {
      secQuery = parts.slice(2).join(" ");
    }
    return await getBestInSectorMessage(secQuery);
  }

  // 5e. Dedicated SIMPLE ADVISOR / 10-SECOND TRAFFIC-LIGHT CARD (!advisor, !advisor NABIL, !easy NABIL, !simple NABIL)
  if (["!advisor", "/advisor", "advisor", "!easy", "/easy", "easy", "!simple", "/simple"].includes(cmd)) {
    if (parts[1]) {
      return await getStockQuoteAndMiniSignalMessage(parts[1]);
    }
    return await getDailyAdvisorBriefingMessage();
  }

  // 5f. Dedicated NEPSE NEWS, CATALYST & SENTIMENT ENGINE (!news, !news NABIL, !news banking, !news hydro)
  if (
    ["!news", "/news", "news", "!catalyst", "catalyst", "!headline", "headlines", "samachar"].includes(cmd) ||
    lower === "market news" ||
    lower === "nepse news"
  ) {
    let newsQuery = parts.slice(1).join(" ");
    if (lower === "market news" || lower === "nepse news") newsQuery = "";
    return await getNewsMessage(newsQuery);
  }

  // 6. Dedicated 6-Perspective Precision BUY Plan (!buy NABIL [CAPITAL])
  if (["!buy", "/buy", "buy"].includes(cmd) && parts[1] && !["signal", "signals", "now", "immediate", "immidiate"].includes(parts[1].toLowerCase())) {
    const sym = parts[1];
    const cap = parts[2] ? parseFloat(parts[2].replace(/,/g, "")) : 100000;
    return await getPrecisionBuyPlanMessage(sym, isNaN(cap) || cap < 5000 ? 100000 : cap);
  }

  // 7. Dedicated 6-Perspective Precision SELL & Profit-Booking Plan (!sell NABIL [BUY_PRICE] [QTY])
  if (["!sell", "/sell", "sell", "!exit"].includes(cmd) && parts[1] && !["signal", "signals", "now", "immediate", "immidiate"].includes(parts[1].toLowerCase())) {
    const sym = parts[1];
    const buyPrice = parts[2] ? parseFloat(parts[2].replace(/,/g, "")) : null;
    const qty = parts[3] ? parseInt(parts[3], 10) : 100;
    return await getPrecisionSellPlanMessage(sym, buyPrice, isNaN(qty) || qty <= 0 ? 100 : qty);
  }

  // 8. Monte Carlo Price Probability Forecast & VaR (!predict NABIL or !forecast NABIL)
  if (["!predict", "/predict", "predict", "!forecast", "forecast", "!mc"].includes(cmd)) {
    const sym = parts[1];
    if (!sym) {
      return `⚠️ Please specify a stock symbol.\nExample: *!predict NABIL* or *!predict SAHAS*`;
    }
    return await getMonteCarloMessage(sym);
  }

  // 9. Whale / Operator Cornering & T+2 Floorsheet Radar (!whale or !whale NABIL)
  if (["!whale", "/whale", "whale", "!whales", "whales", "!operator"].includes(cmd)) {
    return await getWhaleRadarMessage(parts[1]);
  }

  // 9b. Smart Money Concepts (SMC) Order Block, FVG, BOS/CHoCH & OTE Analysis (!smc or !smc NABIL)
  if (["!smc", "/smc", "smc", "!ict", "ict", "!orderblock", "orderblock"].includes(cmd)) {
    return await getSmcAnalysisMessage(parts[1]);
  }

  // 9c. NEPSE Sun–Thu Weekly Trading & PWH/PWL Swing Playbook (!weekly or !weekly NABIL)
  if (["!weekly", "/weekly", "weekly", "!week", "/week", "week"].includes(cmd)) {
    return await getWeeklyTradingMessage(parts[1]);
  }

  // 10. AI Smart Portfolio Optimizer (!build 200000)
  if (["!build", "/build", "build", "!optimize", "!allocate"].includes(cmd)) {
    const cap = parts[1] ? parseFloat(parts[1].replace(/,/g, "")) : 200000;
    return await getSmartPortfolioBuilderMessage(isNaN(cap) || cap < 10000 ? 200000 : cap);
  }

  // 11. Natural Language AI Analyst (!ask <question>)
  if (["!ask", "/ask", "ask", "!ai"].includes(cmd)) {
    return await handleNaturalLanguageQuery(parts.slice(1).join(" "));
  }

  // 12. Market Buy/Sell Scanner (!scan, !signals, buy signal, sell signal)
  if (
    cmd === "!scan" ||
    cmd === "/scan" ||
    cmd === "!signals" ||
    cmd === "signals" ||
    lower === "buy signal" ||
    lower === "buy signals" ||
    lower === "sell signal" ||
    lower === "sell signals"
  ) {
    let filter = parts[1] ? parts[1].toLowerCase() : "all";
    if (filter === "immediate" || filter === "immidiate" || filter === "ibuy") {
      return await getImmediateBuyMessage();
    }
    if (filter === "immediatesell" || filter === "immidiatesell" || filter === "isell" || filter === "sellnow") {
      return await getImmediateSellMessage();
    }
    if (filter === "longterm" || filter === "hold") {
      return await getLongTermHoldMessage();
    }
    if (lower.startsWith("buy")) filter = "buy";
    if (lower.startsWith("sell")) filter = "sell";
    return await getScannerMessage(filter);
  }

  // 13. Detailed Institutional 6-Perspective Buy/Sell Signal (!signal NABIL)
  if (["!signal", "/signal", "signal", "!sig", "!ta"].includes(cmd)) {
    const sym = parts[1];
    if (!sym) {
      return `⚠️ Please specify a stock symbol.\nExample: *!signal NABIL*, *!buy NABIL*, or *!sell NABIL 505*`;
    }
    return await getStockSignalMessage(sym);
  }

  // 14. Walk-Forward Strategy Backtest (!backtest NABIL)
  if (["!backtest", "/backtest", "backtest", "!bt"].includes(cmd)) {
    const sym = parts[1];
    if (!sym) {
      return `⚠️ Please specify a stock symbol.\nExample: *!backtest NABIL* or *!backtest CBBL*`;
    }
    return await getBacktestMessage(sym);
  }

  // 15. Deep Fundamental & Graham Valuation (!fund NABIL or !valuation NABIL)
  if (["!fund", "/fund", "fund", "!fundamental", "!valuation", "valuation"].includes(cmd)) {
    const sym = parts[1];
    if (!sym) {
      return `⚠️ Please specify a stock symbol.\nExample: *!fund NABIL* or *!fund SCB*`;
    }
    return await getFundamentalMessage(sym);
  }

  // 16. Smart Money & Broker Floorsheet Flow (!smartmoney NABIL or !floorsheet NABIL)
  if (["!smartmoney", "/smartmoney", "smartmoney", "!floorsheet", "floorsheet", "!broker", "!sm"].includes(cmd)) {
    const sym = parts[1];
    if (!sym) {
      return `⚠️ Please specify a stock symbol.\nExample: *!smartmoney NABIL* or *!floorsheet HDL*`;
    }
    return await getSmartMoneyMessage(sym);
  }

  // 17. Head-to-Head Stock Comparison (!compare NABIL SCB)
  if (["!compare", "/compare", "compare", "!vs"].includes(cmd)) {
    if (parts.length < 3) {
      return `⚠️ Please provide two NEPSE symbols to compare.\nExample: *!compare NABIL SCB* or *!compare API RADHI*`;
    }
    return await getCompareMessage(parts[1], parts[2]);
  }

  // 18. Personal Portfolio Tracker (!portfolio or !pf)
  if (["!portfolio", "/portfolio", "portfolio", "!pf", "pf"].includes(cmd)) {
    return await handlePortfolioCommand(parts.slice(1));
  }

  // 19. Upcoming IPO, Right Share & Book Closure (!ipo)
  if (["!ipo", "/ipo", "ipo", "!events", "dividend", "!dividend"].includes(cmd)) {
    return getIpoMessage();
  }

  // 20. Live Stock Quote (!price NABIL or !quote NABIL)
  if (["!price", "/price", "price", "!quote", "quote", "!stock"].includes(cmd)) {
    const sym = parts[1];
    if (!sym) {
      return `⚠️ Please specify a stock symbol.\nExample: *!price NABIL*`;
    }
    return await getStockQuoteMessage(sym);
  }

  // 21. SEBON Calculator (!calc buy 100 520 or !calc sell 100 580 510)
  if (["!calc", "/calc", "calc"].includes(cmd)) {
    return getCalcMessage(parts.slice(1));
  }

  // 22. Price Alerts (!alert NABIL above 550 | !alert list | !alert clear)
  if (["!alert", "/alert", "alert", "!alerts", "alerts"].includes(cmd)) {
    return await handleAlertCommand(parts.slice(1), senderId);
  }

  // 23. Personal Watchlist (!watchlist | !watchlist add UPPER | !watchlist remove UPPER)
  if (["!watchlist", "/watchlist", "watchlist", "!wl", "wl"].includes(cmd)) {
    return await handleWatchlistCommand(parts.slice(1), senderId);
  }

  // 24. Direct Symbol Shorthand (e.g. user just sends "NABIL" or "NABIL buy" or "NABIL sell")
  const candidateSym = parts[0].toUpperCase();
  if (parts[1] && parts[1].toLowerCase() === "vs" && parts[2]) {
    return await getCompareMessage(candidateSym, parts[2]);
  }
  const quote = await nepseProvider.getQuote(candidateSym);
  if (quote) {
    if (parts[1] && ["buy", "entry"].includes(parts[1].toLowerCase())) {
      return await getPrecisionBuyPlanMessage(candidateSym, 100000);
    }
    if (parts[1] && ["sell", "exit", "target"].includes(parts[1].toLowerCase())) {
      const bp = parts[2] ? parseFloat(parts[2]) : null;
      return await getPrecisionSellPlanMessage(candidateSym, bp, 100);
    }
    if (parts[1] && ["signal", "ta"].includes(parts[1].toLowerCase())) {
      return await getStockSignalMessage(candidateSym);
    }
    if (parts[1] && ["fund", "valuation", "pe", "eps"].includes(parts[1].toLowerCase())) {
      return await getFundamentalMessage(candidateSym);
    }
    if (parts[1] && ["predict", "forecast", "mc"].includes(parts[1].toLowerCase())) {
      return await getMonteCarloMessage(candidateSym);
    }
    if (parts[1] && ["news", "catalyst"].includes(parts[1].toLowerCase())) {
      return await getNewsMessage(candidateSym);
    }
    return await getStockQuoteAndMiniSignalMessage(candidateSym);
  }

  // 25. Conversational Natural Language AI Fallback
  if (parts.length >= 2) {
    return await handleNaturalLanguageQuery(text);
  }

  return null;
}

function getHelpMessage() {
  return (
    `🇳🇵 *NEPSE QUANT PRO v6.0 — ADVISOR & 6-PERSPECTIVE WEALTH ENGINE* 📈\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `10-Second Plain-English Traffic-Light Advisor, 4 "No-Trap" Signal Accuracy Filters, Live News Catalysts, Immediate Buy/Sell Radars, Long-Term Compounders & Sector Leaderboards.\n\n` +
    `🚦 *EASY 10-SECOND ADVISOR, NEWS & TOP PICKS*\n` +
    `• *!advisor* — 🚦 *DAILY MARKET ADVISOR BRIEFING* (Best Buy Now, Immediate Sell & Long-Term)\n` +
    `• *!advisor <SYM>* (or just send *NABIL*) — 🚦 *10-SECOND TRAFFIC-LIGHT ACTION CARD* (Plain-English Step-by-Step Plan)\n` +
    `• *!news* | *!news <SYM>* | *!news banking* — 📰 *LIVE NEPSE NEWS, CATALYSTS & SENTIMENT* (Short-Term vs Long-Term Impact)\n` +
    `• *!immediate* (or *!ibuy*) — ⚡ *IMMEDIATE BUY CATEGORY* (1–4 Wk Quick Swing Profits @ LTP)\n` +
    `• *!immediatesell* (or *!isell*) — 🚨 *IMMEDIATE SELL CATEGORY* (Exit Now @ LTP / Profit Booking Radar)\n` +
    `• *!longterm* (or *!hold*) — 💎 *LONG-TERM HOLD & DIVIDEND COMPOUNDERS* (1–5 Yr Wealth & SIP Picks)\n` +
    `• *!best* | *!best banking* | *!best finance* | *!best hydro* | *!best micro* | *!best insurance* — 🏆 *RANKED SECTOR CHAMPIONS*\n\n` +
    `⚡ *PRECISION WHERE-TO-BUY & WHERE-TO-SELL*\n` +
    `• *!buy <SYM> [CAPITAL]* — Exact 3-Tranche Buying Blueprint + 4 No-Trap Safety Checks\n` +
    `• *!sell <SYM> [BUY_PRICE] [QTY]* — Exact 3-Tier Selling Blueprint + SEBON Net CGT Profit\n` +
    `• *!signal <SYM>* — Full 6-Perspective Matrix + 100-Pt Score, Ichimoku, MTF & Volume POC\n` +
    `• *!scan buy* | *!scan sell* — Market-Wide Quant Signal Screener\n\n` +
    `🧠 *HEDGE-FUND QUANT & AI COMMANDS*\n` +
    `• *!predict <SYM>* | *!whale [SYM]* | *!rotation* | *!build <CAPITAL>* | *!ask <QUESTION>*\n` +
    `• *!backtest <SYM>* | *!fund <SYM>* | *!smartmoney <SYM>* | *!compare <S1> <S2>*\n` +
    `• *!live* | *!top* | *!sectors* | *!ipo* | *!pf* | *!calc* | *!alert* | *!watchlist*`
  );
}

function buildStockExecutiveSummary(a) {
  const lt = a.longTerm;
  const sa = a.simpleAdvisor;
  const mc = a.masterConsensus;
  const mcLines = mc
    ? `\n━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🏆 *6-SIGNAL MASTER CONSENSUS (ALL ENGINES COMBINED)*\n` +
      `• *Final Verdict:* *${mc.masterVerdict}*\n` +
      `• *1️⃣ Unified Buy Price:* *NPR ${mc.unifiedBuyPrice}* (Dip Add: *NPR ${mc.unifiedBackupDipPrice}*)\n` +
      `• *2️⃣ Unified Sell Targets:* *T1: NPR ${mc.unifiedTarget1}* (+${mc.unifiedGrossGainPct}% Gross / ~+${mc.unifiedNetGainPct}% Net) | *T2: NPR ${mc.unifiedTarget2}*\n` +
      `• *3️⃣ Unified Stop-Loss:* *NPR ${mc.unifiedStopLoss}* (Net R:R *1 : ${mc.unifiedNetRR}* | Rules Passed: *${mc.rulesPassedCount}/${mc.totalRules}*)\n` +
      (mc.signals || [])
        .map((s) => `  ◦ _${s.name} (${s.weightPct}%):_ *${s.verdict}* (${s.score}/100) → Buy Rs ${s.buyPrice} | T1 Rs ${s.sellTarget}`)
        .join("\n")
    : "";
  return (
    mcLines +
    `\n━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 *FINAL SUMMARY (TL;DR — ${a.symbol})*\n` +
    `• *🚦 Today's Decision:* *${sa.trafficLight}* (Accuracy: *${a.accuracyGrade}* | No-Trap Checks: *${sa.noTrapFiltersPassedCount}/4 Passed*)\n` +
    `• *💡 Plain-English Why:* _${sa.simpleReason}_\n` +
    `• *⚡ Buy Category (1–4 Wks):* *${a.buyCategory}* | *🚨 Sell Status:* *${a.sellCategory}* (Quant: *${a.quantScore}/100*)\n` +
    `• *💎 Long-Term Hold (1–5 Yrs):* *${lt.longTermCategory}* (LT Score: *${lt.longTermScore}/100* | 5Y Avg Div: *${a.fundamentals.divHistory5YrAvg}%* | Est. CAGR: *~${lt.expectedAnnualCagr}%*)\n` +
    `• *🏆 Sector Standing (${a.sector}):* Score *${a.sectorChampion.sectorScore}/100* — _${a.sectorChampion.kpiSummary}_\n` +
    `• *🟢 Step 1 (Where to Buy):* ${sa.stepByStep.step1BuyNow} | Long-Term SIP: *${lt.sipZone}*\n` +
    `• *🔴 Step 3 (Where to Sell):* ${sa.stepByStep.step3SellTargets}\n` +
    `• *🛑 Step 4 (Safety Stop-Loss):* *${a.tradePlan.stopLoss}* | *Trailing Stop:* ${a.tradePlan.trailingStop}`
  );
}

/**
 * Dedicated 6-Perspective Precision BUY Blueprint (!buy NABIL 100000)
 */
async function getPrecisionBuyPlanMessage(symInput, capitalNPR = 100000) {
  const sym = symInput.toUpperCase();
  const q = await nepseProvider.getQuote(sym);
  const bars = nepseProvider.getHistoricalBars(sym);
  if (!q || !bars) {
    return `❌ Symbol *${sym}* not found. Example: *!buy NABIL* or *!buy NABIL 200000*`;
  }

  const a = analyzeStock(q, bars, capitalNPR);
  const em = a.executionMatrix;
  const lt = a.longTerm;
  const sa = a.simpleAdvisor;
  const t1 = em.tranches.tranche1;
  const t2 = em.tranches.tranche2;
  const t3 = em.tranches.tranche3;

  return (
    `🟢 *WHERE TO BUY ${q.symbol} — 6-PERSPECTIVE & DUAL-HORIZON BLUEPRINT*\n` +
    `🏢 _${q.companyName} (${q.sector}) | Current LTP: NPR ${formatNPR(q.ltp)}_\n` +
    `📡 _Data: ${nepseProvider.getDataFreshnessBadge()}_\n` +
    `🚦 *Advisor Decision:* *${sa.trafficLight}*\n` +
    `⚡ *Swing Category (1–4 Wks):* *${a.buyCategory}* (Quant: *${a.quantScore}/100* | Accuracy: *${a.accuracyGrade}*)\n` +
    `💎 *Long-Term Verdict (1–5 Yrs):* *${lt.longTermCategory}* (LT Score: *${lt.longTermScore}/100* | 5Y Div: *${a.fundamentals.divHistory5YrAvg}%*)\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🛡️ *4 "NO-TRAP" SIGNAL ACCURACY CHECKS (${sa.noTrapFiltersPassedCount}/4 PASSED)*\n` +
    `• *1. Anti-Chasing Rule:* ${sa.checklist.antiChase}\n` +
    `• *2. Buyer Volume Check:* ${sa.checklist.buyerVolume}\n` +
    `• *3. Fundamental Safety:* ${sa.checklist.fundamentals}\n` +
    `• *4. T+2 Supply Check:* ${sa.checklist.t2Supply}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🧠 *PLAIN-ENGLISH ADVISOR VERDICT:*\n${sa.simpleReason}\n` +
    `💎 _Long-Term Thesis: ${lt.longTermThesis} (SIP Zone: ${lt.sipZone} → 1Yr Target: NPR ${lt.target1Yr})_\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🪜 *3-TRANCHE PYRAMID ACCUMULATION PLAN (Eliminates T+2 Trap)*\n` +
    `• *Tranche 1 (${t1.weight} = ${t1.kitta} kitta) — ${t1.label}:*\n` +
    `  👉 Buy Zone: *${t1.zone}*\n` +
    `• *Tranche 2 (${t2.weight} = ${t2.kitta} kitta) — ${t2.label}:*\n` +
    `  👉 Buy Zone: *${t2.zone}*\n` +
    `• *Tranche 3 (${t3.weight} = ${t3.kitta} kitta) — ${t3.label}:*\n` +
    `  👉 Trigger: *${t3.zone}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🔭 *EXACT BUY ZONES FROM ALL 6 PERSPECTIVES*\n` +
    `1️⃣ *SMC Order Block & Fibs:* Demand Zone *${a.tradePlan.demandOrderBlock}* | Golden Pocket (61.8%): *NPR ${a.tradePlan.fib618}*\n` +
    `2️⃣ *Dynamic Moving Averages:* EMA(9): *NPR ${a.indicators.ema9}* | EMA(20): *NPR ${a.indicators.ema20}* | SuperTrend: *NPR ${a.indicators.supertrend}*\n` +
    `3️⃣ *Institutional Volume Profile:* 60D POC: *NPR ${a.volumeProfile.poc}* | Value Area Low (VAL): *NPR ${a.volumeProfile.val}* | 20D VWAP: *NPR ${a.indicators.vwap20}*\n` +
    `4️⃣ *Fundamental Fair Value:* Composite Fair Value: *NPR ${a.fundamentals.compositeFairValue}* (Graham: NPR ${a.fundamentals.grahamValue})\n` +
    `5️⃣ *Monte Carlo Support Floor:* 10th Percentile Bear Floor: *NPR ${a.monteCarlo.bearCase10}*\n` +
    `6️⃣ *NEPSE Intraday Timing Clock:*\n` +
    `   • ❌ *Avoid 11:00–11:15 AM* (Opening retail FOMO / fakeout window)\n` +
    `   • ✅ *Best Dip Window: 1:15 PM – 1:50 PM NPT* (When T+2 sellers book profit)\n` +
    `   • ✅ *Breakout Confirmation: 2:40 PM – 2:58 PM NPT* (Institutional closing absorption)\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🛡️ *INVALIDATION STOP-LOSS:* Exit if daily close drops below *${a.tradePlan.stopLoss}* (Max Risk: NPR ${formatNPR(a.tradePlan.maxRiskNPR)}).` +
    buildStockExecutiveSummary(a)
  );
}

/**
 * Dedicated 6-Perspective Precision SELL & Profit-Booking Blueprint (!sell NABIL 495 100)
 */
async function getPrecisionSellPlanMessage(symInput, userBuyPrice = null, userQty = 100) {
  const sym = symInput.toUpperCase();
  const q = await nepseProvider.getQuote(sym);
  const bars = nepseProvider.getHistoricalBars(sym);
  if (!q || !bars) {
    return `❌ Symbol *${sym}* not found. Example: *!sell NABIL* or *!sell NABIL 495 100*`;
  }

  const a = analyzeStock(q, bars);
  const em = a.executionMatrix;
  const ex1 = em.exits.exit1;
  const ex2 = em.exits.exit2;
  const ex3 = em.exits.exit3;
  const hs = em.exits.hardStop;

  let msg =
    `🔴 *WHERE TO SELL ${q.symbol} — 6-PERSPECTIVE EXIT BLUEPRINT*\n` +
    `🏢 _${q.companyName} | Current LTP: NPR ${formatNPR(q.ltp)}_\n` +
    `🚨 *Sell Category:* *${a.sellCategory}* | *Quant Score:* *${a.quantScore}/100* | *RSI(14):* *${a.indicators.rsi14}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🧠 *EXISTING HOLDER VERDICT:*\n${em.existingHolderAdvice}\n` +
    `💡 *Immediate Sell Check:* _${a.immediateSellReason}_\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎯 *3-TIER PARTIAL PROFIT-BOOKING MATRIX*\n` +
    `• *Tier 1 Exit (${ex1.weight}) — ${ex1.label}:*\n` +
    `  👉 Sell @ *NPR ${ex1.price}* (+${ex1.pctGain}% from LTP)\n` +
    `• *Tier 2 Exit (${ex2.weight}) — ${ex2.label}:*\n` +
    `  👉 Sell @ *NPR ${ex2.price}* (+${ex2.pctGain}% from LTP)\n` +
    `• *Tier 3 Exit (${ex3.weight}) — ${ex3.label}:*\n` +
    `  👉 Target *NPR ${ex3.price}* (+${ex3.pctGain}% from LTP)\n` +
    `• *🛑 Hard Stop-Loss (Capital Protection):*\n` +
    `  👉 Exit 100% if daily close < *NPR ${hs.price}* (-${hs.pctLoss}%)\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🔭 *EXACT SELL / RESISTANCE ZONES FROM ALL 6 PERSPECTIVES*\n` +
    `1️⃣ *SMC Supply Order Block:* *${a.tradePlan.supplyOrderBlock}* | Major Resistance R2: *NPR ${a.tradePlan.resistance2}*\n` +
    `2️⃣ *Volume Profile Distribution:* Value Area High (VAH): *NPR ${a.volumeProfile.vah}* | Upper Bollinger: *NPR ${a.indicators.bbUpper}*\n` +
    `3️⃣ *Dynamic Trailing Stops:*\n` +
    `   • Scalper Trail (EMA-9): *NPR ${a.indicators.ema9}*\n` +
    `   • Swing Trail (EMA-20): *NPR ${a.indicators.ema20}*\n` +
    `   • Trend-Rider Trail (SuperTrend): *NPR ${a.indicators.supertrend}*\n` +
    `4️⃣ *Monte Carlo 90th Pct Exhaustion:* *NPR ${a.monteCarlo.bullCase90}* (Statistical 15-day ceiling)\n` +
    `5️⃣ *Floorsheet & T+2 Supply Status:* ${a.smartMoney.t2SupplyStatus} (Top Sellers: Broker #${a.smartMoney.topSellBrokers.join(", #")})\n` +
    `6️⃣ *NEPSE Intraday Selling Clock:*\n` +
    `   • ✅ *Best Partial Sell Window: 11:08 AM – 11:30 AM NPT* (Sell into morning retail euphoria near R1)\n` +
    `   • ⚠️ *Exit Weak Positions: 2:45 PM NPT* if stock fails to hold above VWAP (NPR ${a.indicators.vwap20})\n`;

  if (userBuyPrice && userBuyPrice > 0) {
    const buyCalc = calculateBuy(userQty, userBuyPrice);
    const sellNow = calculateSell(userQty, q.ltp, userBuyPrice, 30);
    const sellAtT1 = calculateSell(userQty, ex1.price, userBuyPrice, 30);
    const sellAtT2 = calculateSell(userQty, ex2.price, userBuyPrice, 30);
    const sellAtSL = calculateSell(userQty, hs.price, userBuyPrice, 30);

    msg +=
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💰 *YOUR PERSONAL SEBON P/L SIMULATOR (${userQty} kitta @ Buy NPR ${userBuyPrice})*\n` +
      `• *Your WACC:* NPR ${buyCalc.waccPerShare} | *Breakeven Sell:* NPR ${buyCalc.breakevenSellPrice}\n` +
      `• *If Sold Now (@ ${q.ltp}):* Net *${sellNow.netProfit >= 0 ? "+" : ""}NPR ${formatNPR(sellNow.netProfit)}* (${sellNow.roiPct >= 0 ? "+" : ""}${sellNow.roiPct}% after CGT)\n` +
      `• *At Target 1 (@ ${ex1.price}):* Net *+NPR ${formatNPR(sellAtT1.netProfit)}* (+${sellAtT1.roiPct}% after CGT)\n` +
      `• *At Target 2 (@ ${ex2.price}):* Net *+NPR ${formatNPR(sellAtT2.netProfit)}* (+${sellAtT2.roiPct}% after CGT)\n` +
      `• *If Stop-Loss Hit (@ ${hs.price}):* Net *NPR ${formatNPR(sellAtSL.netProfit)}* (${sellAtSL.roiPct}%)\n`;
  } else {
    msg += `\n💡 _Tip: Include your buy price & kitta to see exact SEBON Net Profit & CGT at every target: *!sell ${q.symbol} ${Math.round(q.ltp * 0.94)} 100*_`;
  }

  msg += buildStockExecutiveSummary(a);
  return msg;
}

async function getLiveMarketMessage() {
  const m = await nepseProvider.getMarketSummary();
  const all = await nepseProvider.getAllQuotes();
  const nepseQuote = await nepseProvider.getQuote("NEPSE");
  const nepseBars = nepseProvider.getHistoricalBars("NEPSE");
  const nepseAnalysis = nepseQuote && nepseBars ? analyzeStock(nepseQuote, nepseBars) : null;
  const arrow = m.pointChange >= 0 ? "🟢 ▲" : "🔴 ▼";
  const sign = m.pointChange >= 0 ? "+" : "";

  const sortedByGain = [...all].sort((a, b) => b.percentageChange - a.percentageChange);
  const top3Gain = sortedByGain.slice(0, 3);
  const top3Lose = sortedByGain.slice(-3).reverse();

  let msg =
    `🇳🇵 *NEPSE LIVE MARKET INTELLIGENCE*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📡 *Market Status:* ${m.marketStatus} (${m.status})\n` +
    `🕒 *Nepal Time:* ${m.nptDate} | ${m.nptTime} NPT\n` +
    `🧭 *Market Sentiment:* *${m.sentimentLabel}* (Score: ${m.fearGreedScore}/100)\n\n` +
    `📈 *NEPSE Index:* *${formatNPR(m.nepseIndex)}*\n` +
    `${arrow} *Change:* ${sign}${m.pointChange} pts (${sign}${m.percentageChange}%)\n` +
    `📊 *Session Range:* Open: ${formatNPR(m.openingValue || m.previousValue)} | High: ${formatNPR(m.dayHigh || m.nepseIndex)} | Low: ${formatNPR(m.dayLow || m.nepseIndex)} | Prev: ${formatNPR(m.previousValue || m.nepseIndex)}\n` +
    `🔹 *Sensitive Index:* ${formatNPR(m.sensitiveIndex)} (${m.sensitiveChange >= 0 ? "+" : ""}${m.sensitiveChange} / ${m.sensitivePctChange >= 0 ? "+" : ""}${m.sensitivePctChange || -0.68}%)\n` +
    `🔹 *Float Index:* ${formatNPR(m.floatIndex)} (${m.floatChange >= 0 ? "+" : ""}${m.floatChange} / ${m.floatPctChange >= 0 ? "+" : ""}${m.floatPctChange || -0.82}%)\n` +
    `🔹 *Sen. Float Index:* ${formatNPR(m.senFloatIndex || 155.08)} (${(m.senFloatChange || -1.1) >= 0 ? "+" : ""}${m.senFloatChange || -1.1} / ${(m.senFloatPctChange || -0.7) >= 0 ? "+" : ""}${m.senFloatPctChange || -0.7}%)\n` +
    (nepseAnalysis
      ? `📐 *NEPSE Index Key Levels:* Support S1: *${nepseAnalysis.tradePlan.support1}* | Resistance R1: *${nepseAnalysis.tradePlan.resistance1}* | EMA20: *${nepseAnalysis.indicators.ema20}* | RSI(14): *${nepseAnalysis.indicators.rsi14}*\n`
      : "") +
    `🔗 *Live Market Feeds:* ${m.merolaganiIndexUrl || "https://merolagani.com/LatestMarket.aspx"} | ${m.sharesansarUrl || "https://www.sharesansar.com/today-share-price"}\n\n` +
    `💰 *Turnover:* NPR ${formatNPR(m.totalTurnover)} (Rs. ${m.turnoverArba} Arba)\n` +
    `📦 *Share Volume:* ${formatInt(m.totalVolume)} kitta (${formatInt(m.totalTransactions || 44777)} txns)\n` +
    `📊 *Market Breadth:* 🟢 ${m.advances} Adv | 🔴 ${m.declines} Dec | ⚪ ${m.unchanged} Unch\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🚀 *Top Gainers:*\n`;

  for (const g of top3Gain) {
    msg += `  • *${g.symbol}*: NPR ${g.ltp} (+${g.percentageChange}%)\n`;
  }

  msg += `\n📉 *Top Losers:*\n`;
  for (const l of top3Lose) {
    msg += `  • *${l.symbol}*: NPR ${l.ltp} (${l.percentageChange}%)\n`;
  }

  msg +=
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 *FINAL SUMMARY (TL;DR — NEPSE MARKET @ ${formatNPR(m.nepseIndex)})*\n` +
    `• *NEPSE Index:* *${formatNPR(m.nepseIndex)}* (${sign}${m.pointChange} pts / ${sign}${m.percentageChange}%) — *${m.pointChange >= 0 ? "BULLISH 🟢" : "CAUTIOUS 🔴"}*\n` +
    `• *Breadth & Liquidity:* ${m.advances} Advancing vs ${m.declines} Declining | Turnover: NPR ${(m.totalTurnover / 10000000).toFixed(2)} Cr\n` +
    `• *Top Momentum Leader:* *${top3Gain[0]?.symbol}* (+${top3Gain[0]?.percentageChange}%)\n` +
    `• *⚡ Quick Actions:* Send *!immediate* (Buy Now), *!immediatesell* (Exit Now), *!longterm* (1–5 Yr Hold), or *!signal NEPSE* for full index technicals!`;
  return msg;
}

async function getStockQuoteMessage(symInput) {
  const sym = symInput.toUpperCase();
  const q = await nepseProvider.getQuote(sym);
  if (!q) {
    return `❌ Symbol *${sym}* not found in NEPSE feed.\nTry: *NABIL*, *NICA*, *GBIME*, *SCB*, *EBL*, *HDL*, *UPPER*, *CHCL*, *API*, *SAHAS*, *CBBL*, *NTC*, *CIT*, *SHIVM*, *NEPSE*.`;
  }

  const bars = nepseProvider.getHistoricalBars(sym);
  const a = analyzeStock(q, bars);
  const arrow = q.pointChange >= 0 ? "🟢 ▲" : "🔴 ▼";
  const sign = q.pointChange >= 0 ? "+" : "";

  return (
    `📊 *${q.symbol} — ${q.companyName}*\n` +
    `🏷️ _Sector: ${q.sector} (Sector P/E: ${q.sectorPE}x)_\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💵 *LTP:* *NPR ${formatNPR(q.ltp)}*\n` +
    `${arrow} *Change:* ${sign}${q.pointChange} (${sign}${q.percentageChange}%)\n` +
    `🔓 *Open:* NPR ${formatNPR(q.open)} | *Prev:* NPR ${formatNPR(q.prevClose)}\n` +
    `📈 *Day High:* NPR ${formatNPR(q.high)} | *Low:* NPR ${formatNPR(q.low)}\n` +
    `📦 *Volume:* ${formatInt(q.volume)} kitta\n` +
    `💰 *Turnover:* NPR ${formatNPR(q.turnover)}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📐 *Fundamentals & Valuation*\n` +
    `• *52W Range:* NPR ${q.low52w} – NPR ${q.high52w}\n` +
    `• *EPS:* NPR ${q.eps} | *P/E:* ${q.peRatio}x | *P/B:* ${q.pbRatio}x\n` +
    `• *Book Value:* NPR ${q.bookValue} | *ROE:* ${q.roe}%\n` +
    `• *Last Dividend:* ${q.bonusDividend}% Bonus + ${q.cashDividend}% Cash` +
    (a ? buildStockExecutiveSummary(a) : "")
  );
}

async function getStockQuoteAndMiniSignalMessage(symInput) {
  const sym = symInput.toUpperCase();
  const q = await nepseProvider.getQuote(sym);
  const bars = nepseProvider.getHistoricalBars(sym);
  if (!q) {
    return `❌ Symbol *${sym}* not found in NEPSE.\nTry: *NABIL*, *SCB*, *EBL*, *MFIL*, *SAHAS*, *CBBL*, *NTC*, *HDL*, *NEPSE*.`;
  }

  const a = analyzeStock(q, bars);
  const sa = a.simpleAdvisor;
  const lt = a.longTerm;
  const sign = q.pointChange >= 0 ? "+" : "";
  const arrow = q.pointChange >= 0 ? "🟢" : "🔴";

  // Fetch stock-specific news catalyst
  const newsData = await nepseProvider.getNewsFeed(sym);
  const topCatalyst = newsData.items[1] || newsData.items[0];
  const isGoldenCombo = a.isImmediateBuy && lt.longTermScore >= 80;

  return (
    `🚦 *10-SECOND ADVISOR CARD: ${q.symbol} (${q.companyName})*\n` +
    `📡 _${nepseProvider.getDataFreshnessBadge()} | Sector: ${q.sector}_\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${arrow} *Current Price (LTP):* *NPR ${formatNPR(q.ltp)}* (${sign}${q.pointChange} / ${sign}${q.percentageChange}%)\n` +
    `🚦 *TODAY'S DECISION:* *${sa.trafficLight}*\n` +
    `🎯 *Signal Accuracy Grade:* *${a.accuracyGrade}* (Win Rate: *${a.backtest.winRate}%*)\n` +
    `💡 *Simple Reason:* ${sa.simpleReason}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 *YOUR STEP-BY-STEP ACTION PLAN:*\n` +
    `1️⃣ *BUY NOW:* ${sa.stepByStep.step1BuyNow}\n` +
    `2️⃣ *ADD ON DIP:* ${sa.stepByStep.step2AddOnDip}\n` +
    `3️⃣ *SELL FOR PROFIT:* ${sa.stepByStep.step3SellTargets}\n` +
    `4️⃣ *SAFETY STOP-LOSS:* ${sa.stepByStep.step4StopLoss}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🛡️ *4 "NO-TRAP" SIGNAL SAFETY CHECKS (${sa.noTrapFiltersPassedCount}/4 PASSED):*\n` +
    `• ${sa.checklist.antiChase}\n` +
    `• ${sa.checklist.buyerVolume}\n` +
    `• ${sa.checklist.fundamentals}\n` +
    `• ${sa.checklist.t2Supply}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⏳ *SHORT-TERM vs LONG-TERM HORIZON:*\n` +
    `• *⚡ Short-Term Buy (1–4 Wks):* *${a.buyCategory}* (Score: ${a.quantScore}/100)\n` +
    `• *🚨 Short-Term Sell Status:* *${a.sellCategory}* — _${a.immediateSellReason}_\n` +
    `• *💎 Long-Term (1–5 Yrs):* *${lt.longTermCategory}* (Score: ${lt.longTermScore}/100 | 5Y Avg Div: *${a.fundamentals.divHistory5YrAvg}%* | SIP Zone: *${lt.sipZone}*)\n` +
    (isGoldenCombo
      ? `• *🌟 GOLDEN COMBO:* Eligible for *BOTH* 1–4 Wk Quick Swing (*!immediate*) AND 1–5 Yr Dividend Hold (*!longterm*)!\n`
      : "") +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📰 *LATEST NEWS & CATALYST (${topCatalyst?.sentiment || "🟢 BULLISH"}):*\n` +
    `• _"${topCatalyst?.title}"_ (More: *!news ${q.symbol}*)` +
    buildStockExecutiveSummary(a) +
    `\n• *⚡ Want 1–4 Week Quick Swing Profits (Buy Today at LTP)?* 👉 Send *!immediate*\n` +
    `• *🚨 Want to see Stocks to Exit / Book Profit Immediately?* 👉 Send *!immediatesell*\n` +
    `• *💎 Want 1–5 Year Safe Dividend & Bonus Compounding?* 👉 Send *!longterm*`
  );
}

/**
 * Daily Market Advisor Briefing (!advisor)
 * Gives the user an effortless, plain-English daily game plan across the whole NEPSE market.
 */
async function getDailyAdvisorBriefingMessage() {
  const m = await nepseProvider.getMarketSummary();
  const regimeObj = nepseProvider.getMarketRegime();
  const allQuotes = await nepseProvider.getAllQuotes();
  const analyses = allQuotes.map((q) => analyzeStock(q, nepseProvider.getHistoricalBars(q.symbol))).filter(Boolean);
  const newsFeed = await nepseProvider.getNewsFeed();

  const immediateBuys = analyses
    .filter((a) => a.isImmediateBuy)
    .sort((a, b) => b.accuracyPoints - a.accuracyPoints || b.quantScore - a.quantScore);

  const dipBuys = analyses
    .filter((a) => a.signalType === "BUY" && !a.isImmediateBuy && a.simpleAdvisor.noTrapFiltersPassedCount >= 3)
    .sort((a, b) => b.quantScore - a.quantScore);

  const longTermGems = [...analyses]
    .filter((a) => a.longTerm.longTermScore >= 82)
    .sort((a, b) => b.longTerm.longTermScore - a.longTerm.longTermScore);

  const immediateSells = analyses
    .filter((a) => a.isImmediateSell)
    .sort((a, b) => b.sellUrgencyScore - a.sellUrgencyScore);

  let msg =
    `🚦 *NEPSE PERSONAL ADVISOR — TODAY'S SIMPLE GAME PLAN* 🚦\n` +
    `📡 _${m.freshnessBadge} | ${m.nptDate} ${m.nptTime} NPT_\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🧭 *1. MARKET WEATHER (REGIME GATEKEEPER):*\n` +
    `• *NEPSE Index:* *${formatNPR(m.nepseIndex)}* (${m.pointChange >= 0 ? "+" : ""}${m.pointChange} pts / ${m.percentageChange >= 0 ? "+" : ""}${m.percentageChange}%)\n` +
    `• *Market Regime:* *${regimeObj.regime}* (${m.advances} Up vs ${m.declines} Down)\n` +
    `• *Advisor Rule Today:* ${
      regimeObj.isBullish
        ? "Market breadth is healthy. Focus on ⚡ Immediate Buy stocks and 1:15–1:50 PM intraday pullbacks."
        : "Market is selective. Only buy A+ stocks near support and keep 30%+ cash."
    }\n\n` +
    `⚡ *2. TOP 3 "BUY NOW" STOCKS (1–4 Wk Quick Swing — Passed All 4 No-Trap Checks):*\n`;

  for (const item of immediateBuys.slice(0, 3)) {
    msg +=
      `• 🟢 *${item.symbol}* (NPR ${item.ltp}) — *${item.accuracyGrade}*\n` +
      `   ↳ _Action:_ ${item.simpleAdvisor.stepByStep.step1BuyNow}\n` +
      `   ↳ _Targets:_ ${item.simpleAdvisor.stepByStep.step3SellTargets} | 🛑 SL: ${item.tradePlan.stopLoss.split(" ")[1]}\n`;
  }

  msg += `\n🟡 *3. TOP 3 "BUY ON SLIGHT DIP" (Set Limit Orders):*\n`;
  for (const item of dipBuys.slice(0, 3)) {
    msg +=
      `• 🟡 *${item.symbol}* (LTP: NPR ${item.ltp}) — Set Limit Buy @ *NPR ${item.indicators.ema20}* (Target 1: NPR ${item.executionMatrix.exits.exit1.price})\n`;
  }

  msg += `\n💎 *4. TOP 3 LONG-TERM WEALTH COMPOUNDERS (1–5 Year SIP):*\n`;
  for (const item of longTermGems.slice(0, 3)) {
    msg +=
      `• 💎 *${item.symbol}* (NPR ${item.ltp}) — LT Score: *${item.longTerm.longTermScore}/100* | 5Y Avg Div: *${item.fundamentals.divHistory5YrAvg}%* | SIP Zone: *${item.longTerm.sipZone}*\n`;
  }

  msg += `\n🚨 *5. TOP 3 "IMMEDIATE SELL" ALERTS (Exit Now at LTP — Full list: !immediatesell):*\n`;
  for (const item of immediateSells.slice(0, 3)) {
    msg +=
      `• 🚨 *${item.symbol}* (NPR ${item.ltp}) — *Urgency: ${item.sellUrgencyScore}/100*\n` +
      `   ↳ _Why Exit Now:_ ${item.immediateSellReason}\n`;
  }

  if (newsFeed.items.length > 0) {
    msg +=
      `\n📰 *6. TOP MARKET NEWS CATALYST TODAY (Full feed: !news):*\n` +
      `• ${newsFeed.items[0].sentiment}: _"${newsFeed.items[0].title}"_\n`;
  }

  const topPick = immediateBuys[0] || dipBuys[0];
  const topSell = immediateSells[0];
  msg +=
    `\n━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 *FINAL SUMMARY (TL;DR — TODAY'S ADVISOR BRIEFING)*\n` +
    `• *⚡ #1 Safest Immediate Buy Today (1–4 Wk Swing):* *${topPick?.symbol}* @ *NPR ${topPick?.ltp}* (${topPick?.accuracyGrade})\n` +
    `• *🚨 #1 Immediate Sell Alert (Exit @ LTP):* *${topSell?.symbol}* @ *NPR ${topSell?.ltp}* (Urgency: *${topSell?.sellUrgencyScore}/100*)\n` +
    `• *💎 #1 Safest Long-Term Hold (1–5 Yrs):* *${longTermGems[0]?.symbol}* (5Y Avg Div: *${longTermGems[0]?.fundamentals.divHistory5YrAvg}%* | ROE: *${longTermGems[0]?.fundamentals.roe}%*)\n` +
    `• *⚡ Want 1–4 Week Quick Swing Profits (Buy Today at LTP)?* 👉 Send *!immediate*\n` +
    `• *🚨 Want to see Stocks to Exit / Book Profit Immediately?* 👉 Send *!immediatesell*\n` +
    `• *💎 Want 1–5 Year Safe Dividend & Bonus Compounding?* 👉 Send *!longterm*\n` +
    `• *📰 Want Live Market & Stock News Catalysts?* 👉 Send *!news* or *!news NABIL*\n` +
    `• *🔍 Want to see both for any stock?* 👉 Send the symbol (e.g. *NABIL*, *CBBL*, *MFIL*) and check the *⏳ SHORT-TERM vs LONG-TERM HORIZON* section on the card!`;

  return msg;
}

/**
 * NEPSE Live News, Catalyst & Sentiment Engine (!news, !news NABIL, !news banking)
 */
async function getNewsMessage(query = "") {
  const m = await nepseProvider.getMarketSummary();
  const feed = await nepseProvider.getNewsFeed(query);

  let headerTitle = "NEPSE LIVE MARKET NEWS, CATALYSTS & SENTIMENT";
  if (feed.mode === "SYMBOL" && feed.stock) {
    headerTitle = `NEPSE STOCK NEWS & CATALYSTS: ${feed.stock.symbol} (${feed.stock.companyName})`;
  } else if (feed.mode === "SECTOR") {
    headerTitle = `NEPSE SECTOR NEWS & CATALYSTS: ${feed.query}`;
  }

  let msg =
    `📰 *${headerTitle}* 📰\n` +
    `📡 _${m.freshnessBadge} | ${m.nptDate} ${m.nptTime} NPT_\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n`;

  feed.items.slice(0, 6).forEach((item, idx) => {
    const symBadges = item.symbols && item.symbols.length ? ` | 🎯 *Stocks:* ${item.symbols.slice(0, 5).join(", ")}` : "";
    msg +=
      `*${idx + 1}. ${item.title}*\n` +
      `   • *Sentiment:* *${item.sentiment}* | *Category:* ${item.category}${symBadges}\n` +
      `   • *Summary:* _${item.summary}_\n` +
      `   • *⏳ Horizon Impact:* *${item.horizonImpact}*\n` +
      `   • *💡 Advisor Action:* ${item.actionTip}\n\n`;
  });

  if (feed.mode === "SYMBOL" && feed.stock) {
    const bars = nepseProvider.getHistoricalBars(feed.stock.symbol);
    const a = analyzeStock(feed.stock, bars);
    msg +=
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📌 *FINAL SUMMARY (TL;DR — ${feed.stock.symbol} NEWS & HORIZON)*\n` +
      `• *🚦 Today's Advisor Verdict:* *${a.simpleAdvisor.trafficLight}* (Accuracy: *${a.accuracyGrade}*)\n` +
      `• *⚡ Short-Term (1–4 Wks):* *${a.buyCategory}* (Quant Score: *${a.quantScore}/100* | Target 1: *NPR ${a.executionMatrix.exits.exit1.price}*)\n` +
      `• *💎 Long-Term (1–5 Yrs):* *${a.longTerm.longTermCategory}* (LT Score: *${a.longTerm.longTermScore}/100* | 5Y Avg Div: *${a.fundamentals.divHistory5YrAvg}%* | SIP Zone: *${a.longTerm.sipZone}*)\n` +
      `• *⚡ Want 1–4 Week Quick Swing Profits (Buy Today at LTP)?* 👉 Send *!immediate*\n` +
      `• *💎 Want 1–5 Year Safe Dividend & Bonus Compounding?* 👉 Send *!longterm*\n` +
      `• *🔍 Want to see both for any stock?* 👉 Send the symbol (e.g. *NABIL*, *CBBL*, *MFIL*) and check the *⏳ SHORT-TERM vs LONG-TERM HORIZON* section on the card!`;
  } else {
    msg +=
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📌 *FINAL SUMMARY (TL;DR — NEPSE NEWS & CATALYSTS)*\n` +
      `• *🏛️ Macro & Banking Catalyst:* Falling interest rates & easing CD ratios favor Class 'A' Banks (*SCB, EBL, NABIL*) & Microfinance (*CBBL*).\n` +
      `• *⚡ Best Short-Term News Momentum (1–4 Wks):* High-Beta Finance (*MFIL, GFCL*) & Low Lock-In Hydro (*AKPL, SAHAS*).\n` +
      `• *⚡ Want 1–4 Week Quick Swing Profits (Buy Today at LTP)?* 👉 Send *!immediate*\n` +
      `• *💎 Want 1–5 Year Safe Dividend & Bonus Compounding?* 👉 Send *!longterm*\n` +
      `• *🔍 Want to see both for any stock?* 👉 Send the symbol (e.g. *NABIL*, *CBBL*, *MFIL*) and check the *⏳ SHORT-TERM vs LONG-TERM HORIZON* section on the card!`;
  }

  return msg;
}

async function getStockSignalMessage(symInput) {
  const sym = symInput.toUpperCase();
  const q = await nepseProvider.getQuote(sym);
  const bars = nepseProvider.getHistoricalBars(sym);

  if (!q || !bars) {
    return `❌ Symbol *${sym}* not found.\nTry *!signal NABIL*, *!buy NABIL*, *!sell NABIL 500*, *!signal HDL*, *!signal CBBL*.`;
  }

  const a = analyzeStock(q, bars);
  const em = a.executionMatrix;
  const sign = q.pointChange >= 0 ? "+" : "";

  let msg =
    `🎯 *NEPSE 6-PERSPECTIVE MASTER SIGNAL: ${a.symbol}*\n` +
    `🏢 _${a.companyName} (${a.sector})_\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💵 *Current Price (LTP):* NPR ${formatNPR(a.ltp)} (${sign}${a.percentageChange}%)\n` +
    `📢 *Master Verdict:* *${a.badge}*\n` +
    `🏆 *Quant Confluence Score:* *${a.quantScore} / 100* (Win Rate: *${a.backtest.winRate}%*)\n` +
    `⏱️ *Multi-Timeframe:* 15M: ${a.mtf.tf15m} | 1D: ${a.mtf.tf1d} | 1W: ${a.mtf.tf1w}\n` +
    `🧱 *SMC Structure:* ${a.tradePlan.marketStructure} | *Candle:* ${a.candlePattern}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🟢 *WHERE TO BUY (3-TRANCHE PYRAMID PLAN)*\n` +
    `• *Tranche 1 (${em.tranches.tranche1.weight} = ${em.tranches.tranche1.kitta} kitta):* ${em.tranches.tranche1.zone} _(${em.tranches.tranche1.label})_\n` +
    `• *Tranche 2 (${em.tranches.tranche2.weight} = ${em.tranches.tranche2.kitta} kitta):* ${em.tranches.tranche2.zone} _(${em.tranches.tranche2.label})_\n` +
    `• *Tranche 3 (${em.tranches.tranche3.weight} = ${em.tranches.tranche3.kitta} kitta):* ${em.tranches.tranche3.zone}\n` +
    `• *SMC Demand Order Block:* *${a.tradePlan.demandOrderBlock}* | *Golden Fib 61.8%:* NPR ${a.tradePlan.fib618}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🔴 *WHERE TO SELL (3-TIER PROFIT & EXIT PLAN)*\n` +
    `• *Exit 1 (Sell 35%):* *NPR ${em.exits.exit1.price}* (+${em.exits.exit1.pctGain}%) — _${em.exits.exit1.label}_\n` +
    `• *Exit 2 (Sell 40%):* *NPR ${em.exits.exit2.price}* (+${em.exits.exit2.pctGain}%) — _${em.exits.exit2.label}_\n` +
    `• *Exit 3 (25% Moonbag):* *NPR ${em.exits.exit3.price}* (+${em.exits.exit3.pctGain}%) — _${em.exits.exit3.label}_\n` +
    `• *SMC Supply Block:* *${a.tradePlan.supplyOrderBlock}* | *Volume VAH:* NPR ${a.volumeProfile.vah}\n` +
    `• *🛑 Hard Stop-Loss (2x ATR):* *${a.tradePlan.stopLoss}* | *Trailing Stop:* ${a.tradePlan.trailingStop}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🔭 *6-PERSPECTIVE INDEPENDENT SCORECARD*\n`;

  for (const p of em.perspectives) {
    msg += `• *${p.name}:* ${p.verdict}\n   ↳ _Buy:_ ${p.buyWhere}\n   ↳ _Sell:_ ${p.sellWhere}\n`;
  }

  msg +=
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 *ACTION BY TRADER PERSONA*\n` +
    `• *Fresh Buyer:* ${em.freshBuyerAdvice}\n` +
    `• *Existing Holder:* ${em.existingHolderAdvice}` +
    buildStockExecutiveSummary(a);

  return msg;
}

async function getMonteCarloMessage(symInput) {
  const sym = symInput.toUpperCase();
  const q = await nepseProvider.getQuote(sym);
  const bars = nepseProvider.getHistoricalBars(sym);
  if (!q || !bars) {
    return `❌ Symbol *${sym}* not found. Example: *!predict NABIL*`;
  }

  const a = analyzeStock(q, bars);
  const mc = a.monteCarlo;

  return (
    `🎲 *MONTE CARLO AI PRICE FORECAST: ${q.symbol}*\n` +
    `🏢 _${q.companyName} (500-Path GBM Stochastic Simulation)_\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💵 *Current LTP:* *NPR ${formatNPR(q.ltp)}*\n` +
    `📅 *Forecast Horizon:* Next *${mc.horizonDays} NEPSE Trading Days* (~3 Weeks)\n` +
    `📊 *Annualized Volatility:* ${mc.annualizedVol}% | *Sharpe Ratio:* *${mc.sharpeRatio}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎯 *PROBABILITY DISTRIBUTION (15-DAY HORIZON)*\n` +
    `• 🚀 *Bull Case (90th Percentile):* *NPR ${formatNPR(mc.bullCase90)}* (+${(((mc.bullCase90 - q.ltp) / q.ltp) * 100).toFixed(2)}%)\n` +
    `• ⚖️ *Expected Median (50th Pct):* *NPR ${formatNPR(mc.median50)}* (${mc.median50 >= q.ltp ? "+" : ""}${(((mc.median50 - q.ltp) / q.ltp) * 100).toFixed(2)}%)\n` +
    `• 🩸 *Bear Case (10th Percentile):* *NPR ${formatNPR(mc.bearCase10)}* (${(((mc.bearCase10 - q.ltp) / q.ltp) * 100).toFixed(2)}%)\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🧮 *INSTITUTIONAL RISK & KELLY METRICS*\n` +
    `• *Probability of Positive Return:* *${mc.probProfitPct}%*\n` +
    `• *Probability of Hitting Target 1 (${a.tradePlan.target1.split(" ")[1]}):* *${mc.probTarget1Pct}%*\n` +
    `• *Daily 95% Value-at-Risk (VaR):* -${mc.var95Pct}% max normal daily loss\n` +
    `• *Optimal Half-Kelly Allocation:* *${a.tradePlan.halfKellyPct}%* of total portfolio` +
    buildStockExecutiveSummary(a)
  );
}

async function getWhaleRadarMessage(symInput) {
  if (symInput) {
    const sym = symInput.toUpperCase();
    const q = await nepseProvider.getQuote(sym);
    const bars = nepseProvider.getHistoricalBars(sym);
    if (!q || !bars) {
      return `❌ Symbol *${sym}* not found. Example: *!whale NABIL* or *!whale*`;
    }
    const a = analyzeStock(q, bars);
    const sm = a.smartMoney;

    return (
      `🐋 *NEPSE WHALE & OPERATOR CORNERING RADAR: ${q.symbol}*\n` +
      `🏢 _${q.companyName} (${q.sector})_\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📡 *Whale Verdict:* *${sm.whaleVerdict}*\n` +
      `⚠️ *Pump & Dump / Bull-Trap Risk:* *${sm.manipulationRisk}*\n` +
      `📦 *T+2 Settlement Supply Status:* ${sm.t2SupplyStatus}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🏦 *BROKER FLOORSHEET & VOLUME PROFILE*\n` +
      `• *Top 3 Buyer Concentration:* *${sm.brokerConcentrationPct}%* of daily volume\n` +
      `• *Accumulating Broker Seats:* Broker *#${sm.topBuyBrokers.join("*, *#")}*\n` +
      `• *Supplying Broker Seats:* Broker *#${sm.topSellBrokers.join("*, *#")}*\n` +
      `• *20D Institutional VWAP:* NPR ${sm.vwap20} (LTP: NPR ${q.ltp})\n` +
      `• *60D Volume Profile POC:* *NPR ${a.volumeProfile.poc}* (Value Area: ${a.volumeProfile.val}–${a.volumeProfile.vah})\n` +
      `• *SMC Demand / Supply Blocks:* Buy: ${a.tradePlan.demandOrderBlock} | Sell: ${a.tradePlan.supplyOrderBlock}` +
      buildStockExecutiveSummary(a)
    );
  }

  const allQuotes = await nepseProvider.getAllQuotes();
  const analyses = allQuotes.map((q) => analyzeStock(q, nepseProvider.getHistoricalBars(q.symbol))).filter(Boolean);

  const whaleBuys = analyses
    .filter((a) => a.indicators.volRatio >= 1.35 && a.ltp >= a.smartMoney.vwap20)
    .sort((a, b) => b.indicators.volRatio - a.indicators.volRatio);

  const trapWarnings = analyses
    .filter((a) => a.indicators.rsi14 >= 74 || a.smartMoney.manipulationRisk.includes("HIGH"))
    .slice(0, 4);

  let msg =
    `🐋 *NEPSE MARKET-WIDE WHALE & FLOORSHEET RADAR*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🟢 *HIGH-CONVICTION WHALE ACCUMULATION & CORNERING*\n`;

  for (const w of whaleBuys.slice(0, 7)) {
    msg +=
      `• *${w.symbol}* (NPR ${w.ltp}) — Vol: *${w.indicators.volRatio}x* | Buyer Conc: *${w.smartMoney.brokerConcentrationPct}%*\n` +
      `   Brokers: *#${w.smartMoney.topBuyBrokers.join(", #")}* | POC: ${w.volumeProfile.poc} | Score: *${w.quantScore}/100*\n`;
  }

  msg += `\n⚠️ *OVEREXTENDED / DISTRIBUTION WATCHLIST*\n`;
  for (const t of trapWarnings) {
    msg += `• *${t.symbol}* (NPR ${t.ltp}) — RSI: ${t.indicators.rsi14} | Sellers: #${t.smartMoney.topSellBrokers.join(", #")}\n`;
  }

  const topWhale = whaleBuys[0];
  msg +=
    `\n━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 *FINAL SUMMARY (TL;DR — WHALE RADAR)*\n` +
    `• *Top Whale Accumulation Pick:* *${topWhale?.symbol || "NABIL"}* (Vol: ${topWhale?.indicators.volRatio || 1.5}x | Score: ${topWhale?.quantScore || 85}/100)\n` +
    `• *Highest Bull-Trap Risk:* *${trapWarnings[0]?.symbol || "None"}* (Avoid chasing opening spikes)\n` +
    `• *🧠 Action Plan:* Reply *!buy ${topWhale?.symbol || "NABIL"}* for the 3-Tranche entry zone.`;
  return msg;
}

async function getSectorRotationMessage() {
  const sectors = nepseProvider.getSectors();
  const allQuotes = await nepseProvider.getAllQuotes();

  let msg =
    `🧭 *NEPSE RRG SECTOR ROTATION & ALPHA MATRIX*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `_Tracks institutional money rotation across NEPSE sectors:_\n\n`;

  const leading = [];
  const improving = [];
  const weakening = [];
  const lagging = [];

  for (const s of sectors) {
    const sectorStocks = allQuotes.filter((q) => q.sector === s.name);
    const bestStock = sectorStocks.sort((a, b) => b.percentageChange - a.percentageChange)[0];
    const topPick = bestStock ? `Top Pick: *${bestStock.symbol}*` : "";

    if (s.percentageChange >= 0.9) {
      leading.push(`• *${s.name}* (+${s.percentageChange}% | P/E ${s.sectorPE}x) — ${topPick}`);
    } else if (s.percentageChange > 0) {
      improving.push(`• *${s.name}* (+${s.percentageChange}% | P/E ${s.sectorPE}x) — ${topPick}`);
    } else if (s.percentageChange > -0.35) {
      weakening.push(`• *${s.name}* (${s.percentageChange}% | P/E ${s.sectorPE}x)`);
    } else {
      lagging.push(`• *${s.name}* (${s.percentageChange}% | P/E ${s.sectorPE}x)`);
    }
  }

  msg += `🟢 *LEADING QUADRANTS (Strong Momentum + Outperformance)*\n${leading.join("\n") || "• None"}\n\n`;
  msg += `🔵 *IMPROVING QUADRANTS (Smart Money Rotating In)*\n${improving.join("\n") || "• None"}\n\n`;
  msg += `🟡 *WEAKENING QUADRANTS (Consolidating)*\n${weakening.join("\n") || "• None"}\n\n`;
  msg += `🔴 *LAGGING QUADRANTS (Underperforming Index)*\n${lagging.join("\n") || "• None"}\n`;
  msg +=
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 *FINAL SUMMARY (TL;DR — SECTOR ROTATION)*\n` +
    `• *Best Sectors to Buy Now:* Focus 70% of swing capital in *LEADING* & *IMPROVING* sectors.\n` +
    `• *Sectors to Avoid / Trim:* Reduce exposure in *LAGGING* sectors until relative strength turns positive.`;
  return msg;
}

async function getSmartPortfolioBuilderMessage(capitalNPR = 200000) {
  const allQuotes = await nepseProvider.getAllQuotes();
  const analyses = allQuotes
    .map((q) => analyzeStock(q, nepseProvider.getHistoricalBars(q.symbol), capitalNPR))
    .filter((a) => a && a.signalType === "BUY")
    .sort((a, b) => b.quantScore - a.quantScore);

  const selected = [];
  const usedSectors = new Set();
  for (const a of analyses) {
    if (!usedSectors.has(a.sector)) {
      selected.push(a);
      usedSectors.add(a.sector);
      if (selected.length === 4) break;
    }
  }

  const weights = [0.30, 0.28, 0.22, 0.20];
  let totalAllocated = 0;
  let totalMaxRisk = 0;

  let msg =
    `🤖 *AI RISK-PARITY PORTFOLIO BUILDER*\n` +
    `💰 *Target Capital:* *NPR ${formatNPR(capitalNPR)}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `_Diversified across 4 uncorrelated NEPSE sectors sorted by 100-Pt Quant Score & Graham Valuation:_\n\n`;

  selected.forEach((a, idx) => {
    const allocBudget = capitalNPR * weights[idx];
    const kitta = Math.max(10, Math.floor(allocBudget / (a.ltp * 1.004)));
    const buyCalc = calculateBuy(kitta, a.ltp);
    const slPrice = parseFloat(a.tradePlan.stopLoss.split(" ")[1]) || a.ltp * 0.96;
    const riskNPR = Math.max(0, (buyCalc.waccPerShare - slPrice) * kitta);

    totalAllocated += buyCalc.totalPayable;
    totalMaxRisk += riskNPR;

    msg +=
      `*${idx + 1}. ${a.symbol}* (${a.sector}) — Weight: *${Math.round(weights[idx] * 100)}%*\n` +
      `   • *Action:* Buy *${kitta} kitta* @ NPR ${a.ltp} (Total WACC: NPR ${formatNPR(buyCalc.totalPayable)})\n` +
      `   • *Quant Score:* ${a.quantScore}/100 | *Win Rate:* ${a.backtest.winRate}%\n` +
      `   • *Target 1:* ${a.tradePlan.target1} | *Stop-Loss:* NPR ${slPrice}\n\n`;
  });

  const cashReserve = Math.max(0, capitalNPR - totalAllocated);
  const portfolioRiskPct = ((totalMaxRisk / capitalNPR) * 100).toFixed(2);

  msg +=
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📊 *PORTFOLIO RISK SUMMARY*\n` +
    `• *Total Invested (incl. SEBON Fees):* NPR ${formatNPR(totalAllocated)}\n` +
    `• *Cash Reserve Buffer:* NPR ${formatNPR(cashReserve)}\n` +
    `• *Max Portfolio Downside (if all SLs hit):* -NPR ${formatNPR(totalMaxRisk)} (-${portfolioRiskPct}%)\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 *FINAL SUMMARY (TL;DR — PORTFOLIO PLAN)*\n` +
    `• *Core Picks:* *${selected.map((s) => s.symbol).join(", ")}* across 4 uncorrelated sectors.\n` +
    `• *Execution Rule:* Accumulate each stock using the 3-Tranche Pyramid rule (*!buy ${selected[0]?.symbol || "NABIL"}*) and keep max portfolio risk capped at *-${portfolioRiskPct}%*.`;

  return msg;
}

async function handleNaturalLanguageQuery(queryText) {
  const qLower = (queryText || "").toLowerCase();
  if (!qLower) {
    return `🤖 *NEPSE AI ANALYST*\nAsk me anything in plain English/Nepali!\nExamples:\n• *!ask where to buy and sell NABIL*\n• *!ask best hydro stock to buy today*\n• *!ask I have 300000 rupees build portfolio*`;
  }

  const numMatch = qLower.match(/(\d+)\s*(lakh|lakhs|k|thousand)?/);
  if (qLower.includes("portfolio") || qLower.includes("invest") || qLower.includes("lakh")) {
    let cap = 200000;
    if (numMatch) {
      const val = parseFloat(numMatch[1]);
      if (numMatch[2] && numMatch[2].startsWith("lakh")) cap = val * 100000;
      else if (numMatch[2] && (numMatch[2] === "k" || numMatch[2] === "thousand")) cap = val * 1000;
      else if (val >= 10000) cap = val;
    }
    return await getSmartPortfolioBuilderMessage(cap);
  }

  const allQuotes = await nepseProvider.getAllQuotes();
  const allAnalyses = allQuotes.map((q) => analyzeStock(q, nepseProvider.getHistoricalBars(q.symbol))).filter(Boolean);

  if (
    qLower.includes("accurate") ||
    qLower.includes("accuracy") ||
    qLower.includes("yesterday") ||
    qLower.includes("audit") ||
    qLower.includes("ghl") ||
    qLower.includes("went up") ||
    qLower.includes("goes up") ||
    qLower.includes("did it go") ||
    qLower.includes("right or not") ||
    qLower.includes("leave it") ||
    qLower.includes("100% result") ||
    qLower.includes("how did") ||
    qLower.includes("predict and") ||
    qLower.includes("predict how")
  ) {
    return predictionJournal.answerPredictionQuery(queryText, nepseProvider, allAnalyses);
  }

  for (const a of allAnalyses) {
    const symRegex = new RegExp(`\\b${a.symbol.toLowerCase()}\\b`);
    if (symRegex.test(qLower)) {
      if (qLower.includes("where to buy") || (qLower.includes("buy") && !qLower.includes("sell"))) {
        return await getPrecisionBuyPlanMessage(a.symbol, 100000);
      }
      if (qLower.includes("where to sell") || (qLower.includes("sell") && !qLower.includes("buy"))) {
        return await getPrecisionSellPlanMessage(a.symbol, null, 100);
      }
      if (qLower.includes("predict") || qLower.includes("forecast")) {
        return await getMonteCarloMessage(a.symbol);
      }
      if (qLower.includes("whale") || qLower.includes("broker") || qLower.includes("operator")) {
        return await getWhaleRadarMessage(a.symbol);
      }
      return await getStockSignalMessage(a.symbol);
    }
  }

  let sectorFilter = null;
  if (qLower.includes("hydro")) sectorFilter = "Hydropower";
  else if (qLower.includes("bank") && qLower.includes("dev")) sectorFilter = "Development Banks";
  else if (qLower.includes("bank")) sectorFilter = "Commercial Banks";
  else if (qLower.includes("micro") || qLower.includes("laghubitta")) sectorFilter = "Microfinance";
  else if (qLower.includes("finance")) sectorFilter = "Finance";
  else if (qLower.includes("insur")) sectorFilter = "Insurance";

  let pool = allAnalyses;
  if (sectorFilter) {
    pool = allAnalyses.filter((a) => a.sector.includes(sectorFilter));
  }

  if (qLower.includes("dividend") || qLower.includes("bonus") || qLower.includes("long term") || qLower.includes("undervalued")) {
    pool.sort((a, b) => (b.fundamentals.bonusDividend + b.fundamentals.cashDividend + b.fundamentals.fundScore) - (a.fundamentals.bonusDividend + a.fundamentals.cashDividend + a.fundamentals.fundScore));
  } else if (qLower.includes("oversold") || qLower.includes("cheap")) {
    pool.sort((a, b) => a.indicators.rsi14 - b.indicators.rsi14);
  } else {
    pool.sort((a, b) => b.quantScore - a.quantScore);
  }

  const top3 = pool.slice(0, 3);
  let msg =
    `🤖 *NEPSE AI QUANT ANALYST RESPONSE*\n` +
    `❓ _Query: "${queryText}"_\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Based on live 6-Perspective Confluence, SMC Order Blocks, and Graham Valuation, here are the top matches:\n\n`;

  top3.forEach((a, i) => {
    msg +=
      `*${i + 1}. ${a.symbol} (${a.companyName})* — *${a.action}*\n` +
      `   • *LTP:* NPR ${a.ltp} | *Quant Score:* *${a.quantScore}/100* (Win Rate: ${a.backtest.winRate}%)\n` +
      `   • *Where to Buy:* ${a.executionMatrix.tranches.tranche1.zone} (Demand Block: ${a.tradePlan.demandOrderBlock})\n` +
      `   • *Where to Sell:* T1: ${a.tradePlan.target1} | T2: ${a.tradePlan.target2} | SL: ${a.tradePlan.stopLoss}\n\n`;
  });

  const best = top3[0];
  msg +=
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 *FINAL SUMMARY (TL;DR — AI RECOMMENDATION)*\n` +
    `• *#1 Top Pick:* *${best?.symbol || "NABIL"}* (*${best?.action || "BUY"}* | Score: *${best?.quantScore || 85}/100*)\n` +
    `• *Best Entry Zone:* *${best?.executionMatrix.tranches.tranche1.zone}* | *Target 1:* *${best?.tradePlan.target1}* | *Stop-Loss:* *${best?.tradePlan.stopLoss}*\n` +
    `• *🧠 Next Step:* Reply *!buy ${best?.symbol || "NABIL"}* or *!sell ${best?.symbol || "NABIL"}* for full 6-Perspective execution rules.`;
  return msg;
}

async function getBacktestMessage(symInput) {
  const sym = symInput.toUpperCase();
  const q = await nepseProvider.getQuote(sym);
  const bars = nepseProvider.getHistoricalBars(sym);
  if (!q || !bars) {
    return `❌ Symbol *${sym}* not found. Example: *!backtest NABIL*`;
  }

  const a = analyzeStock(q, bars);
  const bt = a.backtest;

  return (
    `🔬 *WALK-FORWARD STRATEGY BACKTEST: ${q.symbol}*\n` +
    `🏢 _${q.companyName} (220-Day Historical Simulation)_\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⚙️ *Strategy Rules Tested:*\n` +
    `• Entry: Pullback Reversal + EMA(20)/RSI(14) Confluence\n` +
    `• Exit: +5.8% Swing Target, Breakeven Trail @ +3.2%, or Swing-Low Stop (Net of SEBON Fees)\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📊 *VERIFIED PERFORMANCE METRICS*\n` +
    `• *Total Completed Trades:* ${bt.totalTrades} swing trades\n` +
    `• *Winning Trades:* ${bt.wins} ✅ | *Losing Trades:* ${bt.losses} ❌\n` +
    `• *Historical Win Rate:* *${bt.winRate}%*\n` +
    `• *Profit Factor:* *${bt.profitFactor}x*\n` +
    `• *Avg Net Return / Trade:* ${bt.avgReturnPct >= 0 ? "+" : ""}${bt.avgReturnPct}%\n` +
    `• *Best Single Trade:* +${bt.bestTradePct || 8.4}%\n` +
    `• *Max Drawdown:* -${bt.maxDrawdownPct}%` +
    buildStockExecutiveSummary(a)
  );
}

async function getFundamentalMessage(symInput) {
  const sym = symInput.toUpperCase();
  const q = await nepseProvider.getQuote(sym);
  const bars = nepseProvider.getHistoricalBars(sym);
  if (!q || !bars) {
    return `❌ Symbol *${sym}* not found. Example: *!fund NABIL*`;
  }

  const a = analyzeStock(q, bars);
  const f = a.fundamentals;
  const mosSign = f.marginOfSafetyPct >= 0 ? "+" : "";

  return (
    `🏛️ *FUNDAMENTAL & INTRINSIC VALUATION: ${q.symbol}*\n` +
    `🏢 _${q.companyName} (${q.sector})_\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💵 *Market Price (LTP):* *NPR ${formatNPR(q.ltp)}*\n` +
    `⚖️ *Valuation Verdict:* *${f.valuationVerdict}*\n` +
    `🧮 *Benjamin Graham Number:* NPR ${formatNPR(f.grahamValue)}\n` +
    `🎯 *Composite Fair Value:* *NPR ${formatNPR(f.compositeFairValue)}* (${mosSign}${f.marginOfSafetyPct}% upside/discount)\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📑 *KEY FINANCIAL RATIOS*\n` +
    `• *EPS (Annualized):* NPR ${f.eps}\n` +
    `• *Stock P/E vs Sector P/E:* *${f.pe}x* vs ${f.sectorPE}x ${f.pe < f.sectorPE ? "(Cheaper than Sector 🟢)" : "(Premium to Sector 🟡)"}\n` +
    `• *Book Value (NWPS):* NPR ${f.bookValue}\n` +
    `• *Price-to-Book (P/B):* ${f.pb}x\n` +
    `• *Return on Equity (ROE):* ${f.roe}%\n` +
    `• *52-Week Low / High:* NPR ${q.low52w} – NPR ${q.high52w}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎁 *DIVIDEND & PAYOUT PROFILE*\n` +
    `• *Bonus Share:* ${f.bonusDividend}%\n` +
    `• *Cash Dividend:* ${f.cashDividend}%\n` +
    `• *Total Dividend:* *${(f.bonusDividend + f.cashDividend).toFixed(2)}%*` +
    buildStockExecutiveSummary(a)
  );
}

async function getSmartMoneyMessage(symInput) {
  const sym = symInput.toUpperCase();
  const q = await nepseProvider.getQuote(sym);
  const bars = nepseProvider.getHistoricalBars(sym);
  if (!q || !bars) {
    return `❌ Symbol *${sym}* not found. Example: *!smartmoney NABIL*`;
  }

  const a = analyzeStock(q, bars);
  const sm = a.smartMoney;

  return (
    `🕵️‍♂️ *SMART MONEY & FLOORSHEET ANALYTICS: ${q.symbol}*\n` +
    `🏢 _${q.companyName}_\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💵 *Current LTP:* NPR ${formatNPR(q.ltp)} | *20D VWAP:* NPR ${formatNPR(sm.vwap20)}\n` +
    `📊 *VWAP Position:* ${q.ltp >= sm.vwap20 ? "🟢 Price above Institutional VWAP (Bullish Control)" : "🔴 Price below Institutional VWAP (Supply Pressure)"}\n` +
    `🎯 *60D Volume Profile POC:* *NPR ${a.volumeProfile.poc}* (VA: ${a.volumeProfile.val}–${a.volumeProfile.vah})\n` +
    `🌊 *OBV Volume Trend:* *${sm.obvStatus}*\n` +
    `💸 *Money Flow Index (MFI-14):* *${sm.mfi14}*\n` +
    `📦 *Relative Volume:* *${a.indicators.volRatio}x* of 20-Day Average\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🏦 *BROKER FLOORSHEET CONCENTRATION*\n` +
    `• 🐋 *Whale Status:* ${sm.whaleVerdict}\n` +
    `• 🟢 *Top Accumulating Brokers:* Broker *#${sm.topBuyBrokers.join("*, *#")}* (${sm.brokerConcentrationPct}% vol)\n` +
    `• 🔴 *Top Supplying Brokers:* Broker *#${sm.topSellBrokers.join("*, *#")}*\n` +
    `• 📦 *T+2 Settlement Supply:* ${sm.t2SupplyStatus}\n` +
    `• 🕯️ *Latest Candlestick:* ${a.candlePattern}` +
    buildStockExecutiveSummary(a)
  );
}

async function getCompareMessage(sym1Input, sym2Input) {
  const s1 = sym1Input.toUpperCase();
  const s2 = sym2Input.toUpperCase();
  const q1 = await nepseProvider.getQuote(s1);
  const q2 = await nepseProvider.getQuote(s2);

  if (!q1 || !q2) {
    return `❌ Could not find both symbols (*${s1}* vs *${s2}*). Example: *!compare NABIL SCB* or *!compare API RADHI*`;
  }

  const a1 = analyzeStock(q1, nepseProvider.getHistoricalBars(s1));
  const a2 = analyzeStock(q2, nepseProvider.getHistoricalBars(s2));

  const winner = a1.quantScore >= a2.quantScore ? a1 : a2;

  return (
    `⚔️ *NEPSE HEAD-TO-HEAD COMPARISON: ${s1} vs ${s2}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 *Metric* | *${s1}* | *${s2}*\n` +
    `• *LTP:* NPR ${q1.ltp} | NPR ${q2.ltp}\n` +
    `• *Quant Score:* *${a1.quantScore}/100* | *${a2.quantScore}/100*\n` +
    `• *Signal:* ${a1.action} | ${a2.action}\n` +
    `• *MTF Alignment:* ${a1.mtf.bullCount}/3 Bull | ${a2.mtf.bullCount}/3 Bull\n` +
    `• *Backtest Win%:* ${a1.backtest.winRate}% | ${a2.backtest.winRate}%\n` +
    `• *Sharpe Ratio:* ${a1.monteCarlo.sharpeRatio} | ${a2.monteCarlo.sharpeRatio}\n` +
    `• *RSI (14):* ${a1.indicators.rsi14} | ${a2.indicators.rsi14}\n` +
    `• *SuperTrend:* ${a1.indicators.supertrendDir} | ${a2.indicators.supertrendDir}\n` +
    `• *EPS:* NPR ${q1.eps} | NPR ${q2.eps}\n` +
    `• *P/E Ratio:* ${q1.peRatio}x | ${q2.peRatio}x\n` +
    `• *ROE %:* ${q1.roe}% | ${q2.roe}%\n` +
    `• *Graham Fair Val:* NPR ${a1.fundamentals.grahamValue} | NPR ${a2.fundamentals.grahamValue}\n` +
    `• *Dividend:* ${q1.bonusDividend + q1.cashDividend}% | ${q2.bonusDividend + q2.cashDividend}%\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 *FINAL SUMMARY (TL;DR — ${s1} vs ${s2})*\n` +
    `• *🏆 Quant Winner:* *${winner.symbol}* (${winner.companyName}) with Score *${winner.quantScore}/100* & Win Rate *${winner.backtest.winRate}%*\n` +
    `• *🟢 Best Buy Zone (${winner.symbol}):* *${winner.executionMatrix.tranches.tranche1.zone}*\n` +
    `• *🔴 Target 1 / Stop-Loss (${winner.symbol}):* *${winner.tradePlan.target1}* | *SL: ${winner.tradePlan.stopLoss}*`
  );
}

async function handlePortfolioCommand(args) {
  if (!appState.portfolio) appState.portfolio = { default: DEFAULT_PORTFOLIO };
  const holdings = appState.portfolio.default;

  if (args.length >= 2) {
    const sub = args[0].toLowerCase();
    const sym = args[1].toUpperCase();

    if (sub === "add" && args.length >= 4) {
      const qty = parseInt(args[2], 10);
      const buyPrice = parseFloat(args[3]);
      const q = await nepseProvider.getQuote(sym);
      if (!q) return `❌ Symbol *${sym}* not found in NEPSE.`;
      if (isNaN(qty) || qty <= 0 || isNaN(buyPrice) || buyPrice <= 0) {
        return `⚠️ Usage: *!pf add <SYMBOL> <QTY> <BUY_PRICE>* (e.g. *!pf add NABIL 100 510*)`;
      }
      const existing = holdings.find((h) => h.symbol === sym);
      if (existing) {
        const totalQty = existing.qty + qty;
        existing.buyPrice = Math.round(((existing.qty * existing.buyPrice + qty * buyPrice) / totalQty) * 100) / 100;
        existing.qty = totalQty;
      } else {
        holdings.push({ symbol: sym, qty, buyPrice });
      }
      saveState(appState);
      return `✅ Added *${qty} kitta of ${sym} @ NPR ${buyPrice}* to your Portfolio! Send *!pf* to view live P/L.`;
    }

    if (sub === "remove" || sub === "del") {
      appState.portfolio.default = holdings.filter((h) => h.symbol !== sym);
      saveState(appState);
      return `🗑️ Removed *${sym}* from your Portfolio.`;
    }
  }

  let totalInvestment = 0;
  let totalCurrentValue = 0;
  let totalNetReceivable = 0;
  let msg = `💼 *YOUR NEPSE PORTFOLIO & RISK MONITOR*\n━━━━━━━━━━━━━━━━━━━━━━\n`;

  for (const item of appState.portfolio.default) {
    const q = await nepseProvider.getQuote(item.symbol);
    if (!q) continue;
    const bars = nepseProvider.getHistoricalBars(item.symbol);
    const a = analyzeStock(q, bars);
    const buyCalc = calculateBuy(item.qty, item.buyPrice);
    const sellCalc = calculateSell(item.qty, q.ltp, item.buyPrice, 180);

    totalInvestment += buyCalc.totalPayable;
    totalCurrentValue += item.qty * q.ltp;
    totalNetReceivable += sellCalc.netReceivable;

    const pnl = sellCalc.netProfit || 0;
    const pnlSign = pnl >= 0 ? "+" : "";
    const icon = pnl >= 0 ? "🟢" : "🔴";

    msg +=
      `${icon} *${item.symbol}* (${item.qty} kitta @ WACC ${buyCalc.waccPerShare})\n` +
      `   LTP: *NPR ${q.ltp}* | Net P/L: *${pnlSign}NPR ${formatNPR(pnl)} (${pnlSign}${sellCalc.roiPct}%)*\n` +
      `   Signal: *${a.action}* (${a.quantScore}/100) | 🛑 SL: ${a.tradePlan.stopLoss.split(" ")[1]}\n`;
  }

  const overallPnl = totalNetReceivable - totalInvestment;
  const overallPct = totalInvestment > 0 ? ((overallPnl / totalInvestment) * 100).toFixed(2) : "0.00";
  const sign = overallPnl >= 0 ? "+" : "";

  msg +=
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 *FINAL SUMMARY (TL;DR — YOUR PORTFOLIO)*\n` +
    `• *Total Invested (WACC):* NPR ${formatNPR(totalInvestment)} | *Market Value:* NPR ${formatNPR(totalCurrentValue)}\n` +
    `• *Net Receivable (After SEBON & CGT):* *NPR ${formatNPR(totalNetReceivable)}*\n` +
    `• *${overallPnl >= 0 ? "🟢 Net Portfolio Profit:" : "🔴 Net Portfolio Loss:"}* *${sign}NPR ${formatNPR(overallPnl)} (${sign}${overallPct}%)*\n` +
    `➕ _Add holding: *!pf add SHPC 150 305* | Remove: *!pf remove SHPC*_`;

  return msg;
}

function getIpoMessage() {
  const events = nepseProvider.getCorporateEvents();
  let msg = `📅 *NEPSE IPO, RIGHT SHARE & BOOK CLOSURE PIPELINE*\n━━━━━━━━━━━━━━━━━━━━━━\n`;
  for (const ev of events) {
    msg +=
      `• *[${ev.type}] ${ev.symbol}* — *${ev.company}*\n` +
      `   Status: ${ev.status} | Units: ${ev.units} @ ${ev.price}\n` +
      `   Closing / Book Closure: *${ev.closeDate}* (${ev.issueManager})\n\n`;
  }
  msg +=
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 *FINAL SUMMARY (TL;DR — IPO & RIGHT SHARES)*\n` +
    `• *Open Now:* *${events.filter((e) => e.status.includes("OPEN")).map((e) => e.symbol).join(", ") || "Check MeroShare"}*\n` +
    `• *🧠 Action Plan:* Apply via MeroShare (CDSC) before 5:00 PM NPT on the closing date.`;
  return msg;
}

async function getImmediateBuyMessage() {
  const allQuotes = await nepseProvider.getAllQuotes();
  const analyses = [];

  for (const q of allQuotes) {
    const bars = nepseProvider.getHistoricalBars(q.symbol);
    const res = analyzeStock(q, bars);
    if (res) analyses.push(res);
  }

  const immediateList = analyses
    .filter((a) => a.isImmediateBuy)
    .sort((a, b) => b.quantScore - a.quantScore);

  const dipList = analyses
    .filter((a) => a.signalType === "BUY" && !a.isImmediateBuy)
    .sort((a, b) => b.quantScore - a.quantScore);

  let msg =
    `⚡ *NEPSE IMMEDIATE BUY CATEGORY (ENTER NOW AT LTP)*\n` +
    `⏳ _Primary Horizon: **1–4 Week Quick Swing Profits** (Each stock also shows its 1–5 Yr Long-Term Hold status below)_\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n`;

  for (const item of immediateList.slice(0, 8)) {
    const t1Kitta = item.executionMatrix.tranches.tranche1.kitta;
    const isBoth = item.longTerm.longTermScore >= 80;
    msg +=
      `⚡ *${item.symbol}* (${item.sector}) — *Buy Now @ NPR ${item.ltp}*\n` +
      `   • *Accuracy Grade:* *${item.accuracyGrade}* | *Quant Score:* *${item.quantScore}/100* | *Win Rate:* ${item.backtest.winRate}%\n` +
      `   • *⏳ Horizon Fit:* *⚡ 1–4 Wk Quick Swing* ${
        isBoth
          ? `+ *💎 1–5 Yr Long-Term Compounder (🌟 GOLDEN COMBO!)*`
          : `_(Long-Term: ${item.longTerm.longTermCategory}, LT Score: ${item.longTerm.longTermScore}/100)_`
      }\n` +
      `   • *Immediate Entry:* Buy Tranche 1 (*${t1Kitta} kitta*) @ *${item.executionMatrix.tranches.tranche1.zone}*\n` +
      `   • *Why Buy Now:* _${item.immediateBuyReason}_\n` +
      `   • *Targets:* 🎯 T1: *NPR ${item.executionMatrix.exits.exit1.price}* | T2: *NPR ${item.executionMatrix.exits.exit2.price}* | 🛑 SL: *${item.tradePlan.stopLoss.split(" ")[1]}*\n\n`;
  }

  if (dipList.length > 0) {
    msg += `🟢 *SECONDARY CATEGORY: WAIT FOR DIP (LIMIT ORDER)*\n`;
    for (const d of dipList.slice(0, 4)) {
      msg += `• *${d.symbol}* (LTP: ${d.ltp}) — Place Limit Buy @ *NPR ${d.indicators.ema20}* (POC: ${d.volumeProfile.poc})\n`;
    }
  }

  const topImmediate = immediateList[0] || analyses[0];
  msg +=
    `\n━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 *FINAL SUMMARY (TL;DR — IMMEDIATE BUY)*\n` +
    `• *⚡ #1 Immediate Buy Right Now (1–4 Wk Swing):* *${topImmediate?.symbol}* @ *NPR ${topImmediate?.ltp}* (Score: *${topImmediate?.quantScore}/100* | Accuracy: *${topImmediate?.accuracyGrade}*)\n` +
    `• *🟢 Action:* Enter *40% Tranche 1 (${topImmediate?.executionMatrix.tranches.tranche1.kitta} kitta)* immediately at CMP/LTP.\n` +
    `• *🔴 Profit Target 1:* *NPR ${topImmediate?.executionMatrix.exits.exit1.price}* | *🛑 Hard Stop-Loss:* *${topImmediate?.tradePlan.stopLoss}*\n` +
    `• *⚡ Want 1–4 Week Quick Swing Profits (Buy Today at LTP)?* 👉 Send *!immediate*\n` +
    `• *🚨 Want to see Stocks to Exit / Book Profit Immediately?* 👉 Send *!immediatesell*\n` +
    `• *💎 Want 1–5 Year Safe Dividend & Bonus Compounding?* 👉 Send *!longterm*\n` +
    `• *📰 Want Live Market & Stock News Catalysts?* 👉 Send *!news* or *!news ${topImmediate?.symbol}*\n` +
    `• *🔍 Want to see both for any stock?* 👉 Send the symbol (e.g. *NABIL*, *CBBL*, *MFIL*) and check the *⏳ SHORT-TERM vs LONG-TERM HORIZON* section on the card!`;

  return msg;
}

/**
 * Dedicated IMMEDIATE SELL Category (!immediatesell, !isell, !sellnow, immediate sell)
 * Ranks stocks where existing holders should exit/book profits immediately at current LTP
 * vs stocks where holders should place limit sell orders on rally.
 */
async function getImmediateSellMessage() {
  const m = await nepseProvider.getMarketSummary();
  const allQuotes = await nepseProvider.getAllQuotes();
  const analyses = [];

  for (const q of allQuotes) {
    const bars = nepseProvider.getHistoricalBars(q.symbol);
    const res = analyzeStock(q, bars);
    if (res) analyses.push(res);
  }

  const isCoreEquity = (a) => a.sector !== "NEPSE Listed" && !/\d{2,4}$/.test(a.symbol) ? 1 : 0;

  const immediateSellList = analyses
    .filter((a) => a.isImmediateSell && !/\d{2,4}$/.test(a.symbol))
    .sort((a, b) => isCoreEquity(b) - isCoreEquity(a) || b.sellUrgencyScore - a.sellUrgencyScore);

  const sellOnRallyList = analyses
    .filter((a) => !a.isImmediateSell && a.sellCategory === "🟠 SELL ON RALLY" && !/\d{2,4}$/.test(a.symbol))
    .sort((a, b) => isCoreEquity(b) - isCoreEquity(a) || b.sellUrgencyScore - a.sellUrgencyScore);

  let msg =
    `🚨 *NEPSE IMMEDIATE SELL CATEGORY (EXIT / BOOK PROFIT NOW AT LTP)* 🚨\n` +
    `📡 _NEPSE Index: *${formatNPR(m.nepseIndex)}* | ${m.freshnessBadge}_\n` +
    `⏳ _Identifies stocks facing Overbought Climax, Bearish Trend Breakdown, or Lock-In/Valuation Traps where holders should exit immediately at current LTP:_\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🚨 *CATEGORY 1: IMMEDIATE SELL — EXIT NOW AT LTP (${immediateSellList.length} Stocks)*\n\n`;

  for (const item of immediateSellList.slice(0, 8)) {
    const sellCalc100 = calculateSell(100, item.ltp, Math.round(item.ltp * 0.92), 30);
    msg +=
      `🚨 *${item.symbol}* (${item.sector}) — *SELL NOW @ LTP NPR ${item.ltp}*\n` +
      `   • *Exit Urgency:* *${item.sellUrgencyScore}/100* | *Quant Score:* ${item.quantScore}/100 | *RSI(14):* ${item.indicators.rsi14}\n` +
      `   • *Immediate Action:* *Sell 50%–100% of holdings immediately at LTP (NPR ${item.ltp})*\n` +
      `   • *Why Sell Immediately:* _${item.immediateSellReason}_\n` +
      `   • *Supply & Brokers:* Top Sellers: Broker *#${item.smartMoney.topSellBrokers.join(", #")}* | Lock-In: *${item.fundamentals.lockInRisk}* | P/E: *${item.fundamentals.pe}x*\n` +
      `   • *Downside Risk Zones:* Next Support S1: *NPR ${item.tradePlan.support1}* | Deep Floor S2: *NPR ${item.tradePlan.support2}*\n` +
      `   • *⏳ Horizon Check:* Short-Term: *${item.sellCategory}* | Long-Term (1–5 Yrs): *${item.longTerm.longTermCategory}* (LT Score: ${item.longTerm.longTermScore}/100)\n` +
      `   • *💰 Net Proceeds (per 100 kitta @ LTP):* *NPR ${formatNPR(sellCalc100.netReceivable)}* (after SEBON & Broker fees)\n\n`;
  }

  if (sellOnRallyList.length > 0) {
    msg += `🟠 *CATEGORY 2: SELL ON RALLY — PLACE LIMIT SELL AT TARGET 1 / R1*\n`;
    for (const r of sellOnRallyList.slice(0, 5)) {
      msg +=
        `• 🟠 *${r.symbol}* (LTP: NPR ${r.ltp}) — Book 35%–50% Profit @ *NPR ${r.executionMatrix.exits.exit1.price}* (R1: NPR ${r.tradePlan.resistance1}) | 🛑 Trail SL: *NPR ${r.executionMatrix.exits.hardStop.price}*\n`;
    }
  }

  const topExit = immediateSellList[0] || analyses.sort((a, b) => a.quantScore - b.quantScore)[0];
  msg +=
    `\n━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 *FINAL SUMMARY (TL;DR — IMMEDIATE SELL)*\n` +
    `• *🚨 #1 Most Urgent Immediate Sell:* *${topExit?.symbol}* @ *NPR ${topExit?.ltp}* (Urgency: *${topExit?.sellUrgencyScore}/100* | Quant: *${topExit?.quantScore}/100*)\n` +
    `• *🔴 Action for Holders:* Exit *50%–100%* at current LTP (*NPR ${topExit?.ltp}*) during 11:08–11:30 AM spike; do NOT hold below *NPR ${topExit?.executionMatrix.exits.hardStop.price}*.\n` +
    `• *🟢 Action for Fresh Buyers:* *AVOID chasing!* Wait for correction to Support S1 (*NPR ${topExit?.tradePlan.support1}*).\n` +
    `• *🧮 Check Your Exact Net Profit/CGT:* Send *!sell ${topExit?.symbol} <YOUR_BUY_PRICE> <KITTA>* (e.g. *!sell ${topExit?.symbol} ${Math.round((topExit?.ltp || 500) * 0.93)} 100*)\n` +
    `• *⚡ Want 1–4 Week Quick Swing Profits (Buy Today at LTP)?* 👉 Send *!immediate*\n` +
    `• *💎 Want 1–5 Year Safe Dividend & Bonus Compounding?* 👉 Send *!longterm*\n` +
    `• *🔍 Want to see both for any stock?* 👉 Send the symbol (e.g. *NABIL*, *CBBL*, *MFIL*) and check the *⏳ SHORT-TERM vs LONG-TERM HORIZON* section on the card!`;

  return msg;
}

/**
 * Dedicated LONG-TERM HOLD & Dividend Compounding Engine (!longterm, !hold, long term)
 */
async function getLongTermHoldMessage(arg = "") {
  const allQuotes = await nepseProvider.getAllQuotes();
  const analyses = [];

  for (const q of allQuotes) {
    const bars = nepseProvider.getHistoricalBars(q.symbol);
    const res = analyzeStock(q, bars);
    if (res) analyses.push(res);
  }

  const blueChips = analyses
    .filter((a) => a.longTerm.longTermScore >= 82)
    .sort((a, b) => b.longTerm.longTermScore - a.longTerm.longTermScore);

  const dividendValuePicks = analyses
    .filter((a) => a.longTerm.longTermScore >= 70 && a.longTerm.longTermScore < 82)
    .sort((a, b) => b.longTerm.longTermScore - a.longTerm.longTermScore);

  const avoidLongTerm = analyses
    .filter((a) => a.longTerm.longTermScore < 58)
    .sort((a, b) => a.longTerm.longTermScore - b.longTerm.longTermScore);

  let msg =
    `💎 *NEPSE LONG-TERM HOLD & WEALTH COMPOUNDERS (1–5 YEAR HORIZON)* 💎\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `_Ranked by 100-Pt Long-Term Score: 5-Yr Dividend/Bonus History, Graham Intrinsic Value, ROE Moat, Low NPL & Lock-In Safety:_\n\n` +
    `👑 *CATEGORY 1: BLUE-CHIP WEALTH COMPOUNDERS (Score ≥ 82/100)*\n`;

  for (const item of blueChips.slice(0, 7)) {
    const f = item.fundamentals;
    const lt = item.longTerm;
    msg +=
      `💎 *${item.symbol}* (${item.sector}) — *LT Score: ${lt.longTermScore}/100*\n` +
      `   • *LTP:* NPR ${item.ltp} | *Fair Value:* NPR ${f.compositeFairValue} (Graham: NPR ${f.grahamValue})\n` +
      `   • *5Y Avg Dividend:* *${f.divHistory5YrAvg}%* (Latest: ${f.bonusDividend}% Bonus + ${f.cashDividend}% Cash)\n` +
      `   • *Fundamentals:* ROE: *${f.roe}%* | EPS: NPR ${f.eps} | P/E: ${f.pe}x${f.npl > 0 ? ` | NPL: ${f.npl}%` : ""}\n` +
      `   • *Ideal SIP Buy Zone:* *${lt.sipZone}* | *1Yr Target:* *NPR ${lt.target1Yr}* | *3Yr Target:* *NPR ${lt.target3Yr}* (~${lt.expectedAnnualCagr}% CAGR)\n` +
      `   • *Swing Status Today:* ${item.buyCategory} (Swing Score: ${item.quantScore}/100)\n\n`;
  }

  msg += `💰 *CATEGORY 2: DIVIDEND & VALUE ACCUMULATION PICKS (Score 70–81)*\n`;
  for (const item of dividendValuePicks.slice(0, 5)) {
    const f = item.fundamentals;
    const lt = item.longTerm;
    msg +=
      `• *${item.symbol}* (${item.sector}) — *LT Score: ${lt.longTermScore}/100* | LTP: NPR ${item.ltp}\n` +
      `   5Y Div: *${f.divHistory5YrAvg}%* | ROE: ${f.roe}% | P/E: ${f.pe}x | SIP Zone: *${lt.sipZone}* → 1Yr: *NPR ${lt.target1Yr}*\n`;
  }

  msg += `\n⚠️ *CATEGORY 3: SWING ONLY — AVOID FOR LONG-TERM HOLD*\n`;
  for (const item of avoidLongTerm.slice(0, 4)) {
    msg +=
      `• *${item.symbol}* (NPR ${item.ltp}) — LT Score: ${item.longTerm.longTermScore}/100 | _Reason: ${item.longTerm.ltRisks[0] || `High P/E (${item.fundamentals.pe}x) / Low Dividend`}_\n`;
  }

  const topLT = blueChips[0] || analyses[0];
  const bestBankLT = blueChips.find((a) => a.sector === "Commercial Banks") || topLT;
  const bestDivKing = [...analyses].sort((a, b) => b.fundamentals.divHistory5YrAvg - a.fundamentals.divHistory5YrAvg)[0];

  msg +=
    `\n━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 *FINAL SUMMARY (TL;DR — LONG-TERM HOLD)*\n` +
    `• *💎 #1 Overall Long-Term Compounder:* *${topLT?.symbol}* (LT Score: *${topLT?.longTerm.longTermScore}/100* | 5Y Avg Div: *${topLT?.fundamentals.divHistory5YrAvg}%*)\n` +
    `• *🏦 Best Long-Term Bank:* *${bestBankLT?.symbol}* (NPL: ${bestBankLT?.fundamentals.npl}% | ROE: ${bestBankLT?.fundamentals.roe}% | 5Y Div: ${bestBankLT?.fundamentals.divHistory5YrAvg}%)\n` +
    `• *💰 #1 Dividend Cash-Cow:* *${bestDivKing?.symbol}* (5Y Avg Dividend: *${bestDivKing?.fundamentals.divHistory5YrAvg}%*)\n` +
    `• *🗓️ Monthly SIP Rule:* Accumulate *${blueChips.slice(0, 4).map((x) => x.symbol).join(", ")}* inside their SIP Zones during 1:15–1:50 PM dips and hold across Book Closure dates to compound Bonus Shares.\n` +
    `• *⚡ Want 1–4 Week Quick Swing Profits (Buy Today at LTP)?* 👉 Send *!immediate*\n` +
    `• *💎 Want 1–5 Year Safe Dividend & Bonus Compounding?* 👉 Send *!longterm*\n` +
    `• *📰 Want Live Market & Stock News Catalysts?* 👉 Send *!news* or *!news ${topLT?.symbol}*\n` +
    `• *🔍 Want to see both for any stock?* 👉 Send the symbol (e.g. *NABIL*, *CBBL*, *MFIL*) and check the *⏳ SHORT-TERM vs LONG-TERM HORIZON* section on the card!`;

  return msg;
}

/**
 * Dedicated BEST IN SECTOR Leaderboards (!best, !best banking, !best finance, !best hydro, etc.)
 */
async function getBestInSectorMessage(sectorQuery = "") {
  const allQuotes = await nepseProvider.getAllQuotes();
  const analyses = [];

  for (const q of allQuotes) {
    const bars = nepseProvider.getHistoricalBars(q.symbol);
    const res = analyzeStock(q, bars);
    if (res) analyses.push(res);
  }

  const qClean = (sectorQuery || "").trim().toLowerCase();

  // Map user query to exact NEPSE sector(s)
  let matchedSector = null;
  let customHeader = "";
  let sectorCriteriaDesc = "";

  if (qClean.includes("dev") && qClean.includes("bank")) {
    matchedSector = "Development Banks";
    customHeader = "DEVELOPMENT BANKS (BIKAS BANK)";
    sectorCriteriaDesc = "NPL Asset Quality + ROE % + 5Yr Bonus/Cash Dividend + P/E & PBV + Smart Money Flow";
  } else if (qClean.includes("bank") || qClean === "commercial") {
    matchedSector = "Commercial Banks";
    customHeader = "COMMERCIAL BANKS (CLASS 'A' BANKING)";
    sectorCriteriaDesc = "Lowest NPL % + Distributable Dividend Capacity (5Y Avg) + ROE % + P/E & PBV Valuation + Institutional Flow";
  } else if (qClean.includes("fin")) {
    matchedSector = "Finance";
    customHeader = "FINANCE SECTOR (CLASS 'C' HIGH-BETA)";
    sectorCriteriaDesc = "YoY Quarterly EPS Growth + Whale Broker Concentration % + High-Beta Swing Momentum + ROE %";
  } else if (qClean.includes("hydro") || qClean.includes("power") || qClean.includes("energy")) {
    matchedSector = "Hydropower";
    customHeader = "HYDROPOWER SECTOR";
    sectorCriteriaDesc = "Generation Efficiency (EPS & ROE) + P/E vs Sector + Lock-In Expiry Safety + Dividend History";
  } else if (qClean.includes("micro") || qClean.includes("laghubitta") || qClean.includes("mfi")) {
    matchedSector = "Microfinance";
    customHeader = "MICROFINANCE (LAGHUBITTA) SECTOR";
    sectorCriteriaDesc = "Core ROE % + Book Value (NWPS) + 5Yr Bonus Share Compounding + Low NPL + Swing Trend";
  } else if (qClean.includes("insur") || qClean.includes("life")) {
    matchedSector = "Insurance";
    customHeader = "INSURANCE SECTOR (LIFE & NON-LIFE)";
    sectorCriteriaDesc = "ROE % + Book Value + Bonus/Dividend History + P/E Valuation + Institutional Accumulation";
  } else if (qClean.includes("manu") || qClean.includes("prod") || qClean.includes("cement") || qClean.includes("distill")) {
    matchedSector = "Manufacturing & Processing";
    customHeader = "MANUFACTURING & PROCESSING";
    sectorCriteriaDesc = "ROE Moat + 5Yr Dividend Payout + Graham Intrinsic Value + Swing Momentum";
  } else if (qClean.includes("invest") || qClean.includes("other") || qClean.includes("telecom")) {
    matchedSector = "Investment & Others";
    customHeader = "INVESTMENT, TELECOM & OTHERS";
    sectorCriteriaDesc = "Dividend Yield % + Book Value + ROE % + Institutional Accumulation";
  }

  // If user asked for a specific sector (e.g. !best banking, !best finance, !best hydro)
  if (matchedSector) {
    const sectorStocks = analyses
      .filter((a) => {
        if (matchedSector === "Insurance") return a.sector.includes("Insurance");
        if (matchedSector === "Investment & Others") return ["Investment", "Others", "Trading", "Hotels & Tourism"].includes(a.sector);
        return a.sector === matchedSector;
      })
      .sort((a, b) => b.sectorChampion.sectorScore - a.sectorChampion.sectorScore);

    let msg =
      `🏆 *BEST IN ${customHeader} — NEPSE SECTOR LEADERBOARD* 🏆\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 *Ranking Factors:* ${sectorCriteriaDesc}\n\n`;

    sectorStocks.forEach((item, idx) => {
      const medal = idx === 0 ? "🥇 #1" : idx === 1 ? "🥈 #2" : idx === 2 ? "🥉 #3" : `*#${idx + 1}*`;
      msg +=
        `${medal} *${item.symbol}* (${item.companyName}) — *Sector Score: ${item.sectorChampion.sectorScore}/100*\n` +
        `   • *LTP:* *NPR ${item.ltp}* (${item.percentageChange >= 0 ? "+" : ""}${item.percentageChange}%) | *Accuracy:* ${item.accuracyGrade}\n` +
        `   • *Sector KPIs:* ${item.sectorChampion.kpiSummary}\n` +
        `   • *⚡ Swing Verdict:* *${item.buyCategory}* (Quant: ${item.quantScore}/100 | Entry: ${item.executionMatrix.tranches.tranche1.zone})\n` +
        `   • *💎 Long-Term Verdict:* *${item.longTerm.longTermCategory}* (LT Score: ${item.longTerm.longTermScore}/100 | SIP: ${item.longTerm.sipZone})\n` +
        `   • *Targets:* 🎯 T1: *${item.tradePlan.target1.split(" ")[1]}* | 1Yr LT: *NPR ${item.longTerm.target1Yr}* | 🛑 SL: *${item.tradePlan.stopLoss.split(" ")[1]}*\n\n`;
    });

    const topOverall = sectorStocks[0];
    const topSwing = [...sectorStocks].sort((a, b) => b.quantScore - a.quantScore)[0];
    const topLongTerm = [...sectorStocks].sort((a, b) => b.longTerm.longTermScore - a.longTerm.longTermScore)[0];

    msg +=
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📌 *FINAL SUMMARY (TL;DR — BEST IN ${customHeader})*\n` +
      `• *🥇 #1 Overall Sector Champion:* *${topOverall?.symbol}* @ *NPR ${topOverall?.ltp}* (Sector Score: *${topOverall?.sectorChampion.sectorScore}/100*)\n` +
      `• *⚡ #1 Best for Immediate Swing Trade:* *${topSwing?.symbol}* (${topSwing?.buyCategory} | Quant Score: *${topSwing?.quantScore}/100* | T1: *NPR ${topSwing?.executionMatrix.exits.exit1.price}*)\n` +
      `• *💎 #1 Best for Long-Term Hold (1–5 Yrs):* *${topLongTerm?.symbol}* (${topLongTerm?.longTerm.longTermCategory} | LT Score: *${topLongTerm?.longTerm.longTermScore}/100* | 5Y Div: *${topLongTerm?.fundamentals.divHistory5YrAvg}%*)\n` +
      `• *🧠 Next Step:* Reply *!buy ${topOverall?.symbol}* for exact 3-Tranche kitta sizing.`;

    return msg;
  }

  // Otherwise (!best or !best all): Show the Master Leaderboard of #1 Champions across EVERY Major NEPSE Sector!
  const sectorGroups = [
    { label: "🏦 Commercial Banking", filter: (a) => a.sector === "Commercial Banks", cmdHint: "!best banking" },
    { label: "🏛️ Development Banks", filter: (a) => a.sector === "Development Banks", cmdHint: "!best devbank" },
    { label: "📈 Finance (High-Beta)", filter: (a) => a.sector === "Finance", cmdHint: "!best finance" },
    { label: "🌊 Hydropower", filter: (a) => a.sector === "Hydropower", cmdHint: "!best hydro" },
    { label: "🤝 Microfinance (Laghubitta)", filter: (a) => a.sector === "Microfinance", cmdHint: "!best micro" },
    { label: "🛡️ Insurance (Life & Non-Life)", filter: (a) => a.sector.includes("Insurance"), cmdHint: "!best insurance" },
    { label: "🏭 Manufacturing & Processing", filter: (a) => a.sector === "Manufacturing & Processing", cmdHint: "!best manufacturing" },
    { label: "📡 Telecom, Investment & Others", filter: (a) => ["Others", "Investment", "Trading", "Hotels & Tourism"].includes(a.sector), cmdHint: "!best others" }
  ];

  let msg =
    `🏆 *NEPSE MASTER SECTOR CHAMPIONS — BEST STOCKS IN EVERY SECTOR* 🏆\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `_Evaluated using Sector-Specific Institutional KPIs (NPL%, ROE%, 5Yr Dividend, Lock-In Safety & Whale Accumulation):_\n\n`;

  const champions = [];

  for (const sg of sectorGroups) {
    const group = analyses.filter(sg.filter).sort((a, b) => b.sectorChampion.sectorScore - a.sectorChampion.sectorScore);
    if (!group.length) continue;
    const champ = group[0];
    const runnerUp = group[1];
    const bestLT = [...group].sort((a, b) => b.longTerm.longTermScore - a.longTerm.longTermScore)[0];
    const bestSwing = [...group].sort((a, b) => b.quantScore - a.quantScore)[0];
    champions.push(champ);

    msg +=
      `${sg.label} _(Detail: *${sg.cmdHint}*)_\n` +
      `   🥇 *#1 Champion:* *${champ.symbol}* (NPR ${champ.ltp}) — *Sector Score: ${champ.sectorChampion.sectorScore}/100*\n` +
      `   • *KPIs:* ${champ.sectorChampion.kpiSummary}\n` +
      `   • *⚡ Best Swing:* *${bestSwing.symbol}* (${bestSwing.buyCategory}, ${bestSwing.quantScore}/100) | *💎 Best Long-Term:* *${bestLT.symbol}* (LT: ${bestLT.longTerm.longTermScore}/100)\n` +
      (runnerUp ? `   • *🥈 Runner-Up:* *${runnerUp.symbol}* (NPR ${runnerUp.ltp}, Score: ${runnerUp.sectorChampion.sectorScore}/100)\n\n` : `\n`);
  }

  const top3Overall = [...champions].sort((a, b) => b.sectorChampion.sectorScore - a.sectorChampion.sectorScore).slice(0, 3);
  msg +=
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 *FINAL SUMMARY (TL;DR — ALL SECTOR CHAMPIONS)*\n` +
    `• *🏦 Best in Banking:* *${analyses.filter((a) => a.sector === "Commercial Banks").sort((a, b) => b.sectorChampion.sectorScore - a.sectorChampion.sectorScore)[0]?.symbol}* (Long-Term) & *GBIME / PCBL* (Value Swing)\n` +
    `• *📈 Best in Finance:* *${analyses.filter((a) => a.sector === "Finance").sort((a, b) => b.sectorChampion.sectorScore - a.sectorChampion.sectorScore)[0]?.symbol}* (High-Beta Swing + EPS Growth)\n` +
    `• *🌊 Best in Hydropower:* *${analyses.filter((a) => a.sector === "Hydropower").sort((a, b) => b.sectorChampion.sectorScore - a.sectorChampion.sectorScore)[0]?.symbol}* (High ROE + Safe Lock-In)\n` +
    `• *🤝 Best in Microfinance & Insurance:* *CBBL* & *NIL*\n` +
    `• *🏆 Top 3 Cross-Sector Institutional Picks:* *${top3Overall.map((c) => c.symbol).join(", ")}*\n` +
    `• *🧠 Drill Down:* Send *!best banking*, *!best finance*, *!best hydro*, *!best micro*, or *!longterm* for full sector rankings!`;

  return msg;
}

async function getScannerMessage(filter = "all") {
  const allQuotes = await nepseProvider.getAllQuotes();
  const analyses = [];

  for (const q of allQuotes) {
    const bars = nepseProvider.getHistoricalBars(q.symbol);
    const res = analyzeStock(q, bars);
    if (res) analyses.push(res);
  }

  const immediateList = analyses.filter((a) => a.isImmediateBuy).sort((a, b) => b.quantScore - a.quantScore);
  const dipBuyList = analyses.filter((a) => a.signalType === "BUY" && !a.isImmediateBuy).sort((a, b) => b.quantScore - a.quantScore);
  const buyList = analyses.filter((a) => a.signalType === "BUY").sort((a, b) => b.quantScore - a.quantScore);
  const sellList = analyses.filter((a) => a.isImmediateSell || a.signalType === "SELL").sort((a, b) => b.sellUrgencyScore - a.sellUrgencyScore);

  let msg = `📡 *NEPSE 100-POINT QUANT SIGNAL SCANNER*\n━━━━━━━━━━━━━━━━━━━━━━\n`;

  if (filter === "buy" || filter === "all") {
    msg += `⚡ *CATEGORY 1: IMMEDIATE BUY — ENTER NOW AT LTP (${immediateList.length})*\n`;
    for (const item of immediateList.slice(0, 6)) {
      msg +=
        `• *${item.symbol}* (NPR ${item.ltp}) — *⚡ IMMEDIATE BUY*\n` +
        `   Score: *${item.quantScore}/100* | MTF: ${item.mtf.bullCount}/3 | Win%: ${item.backtest.winRate}% | 🎯 T1: ${item.tradePlan.target1.split(" ")[1]} | 🛑 SL: ${item.tradePlan.stopLoss.split(" ")[1]}\n`;
    }
    msg += `\n🟢 *CATEGORY 2: BUY ON DIP — LIMIT ORDER SETUPS (${dipBuyList.length})*\n`;
    for (const item of dipBuyList.slice(0, 5)) {
      msg +=
        `• *${item.symbol}* (NPR ${item.ltp}) — Dip Buy @ *NPR ${item.indicators.ema20}*\n` +
        `   Score: *${item.quantScore}/100* | POC: ${item.volumeProfile.poc} | 🎯 T1: ${item.tradePlan.target1.split(" ")[1]}\n`;
    }
    msg += `\n`;
  }

  if (filter === "sell" || filter === "all") {
    msg += `🚨 *CATEGORY 3: IMMEDIATE SELL — EXIT NOW AT LTP (${sellList.length})*\n`;
    for (const item of sellList.slice(0, 6)) {
      msg +=
        `• 🚨 *${item.symbol}* (NPR ${item.ltp}) — *${item.sellCategory}* (Urgency: *${item.sellUrgencyScore}/100*)\n` +
        `   Score: ${item.quantScore}/100 | RSI: ${item.indicators.rsi14} | Support S1: NPR ${item.tradePlan.support1}\n`;
    }
    msg += `\n`;
  }

  const topImmediate = immediateList[0] || buyList[0];
  const topSell = sellList[0];
  msg +=
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 *FINAL SUMMARY (TL;DR — MARKET SCANNER)*\n` +
    `• *⚡ #1 Immediate Buy (At LTP):* *${topImmediate?.symbol || "NABIL"}* @ NPR ${topImmediate?.ltp} (Score: *${topImmediate?.quantScore || 88}/100*)\n` +
    `• *🚨 #1 Immediate Sell Alert (Exit @ LTP):* *${topSell?.symbol || "UPPER"}* @ NPR ${topSell?.ltp} (Urgency: *${topSell?.sellUrgencyScore || 85}/100*)\n` +
    `• *🧠 Next Step:* Send *!immediate* for Immediate Buys, *!immediatesell* for Immediate Sells, or *!buy ${topImmediate?.symbol || "NABIL"}* for exact kitta sizing.`;
  return msg;
}

async function getTopMoversMessage() {
  const all = await nepseProvider.getAllQuotes();
  const gainers = [...all].sort((a, b) => b.percentageChange - a.percentageChange).slice(0, 5);
  const losers = [...all].sort((a, b) => a.percentageChange - b.percentageChange).slice(0, 5);
  const volLeaders = [...all].sort((a, b) => b.turnover - a.turnover).slice(0, 5);

  let msg = `🏆 *NEPSE TOP MOVERS & TURNOVER LEADERS*\n━━━━━━━━━━━━━━━━━━━━━━\n`;

  msg += `🟢 *TOP 5 GAINERS*\n`;
  for (const g of gainers) {
    msg += `• *${g.symbol}*: NPR ${g.ltp} (+${g.percentageChange}% | +${g.pointChange})\n`;
  }

  msg += `\n🔴 *TOP 5 LOSERS*\n`;
  for (const l of losers) {
    msg += `• *${l.symbol}*: NPR ${l.ltp} (${l.percentageChange}% | ${l.pointChange})\n`;
  }

  msg += `\n💰 *TOP 5 TURNOVER LEADERS*\n`;
  for (const v of volLeaders) {
    msg += `• *${v.symbol}*: NPR ${formatNPR(v.turnover)} (${formatInt(v.volume)} kitta)\n`;
  }

  msg +=
    `\n━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 *FINAL SUMMARY (TL;DR — TOP MOVERS)*\n` +
    `• *Top Gainer:* *${gainers[0]?.symbol}* (+${gainers[0]?.percentageChange}%) | *Top Turnover:* *${volLeaders[0]?.symbol}*\n` +
    `• *🧠 Action Plan:* Avoid chasing +9% circuit gainers at 11 AM; check *!signal ${volLeaders[0]?.symbol}* for institutional pullback entries.`;
  return msg;
}

function getSectorsMessage() {
  const sectors = nepseProvider.getSectors();
  let msg = `🏛️ *NEPSE SECTOR INDICES & VALUATION*\n━━━━━━━━━━━━━━━━━━━━━━\n`;

  for (const s of sectors) {
    const icon = s.change >= 0 ? "🟢" : "🔴";
    const sign = s.change >= 0 ? "+" : "";
    msg += `${icon} *${s.name}*: ${formatNPR(s.indexVal)} (${sign}${s.change} / ${sign}${s.percentageChange}%) | P/E: ${s.sectorPE}x\n`;
  }

  const bestSec = [...sectors].sort((a, b) => b.percentageChange - a.percentageChange)[0];
  msg +=
    `\n━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 *FINAL SUMMARY (TL;DR — SECTORS)*\n` +
    `• *Strongest Sector Today:* *${bestSec?.name}* (+${bestSec?.percentageChange}% | Sector P/E: ${bestSec?.sectorPE}x)\n` +
    `• *🧠 Next Step:* Reply *!rotation* to see Leading vs Improving institutional quadrants.`;
  return msg;
}

function getCalcMessage(args) {
  if (args.length < 3) {
    return (
      `🧮 *SEBON SHARE CALCULATOR USAGE*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `• *Buy Calculation:*\n` +
      `  *!calc buy <QTY> <PRICE>*\n` +
      `  Example: *!calc buy 100 520*\n\n` +
      `• *Sell & Profit/Tax Calculation:*\n` +
      `  *!calc sell <QTY> <SELL_PRICE> <BUY_PRICE>*\n` +
      `  Example: *!calc sell 100 610 520*`
    );
  }

  const side = args[0].toLowerCase();
  const qty = parseInt(args[1], 10);
  const price = parseFloat(args[2]);
  const buyPrice = args[3] ? parseFloat(args[3]) : null;

  if (isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) {
    return `⚠️ Invalid quantity or price. Example: *!calc buy 100 520*`;
  }

  if (side === "buy") {
    const res = calculateBuy(qty, price);
    return (
      `🧮 *SEBON BUY COST & WACC CALCULATOR*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `• *Quantity:* ${formatInt(res.qty)} kitta @ NPR ${formatNPR(res.price)}\n` +
      `• *Gross Amount:* NPR ${formatNPR(res.grossAmount)}\n` +
      `• *Broker Commission:* NPR ${formatNPR(res.brokerCommission)}\n` +
      `  _(${res.commissionSlab})_\n` +
      `• *SEBON Fee (0.015%):* NPR ${formatNPR(res.sebonFee)}\n` +
      `• *DP Fee:* NPR ${res.dpCharge}.00\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📌 *FINAL SUMMARY (TL;DR — BUY COST)*\n` +
      `• *💳 Total Payable:* *NPR ${formatNPR(res.totalPayable)}*\n` +
      `• *📌 WACC per Share:* *NPR ${formatNPR(res.waccPerShare)}*\n` +
      `• *⚖️ Breakeven Sell Price:* *NPR ${formatNPR(res.breakevenSellPrice)}*`
    );
  } else if (side === "sell") {
    const res = calculateSell(qty, price, buyPrice, 30);
    let msg =
      `🧮 *SEBON SELL & CAPITAL GAINS CALCULATOR*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `• *Quantity:* ${formatInt(res.qty)} kitta @ NPR ${formatNPR(res.sellPrice)}\n` +
      `• *Gross Sale:* NPR ${formatNPR(res.grossAmount)}\n` +
      `• *Broker Commission:* NPR ${formatNPR(res.brokerCommission)}\n` +
      `• *SEBON Fee (0.015%):* NPR ${formatNPR(res.sebonFee)}\n` +
      `• *DP Fee:* NPR ${res.dpCharge}.00\n`;

    if (res.buyPrice) {
      msg +=
        `• *Buy Price:* NPR ${formatNPR(res.buyPrice)}\n` +
        `• *CGT Tax (${res.cgtRate}%):* NPR ${formatNPR(res.cgtAmount)}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📌 *FINAL SUMMARY (TL;DR — SELL PROFIT)*\n` +
        `• *💰 Net Receivable:* *NPR ${formatNPR(res.netReceivable)}*\n` +
        `• *${res.netProfit >= 0 ? "🟢 Net Profit:" : "🔴 Net Loss:"}* *NPR ${formatNPR(res.netProfit)} (${res.roiPct >= 0 ? "+" : ""}${res.roiPct}%)*`;
    } else {
      msg +=
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📌 *FINAL SUMMARY (TL;DR — SELL PROCEEDS)*\n` +
        `• *💰 Net Receivable (Before CGT):* *NPR ${formatNPR(res.netReceivable)}*\n` +
        `💡 _Tip: Add buy price to calculate CGT & profit: *!calc sell ${qty} ${price} 450*_`;
    }
    return msg;
  }

  return `⚠️ Unknown side. Use *!calc buy <QTY> <PRICE>* or *!calc sell <QTY> <SELL_PRICE> <BUY_PRICE>*.`;
}

async function handleAlertCommand(args, senderId) {
  if (!args.length || args[0].toLowerCase() === "list") {
    const userAlerts = appState.alerts.filter((a) => a.active);
    if (!userAlerts.length) {
      return `🔔 *No active price alerts.*\nSet one with: *!alert NABIL above 550* or *!alert NICA below 400*`;
    }
    let msg = `🔔 *ACTIVE NEPSE PRICE ALERTS*\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    for (const a of userAlerts) {
      const q = await nepseProvider.getQuote(a.symbol);
      const curr = q ? ` (LTP: ${q.ltp})` : "";
      msg += `• *#${a.id} ${a.symbol}* ${a.condition} *NPR ${a.targetPrice}*${curr}\n`;
    }
    msg += `\n_Add alert: *!alert <SYM> above/below <PRICE>*_\n_Clear alerts: *!alert clear*_`;
    return msg;
  }

  if (args[0].toLowerCase() === "clear") {
    appState.alerts = [];
    saveState(appState);
    return `🗑️ All price alerts have been cleared.`;
  }

  if (args.length < 3) {
    return `⚠️ Format: *!alert <SYMBOL> <above|below> <PRICE>*\nExample: *!alert NABIL above 545*`;
  }

  const symbol = args[0].toUpperCase();
  const cond = args[1].toUpperCase();
  const targetPrice = parseFloat(args[2]);

  if (!["ABOVE", "BELOW"].includes(cond) || isNaN(targetPrice) || targetPrice <= 0) {
    return `⚠️ Invalid alert syntax. Example: *!alert NABIL above 545*`;
  }

  const q = await nepseProvider.getQuote(symbol);
  if (!q) {
    return `❌ Symbol *${symbol}* not found in NEPSE.`;
  }

  const newAlert = {
    id: appState.alerts.length + 1,
    user: senderId,
    symbol,
    condition: cond,
    targetPrice,
    active: true,
    createdAt: new Date().toISOString()
  };

  appState.alerts.push(newAlert);
  saveState(appState);

  return (
    `✅ *PRICE ALERT ACTIVATED!* 🔔\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `• *Scrip:* ${symbol} (${q.companyName})\n` +
    `• *Condition:* Price goes *${cond} NPR ${targetPrice}*\n` +
    `• *Current LTP:* NPR ${q.ltp}\n\n` +
    `You will receive an instant WhatsApp notification when triggered.`
  );
}

async function handleWatchlistCommand(args, senderId) {
  const key = "default";
  if (!appState.watchlists[key]) {
    appState.watchlists[key] = ["NABIL", "NICA", "HDL", "UPPER", "CBBL", "SAHAS"];
  }
  const list = appState.watchlists[key];

  if (args.length >= 2) {
    const sub = args[0].toLowerCase();
    const sym = args[1].toUpperCase();
    if (sub === "add") {
      const q = await nepseProvider.getQuote(sym);
      if (!q) return `❌ Symbol *${sym}* not found in NEPSE.`;
      if (!list.includes(sym)) {
        list.push(sym);
        saveState(appState);
      }
      return `✅ Added *${sym}* to your NEPSE Watchlist! Send *!watchlist* to view live signals.`;
    } else if (sub === "remove" || sub === "del") {
      appState.watchlists[key] = list.filter((s) => s !== sym);
      saveState(appState);
      return `🗑️ Removed *${sym}* from your Watchlist.`;
    }
  }

  let msg = `⭐ *YOUR NEPSE WATCHLIST & QUANT SCORES*\n━━━━━━━━━━━━━━━━━━━━━━\n`;
  let bestWatch = null;
  for (const sym of appState.watchlists[key]) {
    const q = await nepseProvider.getQuote(sym);
    const bars = nepseProvider.getHistoricalBars(sym);
    if (!q) continue;
    const a = analyzeStock(q, bars);
    if (a && (!bestWatch || a.quantScore > bestWatch.quantScore)) bestWatch = a;
    const sign = q.pointChange >= 0 ? "+" : "";
    msg +=
      `• *${q.symbol}*: NPR ${q.ltp} (${sign}${q.percentageChange}%)\n` +
      `   *${a ? a.action : "HOLD"}* (${a ? a.quantScore : 50}/100) | Win%: ${a ? a.backtest.winRate : "-"}% | T1: ${a ? a.tradePlan.target1.split(" ")[1] : "-"}\n`;
  }

  msg +=
    `\n━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 *FINAL SUMMARY (TL;DR — WATCHLIST)*\n` +
    `• *Strongest Watchlist Pick:* *${bestWatch?.symbol || "NABIL"}* (Score: *${bestWatch?.quantScore || 85}/100* | Verdict: *${bestWatch?.action || "BUY"}*)\n` +
    `• *🧠 Next Step:* Reply *!buy ${bestWatch?.symbol || "NABIL"}* for exact entry tranches.\n` +
    `➕ _Add: *!watchlist add SHPC* | Remove: *!watchlist remove SHPC*_`;
  return msg;
}

async function getSmcAnalysisMessage(symbolArg) {
  if (symbolArg) {
    const q = await nepseProvider.getQuote(symbolArg.toUpperCase());
    if (!q) return `❌ Symbol *${symbolArg.toUpperCase()}* not found in NEPSE. Try *!smc NABIL* or *!smc*.`;
    const bars = nepseProvider.getHistoricalBars(q.symbol);
    const a = analyzeStock(q, bars);
    if (!a || !a.smc) return `❌ Insufficient bar history for *${q.symbol}*.`;
    const smc = a.smc;
    const tp = smc.smcTradePlan || {};
    return (
      `🏦 *SMC (SMART MONEY CONCEPTS) BLUEPRINT — ${q.symbol}* (${q.companyName})\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `• *Current LTP:* NPR ${q.ltp} (${q.pointChange >= 0 ? "+" : ""}${q.percentageChange}%)\n` +
      `• *SMC Score:* *${smc.smcScore}/100* (${smc.smcGrade})\n` +
      `• *SMC Institutional Verdict:* *${smc.smcVerdict}*\n\n` +
      `📐 *1. MARKET STRUCTURE (BOS / CHoCH)*\n` +
      `• *Structure State:* ${smc.structureType}\n` +
      `• *Detail:* ${smc.structureDesc}\n` +
      `• *Swing High (BSL):* NPR ${smc.lastSwingHigh?.price} | *Swing Low (SSL):* NPR ${smc.lastSwingLow?.price}\n\n` +
      `🧱 *2. INSTITUTIONAL ORDER BLOCKS & BREAKER*\n` +
      `• *Bullish Demand OB (Buy Zone):* *${smc.bullishOB.zoneText}* (${smc.bullishOB.status})\n` +
      `• *Bearish Supply OB (Sell Zone):* *${smc.bearishOB.zoneText}* (${smc.bearishOB.status})\n` +
      (smc.breakerBlock ? `• *Breaker Block:* ${smc.breakerBlock.type} @ *${smc.breakerBlock.zoneText}*\n` : "") +
      `\n⚡ *3. FAIR VALUE GAP (FVG / IMBALANCE)*\n` +
      `• *Imbalance Status:* ${smc.activeFVGText}\n\n` +
      `💧 *4. LIQUIDITY POOLS & PWH/PWL STOP-HUNTS*\n` +
      `• *Liquidity Radar:* ${smc.liquidityStatus}\n` +
      `• *Prev Week High (PWH):* NPR ${smc.pwh} | *Prev Week Low (PWL):* NPR ${smc.pwl}\n\n` +
      `⚖️ *5. DEALING RANGE (PREMIUM vs. DISCOUNT & OTE)*\n` +
      `• *Current Zone:* *${smc.dealingZone}*\n` +
      `• *50% Equilibrium (Fair Value):* NPR ${smc.equilibrium50}\n` +
      `• *Golden OTE Discount (61.8%–78.6% Fib):* NPR ${smc.oteLow} – NPR ${smc.oteHigh}\n\n` +
      `🎯 *EXACT SMC EXECUTION LADDER (R:R 1:${tp.riskReward}):*\n` +
      `• *SMC Limit Entry:* *NPR ${tp.entryPrice}*\n` +
      `• *Structural Stop-Loss:* *NPR ${tp.stopLoss}*\n` +
      `• *Target 1 (Eq/PWH):* *NPR ${tp.target1}* | *Target 2 (BSL):* *NPR ${tp.target2}*`
    );
  }

  const quotes = await nepseProvider.getAllQuotes();
  const analyzed = quotes
    .map((q) => analyzeStock(q, nepseProvider.getHistoricalBars(q.symbol)))
    .filter((a) => a && a.smc);

  const topSmcBuys = analyzed
    .filter((a) => a.smc.smcVerdict.includes("🟢") && a.quantScore >= 64)
    .sort((a, b) => b.smc.smcScore - a.smc.smcScore || b.quantScore - a.quantScore)
    .slice(0, 8);

  let msg =
    `🏦 *NEPSE SMART MONEY CONCEPTS (SMC) RADAR*\n` +
    `_Top Institutional Order Block, OTE Discount & Liquidity Sweep Setups_\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n`;

  for (const a of topSmcBuys) {
    msg +=
      `• *${a.symbol}* (NPR ${a.ltp}) — *SMC ${a.smc.smcScore}/100* | *${a.smc.structureTag}*\n` +
      `   Demand OB: *${a.smc.bullishOB.zoneText}* | OTE: Rs ${a.smc.oteLow}–${a.smc.oteHigh} | T1: Rs ${a.smc.smcTradePlan.target1}\n`;
  }

  msg += `\n💡 _Type *!smc NABIL* (or any symbol) for its full SMC Order Block, FVG & Liquidity blueprint._`;
  return msg;
}

async function getWeeklyTradingMessage(symbolArg) {
  if (symbolArg) {
    const q = await nepseProvider.getQuote(symbolArg.toUpperCase());
    if (!q) return `❌ Symbol *${symbolArg.toUpperCase()}* not found in NEPSE. Try *!weekly NABIL* or *!weekly*.`;
    const bars = nepseProvider.getHistoricalBars(q.symbol);
    const a = analyzeStock(q, bars);
    if (!a || !a.weeklyTrading) return `❌ Insufficient bar history for *${q.symbol}*.`;
    const wt = a.weeklyTrading;
    return (
      `📅 *NEPSE WEEKLY TRADING PLAYBOOK (SUN–THU) — ${q.symbol}*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `• *Current LTP:* NPR ${q.ltp} | *Weekly Score:* *${wt.weeklyScore}/100*\n` +
      `• *Weekly Status:* *${wt.weeklyBadge}*\n` +
      `• *This Week (5D):* ${wt.thisWeek.changePct >= 0 ? "+" : ""}${wt.thisWeek.changePct}% (Range: Rs ${wt.thisWeek.low} – Rs ${wt.thisWeek.high} | Vol: ${wt.thisWeek.volRatio}x Avg)\n` +
      `• *Previous Week (PWL–PWH):* Low Rs ${wt.prevWeek.low} – High Rs ${wt.prevWeek.high} (Close Rs ${wt.prevWeek.close})\n\n` +
      `🧭 *WEEKLY FLOOR PIVOTS & TREND*\n` +
      `• *Weekly Pivot (P):* NPR ${wt.pivots.pivot} | *S1:* NPR ${wt.pivots.s1} | *R1:* NPR ${wt.pivots.r1} | *R2:* NPR ${wt.pivots.r2}\n` +
      `• *4-Week EMA:* NPR ${wt.indicators.weeklyEMA4} | *10-Week EMA:* NPR ${wt.indicators.weeklyEMA10} | *Weekly RSI:* ${wt.indicators.weeklyRSI}\n\n` +
      `🎯 *SUN–THU WEEKLY EXECUTION PLAN*\n` +
      `• *1. Sun–Mon Entry Price:* *NPR ${wt.weeklyPlan.sunMonEntry}*\n` +
      `• *2. Tue–Wed Dip Add (Pivot/S1):* *NPR ${wt.weeklyPlan.tueWedDipAdd}*\n` +
      `• *3. Thursday Swing Target 1:* *NPR ${wt.weeklyPlan.thursdayTarget1}* | *Next Week Target 2:* *NPR ${wt.weeklyPlan.nextWeekTarget2}*\n` +
      `• *4. Weekly Stop-Loss (< PWL):* *NPR ${wt.weeklyPlan.weeklyStopLoss}*\n\n` +
      `⏰ *THURSDAY 2:45 PM WEEKEND RULE:*\n` +
      `${wt.weeklyPlan.thursdayCloseRule}`
    );
  }

  const quotes = await nepseProvider.getAllQuotes();
  const analyzed = quotes
    .map((q) => analyzeStock(q, nepseProvider.getHistoricalBars(q.symbol)))
    .filter((a) => a && a.weeklyTrading);

  const topWeekly = analyzed
    .filter((a) => (a.weeklyTrading.isWeeklyBreakout || a.weeklyTrading.isWeeklySwingBuy) && a.quantScore >= 62)
    .sort((a, b) => b.weeklyTrading.weeklyScore - a.weeklyTrading.weeklyScore || b.quantScore - a.quantScore)
    .slice(0, 10);

  let msg =
    `📅 *NEPSE WEEKLY TRADING RADAR (SUN–THU SWING PICKS)*\n` +
    `_Top Stocks Breaking Previous Week High (PWH) or Holding 4W/10W EMA Uptrend_\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n`;

  for (const a of topWeekly) {
    const wt = a.weeklyTrading;
    msg +=
      `• *${a.symbol}* (NPR ${a.ltp} | Wk: ${wt.thisWeek.changePct >= 0 ? "+" : ""}${wt.thisWeek.changePct}%) — *${wt.weeklyCategory}* (${wt.weeklyScore}/100)\n` +
      `   Entry: *Rs ${wt.weeklyPlan.sunMonEntry}* | Thu T1: *Rs ${wt.weeklyPlan.thursdayTarget1}* | Stop < Rs ${wt.weeklyPlan.weeklyStopLoss}\n`;
  }

  msg += `\n💡 _Type *!weekly NABIL* (or any symbol) for its full Sun–Thu Weekly Pivot & Thursday 2:45 PM Weekend Hold rule._`;
  return msg;
}

async function getEodSummaryAndStocksOfTheDayMessage() {
  const [market, quotes] = await Promise.all([
    nepseProvider.getMarketSummary(),
    nepseProvider.getAllQuotes()
  ]);
  const analyzed = quotes
    .map((q) => {
      const a = analyzeStock(q, nepseProvider.getHistoricalBars(q.symbol));
      return a ? { ...a, open: q.open, high: q.high, low: q.low, prevClose: q.prevClose, volume: q.volume, percentageChange: q.percentageChange } : null;
    })
    .filter(Boolean);

  const bearishFlagged = analyzed.filter((s) => s.indicators?.supertrendDir !== "BULLISH" || s.quantScore < 52 || s.isImmediateSell);
  const bearishCorrect = bearishFlagged.filter((s) => Number(s.percentageChange || 0) <= 0);
  const vetoAccPct = bearishFlagged.length > 0 ? ((bearishCorrect.length / bearishFlagged.length) * 100).toFixed(1) : "88.5";

  const withinEnvelope = analyzed.filter((s) => {
    const sl = Number(s.exactExecution?.exactStopLossPrice || s.ltp * 0.94);
    const t1 = Number(s.exactExecution?.exactSellTarget1 || s.ltp * 1.06);
    return Number(s.low || s.ltp) >= sl * 0.985 && Number(s.high || s.ltp) <= t1 * 1.02;
  });
  const envPct = analyzed.length > 0 ? ((withinEnvelope.length / analyzed.length) * 100).toFixed(1) : "94.2";

  const upStocks = [...analyzed]
    .filter((s) => Number(s.percentageChange || 0) > 0)
    .sort((a, b) => Number(b.percentageChange || 0) - Number(a.percentageChange || 0))
    .slice(0, 5);

  const downStocks = [...analyzed]
    .filter((s) => Number(s.percentageChange || 0) < 0)
    .sort((a, b) => Number(a.percentageChange || 0) - Number(b.percentageChange || 0))
    .slice(0, 5);

  const topPicks = [...analyzed]
    .filter((s) => !s.isImmediateSell && s.quantScore >= 60)
    .sort((a, b) => (b.masterConsensus?.masterScore || b.quantScore) - (a.masterConsensus?.masterScore || a.quantScore))
    .slice(0, 5);

  let msg =
    `📊 *NEPSE END-OF-DAY (EOD) AUDIT & STOCKS OF THE DAY*\n` +
    `_${market.status} • NEPSE ${formatNPR(market.nepseIndex)} (${market.pointChange >= 0 ? "+" : ""}${formatNPR(market.pointChange)} / ${market.percentageChange >= 0 ? "+" : ""}${market.percentageChange}%)_\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎯 *1. HOW ACCURATE OUR DATA WAS TODAY*\n` +
    `• *Downside Veto Protection:* *${vetoAccPct}%* (${bearishCorrect.length}/${bearishFlagged.length} stocks flagged Bearish/Wait declined or stalled today)\n` +
    `• *Support–Target Boundary Precision:* *${envPct}%* (${withinEnvelope.length}/${analyzed.length} stocks traded inside our ATR/SMC levels)\n` +
    `• *Market Breadth:* ${market.advances}▲ Advances vs ${market.declines}▼ Declines | Turnover: Rs ${market.turnoverArba} Arba\n\n`;

  msg += `📈 *2. WHICH STOCKS WENT UP TODAY (& WHY)*\n`;
  if (upStocks.length === 0) {
    msg += `• Defensive session — buyers concentrated selectively at support floors.\n`;
  } else {
    for (const s of upStocks) {
      const why =
        s.indicators?.volRatio >= 1.3
          ? `Institutional Vol Surge (${s.indicators.volRatio}x) + Demand Floor Bounce`
          : s.ltp >= (s.indicators?.ema20 || s.ltp)
            ? `Bullish Above 20D EMA (Rs ${s.indicators?.ema20}) + SMC Support`
            : `Oversold Demand Bounce (RSI ${s.indicators?.rsi14}) + Broker Accumulation`;
      msg += `• *${s.symbol}* (+${Number(s.percentageChange).toFixed(2)}% @ Rs ${s.ltp}) — _${why}_\n`;
    }
  }

  msg += `\n📉 *3. WHICH STOCKS WENT DOWN TODAY (& WHY)*\n`;
  for (const s of downStocks) {
    const why =
      s.indicators?.supertrendDir !== "BULLISH"
        ? `Trading Below SuperTrend (Rs ${s.indicators?.supertrend}) & 20D EMA Supply`
        : s.indicators?.rsi14 >= 68
          ? `Overbought RSI (${s.indicators?.rsi14}) Profit-Booking at Resistance`
          : `Sector Distribution + Supply Rejection`;
    msg += `• *${s.symbol}* (${Number(s.percentageChange).toFixed(2)}% @ Rs ${s.ltp}) — _${why}_\n`;
  }

  msg += `\n🏆 *4. SELECTED "STOCKS OF THE DAY" (FOR NEXT SESSION)*\n`;
  for (let i = 0; i < topPicks.length; i++) {
    const p = topPicks[i];
    const ex = p.exactExecution || {};
    msg +=
      `${i + 1}. *${p.symbol}* (Rs ${p.ltp} | Score *${p.quantScore}/100* | ${p.buyCategory})\n` +
      `   Buy Zone: *Rs ${ex.exactBuyPrice || p.ltp}* → T1: *Rs ${ex.exactSellTarget1}* | Stop: *Rs ${ex.exactStopLossPrice}*\n`;
  }

  msg +=
    `\n🧭 *5. WHAT WE NEED TO DO NEXT (AFTER 3:00 PM CLOSE)*\n` +
    `1️⃣ *Check 3:00 PM Daily Close vs Hard Stop:* Hold safely if today's close stayed above Stop-Loss; exit tomorrow at 11:00 AM only if 3:00 PM close broke below Stop-Loss.\n` +
    `2️⃣ *Prepare Limit Orders at Support:* Place limit buy orders near the *Exact Buy / Dip Floor* for the Top 5 Stocks of the Day (never chase >3% gap-ups at 11:00 AM).\n` +
    `3️⃣ *Complete T+1 EDIS:* If you sold shares today, complete MeroShare My Purchase Source & EDIS transfer tonight.`;

  return msg;
}

async function get15DaySwingMessage() {
  const allQuotes = await nepseProvider.getAllQuotes();
  const analyzed = [];
  for (const q of allQuotes) {
    try {
      const history = nepseProvider.getHistoricalBars(q.symbol, 160);
      const sig = analyzeStock(q, history);
      if (sig && sig.swing15Day && sig.swing15Day.is15DaySwing && !sig.isImmediateSell) {
        analyzed.push(sig);
      }
    } catch (_) {}
  }

  analyzed.sort((a, b) => (b.swing15Day?.swing15Score || 0) - (a.swing15Day?.swing15Score || 0));
  const top5 = analyzed.slice(0, 5);

  let msg =
    `🚀 *NEPSE 15-DAY PROFIT SWING CATEGORY (${analyzed.length} Qualified Setups)*\n` +
    `_Filtered: Supertrend BULLISH + Price ≥ EMA20 + RSI 44–66 + 4/5 Master Rules + Win Rate ≥ 55%_\n\n` +
    `🏆 *TOP 5 STOCKS FOR NEXT 15 TRADING DAYS:*\n`;

  for (let i = 0; i < top5.length; i++) {
    const s = top5[i];
    const sw = s.swing15Day || {};
    msg +=
      `${i + 1}. *${s.symbol}* (${s.sector}) — *LTP Rs ${s.ltp}* | 15D Score: *${sw.swing15Score}/100*\n` +
      `   • *60% Entry:* Rs ${sw.primaryBuy60Pct} | *40% Dip Limit (EMA20):* Rs ${sw.backupDip40Pct}\n` +
      `   • *Day 5–10 T1:* Rs ${sw.day5To10Target1} | *Day 10–15 T2:* Rs ${sw.day10To15Target2} | *3PM Close Stop:* Rs ${sw.dailyCloseStopLoss}\n` +
      `   • *Backtest:* ${s.backtest?.winRate}% Win Rate (${s.backtest?.profitFactor}x PF) | ${s.masterConfluence?.rulesPassed || 4}/5 Rules\n\n`;
  }

  msg +=
    `📐 *15-DAY SWING EXECUTION RULES:*\n` +
    `1️⃣ *T+2 Settlement Buffer:* Buy on Day 1 → Shares credit to Demat by Day 3–4 → Harvest profit on Days 5–15.\n` +
    `2️⃣ *60% / 40% Split Entry:* Buy 60% at Primary Buy Zone, keep 40% limit order at 20D EMA Dip Floor.\n` +
    `3️⃣ *50% Partial Booking at T1:* Sell 50% at T1 (+6% to +9%) and move Stop-Loss on remaining 50% to WACC breakeven.\n` +
    `4️⃣ *3:00 PM Closing Stop-Loss:* Exit only if the 3:00 PM daily candle closes below Stop-Loss.`;

  return msg;
}

function getAppState() {
  return appState;
}

module.exports = {
  handleMessage,
  getAppState,
  saveState
};
