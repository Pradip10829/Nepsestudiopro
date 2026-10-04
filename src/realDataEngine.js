const fs = require("fs");
const path = require("path");
let cheerio = null;
try {
  cheerio = require("cheerio");
} catch (_) {}

const DATA_DIR = path.join(__dirname, "..", "data");
const REAL_CACHE_FILE = path.join(DATA_DIR, "real_market_cache.json");

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function parseNum(str) {
  if (str === null || str === undefined) return null;
  const cleaned = String(str).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!cleaned) return null;
  const val = parseFloat(cleaned[0]);
  return Number.isFinite(val) ? val : null;
}

function normalizeSectorName(rawSector = "") {
  const s = rawSector.toLowerCase();
  if (s.includes("commercial") || s === "banking") return "Commercial Banks";
  if (s.includes("development")) return "Development Banks";
  if (s.includes("finance") && !s.includes("micro")) return "Finance";
  if (s.includes("micro")) return "Microfinance";
  if (s.includes("hydro")) return "Hydropower";
  if (s.includes("non life") || s.includes("non-life")) return "Non-Life Insurance";
  if (s.includes("life")) return "Life Insurance";
  if (s.includes("manufactur") || s.includes("processing")) return "Manufacturing & Processing";
  if (s.includes("hotel") || s.includes("tourism")) return "Hotels & Tourism";
  if (s.includes("trading")) return "Trading";
  if (s.includes("invest")) return "Investment";
  if (s.includes("mutual")) return "Mutual Fund";
  if (s.includes("other")) return "Others";
  return rawSector || "Others";
}

class RealDataEngine {
  constructor() {
    this.cache = {
      updatedAt: null,
      stocks: {} // symbol -> { updatedAt, bars, fundamentals, floorsheet }
    };
    this.inFlight = new Map();
    this.loadDiskCache();
  }

  loadDiskCache() {
    try {
      if (fs.existsSync(REAL_CACHE_FILE)) {
        const raw = JSON.parse(fs.readFileSync(REAL_CACHE_FILE, "utf8"));
        if (raw && raw.stocks && typeof raw.stocks === "object") {
          this.cache = raw;
        }
      }
    } catch (_) {}
  }

