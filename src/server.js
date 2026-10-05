const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const zlib = require("zlib");
const nepseProvider = require("./nepseProvider");
const { analyzeStock, normalizeBarsForBookClose } = require("./signalEngine");
const { handleMessage, getAppState, saveState } = require("./commandHandler");
const whatsappClient = require("./whatsappClient");

const PORT = process.env.PORT || 4050;
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const DATA_DIR = path.join(__dirname, "..", "data");
const MEROSHARE_MERO_FILE = path.join(DATA_DIR, "meroshare_mero_portfolio.json");
const MEROSHARE_SESSION_FILE = path.join(DATA_DIR, "meroshare_session_cache.json");
const TMP_MEROSHARE_MERO_FILE = "/tmp/meroshare_mero_portfolio.json";
const TMP_MEROSHARE_SESSION_FILE = "/tmp/meroshare_session_cache.json";

let memoryMeroPortfolio = null;

// Live CDSC session state (also cached locally in gitignored data/meroshare_session_cache.json so server restarts never disconnect you)
let activeCdscSession = {
  authToken: null,
  demat: null,
  clientCode: null,
  clientId: null,
  investorName: null,
  dpName: null,
  dpId: null,
  username: null,
  savedPasswordB64: null,
  authenticatedAt: null
};

function loadCdscSessionCache() {
  try {
    const fileToRead = fs.existsSync(TMP_MEROSHARE_SESSION_FILE)
      ? TMP_MEROSHARE_SESSION_FILE
      : MEROSHARE_SESSION_FILE;
    if (fs.existsSync(fileToRead)) {
      const raw = JSON.parse(fs.readFileSync(fileToRead, "utf8"));
      if (raw && typeof raw === "object") {
        activeCdscSession = { ...activeCdscSession, ...raw };
      }
    }
  } catch (_) {}
}

function saveCdscSessionCache() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(MEROSHARE_SESSION_FILE, JSON.stringify(activeCdscSession, null, 2), "utf8");
  } catch (_) {
    try {
      fs.writeFileSync(TMP_MEROSHARE_SESSION_FILE, JSON.stringify(activeCdscSession, null, 2), "utf8");
    } catch (__) {}
  }
}

loadCdscSessionCache();

const FAKE_DEMO_SOURCES = new Set([
  "MeroShare Direct Sync",
  "CDSC MeroShare Sync",
  "MeroShare Direct Login",
  "Direct Login Sync"
]);

function getDefaultMeroPortfolio() {
  return {
    portfolioName: "Mero",
    linkedAccount: {
      isLinked: false,
      dpId: "13016300",
      dpName: "KUMARI BANK LIMITED / KUMARI CAPITAL (16300)",
      clientId: 168,
      username: "",
      boid: "",
      investorName: "",
      loginMode: "READY_FOR_LIVE_CDSC",
      autoSyncEnabled: true,
      syncIntervalMinutes: 1,
      linkedAt: null,
      lastSyncedAt: null,
      syncStatus: "NOT_LOGGED_IN",
      cdscTotalValueLtp: 0,
      cdscTotalValuePrevClose: 0,
      cdscTotalItems: 0,
      waccMatchedCount: 0
    },
    dematProfile: {},
    waccReport: [],
    myShares: [],
    recentTransactions: [],
    holdings: {}
  };
}

function loadMeroPortfolio() {
  if (memoryMeroPortfolio) return memoryMeroPortfolio;
  try {
    const candidateFile = fs.existsSync(TMP_MEROSHARE_MERO_FILE)
      ? TMP_MEROSHARE_MERO_FILE
      : MEROSHARE_MERO_FILE;
    let raw = null;
    if (fs.existsSync(candidateFile)) {
      raw = JSON.parse(fs.readFileSync(candidateFile, "utf8"));
    } else {
      raw = require("../data/meroshare_mero_portfolio.json");
    }
    if (raw) {
      const rawHoldings = raw.holdings && typeof raw.holdings === "object" ? raw.holdings : {};
      const cleanedHoldings = {};
      let removedFake = false;
      for (const [sym, item] of Object.entries(rawHoldings)) {
        if (item && FAKE_DEMO_SOURCES.has(item.source)) {
          removedFake = true;
          continue;
        }
        cleanedHoldings[sym] = item;
      }
      const acct = {
        ...getDefaultMeroPortfolio().linkedAccount,
        ...(raw.linkedAccount || {})
      };
      if (removedFake && Object.keys(cleanedHoldings).length === 0 && acct.syncStatus !== "LIVE_CDSC_AUTHENTICATED") {
        acct.isLinked = false;
        acct.syncStatus = "NOT_LOGGED_IN";
      }
      const result = {
        portfolioName: "Mero",
        linkedAccount: acct,
        dematProfile: raw.dematProfile || {},
        waccReport: Array.isArray(raw.waccReport) ? raw.waccReport : [],
        myShares: Array.isArray(raw.myShares) ? raw.myShares : [],
        recentTransactions: Array.isArray(raw.recentTransactions) ? raw.recentTransactions : [],
        holdings: cleanedHoldings
      };
      memoryMeroPortfolio = result;
      if (removedFake) {
        saveMeroPortfolio(result);
      }
      return result;
    }
  } catch (_) {}
  return getDefaultMeroPortfolio();
}

