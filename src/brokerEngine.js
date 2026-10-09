const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const REAL_MARKET_CACHE_FILE = path.join(DATA_DIR, "real_market_cache.json");

// Official NEPSE Broker Directory (Broker Number -> Brokerage House Name)
const NEPSE_BROKER_NAMES = {
  1: "Kumari Securities Pvt. Ltd.",
  3: "Arun Securities Pvt. Ltd.",
  4: "Opal Securities Investment Pvt. Ltd.",
  6: "Agrawal Securities Pvt. Ltd.",
  7: "JBNL Securities Ltd.",
  8: "Ashutosh Brokerage & Securities",
  10: "Pragyan Securities Pvt. Ltd.",
  11: "Malla & Malla Stock Broking Co.",
  13: "Thrive Brokerage House Pvt. Ltd.",
  14: "Premier Securities Co. Ltd.",
  16: "Primo Securities Pvt. Ltd.",
  17: "ABC Securities Pvt. Ltd.",
  18: "Sagarmatha Securities Pvt. Ltd.",
  19: "Nepal Investment Securities",
  20: "Sipla Securities Pvt. Ltd.",
  21: "Midas Stock Broking Co. Pvt. Ltd.",
  22: "Linch Stock Market Ltd.",
  25: "Sweta Securities Pvt. Ltd.",
  26: "Asian Securities Pvt. Ltd.",
  28: "Shree Krishna Securities Ltd.",
  29: "Trisakti Securities Public Ltd.",
  32: "Premier Securities Co. Ltd.",
  33: "Dakshinkali Securities & Investment",
  34: "Vision Securities Pvt. Ltd.",
  35: "Kohinoor Investment & Securities",
  36: "Secured Securities Ltd.",
  37: "Swarnalaxmi Securities Pvt. Ltd.",
  38: "Dipshikha Dhitopatra Karobar Co.",
  39: "Sumeru Securities Pvt. Ltd.",
  40: "Creative Securities Pvt. Ltd.",
  41: "Linch Stock Market Ltd.",
  42: "Sani Securities Co. Ltd.",
  43: "South Asian Bulls Pvt. Ltd.",
  44: "Dynamic Technosoft / Money Market",
  45: "Imperial Securities Co. Pvt. Ltd.",
  46: "Kalika Securities Pvt. Ltd.",
  47: "Nivaran Securities Pvt. Ltd.",
  48: "Trishul Securities & Investment",
  49: "Online Securities Ltd.",
  50: "Crystal Kanchenjunga Securities",
  51: "Oxford Securities Pvt. Ltd.",
  52: "Sundhara Securities Ltd.",
  53: "Investment Management Nepal",
  54: "Sewa Securities Pvt. Ltd.",
  55: "Bhrikuti Stock Broking Co.",
  56: "Sri Hari Securities Pvt. Ltd.",
  57: "Aryatara Investment & Securities",
  58: "Naasa Securities Co. Ltd.",
  59: "Dhitopatra Karobar Pvt. Ltd.",
  60: "Borongan Securities Pvt. Ltd.",
  61: "Bhole Ganesh Securities Ltd.",
  62: "Capital Max Securities Ltd.",
  63: "Himali Brokerage Co. Ltd.",
  64: "Sanima Securities Ltd.",
  65: "Sun Securities Pvt. Ltd.",
  66: "Sharepro Securities Pvt. Ltd.",
  67: "Miyabi Securities Ltd.",
  68: "Property Wizard Ltd.",
  69: "Elite Capital Ltd.",
  70: "Index Capital Ltd.",
  71: "Infinity Securities Ltd.",
  72: "Machhapuchchhre Securities Ltd.",
  73: "Nabil Stock Dealer / Brokerage",
  74: "CBIL Securities Ltd.",
  75: "KBL Securities Ltd.",
  76: "NIC Asia Securities Ltd.",
  77: "Sanima Securities Ltd.",
  78: "Himalayan Brokerage Co. Ltd.",
  79: "Sunrise Securities Ltd.",
  80: "Prabhu Stock Market Ltd.",
  81: "Citizen Stock Dealer Ltd.",
  82: "Global IME Securities Ltd.",
  83: "NMB Securities Ltd.",
  84: "Siddhartha Capital / Brokerage",
  85: "Nepal SBI Stock Dealer Ltd.",
  86: "Apex Securities Ltd.",
  87: "Blue Chip Securities Ltd.",
  88: "Garima Securities Ltd.",
  89: "Muktinath Securities Ltd.",
  90: "Mega Stock Broking Ltd."
};