  saveDiskCache() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      this.cache.updatedAt = new Date().toISOString();
      fs.writeFileSync(REAL_CACHE_FILE, JSON.stringify(this.cache));
    } catch (_) {}
  }

  getCached(symbol) {
    const sym = String(symbol || "").trim().toUpperCase();
    return this.cache.stocks[sym] || null;
  }

  isFresh(symbol, maxAgeMs = 4 * 3600 * 1000) {
    const entry = this.getCached(symbol);
    if (!entry || !entry.updatedAt) return false;
    const age = Date.now() - new Date(entry.updatedAt).getTime();
    return age < maxAgeMs && Array.isArray(entry.bars) && entry.bars.length >= 30 && Boolean(entry.fundamentals);
  }

  /**
   * 1. Fetch 200 days of real NEPSE daily OHLCV candles from NepaliPaisa + Chukul
   */
  async fetchRealOHLCV(symbol) {
    const sym = String(symbol || "").trim().toUpperCase();
    let bars = [];

    // Primary: NepaliPaisa Official Stock History API (up to 200 daily sessions with exact volume & turnover)
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 5000);
      const url = `https://www.nepalipaisa.com/api/GetStockHistory?stockSymbol=${encodeURIComponent(sym)}&fromDate=2024-01-01&toDate=2027-12-31&pageNo=1&itemsPerPage=200&pagePerDisplay=5`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
        signal: controller.signal
      });
      clearTimeout(t);
      if (res.ok) {
        const json = await res.json();
        const rows = json?.result?.data;
        if (Array.isArray(rows) && rows.length > 0) {
          const chronological = rows.slice().reverse();
          bars = chronological
            .map((r) => {
              const close = Number(r.closingPrice) || 0;
              const prev = Number(r.previousClosing) || close;
              const high = Number(r.maxPrice) || close;
              const low = Number(r.minPrice) || close;
              const open = prev > 0 ? prev : close;
              const volume = Number(r.volume) || 0;
              return {
                date: r.tradeDateString || String(r.tradeDate || "").slice(0, 10),
                open: round2(open),
                high: round2(Math.max(high, open, close)),
                low: round2(Math.min(low > 0 ? low : close, open, close)),
                close: round2(close),
                volume: Math.round(volume),
                turnover: round2(Number(r.amount) || close * volume),
                transactions: Number(r.noOfTransactions) || 0,
                source: "NEPALIPAISA_REAL_OHLCV"
              };
            })
            .filter((b) => b.close > 0);
        }
      }
    } catch (_) {}

    // Secondary / Open-Price Enricher: Chukul History API
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 4500);
      const res = await fetch(`https://chukul.com/api/data/historydata/data/?symbol=${encodeURIComponent(sym)}`, {
        headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://chukul.com/" },
        signal: controller.signal
      });
      clearTimeout(t);
      if (res.ok) {
        const j = await res.json();
        if (Array.isArray(j?.t) && j.t.length > 0) {
          const openByDate = new Map();
          const chukulBars = [];
          for (let i = j.t.length - 1; i >= 0; i--) {
            const dStr = new Date(j.t[i] * 1000).toISOString().slice(0, 10);
            const o = Number(j.o?.[i]) || Number(j.c?.[i]) || 0;
            const h = Number(j.h?.[i]) || o;
            const l = Number(j.l?.[i]) || o;
            const c = Number(j.c?.[i]) || o;
            const vol = Number(j.vol?.[i]) || 0;
            if (o > 0) openByDate.set(dStr, o);
            if (c > 0) {
              chukulBars.push({
                date: dStr,
                open: round2(o),
                high: round2(Math.max(h, o, c)),
                low: round2(Math.min(l > 0 ? l : c, o, c)),
                close: round2(c),
                volume: Math.round(vol),
                turnover: round2(Number(j.amt?.[i]) || c * vol),
                source: "CHUKUL_REAL_OHLCV"
              });
            }
          }
          if (bars.length === 0 && chukulBars.length > 0) {
            bars = chukulBars;
          } else if (bars.length > 0 && openByDate.size > 0) {
            for (const b of bars) {
              if (openByDate.has(b.date)) {
                const realOpen = openByDate.get(b.date);
                b.open = round2(realOpen);
                b.high = round2(Math.max(b.high, realOpen, b.close));
                b.low = round2(Math.min(b.low, realOpen, b.close));
              }
            }
          }
        }
      }
    } catch (_) {}

    return bars;
  }

  /**
   * 2. Scrape Real Company Fundamentals from MeroLagani CompanyDetail.aspx?symbol=SYM
   */
  async fetchRealFundamentals(symbol) {
    if (!cheerio) return null;
    const sym = String(symbol || "").trim().toUpperCase();
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 5000);
      const url = `https://merolagani.com/CompanyDetail.aspx?symbol=${encodeURIComponent(sym)}`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
        signal: controller.signal
      });
      clearTimeout(t);
      if (!res.ok) return null;

      const html = await res.text();
      const $ = cheerio.load(html);
      const fields = {};
      $("#accordion tr, table tr").each((_, tr) => {
        const th = $(tr).find("th").text().replace(/\s+/g, " ").trim();
        const td = $(tr).find("td").text().replace(/\s+/g, " ").trim();
        if (th && td && th.length < 65 && td.length < 150 && !fields[th]) {
          fields[th] = td;
        }
      });

      if (Object.keys(fields).length < 4) return null;

      // Parse 52 Weeks High - Low (e.g. "6,335.90-4,997.10")
      let high52w = null;
      let low52w = null;
      const hlRaw = fields["52 Weeks High - Low"] || "";
      if (hlRaw.includes("-")) {
        const parts = hlRaw.split("-");
        high52w = parseNum(parts[0]);
        low52w = parseNum(parts[1]);
      }

      const eps = parseNum(fields["EPS"]);
      const epsMeta = fields["EPS"] || "";
      const peRatio = parseNum(fields["P/E Ratio"]);
      const bookValue = parseNum(fields["Book Value"]);
      const pbv = parseNum(fields["PBV"]);
      const cashDividend = parseNum(fields["% Dividend"]) ?? 0;
      const bonusDividend = parseNum(fields["% Bonus"]) ?? 0;
      const avg120d = parseNum(fields["120 Day Average"]);
      const avg180d = parseNum(fields["180 Day Average"]);
      const avgVol30d = parseNum(fields["30-Day Avg Volume"]);
      const listedShares = parseNum(fields["Shares Outstanding"] || fields["Listed Shares"]);
      const marketPrice = parseNum(fields["Market Price"]);
      const companyName = fields["Company Name"] || $("#ctl00_ContentPlaceHolder1_CompanyDetail1_companyName").text().trim() || sym;
      const sector = normalizeSectorName(fields["Sector"] || "");

      // Compute real ROE (%) = (EPS / Book Value) * 100
      const roe =
        eps !== null && bookValue !== null && bookValue > 0
          ? round2((eps / bookValue) * 100)
          : null;

      return {
        symbol: sym,
        companyName,
        sector,
        marketPrice,
        high52w,
        low52w,
        avg120d,
        avg180d,
        avgVol30d,
        listedShares,
        eps,
        epsMeta,
        peRatio,
        bookValue,
        pbv,
        roe,
        cashDividend,
        bonusDividend,
        totalDividend: round2((cashDividend || 0) + (bonusDividend || 0)),
        lastTradedOn: fields["Last Traded On"] || null,
        source: "MEROLAGANI_COMPANY_DETAIL_LIVE"
      };
    } catch (_) {
      return null;
    }
  }

  /**
   * 3. Fetch Real Broker Floorsheet Accumulation / Distribution from Chukul Floorsheet API
   */
  async fetchRealFloorsheet(symbol, preferredDate = null) {
    const sym = String(symbol || "").trim().toUpperCase();
    const datesToTry = [];
    if (preferredDate) datesToTry.push(preferredDate);
    for (const d of ["2026-10-02", "2026-10-01", "2026-09-30", "2026-09-29"]) {
      if (!datesToTry.includes(d)) datesToTry.push(d);
    }

    for (const dateStr of datesToTry.slice(0, 3)) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 4500);
        const url = `https://chukul.com/api/data/floorsheet/?symbol=${encodeURIComponent(sym)}&date=${encodeURIComponent(dateStr)}`;
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://chukul.com/" },
          signal: controller.signal
        });
        clearTimeout(t);
        if (!res.ok) continue;

        const trades = await res.json();
        if (!Array.isArray(trades) || trades.length === 0) continue;

        const buyMap = {};
        const sellMap = {};
        let totalKitta = 0;
        let totalAmount = 0;

        for (const tr of trades) {
          const qty = Number(tr.quantity) || 0;
          const amt = Number(tr.amount) || 0;
          if (qty <= 0) continue;
          totalKitta += qty;
          totalAmount += amt;
          const b = String(tr.buyer || "").trim();
          const s = String(tr.seller || "").trim();
          if (b) buyMap[b] = (buyMap[b] || 0) + qty;
          if (s) sellMap[s] = (sellMap[s] || 0) + qty;
        }

        if (totalKitta <= 0) continue;

        const topBuyDetails = Object.entries(buyMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([broker, kitta]) => ({
            broker: Number(broker) || broker,
            kitta: Math.round(kitta),
            pct: round2((kitta / totalKitta) * 100)
          }));

        const topSellDetails = Object.entries(sellMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([broker, kitta]) => ({
            broker: Number(broker) || broker,
            kitta: Math.round(kitta),
            pct: round2((kitta / totalKitta) * 100)
          }));

        const top3BuyKitta = topBuyDetails.reduce((s, x) => s + x.kitta, 0);
        const top3SellKitta = topSellDetails.reduce((s, x) => s + x.kitta, 0);
        const buyerConcentrationPct = round2((top3BuyKitta / totalKitta) * 100);
        const sellerConcentrationPct = round2((top3SellKitta / totalKitta) * 100);
        const vwap = round2(totalAmount / totalKitta);

        const buyStr = topBuyDetails.map((x) => `#${x.broker} (${x.kitta}k / ${x.pct}%)`).join(", ");
        const sellStr = topSellDetails.map((x) => `#${x.broker} (${x.kitta}k / ${x.pct}%)`).join(", ");

        return {
          date: dateStr,
          totalTrades: trades.length,
          totalKitta: Math.round(totalKitta),
          totalTurnover: round2(totalAmount),
          vwap,
          topBuyBrokers: topBuyDetails.map((x) => x.broker),
          topSellBrokers: topSellDetails.map((x) => x.broker),
          topBuyDetails,
          topSellDetails,
          buyerConcentrationPct,
          sellerConcentrationPct,
          netConcentrationDiffPct: round2(buyerConcentrationPct - sellerConcentrationPct),
          summary: `Real Floorsheet (${dateStr} • ${trades.length} trades • ${Math.round(totalKitta).toLocaleString()} kitta • VWAP Rs ${vwap}): Top Buyers ${buyStr} vs Top Sellers ${sellStr}`,
          source: "CHUKUL_REAL_FLOORSHEET"
        };
      } catch (_) {}
    }

    return null;
  }

  /**
   * Enriches a single symbol with all 3 real data layers (OHLCV + MeroLagani Fundamentals + Chukul Floorsheet)
   */
  async enrichSymbol(symbol, force = false) {
    const sym = String(symbol || "").trim().toUpperCase();
    if (!sym || sym === "NEPSE") return null;

    if (!force && this.isFresh(sym)) {
      return this.cache.stocks[sym];
    }

    if (this.inFlight.has(sym)) {
      return this.inFlight.get(sym);
    }

    const promise = (async () => {
      try {
        const existing = this.cache.stocks[sym] || {};
        const [bars, fundamentals] = await Promise.all([
          this.fetchRealOHLCV(sym),
          this.fetchRealFundamentals(sym)
        ]);

        const finalBars = bars && bars.length >= 15 ? bars : existing.bars || [];
        const latestTradeDate =
          finalBars.length > 0 ? finalBars[finalBars.length - 1].date : "2026-10-02";

        const floorsheet =
          (await this.fetchRealFloorsheet(sym, latestTradeDate)) || existing.floorsheet || null;

        const record = {
          symbol: sym,
          updatedAt: new Date().toISOString(),
          bars: finalBars,
          fundamentals: fundamentals || existing.fundamentals || null,
          floorsheet
        };

        if (record.bars.length > 0 || record.fundamentals || record.floorsheet) {
          this.cache.stocks[sym] = record;
          this.saveDiskCache();
        }
        return record;
      } finally {
        this.inFlight.delete(sym);
      }
    })();

    this.inFlight.set(sym, promise);
    return promise;
  }

  /**
   * Batch pre-warms an array of symbols with concurrency limit so we don't overwhelm upstream servers
   */
  async warmSymbols(symbols = [], concurrency = 5) {
    const queue = symbols
      .map((s) => String(s || "").trim().toUpperCase())
      .filter((s) => s && s !== "NEPSE" && !this.isFresh(s));

    if (queue.length === 0) return;

    let idx = 0;
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (idx < queue.length) {
        const sym = queue[idx++];
        try {
          await this.enrichSymbol(sym, false);
        } catch (_) {}
      }
    });

    await Promise.all(workers);
    this.saveDiskCache();
  }
}

module.exports = new RealDataEngine();