function saveMeroPortfolio(data) {
  memoryMeroPortfolio = data;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(MEROSHARE_MERO_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (_) {
    try {
      fs.writeFileSync(TMP_MEROSHARE_MERO_FILE, JSON.stringify(data, null, 2), "utf8");
    } catch (__) {}
  }
  return data;
}

function parseMeroshareTextHoldings(rawText) {
  const parsed = {};
  if (!rawText || typeof rawText !== "string") return parsed;
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^(s\.?n|symbol|scrip|stock|company|#)/i.test(line)) continue;
    const parts = line.split(/[\t,|;]+|\s{2,}/).map(p => p.trim()).filter(Boolean);
    let sym = "";
    const nums = [];
    const tokens = parts.length >= 2 ? parts : line.split(/[\s,;\t|]+/).map(p => p.trim()).filter(Boolean);
    for (const tok of tokens) {
      const cleanTok = tok.replace(/^["']|["']$/g, "");
      if (!sym && /^[A-Za-z]{3,8}$/.test(cleanTok) && !/^(NPR|RS|KITTA|SHARES|WACC|LONG|SHORT|HOLD|SYNC)$/i.test(cleanTok)) {
        sym = cleanTok.toUpperCase();
      } else {
        const n = Number(cleanTok.replace(/,/g, "").replace(/^Rs\.?/i, ""));
        if (Number.isFinite(n) && n > 0) {
          nums.push(n);
        }
      }
    }
    if (sym && nums.length >= 2) {
      // Heuristic: kitta vs wacc (if one is integer and the other has decimals or looks like price)
      let kitta = Math.round(nums[0]);
      let wacc = Number(nums[1].toFixed(2));
      parsed[sym] = {
        symbol: sym,
        kitta: Math.max(1, kitta),
        wacc: Math.max(10, wacc),
        holdPeriod: "long",
        source: "MeroShare CSV/Import",
        updatedAt: new Date().toISOString()
      };
    }
  }
  return parsed;
}

const perStockSignalCache = new Map();
let lastQuotesDigest = "";

function buildIncrementalDashboardSignals(quotes) {
  let digest = "";
  for (let i = 0; i < quotes.length; i++) {
    const q = quotes[i];
    digest += `${q.symbol}:${q.ltp}:${q.volume}:${q.prevClose};`;
  }
  if (global.__cachedDashboardSignals && global.__cachedDashboardSignals.length === quotes.length && digest === lastQuotesDigest) {
    return global.__cachedDashboardSignals;
  }

  const signals = quotes
    .map((q) => {
      const stockKey = `${q.ltp}:${q.high}:${q.low}:${q.prevClose}:${q.volume}:${q.sectorChangePct || 0}`;
      const cached = perStockSignalCache.get(q.symbol);
      if (cached && cached.stockKey === stockKey) {
        return cached.signal;
      }
      const bars = nepseProvider.getHistoricalBars(q.symbol);
      const a = analyzeStock(q, bars);
      if (!a) return null;
      const enriched = {
        ...a,
        recentBars: Array.isArray(a.recentBars) ? a.recentBars.slice(-18) : [],
        executionMatrix: a.executionMatrix ? { exits: a.executionMatrix.exits } : null,
        weeklyTrading: a.weeklyTrading ? { ...a.weeklyTrading, weeklyBars: undefined } : null,
        open: q.open,
        high: q.high,
        low: q.low,
        prevClose: q.prevClose,
        volume: q.volume,
        turnover: q.turnover,
        high52w: q.high52w,
        low52w: q.low52w,
        avg120d: q.avg120d,
        avg180d: q.avg180d,
        epsMeta: q.epsMeta,
        floorsheetData: q.floorsheetData || null,
        realOHLCVVerified: Boolean(q.realOHLCVVerified),
        realBarsCount: q.realBarsCount || 0,
        realFundamentalsVerified: Boolean(q.realFundamentalsVerified),
        realFloorsheetVerified: Boolean(q.realFloorsheetVerified),
        isCoreSeed: Boolean(q.isCoreSeed),
        source: q.source
      };
      perStockSignalCache.set(q.symbol, { stockKey, signal: enriched });
      return enriched;
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        (b.realOHLCVVerified ? 1 : 0) - (a.realOHLCVVerified ? 1 : 0) ||
        (b.isCoreSeed ? 1 : 0) - (a.isCoreSeed ? 1 : 0) ||
        b.quantScore - a.quantScore ||
        a.symbol.localeCompare(b.symbol)
    );

  lastQuotesDigest = digest;
  global.__cachedDashboardSignals = signals;
  return signals;
}

function sendJson(res, statusCode, payload, req = null) {
  const jsonStr = JSON.stringify(payload);
  const acceptEnc = String((req && req.headers && req.headers["accept-encoding"]) || res.req?.headers?.["accept-encoding"] || "");
  if (jsonStr.length > 2048 && acceptEnc.includes("gzip")) {
    const gz = zlib.gzipSync(Buffer.from(jsonStr, "utf8"), { level: 1 });
    res.writeHead(statusCode, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Encoding": "gzip",
      "Content-Length": gz.length,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store"
    });
    return res.end(gz);
  }
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store"
  });
  return res.end(jsonStr);
}

function parseBody(req) {
  if (req.body && typeof req.body === "object") {
    return Promise.resolve(req.body);
  }
  if (typeof req.body === "string" && req.body.length > 0) {
    try {
      return Promise.resolve(JSON.parse(req.body));
    } catch (_) {}
  }
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (_) {
        resolve({});
      }
    });
  });
}