let cachedBrokerSummary = null;
let lastBuildTimestamp = 0;

function formatCurrencyCrore(amount) {
  if (!amount || isNaN(amount)) return "Rs 0.00";
  const cr = amount / 10000000;
  if (cr >= 1) return `Rs ${cr.toFixed(2)} Cr`;
  const lakh = amount / 100000;
  return `Rs ${lakh.toFixed(2)} Lakh`;
}

function buildBrokerSummary(quotesMap = new Map()) {
  const now = Date.now();
  if (cachedBrokerSummary && now - lastBuildTimestamp < 15000) {
    return cachedBrokerSummary;
  }

  let realCache = {};
  try {
    if (fs.existsSync(REAL_MARKET_CACHE_FILE)) {
      realCache = JSON.parse(fs.readFileSync(REAL_MARKET_CACHE_FILE, "utf8"));
    }
  } catch (_) {}

  // Load official company names from live quotes cache
  const companyNameLookup = {};
  try {
    const quotesCachePath = path.join(__dirname, "../data/live_quotes_cache.json");
    if (fs.existsSync(quotesCachePath)) {
      const qc = JSON.parse(fs.readFileSync(quotesCachePath, "utf8"));
      if (Array.isArray(qc?.quotes)) {
        qc.quotes.forEach((q) => {
          if (q.symbol && q.companyName) companyNameLookup[q.symbol] = q.companyName;
        });
      }
    }
  } catch (_) {}

  const stocks = realCache.stocks || {};
  const brokerLedger = new Map(); // brokerNum -> brokerObj
  const stockAccumulation = new Map(); // symbol -> { symbol, companyName, buyAmt, buyKitta, sellAmt, sellKitta, netAmt, netKitta, topBuyers: Map, topSellers: Map }

  function getBrokerRecord(bNum) {
    const num = Number(bNum) || bNum;
    if (!brokerLedger.has(num)) {
      const bName = NEPSE_BROKER_NAMES[num] || `Broker #${num}`;
      brokerLedger.set(num, {
        broker: num,
        name: bName,
        totalBuyAmount: 0,
        totalSellAmount: 0,
        totalBuyKitta: 0,
        totalSellKitta: 0,
        netCashFlow: 0,
        totalTurnover: 0,
        boughtStocksMap: new Map(),
        soldStocksMap: new Map()
      });
    }
    return brokerLedger.get(num);
  }

  function getStockRecord(sym, ltp = 100, companyName = "", sector = "") {
    if (!stockAccumulation.has(sym)) {
      const cName = companyName || companyNameLookup[sym] || sym;
      stockAccumulation.set(sym, {
        symbol: sym,
        companyName: cName,
        sector: sector || "NEPSE",
        ltp,
        buyAmount: 0,
        sellAmount: 0,
        buyKitta: 0,
        sellKitta: 0,
        netAmount: 0,
        netKitta: 0,
        buyersMap: new Map(),
        sellersMap: new Map()
      });
    }
    return stockAccumulation.get(sym);
  }

  // Iterate over all stocks with floorsheet cache
  for (const [sym, stockData] of Object.entries(stocks)) {
    const fsData = stockData?.floorsheet;
    if (!fsData) continue;
    const q = quotesMap.get ? quotesMap.get(sym) : null;
    const ltp = Number(q?.ltp || fsData.vwap || 100);
    const companyName = q?.companyName || companyNameLookup[sym] || sym;
    const sector = q?.sector || "NEPSE";
    const stRec = getStockRecord(sym, ltp, companyName, sector);

    // Aggregate Top Buyers for this stock
    for (const b of (fsData.topBuyDetails || [])) {
      const bNum = Number(b.broker) || b.broker;
      const kitta = Math.round(Number(b.kitta || 0));
      if (!bNum || kitta <= 0) continue;
      const amount = Math.round(kitta * ltp);

      // Add to broker record
      const bRec = getBrokerRecord(bNum);
      bRec.totalBuyKitta += kitta;
      bRec.totalBuyAmount += amount;
      const prevB = bRec.boughtStocksMap.get(sym) || { symbol: sym, companyName, kitta: 0, amount: 0, ltp, sector };
      prevB.kitta += kitta;
      prevB.amount += amount;
      bRec.boughtStocksMap.set(sym, prevB);

      // Add to stock accumulation
      stRec.buyKitta += kitta;
      stRec.buyAmount += amount;
      stRec.buyersMap.set(bNum, (stRec.buyersMap.get(bNum) || 0) + kitta);
    }

    // Aggregate Top Sellers for this stock
    for (const s of (fsData.topSellDetails || [])) {
      const sNum = Number(s.broker) || s.broker;
      const kitta = Math.round(Number(s.kitta || 0));
      if (!sNum || kitta <= 0) continue;
      const amount = Math.round(kitta * ltp);

      // Add to broker record
      const sRec = getBrokerRecord(sNum);
      sRec.totalSellKitta += kitta;
      sRec.totalSellAmount += amount;
      const prevS = sRec.soldStocksMap.get(sym) || { symbol: sym, companyName, kitta: 0, amount: 0, ltp, sector };
      prevS.kitta += kitta;
      prevS.amount += amount;
      sRec.soldStocksMap.set(sym, prevS);

      // Add to stock accumulation
      stRec.sellKitta += kitta;
      stRec.sellAmount += amount;
      stRec.sellersMap.set(sNum, (stRec.sellersMap.get(sNum) || 0) + kitta);
    }

    stRec.netAmount = stRec.buyAmount - stRec.sellAmount;
    stRec.netKitta = stRec.buyKitta - stRec.sellKitta;
  }

  // Format every Broker's Top 5 Buys and Top 5 Sells
  const allBrokers = Array.from(brokerLedger.values()).map((b) => {
    b.totalTurnover = b.totalBuyAmount + b.totalSellAmount;
    b.netCashFlow = b.totalBuyAmount - b.totalSellAmount;

    const top5Buys = Array.from(b.boughtStocksMap.values())
      .sort((x, y) => y.amount - x.amount)
      .slice(0, 5)
      .map((item) => ({
        symbol: item.symbol,
        companyName: item.companyName || companyNameLookup[item.symbol] || item.symbol,
        sector: item.sector,
        kitta: item.kitta,
        amount: item.amount,
        amountFormatted: formatCurrencyCrore(item.amount),
        pctOfBrokerBuy: b.totalBuyAmount > 0 ? +((item.amount / b.totalBuyAmount) * 100).toFixed(1) : 0
      }));

    const top5Sells = Array.from(b.soldStocksMap.values())
      .sort((x, y) => y.amount - x.amount)
      .slice(0, 5)
      .map((item) => ({
        symbol: item.symbol,
        companyName: item.companyName || companyNameLookup[item.symbol] || item.symbol,
        sector: item.sector,
        kitta: item.kitta,
        amount: item.amount,
        amountFormatted: formatCurrencyCrore(item.amount),
        pctOfBrokerSell: b.totalSellAmount > 0 ? +((item.amount / b.totalSellAmount) * 100).toFixed(1) : 0
      }));

    return {
      broker: b.broker,
      name: b.name,
      totalBuyAmount: b.totalBuyAmount,
      totalBuyAmountFormatted: formatCurrencyCrore(b.totalBuyAmount),
      totalBuyKitta: b.totalBuyKitta,
      totalSellAmount: b.totalSellAmount,
      totalSellAmountFormatted: formatCurrencyCrore(b.totalSellAmount),
      totalSellKitta: b.totalSellKitta,
      totalTurnover: b.totalTurnover,
      totalTurnoverFormatted: formatCurrencyCrore(b.totalTurnover),
      netCashFlow: b.netCashFlow,
      netCashFlowFormatted: formatCurrencyCrore(Math.abs(b.netCashFlow)),
      isNetBuyer: b.netCashFlow >= 0,
      buyerRatioPct: b.totalTurnover > 0 ? +((b.totalBuyAmount / b.totalTurnover) * 100).toFixed(1) : 50,
      top5Buys,
      top5Sells
    };
  }).filter((b) => b.totalTurnover > 0).sort((a, b) => b.totalTurnover - a.totalTurnover);

  // Compute Overall Market Top 5 / 10 Highest Bought Stocks Across ALL Brokers
  const allStockRecords = Array.from(stockAccumulation.values());
  const top10HighestBoughtStocks = [...allStockRecords]
    .sort((a, b) => b.buyAmount - a.buyAmount)
    .slice(0, 10)
    .map((s) => {
      const topBrokers = Array.from(s.buyersMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([bNum, kitta]) => `#${bNum} (${(kitta / 1000).toFixed(1)}k)`)
        .join(", ");
      return {
        symbol: s.symbol,
        companyName: s.companyName,
        sector: s.sector,
        ltp: s.ltp,
        buyAmount: s.buyAmount,
        buyAmountFormatted: formatCurrencyCrore(s.buyAmount),
        buyKitta: s.buyKitta,
        sellAmount: s.sellAmount,
        sellAmountFormatted: formatCurrencyCrore(s.sellAmount),
        netAmount: s.netAmount,
        netAmountFormatted: formatCurrencyCrore(Math.abs(s.netAmount)),
        isNetAccumulated: s.netAmount >= 0,
        topBrokers
      };
    });

  // Compute Overall Market Top 5 / 10 Highest Sold Stocks Across ALL Brokers
  const top10HighestSoldStocks = [...allStockRecords]
    .sort((a, b) => b.sellAmount - a.sellAmount)
    .slice(0, 10)
    .map((s) => {
      const topBrokers = Array.from(s.sellersMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([bNum, kitta]) => `#${bNum} (${(kitta / 1000).toFixed(1)}k)`)
        .join(", ");
      return {
        symbol: s.symbol,
        companyName: s.companyName,
        sector: s.sector,
        ltp: s.ltp,
        sellAmount: s.sellAmount,
        sellAmountFormatted: formatCurrencyCrore(s.sellAmount),
        sellKitta: s.sellKitta,
        buyAmount: s.buyAmount,
        buyAmountFormatted: formatCurrencyCrore(s.buyAmount),
        netAmount: s.netAmount,
        netAmountFormatted: formatCurrencyCrore(Math.abs(s.netAmount)),
        isNetDumped: s.netAmount < 0,
        topBrokers
      };
    });

  cachedBrokerSummary = {
    updatedAt: new Date().toISOString(),
    totalBrokersActive: allBrokers.length,
    totalTrackedStocks: allStockRecords.length,
    top10HighestBoughtStocks,
    top10HighestSoldStocks,
    top5HighestBoughtStocks: top10HighestBoughtStocks.slice(0, 5),
    top5HighestSoldStocks: top10HighestSoldStocks.slice(0, 5),
    allBrokers
  };

  lastBuildTimestamp = now;
  return cachedBrokerSummary;
}

