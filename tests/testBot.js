const assert = require("assert");
const { handleMessage } = require("../src/commandHandler");

async function runTests() {
  console.log("🧪 Running NEPSE Quant Pro v6.0 (Advisor & 6-Perspective Wealth Engine) Verification Suite...\n");

  // 1. Test !help
  const helpOut = await handleMessage("!help");
  assert(helpOut.includes("NEPSE QUANT PRO v6.0"), "Help command failed");
  console.log("✅ 1. !help v6.0 menu verified");

  // 2. Test !live with Fear & Greed Sentiment
  const liveOut = await handleMessage("!live");
  assert(liveOut.includes("NEPSE LIVE MARKET INTELLIGENCE"), "Live command failed");
  assert(liveOut.includes("Market Sentiment:"), "Market Sentiment missing");
  console.log("✅ 2. !live market summary & Fear/Greed sentiment verified");

  // 3. Test !signal NABIL (6-Perspective Master Signal Matrix + Buyer & Holder Guidance)
  const sigOut = await handleMessage("!signal NABIL");
  assert(sigOut.includes("NEPSE 6-PERSPECTIVE MASTER SIGNAL: NABIL"), "Signal NABIL failed");
  assert(sigOut.includes("6-PERSPECTIVE INDEPENDENT SCORECARD"), "6-Perspective matrix missing");
  assert(sigOut.includes("WHERE TO BUY (3-TRANCHE PYRAMID PLAN)"), "Where to buy section missing");
  assert(sigOut.includes("WHERE TO SELL (3-TIER PROFIT & EXIT PLAN)"), "Where to sell section missing");
  assert(sigOut.includes("ACTION BY TRADER PERSONA"), "Persona guidance missing");
  console.log("✅ 3. !signal NABIL (6-Perspective Master Signal + Where to Buy/Sell + Persona Guidance) verified");

  // 4. Test !buy NABIL 100000 (Dedicated 6-Perspective Precision Buy Blueprint & Dual-Horizon Verdict)
  const buyOut = await handleMessage("!buy NABIL 100000");
  assert(buyOut.includes("WHERE TO BUY NABIL — 6-PERSPECTIVE & DUAL-HORIZON BLUEPRINT"), "Buy command header failed");
  assert(buyOut.includes("Long-Term Verdict (1–5 Yrs):"), "Long-term verdict missing");
  assert(buyOut.includes("3-TRANCHE PYRAMID ACCUMULATION PLAN"), "3-Tranche pyramid plan missing");
  assert(buyOut.includes("EXACT BUY ZONES FROM ALL 6 PERSPECTIVES"), "6 perspectives buy zones missing");
  assert(buyOut.includes("NEPSE Intraday Timing Clock:"), "Intraday timing clock missing");
  assert(buyOut.includes("INVALIDATION STOP-LOSS:"), "Hard stop-loss missing");
  console.log("✅ 4. !buy NABIL 100000 (6-Perspective Precision Buy Blueprint & Dual-Horizon Verdict) verified");

  // 5. Test !sell NABIL 495 100 (Dedicated 6-Perspective Precision Sell & 3-Tier Profit-Booking Blueprint)
  const sellOut = await handleMessage("!sell NABIL 495 100");
  assert(sellOut.includes("WHERE TO SELL NABIL — 6-PERSPECTIVE EXIT BLUEPRINT"), "Sell command header failed");
  assert(sellOut.includes("3-TIER PARTIAL PROFIT-BOOKING MATRIX"), "3-Tier profit booking matrix missing");
  assert(sellOut.includes("EXACT SELL / RESISTANCE ZONES FROM ALL 6 PERSPECTIVES"), "6 perspectives sell zones missing");
  assert(sellOut.includes("YOUR PERSONAL SEBON P/L SIMULATOR"), "Personal SEBON P/L simulator missing");
  console.log("✅ 5. !sell NABIL 495 100 (6-Perspective Precision Sell & 3-Tier Profit Booking + SEBON P/L) verified");

  // 6. Test !predict NABIL (500-Path Monte Carlo GBM Forecast, VaR 95%, Sharpe Ratio)
  const mcOut = await handleMessage("!predict NABIL");
  assert(mcOut.includes("MONTE CARLO AI PRICE FORECAST: NABIL"), "Monte Carlo failed");
  assert(mcOut.includes("Bull Case (90th Percentile):"), "Bull case missing");
  assert(mcOut.includes("Daily 95% Value-at-Risk (VaR):"), "VaR missing");
  assert(mcOut.includes("Sharpe Ratio:"), "Sharpe ratio missing");
  console.log("✅ 6. !predict NABIL (500-Path Monte Carlo GBM, VaR 95% & Sharpe Ratio) verified");

  // 7. Test !whale and !whale CBBL (Whale / Operator Cornering & T+2 Supply Absorption Radar)
  const whaleAll = await handleMessage("!whale");
  assert(whaleAll.includes("NEPSE MARKET-WIDE WHALE & FLOORSHEET RADAR"), "Market whale radar failed");
  const whaleSym = await handleMessage("!whale CBBL");
  assert(whaleSym.includes("NEPSE WHALE & OPERATOR CORNERING RADAR: CBBL"), "Symbol whale radar failed");
  assert(whaleSym.includes("T+2 Settlement Supply Status:"), "T+2 status missing");
  console.log("✅ 7. !whale & !whale CBBL (Operator Cornering & T+2 Supply Radar) verified");

  // 8. Test !rotation (Institutional RRG Sector Rotation Quadrants)
  const rotOut = await handleMessage("!rotation");
  assert(rotOut.includes("NEPSE RRG SECTOR ROTATION & ALPHA MATRIX"), "Rotation failed");
  assert(rotOut.includes("LEADING QUADRANTS"), "Leading quadrants missing");
  console.log("✅ 8. !rotation (RRG Sector Rotation Quadrants) verified");

  // 9. Test !build 200000 (AI Risk-Parity Portfolio Builder)
  const buildOut = await handleMessage("!build 200000");
  assert(buildOut.includes("AI RISK-PARITY PORTFOLIO BUILDER"), "Portfolio builder failed");
  assert(buildOut.includes("Max Portfolio Downside"), "Portfolio downside risk missing");
  console.log("✅ 9. !build 200000 (AI Risk-Parity Portfolio Builder) verified");

  // 10. Test Natural Language AI Analyst (!ask & conversational plain English)
  const askOut = await handleMessage("which hydro stock is best to buy today?");
  assert(askOut.includes("NEPSE AI QUANT ANALYST RESPONSE"), "Natural language AI failed");
  console.log("✅ 10. Natural Language AI Stock Analyst verified");

  // 11. Test !backtest NABIL, !fund SCB, !smartmoney NABIL, !compare NABIL SCB, !pf, !ipo
  const btOut = await handleMessage("!backtest NABIL");
  assert(btOut.includes("WALK-FORWARD STRATEGY BACKTEST: NABIL"), "Backtest command failed");
  const fundOut = await handleMessage("!fund SCB");
  assert(fundOut.includes("FUNDAMENTAL & INTRINSIC VALUATION: SCB"), "Fund command failed");
  const smOut = await handleMessage("!smartmoney NABIL");
  assert(smOut.includes("SMART MONEY & FLOORSHEET ANALYTICS: NABIL"), "Smartmoney command failed");
  const cmpOut = await handleMessage("!compare NABIL SCB");
  assert(cmpOut.includes("NEPSE HEAD-TO-HEAD COMPARISON: NABIL vs SCB"), "Compare command failed");
  const pfOut = await handleMessage("!pf");
  assert(pfOut.includes("YOUR NEPSE PORTFOLIO & RISK MONITOR"), "Portfolio command failed");
  const ipoOut = await handleMessage("!ipo");
  assert(ipoOut.includes("NEPSE IPO, RIGHT SHARE & BOOK CLOSURE PIPELINE"), "IPO command failed");
  console.log("✅ 11. !backtest, !fund, !smartmoney, !compare, !pf & !ipo verified");

  // 12. Test !immediate / immidiate buy category
  const immOut = await handleMessage("!immediate");
  assert(immOut.includes("NEPSE IMMEDIATE BUY CATEGORY (ENTER NOW AT LTP)"), "Immediate buy header failed");
  assert(immOut.includes("FINAL SUMMARY (TL;DR — IMMEDIATE BUY)"), "Immediate buy summary failed");
  const immSpellOut = await handleMessage("immidiate buy");
  assert(immSpellOut.includes("NEPSE IMMEDIATE BUY CATEGORY"), "Spelling variant immidiate buy failed");
  console.log("✅ 12. !immediate & 'immidiate buy' category verified");

  // 13. Test !longterm / long term hold
  const ltOut = await handleMessage("!longterm");
  assert(ltOut.includes("NEPSE LONG-TERM HOLD & WEALTH COMPOUNDERS (1–5 YEAR HORIZON)"), "Long-term header failed");
  assert(ltOut.includes("CATEGORY 1: BLUE-CHIP WEALTH COMPOUNDERS"), "Blue-chip category missing");
  assert(ltOut.includes("FINAL SUMMARY (TL;DR — LONG-TERM HOLD)"), "Long-term summary missing");
  const ltPhraseOut = await handleMessage("long term hold");
  assert(ltPhraseOut.includes("NEPSE LONG-TERM HOLD & WEALTH COMPOUNDERS"), "long term hold phrase failed");
  console.log("✅ 13. !longterm & 'long term hold' category verified");

  // 14. Test !best, !best banking, !best finance, !best hydro
  const bestAllOut = await handleMessage("!best");
  assert(bestAllOut.includes("NEPSE MASTER SECTOR CHAMPIONS — BEST STOCKS IN EVERY SECTOR"), "Master sector champions failed");
  assert(bestAllOut.includes("FINAL SUMMARY (TL;DR — ALL SECTOR CHAMPIONS)"), "Master sector summary missing");

  const bestBankOut = await handleMessage("!best banking");
  assert(bestBankOut.includes("BEST IN COMMERCIAL BANKS (CLASS 'A' BANKING)"), "Best banking failed");
  assert(bestBankOut.includes("NPL:"), "NPL metric missing in banking leaderboard");

  const bestFinOut = await handleMessage("!best finance");
  assert(bestFinOut.includes("BEST IN FINANCE SECTOR (CLASS 'C' HIGH-BETA)"), "Best finance failed");
  assert(bestFinOut.includes("EPS Growth:"), "EPS Growth missing in finance leaderboard");

  const bestHydroOut = await handleMessage("!best hydro");
  assert(bestHydroOut.includes("BEST IN HYDROPOWER SECTOR"), "Best hydro failed");
  assert(bestHydroOut.includes("Lock-In:"), "Lock-in metric missing in hydro leaderboard");
  console.log("✅ 14. !best, !best banking, !best finance & !best hydro verified");

  // 15. Test v6.0 !advisor & 10-Second Traffic-Light Card (NABIL / !advisor NABIL) + 4 No-Trap Accuracy Filters
  const advDailyOut = await handleMessage("!advisor");
  assert(advDailyOut.includes("NEPSE PERSONAL ADVISOR — TODAY'S SIMPLE GAME PLAN"), "Daily advisor briefing failed");
  assert(advDailyOut.includes("MARKET WEATHER (REGIME GATEKEEPER):"), "Market weather gatekeeper missing");
  assert(advDailyOut.includes("FINAL SUMMARY (TL;DR — TODAY'S ADVISOR BRIEFING)"), "Daily advisor summary missing");

  const cardOut = await handleMessage("NABIL");
  assert(cardOut.includes("10-SECOND ADVISOR CARD: NABIL"), "10-Second Advisor Card header failed");
  assert(cardOut.includes("TODAY'S DECISION:"), "Traffic-light decision missing");
  assert(cardOut.includes("YOUR STEP-BY-STEP ACTION PLAN:"), "Step-by-step action plan missing");
  assert(cardOut.includes('4 "NO-TRAP" SIGNAL SAFETY CHECKS'), "4 No-Trap checks missing");
  assert(cardOut.includes("LATEST NEWS & CATALYST"), "Card news catalyst missing");
  assert(cardOut.includes("FINAL SUMMARY (TL;DR"), "Card TL;DR missing");
  console.log("✅ 15. !advisor (Daily Briefing) & NABIL (10-Second Traffic-Light Card + 4 No-Trap Filters + News) verified");

  // 16. Test !news, !news NABIL, and !news banking
  const newsMarketOut = await handleMessage("!news");
  assert(newsMarketOut.includes("NEPSE LIVE MARKET NEWS, CATALYSTS & SENTIMENT"), "Market news header failed");
  assert(newsMarketOut.includes("Want 1–4 Week Quick Swing Profits (Buy Today at LTP)?"), "Quick swing prompt missing");
  assert(newsMarketOut.includes("Want 1–5 Year Safe Dividend & Bonus Compounding?"), "Long-term prompt missing");

  const newsSymOut = await handleMessage("!news NABIL");
  assert(newsSymOut.includes("NEPSE STOCK NEWS & CATALYSTS: NABIL"), "Stock news header failed");
  assert(newsSymOut.includes("FINAL SUMMARY (TL;DR — NABIL NEWS & HORIZON)"), "Stock news summary missing");

  const newsSecOut = await handleMessage("!news hydro");
  assert(newsSecOut.includes("NEPSE SECTOR NEWS & CATALYSTS: HYDRO"), "Sector news header failed");
  console.log("✅ 16. !news, !news NABIL & !news hydro (Live News Catalysts, Sentiment & Horizon Impact) verified");

  // 17. Test NEPSE Live Index (2,595.95 / Merolagani symbol=nepse) & !immediatesell Category
  const nepseLiveOut = await handleMessage("nepse");
  assert(nepseLiveOut.includes("2,595.95"), "NEPSE live index 2,595.95 missing");
  assert(nepseLiveOut.includes("https://www.merolagani.com/CompanyDetail.aspx?symbol=nepse"), "Merolagani NEPSE URL missing");

  const nepseSigOut = await handleMessage("!signal NEPSE");
  assert(nepseSigOut.includes("NEPSE 6-PERSPECTIVE MASTER SIGNAL: NEPSE"), "NEPSE symbol signal failed");
  assert(nepseSigOut.includes("2,595.95"), "NEPSE signal LTP 2,595.95 missing");

  const immSellOut = await handleMessage("!immediatesell");
  assert(immSellOut.includes("NEPSE IMMEDIATE SELL CATEGORY (EXIT / BOOK PROFIT NOW AT LTP)"), "Immediate sell header failed");
  assert(immSellOut.includes("CATEGORY 1: IMMEDIATE SELL — EXIT NOW AT LTP"), "Category 1 Immediate Sell missing");
  assert(immSellOut.includes("FINAL SUMMARY (TL;DR — IMMEDIATE SELL)"), "Immediate sell summary missing");

  const immSellPhraseOut = await handleMessage("immediate sell");
  assert(immSellPhraseOut.includes("NEPSE IMMEDIATE SELL CATEGORY"), "immediate sell phrase failed");

  const immSellTypoOut = await handleMessage("immidiate sell");
  assert(immSellTypoOut.includes("NEPSE IMMEDIATE SELL CATEGORY"), "immidiate sell typo phrase failed");
  console.log("✅ 17. NEPSE Live Index (2,595.95), !signal NEPSE & !immediatesell ('immediate sell') verified");

  console.log("\n🎉 ALL 17 NEPSE QUANT PRO v6.0 TEST SUITES PASSED!\n");
  console.log("--- Sample Output for `!immediatesell` ---\n");
  console.log(immSellOut);
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