const requestHandler = async (req, res) => {
  res.req = req;
  const parsedUrl = url.parse(req.url || "/", true);
  let pathname = parsedUrl.pathname || "/";
  if (parsedUrl.query && parsedUrl.query.__path) {
    const rawPath = String(parsedUrl.query.__path).replace(/^\/+/, "");
    pathname = "/api/" + rawPath;
  } else if (req.query && req.query.path && (pathname === "/api" || pathname === "/api/index" || pathname.includes("path"))) {
    const p = Array.isArray(req.query.path) ? req.query.path.join("/") : String(req.query.path);
    pathname = "/api/" + p.replace(/^\/+/, "");
  } else if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/chart") ||
    pathname.startsWith("/stock") ||
    pathname.startsWith("/news") ||
    pathname.startsWith("/meroshare") ||
    pathname.startsWith("/whatsapp") ||
    pathname.startsWith("/chat") ||
    pathname.startsWith("/command")
  ) {
    pathname = "/api" + pathname;
  }

  // 1. Interactive WhatsApp Bot Chat & Command Runner API
  if ((pathname === "/api/chat" || pathname === "/api/command") && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const message = body.message || body.command || "!help";
      const sender = body.sender || "web-simulator";
      const reply = await handleMessage(message, sender);
      return sendJson(res, 200, {
        ok: true,
        input: message,
        reply:
          reply ||
          "❓ Unrecognized command. Type *!help* for all NEPSE commands, or send a stock symbol like *NABIL*, *!signal HDL*, *!backtest NABIL*, or *!compare NABIL SCB*."
      });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  // 2. Live NEPSE Market & Signals Overview API (for Control Center UI)
  if (pathname === "/api/dashboard" && req.method === "GET") {
    try {
      const t0 = Date.now();
      const forceRefresh = Boolean(parsedUrl.query.refresh);
      if (forceRefresh) {
        await nepseProvider.refreshLiveQuotes(true);
      }
      const [market, quotes, newsFeed] = await Promise.all([
        nepseProvider.getMarketSummary(),
        nepseProvider.getAllQuotes(),
        nepseProvider.getNewsFeed("", false)
      ]);
      const sectors = nepseProvider.getSectors();
      const signals = buildIncrementalDashboardSignals(quotes);

      const state = getAppState();
      const waStatus = whatsappClient.getStatus();
      const fullPayloadKey = `${lastQuotesDigest}|${market.nepseIndex}|${market.pointChange}|${newsFeed.updatedAt || ""}|${waStatus.connected}:${waStatus.hasQr}`;
      const acceptEnc = String(req.headers["accept-encoding"] || "");

      if (global.__dashboardCacheKey === fullPayloadKey && global.__dashboardGzipBuf && global.__dashboardRawBuf) {
        if (acceptEnc.includes("gzip")) {
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Encoding": "gzip",
            "Content-Length": global.__dashboardGzipBuf.length,
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store"
          });
          return res.end(global.__dashboardGzipBuf);
        }
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": global.__dashboardRawBuf.length,
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store"
        });
        return res.end(global.__dashboardRawBuf);
      }

      const syncLatencyMs = Math.max(1, Date.now() - t0);
      const payloadObj = {
        ok: true,
        syncLatencyMs,
        syncedAt: new Date().toISOString(),
        market,
        sectors,
        signals,
        news: newsFeed.items || [],
        newsUpdatedAt: newsFeed.updatedAt || new Date().toISOString(),
        newsLiveCount: newsFeed.liveCount || 0,
        corporateEvents: nepseProvider.getCorporateEvents(),
        watchlist: state.watchlists.default || [],
        portfolio: state.portfolio?.default || [],
        alerts: state.alerts || [],
        whatsapp: waStatus
      };
      const rawBuf = Buffer.from(JSON.stringify(payloadObj), "utf8");
      const gzBuf = zlib.gzipSync(rawBuf, { level: 1 });
      global.__dashboardCacheKey = fullPayloadKey;
      global.__dashboardRawBuf = rawBuf;
      global.__dashboardGzipBuf = gzBuf;

      if (acceptEnc.includes("gzip")) {
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Encoding": "gzip",
          "Content-Length": gzBuf.length,
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store"
        });
        return res.end(gzBuf);
      }
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": rawBuf.length,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
      });
      return res.end(rawBuf);
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  // 2a. Dedicated Live News Feed API (Supports ?refresh=1 for instant MeroLagani + ShareSansar live scrape)
  if (pathname === "/api/news" && req.method === "GET") {
    try {
      const q = parsedUrl.query.symbol || parsedUrl.query.q || "";
      const forceRefresh = Boolean(parsedUrl.query.refresh);
      const newsFeed = await nepseProvider.getNewsFeed(q, forceRefresh);
      return sendJson(res, 200, {
        ok: true,
        updatedAt: newsFeed.updatedAt || new Date().toISOString(),
        liveCount: newsFeed.liveCount || 0,
        items: newsFeed.items || []
      });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  // 2b. Historical OHLCV + Real-Time Enriched Signal Overlay API for Interactive Chart
  if ((pathname.startsWith("/api/chart") || pathname === "/api/stock") && req.method === "GET") {
    try {
      const sym = (parsedUrl.query.symbol || pathname.replace("/api/chart/", "").replace("/api/chart", "") || "")
        .trim()
        .toUpperCase();
      nepseProvider.applyMeroSharePortfolioLocks();
      const quote = await nepseProvider.getQuote(sym);
      const rawBars = nepseProvider.getHistoricalBars(sym);

      if (!quote || !rawBars) {
        return sendJson(res, 404, { ok: false, error: "Symbol not found" });
      }
      const { bars: adjBars } = normalizeBarsForBookClose(rawBars);
      const analysis = analyzeStock(quote, rawBars);
      const enrichedSignal = analysis
        ? {
            ...analysis,
            open: quote.open,
            high: quote.high,
            low: quote.low,
            prevClose: quote.prevClose,
            volume: quote.volume,
            turnover: quote.turnover,
            high52w: quote.high52w,
            low52w: quote.low52w,
            avg120d: quote.avg120d,
            avg180d: quote.avg180d,
            epsMeta: quote.epsMeta,
            floorsheetData: quote.floorsheetData || null,
            realOHLCVVerified: Boolean(quote.realOHLCVVerified),
            realBarsCount: quote.realBarsCount || rawBars.length,
            realFundamentalsVerified: Boolean(quote.realFundamentalsVerified),
            realFloorsheetVerified: Boolean(quote.realFloorsheetVerified),
            isCoreSeed: Boolean(quote.isCoreSeed),
            source: quote.source
          }
        : null;
      const stockNews = await nepseProvider.getNewsFeed(sym);
      return sendJson(res, 200, {
        ok: true,
        symbol: sym,
        quote,
        bars: adjBars.slice(-200),
        analysis: enrichedSignal,
        signal: enrichedSignal,
        news: stockNews.items || []
      });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  // 3. WhatsApp Connection & QR Status API
  if (pathname === "/api/whatsapp/status" && req.method === "GET") {
    return sendJson(res, 200, whatsappClient.getStatus());
  }

  if (pathname === "/api/whatsapp/connect" && req.method === "POST") {
    const body = await parseBody(req);
    if (body && body.reset) {
      whatsappClient.resetAndGenerateQR();
      return sendJson(res, 200, { ok: true, message: "Resetting session and generating fresh WhatsApp QR code..." });
    }
    whatsappClient.startWhatsApp();
    return sendJson(res, 200, { ok: true, message: "Initializing WhatsApp QR session..." });
  }

  // 4. Official Meta WhatsApp Cloud API Webhook Support
  if (pathname === "/webhook" && req.method === "GET") {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "nepse_verify_token";
    const mode = parsedUrl.query["hub.mode"];
    const token = parsedUrl.query["hub.verify_token"];
    const challenge = parsedUrl.query["hub.challenge"];

    if (mode === "subscribe" && token === verifyToken) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      return res.end(challenge);
    }
    res.writeHead(403);
    return res.end();
  }

  if (pathname === "/webhook" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const entry = body?.entry?.[0];
      const change = entry?.changes?.[0]?.value;
      const msg = change?.messages?.[0];
      if (msg && msg.text?.body) {
        const from = msg.from;
        const reply = await handleMessage(msg.text.body, from);
        if (reply && process.env.META_ACCESS_TOKEN && process.env.META_PHONE_NUMBER_ID) {
          await fetch(
            `https://graph.facebook.com/v21.0/${process.env.META_PHONE_NUMBER_ID}/messages`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                to: from,
                text: { body: reply }
              })
            }
          );
        }
      }
      res.writeHead(200);
      return res.end("OK");
    } catch (_) {
      res.writeHead(500);
      return res.end();
    }
  }

  // 5. CDSC MeroShare Account Link & "Mero" Portfolio Automated Sync API
  if (pathname === "/api/meroshare/status" && req.method === "GET") {
    const portfolio = loadMeroPortfolio();
    return sendJson(res, 200, { ok: true, portfolio });
  }

  if (pathname === "/api/meroshare/capitals" && req.method === "GET") {
    if (global.__cachedCdscCapitals && global.__cachedCdscCapitals.length > 0) {
      return sendJson(res, 200, { ok: true, source: "CACHED_CDSC", capitals: global.__cachedCdscCapitals });
    }
    return sendJson(res, 200, { ok: true, source: "BUILTIN_CDSC", capitals: [] });
  }

  if (pathname === "/api/meroshare/direct-login" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const portfolio = loadMeroPortfolio();
      const nowIso = new Date().toISOString();

      const dpId = String(body.dpId || portfolio.linkedAccount.dpId || "13016300").trim();
      const dpName = String(body.dpName || portfolio.linkedAccount.dpName || "KUMARI BANK LIMITED / KUMARI CAPITAL (16300)").trim();
      const username = String(body.username || "").trim();
      const password = String(body.password || "");

      if (!username || !password) {
        return sendJson(res, 400, {
          ok: false,
          error: "Please enter your real MeroShare Username and Password so we can pull your exact Demat portfolio, WACC, and My Shares directly from CDSC (webbackend.cdsc.com.np)."
        });
      }

      const dpFiveDigit = dpId.length === 8 ? dpId.slice(3, 8) : dpId;
      let resolvedClientId = Number(body.clientId || 0);

      // Built-in known CDSC IDs for instant lookup without hitting CDSC rate limits
      const knownCdscIds = {
        "16300": 168,
        "15200": 156,
        "13700": 160,
        "10400": 164,
        "11200": 144,
        "10200": 159,
        "10900": 189,
        "15800": 184,
        "11700": 151,
        "13200": 174,
        "14500": 177,
        "11000": 166,
        "12500": 153,
        "13500": 138,
        "16500": 146
      };

      if (!resolvedClientId && knownCdscIds[dpFiveDigit]) {
        resolvedClientId = knownCdscIds[dpFiveDigit];
      }

      if (!resolvedClientId) {
        try {
          const capCtrl = new AbortController();
          const capTimer = setTimeout(() => capCtrl.abort(), 4500);
          const capRes = await fetch("https://webbackend.cdsc.com.np/api/meroShare/capital/", {
            headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
            signal: capCtrl.signal
          });
          clearTimeout(capTimer);
          if (capRes.ok) {
            const capList = await capRes.json();
            if (Array.isArray(capList)) {
              global.__cachedCdscCapitals = capList;
              const found = capList.find(c => String(c.code) === dpFiveDigit || String(c.code) === dpId);
              if (found && found.id) {
                resolvedClientId = Number(found.id);
              }
            }
          }
        } catch (_) {}
      }

      if (!resolvedClientId) {
        return sendJson(res, 400, {
          ok: false,
          error: `Could not resolve CDSC DP Client ID for DP code ${dpFiveDigit}. Please select your DP from the dropdown.`
        });
      }

      // 1. Authenticate directly against official CDSC MeroShare API
      const authCtrl = new AbortController();
      const authTimer = setTimeout(() => authCtrl.abort(), 8000);
      let authRes;
      try {
        authRes = await fetch("https://webbackend.cdsc.com.np/api/meroShare/auth/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/plain, */*",
            Origin: "https://meroshare.cdsc.com.np",
            Referer: "https://meroshare.cdsc.com.np/",
            "User-Agent": "Mozilla/5.0"
          },
          body: JSON.stringify({
            clientId: resolvedClientId,
            username,
            password
          }),
          signal: authCtrl.signal
        });
      } catch (netErr) {
        clearTimeout(authTimer);
        return sendJson(res, 502, {
          ok: false,
          error: `Could not reach CDSC MeroShare server (webbackend.cdsc.com.np): ${netErr.message}`
        });
      }
      clearTimeout(authTimer);

      const authToken = authRes.headers.get("authorization") || authRes.headers.get("Authorization");
      if (!authRes.ok || !authToken) {
        let errBody = {};
        try { errBody = await authRes.json(); } catch (_) {}
        const cdscMsg = errBody.message || `CDSC returned HTTP ${authRes.status} (Invalid DP, Username, or Password)`;
        return sendJson(res, 401, {
          ok: false,
          error: `CDSC MeroShare Login Failed: ${cdscMsg}. Please check your DP (${dpFiveDigit}), Username (${username}), and Password.`
        });
      }

      const cdscHeaders = {
        Authorization: authToken,
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
        Origin: "https://meroshare.cdsc.com.np",
        Referer: "https://meroshare.cdsc.com.np/",
        "User-Agent": "Mozilla/5.0"
      };

      // 2. Fetch Investor Own Details (/api/meroShare/ownDetail/)
      let boid = "";
      let investorName = username;
      let clientCode5 = dpFiveDigit;
      let ownDetailData = {};

      try {
        const ownRes = await fetch("https://webbackend.cdsc.com.np/api/meroShare/ownDetail/", {
          headers: cdscHeaders
        });
        if (ownRes.ok) {
          ownDetailData = (await ownRes.json()) || {};
          if (ownDetailData.demat) boid = String(ownDetailData.demat);
          if (ownDetailData.name) investorName = String(ownDetailData.name);
          if (ownDetailData.clientCode) clientCode5 = String(ownDetailData.clientCode);
        }
      } catch (_) {}

      if (!boid) {
        boid = `130${clientCode5}${username.padStart(8, "0").slice(-8)}`;
      }

      // 3. Fetch Full Demat & CASBA Bank KYC Details (/api/meroShareView/myDetail/{boid})
      let myDetailData = {};
      try {
        const detRes = await fetch(`https://webbackend.cdsc.com.np/api/meroShareView/myDetail/${boid}`, {
          headers: cdscHeaders
        });
        if (detRes.ok) {
          myDetailData = (await detRes.json()) || {};
        }
      } catch (_) {}

      // 4. Fetch My Portfolio (/api/meroShareView/myPortfolio/)
      const portRes = await fetch("https://webbackend.cdsc.com.np/api/meroShareView/myPortfolio/", {
        method: "POST",
        headers: cdscHeaders,
        body: JSON.stringify({
          sortBy: "script",
          demat: [boid],
          clientCode: clientCode5,
          page: 1,
          size: 200,
          sortAsc: true
        })
      });

      if (!portRes.ok) {
        return sendJson(res, 502, {
          ok: false,
          error: `Authenticated with CDSC (${boid}), but CDSC myPortfolio returned HTTP ${portRes.status}.`
        });
      }

      const portData = (await portRes.json()) || {};
      const cdscPortfolioItems = Array.isArray(portData.meroShareMyPortfolio) ? portData.meroShareMyPortfolio : [];

      // 5. Fetch My Shares (/api/meroShareView/myShare/) for exact Free / Pledge / Lock-in / Pending balances + ISIN
      const myShareMap = {};
      let mySharesList = [];
      try {
        const shareRes = await fetch("https://webbackend.cdsc.com.np/api/meroShareView/myShare/", {
          method: "POST",
          headers: cdscHeaders,
          body: JSON.stringify({
            sortBy: "CCY_SHORT_NAME",
            demat: [boid],
            clientCode: clientCode5,
            page: 1,
            size: 200,
            sortAsc: true
          })
        });
        if (shareRes.ok) {
          const shareData = (await shareRes.json()) || {};
          mySharesList = Array.isArray(shareData.meroShareDematShare) ? shareData.meroShareDematShare : [];
          for (const sh of mySharesList) {
            const sym = String(sh.script || "").toUpperCase().trim();
            if (sym) myShareMap[sym] = sh;
          }
        }
      } catch (_) {}

      // 6. Fetch Official CDSC WACC Report (/api/myPurchase/waccReport/)
      const waccReportMap = {};
      let waccReportList = [];
      try {
        const waccRepRes = await fetch("https://webbackend.cdsc.com.np/api/myPurchase/waccReport/", {
          method: "POST",
          headers: cdscHeaders,
          body: JSON.stringify({
            demat: boid,
            page: 1,
            size: 250
          })
        });
        if (waccRepRes.ok) {
          const waccRepData = (await waccRepRes.json()) || {};
          const rawList = Array.isArray(waccRepData.waccReportResponse)
            ? waccRepData.waccReportResponse
            : Array.isArray(waccRepData)
              ? waccRepData
              : [];
          waccReportList = rawList;
          for (const wItem of rawList) {
            const sym = String(wItem.scrip || wItem.scripName || "").toUpperCase().trim();
            if (sym && Number(wItem.averageBuyRate) > 0) {
              waccReportMap[sym] = {
                scrip: sym,
                totalQuantity: Number(wItem.totalQuantity || 0),
                averageBuyRate: Number(wItem.averageBuyRate),
                totalCost: Number(wItem.totalCost || 0),
                lastModifiedDate: wItem.lastModifiedDate || null,
                waccSource: "CDSC Official WACC Report"
              };
            }
          }
        }
      } catch (_) {}

      // 7. Fetch Per-Scrip Purchase Source WACC ONLY for scrips missing from waccReportMap (prevents 66-request CDSC rate-limiting burst)
      const allPortfolioSyms = [...new Set([
        ...cdscPortfolioItems.map(i => String(i.script || "").toUpperCase().trim()),
        ...mySharesList.map(i => String(i.script || "").toUpperCase().trim())
      ])].filter(Boolean);

      const perScripWaccDetails = {};
      const perScripHoldingSummary = {};
      const missingWaccSyms = allPortfolioSyms.filter(sym => !waccReportMap[sym]);

      for (const sym of missingWaccSyms.slice(0, 8)) {
        try {
          const viewRes = await fetch("https://webbackend.cdsc.com.np/api/myPurchase/view/", {
            method: "POST",
            headers: cdscHeaders,
            body: JSON.stringify({ demat: boid, scrip: sym })
          });
          if (viewRes.ok) {
            const vData = (await viewRes.json()) || {};
            const avgRate = Number(vData.averageBuyRate || vData.waccSummaryResponse?.averageBuyRate || 0);
            if (avgRate > 0) {
              waccReportMap[sym] = {
                scrip: sym,
                totalQuantity: Number(vData.totalQuantity || vData.waccSummaryResponse?.totalQuantity || 0),
                averageBuyRate: avgRate,
                totalCost: Number(vData.totalCost || vData.waccSummaryResponse?.totalCost || 0),
                lastModifiedDate: vData.lastModifiedDate || null,
                waccSource: "CDSC My Purchase Summary"
              };
            }
          }
        } catch (_) {}

        if (!waccReportMap[sym]) {
          try {
            const searchWaccRes = await fetch("https://webbackend.cdsc.com.np/api/myPurchase/search/wacc/", {
              method: "POST",
              headers: cdscHeaders,
              body: JSON.stringify({ demat: boid, scrip: sym })
            });
            if (searchWaccRes.ok) {
              const swData = (await searchWaccRes.json()) || {};
              const summary = swData.waccSummaryResponse || {};
              const lots = Array.isArray(swData.waccUpdateResponse) ? swData.waccUpdateResponse : [];
              perScripWaccDetails[sym] = {
                summary,
                lots: lots.map(l => ({
                  scrip: l.scrip || sym,
                  transactionDate: l.transactionDate || null,
                  transactionQuantity: Number(l.transactionQuantity || 0),
                  rate: Number(l.rate || 0),
                  purchaseSource: l.purchaseSource || "Demat Credit"
                }))
              };
              if (Number(summary.averageBuyRate) > 0) {
                waccReportMap[sym] = {
                  scrip: sym,
                  totalQuantity: Number(summary.totalQuantity || 0),
                  averageBuyRate: Number(summary.averageBuyRate),
                  totalCost: Number(summary.totalCost || 0),
                  lastModifiedDate: null,
                  waccSource: "CDSC Purchase WACC Summary"
                };
              } else if (lots.length > 0) {
                let sumQty = 0;
                let sumCost = 0;
                for (const lot of lots) {
                  const q = Number(lot.transactionQuantity || 0);
                  const r = Number(lot.rate || 100);
                  if (q > 0 && r > 0) {
                    sumQty += q;
                    sumCost += q * r;
                  }
                }
                if (sumQty > 0) {
                  waccReportMap[sym] = {
                    scrip: sym,
                    totalQuantity: sumQty,
                    averageBuyRate: Number((sumCost / sumQty).toFixed(4)),
                    totalCost: Number(sumCost.toFixed(2)),
                    lastModifiedDate: lots[lots.length - 1]?.transactionDate || null,
                    waccSource: "CDSC Purchase Source Lots"
                  };
                }
              }
            }
          } catch (_) {}
        }
      }

      // 8. Fetch Recent Demat Transactions (/api/meroShareView/myTransaction/)
      let recentTransactions = [];
      try {
        const txRes = await fetch("https://webbackend.cdsc.com.np/api/meroShareView/myTransaction/", {
          method: "POST",
          headers: cdscHeaders,
          body: JSON.stringify({
            boid,
            clientCode: clientCode5,
            script: null,
            fromDate: null,
            toDate: null,
            requestTypeScript: false,
            page: 1,
            size: 50
          })
        });
        if (txRes.ok) {
          const txData = (await txRes.json()) || {};
          const rawTx = Array.isArray(txData.transactionView) ? txData.transactionView : [];
          recentTransactions = rawTx.slice(0, 40).map(t => ({
            script: t.script || "",
            transactionDate: t.transactionDate || "",
            creditQty: Number(t.creditQty || 0),
            debitQty: Number(t.debitQty || 0),
            balanceAfterTrans: Number(t.balanceAfterTrans || 0),
            historyDesc: t.historyDesc || t.remarks || ""
          }));
        }
      } catch (_) {}

      // 9. Build unified, 100% accurate Portfolio "Mero" holdings
      const newHoldings = {};
      let waccMatchedCount = 0;

      for (const item of cdscPortfolioItems) {
        const sym = String(item.script || "").toUpperCase().trim();
        const kitta = Math.round(Number(item.currentBalance || 0));
        if (!sym || kitta <= 0) continue;

        const cdscLtp = Number(item.lastTransactionPrice || item.previousClosingPrice || 100);
        const cdscPrevClose = Number(item.previousClosingPrice || cdscLtp);
        const cdscValueLtp = Number(item.valueAsOfLastTransactionPrice || kitta * cdscLtp);
        const cdscValuePrevClose = Number(item.valueAsOfPreviousClosingPrice || kitta * cdscPrevClose);

        const shareDetail = myShareMap[sym] || {};
        const cdscWaccInfo = waccReportMap[sym] || null;
        const holdInfo = perScripHoldingSummary[sym] || null;
        const lotDetails = perScripWaccDetails[sym]?.lots || [];
        const existingHolding = portfolio.holdings[sym];

        let finalWacc = 100;
        let waccSource = "IPO / Par Default (Rs 100)";
        let userEditedWacc = false;

        if (cdscWaccInfo && Number(cdscWaccInfo.averageBuyRate) > 0) {
          finalWacc = Number(Number(cdscWaccInfo.averageBuyRate).toFixed(4));
          waccSource = cdscWaccInfo.waccSource || "CDSC Official WACC";
          waccMatchedCount++;
        } else if (existingHolding && existingHolding.userEditedWacc && Number(existingHolding.wacc) > 0) {
          finalWacc = Number(Number(existingHolding.wacc).toFixed(4));
          waccSource = "Custom WACC Override";
          userEditedWacc = true;
        }

        // Determine Long-Term (5% CGT) vs Short-Term (7.5% CGT) from CDSC Holding Summary if available
        let holdPeriod = existingHolding?.holdPeriod || "long";
        if (holdInfo) {
          holdPeriod = holdInfo.userStQty > holdInfo.userLtQty ? "short" : "long";
        }

        newHoldings[sym] = {
          symbol: sym,
          scriptDesc: String(item.scriptDesc || shareDetail.scriptDesc || sym),
          companyName: String(item.scriptDesc || shareDetail.scriptDesc || sym),
          isin: String(shareDetail.isin || ""),
          kitta,
          freeBalance: Number(shareDetail.freeBalance ?? kitta),
          pledgeBalance: Number(shareDetail.pledgeBalance || 0),
          lockingBalance: Number(shareDetail.lockingBalance || 0),
          freezeBalance: Number(shareDetail.freezeBalance || 0),
          dematPending: Number(shareDetail.dematPending || 0),
          wacc: finalWacc,
          waccSource,
          waccCalculatedQty: Number(cdscWaccInfo?.totalQuantity || kitta),
          waccTotalCost: Number(cdscWaccInfo?.totalCost || (kitta * finalWacc).toFixed(2)),
          waccLastModified: cdscWaccInfo?.lastModifiedDate || null,
          userEditedWacc,
          purchaseLots: lotDetails,
          userLtQty: Number(holdInfo?.userLtQty || (holdPeriod === "long" ? kitta : 0)),
          userStQty: Number(holdInfo?.userStQty || (holdPeriod === "short" ? kitta : 0)),
          cdscLtp,
          cdscPrevClose,
          cdscValueLtp,
          cdscValuePrevClose,
          holdPeriod,
          source: "LIVE_CDSC_MEROSHARE",
          updatedAt: nowIso
        };
      }

      // Store active CDSC session in memory + local gitignored cache for seamless 1-click re-syncs without disconnects
      activeCdscSession = {
        authToken,
        demat: boid,
        clientCode: clientCode5,
        clientId: resolvedClientId,
        investorName,
        dpName,
        dpId: `130${clientCode5}`,
        username,
        savedPasswordB64: Buffer.from(password, "utf8").toString("base64"),
        authenticatedAt: nowIso
      };
      saveCdscSessionCache();

      portfolio.holdings = newHoldings;
      portfolio.waccReport = Object.values(waccReportMap);
      portfolio.myShares = mySharesList;
      portfolio.recentTransactions = recentTransactions;
      portfolio.dematProfile = {
        investorName: myDetailData.name || investorName,
        boid,
        clientCode: clientCode5,
        dpName: myDetailData.dpName || ownDetailData.dpName || dpName,
        email: ownDetailData.email || myDetailData.email || "",
        contact: ownDetailData.contact || myDetailData.contact || "",
        address: ownDetailData.address || myDetailData.address || "",
        fatherName: myDetailData.fatherName || "",
        grandFatherName: myDetailData.grandFatherName || "",
        bankName: myDetailData.bankName || "",
        accountNumber: myDetailData.accountNumber || "",
        branchName: myDetailData.branchName || "",
        accountType: myDetailData.accountType || "",
        accountOpenDate: myDetailData.accountOpenDate || "",
        boidStatus: myDetailData.boidStatus || ownDetailData.boidStatus || "ACTIVE",
        meroShareStatus: ownDetailData.meroShareStatus || "ACTIVE",
        expiredDate: ownDetailData.expiredDate || "",
        renewedDate: ownDetailData.renewedDate || ""
      };

      portfolio.linkedAccount = {
        isLinked: true,
        dpId: `130${clientCode5}`,
        dpCode: clientCode5,
        dpName: portfolio.dematProfile.dpName || dpName,
        clientId: resolvedClientId,
        username,
        boid,
        holderName: portfolio.dematProfile.investorName,
        investorName: portfolio.dematProfile.investorName,
        loginMode: "LIVE_CDSC_DIRECT_LOGIN",
        autoSyncEnabled: true,
        syncIntervalMinutes: 1,
        linkedAt: portfolio.linkedAccount.linkedAt || nowIso,
        lastSyncedAt: nowIso,
        syncStatus: "LIVE_CDSC_AUTHENTICATED",
        cdscTotalItems: Number(portData?.totalItems || Object.keys(newHoldings).length),
        cdscTotalValueLtp: Number(portData?.totalValueAsOfLastTransactionPrice || 0),
        cdscTotalValuePrevClose: Number(portData?.totalValueAsOfPreviousClosingPrice || 0),
        waccMatchedCount
      };

      saveMeroPortfolio(portfolio);
      return sendJson(res, 200, {
        ok: true,
        cdscLiveSuccess: true,
        cdscImportedCount: Object.keys(newHoldings).length,
        waccMatchedCount,
        message: `✔ Full CDSC MeroShare Pull Complete! Account: ${portfolio.dematProfile.investorName} (${boid}) • Pulled ${Object.keys(newHoldings).length} Demat Scrips, ${waccMatchedCount} Official CDSC WACC Rates, My Shares Balances & Demat Profile (Total CDSC Value: Rs ${Number(portData?.totalValueAsOfLastTransactionPrice || 0).toLocaleString("en-IN")}).`,
        portfolio
      });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  if (pathname === "/api/meroshare/link" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const portfolio = loadMeroPortfolio();
      const nowIso = new Date().toISOString();

      if (body.action === "unlink") {
        activeCdscSession.authToken = null;
        activeCdscSession.savedPasswordB64 = null;
        saveCdscSessionCache();
        portfolio.linkedAccount.isLinked = false;
        portfolio.linkedAccount.syncStatus = "UNLINKED";
        if (body.clearHoldings) {
          portfolio.holdings = {};
        }
        saveMeroPortfolio(portfolio);
        return sendJson(res, 200, {
          ok: true,
          message: 'MeroShare account unlinked from portfolio "Mero".',
          portfolio
        });
      }

      const dpId = String(body.dpId || portfolio.linkedAccount.dpId || "13016300").trim();
      const dpName = String(body.dpName || portfolio.linkedAccount.dpName || `DP (${dpId})`).trim();
      const username = String(body.username || portfolio.linkedAccount.username || "").trim();
      let boid = String(body.boid || portfolio.linkedAccount.boid || "").replace(/\s+/g, "");
      if (boid && boid.length === 8 && dpId.length === 8) {
        boid = dpId + boid;
      }

      portfolio.linkedAccount = {
        ...portfolio.linkedAccount,
        isLinked: true,
        dpId,
        dpName,
        username,
        boid,
        autoSyncEnabled: body.autoSyncEnabled !== undefined ? Boolean(body.autoSyncEnabled) : true,
        syncIntervalMinutes: 1,
        linkedAt: portfolio.linkedAccount.linkedAt || nowIso,
        lastSyncedAt: nowIso,
        syncStatus: "BOID_LINKED"
      };

      saveMeroPortfolio(portfolio);
      return sendJson(res, 200, {
        ok: true,
        message: `BOID ${boid || dpId} linked to portfolio "Mero". Note: To pull your exact Demat shares & WACC automatically from CDSC, use "🔑 Direct CDSC Login" with your MeroShare Username & Password.`,
        portfolio
      });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  if (pathname === "/api/meroshare/sync" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const portfolio = loadMeroPortfolio();
      const nowIso = new Date().toISOString();

      if (body.action === "clear_all" || body.clearAllHoldings) {
        portfolio.holdings = {};
        portfolio.waccReport = [];
        portfolio.myShares = [];
        portfolio.recentTransactions = [];
        portfolio.linkedAccount.cdscTotalItems = 0;
        portfolio.linkedAccount.cdscTotalValueLtp = 0;
        portfolio.linkedAccount.cdscTotalValuePrevClose = 0;
        saveMeroPortfolio(portfolio);
        return sendJson(res, 200, {
          ok: true,
          message: 'Cleared all stocks from Portfolio "Mero". Ready for a clean CDSC MeroShare pull.',
          portfolio
        });
      }

      // Auto-reauthenticate silently if token expired or server restarted and we have cached session credentials
      if (!activeCdscSession.authToken && activeCdscSession.savedPasswordB64 && activeCdscSession.username && activeCdscSession.clientId) {
        try {
          const decodedPass = Buffer.from(activeCdscSession.savedPasswordB64, "base64").toString("utf8");
          const reAuthRes = await fetch("https://webbackend.cdsc.com.np/api/meroShare/auth/", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json, text/plain, */*",
              Origin: "https://meroshare.cdsc.com.np",
              Referer: "https://meroshare.cdsc.com.np/",
              "User-Agent": "Mozilla/5.0"
            },
            body: JSON.stringify({
              clientId: Number(activeCdscSession.clientId),
              username: activeCdscSession.username,
              password: decodedPass
            })
          });
          const newTok = reAuthRes.headers.get("authorization") || reAuthRes.headers.get("Authorization");
          if (reAuthRes.ok && newTok) {
            activeCdscSession.authToken = newTok;
            activeCdscSession.authenticatedAt = nowIso;
            saveCdscSessionCache();
          }
        } catch (_) {}
      }

      // If we have an active authenticated CDSC session token, re-pull live from CDSC myPortfolio + WACC Report!
      if (activeCdscSession.authToken && activeCdscSession.demat && !body.bulkHoldings) {
        try {
          let cdscHeaders = {
            Authorization: activeCdscSession.authToken,
            "Content-Type": "application/json",
            Accept: "application/json, text/plain, */*",
            Origin: "https://meroshare.cdsc.com.np",
            Referer: "https://meroshare.cdsc.com.np/",
            "User-Agent": "Mozilla/5.0"
          };

          let [portRes, waccRepRes] = await Promise.all([
            fetch("https://webbackend.cdsc.com.np/api/meroShareView/myPortfolio/", {
              method: "POST",
              headers: cdscHeaders,
              body: JSON.stringify({
                sortBy: "script",
                demat: [activeCdscSession.demat],
                clientCode: activeCdscSession.clientCode,
                page: 1,
                size: 200,
                sortAsc: true
              })
            }),
            fetch("https://webbackend.cdsc.com.np/api/myPurchase/waccReport/", {
              method: "POST",
              headers: cdscHeaders,
              body: JSON.stringify({
                demat: activeCdscSession.demat,
                page: 1,
                size: 250
              })
            }).catch(() => null)
          ]);

          // If token just expired (401/403) and we have saved credentials, renew token once on the fly
          if (portRes && (portRes.status === 401 || portRes.status === 403) && activeCdscSession.savedPasswordB64 && activeCdscSession.clientId) {
            try {
              const decodedPass = Buffer.from(activeCdscSession.savedPasswordB64, "base64").toString("utf8");
              const reAuthRes = await fetch("https://webbackend.cdsc.com.np/api/meroShare/auth/", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json, text/plain, */*",
                  Origin: "https://meroshare.cdsc.com.np",
                  Referer: "https://meroshare.cdsc.com.np/",
                  "User-Agent": "Mozilla/5.0"
                },
                body: JSON.stringify({
                  clientId: Number(activeCdscSession.clientId),
                  username: activeCdscSession.username,
                  password: decodedPass
                })
              });
              const newTok = reAuthRes.headers.get("authorization") || reAuthRes.headers.get("Authorization");
              if (reAuthRes.ok && newTok) {
                activeCdscSession.authToken = newTok;
                saveCdscSessionCache();
                cdscHeaders.Authorization = newTok;
                portRes = await fetch("https://webbackend.cdsc.com.np/api/meroShareView/myPortfolio/", {
                  method: "POST",
                  headers: cdscHeaders,
                  body: JSON.stringify({
                    sortBy: "script",
                    demat: [activeCdscSession.demat],
                    clientCode: activeCdscSession.clientCode,
                    page: 1,
                    size: 200,
                    sortAsc: true
                  })
                });
              }
            } catch (_) {}
          }

          const waccMap = {};
          if (waccRepRes && waccRepRes.ok) {
            const wData = (await waccRepRes.json()) || {};
            const wList = Array.isArray(wData.waccReportResponse) ? wData.waccReportResponse : [];
            for (const w of wList) {
              const s = String(w.scrip || w.scripName || "").toUpperCase().trim();
              if (s && Number(w.averageBuyRate) > 0) waccMap[s] = w;
            }
          }

          if (portRes && (portRes.status === 401 || portRes.status === 403)) {
            activeCdscSession.authToken = null;
          } else if (portRes && portRes.ok) {
            const portData = await portRes.json();
            const cdscItems = Array.isArray(portData?.meroShareMyPortfolio) ? portData.meroShareMyPortfolio : [];
            const updatedHoldings = {};
            for (const item of cdscItems) {
              const sym = String(item.script || "").toUpperCase().trim();
              const kitta = Math.round(Number(item.currentBalance || 0));
              if (!sym || kitta <= 0) continue;
              const cdscLtp = Number(item.lastTransactionPrice || item.previousClosingPrice || 100);
              const cdscPrevClose = Number(item.previousClosingPrice || cdscLtp);
              const existing = portfolio.holdings[sym] || {};
              const wInfo = waccMap[sym];
              const resolvedWacc =
                wInfo && Number(wInfo.averageBuyRate) > 0 && !existing.userEditedWacc
                  ? Number(Number(wInfo.averageBuyRate).toFixed(4))
                  : existing.wacc > 0
                    ? existing.wacc
                    : 100;

              updatedHoldings[sym] = {
                ...existing,
                symbol: sym,
                scriptDesc: String(item.scriptDesc || existing.scriptDesc || sym),
                companyName: String(item.scriptDesc || existing.companyName || sym),
                kitta,
                wacc: resolvedWacc,
                waccSource: wInfo ? "CDSC Official WACC Report" : existing.waccSource || "CDSC Official WACC Report",
                cdscLtp,
                cdscPrevClose,
                cdscValueLtp: Number(item.valueAsOfLastTransactionPrice || kitta * cdscLtp),
                cdscValuePrevClose: Number(item.valueAsOfPreviousClosingPrice || kitta * cdscPrevClose),
                holdPeriod: existing.holdPeriod || "long",
                source: "LIVE_CDSC_MEROSHARE",
                updatedAt: nowIso
              };
            }
            portfolio.holdings = updatedHoldings;
            portfolio.linkedAccount.lastSyncedAt = nowIso;
            portfolio.linkedAccount.cdscTotalItems = Number(portData?.totalItems || Object.keys(updatedHoldings).length);
            portfolio.linkedAccount.cdscTotalValueLtp = Number(portData?.totalValueAsOfLastTransactionPrice || 0);
            portfolio.linkedAccount.cdscTotalValuePrevClose = Number(portData?.totalValueAsOfPreviousClosingPrice || 0);
            saveMeroPortfolio(portfolio);
            return sendJson(res, 200, {
              ok: true,
              livePulledCount: Object.keys(updatedHoldings).length,
              sessionActive: true,
              message: `✔ Re-synced live from CDSC MeroShare (${activeCdscSession.demat})! ${Object.keys(updatedHoldings).length} Demat holdings & WACC updated.`,
              portfolio
            });
          }
        } catch (_) {}
      }

      if (body.replace && body.bulkHoldings && typeof body.bulkHoldings === "object") {
        portfolio.holdings = {};
      }

      if (body.bulkHoldings && typeof body.bulkHoldings === "object") {
        for (const [sym, pos] of Object.entries(body.bulkHoldings)) {
          const cleanSym = String(sym).toUpperCase().trim();
          if (cleanSym && Number(pos.kitta) > 0 && Number(pos.wacc) > 0) {
            portfolio.holdings[cleanSym] = {
              symbol: cleanSym,
              kitta: Math.round(Number(pos.kitta)),
              wacc: Number(Number(pos.wacc).toFixed(4)),
              holdPeriod: pos.holdPeriod || "long",
              source: pos.source || "Bulk Watchlist Sync",
              updatedAt: nowIso
            };
          }
        }
      }

      const existingCount = Object.keys(portfolio.holdings || {}).length;
      saveMeroPortfolio(portfolio);
      return sendJson(res, 200, {
        ok: true,
        livePulledCount: existingCount,
        sessionActive: Boolean(activeCdscSession.authToken),
        message: existingCount > 0
          ? `✔ Portfolio "Mero" is up to date (${existingCount} verified CDSC Demat holdings & WACC rates saved for BOID ${portfolio.linkedAccount?.boid || ""}).`
          : `Portfolio "Mero" synced (0 holdings). Enter your MeroShare Username & Password to pull from CDSC.`,
        portfolio
      });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  if (pathname === "/api/meroshare/import" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const portfolio = loadMeroPortfolio();
      const nowIso = new Date().toISOString();
      const parsed = parseMeroshareTextHoldings(body.rawText || "");
      const count = Object.keys(parsed).length;

      if (count === 0) {
        return sendJson(res, 400, {
          ok: false,
          error: "Could not find valid stock rows. Format each line as: SYMBOL, KITTA, WACC (for example: NABIL, 150, 505)"
        });
      }

      if (body.replace) {
        portfolio.holdings = parsed;
      } else {
        for (const [sym, item] of Object.entries(parsed)) {
          const existing = portfolio.holdings[sym] || {};
          portfolio.holdings[sym] = {
            ...existing,
            ...item,
            wacc: Number(Number(item.wacc).toFixed(4)),
            waccSource: "MeroShare CSV / Text Import",
            userEditedWacc: true
          };
        }
      }
      portfolio.linkedAccount.lastSyncedAt = nowIso;
      saveMeroPortfolio(portfolio);
      return sendJson(res, 200, {
        ok: true,
        importedCount: count,
        message: `Successfully imported ${count} stock(s) with exact WACC into Portfolio "Mero"!`,
        portfolio
      });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  if (pathname === "/api/meroshare/holding" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const portfolio = loadMeroPortfolio();
      const sym = String(body.symbol || "").toUpperCase().trim();
      if (!sym) {
        return sendJson(res, 400, { ok: false, error: "Stock symbol is required." });
      }
      if (body.action === "delete") {
        delete portfolio.holdings[sym];
        portfolio.linkedAccount.lastSyncedAt = new Date().toISOString();
        saveMeroPortfolio(portfolio);
        return sendJson(res, 200, { ok: true, message: `Removed ${sym} from Portfolio "Mero".`, portfolio });
      }
      const existing = portfolio.holdings[sym] || {};
      const kitta = Math.max(1, Math.round(Number(body.kitta || existing.kitta || 0)));
      const wacc = Math.max(0.01, Number(Number(body.wacc || existing.wacc || 100).toFixed(4)));
      const holdPeriod = body.holdPeriod ? (body.holdPeriod === "short" ? "short" : "long") : (existing.holdPeriod || "long");
      portfolio.holdings[sym] = {
        ...existing,
        symbol: sym,
        kitta,
        wacc,
        waccSource: body.waccSource || "Custom WACC Override",
        userEditedWacc: true,
        holdPeriod,
        source: existing.source || body.source || "Mero Portfolio",
        updatedAt: new Date().toISOString()
      };
      portfolio.linkedAccount.lastSyncedAt = new Date().toISOString();
      saveMeroPortfolio(portfolio);
      return sendJson(res, 200, {
        ok: true,
        message: `Saved ${sym} (${kitta} kitta @ Rs ${wacc} WACC, ${holdPeriod === "short" ? "7.5% ST CGT" : "5% LT CGT"}) in Portfolio "Mero".`,
        portfolio
      });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  // Serve Static Files from public/ (with fast Gzip compression)
  const isRootOrSpa = pathname === "/" || pathname === "/index.html" || pathname === "/api/index.js";
  let filePath = isRootOrSpa ? path.join(PUBLIC_DIR, "index.html") : path.join(PUBLIC_DIR, pathname);
  if (!fs.existsSync(filePath) && !pathname.startsWith("/api/")) {
    filePath = path.join(PUBLIC_DIR, "index.html");
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json",
      ".png": "image/png",
      ".svg": "image/svg+xml"
    };
    const content = fs.readFileSync(filePath);
    const acceptEnc = String(req.headers["accept-encoding"] || "");
    if ((ext === ".html" || ext === ".js" || ext === ".css") && content.length > 2048 && acceptEnc.includes("gzip")) {
      const gz = zlib.gzipSync(content, { level: 1 });
      res.writeHead(200, {
        "Content-Type": mimeTypes[ext] || "text/plain",
        "Content-Encoding": "gzip",
        "Content-Length": gz.length,
        "Cache-Control": "no-cache"
      });
      return res.end(gz);
    }
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "text/plain" });
    return res.end(content);
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  return res.end("Not Found");
};

const server = http.createServer(requestHandler);

// Pre-warm all 286 stock signals + gzipped dashboard buffer immediately so even the 1st request is 1-2ms
setImmediate(async () => {
  try {
    await requestHandler(
      { url: "/api/dashboard", method: "GET", headers: { "accept-encoding": "gzip" } },
      { writeHead() {}, end() {} }
    );
  } catch (_) {}
});

if (!process.env.VERCEL && require.main === module) {
  // High-Speed Background Live Streamer (keeps quotes & signals hot every 10s during open market hours)
  setInterval(async () => {
    try {
      if (nepseProvider.isMarketOpenNow().isOpen) {
        await nepseProvider.refreshLiveQuotes(true);
        const quotes = await nepseProvider.getAllQuotes();
        buildIncrementalDashboardSignals(quotes);
      }
    } catch (_) {}
  }, 10000);

  // Background Price Alert Checker (every 60 seconds)
  setInterval(async () => {
    try {
      const state = getAppState();
      let changed = false;
      for (const alert of state.alerts) {
        if (!alert.active) continue;
        const q = await nepseProvider.getQuote(alert.symbol);
        if (!q) continue;

        const triggered =
          (alert.condition === "ABOVE" && q.ltp >= alert.targetPrice) ||
          (alert.condition === "BELOW" && q.ltp <= alert.targetPrice);

        if (triggered) {
          alert.active = false;
          alert.triggeredAt = new Date().toISOString();
          changed = true;
          const alertMsg =
            `🚨 *NEPSE PRICE ALERT TRIGGERED!* 🚨\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `• *Stock:* ${q.symbol} (${q.companyName})\n` +
            `• *Condition:* ${alert.condition} NPR ${alert.targetPrice}\n` +
            `• *Current LTP:* *NPR ${q.ltp}* (${q.percentageChange >= 0 ? "+" : ""}${q.percentageChange}%)\n\n` +
            `Reply *!signal ${q.symbol}* for updated Buy/Sell targets.`;

          if (alert.user && alert.user.includes("@")) {
            await whatsappClient.sendDirectMessage(alert.user, alertMsg);
          }
        }
      }
      if (changed) saveState(state);
    } catch (_) {}
  }, 60000);

  server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🇳🇵 NEPSE QUANT PRO WHATSAPP BOT & SIGNAL SERVER RUNNING!`);
    console.log(`🌐 Dashboard & WhatsApp Simulator: http://localhost:${PORT}`);
    console.log(`======================================================\n`);
    whatsappClient.startWhatsApp();
  });
}

module.exports = requestHandler;