function getBrokerSummaryMessage(brokerNumArg = null, quotesMap = new Map()) {
  const summary = buildBrokerSummary(quotesMap);
  if (!summary) return `❌ Broker summary data not available yet.`;

  if (brokerNumArg) {
    const num = Number(brokerNumArg) || 0;
    const b = summary.allBrokers.find((x) => x.broker === num);
    if (!b) {
      return `❌ Broker #${brokerNumArg} not found or had no trades in the latest floorsheet session. Try *!broker 58*, *!broker 45*, or *!broker 28*.`;
    }

    let msg =
      `🏢 *NEPSE BROKER #${b.broker} ACTIVITY RADAR*\n` +
      `💼 *${b.name}* (Broker #${b.broker})\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `• *Total Turnover:* ${b.totalTurnoverFormatted}\n` +
      `• *Total Buy Volume:* ${b.totalBuyAmountFormatted} (${b.totalBuyKitta.toLocaleString()} kitta)\n` +
      `• *Total Sell Volume:* ${b.totalSellAmountFormatted} (${b.totalSellKitta.toLocaleString()} kitta)\n` +
      `• *Net Stance:* *${b.isNetBuyer ? "🟢 NET BUYER (+ " + b.netCashFlowFormatted + ")" : "🔴 NET SELLER (- " + b.netCashFlowFormatted + ")"}*\n\n` +
      `🟢 *TOP 5 HIGHEST BOUGHT STOCKS (BY BROKER #${b.broker} — ${b.name}):*\n`;

    if (b.top5Buys.length === 0) msg += `  • No recorded buys\n`;
    else {
      b.top5Buys.forEach((x, i) => {
        msg += `  ${i + 1}. *${x.symbol}* (${x.companyName || x.symbol}): Buy *${x.amountFormatted}* (${x.kitta.toLocaleString()} kitta | ${x.pctOfBrokerBuy}% of broker buy)\n`;
      });
    }

    msg += `\n🔴 *TOP 5 HIGHEST SOLD STOCKS (BY BROKER #${b.broker} — ${b.name}):*\n`;
    if (b.top5Sells.length === 0) msg += `  • No recorded sells\n`;
    else {
      b.top5Sells.forEach((x, i) => {
        msg += `  ${i + 1}. *${x.symbol}* (${x.companyName || x.symbol}): Sell *${x.amountFormatted}* (${x.kitta.toLocaleString()} kitta | ${x.pctOfBrokerSell}% of broker sell)\n`;
      });
    }

    return msg;
  }

  // Overall Top 5 Buys and Sells across all brokers + Top Active Brokers
  let msg =
    `🏢 *NEPSE ALL-BROKERS SUMMARY & FLOORSHEET RADAR*\n` +
    `_Aggregated across ${summary.totalBrokersActive} active brokers & ${summary.totalTrackedStocks} stocks_\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🟢 *OVERALL TOP 5 HIGHEST BOUGHT STOCKS (ALL BROKERS):*\n`;

  summary.top5HighestBoughtStocks.forEach((s, i) => {
    msg += `  ${i + 1}. *${s.symbol}* (${s.companyName || s.symbol}) — LTP Rs ${s.ltp}\n     ↳ Buy: *${s.buyAmountFormatted}* (${s.buyKitta.toLocaleString()} kitta) | Net: *${s.isNetAccumulated ? "+" : "-"}${s.netAmountFormatted}*\n     ↳ _Top Buyers: ${s.topBrokers}_\n`;
  });

  msg += `\n🔴 *OVERALL TOP 5 HIGHEST SOLD STOCKS (ALL BROKERS):*\n`;
  summary.top5HighestSoldStocks.forEach((s, i) => {
    msg += `  ${i + 1}. *${s.symbol}* (${s.companyName || s.symbol}) — LTP Rs ${s.ltp}\n     ↳ Sell: *${s.sellAmountFormatted}* (${s.sellKitta.toLocaleString()} kitta) | Net: *${s.isNetDumped ? "-" : "+"}${s.netAmountFormatted}*\n     ↳ _Top Sellers: ${s.topBrokers}_\n`;
  });

  msg += `\n🏆 *TOP 5 BROKERS BY MARKET TURNOVER:*\n`;
  summary.allBrokers.slice(0, 5).forEach((b, i) => {
    const stance = b.isNetBuyer ? `🟢 Net +${b.netCashFlowFormatted}` : `🔴 Net -${b.netCashFlowFormatted}`;
    msg += `  ${i + 1}. *Broker #${b.broker}: ${b.name}*\n     ↳ Turnover: *${b.totalTurnoverFormatted}* | ${stance}\n`;
  });

  msg += `\n💡 _Send *!broker 58* (or any broker number like *!broker 45*) to see any broker's individual Top 5 Buys & Top 5 Sells._`;
  return msg;
}

module.exports = {
  NEPSE_BROKER_NAMES,
  buildBrokerSummary,
  getBrokerSummaryMessage
};
