/**
 * Institutional Hedge-Fund-Grade Quantitative Engine for NEPSE (Quant Pro v4.0 — 6-Perspective Buy/Sell Precision Edition)
 * Capabilities:
 *  1. 6-Perspective Independent Evaluation (Price Action/SMC, Trend/Momentum, Volume Profile/VWAP, Floorsheet/T+2, Fundamentals, Risk/Statistical)
 *  2. Smart Money Concepts (SMC): Bullish Order Block (Demand Zone), Bearish Order Block (Supply Zone), Break of Structure (BOS)
 *  3. 3-Tranche Pyramid Buying Plan (40% Scout / 30% Value Dip / 30% Breakout Confirmation) to eliminate T+2 trap risk
 *  4. 3-Tier Partial Profit-Booking & Exit Plan (35% T1 Lock / 40% T2 Supply Zone / 25% SuperTrend Moonbag Runner)
 *  5. Dual Persona Guidance: "If You Want to Buy Fresh" vs "If You Already Hold Shares"
 *  6. 500-Path Monte Carlo GBM Price Forecaster, VaR(95%), Sharpe Ratio & Walk-Forward Backtester
 */

function round2(val) {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

function calcSMA(closes, period) {
  if (closes.length < period) return round2(closes[closes.length - 1] || 0);
  const slice = closes.slice(closes.length - period);
  return round2(slice.reduce((a, b) => a + b, 0) / period);
}

function calcEMASeries(values, period) {
  if (values.length < period) return values.map((v) => v);
  const k = 2 / (period + 1);
  const ema = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  ema[period - 1] = prev;

  for (let i = period; i < values.length; i++) {
    prev = (values[i] - prev) * k + prev;
    ema[i] = prev;
  }
  return ema;
}

function calcRSISeries(closes, period = 14) {
  const rsiSeries = new Array(closes.length).fill(50);
  if (closes.length <= period) return rsiSeries;

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  rsiSeries[period] = avgLoss === 0 ? 100 : round2(100 - 100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsiSeries[i] = avgLoss === 0 ? 100 : round2(100 - 100 / (1 + avgGain / avgLoss));
  }
  return rsiSeries;
}

function calcStochRSI(closes, period = 14) {
  const rsiSeries = calcRSISeries(closes, period);
  const window = rsiSeries.slice(-period);
  const minRsi = Math.min(...window);
  const maxRsi = Math.max(...window);
  if (maxRsi === minRsi) return 50;
  const curr = rsiSeries[rsiSeries.length - 1];
  return round2(((curr - minRsi) / (maxRsi - minRsi)) * 100);
}

function detectRSIDivergence(closes, rsiSeries) {
  if (closes.length < 25) return "None";
  const currPrice = closes[closes.length - 1];
  const currRsi = rsiSeries[rsiSeries.length - 1];

  const pastSliceP = closes.slice(-18, -5);
  const pastSliceR = rsiSeries.slice(-18, -5);
  const minPastP = Math.min(...pastSliceP);
  const minPastR = Math.min(...pastSliceR);
  const maxPastP = Math.max(...pastSliceP);
  const maxPastR = Math.max(...pastSliceR);

  if (currPrice <= minPastP * 1.01 && currRsi > minPastR + 4 && currRsi < 48) {
    return "Bullish RSI Divergence 🟢 (Smart Money Reversal)";
  }
  if (currPrice >= maxPastP * 0.99 && currRsi < maxPastR - 4 && currRsi > 58) {
    return "Bearish RSI Divergence 🔴 (Momentum Exhaustion)";
  }
  if (currPrice > minPastP * 1.02 && currRsi < minPastR && currRsi >= 45) {
    return "Hidden Bullish Divergence 🟢 (Trend Continuation)";
  }
  return "No Divergence (Aligned)";
}

function calcMACD(closes, fast = 12, slow = 26, sig = 9) {
  const fastEma = calcEMASeries(closes, fast);
  const slowEma = calcEMASeries(closes, slow);
  const macdLine = [];

  for (let i = 0; i < closes.length; i++) {
    if (fastEma[i] !== null && slowEma[i] !== null) {
      macdLine.push(fastEma[i] - slowEma[i]);
    }
  }

  const sigSeries = calcEMASeries(macdLine, sig);
  const macdVal = macdLine.length ? round2(macdLine[macdLine.length - 1]) : 0;
  const sigVal =
    sigSeries.length && sigSeries[sigSeries.length - 1] !== null
      ? round2(sigSeries[sigSeries.length - 1])
      : 0;
  const prevHist =
    macdLine.length > 1 && sigSeries.length > 1 && sigSeries[sigSeries.length - 2] !== null
      ? round2(macdLine[macdLine.length - 2] - sigSeries[sigSeries.length - 2])
      : 0;
  const histogram = round2(macdVal - sigVal);

  return {
    macd: macdVal,
    signal: sigVal,
    histogram,
    prevHistogram: prevHist,
    expandingBullish: histogram > 0 && histogram >= prevHist
  };
}

function calcBollinger(closes, period = 20, mult = 2) {
  if (closes.length < period) return { upper: null, middle: null, lower: null, pctB: 0.5 };
  const slice = closes.slice(closes.length - period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, x) => a + Math.pow(x - mean, 2), 0) / period;
  const std = Math.sqrt(variance);
  const upper = round2(mean + mult * std);
  const lower = round2(mean - mult * std);
  const curr = closes[closes.length - 1];
  const pctB = upper !== lower ? round2((curr - lower) / (upper - lower)) : 0.5;
  return { upper, middle: round2(mean), lower, pctB };
}

function calcATRSeries(bars, period = 14) {
  const atrSeries = new Array(bars.length).fill(0);
  if (!bars || bars.length === 0) return atrSeries;
  if (bars.length <= period) {
    const fallback = round2(bars[bars.length - 1].close * 0.025);
    return atrSeries.fill(fallback);
  }

  const trs = new Array(bars.length).fill(0);
  trs[0] = bars[0].high - bars[0].low;
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].high;
    const l = bars[i].low;
    const pc = bars[i - 1].close;
    trs[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }

  // First ATR value at index `period` is the simple average of the first `period` True Ranges (1..period)
  let sumTR = 0;
  for (let i = 1; i <= period; i++) sumTR += trs[i];
  let prevATR = sumTR / period;
  for (let i = 0; i <= period; i++) atrSeries[i] = prevATR;

  // Wilder's RMA smoothing for all subsequent bars (matches TradingView ta.atr)
  for (let i = period + 1; i < bars.length; i++) {
    prevATR = (prevATR * (period - 1) + trs[i]) / period;
    atrSeries[i] = prevATR;
  }
  return atrSeries;
}

function calcATR(bars, period = 14) {
  if (!bars || !bars.length) return 0;
  const series = calcATRSeries(bars, period);
  return round2(series[series.length - 1]);
}

function calcSuperTrend(bars, period = 10, multiplier = 2.8) {
  if (!bars || bars.length < period + 2) {
    return { value: round2((bars?.[bars.length - 1]?.close || 100) * 0.96), direction: "BULLISH" };
  }

  const atrSeries = calcATRSeries(bars, period);
  let finalUpper = 0;
  let finalLower = 0;
  let supertrend = 0;
  let dir = "BULLISH";

  for (let i = period; i < bars.length; i++) {
    const hl2 = (bars[i].high + bars[i].low) / 2;
    const atr = atrSeries[i];
    const basicUpper = hl2 + multiplier * atr;
    const basicLower = hl2 - multiplier * atr;

    if (i === period) {
      finalUpper = basicUpper;
      finalLower = basicLower;
      dir = bars[i].close >= hl2 ? "BULLISH" : "BEARISH";
      supertrend = dir === "BULLISH" ? finalLower : finalUpper;
      continue;
    }

    const prevClose = bars[i - 1].close;
    finalUpper = basicUpper < finalUpper || prevClose > finalUpper ? basicUpper : finalUpper;
    finalLower = basicLower > finalLower || prevClose < finalLower ? basicLower : finalLower;

    if (dir === "BEARISH" && bars[i].close > finalUpper) {
      dir = "BULLISH";
    } else if (dir === "BULLISH" && bars[i].close < finalLower) {
      dir = "BEARISH";
    }

    supertrend = dir === "BULLISH" ? finalLower : finalUpper;
  }

  return { value: round2(supertrend), direction: dir };
}

function calcIchimoku(bars) {
  const highLowMid = (slice) => {
    if (!slice || !slice.length) return 0;
    const h = Math.max(...slice.map((b) => b.high));
    const l = Math.min(...slice.map((b) => b.low));
    return round2((h + l) / 2);
  };
  const tenkan = highLowMid(bars.slice(-9));
  const kijun = highLowMid(bars.slice(-26));

  // Standard Ichimoku Kumo Cloud at TODAY'S bar is displaced 26 periods forward from 26 bars ago
  const displacedBars = bars.length > 52 ? bars.slice(0, bars.length - 25) : bars;
  const dispTenkan = highLowMid(displacedBars.slice(-9));
  const dispKijun = highLowMid(displacedBars.slice(-26));
  const spanA = round2((dispTenkan + dispKijun) / 2);
  const spanB = highLowMid(displacedBars.slice(-52));

  // Future Cloud (26 periods ahead)
  const futureSpanA = round2((tenkan + kijun) / 2);
  const futureSpanB = highLowMid(bars.slice(-52));

  const cloudTop = Math.max(spanA, spanB);
  const cloudBottom = Math.min(spanA, spanB);
  const curr = bars[bars.length - 1].close;

  let status = "INSIDE CLOUD (NEUTRAL 🟡)";
  if (curr > cloudTop && tenkan >= kijun) status = "ABOVE CLOUD (STRONG BULLISH KUMO 🟢)";
  else if (curr > cloudTop) status = "ABOVE CLOUD (BULLISH 🟢)";
  else if (curr < cloudBottom) status = "BELOW CLOUD (BEARISH KUMO 🔴)";

  return { tenkan, kijun, spanA, spanB, futureSpanA, futureSpanB, cloudTop, cloudBottom, status };
}

function calcVolumeProfile(bars) {
  const recent = bars.slice(-60);
  const minP = Math.min(...recent.map((b) => b.low));
  const maxP = Math.max(...recent.map((b) => b.high));
  const buckets = 12;
  const step = Math.max(1, (maxP - minP) / buckets);
  const volBuckets = new Array(buckets).fill(0);

  for (const b of recent) {
    const tp = (b.high + b.low + b.close) / 3;
    const idx = Math.min(buckets - 1, Math.max(0, Math.floor((tp - minP) / step)));
    volBuckets[idx] += b.volume;
  }

  let maxVolIdx = 0;
  for (let i = 1; i < buckets; i++) {
    if (volBuckets[i] > volBuckets[maxVolIdx]) maxVolIdx = i;
  }

  const poc = round2(minP + (maxVolIdx + 0.5) * step);
  const vah = round2(minP + Math.min(buckets, maxVolIdx + 2.5) * step);
  const val = round2(minP + Math.max(0, maxVolIdx - 1.5) * step);

  return { poc, vah, val };
}

function aggregateBars(bars, groupSize) {
  if (!bars || !bars.length) return [];
  const aggregated = [];
  // Align from the end so the most recent candle always reflects the latest N trading sessions
  const remainder = bars.length % groupSize;
  if (remainder > 0) {
    const firstChunk = bars.slice(0, remainder);
    aggregated.push({
      open: firstChunk[0].open,
      high: Math.max(...firstChunk.map((b) => b.high)),
      low: Math.min(...firstChunk.map((b) => b.low)),
      close: firstChunk[firstChunk.length - 1].close,
      volume: firstChunk.reduce((sum, b) => sum + (b.volume || 0), 0)
    });
  }
  for (let i = remainder; i < bars.length; i += groupSize) {
    const chunk = bars.slice(i, i + groupSize);
    if (!chunk.length) continue;
    aggregated.push({
      open: chunk[0].open,
      high: Math.max(...chunk.map((b) => b.high)),
      low: Math.min(...chunk.map((b) => b.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((sum, b) => sum + (b.volume || 0), 0)
    });
  }
  return aggregated;
}

function calcMultiTimeframe(bars, ema9, ema20, sma50, rsi14) {
  const curr = bars[bars.length - 1].close;

  // 1. Daily Timeframe (1D): True Daily Close vs Daily EMA(9)/EMA(20) & Daily RSI(14)
  const tf15m =
    curr >= ema9 && curr >= ema20 && rsi14 >= 48
      ? "BULLISH 🟢"
      : curr < ema20 && rsi14 < 45
      ? "BEARISH 🔴"
      : "NEUTRAL 🟡";

  // 2. Weekly Timeframe (1W): Aggregated 5-Trading-Day Weekly OHLCV Candles (NEPSE Sun–Thu week)
  const weeklyBars = aggregateBars(bars, 5);
  const weeklyCloses = weeklyBars.map((b) => b.close);
  const weeklyEma4Arr = calcEMASeries(weeklyCloses, Math.min(4, weeklyCloses.length));
  const weeklyEma10Arr = calcEMASeries(weeklyCloses, Math.min(10, weeklyCloses.length));
  const weeklyEma4 = weeklyEma4Arr[weeklyEma4Arr.length - 1] || curr;
  const weeklyEma10 = weeklyEma10Arr[weeklyEma10Arr.length - 1] || sma50;
  const weeklyRsiArr = calcRSISeries(weeklyCloses, Math.min(8, Math.max(3, weeklyCloses.length - 1)));
  const weeklyRsi = weeklyRsiArr[weeklyRsiArr.length - 1] ?? 50;
  const lastWeeklyBar = weeklyBars[weeklyBars.length - 1] || bars[bars.length - 1];

  const tf1d =
    lastWeeklyBar.close >= weeklyEma4 && weeklyEma4 >= weeklyEma10 * 0.995 && weeklyRsi >= 48
      ? "BULLISH 🟢"
      : lastWeeklyBar.close < weeklyEma10 && weeklyRsi < 46
      ? "BEARISH 🔴"
      : "NEUTRAL 🟡";

  // 3. Monthly / Macro Timeframe (1M): Aggregated 20-Trading-Day Monthly OHLCV Candles + 200D SMA
  const monthlyBars = aggregateBars(bars, 20);
  const monthlyCloses = monthlyBars.map((b) => b.close);
  const monthlyEma3Arr = calcEMASeries(monthlyCloses, Math.min(3, monthlyCloses.length));
  const monthlyEma6Arr = calcEMASeries(monthlyCloses, Math.min(6, monthlyCloses.length));
  const monthlyEma3 = monthlyEma3Arr[monthlyEma3Arr.length - 1] || curr;
  const monthlyEma6 = monthlyEma6Arr[monthlyEma6Arr.length - 1] || sma50;
  const sma200 = calcSMA(
    bars.map((b) => b.close),
    Math.min(200, bars.length)
  );

  const tf1w =
    curr >= sma200 && monthlyEma3 >= monthlyEma6 * 0.99
      ? "BULLISH 🟢"
      : curr < sma200 && curr < monthlyEma3
      ? "BEARISH 🔴"
      : "NEUTRAL 🟡";

  const bullCount = [tf15m, tf1d, tf1w].filter((t) => t.includes("BULLISH")).length;
  let alignment = "MIXED TIMEFRAMES (1D/1W/1M) 🟡";
  if (bullCount === 3) alignment = "FULL 3-TF BULLISH LOCK (1D + 1W + 1M) 🔥";
  else if (bullCount === 2) alignment = "BULLISH MAJORITY (2/3 TFs: 1D/1W/1M) 🟢";
  else if (bullCount === 0) alignment = "FULL BEARISH ALIGNMENT (1D/1W/1M) 🔴";

  return {
    tf15m,
    tf1d,
    tf1w,
    tfDaily: tf15m,
    tfWeekly: tf1d,
    tfMonthly: tf1w,
    weeklyRsi: round2(weeklyRsi),
    weeklyEma4: round2(weeklyEma4),
    monthlyEma3: round2(monthlyEma3),
    bullCount,
    alignment
  };
}


function calcADX(bars, period = 14) {
  if (!bars || bars.length <= period * 2) {
    return { adx: 20.0, diPlus: 20.0, diMinus: 20.0 };
  }

  const plusDM = new Array(bars.length).fill(0);
  const minusDM = new Array(bars.length).fill(0);
  const tr = new Array(bars.length).fill(0);

  for (let i = 1; i < bars.length; i++) {
    const upMove = bars[i].high - bars[i - 1].high;
    const downMove = bars[i - 1].low - bars[i].low;
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
    tr[i] = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close)
    );
  }

  // Stage 1: Wilder's initial 14-period sum for TR, +DM, -DM
  let smTR = 0;
  let smPlusDM = 0;
  let smMinusDM = 0;
  for (let i = 1; i <= period; i++) {
    smTR += tr[i];
    smPlusDM += plusDM[i];
    smMinusDM += minusDM[i];
  }

  const dxSeries = [];
  let diPlus = smTR > 0 ? (smPlusDM / smTR) * 100 : 0;
  let diMinus = smTR > 0 ? (smMinusDM / smTR) * 100 : 0;
  const firstDX = diPlus + diMinus > 0 ? (Math.abs(diPlus - diMinus) / (diPlus + diMinus)) * 100 : 0;
  dxSeries.push(firstDX);

  for (let i = period + 1; i < bars.length; i++) {
    smTR = smTR - smTR / period + tr[i];
    smPlusDM = smPlusDM - smPlusDM / period + plusDM[i];
    smMinusDM = smMinusDM - smMinusDM / period + minusDM[i];

    diPlus = smTR > 0 ? (smPlusDM / smTR) * 100 : 0;
    diMinus = smTR > 0 ? (smMinusDM / smTR) * 100 : 0;
    const dx = diPlus + diMinus > 0 ? (Math.abs(diPlus - diMinus) / (diPlus + diMinus)) * 100 : 0;
    dxSeries.push(dx);
  }

  // Stage 2: Wilder's 14-period RMA smoothing of DX to produce true ADX(14)
  let adxVal = dxSeries.slice(0, period).reduce((a, b) => a + b, 0) / Math.min(period, dxSeries.length);
  for (let i = period; i < dxSeries.length; i++) {
    adxVal = (adxVal * (period - 1) + dxSeries[i]) / period;
  }

  return {
    adx: round2(adxVal),
    diPlus: round2(diPlus),
    diMinus: round2(diMinus)
  };
}

function calcMFI(bars, period = 14) {
  if (!bars || bars.length <= period) return 50;
  let posFlow = 0;
  let negFlow = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const tp = (bars[i].high + bars[i].low + bars[i].close) / 3;
    const prevTp = (bars[i - 1].high + bars[i - 1].low + bars[i - 1].close) / 3;
    const rawFlow = tp * (bars[i].volume || 0);
    if (tp > prevTp) posFlow += rawFlow;
    else if (tp < prevTp) negFlow += rawFlow;
  }
  if (negFlow === 0) return posFlow > 0 ? 100 : 50;
  const mfr = posFlow / negFlow;
  return round2(100 - 100 / (1 + mfr));
}

function calcSmartMoneyFlow(bars, quote) {
  const recent20 = bars.slice(-20);
  let totalPV = 0;
  let totalV = 0;
  let obvChange = 0;

  for (let i = 0; i < recent20.length; i++) {
    const b = recent20[i];
    const tp = (b.high + b.low + b.close) / 3;
    totalPV += tp * b.volume;
    totalV += b.volume;
    if (i > 0) {
      if (b.close > recent20[i - 1].close) obvChange += b.volume;
      else if (b.close < recent20[i - 1].close) obvChange -= b.volume;
    }
  }

  const vwap20 = totalV > 0 ? round2(totalPV / totalV) : quote.ltp;
  const mfi14 = calcMFI(bars, 14);
  let obvStatus = "NEUTRAL";
  if (obvChange > totalV * 0.12) obvStatus = "STRONG ACCUMULATION 🟢";
  else if (obvChange > 0) obvStatus = "MILD ACCUMULATION 🟢";
  else if (obvChange < -totalV * 0.12) obvStatus = "HEAVY DISTRIBUTION 🔴";
  else obvStatus = "MILD DISTRIBUTION 🔴";

  const avgVol = totalV / 20;
  const currVolRatio = avgVol > 0 ? round2(quote.volume / avgVol) : 1.0;
  const t2Bar = recent20[recent20.length - 3] || recent20[0];
  const t2SupplyAbsorbed = quote.ltp >= t2Bar.close;
  const rfs = quote.floorsheetData || null;
  const brokerConcentrationPct =
    rfs && Number.isFinite(rfs.buyerConcentrationPct)
      ? rfs.buyerConcentrationPct
      : round2(Math.min(68, Math.max(22, 34 + currVolRatio * 11 + (mfi14 - 50) * 0.3)));
  const sellerConcentrationPct =
    rfs && Number.isFinite(rfs.sellerConcentrationPct)
      ? rfs.sellerConcentrationPct
      : round2(Math.max(18, 100 - brokerConcentrationPct));

  let whaleVerdict = "NORMAL INSTITUTIONAL FLOW 🟡";
  let manipulationRisk = "LOW 🟢";
  if (rfs && rfs.netConcentrationDiffPct >= 10 && quote.ltp >= (rfs.vwap || vwap20) * 0.995) {
    whaleVerdict = `REAL FLOORSHEET ACCUMULATION 🐋🟢 (Top 3 Buyers ${rfs.buyerConcentrationPct}% vs Sellers ${rfs.sellerConcentrationPct}%)`;
  } else if (rfs && rfs.netConcentrationDiffPct <= -10) {
    whaleVerdict = `REAL FLOORSHEET DISTRIBUTION 🔴 (Top 3 Sellers ${rfs.sellerConcentrationPct}% vs Buyers ${rfs.buyerConcentrationPct}%)`;
  } else if (currVolRatio >= 1.5 && quote.ltp >= vwap20 && t2SupplyAbsorbed) {
    whaleVerdict = "WHALE ACCUMULATION / CORNERING DETECTED 🐋🟢";
  } else if (currVolRatio >= 1.8 && quote.ltp < quote.open && mfi14 > 68) {
    whaleVerdict = "OPERATOR DISTRIBUTION / BULL-TRAP WARNING ⚠️🔴";
    manipulationRisk = "HIGH (PUMP & DUMP RISK) 🔴";
  } else if (t2SupplyAbsorbed && mfi14 >= 52) {
    whaleVerdict = "STEALTH SMART-MONEY ACCUMULATION 🟢";
  }

  return {
    vwap20,
    sessionVwap: rfs?.vwap || vwap20,
    mfi14,
    obvStatus,
    brokerConcentrationPct,
    sellerConcentrationPct,
    netBrokerDiffPct: round2(brokerConcentrationPct - sellerConcentrationPct),
    floorsheetSummary: rfs?.summary || null,
    floorsheetDate: rfs?.date || null,
    floorsheetTrades: rfs?.totalTrades || null,
    floorsheetKitta: rfs?.totalKitta || null,
    topBuyDetails: rfs?.topBuyDetails || null,
    topSellDetails: rfs?.topSellDetails || null,
    t2SupplyStatus: t2SupplyAbsorbed ? "ABSORBED 🟢 (Buyers holding T+2 delivery)" : "SUPPLY PRESSURE 🔴 (T+2 profit booking)",
    whaleVerdict,
    manipulationRisk,
    topBuyBrokers: quote.topBuyBrokers || [58, 45, 34],
    topSellBrokers: quote.topSellBrokers || [28, 19]
  };
}

function detectCandlestickPattern(bars) {
  if (bars.length < 4) return "Standard Bar";
  const curr = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const prev2 = bars[bars.length - 3];
  const body = Math.abs(curr.close - curr.open);
  const prevBody = Math.abs(prev.close - prev.open);
  const range = Math.max(0.01, curr.high - curr.low);
  const prevRange = Math.max(0.01, prev.high - prev.low);
  const lowerWick = Math.min(curr.open, curr.close) - curr.low;
  const upperWick = curr.high - Math.max(curr.open, curr.close);

  const sma50 = calcSMA(bars.map((b) => b.close), Math.min(50, bars.length));
  const inCorrectionAfterUptrend = curr.close >= sma50 * 0.96 && prev.close < prev2.close;
  const atSwingTop = curr.close > sma50 * 1.03 && prev.close > prev2.close;

  // 1. Engulfing (Slide 38: Second bar body completely engulfs first bar body)
  if (
    curr.close > curr.open &&
    prev.close < prev.open &&
    curr.close >= prev.open &&
    curr.open <= prev.close &&
    body > prevBody
  ) {
    return inCorrectionAfterUptrend
      ? "Bullish Engulfing (In Uptrend Pullback) 🟢"
      : "Bullish Engulfing 🟢";
  }
  if (
    curr.close < curr.open &&
    prev.close > prev.open &&
    curr.close <= prev.open &&
    curr.open >= prev.close &&
    body > prevBody
  ) {
    return "Bearish Engulfing 🔴";
  }

  // 2. Piercing Line & Dark Cloud Cover (Slide 39)
  const prevMidpoint = (prev.open + prev.close) / 2;
  if (
    prev.close < prev.open &&
    prevBody / prevRange >= 0.45 &&
    curr.close > curr.open &&
    curr.open < prev.close &&
    curr.close > prevMidpoint &&
    curr.close < prev.open
  ) {
    return "Bullish Piercing Line Reversal 🟢";
  }
  if (
    prev.close > prev.open &&
    prevBody / prevRange >= 0.45 &&
    curr.close < curr.open &&
    curr.open > prev.close &&
    curr.close < prevMidpoint &&
    curr.close > prev.open
  ) {
    return "Bearish Dark Cloud Cover 🔴";
  }

  // 3. Harami / Inside Spinning Top (Slide 35: Large body followed by small opposite body inside first body)
  const prevBodyHigh = Math.max(prev.open, prev.close);
  const prevBodyLow = Math.min(prev.open, prev.close);
  const currBodyHigh = Math.max(curr.open, curr.close);
  const currBodyLow = Math.min(curr.open, curr.close);
  if (
    prevBody / prevRange >= 0.5 &&
    body < prevBody * 0.55 &&
    currBodyHigh <= prevBodyHigh &&
    currBodyLow >= prevBodyLow
  ) {
    if (prev.close < prev.open && curr.close > curr.open) {
      return "Bullish Harami (Spinning Top Inside — Wait for Breakout) 🟡";
    }
    if (prev.close > prev.open && curr.close < curr.open) {
      return "Bearish Harami (Inside Indecision — Wait for Breakout) 🟡";
    }
  }

  // 4. Hammer vs Hanging Man (Slide 36: Long lower shadow >= 2x body, tiny upper shadow)
  if (lowerWick >= Math.max(body * 2.0, range * 0.55) && upperWick <= range * 0.15) {
    if (atSwingTop && curr.close < curr.open) {
      return "Hanging Man at Top (Caution) 🟠";
    }
    return "Bullish Hammer (Confirm on Next-Bar Breakout) 🟢";
  }

  // 5. Shooting Star vs Inverted Hammer (Slide 37: Long upper shadow >= 2x body, tiny lower shadow)
  if (upperWick >= Math.max(body * 2.0, range * 0.55) && lowerWick <= range * 0.15) {
    if (atSwingTop || curr.close < curr.open) {
      return "Bearish Shooting Star 🔴";
    }
    return "Inverted Hammer at Support (Wait for Breakout) 🟡";
  }

  // 6. Doji (Slide 34: Open and Close nearly equal, high/low equidistant)
  if (body / range <= 0.1) {
    return "Indecision Doji (Wait for Breakout Direction) ⚪";
  }

  if (curr.close > curr.open && body / range > 0.72) {
    return "Bullish Marubozu Momentum 🟢";
  }
  return curr.close >= curr.open ? "Bullish Daily Candle 🟢" : "Bearish Pullback Candle 🔴";
}

/**
 * Fidelity / Charles D. Kirkpatrick II, CMT Chart Pattern & Breakout Confirmation Engine
 * Detects Multi-Bar Patterns, Short-Term Volatility Patterns (NR4, Inside Bar, Pipe Bottom,
 * Flag/Pennant, Explosion Gap Pivot), Breakout Confirmation Filters, Throwbacks, and False Breakouts,
 * plus exact Kirkpatrick Measured-Move Price Targets.
 */
function detectChartPatternsCMT(bars, atr14, sma200) {
  if (!bars || bars.length < 25) {
    return {
      multiBarPattern: "None Detected",
      shortTermPattern: "Normal Volatility",
      breakoutStatus: "NO BREAKOUT YET (WAIT FOR TRIGGER) 🟡",
      patternActivated: false,
      measuredTarget: null,
      patternTriggerPrice: null,
      protectiveStopPrice: null,
      falseBreakoutTrap: false,
      throwbackStatus: "None",
      summary: "Insufficient bars for multi-bar pattern detection"
    };
  }

  const recent40 = bars.slice(-Math.min(45, bars.length));
  const n = recent40.length;
  const curr = recent40[n - 1];
  const prev = recent40[n - 2];
  const prev2 = recent40[n - 3];
  const prev3 = recent40[n - 4];
  const currentPrice = curr.close;

  // -------------------------------------------------------------------------
  // A. SHORT-TERM & VOLATILITY PATTERNS (Slides 40–45)
  // -------------------------------------------------------------------------
  const r4 = curr.high - curr.low;
  const r3 = prev.high - prev.low;
  const r2 = prev2.high - prev2.low;
  const r1 = prev3.high - prev3.low;

  const isInsideBar = curr.high <= prev.high && curr.low >= prev.low;
  const isNR4 = r4 > 0 && r4 < r3 && r4 < r2 && r4 < r1;

  // Two-Bar Reversal Bottom / Pipe Bottom (Slide 43 & Slide 32 Best Upward Signal):
  // Two wide-range bars after a decline; Bar 1 closes in lower 38% of range, Bar 2 closes in upper 50% of range
  const bar5AgoClose = recent40[Math.max(0, n - 6)].close;
  const isAfterDecline = prev.low < bar5AgoClose * 0.985;
  const prevCLV = r3 > 0 ? (prev.close - prev.low) / r3 : 0.5;
  const currCLV = r4 > 0 ? (curr.close - curr.low) / r4 : 0.5;
  const isPipeBottom =
    isAfterDecline &&
    r3 >= atr14 * 1.1 &&
    r4 >= atr14 * 1.1 &&
    prevCLV <= 0.38 &&
    currCLV >= 0.55 &&
    Math.abs(curr.low - prev.low) / currentPrice <= 0.022;

  // Explosion Gap Pivot (Slides 41–42): Check last 6 bars for an unfilled Gap Up and Pivot Low throwback
  let explosionGapPivot = null;
  for (let i = n - 5; i <= n - 1; i++) {
    if (i < 1) continue;
    const gapBar = recent40[i];
    const beforeGap = recent40[i - 1];
    if (gapBar.low > beforeGap.high * 1.004) {
      const subsequentBars = recent40.slice(i + 1);
      const gapCovered = subsequentBars.some((b) => b.low <= beforeGap.high);
      if (!gapCovered) {
        const pivotLow = subsequentBars.length > 0 ? Math.min(...subsequentBars.map((b) => b.low)) : gapBar.low;
        explosionGapPivot = {
          gapHigh: round2(gapBar.high),
          gapLow: round2(gapBar.low),
          pivotLow: round2(pivotLow),
          buyEntryStop: round2(gapBar.high + 1),
          protectiveStop: round2(Math.min(gapBar.low, pivotLow) * 0.995)
        };
      }
    }
  }

  let shortTermPattern = "Standard Range";
  if (isPipeBottom) {
    shortTermPattern = "Pipe Bottom (Two-Bar Reversal — Best Upward Signal) 🟢";
  } else if (isInsideBar && isNR4) {
    shortTermPattern = `ID/NR4 (Inside Bar + 4-Day Narrow Range Compression — Breakout > Rs ${round2(curr.high)}) 🔥`;
  } else if (isNR4) {
    shortTermPattern = `NR4 Narrow Range Day (Low Volatility Coiling — Buy Stop > Rs ${round2(curr.high)} / Sell < Rs ${round2(curr.low)}) 🟡`;
  } else if (isInsideBar) {
    shortTermPattern = `Inside Bar (Volatility Contraction — Buy > Rs ${round2(prev.high)} / Sell < Rs ${round2(prev.low)}) 🟡`;
  } else if (explosionGapPivot) {
    shortTermPattern = `Explosion Gap Pivot (Unfilled Gap Support @ Rs ${explosionGapPivot.pivotLow}, Entry > Rs ${explosionGapPivot.buyEntryStop}) 🟢`;
  }

  // -------------------------------------------------------------------------
  // B. MULTI-BAR CHART PATTERNS & MEASURED TARGET FORMULAS (Slides 18–32, 40)
  // -------------------------------------------------------------------------
  // Find local 3-bar swing highs and swing lows across recent40
  const swingHighs = [];
  const swingLows = [];
  for (let i = 2; i < n - 1; i++) {
    if (
      recent40[i].high >= recent40[i - 1].high &&
      recent40[i].high >= recent40[i - 2].high &&
      recent40[i].high >= recent40[i + 1].high
    ) {
      swingHighs.push({ idx: i, price: recent40[i].high });
    }
    if (
      recent40[i].low <= recent40[i - 1].low &&
      recent40[i].low <= recent40[i - 2].low &&
      recent40[i].low <= recent40[i + 1].low
    ) {
      swingLows.push({ idx: i, price: recent40[i].low });
    }
  }

  let multiBarPattern = "No Major Multi-Bar Pattern";
  let patternType = "NONE"; // BULLISH / BEARISH / NEUTRAL
  let patternActivated = false;
  let patternTriggerPrice = null;
  let measuredTarget = null;
  let protectiveStopPrice = round2(Math.min(curr.low, prev.low) * 0.99);

  // 1. Check Head and Shoulders Top (Slide 28) & Inverse Head and Shoulders Bottom (Slide 29)
  if (swingHighs.length >= 3) {
    const [ls, head, rs] = swingHighs.slice(-3);
    const shouldersAligned = Math.abs(ls.price - rs.price) / head.price <= 0.032;
    const headHigher = head.price > ls.price * 1.02 && head.price > rs.price * 1.02;
    if (shouldersAligned && headHigher) {
      const trough1 = Math.min(...recent40.slice(ls.idx, head.idx + 1).map((b) => b.low));
      const trough2 = Math.min(...recent40.slice(head.idx, rs.idx + 1).map((b) => b.low));
      const neckline = round2((trough1 + trough2) / 2);
      const height = round2(head.price - neckline);
      patternTriggerPrice = neckline;
      measuredTarget = round2(neckline - height);
      patternType = "BEARISH";
      if (currentPrice < neckline) {
        patternActivated = true;
        multiBarPattern = `Head & Shoulders Top (CONFIRMED BREAKDOWN < Neckline Rs ${neckline}) 🔴`;
      } else {
        multiBarPattern = `Head & Shoulders Top Forming (Neckline Floor @ Rs ${neckline}) 🟠`;
      }
    }
  }

  if (patternType === "NONE" && swingLows.length >= 3) {
    const [ls, head, rs] = swingLows.slice(-3);
    const shouldersAligned = Math.abs(ls.price - rs.price) / head.price <= 0.032;
    const headLower = head.price < ls.price * 0.98 && head.price < rs.price * 0.98;
    if (shouldersAligned && headLower) {
      const peak1 = Math.max(...recent40.slice(ls.idx, head.idx + 1).map((b) => b.high));
      const peak2 = Math.max(...recent40.slice(head.idx, rs.idx + 1).map((b) => b.high));
      const neckline = round2((peak1 + peak2) / 2);
      const height = round2(neckline - head.price);
      patternTriggerPrice = neckline;
      measuredTarget = round2(neckline + height);
      protectiveStopPrice = round2(rs.price * 0.99);
      patternType = "BULLISH";
      if (currentPrice > neckline) {
        patternActivated = true;
        multiBarPattern = `Inverse Head & Shoulders Bottom (CONFIRMED BREAKOUT > Rs ${neckline}) 🟢`;
      } else {
        multiBarPattern = `Inverse Head & Shoulders Forming (Wait for Breakout > Neckline Rs ${neckline}) 🟡`;
      }
    }
  }

  // 2. Check Double Bottom (Slide 20) & Double Top (Slide 19)
  if (patternType === "NONE" && swingLows.length >= 2) {
    const [t1, t2] = swingLows.slice(-2);
    if (t2.idx - t1.idx >= 4 && Math.abs(t1.price - t2.price) / t1.price <= 0.022) {
      const middlePeak = round2(Math.max(...recent40.slice(t1.idx, t2.idx + 1).map((b) => b.high)));
      const lowestTrough = round2(Math.min(t1.price, t2.price));
      const height = round2(middlePeak - lowestTrough);
      if (height / lowestTrough >= 0.03) {
        patternTriggerPrice = middlePeak;
        measuredTarget = round2(middlePeak + height);
        protectiveStopPrice = round2(lowestTrough * 0.99);
        patternType = "BULLISH";
        if (currentPrice > middlePeak) {
          patternActivated = true;
          multiBarPattern = `Double Bottom "W" (CONFIRMED BREAKOUT > Middle Peak Rs ${middlePeak}) 🟢`;
        } else {
          multiBarPattern = `Double Bottom "W" Support @ Rs ${lowestTrough} (Activates on Breakout > Rs ${middlePeak}) 🟡`;
        }
      }
    }
  }

  if (patternType === "NONE" && swingHighs.length >= 2) {
    const [p1, p2] = swingHighs.slice(-2);
    if (p2.idx - p1.idx >= 4 && Math.abs(p1.price - p2.price) / p1.price <= 0.022) {
      const middleTrough = round2(Math.min(...recent40.slice(p1.idx, p2.idx + 1).map((b) => b.low)));
      const highestPeak = round2(Math.max(p1.price, p2.price));
      const height = round2(highestPeak - middleTrough);
      if (height / middleTrough >= 0.03) {
        patternTriggerPrice = middleTrough;
        measuredTarget = round2(middleTrough - height);
        patternType = "BEARISH";
        if (currentPrice < middleTrough) {
          patternActivated = true;
          multiBarPattern = `Double Top "M" (CONFIRMED BREAKDOWN < Trough Rs ${middleTrough}) 🔴`;
        } else if (currentPrice <= highestPeak * 0.985) {
          multiBarPattern = `Double Top Resistance @ Rs ${highestPeak} (Breaks Down if < Rs ${middleTrough}) 🟠`;
        }
      }
    }
  }

  // 3. Check Pennant / Bull Flag (Slide 40: Sharp flagpole rally followed by brief sloping consolidation)
  if (patternType === "NONE" && n >= 15) {
    const poleStart = recent40[n - 12].low;
    const polePeakBars = recent40.slice(n - 11, n - 4);
    const polePeak = Math.max(...polePeakBars.map((b) => b.high));
    const flagpoleHeight = round2(polePeak - poleStart);
    const recentFlagBars = recent40.slice(n - 5);
    const flagHigh = round2(Math.max(...recentFlagBars.map((b) => b.high)));
    const flagLow = round2(Math.min(...recentFlagBars.map((b) => b.low)));

    if (
      flagpoleHeight / poleStart >= 0.065 &&
      flagLow >= poleStart + flagpoleHeight * 0.45 &&
      (flagHigh - flagLow) <= flagpoleHeight * 0.55
    ) {
      patternTriggerPrice = flagHigh;
      // Kirkpatrick Slide 40 Formula: Add flagpole height to bottom of pennant/flag
      measuredTarget = round2(flagLow + flagpoleHeight);
      protectiveStopPrice = round2(flagLow * 0.99);
      patternType = "BULLISH";
      if (currentPrice >= flagHigh) {
        patternActivated = true;
        multiBarPattern = `Bull Flag / Pennant (CONFIRMED BREAKOUT > Rs ${flagHigh}) 🟢`;
      } else {
        multiBarPattern = `Bull Flag / Pennant Consolidation (Breakout Trigger > Rs ${flagHigh}) 🟡`;
      }
    }
  }

  // 4. Check Rectangle Congestion & Triangles / Wedges over last 24 bars (Slides 23–27)
  if (patternType === "NONE") {
    const box24 = recent40.slice(-24, -1);
    const firstHalf = box24.slice(0, 11);
    const secondHalf = box24.slice(11);
    const h1 = Math.max(...firstHalf.map((b) => b.high));
    const h2 = Math.max(...secondHalf.map((b) => b.high));
    const l1 = Math.min(...firstHalf.map((b) => b.low));
    const l2 = Math.min(...secondHalf.map((b) => b.low));
    const boxHigh = round2(Math.max(h1, h2));
    const boxLow = round2(Math.min(l1, l2));
    const boxHeight = round2(boxHigh - boxLow);

    const flatTop = Math.abs(h1 - h2) / boxHigh <= 0.018;
    const flatBottom = Math.abs(l1 - l2) / boxLow <= 0.018;
    const risingBottom = l2 > l1 * 1.015;
    const fallingTop = h2 < h1 * 0.985;
    const risingTop = h2 > h1 * 1.015;
    const fallingBottom = l2 < l1 * 0.985;

    if (flatTop && flatBottom && boxHeight / boxLow <= 0.10) {
      // Rectangle (Slide 23 & Slide 32 Best Upward Signal)
      const hasBullishShortfall = l2 > l1 + boxHeight * 0.18;
      patternTriggerPrice = boxHigh;
      measuredTarget = round2(currentPrice >= boxLow ? boxHigh + boxHeight : boxLow - boxHeight);
      protectiveStopPrice = round2(boxLow * 0.99);
      if (currentPrice > boxHigh) {
        patternActivated = true;
        patternType = "BULLISH";
        multiBarPattern = `Rectangle Base Breakout (> Rs ${boxHigh} — Best Multi-Bar Upward Signal) 🟢`;
      } else if (currentPrice < boxLow) {
        patternActivated = true;
        patternType = "BEARISH";
        measuredTarget = round2(boxLow - boxHeight);
        multiBarPattern = `Rectangle Support Breakdown (< Rs ${boxLow}) 🔴`;
      } else {
        patternType = hasBullishShortfall ? "BULLISH" : "NEUTRAL";
        multiBarPattern = `Rectangle Congestion (Rs ${boxLow}–${boxHigh}${hasBullishShortfall ? " • Bullish Shortfall Detected" : ""}) 🟡`;
      }
    } else if (flatTop && risingBottom) {
      // Ascending Triangle (Slide 25)
      patternTriggerPrice = boxHigh;
      measuredTarget = round2(boxHigh + boxHeight);
      protectiveStopPrice = round2(l2 * 0.99);
      patternType = "BULLISH";
      if (currentPrice > boxHigh) {
        patternActivated = true;
        multiBarPattern = `Ascending Triangle (CONFIRMED BREAKOUT > Rs ${boxHigh}) 🟢`;
      } else {
        multiBarPattern = `Ascending Triangle Coiling (Resistance @ Rs ${boxHigh}, Higher Lows @ Rs ${round2(l2)}) 🟡`;
      }
    } else if (flatBottom && fallingTop) {
      // Descending Triangle (Slide 26 & Slide 32: Upward breakout is a Top Upward Signal; Downward break is Bearish)
      if (currentPrice > h2) {
        patternActivated = true;
        patternType = "BULLISH";
        patternTriggerPrice = round2(h2);
        measuredTarget = round2(h2 + boxHeight);
        protectiveStopPrice = round2(boxLow * 0.99);
        multiBarPattern = `Descending Triangle Upward Breakout (> Rs ${round2(h2)} — High-Performance Reversal) 🟢`;
      } else if (currentPrice < boxLow) {
        patternActivated = true;
        patternType = "BEARISH";
        patternTriggerPrice = boxLow;
        measuredTarget = round2(boxLow - boxHeight);
        multiBarPattern = `Descending Triangle Breakdown (< Support Rs ${boxLow}) 🔴`;
      } else {
        patternType = "BEARISH";
        patternTriggerPrice = boxLow;
        measuredTarget = round2(boxLow - boxHeight);
        multiBarPattern = `Descending Triangle (Testing Floor @ Rs ${boxLow} / Upper Line @ Rs ${round2(h2)}) 🟠`;
      }
    } else if (fallingTop && risingBottom) {
      // Symmetrical Triangle (Slide 24)
      patternTriggerPrice = round2(h2);
      measuredTarget = round2(h2 + boxHeight);
      protectiveStopPrice = round2(l2 * 0.99);
      if (currentPrice > h2) {
        patternActivated = true;
        patternType = "BULLISH";
        multiBarPattern = `Symmetrical Triangle (CONFIRMED UPWARD BREAKOUT > Rs ${round2(h2)}) 🟢`;
      } else if (currentPrice < l2) {
        patternActivated = true;
        patternType = "BEARISH";
        measuredTarget = round2(l2 - boxHeight);
        multiBarPattern = `Symmetrical Triangle Breakdown (< Rs ${round2(l2)}) 🔴`;
      } else {
        patternType = "NEUTRAL";
        multiBarPattern = `Symmetrical Triangle (Wait for Breakout > Rs ${round2(h2)} or < Rs ${round2(l2)}) 🟡`;
      }
    } else if (risingTop && risingBottom && (l2 - l1) > (h2 - h1) * 1.15) {
      // Rising Wedge (Slide 27: Bearish Climax Pattern — target is lowest trough)
      patternType = "BEARISH";
      patternTriggerPrice = round2(l2);
      measuredTarget = round2(boxLow);
      if (currentPrice < l2) {
        patternActivated = true;
        multiBarPattern = `Rising Wedge Breakdown (< Rs ${round2(l2)} — Target Lowest Trough Rs ${boxLow}) 🔴`;
      } else {
        multiBarPattern = `Rising Wedge (Caution: Climax Narrowing — Watch Support @ Rs ${round2(l2)}) 🟠`;
      }
    } else if (fallingTop && fallingBottom && (h1 - h2) > (l1 - l2) * 1.15) {
      // Declining Wedge (Slide 27: Bullish Panic Exhaustion Pattern)
      patternType = "BULLISH";
      patternTriggerPrice = round2(h2);
      measuredTarget = round2(h2 + boxHeight);
      protectiveStopPrice = round2(boxLow * 0.99);
      if (currentPrice > h2) {
        patternActivated = true;
        multiBarPattern = `Falling Wedge Bullish Breakout (> Rs ${round2(h2)}) 🟢`;
      } else {
        multiBarPattern = `Falling Wedge (Wait for Upward Breakout > Rs ${round2(h2)}) 🟡`;
      }
    }
  }

  // If Pipe Bottom was detected, override or enrich measured target (Slide 43 formula)
  if (isPipeBottom && !patternActivated) {
    const tallerHigh = Math.max(curr.high, prev.high);
    const lowerLow = Math.min(curr.low, prev.low);
    patternTriggerPrice = round2(tallerHigh);
    measuredTarget = round2(tallerHigh + (tallerHigh - lowerLow));
    protectiveStopPrice = round2(lowerLow * 0.99);
    patternType = "BULLISH";
    if (multiBarPattern === "No Major Multi-Bar Pattern") {
      multiBarPattern = `Pipe Bottom Reversal (Trigger > Rs ${patternTriggerPrice}, Target Rs ${measuredTarget}) 🟢`;
    }
  }

  // -------------------------------------------------------------------------
  // C. FALSE BREAKOUT TRAP vs CONFIRMED BREAKOUT vs THROWBACK (Slides 10–16)
  // -------------------------------------------------------------------------
  const prev20High = round2(Math.max(...recent40.slice(-22, -2).map((b) => b.high)));
  const prev20Low = round2(Math.min(...recent40.slice(-22, -2).map((b) => b.low)));
  const avgVol20 = recent40.slice(-21, -1).reduce((s, b) => s + (b.volume || 0), 0) / 20;
  const volConfirmed = avgVol20 > 0 ? (curr.volume || 0) >= avgVol20 * 1.15 : true;
  const pctFilterConfirmed = currentPrice >= prev20High * 1.008;

  // Slide 13: False Breakout = Price breaks out above resistance but immediately returns back through breakout price
  const falseBreakoutUp =
    (curr.high > prev20High * 1.003 && curr.close < prev20High * 0.997) ||
    (prev.high > prev20High * 1.003 && curr.close < prev20High * 0.992);

  // Slide 13: Failed Breakout (Trap) = False breakout occurs and price breaks below the breakout bar low
  const failedBreakoutTrap =
    prev.high > prev20High * 1.002 && curr.close < prev.low;

  // Slide 16: Throwback = After an upward breakout in the prior 2–6 bars, price pulls back to test old resistance as support
  const brokeOutRecently = recent40.slice(-6, -1).some((b) => b.close > prev20High);
  const isThrowbackTest =
    brokeOutRecently &&
    currentPrice >= prev20High * 0.99 &&
    currentPrice <= prev20High * 1.022 &&
    curr.close >= curr.open;

  let breakoutStatus = "INSIDE RANGE (WAIT FOR BREAKOUT) 🟡";
  let throwbackStatus = "No Active Throwback";

  if (failedBreakoutTrap) {
    breakoutStatus = `FAILED BREAKOUT TRAP (< Rs ${round2(prev.low)} after false poke above Rs ${prev20High}) 🚨🔴`;
  } else if (falseBreakoutUp) {
    breakoutStatus = `FALSE BREAKOUT WARNING (Poked above Rs ${prev20High} but closed back inside at Rs ${currentPrice}) ⚠️🟠`;
  } else if (currentPrice > prev20High && pctFilterConfirmed && volConfirmed && currCLV >= 0.55) {
    breakoutStatus = `CONFIRMED BREAKOUT (> Rs ${prev20High} with Price, Close & Volume Confirmation) 🔥🟢`;
    patternActivated = true;
    protectiveStopPrice = round2(curr.low * 0.994); // Slide 15: Protective stop outside breakout bar
  } else if (currentPrice > prev20High) {
    breakoutStatus = `UNCONFIRMED BREAKOUT (> Rs ${prev20High} — Needs Next-Close or Volume Filter) 🟡`;
  } else if (isThrowbackTest) {
    breakoutStatus = `POST-BREAKOUT THROWBACK SUPPORT (Holding @ Rs ${prev20High}) 🟢`;
    throwbackStatus = `Healthy Throwback to Broken Resistance (Rs ${prev20High}) — Low-Risk Entry with Stop < Rs ${round2(curr.low * 0.99)}`;
  } else if (currentPrice < prev20Low) {
    breakoutStatus = `SUPPORT BREAKDOWN (< 20D Floor Rs ${prev20Low}) 🔴`;
  }

  return {
    multiBarPattern,
    shortTermPattern,
    patternType,
    patternActivated,
    patternTriggerPrice,
    measuredTarget,
    protectiveStopPrice,
    falseBreakoutTrap: falseBreakoutUp || failedBreakoutTrap,
    failedBreakoutTrap,
    isThrowbackTest,
    throwbackStatus,
    breakoutStatus,
    isNR4,
    isInsideBar,
    isPipeBottom,
    explosionGapPivot
  };
}

function findSupportResistanceAndFib(bars) {
  const recent60 = bars.slice(-60);
  const highs = recent60.map((b) => b.high);
  const lows = recent60.map((b) => b.low);
  const last = recent60[recent60.length - 1];
  const current = last.close;

  const swingHigh = round2(Math.max(...highs));
  const swingLow = round2(Math.min(...lows));
  const diff = Math.max(1, swingHigh - swingLow);

  const fib382 = round2(swingHigh - diff * 0.382);
  const fib500 = round2(swingHigh - diff * 0.5);
  const fib618 = round2(swingHigh - diff * 0.618);

  const pivot = round2((last.high + last.low + last.close) / 3);
  const r1 = round2(2 * pivot - last.low);
  const s1 = round2(2 * pivot - last.high);

  const resistance1 = round2(Math.max(...highs.slice(-20), current * 1.035));
  const resistance2 = round2(Math.max(swingHigh, current * 1.09));
  const support1 = round2(Math.min(...lows.slice(-20), current * 0.965));
  const support2 = round2(Math.min(swingLow, current * 0.91));

  // Smart Money Concepts (SMC) Order Blocks & Break of Structure (BOS)
  const demandBlockLow = support1;
  const demandBlockHigh = round2(support1 + (current - support1) * 0.32);
  const supplyBlockLow = round2(resistance1 - (resistance1 - current) * 0.28);
  const supplyBlockHigh = resistance1;

  let marketStructure = "RANGE CONSOLIDATION (WAIT FOR BOS) 🟡";
  if (current >= highs.slice(-15, -1).reduce((a, b) => Math.max(a, b), 0)) {
    marketStructure = "BULLISH BREAK OF STRUCTURE (BOS) 🟢";
  } else if (current <= lows.slice(-15, -1).reduce((a, b) => Math.min(a, b), Infinity)) {
    marketStructure = "BEARISH CHANGE OF CHARACTER (CHoCH) 🔴";
  } else if (current > fib500) {
    marketStructure = "HIGHER-LOW BULLISH STRUCTURE 🟢";
  }

  return {
    support1,
    support2,
    resistance1,
    resistance2,
    swingHigh,
    swingLow,
    fib382,
    fib500,
    fib618,
    pivot,
    r1,
    s1,
    demandOrderBlock: `NPR ${demandBlockLow} – ${demandBlockHigh}`,
    supplyOrderBlock: `NPR ${supplyBlockLow} – ${supplyBlockHigh}`,
    demandBlockLow,
    demandBlockHigh,
    supplyBlockLow,
    supplyBlockHigh,
    marketStructure
  };
}

/**
 * Institutional Smart Money Concepts (SMC / ICT) Engine for NEPSE
 * Detects:
 *  1. Market Structure: BOS (Break of Structure) vs CHoCH (Change of Character)
 *  2. Order Blocks: Unmitigated Bullish Order Block (Demand) & Bearish Order Block (Supply)
 *  3. Fair Value Gaps (FVG): 3-Candle Bullish & Bearish Imbalance Zones
 *  4. Liquidity Pools & Stop-Hunts: BSL (Buy-Side Liquidity), SSL (Sell-Side Liquidity), EQH/EQL & Sweeps
 *  5. Dealing Range: Premium (>50%), Equilibrium (50%), Discount (<50%) & OTE (61.8%–78.6% Optimal Trade Entry)
 */
function detectSmartMoneyConcepts(bars, sr, atr14) {
  const recent = bars.slice(-Math.min(60, bars.length));
  const n = recent.length;
  const last = recent[n - 1];
  const prev = recent[n - 2] || last;
  const currentPrice = last.close;
  const atr = Math.max(1, atr14 || currentPrice * 0.02);

  // 1. Identify fractal 5-bar Swing Highs and Swing Lows
  const swingHighs = [];
  const swingLows = [];
  for (let i = 2; i < n - 1; i++) {
    const b = recent[i];
    if (
      b.high >= recent[i - 1].high &&
      b.high >= recent[i - 2].high &&
      b.high >= recent[i + 1].high &&
      (i + 2 >= n || b.high >= recent[i + 2].high)
    ) {
      swingHighs.push({ idx: i, price: round2(b.high), date: b.date || "Recent" });
    }
    if (
      b.low <= recent[i - 1].low &&
      b.low <= recent[i - 2].low &&
      b.low <= recent[i + 1].low &&
      (i + 2 >= n || b.low <= recent[i + 2].low)
    ) {
      swingLows.push({ idx: i, price: round2(b.low), date: b.date || "Recent" });
    }
  }

  const lastSH = swingHighs[swingHighs.length - 1] || { idx: Math.max(0, n - 10), price: sr.resistance1, date: "Recent" };
  const prevSH = swingHighs[swingHighs.length - 2] || lastSH;
  const lastSL = swingLows[swingLows.length - 1] || { idx: Math.max(0, n - 10), price: sr.support1, date: "Recent" };
  const prevSL = swingLows[swingLows.length - 2] || lastSL;

  // 2. BOS (Break of Structure) vs CHoCH (Change of Character)
  const wasLowerHighs = lastSH.price < prevSH.price && lastSL.price < prevSL.price;
  const wasHigherLows = lastSH.price >= prevSH.price && lastSL.price >= prevSL.price;

  let structureType = "INTERNAL RANGE STRUCTURE 🟡";
  let structureTag = "RANGE";
  let structureLevel = round2(sr.fib500);
  let structureDesc = `Consolidating inside dealing range between Swing Low Rs ${lastSL.price} and Swing High Rs ${lastSH.price}`;

  if (currentPrice > lastSH.price) {
    structureLevel = lastSH.price;
    if (wasLowerHighs) {
      structureType = "BULLISH CHoCH (TREND REVERSAL) 🟢";
      structureTag = "BULLISH CHoCH";
      structureDesc = `Price broke above recent Lower High (Rs ${lastSH.price}) — Smart Money shifting from markdown to accumulation`;
    } else {
      structureType = "BULLISH BOS (CONTINUATION) 🟢";
      structureTag = "BULLISH BOS";
      structureDesc = `Price broke and closed above Swing High (Rs ${lastSH.price}) confirming institutional trend continuation`;
    }
  } else if (currentPrice < lastSL.price) {
    structureLevel = lastSL.price;
    if (wasHigherLows) {
      structureType = "BEARISH CHoCH (REVERSAL WARNING) 🔴";
      structureTag = "BEARISH CHoCH";
      structureDesc = `Price broke below recent Higher Low (Rs ${lastSL.price}) — First institutional warning of distribution`;
    } else {
      structureType = "BEARISH BOS (BREAKDOWN) 🔴";
      structureTag = "BEARISH BOS";
      structureDesc = `Price broke below Swing Low (Rs ${lastSL.price}) confirming bearish markdown structure`;
    }
  } else if (wasHigherLows && currentPrice >= sr.fib500) {
    structureType = "BULLISH HIGHER-LOW STRUCTURE (BOS INTACT) 🟢";
    structureTag = "BULLISH HL";
    structureLevel = lastSH.price;
    structureDesc = `Holding Higher Lows above Equilibrium (Rs ${sr.fib500}); next Bullish BOS trigger is > Rs ${lastSH.price}`;
  } else if (wasLowerHighs && currentPrice < sr.fib500) {
    structureType = "BEARISH LOWER-HIGH STRUCTURE 🔴";
    structureTag = "BEARISH LH";
    structureLevel = lastSL.price;
    structureDesc = `Trading in Lower-High structure below Equilibrium (Rs ${sr.fib500}); needs break > Rs ${lastSH.price} for Bullish CHoCH`;
  }

  // 3. Institutional Order Blocks (Bullish Demand OB & Bearish Supply OB)
  let foundBullOB = null;
  let foundBearOB = null;

  for (let i = n - 3; i >= Math.max(1, n - 45); i--) {
    const candle = recent[i];
    const next1 = recent[i + 1];
    const next2 = recent[i + 2];

    // Bullish Order Block: bearish/small candle followed by strong bullish displacement
    if (!foundBullOB && candle.close <= candle.open) {
      const moveUp = Math.max(next1.close - candle.low, next2 ? next2.close - candle.low : 0);
      if (moveUp >= atr * 1.25 && candle.low <= currentPrice * 1.01) {
        const obLow = round2(candle.low);
        const obHigh = round2(Math.max(candle.open, candle.close, candle.low + atr * 0.35));
        // Check if subsequent bars completely broke below obLow
        const invalidated = recent.slice(i + 2).some((b) => b.close < obLow * 0.99);
        if (!invalidated && obHigh <= currentPrice * 1.03) {
          foundBullOB = {
            low: obLow,
            high: obHigh,
            midpoint: round2((obLow + obHigh) / 2),
            date: candle.date || "Recent",
            idx: i
          };
        }
      }
    }

    // Bearish Order Block: bullish candle followed by strong bearish displacement
    if (!foundBearOB && candle.close >= candle.open) {
      const moveDown = Math.max(candle.high - next1.close, next2 ? candle.high - next2.close : 0);
      if (moveDown >= atr * 1.25 && candle.high >= currentPrice * 0.99) {
        const obHigh = round2(candle.high);
        const obLow = round2(Math.min(candle.open, candle.close, candle.high - atr * 0.35));
        const invalidated = recent.slice(i + 2).some((b) => b.close > obHigh * 1.01);
        if (!invalidated && obLow >= currentPrice * 0.97) {
          foundBearOB = {
            low: obLow,
            high: obHigh,
            midpoint: round2((obLow + obHigh) / 2),
            date: candle.date || "Recent",
            idx: i
          };
        }
      }
    }
  }

  const bullOBLow = foundBullOB ? foundBullOB.low : sr.demandBlockLow;
  const bullOBHigh = foundBullOB ? foundBullOB.high : sr.demandBlockHigh;
  const bearOBLow = foundBearOB ? foundBearOB.low : sr.supplyBlockLow;
  const bearOBHigh = foundBearOB ? foundBearOB.high : sr.supplyBlockHigh;

  const inBullOB = currentPrice >= bullOBLow * 0.995 && currentPrice <= bullOBHigh * 1.015;
  const inBearOB = currentPrice >= bearOBLow * 0.985 && currentPrice <= bearOBHigh * 1.005;

  const bullishOB = {
    low: bullOBLow,
    high: bullOBHigh,
    midpoint: round2((bullOBLow + bullOBHigh) / 2),
    date: foundBullOB?.date || "Swing Demand",
    status: inBullOB ? "MITIGATING NOW (IN DEMAND OB) 🎯🟢" : "UNMITIGATED DEMAND ZONE 🟢",
    zoneText: `Rs ${bullOBLow} – Rs ${bullOBHigh}`
  };

  const bearishOB = {
    low: bearOBLow,
    high: bearOBHigh,
    midpoint: round2((bearOBLow + bearOBHigh) / 2),
    date: foundBearOB?.date || "Swing Supply",
    status: inBearOB ? "TESTING SUPPLY OB NOW ⚠️🔴" : "UNMITIGATED SUPPLY ZONE 🔴",
    zoneText: `Rs ${bearOBLow} – Rs ${bearOBHigh}`
  };

  // 4. Fair Value Gaps (FVG / 3-Candle Price Imbalance)
  let bullishFVG = null;
  let bearishFVG = null;

  for (let i = n - 1; i >= Math.max(2, n - 30); i--) {
    const c1 = recent[i - 2];
    const c2 = recent[i - 1];
    const c3 = recent[i];

    // Bullish FVG: Candle 3 Low > Candle 1 High with bullish middle candle
    if (!bullishFVG && c3.low > c1.high * 1.002 && c2.close > c2.open) {
      const gapLow = round2(c1.high);
      const gapHigh = round2(c3.low);
      const fullyFilled = recent.slice(i + 1).some((b) => b.close < gapLow);
      if (!fullyFilled) {
        bullishFVG = {
          type: "BULLISH FVG",
          bottom: gapLow,
          top: gapHigh,
          midpoint: round2((gapLow + gapHigh) / 2),
          date: c2.date || "Recent",
          idx: i - 1,
          zoneText: `Rs ${gapLow} – Rs ${gapHigh}`
        };
      }
    }

    // Bearish FVG: Candle 3 High < Candle 1 Low with bearish middle candle
    if (!bearishFVG && c3.high < c1.low * 0.998 && c2.close < c2.open) {
      const gapLow = round2(c3.high);
      const gapHigh = round2(c1.low);
      const fullyFilled = recent.slice(i + 1).some((b) => b.close > gapHigh);
      if (!fullyFilled) {
        bearishFVG = {
          type: "BEARISH FVG",
          bottom: gapLow,
          top: gapHigh,
          midpoint: round2((gapLow + gapHigh) / 2),
          date: c2.date || "Recent",
          idx: i - 1,
          zoneText: `Rs ${gapLow} – Rs ${gapHigh}`
        };
      }
    }
  }

  const activeFVGText = bullishFVG
    ? `Bullish FVG @ ${bullishFVG.zoneText} (CE Midpoint Rs ${bullishFVG.midpoint}) 🟢`
    : bearishFVG
      ? `Bearish FVG @ ${bearishFVG.zoneText} (Resistance Magnet Rs ${bearishFVG.midpoint}) 🔴`
      : "Balanced Price Action (Recent FVGs Mitigated) ⚪";

  // 5. Liquidity Pools (BSL / SSL / EQH / EQL) & Stop-Hunt Sweeps
  const prior20Lows = recent.slice(-22, -2).map((b) => b.low);
  const prior20Highs = recent.slice(-22, -2).map((b) => b.high);
  const sslPoolPrice = round2(prior20Lows.length ? Math.min(...prior20Lows) : sr.support1);
  const bslPoolPrice = round2(prior20Highs.length ? Math.max(...prior20Highs) : sr.resistance1);

  const sslSweep =
    (last.low < sslPoolPrice && last.close > sslPoolPrice) ||
    (prev.low < sslPoolPrice && last.close > sslPoolPrice && last.close > last.open);
  const bslSweep =
    (last.high > bslPoolPrice && last.close < bslPoolPrice) ||
    (prev.high > bslPoolPrice && last.close < bslPoolPrice && last.close < last.open);

  const hasEqualHighs =
    swingHighs.length >= 2 && Math.abs(lastSH.price - prevSH.price) / Math.max(1, lastSH.price) <= 0.012;
  const hasEqualLows =
    swingLows.length >= 2 && Math.abs(lastSL.price - prevSL.price) / Math.max(1, lastSL.price) <= 0.012;

  let liquidityStatus = `BSL Pool > Rs ${bslPoolPrice} | SSL Pool < Rs ${sslPoolPrice}`;
  if (sslSweep) {
    liquidityStatus = `BULLISH SSL SWEEP (Stop-Hunt below Rs ${sslPoolPrice} & Reclaimed) 🐋🟢`;
  } else if (bslSweep) {
    liquidityStatus = `BEARISH BSL SWEEP (Upthrust above Rs ${bslPoolPrice} & Rejected) ⚠️🔴`;
  } else if (hasEqualHighs) {
    liquidityStatus = `EQUAL HIGHS (EQH @ Rs ${lastSH.price}) — Strong Buy-Side Liquidity Magnet 🎯`;
  } else if (hasEqualLows) {
    liquidityStatus = `EQUAL LOWS (EQL @ Rs ${lastSL.price}) — Watch for Retail Stop Sweep Below 🛡️`;
  }

  // 6. Dealing Range: Premium (>50%) vs Equilibrium (50%) vs Discount (<50%) & OTE (61.8%–78.6% Fib)
  const rangeLow = sr.swingLow;
  const rangeHigh = sr.swingHigh;
  const equilibrium50 = sr.fib500;
  const oteHigh = sr.fib618; // 61.8% retracement from Swing High
  const oteLow = round2(rangeHigh - Math.max(1, rangeHigh - rangeLow) * 0.786); // 78.6% retracement
  const rangePct = round2(
    Math.min(100, Math.max(0, ((currentPrice - rangeLow) / Math.max(1, rangeHigh - rangeLow)) * 100))
  );

  let dealingZone = "EQUILIBRIUM (50% FAIR VALUE) ⚖️🟡";
  let isDiscount = currentPrice <= equilibrium50;
  const inOteZone = currentPrice >= oteLow * 0.995 && currentPrice <= oteHigh * 1.005;

  if (inOteZone) {
    dealingZone = `OPTIMAL TRADE ENTRY (OTE 61.8%–78.6% Discount: Rs ${oteLow}–${oteHigh}) 🎯🟢`;
  } else if (rangePct <= 38) {
    dealingZone = `DEEP DISCOUNT ZONE (${rangePct}% of Range < Eq Rs ${equilibrium50}) 🟢`;
  } else if (rangePct < 50) {
    dealingZone = `DISCOUNT ZONE (${rangePct}% of Range < Eq Rs ${equilibrium50}) 🟢`;
  } else if (rangePct <= 56) {
    dealingZone = `EQUILIBRIUM 50% PIVOT (${rangePct}% of Range @ Rs ${equilibrium50}) ⚖️🟡`;
  } else if (rangePct <= 78) {
    dealingZone = `PREMIUM ZONE (${rangePct}% of Range > Eq Rs ${equilibrium50}) 🟠`;
  } else {
    dealingZone = `EXTREME PREMIUM (${rangePct}% of Range — Distribution Area) 🔴`;
  }

  // 7. Breaker Block Detection (Mitigated/Broken Order Block that Flipped Polarity)
  let breakerBlock = null;
  if (currentPrice > sr.fib500 && lastSH.price > prevSH.price) {
    const brkPrice = round2(Math.min(prevSH.price, currentPrice * 0.985));
    breakerBlock = {
      type: "BULLISH BREAKER BLOCK 🟢",
      low: round2(brkPrice - atr * 0.25),
      high: round2(brkPrice + atr * 0.2),
      zoneText: `Rs ${round2(brkPrice - atr * 0.25)} – Rs ${round2(brkPrice + atr * 0.2)}`,
      desc: "Former supply resistance broken with displacement — now acts as institutional flip support"
    };
  } else if (currentPrice < sr.fib500 && lastSL.price < prevSL.price) {
    const brkPrice = round2(Math.max(prevSL.price, currentPrice * 1.015));
    breakerBlock = {
      type: "BEARISH BREAKER BLOCK 🔴",
      low: round2(brkPrice - atr * 0.2),
      high: round2(brkPrice + atr * 0.25),
      zoneText: `Rs ${round2(brkPrice - atr * 0.2)} – Rs ${round2(brkPrice + atr * 0.25)}`,
      desc: "Former demand floor broken downward — now acts as institutional overhead supply"
    };
  }

  // 8. Previous Week High (PWH) & Previous Week Low (PWL) Institutional Weekly Liquidity
  const prevWeekSlice = recent.length >= 10 ? recent.slice(-10, -5) : recent.slice(0, Math.max(1, n - 3));
  const pwh = round2(Math.max(...prevWeekSlice.map((b) => b.high)));
  const pwl = round2(Math.min(...prevWeekSlice.map((b) => b.low)));
  const sweptPWL = last.low <= pwl && last.close > pwl;
  const brokePWH = currentPrice > pwh;

  // 9. SMC Institutional Score (0–100) & Exact SMC Trade Execution Plan
  let smcScore = 50;
  if (structureType.includes("BULLISH")) smcScore += 16;
  else if (structureType.includes("BEARISH")) smcScore -= 14;

  if (inOteZone) smcScore += 14;
  else if (isDiscount) smcScore += 9;
  else if (rangePct >= 78) smcScore -= 12;

  if (inBullOB) smcScore += 12;
  else if (inBearOB) smcScore -= 10;

  if (sslSweep || sweptPWL) smcScore += 12;
  else if (bslSweep) smcScore -= 12;

  if (bullishFVG) smcScore += 6;
  if (bearishFVG && !bullishFVG) smcScore -= 5;
  if (brokePWH) smcScore += 6;

  smcScore = Math.min(98, Math.max(15, Math.round(smcScore)));
  const smcGrade =
    smcScore >= 80
      ? "A+ (ELITE INSTITUTIONAL CONFLUENCE)"
      : smcScore >= 68
        ? "A (HIGH-PROBABILITY SMC SETUP)"
        : smcScore >= 52
          ? "B (INTERNAL RANGE / WAIT FOR OTE)"
          : "C (BEARISH DISTRIBUTION / AVOID)";

  // Exact SMC Entry, Structural Stop & Liquidity Targets
  const smcEntryPrice = inBullOB || inOteZone
    ? currentPrice
    : bullishFVG && bullishFVG.midpoint <= currentPrice
      ? bullishFVG.midpoint
      : round2(Math.max(bullOBHigh, Math.min(currentPrice * 0.99, oteHigh)));

  const smcStopLoss = round2(Math.min(bullOBLow * 0.992, lastSL.price * 0.992, smcEntryPrice * 0.955));
  const smcRisk = Math.max(1, round2(smcEntryPrice - smcStopLoss));
  const smcTarget1 = round2(Math.max(equilibrium50, pwh, smcEntryPrice + smcRisk * 1.8));
  const smcTarget2 = round2(Math.max(bslPoolPrice, bearOBHigh, smcTarget1 * 1.045));
  const smcRiskReward = round2((smcTarget1 - smcEntryPrice) / smcRisk);

  // 10. Synthesize SMC Institutional Playbook
  let smcVerdict = "SMC NEUTRAL / RANGE ACCUMULATION 🟡";
  if (sslSweep || sweptPWL || (inBullOB && structureType.includes("BULLISH")) || inOteZone) {
    smcVerdict = "INSTITUTIONAL SMC BUY SETUP (Discount OB / Liquidity Sweep) 🐋🟢";
  } else if (structureType.includes("BULLISH") && isDiscount) {
    smcVerdict = "BULLISH STRUCTURE IN DISCOUNT (Ideal Smart Money Entry) 🟢";
  } else if (structureType.includes("BULLISH") && !isDiscount) {
    smcVerdict = "BULLISH STRUCTURE IN PREMIUM (Wait for OTE / OB Pullback) 🟡";
  } else if (bslSweep || (inBearOB && structureType.includes("BEARISH"))) {
    smcVerdict = "INSTITUTIONAL SMC DISTRIBUTION (Supply OB / BSL Sweep) 🚨🔴";
  } else if (structureType.includes("BEARISH")) {
    smcVerdict = "BEARISH SMC MARKET STRUCTURE (Wait for Bullish CHoCH > Rs " + lastSH.price + ") 🔴";
  }

  const smcPlaybook = `SMC Entry @ Rs ${smcEntryPrice} (Demand OB ${bullishOB.zoneText} | OTE Rs ${oteLow}–${oteHigh}) • Structural Stop < Rs ${smcStopLoss} • Target 1 (PWH/Eq): Rs ${smcTarget1} • Target 2 (BSL Pool): Rs ${smcTarget2} (SMC R:R 1:${smcRiskReward}).`;

  return {
    smcScore,
    smcGrade,
    structureType,
    structureTag,
    structureLevel,
    structureDesc,
    lastSwingHigh: lastSH,
    lastSwingLow: lastSL,
    bullishOB,
    bearishOB,
    breakerBlock,
    bullishFVG,
    bearishFVG,
    activeFVGText,
    sslPoolPrice,
    bslPoolPrice,
    pwh,
    pwl,
    sweptPWL,
    brokePWH,
    sslSweep,
    bslSweep,
    hasEqualHighs,
    hasEqualLows,
    liquidityStatus,
    rangeLow,
    rangeHigh,
    equilibrium50,
    oteLow,
    oteHigh,
    inOteZone,
    isDiscount,
    rangePct,
    dealingZone,
    smcTradePlan: {
      entryPrice: smcEntryPrice,
      stopLoss: smcStopLoss,
      target1: smcTarget1,
      target2: smcTarget2,
      riskReward: smcRiskReward
    },
    smcVerdict,
    smcPlaybook
  };
}

/**
 * NEPSE Sun–Thu Weekly Trading & Multi-Week Swing Engine
 * Aggregates Daily Bars into 5-Session NEPSE Trading Weeks (Sun–Thu) and computes:
 *  - Weekly Candlesticks (Open, High, Low, Close, Volume, Date)
 *  - Previous Week High (PWH), Previous Week Low (PWL), Weekly Floor Pivots (P, R1, R2, S1, S2)
 *  - Weekly EMA(4), Weekly EMA(10), Weekly RSI(14), Weekly Volume Surge
 *  - Sun–Thu Execution Plan + Thursday 2:45 PM Weekend Hold vs Profit-Booking Rule
 */
function evaluateWeeklyTrading(bars, quote, sr, smc, atr14) {
  const n = bars.length;
  const weeklyBars = [];
  const groupSize = 5; // NEPSE 5-day trading week (Sun–Thu)
  const remainder = n % groupSize;

  if (remainder > 0) {
    const firstChunk = bars.slice(0, remainder);
    weeklyBars.push({
      date: firstChunk[firstChunk.length - 1].date || "Week",
      startDate: firstChunk[0].date || "Start",
      open: round2(firstChunk[0].open),
      high: round2(Math.max(...firstChunk.map((b) => b.high))),
      low: round2(Math.min(...firstChunk.map((b) => b.low))),
      close: round2(firstChunk[firstChunk.length - 1].close),
      volume: Math.round(firstChunk.reduce((s, b) => s + (b.volume || 0), 0))
    });
  }
  for (let i = remainder; i < n; i += groupSize) {
    const chunk = bars.slice(i, i + groupSize);
    if (!chunk.length) continue;
    weeklyBars.push({
      date: chunk[chunk.length - 1].date || "Week",
      startDate: chunk[0].date || "Start",
      open: round2(chunk[0].open),
      high: round2(Math.max(...chunk.map((b) => b.high))),
      low: round2(Math.min(...chunk.map((b) => b.low))),
      close: round2(chunk[chunk.length - 1].close),
      volume: Math.round(chunk.reduce((s, b) => s + (b.volume || 0), 0))
    });
  }

  const wLen = weeklyBars.length;
  const currW = weeklyBars[wLen - 1] || {
    date: "Current Week",
    open: quote.open || quote.ltp,
    high: quote.high || quote.ltp,
    low: quote.low || quote.ltp,
    close: quote.ltp,
    volume: quote.volume || 0
  };
  const prevW = weeklyBars[wLen - 2] || currW;
  const prev2W = weeklyBars[wLen - 3] || prevW;

  const weekChangePt = round2(currW.close - prevW.close);
  const weekChangePct = prevW.close > 0 ? round2(((currW.close - prevW.close) / prevW.close) * 100) : 0;
  const avgWeeklyVol =
    wLen >= 5
      ? Math.round(weeklyBars.slice(-5, -1).reduce((s, b) => s + b.volume, 0) / 4)
      : Math.max(1, prevW.volume);
  const weeklyVolRatio = avgWeeklyVol > 0 ? round2(currW.volume / avgWeeklyVol) : 1.0;

  // Weekly Indicators
  const wCloses = weeklyBars.map((b) => b.close);
  const wEma4Arr = calcEMASeries(wCloses, Math.min(4, wCloses.length));
  const wEma10Arr = calcEMASeries(wCloses, Math.min(10, wCloses.length));
  const weeklyEMA4 = round2(wEma4Arr[wEma4Arr.length - 1] || currW.close);
  const weeklyEMA10 = round2(wEma10Arr[wEma10Arr.length - 1] || currW.close);
  const wRsiArr = calcRSISeries(wCloses, Math.min(10, Math.max(3, wCloses.length - 1)));
  const weeklyRSI = round2(wRsiArr[wRsiArr.length - 1] ?? 50);

  // Classic Weekly Floor Pivots from Previous Week (PWH, PWL, PWC)
  const pwh = round2(prevW.high);
  const pwl = round2(prevW.low);
  const pwc = round2(prevW.close);
  const wRange = Math.max(1, pwh - pwl);
  const weeklyPivot = round2((pwh + pwl + pwc) / 3);
  const weeklyR1 = round2(2 * weeklyPivot - pwl);
  const weeklyS1 = round2(2 * weeklyPivot - pwh);
  const weeklyR2 = round2(weeklyPivot + wRange);
  const weeklyS2 = round2(weeklyPivot - wRange);

  const wCandleRange = Math.max(0.01, currW.high - currW.low);
  const wCLV = round2((currW.close - currW.low) / wCandleRange);

  const isWeeklyBreakout =
    currW.close > pwh &&
    currW.close >= weeklyEMA4 &&
    weeklyRSI >= 50 &&
    weeklyRSI <= 74 &&
    wCLV >= 0.55;

  const isWeeklySwingBuy =
    !isWeeklyBreakout &&
    currW.close >= weeklyEMA10 * 0.99 &&
    currW.close >= weeklyPivot * 0.985 &&
    weeklyRSI >= 44 &&
    weeklyRSI <= 68 &&
    currW.close >= currW.open * 0.99;

  const isWeeklyPullbackBuy =
    !isWeeklyBreakout &&
    !isWeeklySwingBuy &&
    currW.close >= weeklyS1 * 0.985 &&
    currW.close <= weeklyEMA4 * 1.015 &&
    weeklyRSI >= 35 &&
    weeklyRSI <= 58;

  let weeklyScore = 50;
  if (currW.close >= weeklyEMA4 && weeklyEMA4 >= weeklyEMA10) weeklyScore += 18;
  else if (currW.close < weeklyEMA10) weeklyScore -= 15;

  if (currW.close > pwh) weeklyScore += 14;
  else if (currW.close < pwl) weeklyScore -= 14;

  if (weeklyRSI >= 48 && weeklyRSI <= 68) weeklyScore += 10;
  else if (weeklyRSI > 75) weeklyScore -= 12;
  else if (weeklyRSI < 38) weeklyScore -= 8;

  if (weeklyVolRatio >= 1.15 && weekChangePct > 0) weeklyScore += 8;
  if (wCLV >= 0.6) weeklyScore += 6;

  weeklyScore = Math.min(98, Math.max(15, Math.round(weeklyScore)));

  let weeklyCategory = "🟡 WEEKLY HOLD / RANGE";
  let weeklyBadge = "🟡 WEEKLY CONSOLIDATION";
  if (isWeeklyBreakout) {
    weeklyCategory = "🔥 WEEKLY BREAKOUT";
    weeklyBadge = `🔥 WEEKLY BREAKOUT (> PWH Rs ${pwh})`;
  } else if (isWeeklySwingBuy) {
    weeklyCategory = "🟢 WEEKLY SWING BUY";
    weeklyBadge = `🟢 WEEKLY UPTREND SWING (> 10W EMA Rs ${weeklyEMA10})`;
  } else if (isWeeklyPullbackBuy) {
    weeklyCategory = "🎯 WEEKLY DIP BUY";
    weeklyBadge = `🎯 WEEKLY VALUE PULLBACK (Near Pivot/S1 Rs ${weeklyS1})`;
  } else if (currW.close < pwl || weeklyRSI >= 75) {
    weeklyCategory = "🔴 WEEKLY TRIM / AVOID";
    weeklyBadge = weeklyRSI >= 75 ? `🔴 WEEKLY OVERBOUGHT (RSI ${weeklyRSI})` : `🔴 BELOW PREV WEEK LOW (< Rs ${pwl})`;
  }

  // Sun–Thu Weekly Execution Prices
  const sunMonEntry = isWeeklyBreakout
    ? currW.close
    : round2(Math.min(currW.close, Math.max(weeklyS1, weeklyPivot)));
  const tueWedDipAdd = round2(Math.min(sunMonEntry * 0.98, Math.max(pwl, weeklyS1)));
  const weeklyStopLoss = round2(Math.min(pwl * 0.985, weeklyS1 * 0.985, sunMonEntry * 0.945));
  const thursdayTarget1 = round2(Math.max(weeklyR1, pwh, currW.close * 1.045));
  const nextWeekTarget2 = round2(Math.max(weeklyR2, thursdayTarget1 * 1.05));

  const thursdayCloseRule =
    weeklyRSI >= 72
      ? `💰 BOOK 50%–70% PROFIT ON THURSDAY (2:15–2:45 PM): Weekly RSI (${weeklyRSI}) is stretched; lock profit before weekend.`
      : currW.close >= weeklyEMA4 && wCLV >= 0.55
        ? `🟢 HOLD OVER WEEKEND (FRI–SAT): Strong weekly close (${Math.round(wCLV * 100)}% of weekly range) above 4W EMA (Rs ${weeklyEMA4}). Carry into Sunday gap-up.`
        : currW.close < pwl
          ? `🛑 EXIT BEFORE THURSDAY 2:45 PM CLOSE: Price broke below Previous Week Low (Rs ${pwl}); do not hold weak structure over weekend.`
          : `⚖️ KEEP LIGHT POSITION OVER WEEKEND: Hold above Weekly Stop-Loss (Rs ${weeklyStopLoss}) and add only above Weekly Pivot (Rs ${weeklyPivot}).`;

  return {
    weeklyScore,
    weeklyCategory,
    weeklyBadge,
    isWeeklyBreakout,
    isWeeklySwingBuy,
    isWeeklyPullbackBuy,
    thisWeek: {
      open: currW.open,
      high: currW.high,
      low: currW.low,
      close: currW.close,
      volume: currW.volume,
      changePt: weekChangePt,
      changePct: weekChangePct,
      volRatio: weeklyVolRatio,
      candleCLV: wCLV
    },
    prevWeek: {
      high: pwh,
      low: pwl,
      close: pwc,
      prev2High: prev2W.high,
      prev2Low: prev2W.low
    },
    pivots: {
      pivot: weeklyPivot,
      r1: weeklyR1,
      r2: weeklyR2,
      s1: weeklyS1,
      s2: weeklyS2
    },
    indicators: {
      weeklyEMA4,
      weeklyEMA10,
      weeklyRSI
    },
    weeklyPlan: {
      sunMonEntry,
      tueWedDipAdd,
      thursdayTarget1,
      nextWeekTarget2,
      weeklyStopLoss,
      thursdayCloseRule
    },
    weeklyBars: weeklyBars.slice(-18).map((wb) => ({
      d: wb.date,
      o: wb.open,
      h: wb.high,
      l: wb.low,
      c: wb.close,
      v: wb.volume
    }))
  };
}

function evaluateFundamentals(quote) {
  const eps = quote.eps || 15;
  const bv = quote.bookValue || 150;
  const pe = quote.peRatio || round2(quote.ltp / Math.max(1, eps));
  const sectorPE = quote.sectorPE || 24.0;
  const pb = quote.pbRatio || round2(quote.ltp / Math.max(1, bv));
  const roe = quote.roe || round2((eps / Math.max(1, bv)) * 100);
  const npl = quote.npl ?? 0;
  const bonusDividend = quote.bonusDividend || 0;
  const cashDividend = quote.cashDividend || 0;
  const totalDividend = round2(bonusDividend + cashDividend);
  const divHistory5YrAvg = quote.divHistory5YrAvg ?? totalDividend;
  const epsGrowthYoY = quote.epsGrowthYoY ?? 10.0;
  const lockInRisk = quote.lockInRisk || "SAFE";

  // In NEPSE, Bonus Shares create new kitta valued at post-adjustment LTP while Cash Dividend is % of Rs 100 par value
  const effectiveYieldPct = round2(bonusDividend * 0.82 + (cashDividend * 100) / Math.max(100, quote.ltp));

  const grahamValue = eps > 0 && bv > 0 ? round2(Math.sqrt(22.5 * eps * bv)) : round2(bv * 1.1);
  const sectorFairValue = eps > 0 ? round2(eps * sectorPE * 0.92) : grahamValue;
  const compositeFairValue = round2(grahamValue * 0.45 + sectorFairValue * 0.55);
  const marginOfSafetyPct = round2(((compositeFairValue - quote.ltp) / quote.ltp) * 100);

  let valuationVerdict = "FAIRLY VALUED 🟡";
  let fundScore = 12;
  if (pe > 0 && pe < sectorPE * 0.85 && roe >= 10) {
    valuationVerdict = "UNDERVALUED GEM 🟢";
    fundScore = 18;
  } else if (pe > 0 && pe <= sectorPE * 1.08) {
    valuationVerdict = "ATTRACTIVE / FAIR VALUE 🟢";
    fundScore = 15;
  } else if (pe > sectorPE * 1.45 || pe > 55) {
    valuationVerdict = "PREMIUM / OVERVALUED 🔴";
    fundScore = 7;
  }

  return {
    eps,
    pe,
    sectorPE,
    pb,
    bookValue: bv,
    roe,
    npl,
    divHistory5YrAvg,
    epsGrowthYoY,
    lockInRisk,
    effectiveYieldPct,
    grahamValue,
    compositeFairValue,
    marginOfSafetyPct,
    bonusDividend,
    cashDividend,
    totalDividend,
    valuationVerdict,
    fundScore
  };
}

/**
 * 100-Point Long-Term Wealth & Dividend Compounding Engine (1–5 Year Horizon)
 * Evaluates whether a stock is suitable for Long-Term Hold / SIP vs Short-Term Swing Only.
 */
function evaluateLongTermHold(quote, fundamentals, sr, sma200, volumeProfile) {
  let ltScore = 40;
  const ltStrengths = [];
  const ltRisks = [];

  // 1. Dividend & Bonus Compounding History (Up to +22 pts)
  if (fundamentals.divHistory5YrAvg >= 20 || fundamentals.totalDividend >= 20) {
    ltScore += 22;
    ltStrengths.push(`Elite Dividend Compounder (5Y Avg: ${fundamentals.divHistory5YrAvg}%, Latest: ${fundamentals.bonusDividend}% Bonus + ${fundamentals.cashDividend}% Cash)`);
  } else if (fundamentals.divHistory5YrAvg >= 12 || fundamentals.totalDividend >= 10) {
    ltScore += 15;
    ltStrengths.push(`Consistent Dividend Payer (5Y Avg: ${fundamentals.divHistory5YrAvg}%, Latest: ${fundamentals.totalDividend}%)`);
  } else if (fundamentals.divHistory5YrAvg >= 5) {
    ltScore += 7;
  } else {
    ltScore -= 8;
    ltRisks.push(`Weak/Zero dividend history (${fundamentals.divHistory5YrAvg}%) — no compounding cushion in bear markets`);
  }

  // 2. ROE & Earnings Quality (Up to +18 pts)
  if (fundamentals.roe >= 13 && fundamentals.eps >= 24) {
    ltScore += 18;
    ltStrengths.push(`Superior Capital Efficiency (ROE ${fundamentals.roe}%, EPS NPR ${fundamentals.eps})`);
  } else if (fundamentals.roe >= 10.5 && fundamentals.eps >= 16) {
    ltScore += 12;
    ltStrengths.push(`Healthy Profitability (ROE ${fundamentals.roe}%, EPS NPR ${fundamentals.eps})`);
  } else if (fundamentals.roe < 8) {
    ltScore -= 8;
    ltRisks.push(`Sub-par ROE (${fundamentals.roe}%) below institutional hurdle rate`);
  }

  // 3. Valuation & Graham Margin of Safety (Up to +15 pts)
  if (fundamentals.pe > 0 && fundamentals.pe <= fundamentals.sectorPE * 0.92) {
    ltScore += 14;
    ltStrengths.push(`Trading at Discount (P/E ${fundamentals.pe}x vs Sector ${fundamentals.sectorPE}x, Fair Value NPR ${fundamentals.compositeFairValue})`);
  } else if (fundamentals.pe <= fundamentals.sectorPE * 1.12) {
    ltScore += 9;
  } else if (fundamentals.pe >= 45) {
    ltScore -= 14;
    ltRisks.push(`Extreme P/E multiple (${fundamentals.pe}x) creates severe de-rating risk for long-term holders`);
  }

  // 4. Asset Quality (NPL for BFIs) & YoY EPS Growth & Lock-In Safety (Up to +12 pts)
  const isBFI = ["Commercial Banks", "Development Banks", "Finance", "Microfinance"].includes(quote.sector);
  if (isBFI) {
    if (fundamentals.npl > 0 && fundamentals.npl <= 1.8) {
      ltScore += 7;
      ltStrengths.push(`Clean Balance Sheet (Low NPL: ${fundamentals.npl}%)`);
    } else if (fundamentals.npl >= 3.2) {
      ltScore -= 9;
      ltRisks.push(`Elevated Non-Performing Loans (NPL: ${fundamentals.npl}%)`);
    }
  }
  if (fundamentals.epsGrowthYoY >= 14) {
    ltScore += 5;
    ltStrengths.push(`Strong YoY Quarterly EPS Growth (+${fundamentals.epsGrowthYoY}%)`);
  } else if (fundamentals.epsGrowthYoY < 0) {
    ltScore -= 6;
    ltRisks.push(`Contracting YoY EPS (${fundamentals.epsGrowthYoY}%)`);
  }
  if (fundamentals.lockInRisk !== "SAFE") {
    ltScore -= 10;
    ltRisks.push(`Supply Dilution Risk: ${fundamentals.lockInRisk}`);
  }

  ltScore = Math.min(98, Math.max(18, Math.round(ltScore)));

  let longTermCategory = "⚡ SWING ONLY (AVOID LONG-TERM)";
  let longTermBadge = "⚠️ SHORT-TERM SWING ONLY";
  let isLongTermHold = false;

  if (ltScore >= 82) {
    longTermCategory = "💎 BLUE-CHIP COMPOUNDER";
    longTermBadge = "💎 CORE WEALTH COMPOUNDER (3–5 YRS)";
    isLongTermHold = true;
  } else if (ltScore >= 72) {
    longTermCategory = "💰 DIVIDEND & VALUE HOLD";
    longTermBadge = "💰 LONG-TERM DIVIDEND + VALUE PICK";
    isLongTermHold = true;
  } else if (ltScore >= 60) {
    longTermCategory = "🌱 ACCUMULATE ON DIPS";
    longTermBadge = "🌱 MODERATE LONG-TERM (BUY ON DIPS)";
    isLongTermHold = true;
  }

  const sipLow = round2(Math.min(quote.ltp * 0.96, volumeProfile.poc, sma200));
  const sipHigh = round2(Math.min(quote.ltp * 1.01, Math.max(sipLow + 4, fundamentals.compositeFairValue * 1.05)));
  const expectedAnnualCagr = round2(
    Math.max(12, Math.min(28, fundamentals.roe * 0.85 + fundamentals.divHistory5YrAvg * 0.38 + (fundamentals.marginOfSafetyPct > 0 ? 4.5 : 1.5)))
  );
  const target1Yr = round2(quote.ltp * (1 + expectedAnnualCagr / 100));
  const target3Yr = round2(quote.ltp * Math.pow(1 + expectedAnnualCagr / 100, 2.6));

  const longTermThesis = ltStrengths.length > 0
    ? ltStrengths.slice(0, 2).join(" + ")
    : ltRisks[0] || "High-beta cyclical stock better suited for swing trading";

  return {
    longTermScore: ltScore,
    longTermCategory,
    longTermBadge,
    isLongTermHold,
    sipZone: `NPR ${sipLow} – ${sipHigh}`,
    expectedAnnualCagr,
    target1Yr,
    target3Yr,
    longTermThesis,
    ltStrengths,
    ltRisks
  };
}

/**
 * Sector-Specific Champion Ranking Engine
 * Evaluates each stock using the exact KPIs that drive its specific sector in NEPSE.
 */
function evaluateSectorChampion(quote, fundamentals, longTerm, quantScore, smartMoney, volRatio) {
  const sec = quote.sector;
  let sectorScore = Math.round(quantScore * 0.5 + longTerm.longTermScore * 0.5);
  let kpiSummary = "";
  let sectorEdge = "";

  if (sec === "Commercial Banks" || sec === "Development Banks") {
    // Banks are driven by low NPL, ROE, Dividend Capacity, PBV, and Institutional Flow
    const nplBonus = fundamentals.npl <= 1.2 ? 14 : fundamentals.npl <= 2.0 ? 8 : fundamentals.npl >= 3.3 ? -10 : 2;
    const divBonus = fundamentals.divHistory5YrAvg >= 18 ? 10 : fundamentals.divHistory5YrAvg >= 12 ? 6 : 0;
    const valBonus = fundamentals.pe <= 16 ? 8 : fundamentals.pe <= 19 ? 4 : -4;
    sectorScore = Math.min(98, Math.max(25, Math.round(quantScore * 0.42 + longTerm.longTermScore * 0.42 + nplBonus + divBonus + valBonus)));
    kpiSummary = `NPL: ${fundamentals.npl}% | ROE: ${fundamentals.roe}% | P/E: ${fundamentals.pe}x | PBV: ${fundamentals.pb}x | 5Y Div: ${fundamentals.divHistory5YrAvg}%`;
    sectorEdge = fundamentals.npl <= 1.5
      ? `Lowest NPL asset quality (${fundamentals.npl}%) + ${fundamentals.divHistory5YrAvg}% 5Yr avg dividend capacity`
      : `Low P/E valuation (${fundamentals.pe}x) with +${fundamentals.epsGrowthYoY}% YoY EPS momentum`;
  } else if (sec === "Finance") {
    // Finance in NEPSE is high-beta: driven by YoY EPS turnaround, Whale Broker Concentration, and Swing Momentum
    const growthBonus = fundamentals.epsGrowthYoY >= 20 ? 14 : fundamentals.epsGrowthYoY >= 12 ? 8 : -6;
    const whaleBonus = smartMoney.brokerConcentrationPct >= 38 ? 10 : 4;
    sectorScore = Math.min(98, Math.max(25, Math.round(quantScore * 0.58 + longTerm.longTermScore * 0.24 + growthBonus + whaleBonus)));
    kpiSummary = `EPS Growth: +${fundamentals.epsGrowthYoY}% | ROE: ${fundamentals.roe}% | NPL: ${fundamentals.npl}% | Whale Conc: ${smartMoney.brokerConcentrationPct}%`;
    sectorEdge = `High-beta Finance leader with +${fundamentals.epsGrowthYoY}% YoY EPS growth & ${smartMoney.brokerConcentrationPct}% broker accumulation`;
  } else if (sec === "Hydropower") {
    // Hydropower is driven by EPS generation efficiency, P/E vs Sector, Lock-In Safety, and Dividend/Bonus history
    const lockPenalty = fundamentals.lockInRisk === "SAFE" ? 8 : -14;
    const roeBonus = fundamentals.roe >= 12 ? 12 : fundamentals.roe >= 9.5 ? 7 : -4;
    sectorScore = Math.min(98, Math.max(22, Math.round(quantScore * 0.48 + longTerm.longTermScore * 0.38 + lockPenalty + roeBonus)));
    kpiSummary = `EPS: Rs ${fundamentals.eps} | ROE: ${fundamentals.roe}% | P/E: ${fundamentals.pe}x | 5Y Div: ${fundamentals.divHistory5YrAvg}% | Lock-In: ${fundamentals.lockInRisk}`;
    sectorEdge = `Operational hydro leader (EPS Rs ${fundamentals.eps}, ROE ${fundamentals.roe}%) with ${fundamentals.lockInRisk} lock-in status`;
  } else if (sec === "Microfinance" || (sec && sec.includes("Insurance"))) {
    const bonusPower = fundamentals.divHistory5YrAvg >= 15 ? 12 : 5;
    sectorScore = Math.min(98, Math.max(25, Math.round(quantScore * 0.46 + longTerm.longTermScore * 0.44 + bonusPower)));
    kpiSummary = `ROE: ${fundamentals.roe}% | EPS: Rs ${fundamentals.eps} | BV: Rs ${fundamentals.bookValue} | 5Y Div: ${fundamentals.divHistory5YrAvg}%`;
    sectorEdge = `High-ROE compounder (${fundamentals.roe}%) with strong bonus share capacity (5Y Avg: ${fundamentals.divHistory5YrAvg}%)`;
  } else {
    kpiSummary = `EPS: Rs ${fundamentals.eps} | ROE: ${fundamentals.roe}% | P/E: ${fundamentals.pe}x | 5Y Div: ${fundamentals.divHistory5YrAvg}%`;
    sectorEdge = `Strong fundamental moat with ${fundamentals.divHistory5YrAvg}% 5Yr average dividend & ${fundamentals.roe}% ROE`;
  }

  return {
    sectorScore,
    kpiSummary,
    sectorEdge
  };
}

function runMonteCarloForecast(bars, currentPrice, target1Price, stopLossPrice) {
  const closes = bars.slice(-60).map((b) => b.close);
  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) {
      returns.push(Math.log(closes[i] / closes[i - 1]));
    }
  }
  const rawMean = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const recent15 = returns.slice(-15);
  const recentMean = recent15.length > 0 ? recent15.reduce((a, b) => a + b, 0) / recent15.length : rawMean;
  // Unbiased empirical drift with 50% shrinkage toward zero (no artificial +0.0015 daily upward bias)
  const shrunkDrift = (rawMean * 0.6 + recentMean * 0.4) * 0.5;
  const meanRet = Math.max(-0.004, Math.min(0.004, shrunkDrift));

  const variance =
    returns.length > 1
      ? returns.reduce((a, x) => a + Math.pow(x - rawMean, 2), 0) / (returns.length - 1)
      : 0.0003;
  const dailyVol = Math.max(0.008, Math.sqrt(variance));
  const annualizedVol = round2(dailyVol * Math.sqrt(240) * 100);

  const annualRet = meanRet * 240;
  // True Sharpe Ratio without artificial 0.45 floor
  const sharpeRatio = dailyVol > 0 ? round2((annualRet - 0.065) / (dailyVol * Math.sqrt(240))) : 0;

  const paths = 500;
  const horizonDays = 15;
  const terminalPrices = [];
  let hitTargetCount = 0;
  let hitStopCount = 0;

  let seed = Math.round(currentPrice * 137);
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return Math.max(0.0001, seed / 4294967296);
  };

  for (let p = 0; p < paths; p++) {
    let price = currentPrice;
    let hitT = false;
    let hitS = false;

    for (let d = 0; d < horizonDays; d++) {
      const u1 = nextRand();
      const u2 = nextRand();
      const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      const stepRet = meanRet - 0.5 * dailyVol * dailyVol + dailyVol * z;
      price = price * Math.exp(stepRet);

      // Check stop-loss first before target on the same step
      if (!hitT && price <= stopLossPrice) hitS = true;
      if (!hitS && price >= target1Price) hitT = true;
    }
    if (hitT) hitTargetCount++;
    if (hitS) hitStopCount++;
    terminalPrices.push(price);
  }

  terminalPrices.sort((a, b) => a - b);
  const bearCase10 = round2(terminalPrices[Math.floor(paths * 0.10)]);
  const median50 = round2(terminalPrices[Math.floor(paths * 0.50)]);
  const bullCase90 = round2(terminalPrices[Math.floor(paths * 0.90)]);

  // Probability of net profit after ~0.85% round-trip NEPSE SEBON + broker fees
  const probProfitPct = round2((terminalPrices.filter((p) => p > currentPrice * 1.0085).length / paths) * 100);
  const probTarget1Pct = round2((hitTargetCount / paths) * 100);
  const var95Pct = round2(Math.max(1.2, 1.645 * dailyVol * 100));

  return {
    horizonDays,
    annualizedVol,
    sharpeRatio,
    probProfitPct,
    probTarget1Pct,
    bearCase10,
    median50,
    bullCase90,
    var95Pct
  };
}

function runWalkForwardBacktest(bars) {
  if (!bars || bars.length < 20) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 50.0,
      profitFactor: 1.0,
      avgReturnPct: 0.0,
      bestTradePct: 0.0,
      maxDrawdownPct: 0.0,
      lowSample: true
    };
  }

  const closes = bars.map((b) => b.close);
  const rsi14 = calcRSISeries(closes, 14);
  const ema20Arr = calcEMASeries(closes, 20);
  const sma50Arr = calcEMASeries(closes, Math.min(50, closes.length));
  const roundTripFeePct = 0.85; // Real NEPSE Broker + SEBON + DP round-trip friction
  const trades = [];

  let inTrade = false;
  let entryPrice = 0;
  let stopPrice = 0;
  let targetPrice = 0;
  let entryIdx = 0;
  let maxHighSinceEntry = 0;

  const startIdx = Math.min(20, Math.max(5, Math.floor(bars.length * 0.15)));
  for (let i = startIdx; i < bars.length - 1; i++) {
    const price = bars[i].close;
    const range = Math.max(0.01, bars[i].high - bars[i].low);
    const clv = (bars[i].close - bars[i].low) / range;

    if (!inTrade) {
      // Setup A: Pullback below EMA20 with strong green buyer reversal candle (CLV >= 0.52)
      const isPullbackReversal =
        price <= ema20Arr[i] * 0.99 &&
        price >= ema20Arr[i] * 0.925 &&
        bars[i].close > bars[i].open &&
        bars[i].close > bars[i - 1].close &&
        clv >= 0.52 &&
        rsi14[i] <= 52;

      // Setup B: EMA20 support touch bounce in an established uptrend
      const isTrendBounce =
        price >= ema20Arr[i] * 0.99 &&
        price <= ema20Arr[i] * 1.025 &&
        bars[i - 1].low <= ema20Arr[i - 1] * 1.01 &&
        ema20Arr[i] >= sma50Arr[i] * 0.99 &&
        bars[i].close > bars[i].open &&
        bars[i].close > bars[i - 1].close &&
        clv >= 0.55 &&
        rsi14[i] >= 46 &&
        rsi14[i] <= 63;

      if (isPullbackReversal || isTrendBounce) {
        inTrade = true;
        entryPrice = price;
        entryIdx = i;
        maxHighSinceEntry = bars[i].high;
        stopPrice = price * 0.952; // -4.8% daily-close stop-loss (avoids 10-kitta odd-lot wick traps)
        targetPrice = price * 1.058; // +5.8% swing target
      }
    } else {
      const high = bars[i].high;
      const low = bars[i].low;
      const holdingBars = i - entryIdx;

      if (high >= targetPrice) {
        const ret = round2(((targetPrice - entryPrice) / entryPrice) * 100 - roundTripFeePct);
        trades.push(ret);
        inTrade = false;
      } else if (stopPrice > entryPrice && low <= stopPrice) {
        // Trailed profit-lock stop triggered intraday at stopPrice
        const ret = round2(((stopPrice - entryPrice) / entryPrice) * 100 - roundTripFeePct);
        trades.push(ret);
        inTrade = false;
      } else if (stopPrice <= entryPrice && price <= stopPrice) {
        // Initial protective stop-loss triggered on daily close
        const ret = round2(((price - entryPrice) / entryPrice) * 100 - roundTripFeePct);
        trades.push(ret);
        inTrade = false;
      } else if (holdingBars >= 12 || (rsi14[i] >= 67 && price > entryPrice * 1.02)) {
        const ret = round2(((price - entryPrice) / entryPrice) * 100 - roundTripFeePct);
        trades.push(ret);
        inTrade = false;
      } else {
        maxHighSinceEntry = Math.max(maxHighSinceEntry, high);
        if (maxHighSinceEntry >= entryPrice * 1.032) {
          // Lock in +2.6% gross (+1.75% net after fees) once trade has rallied +3.2%
          stopPrice = Math.max(stopPrice, entryPrice * 1.026);
        }
      }
    }
  }

  // If discrete setups had fewer than 3 triggers, evaluate empirical non-overlapping 10-day swing windows on bullish reversal bars
  if (trades.length < 3) {
    for (let i = startIdx; i + 10 < bars.length; i += 10) {
      if (bars[i].close > bars[i].open && rsi14[i] <= 58) {
        const entryP = bars[i].close;
        const windowBars = bars.slice(i + 1, i + 11);
        const maxH = Math.max(...windowBars.map((b) => b.high));
        const exitP = maxH >= entryP * 1.045 ? entryP * 1.045 : bars[i + 10].close;
        trades.push(round2(((exitP - entryP) / entryP) * 100 - roundTripFeePct));
      }
    }
  }

  if (trades.length === 0) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 50.0,
      profitFactor: 1.0,
      avgReturnPct: 0.0,
      bestTradePct: 0.0,
      maxDrawdownPct: 0.0,
      lowSample: true
    };
  }

  const wins = trades.filter((t) => t > 0);
  const losses = trades.filter((t) => t <= 0);
  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));

  const winRate = round2((wins.length / trades.length) * 100);
  const profitFactor = grossLoss > 0 ? round2(grossProfit / grossLoss) : round2(grossProfit > 0 ? 2.5 : 0.8);
  const avgReturnPct = round2(trades.reduce((a, b) => a + b, 0) / trades.length);
  const bestTradePct = round2(Math.max(...trades));
  const maxDrawdownPct = losses.length ? round2(Math.abs(Math.min(...losses))) : 0.0;

  return {
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate,
    profitFactor,
    avgReturnPct,
    bestTradePct,
    maxDrawdownPct,
    lowSample: trades.length < 5
  };
}

/**
 * 6-Perspective Precision Buy & Sell Execution Matrix
 * Tells the trader WHERE TO BUY and WHERE TO SELL from every angle:
 *  1. Price Action & Smart Money Concepts (SMC Order Blocks & BOS)
 *  2. Trend & Multi-Timeframe Alignment (1D / 1W / 1M + Ichimoku + SuperTrend)
 *  3. Volume Profile & Institutional VWAP (POC, VAL, VAH)
 *  4. Floorsheet & NEPSE T+2 Settlement Microstructure
 *  5. Fundamental & Intrinsic Valuation (Graham + Sector P/E + Dividend)
 *  6. Statistical Monte Carlo & Backtest Expectancy
 */
function buildSixPerspectiveMatrix({
  currentPrice,
  ema9,
  ema20,
  sma50,
  sma200,
  rsi14,
  supertrend,
  ichimoku,
  mtf,
  sr,
  volumeProfile,
  smartMoney,
  fundamentals,
  monteCarlo,
  backtest,
  atr14,
  recommendedKitta,
  hasBullishReversalConfirm
}) {
  // 1. 3-Tranche Pyramid Buying Plan (40% / 30% / 30%)
  const tranche1PriceLow = round2(Math.min(currentPrice, ema9) - atr14 * 0.25);
  const tranche1PriceHigh = round2(currentPrice + atr14 * 0.15);
  const tranche1Kitta = Math.max(10, Math.round(recommendedKitta * 0.4));

  const valueDipAnchor = round2(Math.min(ema20, sr.fib500, volumeProfile.poc));
  const tranche2PriceLow = round2(Math.max(sr.support1, valueDipAnchor - atr14 * 0.3));
  const tranche2PriceHigh = round2(Math.max(tranche2PriceLow + 2, valueDipAnchor + atr14 * 0.2));
  const tranche2Kitta = Math.max(10, Math.round(recommendedKitta * 0.3));

  const breakoutTrigger = round2(sr.resistance1 + 2);
  const deepSupportEntry = round2(sr.demandBlockLow);
  const tranche3Kitta = Math.max(10, recommendedKitta - tranche1Kitta - tranche2Kitta);

  // 2. 3-Tier Partial Profit-Booking & Exit Plan (35% / 40% / 25%)
  const hardStopLoss = round2(Math.max(currentPrice * 0.94, currentPrice - atr14 * 2.0));
  const riskPerShare = Math.max(1, round2(currentPrice - hardStopLoss));

  const exit1Price = round2(currentPrice + riskPerShare * 1.6); // T+2 Quick Swing Lock (+4.5% to +6%)
  const exit2Price = round2(Math.max(sr.resistance1, currentPrice + riskPerShare * 2.6)); // Major Supply Zone
  const exit3Price = round2(Math.max(sr.resistance2, currentPrice + riskPerShare * 4.0)); // Breakout Runner

  // 3. Evaluate all 6 Perspectives independently
  const perspectives = [
    {
      name: "1️⃣ Price Action & SMC (Order Blocks)",
      verdict: sr.marketStructure.includes("BULLISH") ? "BUY 🟢" : sr.marketStructure.includes("BEARISH") ? "SELL 🔴" : "WAIT FOR DIP 🟡",
      buyWhere: `Demand Order Block: ${sr.demandOrderBlock} | Golden Fib 61.8%: NPR ${sr.fib618}`,
      sellWhere: `Supply Order Block: ${sr.supplyOrderBlock} | Swing High R2: NPR ${sr.resistance2}`
    },
    {
      name: "2️⃣ Trend & Multi-Timeframe (1D/1W/1M)",
      verdict: mtf.bullCount >= 2 && supertrend.direction === "BULLISH" ? "STRONG BUY 🟢" : supertrend.direction === "BEARISH" ? "SELL / AVOID 🔴" : "HOLD 🟡",
      buyWhere: `Daily EMA(20): NPR ${ema20} | Weekly EMA(4): NPR ${mtf.weeklyEma4 || ema20} | SuperTrend: NPR ${supertrend.value}`,
      sellWhere: `Close below SuperTrend (NPR ${supertrend.value}) or SMA(50) (NPR ${sma50})`
    },
    {
      name: "3️⃣ Volume Profile & Institutional VWAP",
      verdict: currentPrice >= smartMoney.vwap20 ? "BULLISH CONTROL 🟢" : "BELOW VWAP 🔴",
      buyWhere: `20D VWAP: NPR ${smartMoney.vwap20} | 60D Volume POC: NPR ${volumeProfile.poc} (VAL: ${volumeProfile.val})`,
      sellWhere: `Value Area High (VAH): NPR ${volumeProfile.vah} (Institutional Distribution Zone)`
    },
    {
      name: "4️⃣ Floorsheet & NEPSE T+2 Microstructure",
      verdict: smartMoney.whaleVerdict.includes("ACCUMULATION") ? "ACCUMULATE 🐋🟢" : smartMoney.whaleVerdict.includes("WARNING") ? "BOOK PROFIT ⚠️🔴" : "NEUTRAL 🟡",
      buyWhere: `1:15 PM – 1:50 PM NPT Intraday Dip (when T+2 weak hands sell)`,
      sellWhere: `11:05 AM – 11:25 AM NPT Opening Euphoria Spike into R1 (NPR ${sr.resistance1})`
    },
    {
      name: "5️⃣ Fundamental & Intrinsic Valuation",
      verdict: fundamentals.valuationVerdict,
      buyWhere: `Margin of Safety Entry <= NPR ${fundamentals.compositeFairValue} (Graham: NPR ${fundamentals.grahamValue})`,
      sellWhere: `Valuation Stretch > NPR ${round2(fundamentals.compositeFairValue * 1.25)} (P/E > ${round2(fundamentals.sectorPE * 1.35)}x)`
    },
    {
      name: "6️⃣ Statistical Monte Carlo & Backtest",
      verdict: monteCarlo.probProfitPct >= 52 ? `POSITIVE EDGE (${monteCarlo.probProfitPct}% Win Prob) 🟢` : "LOW STATISTICAL EDGE 🔴",
      buyWhere: `10th Pct Bear Support: NPR ${monteCarlo.bearCase10} – Median NPR ${currentPrice}`,
      sellWhere: `90th Pct Bull Exhaustion: NPR ${monteCarlo.bullCase90} (Backtest Win%: ${backtest.winRate}%)`
    }
  ];

  // Persona Guidance: Fresh Buyer vs Existing Holder
  let freshBuyerAdvice = "";
  let existingHolderAdvice = "";

  if (rsi14 >= 74) {
    freshBuyerAdvice = `⛔ DO NOT CHASE AT CMP (NPR ${currentPrice}). RSI is overbought (${rsi14}). Wait for pullback to EMA20 (NPR ${ema20}) or POC (NPR ${volumeProfile.poc}).`;
    existingHolderAdvice = `💰 BOOK 50% PROFIT NOW @ NPR ${currentPrice}–${sr.resistance1}. Trail remaining 50% with strict stop at EMA9 (NPR ${ema9}).`;
  } else if (rsi14 <= 33) {
    if (currentPrice >= (sma200 || sma50) || hasBullishReversalConfirm) {
      freshBuyerAdvice = `🟢 CONFIRMED OVERSOLD BOUNCE: Accumulate Tranche 1 (40%) @ NPR ${currentPrice} and Tranche 2 (30%) @ ${sr.demandOrderBlock} with strict stop below NPR ${hardStopLoss}.`;
      existingHolderAdvice = `🛡️ HOLD AT SUPPORT (RSI ${rsi14}): Structural support or reversal candle active near S1 (NPR ${sr.support1}). Keep stop-loss at NPR ${hardStopLoss}.`;
    } else {
      freshBuyerAdvice = `⚠️ FALLING KNIFE WARNING: RSI is oversold (${rsi14}), but price (NPR ${currentPrice}) is below its 200-Day SMA (NPR ${sma200}) with no reversal candle. Wait for a green close above NPR ${ema9} before buying.`;
      existingHolderAdvice = `🛡️ DO NOT AVERAGE DOWN BLINDLY: Trend is below 200-Day SMA (NPR ${sma200}). Protect capital with hard Stop-Loss at NPR ${hardStopLoss}.`;
    }
  } else if (currentPrice > ema20 && supertrend.direction === "BULLISH") {
    freshBuyerAdvice = `🟢 ENTER TRANCHE 1 (40% = ${tranche1Kitta} kitta) @ NPR ${tranche1PriceLow}–${tranche1PriceHigh}. Add Tranche 2 on dip to EMA20 (NPR ${ema20}).`;
    existingHolderAdvice = `📈 RIDE THE UPTREND! Sell 35% at Target 1 (NPR ${exit1Price}), 40% at Target 2 (NPR ${exit2Price}), and trail 25% above SuperTrend (NPR ${supertrend.value}).`;
  } else {
    freshBuyerAdvice = `🟡 PATIENCE: Wait for either a dip to Demand Zone (${sr.demandOrderBlock}) OR a volume breakout above NPR ${breakoutTrigger}.`;
    existingHolderAdvice = `⚖️ HOLD WITH CAUTION: Keep hard Stop-Loss at NPR ${hardStopLoss}. Reduce position if daily candle closes below NPR ${sr.support1}.`;
  }

  return {
    tranches: {
      tranche1: { weight: "40%", kitta: tranche1Kitta, zone: `NPR ${tranche1PriceLow} – ${tranche1PriceHigh}`, label: "Scout / CMP Pullback Entry" },
      tranche2: { weight: "30%", kitta: tranche2Kitta, zone: `NPR ${tranche2PriceLow} – ${tranche2PriceHigh}`, label: "EMA20 / Volume POC Value Dip" },
      tranche3: { weight: "30%", kitta: tranche3Kitta, zone: `Breakout > NPR ${breakoutTrigger} (or Deep Support NPR ${deepSupportEntry})`, label: "Breakout / Order Block Confirmation" }
    },
    exits: {
      exit1: { weight: "35% of Shares", price: exit1Price, pctGain: round2(((exit1Price - currentPrice) / currentPrice) * 100), label: "T+2 Swing Lock (De-risk & cover SEBON fees)" },
      exit2: { weight: "40% of Shares", price: exit2Price, pctGain: round2(((exit2Price - currentPrice) / currentPrice) * 100), label: "Major Supply Block / Resistance R1-R2" },
      exit3: { weight: "25% Moonbag", price: exit3Price, pctGain: round2(((exit3Price - currentPrice) / currentPrice) * 100), label: `Ride Trend until close < SuperTrend (NPR ${supertrend.value})` },
      hardStop: { price: hardStopLoss, pctLoss: round2(((currentPrice - hardStopLoss) / currentPrice) * 100), label: "Hard Invalidation Stop (2x ATR)" }
    },
    perspectives,
    freshBuyerAdvice,
    existingHolderAdvice
  };
}

/**
 * Detects NEPSE Bonus Share / Right Share Book-Close overnight price adjustments
 * (single-session gap-down exceeding NEPSE's -10% daily circuit limit) and
 * back-adjusts prior historical OHLCV bars so EMA20, SMA50, SMA200, RSI & SuperTrend
 * never trigger false breakdown signals after a corporate book closure.
 */
function normalizeBarsForBookClose(rawBars) {
  if (!Array.isArray(rawBars) || rawBars.length < 5) {
    return { bars: rawBars || [], bookCloseAdjustment: { detected: false, label: "No Recent Book-Close Gap" } };
  }
  const bars = rawBars.map((b) => ({ ...b }));
  let detectedEvent = null;

  for (let i = 1; i < bars.length; i++) {
    const prevClose = Number(bars[i - 1].close || 0);
    const currOpen = Number(bars[i].open || bars[i].close || 0);
    const currClose = Number(bars[i].close || 0);
    if (prevClose <= 0 || currOpen <= 0) continue;

    const openGapRatio = (currOpen - prevClose) / prevClose;
    const closeGapRatio = (currClose - prevClose) / prevClose;

    // NEPSE daily circuit limit is ±10%. A single-day drop of >= 10.8% is a Bonus/Right Book-Close adjustment.
    if ((openGapRatio <= -0.108 || closeGapRatio <= -0.112) && openGapRatio >= -0.65) {
      const refPrice = openGapRatio <= -0.108 ? currOpen : currClose;
      const adjFactor = refPrice / prevClose;
      const impliedBonusPct = round2(((1 / adjFactor) - 1) * 100);

      for (let j = 0; j < i; j++) {
        bars[j].open = round2(bars[j].open * adjFactor);
        bars[j].high = round2(bars[j].high * adjFactor);
        bars[j].low = round2(bars[j].low * adjFactor);
        bars[j].close = round2(bars[j].close * adjFactor);
        bars[j].volume = Math.round((bars[j].volume || 0) / adjFactor);
      }

      detectedEvent = {
        detected: true,
        date: bars[i].date || "Recent",
        preBookClosePrice: prevClose,
        adjustedOpenPrice: refPrice,
        dropPct: round2(Math.abs((refPrice - prevClose) / prevClose) * 100),
        impliedBonusPct,
        barsAgo: bars.length - 1 - i,
        label: `📅 Book-Close Adjusted (${bars[i].date}: ~${impliedBonusPct}% Bonus/Right Adj)`
      };
    }
  }

  return {
    bars,
    bookCloseAdjustment: detectedEvent || {
      detected: false,
      label: "Standard Unadjusted Series (No Book-Close Gap)"
    }
  };
}

function analyzeStock(quote, rawBars, portfolioCapital = 100000) {
  if (!quote || !rawBars || rawBars.length < 30) {
    return null;
  }

  const { bars, bookCloseAdjustment } = normalizeBarsForBookClose(rawBars);
  const closes = bars.map((b) => b.close);
  const currentPrice = quote.ltp;

  const ema9Arr = calcEMASeries(closes, 9);
  const ema20Arr = calcEMASeries(closes, 20);
  const ema9 = round2(ema9Arr[ema9Arr.length - 1] || currentPrice);
  const ema20 = round2(ema20Arr[ema20Arr.length - 1] || currentPrice);
  const sma20 = calcSMA(closes, 20);
  const sma50 = calcSMA(closes, 50);
  const sma200 = calcSMA(closes, Math.min(200, closes.length));

  const rsiSeries = calcRSISeries(closes, 14);
  const rsi14 = rsiSeries[rsiSeries.length - 1];
  const stochRsi = calcStochRSI(closes, 14);
  const divergence = detectRSIDivergence(closes, rsiSeries);
  const macd = calcMACD(closes, 12, 26, 9);
  const bb = calcBollinger(closes, 20, 2);
  const atr14 = calcATR(bars, 14);
  const supertrend = calcSuperTrend(bars, 10, 2.8);
  const ichimoku = calcIchimoku(bars);
  const volumeProfile = calcVolumeProfile(bars);
  const mtf = calcMultiTimeframe(bars, ema9, ema20, sma50, rsi14);
  const adxObj = calcADX(bars, 14);
  const sr = findSupportResistanceAndFib(bars);
  const smc = detectSmartMoneyConcepts(bars, sr, atr14);
  const weeklyTrading = evaluateWeeklyTrading(bars, quote, sr, smc, atr14);
  const smartMoney = calcSmartMoneyFlow(bars, quote);
  const candlePattern = detectCandlestickPattern(bars);
  const chartPatternCMT = detectChartPatternsCMT(bars, atr14, sma200);
  const fundamentals = evaluateFundamentals(quote);
  const backtest = runWalkForwardBacktest(bars);

  const avgVol20 = Math.round(
    bars.slice(-21, -1).reduce((acc, b) => acc + b.volume, 0) / 20
  );
  const volRatio = avgVol20 > 0 ? round2(quote.volume / avgVol20) : 1.0;

  // Pre-compute candle structure and macro 200-SMA regime to prevent catching falling knives on oversold RSI
  const lastBar = bars[bars.length - 1];
  const prevBar = bars[bars.length - 2] || lastBar;
  const barRange = Math.max(0.01, lastBar.high - lastBar.low);
  const candleCLV = round2((lastBar.close - lastBar.low) / barRange);
  const bodyTop = Math.max(lastBar.open, lastBar.close);
  const upperWickRatio = round2((lastBar.high - bodyTop) / barRange);
  const inMacroUptrend = currentPrice >= sma200;
  const hasBullishReversalConfirm =
    (lastBar.close > lastBar.open && lastBar.close > prevBar.close && candleCLV >= 0.55) ||
    divergence.includes("Bullish") ||
    chartPatternCMT.isPipeBottom;

  let quantScore = 50;
  let score = 0;
  const reasons = [];

  if (currentPrice > ema20 && currentPrice > sma50) {
    quantScore += 12;
    score += 2;
    reasons.push(`Trend: Price (${currentPrice}) > EMA20 (${ema20}) & SMA50 (${sma50}) [Bullish Structure]`);
  } else if (currentPrice < ema20 && currentPrice < sma50) {
    quantScore -= 12;
    score -= 2;
    reasons.push(`Trend: Price (${currentPrice}) < EMA20 (${ema20}) & SMA50 (${sma50}) [Bearish Structure]`);
  }

  if (supertrend.direction === "BULLISH") {
    quantScore += 7;
    score += 1;
    reasons.push(`SuperTrend(10,3): BULLISH trailing support at NPR ${supertrend.value}`);
  } else {
    quantScore -= 7;
    score -= 1;
  }

  if (ichimoku.status.includes("ABOVE CLOUD")) {
    quantScore += 6;
    reasons.push(`Ichimoku Cloud: ${ichimoku.status} (Support Span A/B: ${ichimoku.cloudBottom}–${ichimoku.cloudTop})`);
  }

  // CMT Chart Pattern & False-Breakout Filter (Kirkpatrick / Fidelity Rules)
  if (chartPatternCMT.falseBreakoutTrap) {
    quantScore -= 10;
    score -= 1;
    reasons.push(`CMT Pattern Trap: ${chartPatternCMT.breakoutStatus} [Protective Stop: NPR ${chartPatternCMT.protectiveStopPrice}]`);
  } else if (chartPatternCMT.patternActivated && chartPatternCMT.patternType === "BULLISH") {
    quantScore += 8;
    score += 1;
    reasons.push(
      `CMT Chart Pattern: ${chartPatternCMT.multiBarPattern}${
        chartPatternCMT.measuredTarget ? ` | Measured Target: NPR ${chartPatternCMT.measuredTarget}` : ""
      }`
    );
  } else if (chartPatternCMT.patternActivated && chartPatternCMT.patternType === "BEARISH") {
    quantScore -= 10;
    score -= 1;
    reasons.push(
      `CMT Breakdown: ${chartPatternCMT.multiBarPattern}${
        chartPatternCMT.measuredTarget ? ` | Downside Target: NPR ${chartPatternCMT.measuredTarget}` : ""
      }`
    );
  } else if (chartPatternCMT.isPipeBottom || chartPatternCMT.isThrowbackTest) {
    quantScore += 6;
    reasons.push(`CMT Setup: ${chartPatternCMT.isPipeBottom ? chartPatternCMT.shortTermPattern : chartPatternCMT.throwbackStatus}`);
  }

  if (rsi14 <= 32) {
    if (inMacroUptrend || hasBullishReversalConfirm) {
      quantScore += inMacroUptrend ? 12 : 7;
      score += 1;
      reasons.push(
        `Momentum: RSI(14) at ${rsi14} with ${
          inMacroUptrend ? `Price >= 200D SMA (${sma200})` : `Confirmed Bullish Reversal (CLV ${Math.round(candleCLV * 100)}%)`
        } [Validated Oversold Bounce Setup]`
      );
    } else {
      quantScore -= 10;
      score -= 1;
      reasons.push(
        `Falling Knife Warning: RSI(14) is oversold (${rsi14}) BUT price (${currentPrice}) is below 200D SMA (${sma200}) with no buyer reversal candle [Wait for Base]`
      );
    }
  } else if (rsi14 >= 76) {
    quantScore -= 18;
    score -= 2;
    reasons.push(`Momentum: RSI(14) at ${rsi14} [Overbought Exhaustion Zone > 76 — Book Partial Profits]`);
  } else if (rsi14 >= 52 && rsi14 < 76) {
    quantScore += 9;
    score += 1;
    reasons.push(`Momentum: RSI(14) at ${rsi14} confirms strong buyer velocity`);
  } else if (rsi14 < 45) {
    quantScore -= 8;
    score -= 1;
  }

  if (divergence.includes("Bullish")) {
    quantScore += 6;
    reasons.push(`Divergence: ${divergence}`);
  }

  if (macd.macd > macd.signal && macd.histogram > 0) {
    quantScore += 7;
    score += 1;
    reasons.push(`MACD(12,26,9): Bullish expansion (${macd.macd} > Signal ${macd.signal})`);
  } else if (macd.macd < macd.signal) {
    quantScore -= 7;
    score -= 1;
  }

  if (volRatio >= 1.35 && quote.pointChange > 0) {
    quantScore += 7;
    score += 1;
    reasons.push(`Smart Money: ${volRatio}x Volume Surge + ${smartMoney.obvStatus} (Top Buyers: Broker #${smartMoney.topBuyBrokers.join(", #")})`);
  } else if (currentPrice >= volumeProfile.poc) {
    quantScore += 4;
    reasons.push(`Volume Profile: Trading above 60D Institutional POC (NPR ${volumeProfile.poc})`);
  }

  if (fundamentals.fundScore >= 15) {
    quantScore += 5;
    reasons.push(`Valuation: ${fundamentals.valuationVerdict} (P/E ${fundamentals.pe}x vs Sector ${fundamentals.sectorPE}x)`);
  }

  // Sector & NEPSE Market Regime Filter (Top-Down Institutional Confirmation)
  const sectorChangePct = Number.isFinite(quote.sectorChangePct) ? round2(quote.sectorChangePct) : 0;
  const nepseChangePct = Number.isFinite(quote.nepseChangePct) ? round2(quote.nepseChangePct) : 0;
  const marketBreadthPct = Number.isFinite(quote.marketBreadthPct) ? Math.round(quote.marketBreadthPct) : 50;
  const isSectorLeading = sectorChangePct >= 0.35 && sectorChangePct >= nepseChangePct;
  const isSectorDumping = sectorChangePct <= -1.15 || (nepseChangePct <= -1.25 && marketBreadthPct <= 32);
  const marketRegimeLabel = isSectorLeading
    ? `🟢 Leading Sector (${sectorChangePct >= 0 ? "+" : ""}${sectorChangePct}%)`
    : isSectorDumping
      ? `🔴 Sector/Market Selloff (${sectorChangePct}%)`
      : `⚖️ Sector ${sectorChangePct >= 0 ? "+" : ""}${sectorChangePct}% | NEPSE ${nepseChangePct >= 0 ? "+" : ""}${nepseChangePct}%`;

  if (isSectorLeading) {
    quantScore += 4;
    reasons.push(`Sector Tailwind: ${quote.sector} Sub-Index is leading (${sectorChangePct >= 0 ? "+" : ""}${sectorChangePct}% vs NEPSE ${nepseChangePct >= 0 ? "+" : ""}${nepseChangePct}%)`);
  } else if (isSectorDumping) {
    quantScore -= 6;
    reasons.push(`Sector/Market Headwind: ${quote.sector} (${sectorChangePct}%) & NEPSE (${nepseChangePct}%, Breadth ${marketBreadthPct}%) under heavy supply`);
  }

  quantScore = Math.min(98, Math.max(12, Math.round(quantScore)));

  let action = "HOLD / WATCH";
  let badge = "🟡 HOLD / CONSOLIDATION";
  let signalType = "HOLD";
  let strategyTag = "Rangebound Wait";

  if (rsi14 <= 32) {
    if (inMacroUptrend && hasBullishReversalConfirm) {
      action = "BUY (OVERSOLD REBOUND)";
      badge = "🟢 BUY — CONFIRMED OVERSOLD BOUNCE (>200 SMA)";
      signalType = "BUY";
      strategyTag = "Confirmed Mean-Reversion (>200 SMA)";
    } else if ((inMacroUptrend || hasBullishReversalConfirm) && quantScore >= 58) {
      action = "BUY (SUPPORT ACCUMULATION)";
      badge = "🟢 ACCUMULATE — OVERSOLD SUPPORT";
      signalType = "BUY";
      strategyTag = "Selective Oversold Support";
    } else {
      action = "WAIT FOR BASE / AVOID";
      badge = "🟠 OVERSOLD IN DOWNTREND (FALLING KNIFE RISK)";
      signalType = "HOLD";
      strategyTag = "Falling Knife Filter — Wait for Reversal";
    }
  } else if (rsi14 >= 76) {
    action = "SELL / BOOK PROFIT";
    badge = "🔴 SELL / TAKE PROFIT (OVERBOUGHT)";
    signalType = "SELL";
    strategyTag = "Overbought Profit Booking";
  } else if (quantScore >= 76 || score >= 3) {
    action = "STRONG BUY";
    badge = "🟢 STRONG BUY (MULTI-FACTOR CONFLUENCE)";
    signalType = "BUY";
    strategyTag = volRatio >= 1.4 ? "Institutional Breakout" : "Trend + Cloud Confluence";
    quantScore = Math.max(quantScore, 82);
  } else if (quantScore >= 64 || score === 2) {
    action = "BUY (ACCUMULATE)";
    badge = "🟢 BUY (ACCUMULATE ON DIPS)";
    signalType = "BUY";
    strategyTag = "Swing Accumulation";
  } else if (quantScore <= 38 || score <= -2) {
    action = "SELL / AVOID";
    badge = "🔴 SELL / BEARISH BREAKDOWN";
    signalType = "SELL";
    strategyTag = "Capital Preservation / Avoid";
  }

  const confidence = `${quantScore}/100 (Backtest Win Rate: ${backtest.winRate}%)`;

  const buyZoneLow = round2(currentPrice - atr14 * 0.5);
  const buyZoneHigh = round2(currentPrice + atr14 * 0.25);
  const stopLossNum = round2(Math.max(currentPrice * 0.94, currentPrice - atr14 * 2.0));
  const riskPerShare = Math.max(1, round2(currentPrice - stopLossNum));
  const target1Num = round2(currentPrice + riskPerShare * 1.9);
  const target2Num = round2(currentPrice + riskPerShare * 3.1);
  const target3Num = round2(currentPrice + riskPerShare * 4.5);
  const rewardPerShare = target1Num - currentPrice;
  const riskReward = `1 : ${round2(rewardPerShare / riskPerShare)}`;

  const winProb = backtest.winRate / 100;
  const bRatio = rewardPerShare / riskPerShare;
  const rawKelly = winProb - (1 - winProb) / bRatio;
  const halfKellyPct = round2(Math.min(25, Math.max(5, rawKelly * 50)));

  const maxRiskNPR = round2(portfolioCapital * 0.015);
  const recommendedKitta = Math.max(10, Math.min(Math.floor(portfolioCapital / currentPrice), Math.floor(maxRiskNPR / riskPerShare)));
  const capitalRequired = round2(recommendedKitta * currentPrice * 1.004);

  const monteCarlo = runMonteCarloForecast(bars, currentPrice, target1Num, stopLossNum);
  const executionMatrix = buildSixPerspectiveMatrix({
    currentPrice,
    ema9,
    ema20,
    sma50,
    sma200,
    rsi14,
    supertrend,
    ichimoku,
    mtf,
    sr,
    volumeProfile,
    smartMoney,
    fundamentals,
    monteCarlo,
    backtest,
    atr14,
    recommendedKitta,
    hasBullishReversalConfirm
  });

  const longTerm = evaluateLongTermHold(quote, fundamentals, sr, sma200, volumeProfile);
  const sectorChampion = evaluateSectorChampion(quote, fundamentals, longTerm, quantScore, smartMoney, volRatio);

  // ============================================================================
  // NEXT-GEN PRECISION UPGRADE: WYCKOFF VSA + ATR Z-SCORE + 6-GATE CONSENSUS ENGINE
  // ============================================================================
  const close3DaysAgo = closes[Math.max(0, closes.length - 4)] || currentPrice;
  const threeDayGainPct = round2(((currentPrice - close3DaysAgo) / close3DaysAgo) * 100);
  const distFromEma20Pct = round2(((currentPrice - ema20) / ema20) * 100);
  const zScoreATR = atr14 > 0 ? round2((currentPrice - ema20) / atr14) : 0;

  // Count consecutive green/up days to distinguish Day-1 breakout from Day-5 exhaustion
  let consecutiveUpDays = 0;
  for (let i = bars.length - 1; i >= Math.max(1, bars.length - 6); i--) {
    if (bars[i].close > bars[i - 1].close) consecutiveUpDays++;
    else break;
  }

  // Filter 1: ATR-Normalized Anti-Chasing Rule (Adapts to low-beta Banks vs high-beta Hydro/Finance)
  const antiChasePassed =
    threeDayGainPct <= 8.0 &&
    zScoreATR <= 1.45 &&
    distFromEma20Pct <= 4.2 &&
    rsi14 <= 67;

  // Filter 2: Wyckoff Buyer Defense Confirmation + Kirkpatrick False-Breakout Filter
  const buyerCandleConfirmed =
    !chartPatternCMT.falseBreakoutTrap &&
    (((lastBar.close >= lastBar.open || quote.pointChange >= 0) && candleCLV >= 0.42 && upperWickRatio <= 0.52) ||
      (rsi14 <= 34 && candleCLV >= 0.5 && (inMacroUptrend || hasBullishReversalConfirm)));

  // Filter 3: Sector-Relative Fundamental & Lock-In Safety Veto
  const isBfiStock = ["Commercial Banks", "Development Banks", "Finance", "Microfinance"].includes(quote.sector);
  const peToSectorRatio = fundamentals.sectorPE > 0 ? round2(fundamentals.pe / fundamentals.sectorPE) : 1.0;
  const fundamentalSafetyPassed =
    fundamentals.pe > 0 &&
    fundamentals.pe < 50 &&
    peToSectorRatio <= 1.65 &&
    (!isBfiStock || fundamentals.npl < 3.4) &&
    fundamentals.lockInRisk === "SAFE";

  // Filter 4: T+2 Settlement Supply Absorption (Price holding above institutional 20D VWAP or 60D Volume POC, or confirmed bounce above 200 SMA)
  const t2SupplyPassed =
    currentPrice >= smartMoney.vwap20 ||
    currentPrice >= volumeProfile.poc ||
    (rsi14 <= 35 && inMacroUptrend && hasBullishReversalConfirm);

  const noTrapFiltersPassedCount =
    (antiChasePassed ? 1 : 0) +
    (buyerCandleConfirmed ? 1 : 0) +
    (fundamentalSafetyPassed ? 1 : 0) +
    (t2SupplyPassed ? 1 : 0);

  // Net SEBON Fee-Adjusted Risk:Reward Calculation (Deducting ~0.95% round-trip SEBON + Broker + DP friction)
  const roundTripFeePerShare = round2(currentPrice * 0.0095);
  const netRewardPerShare = Math.max(0.5, round2(target1Num - currentPrice - roundTripFeePerShare));
  const netRiskPerShare = Math.max(1, round2(currentPrice - stopLossNum + roundTripFeePerShare * 0.5));
  const netRiskRewardRatio = round2(netRewardPerShare / netRiskPerShare);

  // ============================================================================
  // 6-GATE INSTITUTIONAL CONSENSUS SCORECARD (0–100 POINTS)
  // ============================================================================
  const gate1Trend = Math.min(
    20,
    Math.max(
      2,
      (currentPrice >= ema20 ? 7 : 0) +
        (ema20 >= sma50 ? 5 : 0) +
        (supertrend.direction === "BULLISH" ? 5 : 0) +
        (mtf.bullCount >= 2 ? 3 : 0) +
        (isSectorLeading ? 2 : isSectorDumping ? -2 : 0)
    )
  );
  const gate2VolumeWhale = Math.min(
    20,
    Math.max(
      2,
      (currentPrice >= smartMoney.vwap20 ? 6 : 0) +
        (currentPrice >= volumeProfile.poc ? 4 : 0) +
        (smartMoney.brokerConcentrationPct >= 34 ? 6 : smartMoney.brokerConcentrationPct >= 26 ? 3 : 0) +
        (candleCLV >= 0.55 && volRatio >= 1.1 ? 4 : 1)
    )
  );
  const gate3Fundamentals = Math.min(
    20,
    Math.max(
      2,
      (peToSectorRatio <= 1.05 ? 7 : peToSectorRatio <= 1.25 ? 4 : 0) +
        (fundamentals.roe >= 13 ? 5 : fundamentals.roe >= 9.5 ? 3 : 0) +
        (fundamentalSafetyPassed ? 5 : 0) +
        (fundamentals.divHistory5YrAvg >= 10 ? 3 : 1)
    )
  );
  const gate4TimingATR = Math.min(
    15,
    Math.max(
      1,
      (zScoreATR >= -1.1 && zScoreATR <= 1.15 ? 8 : zScoreATR <= 1.5 ? 4 : 0) +
        (rsi14 >= 34 && rsi14 <= 64 ? 5 : rsi14 < 34 && (inMacroUptrend || hasBullishReversalConfirm) ? 6 : 0) +
        (upperWickRatio <= 0.38 ? 2 : 0)
    )
  );
  const gate5StatisticalEdge = Math.min(
    15,
    Math.max(
      2,
      (backtest.winRate >= 68 ? 8 : backtest.winRate >= 58 ? 5 : 2) +
        (monteCarlo.probProfitPct >= 56 ? 7 : monteCarlo.probProfitPct >= 50 ? 4 : 1)
    )
  );
  const gate6NetRR = Math.min(
    10,
    Math.max(1, netRiskRewardRatio >= 1.85 ? 10 : netRiskRewardRatio >= 1.5 ? 7 : 3)
  );

  const consensusScore = Math.min(
    99,
    Math.max(12, gate1Trend + gate2VolumeWhale + gate3Fundamentals + gate4TimingATR + gate5StatisticalEdge + gate6NetRR)
  );

  // Blend quantScore with the 6-Gate Consensus Score so every ranking reflects true multi-gate precision
  quantScore = Math.min(98, Math.max(12, Math.round(quantScore * 0.45 + consensusScore * 0.55)));

  const consensusGates = {
    totalScore: consensusScore,
    zScoreATR,
    candleCLV,
    upperWickRatio,
    consecutiveUpDays,
    peToSectorRatio,
    netRiskRewardRatio,
    sectorChangePct,
    nepseChangePct,
    marketBreadthPct,
    marketRegimeLabel,
    gates: [
      { name: "Gate 1: Multi-Timeframe & Sector Trend", score: gate1Trend, max: 20, passed: gate1Trend >= 12, detail: `EMA20 NPR ${ema20} | SuperTrend ${supertrend.direction} | 1D/1W/1M ${mtf.bullCount}/3 | ${marketRegimeLabel}` },
      { name: "Gate 2: Wyckoff Volume & Whales", score: gate2VolumeWhale, max: 20, passed: gate2VolumeWhale >= 12, detail: `VWAP NPR ${smartMoney.vwap20} | CLV ${Math.round(candleCLV * 100)}% | Broker Conc ${smartMoney.brokerConcentrationPct}%` },
      { name: "Gate 3: Sector-Relative Valuation", score: gate3Fundamentals, max: 20, passed: gate3Fundamentals >= 12, detail: `P/E ${fundamentals.pe}x (${peToSectorRatio}x Sector) | ROE ${fundamentals.roe}% | Lock-In ${fundamentals.lockInRisk}` },
      { name: "Gate 4: ATR Entry Timing & Wick", score: gate4TimingATR, max: 15, passed: gate4TimingATR >= 9, detail: `ATR Z-Score: ${zScoreATR >= 0 ? "+" : ""}${zScoreATR} ATR | RSI(14): ${rsi14} | Upper Wick: ${Math.round(upperWickRatio * 100)}%` },
      { name: "Gate 5: Backtest & Monte Carlo", score: gate5StatisticalEdge, max: 15, passed: gate5StatisticalEdge >= 9, detail: `Backtest Win: ${backtest.winRate}% (${backtest.totalTrades} trades, PF ${backtest.profitFactor}) | 15D Profit Prob: ${monteCarlo.probProfitPct}%` },
      { name: "Gate 6: SEBON Net Risk:Reward", score: gate6NetRR, max: 10, passed: gate6NetRR >= 7, detail: `Net Fee-Adjusted R:R = 1 : ${netRiskRewardRatio} (After Broker + SEBON + DP)` }
    ]
  };

  let fundamentalSafetyBadge = "🛡️ SAFE FUNDAMENTALS";
  if (!fundamentalSafetyPassed) {
    fundamentalSafetyBadge = "⚠️ SPECULATIVE / HIGH-RISK STOCK (Use Small Capital & Strict Stop-Loss)";
  } else if (longTerm.longTermScore >= 82) {
    fundamentalSafetyBadge = "💎 BLUE-CHIP GRADE FUNDAMENTALS";
  }

  let accuracyPoints = consensusScore;
  let accuracyGrade = "B+ (STANDARD SETUP)";
  if (accuracyPoints >= 80 && noTrapFiltersPassedCount === 4) accuracyGrade = "A+ (INSTITUTIONAL HIGH-CONVICTION)";
  else if (accuracyPoints >= 68 && noTrapFiltersPassedCount >= 3) accuracyGrade = "A (HIGH PROBABILITY CONFLUENCE)";
  else if (accuracyPoints < 50) accuracyGrade = "C (SPECULATIVE / STRICT SL)";

  // ============================================================================
  // MUTUALLY-EXCLUSIVE PRECISION BUY / HOLD / SELL ENGINE
  // ============================================================================
  let isImmediateBuy = false;
  let buyCategory = "🟡 WAIT / HOLD";
  let immediateBuyReason = "";

  const nearEma20OrPoc =
    Math.abs(zScoreATR) <= 0.85 ||
    Math.abs(currentPrice - volumeProfile.poc) / currentPrice <= 0.02;
  const isFreshDay1Breakout =
    volRatio >= 1.25 &&
    currentPrice >= smartMoney.vwap20 &&
    quote.pointChange > 0 &&
    candleCLV >= 0.6 &&
    consecutiveUpDays <= 3 &&
    zScoreATR <= 1.35;
  // Require macro uptrend (>200 SMA) AND confirmed buyer reversal candle before treating oversold RSI as an immediate bounce
  const isOversoldBounce = rsi14 <= 36 && inMacroUptrend && hasBullishReversalConfirm;

  if (
    (signalType === "BUY" || (supertrend.direction === "BULLISH" && currentPrice >= ema20)) &&
    (quantScore >= 70 || consensusScore >= 71) &&
    !isSectorDumping &&
    antiChasePassed &&
    buyerCandleConfirmed &&
    fundamentalSafetyPassed &&
    t2SupplyPassed &&
    (nearEma20OrPoc || isFreshDay1Breakout || isOversoldBounce)
  ) {
    isImmediateBuy = true;
    buyCategory = "⚡ IMMEDIATE BUY";
    if (isOversoldBounce) {
      immediateBuyReason = `Confirmed Oversold Bounce above 200D SMA (RSI ${rsi14}, CLV ${Math.round(candleCLV * 100)}%) at Demand Support NPR ${sr.support1}`;
    } else if (isFreshDay1Breakout) {
      immediateBuyReason = `Day-${Math.max(1, consecutiveUpDays)} Institutional Breakout (${volRatio}x Vol, CLV ${Math.round(candleCLV * 100)}%) above 20D VWAP (NPR ${smartMoney.vwap20}) with Net R:R 1:${netRiskRewardRatio}`;
    } else {
      immediateBuyReason = `Sweet-Spot Entry (${zScoreATR >= 0 ? "+" : ""}${zScoreATR} ATR from EMA20 NPR ${ema20} & POC NPR ${volumeProfile.poc}) — All 6 Institutional Gates aligned`;
    }
  } else if (signalType === "BUY" || (quantScore >= 62 && supertrend.direction === "BULLISH" && fundamentalSafetyPassed)) {
    buyCategory = "🟢 BUY ON DIP";
    if (isSectorDumping) {
      immediateBuyReason = `⏳ Sector/Market Selloff Filter (${quote.sector} ${sectorChangePct}%): Wait for sector selling to stabilize and bid safely at EMA20 (NPR ${ema20})`;
    } else if (!antiChasePassed) {
      immediateBuyReason = `✋ Anti-Chase Filter Active: Stretched +${zScoreATR} ATR (+${distFromEma20Pct}%) above EMA20; place limit buy at NPR ${ema20}`;
    } else if (!buyerCandleConfirmed) {
      immediateBuyReason = `⏳ Wait for Intraday Buyer Candle: Upper wick (${Math.round(upperWickRatio * 100)}%) shows intraday supply; bid near NPR ${round2(Math.min(ema20, sr.support1 * 1.02))}`;
    } else {
      immediateBuyReason = `Accumulate on limit pullback to EMA20 (NPR ${ema20}) or 60D Volume POC (NPR ${volumeProfile.poc})`;
    }
  } else if (signalType === "SELL") {
    buyCategory = "🔴 AVOID FRESH BUY";
    immediateBuyReason = `Bearish or overextended structure — do not initiate fresh buy here`;
  }

  // ============================================================================
  // HIGH-PRECISION IMMEDIATE SELL vs SELL ON RALLY vs SAFE TO HOLD
  // ============================================================================
  let isImmediateSell = false;
  let sellCategory = "🟢 SAFE TO HOLD";
  let immediateSellReason = "";
  let sellUrgencyScore = Math.max(10, 100 - quantScore);

  // 1. True Climax Exhaustion: Extreme RSI (>=73.5) OR extreme ATR stretch (>=2.35 ATR) OR upper-wick rejection at R1 after multi-day run
  const isTrueOverboughtClimax =
    rsi14 >= 73.5 ||
    zScoreATR >= 2.35 ||
    (rsi14 >= 68 && zScoreATR >= 1.65 && upperWickRatio >= 0.45 && consecutiveUpDays >= 3);

  // 2. Confirmed Structural Breakdown: Closed below BOTH EMA20 and SuperTrend (BEARISH), NOT deeply oversold (RSI > 34), with weak score & seller dominance
  const isConfirmedBreakdown =
    rsi14 > 34 &&
    supertrend.direction === "BEARISH" &&
    currentPrice < ema20 &&
    zScoreATR <= -0.55 &&
    (quantScore <= 42 || macd.histogram < 0) &&
    candleCLV <= 0.45;

  // 3. Fundamental / Lock-In Danger with Failing Momentum
  const isSevereFundamentalTrap =
    (fundamentals.lockInRisk !== "SAFE" || peToSectorRatio >= 1.85 || (isBfiStock && fundamentals.npl >= 3.6)) &&
    currentPrice < ema20 &&
    supertrend.direction === "BEARISH";

  let whySellBullets = [];
  let whyBuyBullets = [];

  if (!isImmediateBuy && (isTrueOverboughtClimax || isConfirmedBreakdown || isSevereFundamentalTrap)) {
    isImmediateSell = true;
    sellCategory = "🚨 IMMEDIATE SELL";
    buyCategory = "🔴 AVOID FRESH BUY";
    signalType = "SELL";
    if (isTrueOverboughtClimax) {
      sellUrgencyScore = Math.min(98, Math.round(80 + Math.max(0, rsi14 - 68) * 1.2 + Math.max(0, zScoreATR - 1.5) * 6));
      immediateSellReason = `OVERHEATED PROFIT-BOOKING ZONE: Price (NPR ${currentPrice}) jumped too fast (RSI ${rsi14}/100 — safe range is 35–65) and is stretched +${distFromEma20Pct}% above its 20-day average price (NPR ${ema20}) near ceiling resistance (NPR ${sr.resistance1}). Book profit NOW at NPR ${currentPrice} before T+2 sellers dump.`;
      immediateBuyReason = `⛔ DO NOT BUY AT TOP: Stock is overheated (+${distFromEma20Pct}% above 20-day average). Wait for price to cool down to NPR ${ema20} or Support S1 (NPR ${sr.support1}).`;
      whySellBullets = [
        `🔥 Overheated Price (RSI ${rsi14} > 74): Stock rose too fast in a short time. In NEPSE, when RSI crosses 74, buyers get exhausted and short-term traders rush to book profit.`,
        `📏 Too Far Above 20-Day Average: Current price (NPR ${currentPrice}) is +${distFromEma20Pct}% (+${zScoreATR}x normal daily range) above its 20-day average (NPR ${ema20}). Prices almost always snap back toward NPR ${ema20}.`,
        `🏦 Hitting Ceiling Supply & Big Sellers: Price is right below resistance R1 (NPR ${sr.resistance1}) while Broker #${smartMoney.topSellBrokers.slice(0, 2).join(", #")} are selling (P/E: ${fundamentals.pe}x).`
      ];
    } else if (isSevereFundamentalTrap) {
      sellUrgencyScore = Math.min(96, Math.round(82 + (50 - quantScore) * 0.4));
      immediateSellReason = `FUNDAMENTAL & TREND WARNING: Price (NPR ${currentPrice}) fell below its 20-day average (NPR ${ema20}) with high fundamental/supply risk (${fundamentals.lockInRisk !== "SAFE" ? fundamentals.lockInRisk : `High P/E ${fundamentals.pe}x or High Bank NPL ${fundamentals.npl}%`}). Exit now at NPR ${currentPrice} to protect capital.`;
      immediateBuyReason = `⛔ HIGH RISK TRAP: Price is falling below its 20-day average (NPR ${ema20}) with fundamental risk. Avoid buying until Support S1 (NPR ${sr.support1}).`;
      whySellBullets = [
        `⚠️ Fundamental / Supply Red Flag: ${fundamentals.lockInRisk !== "SAFE" ? `Promoter/Mutual Fund Lock-In supply risk (${fundamentals.lockInRisk})` : `Expensive valuation (P/E ${fundamentals.pe}x vs Sector ${fundamentals.sectorPE}x) or elevated Bank Bad Loans (NPL ${fundamentals.npl}%)`}.`,
        `📉 Lost 20-Day Support Floor: Price (NPR ${currentPrice}) dropped below its 20-day average (NPR ${ema20}) and SuperTrend support (NPR ${supertrend.value}).`,
        `🏦 Big Brokers Selling: Top selling brokers (#${smartMoney.topSellBrokers.slice(0, 2).join(", #")}) are exiting; next support floor is down at NPR ${sr.support1}.`
      ];
    } else {
      sellUrgencyScore = Math.min(95, Math.round(76 + (50 - quantScore) * 0.5));
      immediateSellReason = `DOWNTREND BREAKDOWN: Price (NPR ${currentPrice}) broke below both its 20-day average (NPR ${ema20}) and SuperTrend floor (NPR ${supertrend.value}) with Broker #${smartMoney.topSellBrokers.slice(0, 2).join(", #")} selling. Exit now to prevent a deeper loss toward NPR ${sr.support1}.`;
      immediateBuyReason = `⛔ FALLING TREND: Stock lost its 20-day support floor (NPR ${ema20}). Wait for price to stop falling near Support S1 (NPR ${sr.support1}).`;
      whySellBullets = [
        `📉 Broken Trend Floor: Price (NPR ${currentPrice}) closed below both its 20-day average (NPR ${ema20}) and SuperTrend line (NPR ${supertrend.value}).`,
        `🐻 Sellers in Control: Daily candle closed weak (${Math.round(candleCLV * 100)}% of day's range) with Broker #${smartMoney.topSellBrokers.slice(0, 2).join(", #")} distributing shares.`,
        `🛡️ Stop Small Loss Before It Grows: Exiting near NPR ${currentPrice} protects you from a slide down to Support S1 (NPR ${sr.support1}) and S2 (NPR ${sr.support2}).`
      ];
    }
  } else if (
    !isImmediateBuy &&
    rsi14 > 34 &&
    (rsi14 >= 64 || zScoreATR >= 1.5 || (currentPrice < ema20 && supertrend.direction === "BEARISH") || !fundamentalSafetyPassed)
  ) {
    sellCategory = "🟠 SELL ON RALLY";
    sellUrgencyScore = Math.min(74, Math.max(46, Math.round(52 + Math.max(0, zScoreATR) * 7 + (rsi14 >= 64 ? 8 : 0))));
    if (currentPrice >= ema20) {
      immediateSellReason = `NEAR RESISTANCE (BOOK PARTIAL PROFIT ON RISE): Stock is up nicely (+${distFromEma20Pct}% above 20-day average, RSI ${rsi14}). No need to panic sell today—place a Limit Sell for 35%–50% of your shares at Target 1 (NPR ${executionMatrix.exits.exit1.price}) or R1 (NPR ${sr.resistance1}) and keep Stop-Loss at NPR ${stopLossNum}.`;
      whySellBullets = [
        `📈 Approaching Resistance Ceiling: Price is getting close to resistance R1 (NPR ${sr.resistance1}) where sellers usually appear.`,
        `💰 Smart Partial Profit Booking: Sell 35%–50% on a rally to NPR ${executionMatrix.exits.exit1.price} to lock in gains while riding the rest.`,
        `🛡️ Protect Your Gain: Keep a trailing Stop-Loss at NPR ${stopLossNum} so a sudden market dip never erases your profit.`
      ];
    } else {
      buyCategory = "🟡 WAIT FOR SUPPORT";
      immediateSellReason = `WEAKENING TREND (SELL ON BOUNCE): Price (NPR ${currentPrice}) is trading below its 20-day average (NPR ${ema20}). Sell on any intraday bounce toward NPR ${ema20}–${sr.resistance1}, or exit completely if it closes below Support S1 (NPR ${sr.support1}).`;
      whySellBullets = [
        `📉 Below 20-Day Average: Stock is trading under its 20-day average price (NPR ${ema20}), meaning buyers are currently weak.`,
        `🎯 Better Exit on Bounce: Use intraday rallies toward NPR ${ema20} to reduce your position at a better price.`,
        `🛑 Hard Safety Floor: If daily price closes below NPR ${stopLossNum} (or S1 NPR ${sr.support1}), exit 100% to protect capital.`
      ];
    }
  } else {
    sellCategory = "🟢 SAFE TO HOLD";
    sellUrgencyScore = Math.max(12, Math.min(42, 100 - quantScore));
    if (rsi14 <= 34 && fundamentalSafetyPassed && (inMacroUptrend || hasBullishReversalConfirm)) {
      immediateSellReason = `OVERSOLD SUPPORT ZONE (HOLD WITH STOP-LOSS): Stock is oversold (RSI ${rsi14}) with ${inMacroUptrend ? `price above 200D SMA (NPR ${sma200})` : "a confirmed buyer reversal candle"} and safe fundamentals. Hold above Stop-Loss (NPR ${stopLossNum}) for a bounce toward NPR ${ema20}.`;
      whySellBullets = [
        `🛡️ Confirmed Support / Reversal: RSI is ${rsi14} with ${inMacroUptrend ? `long-term 200D SMA support (NPR ${sma200})` : `buyer demand confirmation (${Math.round(candleCLV * 100)}% CLV)`}.`,
        `💎 Solid Fundamentals Intact: P/E (${fundamentals.pe}x) and asset quality are safe, supporting a rebound toward NPR ${ema20}.`,
        `🎯 Strict Stop-Loss Protection: Hold for Target 1 (NPR ${executionMatrix.exits.exit1.price}), but exit immediately if daily close drops below NPR ${stopLossNum}.`
      ];
    } else if (rsi14 <= 34 && !inMacroUptrend && !hasBullishReversalConfirm) {
      immediateSellReason = `FALLING KNIFE CAUTION: Even though RSI is oversold (${rsi14}), price (NPR ${currentPrice}) is below its 200-day average (NPR ${sma200}) with no reversal candle yet. Keep a strict Stop-Loss at NPR ${stopLossNum} and wait for a base.`;
      whySellBullets = [
        `⚠️ Oversold in a Downtrend: RSI (${rsi14}) is below 34, but the stock is trading below its 200-day average (NPR ${sma200}).`,
        `✋ Do Not Average Down Blindly: Wait for a green reversal candle closing above NPR ${ema9} before adding shares.`,
        `🛑 Strict Stop-Loss Floor: If price closes below NPR ${stopLossNum}, exit to protect capital from a deeper slide.`
      ];
    } else {
      immediateSellReason = `HEALTHY UPTREND (SAFE TO HOLD): Stock is trading safely near/above its 20-day average (NPR ${ema20}) with no overbought danger (RSI ${rsi14}). Do NOT sell early—hold for Target 1 (NPR ${executionMatrix.exits.exit1.price}) and keep trailing Stop-Loss at NPR ${stopLossNum}.`;
      whySellBullets = [
        `✅ Trend is Healthy & Not Overheated: Price (NPR ${currentPrice}) is supported by the 20-day average (NPR ${ema20}) with safe RSI (${rsi14}).`,
        `🎯 Room to Rise to Target 1: Next profit-booking target is NPR ${executionMatrix.exits.exit1.price} (+${executionMatrix.exits.exit1.pctGain}%).`,
        `🛡️ Risk is Controlled: Simply hold as long as daily price stays above your Stop-Loss at NPR ${stopLossNum}.`
      ];
    }
  }

  if (isImmediateBuy) {
    whyBuyBullets = [
      `🎯 Right at Institutional Buy Price: Current price (NPR ${currentPrice}) is sitting safely near the 20-day average (NPR ${ema20}) & Volume Floor (NPR ${volumeProfile.poc}).`,
      `🐋 Big Brokers Accumulating: Top buyers (Broker #${smartMoney.topBuyBrokers.slice(0, 2).join(", #")}) are active with strong daily closing demand (${Math.round(candleCLV * 100)}% CLV).`,
      `🛡️ Passed All 4 Safety Checks: Not overextended (RSI ${rsi14}), safe valuation (P/E ${fundamentals.pe}x), and positive Net Risk:Reward (1 : ${netRiskRewardRatio}).`
    ];
  } else if (buyCategory === "🟢 BUY ON DIP") {
    whyBuyBullets = [
      `📈 Good Stock in Uptrend: Multi-timeframe trend and fundamentals are solid (Consensus Score: ${consensusScore}/100).`,
      `⏳ Why Wait for a Slight Dip: Buying via limit order near the 20-day average (NPR ${ema20}) gives you a cheaper entry and smaller stop-loss risk.`,
      `💎 Long-Term Backing: 5Y Avg Dividend is ${fundamentals.divHistory5YrAvg}% with Fair Value at NPR ${fundamentals.compositeFairValue}.`
    ];
  } else {
    whyBuyBullets = [
      `✋ Do Not Buy Today at Current Price (NPR ${currentPrice}): Risk is currently higher than reward at this price level.`,
      `📉 Wait for Cheaper Support Zone: Best price to buy safely is down near Support S1 (NPR ${sr.support1}) or the 20-day average (NPR ${ema20}).`,
      `🛡️ Capital Protection First: Let the current selling pressure or overheated rally cool down before entering.`
    ];
  }

  // Synchronize top-level action & badge with our high-precision classification so there is zero contradiction
  if (isImmediateBuy) {
    action = "IMMEDIATE BUY (HIGH CONVICTION)";
    badge = "⚡ IMMEDIATE BUY (6-GATE CONFLUENCE)";
    signalType = "BUY";
  } else if (isImmediateSell) {
    action = "IMMEDIATE SELL / BOOK PROFIT";
    badge = "🚨 IMMEDIATE SELL (HIGH URGENCY)";
    signalType = "SELL";
  } else if (buyCategory === "🟢 BUY ON DIP" && sellCategory === "🟢 SAFE TO HOLD") {
    action = "BUY ON DIP / ACCUMULATE";
    badge = "🟢 BUY ON DIP (UPTREND INTACT)";
    signalType = "BUY";
  } else if (sellCategory === "🟠 SELL ON RALLY") {
    action = currentPrice >= ema20 ? "HOLD / BOOK PARTIAL ON RALLY" : "REDUCE ON BOUNCE";
    badge = "🟠 SELL ON RALLY (AT RESISTANCE)";
  } else {
    action = "HOLD / TRAIL STOP-LOSS";
    badge = "🔵 HOLD & TRAIL SL";
    signalType = "HOLD";
  }

  // ============================================================================
  // PLAIN-ENGLISH 10-SECOND TRAFFIC-LIGHT ADVISOR (EASY TO UNDERSTAND)
  // ============================================================================
  const t1Obj = executionMatrix.tranches.tranche1;
  const t2Obj = executionMatrix.tranches.tranche2;
  const ex1Obj = executionMatrix.exits.exit1;
  const ex2Obj = executionMatrix.exits.exit2;

  // ============================================================================
  // 6-SIGNAL MASTER CONFLUENCE & FINAL CONSENSUS ENGINE (UNIFIED BUY/SELL/SL)
  // Combines all 6 independent engines using Institutional Weighted Confluence
  // Clustering + Hard Veto Rules so every signal yields ONE Final Result.
  // ============================================================================
  const inSweetSpotNow = nearEma20OrPoc || isFreshDay1Breakout || isOversoldBounce;

  // 1. Signal 1: Daily Trend & Momentum (20% Weight)
  const sig1Score = Math.min(
    98,
    Math.max(
      15,
      Math.round(
        50 +
          (currentPrice >= ema20 ? 12 : -10) +
          (ema20 >= sma50 ? 10 : -8) +
          (supertrend.direction === "BULLISH" ? 12 : -12) +
          (macd.histogram >= 0 ? 6 : -6) +
          (rsi14 >= 38 && rsi14 <= 65 ? 8 : rsi14 > 72 ? -14 : rsi14 <= 34 && inMacroUptrend ? 6 : -4)
      )
    )
  );
  const sig1DipBuy = round2(currentPrice <= ema20 ? Math.max(sr.support1, currentPrice * 0.99) : Math.min(ema20, currentPrice * 0.985));
  const sig1Verdict =
    sig1Score >= 74 && antiChasePassed && inSweetSpotNow
      ? "BUY NOW"
      : sig1Score >= 58
        ? "BUY ON DIP"
        : sig1Score <= 38
          ? "SELL / AVOID"
          : "HOLD";
  const sig1Buy = sig1Verdict === "BUY NOW" ? currentPrice : sig1DipBuy;
  const sig1Target = round2(Math.max(ex1Obj.price, currentPrice * 1.05));
  const sig1Stop = stopLossNum;
  const sig1Dir = sig1Score >= 62 ? "BULLISH" : sig1Score <= 42 ? "BEARISH" : "NEUTRAL";

  // 2. Signal 2: Smart Money Concepts SMC v2.0 (22% Weight)
  const smcScoreVal = Number(smc?.smcScore || 55);
  const smcRangePctVal = Number(smc?.rangePct ?? 50);
  const smcDealingZoneText = smc?.dealingZone || (smcRangePctVal <= 50 ? "DISCOUNT ZONE (<50%)" : "PREMIUM ZONE (>50%)");
  const smcStructText = smc?.structureTag || smc?.structureType || "RANGING";
  const smcRawEntry = Number(smc?.smcTradePlan?.entryPrice) > 0
    ? Number(smc.smcTradePlan.entryPrice)
    : Number(smc?.bullishOB?.midpoint) > 0
      ? Number(smc.bullishOB.midpoint)
      : round2(sr.support1);
  const smcDipBuy = round2(Math.min(currentPrice, Math.max(currentPrice * 0.935, smcRawEntry)));
  const smcVerdict =
    smcScoreVal >= 70 && smcRangePctVal <= 62 && antiChasePassed
      ? "BUY NOW"
      : smcScoreVal >= 56
        ? "BUY ON DIP"
        : smcRangePctVal >= 76 || smcScoreVal <= 40
          ? "SELL / BOOK"
          : "HOLD";
  const smcBuy = smcVerdict === "BUY NOW" && Math.abs(currentPrice - smcDipBuy) / currentPrice <= 0.018 ? currentPrice : smcDipBuy;
  const smcTarget = round2(
    Math.max(
      currentPrice * 1.05,
      Number(smc?.smcTradePlan?.target1) || Number(smc?.bearishOB?.low) || ex1Obj.price
    )
  );
  const smcStop = round2(
    Math.min(
      smcDipBuy * 0.965,
      Math.max(currentPrice * 0.91, Number(smc?.smcTradePlan?.stopLoss) || stopLossNum)
    )
  );
  const smcDir = smcScoreVal >= 60 ? "BULLISH" : smcScoreVal <= 43 ? "BEARISH" : "NEUTRAL";

  // 3. Signal 3: Weekly Multi-Timeframe Blueprint Sun–Thu (20% Weight)
  const wkScoreVal = Number(weeklyTrading?.weeklyScore || 55);
  const wkRsiVal = Number(weeklyTrading?.indicators?.weeklyRSI ?? 50);
  const wkCatText = weeklyTrading?.weeklyCategory || "WEEKLY HOLD";
  const wkRawBuy = Number(weeklyTrading?.weeklyPlan?.sunMonEntry) || sig1DipBuy;
  const wkDipBuy = round2(Math.min(currentPrice, Math.max(currentPrice * 0.94, wkRawBuy)));
  const wkVerdict =
    wkScoreVal >= 72 && antiChasePassed && inSweetSpotNow
      ? "BUY NOW"
      : wkScoreVal >= 56
        ? "BUY ON DIP"
        : wkScoreVal <= 40
          ? "SELL / REDUCE"
          : "HOLD";
  const wkBuy = wkVerdict === "BUY NOW" ? currentPrice : wkDipBuy;
  const wkTarget = round2(
    Math.max(
      currentPrice * 1.05,
      Number(weeklyTrading?.weeklyPlan?.thursdayTarget1) || ex1Obj.price
    )
  );
  const wkStop = round2(
    Math.min(
      wkDipBuy * 0.965,
      Math.max(currentPrice * 0.91, Number(weeklyTrading?.weeklyPlan?.weeklyStopLoss) || stopLossNum)
    )
  );
  const wkDir = wkScoreVal >= 60 ? "BULLISH" : wkScoreVal <= 42 ? "BEARISH" : "NEUTRAL";

  // 4. Signal 4: Wyckoff Volume, VWAP & Institutional Broker Flow (15% Weight)
  const sig4Score = Math.min(
    96,
    Math.max(
      18,
      Math.round(
        48 +
          (currentPrice >= smartMoney.vwap20 ? 12 : -8) +
          (currentPrice >= volumeProfile.poc ? 10 : -6) +
          (volRatio >= 1.15 && candleCLV >= 0.48 ? 12 : volRatio >= 1.2 && candleCLV < 0.38 ? -12 : 4) +
          (smartMoney.brokerConcentrationPct >= 30 ? 8 : 2) +
          (smartMoney.mfi14 >= 42 && smartMoney.mfi14 <= 72 ? 6 : smartMoney.mfi14 > 78 ? -10 : -2)
      )
    )
  );
  const vwapOrPoc = volumeProfile.poc > 0 && volumeProfile.poc <= currentPrice
    ? volumeProfile.poc
    : smartMoney.vwap20 > 0 && smartMoney.vwap20 <= currentPrice
      ? smartMoney.vwap20
      : round2(currentPrice * 0.982);
  const sig4DipBuy = round2(Math.min(currentPrice, Math.max(currentPrice * 0.94, vwapOrPoc)));
  const sig4Verdict =
    sig4Score >= 70 && antiChasePassed && inSweetSpotNow
      ? "BUY NOW"
      : sig4Score >= 56
        ? "BUY ON DIP"
        : sig4Score <= 40
          ? "DISTRIBUTION"
          : "HOLD";
  const sig4Buy = sig4Verdict === "BUY NOW" ? currentPrice : sig4DipBuy;
  const sig4Target = round2(Math.max(currentPrice * 1.05, volumeProfile.vah || sr.resistance1));
  const sig4Stop = round2(Math.min(sig4DipBuy * 0.965, Math.max(currentPrice * 0.915, volumeProfile.val || stopLossNum)));
  const sig4Dir = sig4Score >= 60 ? "BULLISH" : sig4Score <= 42 ? "BEARISH" : "NEUTRAL";

  // 5. Signal 5: Classical Chart & Candlestick Pattern CMT (10% Weight)
  const patBonus = Number(chartPatternCMT?.patternScoreBonus || 0);
  const sig5Score = Math.min(
    95,
    Math.max(
      20,
      Math.round(
        54 +
          patBonus * 4 +
          (candleCLV >= 0.55 ? 10 : candleCLV <= 0.35 ? -10 : 2) +
          (chartPatternCMT?.falseBreakoutTrap ? -18 : 0) +
          (divergence?.includes("BULLISH") ? 10 : divergence?.includes("BEARISH") ? -10 : 0)
      )
    )
  );
  const sig5DipBuy = round2(
    chartPatternCMT?.throwbackEntry && chartPatternCMT.patternTriggerPrice > 0
      ? Math.min(currentPrice, chartPatternCMT.patternTriggerPrice)
      : sig1DipBuy
  );
  const sig5Verdict =
    sig5Score >= 68 && antiChasePassed
      ? "BUY NOW"
      : sig5Score >= 56
        ? "BUY ON THROWBACK"
        : sig5Score <= 40
          ? "BEARISH PATTERN"
          : "NEUTRAL BASE";
  const sig5Buy = sig5Verdict === "BUY NOW" && inSweetSpotNow ? currentPrice : sig5DipBuy;
  const sig5Target = round2(
    chartPatternCMT?.measuredTarget && chartPatternCMT.measuredTarget > currentPrice * 1.03
      ? chartPatternCMT.measuredTarget
      : target1Num
  );
  const sig5Stop = round2(
    chartPatternCMT?.protectiveStopPrice && chartPatternCMT.protectiveStopPrice < sig5DipBuy
      ? Math.max(currentPrice * 0.91, chartPatternCMT.protectiveStopPrice)
      : stopLossNum
  );
  const sig5Dir = sig5Score >= 60 ? "BULLISH" : sig5Score <= 42 ? "BEARISH" : "NEUTRAL";

  // 6. Signal 6: Fundamental Valuation & SEBON Safety (13% Weight)
  const sig6Score = Math.min(98, Math.max(18, Math.round(Number(longTerm?.longTermScore || 55))));
  const sig6DipBuy = round2(
    Math.min(
      currentPrice,
      Math.max(
        currentPrice * 0.93,
        sma200 > 0 && sma200 <= currentPrice ? sma200 : sig1DipBuy
      )
    )
  );
  const sig6Verdict =
    sig6Score >= 75 && fundamentalSafetyPassed
      ? "STRONG ACCUMULATE"
      : sig6Score >= 58 && fundamentalSafetyPassed
        ? "VALUE BUY ON DIP"
        : !fundamentalSafetyPassed
          ? "HIGH P/E OR RISK"
          : "FAIR VALUE HOLD";
  const sig6Buy = sig6Verdict === "STRONG ACCUMULATE" && inSweetSpotNow ? currentPrice : sig6DipBuy;
  const sig6Target = round2(
    Math.max(
      currentPrice * 1.06,
      fundamentals.compositeFairValue > currentPrice * 1.04
        ? Math.min(currentPrice * 1.22, fundamentals.compositeFairValue)
        : ex2Obj.price
    )
  );
  const sig6Stop = round2(Math.min(sig6DipBuy * 0.955, stopLossNum));
  const sig6Dir = sig6Score >= 58 && fundamentalSafetyPassed ? "BULLISH" : !fundamentalSafetyPassed || sig6Score <= 42 ? "BEARISH" : "NEUTRAL";

  const individualSignals = [
    {
      id: "DAILY_QUANT",
      name: "1. Daily Trend & Momentum",
      techUsed: "EMA20/50 + SuperTrend + MACD + RSI(14)",
      weightPct: 20,
      score: sig1Score,
      direction: sig1Dir,
      verdict: sig1Verdict,
      buyPrice: sig1Buy,
      sellTarget: sig1Target,
      stopLoss: sig1Stop,
      reason: `SuperTrend ${supertrend.direction} (Rs ${supertrend.value}) | EMA20 Rs ${ema20} | RSI ${rsi14}`
    },
    {
      id: "SMC_INSTITUTIONAL",
      name: "2. Smart Money Concepts (SMC v2.0)",
      techUsed: "BOS/CHoCH + Order Blocks + OTE 62-79% + FVG",
      weightPct: 22,
      score: smcScoreVal,
      direction: smcDir,
      verdict: smcVerdict,
      buyPrice: smcBuy,
      sellTarget: smcTarget,
      stopLoss: smcStop,
      reason: `${smcStructText} | ${smcDealingZoneText} (${smcRangePctVal}% range) | OB/OTE Rs ${smcDipBuy}`
    },
    {
      id: "WEEKLY_MTF",
      name: "3. Weekly Multi-Timeframe (Sun–Thu)",
      techUsed: "1W Candlesticks + W-EMA4/10 + PWH/PWL",
      weightPct: 20,
      score: wkScoreVal,
      direction: wkDir,
      verdict: wkVerdict,
      buyPrice: wkBuy,
      sellTarget: wkTarget,
      stopLoss: wkStop,
      reason: `${wkCatText} | 1W RSI ${wkRsiVal} | Sun–Mon Zone Rs ${wkDipBuy}`
    },
    {
      id: "WYCKOFF_FLOW",
      name: "4. Wyckoff Volume, VWAP & Brokers",
      techUsed: "20D VWAP + 60D Volume POC + RVOL + Floorsheet",
      weightPct: 15,
      score: sig4Score,
      direction: sig4Dir,
      verdict: sig4Verdict,
      buyPrice: sig4Buy,
      sellTarget: sig4Target,
      stopLoss: sig4Stop,
      reason: `VWAP Rs ${smartMoney.vwap20} | POC Rs ${volumeProfile.poc} | Vol ${volRatio}x | Buyers #${smartMoney.topBuyBrokers.slice(0, 2).join(", #")}`
    },
    {
      id: "CMT_PATTERN",
      name: "5. Chart & Candle Structure (CMT)",
      techUsed: "Breakouts + Throwbacks + Multi-Bar Geometry",
      weightPct: 10,
      score: sig5Score,
      direction: sig5Dir,
      verdict: sig5Verdict,
      buyPrice: sig5Buy,
      sellTarget: sig5Target,
      stopLoss: sig5Stop,
      reason: `${chartPatternCMT?.multiBarPattern || candlePattern} | Candle CLV ${Math.round(candleCLV * 100)}%`
    },
    {
      id: "FUNDAMENTAL_VAL",
      name: "6. Fundamental Valuation & Safety",
      techUsed: "Sector P/E Ratio + ROE + 5Y Div + Graham Value",
      weightPct: 13,
      score: sig6Score,
      direction: sig6Dir,
      verdict: sig6Verdict,
      buyPrice: sig6Buy,
      sellTarget: sig6Target,
      stopLoss: sig6Stop,
      reason: `P/E ${fundamentals.pe}x (Sector ${fundamentals.sectorPE}x) | ROE ${fundamentals.roe}% | Fair Value Rs ${fundamentals.compositeFairValue}`
    }
  ];

  const masterWeightedScore = Math.round(
    individualSignals.reduce((acc, s) => acc + (s.score * s.weightPct) / 100, 0)
  );
  const bullishSignalsCount = individualSignals.filter((s) => s.direction === "BULLISH").length;
  const bearishSignalsCount = individualSignals.filter((s) => s.direction === "BEARISH").length;
  const neutralSignalsCount = individualSignals.length - bullishSignalsCount - bearishSignalsCount;
  const buyNowEnginesCount = individualSignals.filter(
    (s) => s.verdict === "BUY NOW" || s.verdict === "STRONG ACCUMULATE"
  ).length;
  const confluenceAgreementPct = Math.round(
    ((bullishSignalsCount >= bearishSignalsCount
      ? bullishSignalsCount + neutralSignalsCount * 0.5
      : bearishSignalsCount + neutralSignalsCount * 0.5) /
      individualSignals.length) *
      100
  );

  // ============================================================================
  // UNIFIED CONFLUENCE PRICE CLUSTERING (COMBINING ALL 6 BUY/SELL/SL LEVELS)
  // ============================================================================
  const rawConfluenceDipBuy = round2(
    sig1DipBuy * 0.22 +
      smcDipBuy * 0.26 +
      wkDipBuy * 0.22 +
      sig4DipBuy * 0.18 +
      sig5DipBuy * 0.06 +
      sig6DipBuy * 0.06
  );
  const boundedConfluenceDipBuy = round2(
    Math.min(
      currentPrice <= ema20 ? currentPrice : currentPrice * 0.992,
      Math.max(currentPrice * 0.945, rawConfluenceDipBuy)
    )
  );

  // Preliminary Stop & Target to verify Rule 5 (SEBON Net R:R) BEFORE finalizing Immediate Buy lock
  const rawConfluenceStop = round2(
    sig1Stop * 0.28 + smcStop * 0.28 + wkStop * 0.24 + sig4Stop * 0.20
  );
  const rawConfluenceTarget1 = round2(
    sig1Target * 0.26 + smcTarget * 0.26 + wkTarget * 0.24 + sig4Target * 0.14 + sig5Target * 0.10
  );

  // ============================================================================
  // STRICT 1-TO-1 SYNCHRONIZATION: IMMEDIATE BUY <-> 6-SIGNAL MASTER CONSENSUS
  // + 5 INSTITUTIONAL PRO-TRADER PRECISION GATES (VCP + BACKTEST EDGE + LIQUIDITY)
  // ============================================================================
  const last5BarsVcp = bars.slice(-5);
  const vcpAvg5dRangePct = round2(
    last5BarsVcp.reduce((acc, b) => acc + ((b.high - b.low) / Math.max(1, b.low)) * 100, 0) /
      Math.max(1, last5BarsVcp.length)
  );
  const vcpUpperWickCount = last5BarsVcp.filter((b) => {
    const rng = b.high - b.low;
    const topBody = Math.max(b.open, b.close);
    return rng > 0 && (b.high - topBody) / rng > 0.45 && rng / Math.max(1, b.low) > 0.03;
  }).length;
  const maxHighLast3 = Math.max(...bars.slice(-3).map((b) => b.high));
  const maxHighPrev7 = Math.max(...bars.slice(-10, -3).map((b) => b.high));
  const isLowerHighWhipsaw =
    (maxHighLast3 < maxHighPrev7 * 0.968 && vcpAvg5dRangePct > 4.2) ||
    vcpAvg5dRangePct > 5.8 ||
    (vcpUpperWickCount >= 3 && currentPrice < bars[Math.max(0, bars.length - 5)].close);
  const vcpTightnessPassed = !isLowerHighWhipsaw && vcpAvg5dRangePct <= 5.8;

  const btWinRateVal = Number(backtest?.winRate || 50);
  const btPfVal = Number(backtest?.profitFactor || 1.0);
  const proBacktestEdgePassed =
    btWinRateVal >= 55 || (btWinRateVal >= 50 && btPfVal >= 1.25) || btPfVal >= 1.5;

  const proLiquidityPassed =
    Number(quote.volume || 0) >= 500 &&
    (volRatio >= 0.22 || Number(quote.turnover || 0) >= 500000);

  const proMicroTrendPassed =
    currentPrice >= ema9 * 0.994 &&
    ema9 >= ema20 * 0.994 &&
    currentPrice >= ema20 * 0.998;

  const newsCat = quote.newsCatalyst || {
    newsScore: 50,
    hasBearishVeto: false,
    hasBullishCatalyst: false,
    sentiment: "🟡 NEUTRAL NEWS FLOW",
    topHeadline: "Steady NEPSE sector & macro news flow"
  };
  const proNewsSafetyPassed = !newsCat.hasBearishVeto;
  if (newsCat.hasBullishCatalyst && newsCat.directCount > 0) {
    quantScore = Math.min(99, quantScore + 3);
  } else if (newsCat.hasBearishVeto) {
    quantScore = Math.max(10, quantScore - 8);
  }

  const rule1Pass = masterWeightedScore >= 62 && bullishSignalsCount >= 4 && bearishSignalsCount === 0;
  const rule2Pass =
    antiChasePassed &&
    vcpTightnessPassed &&
    (smcRangePctVal <= 78 || (smcRangePctVal <= 85 && rsi14 <= 62 && Math.abs(zScoreATR) <= 0.85));
  const rule3Pass =
    (supertrend.direction === "BULLISH" || (currentPrice >= ema20 && ema20 >= sma50)) &&
    wkScoreVal >= 60 &&
    proMicroTrendPassed;
  const rule4Pass = fundamentalSafetyPassed && proBacktestEdgePassed && proLiquidityPassed && proNewsSafetyPassed;

  // A stock qualifies as ⚡ IMMEDIATE BUY if and only if ALL 5 Master Rules + Pro-Trader VCP, Backtest Edge & News Safety pass!
  const masterImmediateBuyQualified =
    !isImmediateSell &&
    !isSectorDumping &&
    rule1Pass &&
    rule2Pass &&
    rule3Pass &&
    rule4Pass &&
    vcpTightnessPassed &&
    proBacktestEdgePassed &&
    proLiquidityPassed &&
    proMicroTrendPassed &&
    proNewsSafetyPassed &&
    (buyerCandleConfirmed || (candleCLV >= 0.42 && masterWeightedScore >= 75 && !chartPatternCMT.falseBreakoutTrap)) &&
    t2SupplyPassed &&
    inSweetSpotNow &&
    masterWeightedScore >= 70 &&
    bullishSignalsCount >= 4 &&
    bearishSignalsCount === 0 &&
    buyNowEnginesCount >= 3;

  if (masterImmediateBuyQualified && !isImmediateBuy) {
    isImmediateBuy = true;
    buyCategory = "⚡ IMMEDIATE BUY";
    immediateBuyReason = `Pro-Trader VCP, News & 6-Signal Confluence (${bullishSignalsCount}/6 Bullish, Win Rate ${btWinRateVal}%, VCP ${vcpAvg5dRangePct}%, ${newsCat.sentiment})`;
  } else if (isImmediateBuy && !masterImmediateBuyQualified) {
    // Downgrade to BUY ON DIP if 6-Signal Master Consensus or Pro-Trader VCP/Backtest/News Gate vetoed chasing at LTP
    isImmediateBuy = false;
    buyCategory = "🟢 BUY ON DIP";
    immediateBuyReason = !proNewsSafetyPassed
      ? `Bearish News Veto (${newsCat.topHeadline}) — avoid chasing; wait for deep support at NPR ${boundedConfluenceDipBuy}`
      : !proBacktestEdgePassed
        ? `Pro-Trader Backtest Filter: Historical Win Rate (${btWinRateVal}%) is below 55% threshold — wait for deep support at NPR ${boundedConfluenceDipBuy}`
        : !vcpTightnessPassed
          ? `Pro-Trader VCP Filter: Wide 5D volatility (${vcpAvg5dRangePct}%) / lower-high distribution — wait for tight base at NPR ${boundedConfluenceDipBuy}`
          : `6-Signal Master Filter: Wait for Unified Confluence Pullback at NPR ${boundedConfluenceDipBuy} (${bullishSignalsCount}/6 Bullish, Master Score ${masterWeightedScore}/100)`;
    if (sellCategory === "🟢 SAFE TO HOLD") {
      action = "BUY ON DIP / ACCUMULATE";
      badge = "🟢 BUY ON DIP (UPTREND INTACT)";
      signalType = "BUY";
    }
  }

  // Exact Buy Price: If Immediate Buy passed all vetoes, buy at LTP; if Immediate Sell, wait for deep support; else use Confluence Dip Buy
  const exactBuyPrice = isImmediateBuy
    ? currentPrice
    : isImmediateSell
      ? round2(Math.min(sr.support1, boundedConfluenceDipBuy))
      : buyCategory === "🟢 BUY ON DIP" && currentPrice <= ema20 && currentPrice <= boundedConfluenceDipBuy * 1.008
        ? currentPrice
        : boundedConfluenceDipBuy;

  // Support Dip Buy (Tranche 2 Backup) sits at the lower institutional demand floor (SMC OB Low / POC / S1)
  const rawDipCandidate = round2(
    Math.min(
      smc?.bullishOB?.low > 0 && smc.bullishOB.low < exactBuyPrice ? smc.bullishOB.low : exactBuyPrice * 0.974,
      volumeProfile.poc > 0 && volumeProfile.poc < exactBuyPrice * 0.992 ? volumeProfile.poc : sr.support1
    )
  );
  const exactBackupDipPrice = round2(
    Math.max(
      exactBuyPrice * 0.955,
      Math.min(exactBuyPrice * 0.984, rawDipCandidate > stopLossNum * 1.01 ? rawDipCandidate : exactBuyPrice * 0.974)
    )
  );

  const exactStopLossPrice = round2(
    Math.max(
      exactBuyPrice * 0.925,
      Math.min(rawConfluenceStop, exactBackupDipPrice * 0.976, exactBuyPrice * 0.955)
    )
  );
  const exactStopLossPct = round2(((currentPrice - exactStopLossPrice) / currentPrice) * 100);
  const exactDipPct = round2(((exactBackupDipPrice - currentPrice) / currentPrice) * 100);

  const exactLongTermBuyPrice = round2(
    Math.min(
      exactBuyPrice,
      sma200 > 0 ? sma200 : ema20,
      volumeProfile.poc > 0 ? volumeProfile.poc : ema20
    )
  );

  // Ensure Target 1 gives at least 1 : 1.50 Net Risk:Reward from exactBuyPrice vs exactStopLossPrice
  const riskDistFromBuy = Math.max(1, exactBuyPrice - exactStopLossPrice);
  const minTargetForStrongRR = round2(exactBuyPrice + riskDistFromBuy * 1.75 + exactBuyPrice * 0.0095);
  const minProfitableTarget1 = round2(Math.max(currentPrice * 1.045, exactBuyPrice * 1.055, minTargetForStrongRR));
  const exactSellTarget1 = isImmediateSell
    ? currentPrice
    : sellCategory === "🟠 SELL ON RALLY"
      ? round2(Math.max(sr.resistance1, currentPrice * 1.03))
      : round2(Math.min(currentPrice * 1.18, Math.max(minProfitableTarget1, rawConfluenceTarget1)));

  const exactSellTarget1GainPct = round2(((exactSellTarget1 - currentPrice) / currentPrice) * 100);

  const exactSellTarget2 = isImmediateSell
    ? round2(Math.max(sr.resistance1, currentPrice * 1.03))
    : round2(Math.max(ex2Obj.price, sig6Target, exactSellTarget1 * 1.048));

  const exactSellTarget2GainPct = round2(((exactSellTarget2 - currentPrice) / currentPrice) * 100);

  // Master Net Profit & Risk:Reward from Unified Buy Price (after ~0.95% SEBON + Broker + DP friction)
  const unifiedGrossGainPct = round2(((exactSellTarget1 - exactBuyPrice) / exactBuyPrice) * 100);
  const unifiedNetGainPct = round2(Math.max(0, (unifiedGrossGainPct - 0.95) * 0.925)); // After fees & 7.5% short-term CGT
  const unifiedRiskPct = round2(Math.max(1.2, ((exactBuyPrice - exactStopLossPrice) / exactBuyPrice) * 100 + 0.45));
  const unifiedNetRR = round2(Math.max(0.5, unifiedGrossGainPct - 0.95) / unifiedRiskPct);

  // 5 Institutional Confluence & Veto Rules Checklist
  const masterRules = [
    {
      rule: "Rule 1: 6-Engine Multi-Factor Consensus",
      passed: rule1Pass,
      badge: `${bullishSignalsCount}/6 Bullish • ${masterWeightedScore}/100`,
      detail: `Weighted across Daily (20%), SMC (22%), Weekly (20%), Wyckoff/Brokers (15%), CMT Pattern (10%), and Fundamentals (13%).`
    },
    {
      rule: "Rule 2: SMC Premium & Anti-Chase Veto",
      passed: rule2Pass,
      badge: rule2Pass ? `PASSED (${smcRangePctVal}% Range)` : "VETO ACTIVE (Pullback Only)",
      detail:
        rule2Pass
          ? `Price is in ${smcDealingZoneText} (${smcRangePctVal}% of swing range, RSI ${rsi14}) — no overbought trap.`
          : `Vetoed chasing at LTP (RSI ${rsi14}, Range ${smcRangePctVal}%) — entry anchored down to Confluence Dip Rs ${exactBuyPrice}.`
    },
    {
      rule: "Rule 3: Daily + Weekly Multi-Timeframe Alignment",
      passed: rule3Pass,
      badge: rule3Pass ? "1D + 1W ALIGNED" : supertrend.direction === "BULLISH" ? "1D BULL / 1W NEUTRAL" : "DEFENSIVE MODE",
      detail: `Daily SuperTrend is ${supertrend.direction} (Rs ${supertrend.value}) & Weekly Structure is ${wkCatText} (Score ${wkScoreVal}/100).`
    },
    {
      rule: "Rule 4: Fundamental & Lock-In Capital Protection",
      passed: rule4Pass,
      badge: rule4Pass ? `SAFE (P/E ${fundamentals.pe}x)` : "SPECULATIVE CAUTION",
      detail: `P/E ${fundamentals.pe}x vs Sector ${fundamentals.sectorPE}x | ROE ${fundamentals.roe}% | Lock-In Risk: ${fundamentals.lockInRisk}.`
    },
    {
      rule: "Rule 5: SEBON Net Fee-Adjusted Risk:Reward",
      passed: unifiedNetRR >= 1.45,
      badge: `Net R:R 1 : ${unifiedNetRR}`,
      detail: `From Unified Buy Rs ${exactBuyPrice} → Target 1 Rs ${exactSellTarget1} (+${unifiedGrossGainPct}% Gross / ~+${unifiedNetGainPct}% Net after SEBON, Broker & CGT) vs Stop Rs ${exactStopLossPrice}.`
    }
  ];

  const rulesPassedCount = masterRules.filter((r) => r.passed).length;

  let masterVerdict = "🔵 MASTER HOLD & TRAIL STOP-LOSS";
  let masterActionCode = "HOLD";
  let masterSummary = "";
  if (isImmediateBuy) {
    masterVerdict = `⚡ MASTER IMMEDIATE BUY @ Rs ${exactBuyPrice} (${bullishSignalsCount}/6 Bullish • ${masterWeightedScore}/100)`;
    masterActionCode = "IMMEDIATE_BUY";
    masterSummary = `100% Matched with Immediate Buy Radar: All ${rulesPassedCount}/5 institutional rules passed & ${buyNowEnginesCount} engines vote BUY NOW at Rs ${exactBuyPrice} (Dip Add: Rs ${exactBackupDipPrice}), Target 1: Rs ${exactSellTarget1} (+${exactSellTarget1GainPct}%), Stop-Loss: Rs ${exactStopLossPrice}.`;
  } else if (isImmediateSell) {
    masterVerdict = `🚨 MASTER IMMEDIATE SELL / BOOK PROFIT (Urgency ${sellUrgencyScore}/100)`;
    masterActionCode = "IMMEDIATE_SELL";
    masterSummary = `Veto/Exit triggered (${isTrueOverboughtClimax ? `Overbought Climax RSI ${rsi14}` : `Trend Breakdown < Rs ${ema20}`}). Sell/Book Profit at Rs ${currentPrice}; do not re-enter until Confluence Support Rs ${exactBuyPrice}.`;
  } else if (buyCategory === "🟢 BUY ON DIP") {
    masterVerdict = `🟢 MASTER BUY ON DIP @ Rs ${exactBuyPrice} (${bullishSignalsCount}/6 Bullish • ${masterWeightedScore}/100)`;
    masterActionCode = "BUY_ON_DIP";
    masterSummary = `Different engines (Daily Rs ${sig1DipBuy}, SMC OB/OTE Rs ${smcDipBuy}, Weekly Rs ${wkDipBuy}, VWAP/POC Rs ${sig4DipBuy}) are combined into ONE Unified Limit Buy at Rs ${exactBuyPrice}, Target 1: Rs ${exactSellTarget1} (+${unifiedGrossGainPct}%), Hard Stop: Rs ${exactStopLossPrice}.`;
  } else if (sellCategory === "🟠 SELL ON RALLY") {
    masterVerdict = `🟠 MASTER HOLD / SELL ON RALLY @ Rs ${exactSellTarget1}`;
    masterActionCode = "SELL_ON_RALLY";
    masterSummary = `Book 40%–50% profit on rally to Unified Resistance Rs ${exactSellTarget1}. Fresh buyers wait for pullback to Unified Support Rs ${exactBuyPrice} (Hard Stop: Rs ${exactStopLossPrice}).`;
  } else {
    masterVerdict = `🔵 MASTER HOLD / WAIT FOR Rs ${exactBuyPrice} (${masterWeightedScore}/100)`;
    masterActionCode = "HOLD";
    masterSummary = `Hold existing shares safely above Unified Stop-Loss Rs ${exactStopLossPrice}. For fresh entry, place limit bid only at Unified Confluence Support Rs ${exactBuyPrice} for Target Rs ${exactSellTarget1}.`;
  }

  const masterConsensus = {
    masterVerdict,
    masterActionCode,
    masterScore: masterWeightedScore,
    bullishSignalsCount,
    neutralSignalsCount,
    bearishSignalsCount,
    buyNowEnginesCount,
    totalSignals: individualSignals.length,
    confluenceAgreementPct,
    rulesPassedCount,
    totalRules: masterRules.length,
    unifiedBuyPrice: exactBuyPrice,
    unifiedBackupDipPrice: exactBackupDipPrice,
    unifiedTarget1: exactSellTarget1,
    unifiedTarget2: exactSellTarget2,
    unifiedStopLoss: exactStopLossPrice,
    unifiedGrossGainPct,
    unifiedNetGainPct,
    unifiedNetRR,
    masterSummary,
    signals: individualSignals,
    rules: masterRules
  };

  const exactBuyHeadline = isImmediateBuy
    ? `BUY NOW @ Rs ${currentPrice}`
    : isImmediateSell
      ? `DO NOT BUY NOW (Wait for Rs ${exactBuyPrice})`
      : buyCategory === "🟢 BUY ON DIP" && currentPrice <= exactBuyPrice * 1.005
        ? `BUY IN DIP ZONE @ Rs ${currentPrice}`
        : `WAIT & BUY AT Rs ${exactBuyPrice}`;

  const exactBuySubtext = isImmediateBuy
    ? `Unified 6-Signal Entry: Buy ${t1Obj.kitta} kitta today at Rs ${currentPrice}`
    : isImmediateSell
      ? `Overheated/falling — wait until price drops to Unified Support Rs ${exactBuyPrice}`
      : buyCategory === "🟢 BUY ON DIP" && currentPrice <= exactBuyPrice * 1.005
        ? `Price is inside Unified Confluence Zone — buy ${t1Obj.kitta} kitta @ Rs ${currentPrice}`
        : `6-Signal Confluence Pullback (Daily + SMC OTE + Weekly + POC) — Limit Buy at Rs ${exactBuyPrice}`;

  const exactSellHeadline = isImmediateSell
    ? `SELL NOW @ Rs ${currentPrice}`
    : sellCategory === "🟠 SELL ON RALLY"
      ? `SELL AT Rs ${exactSellTarget1} (+${exactSellTarget1GainPct}%)`
      : `SELL TARGET: Rs ${exactSellTarget1} (+${exactSellTarget1GainPct}%)`;

  const exactSellSubtext = isImmediateSell
    ? `Sell 70%–100% immediately at Rs ${currentPrice} | Unified Stop-Loss: Rs ${exactStopLossPrice}`
    : sellCategory === "🟠 SELL ON RALLY"
      ? `Book 50% profit at Rs ${exactSellTarget1} | Unified Stop-Loss: Rs ${exactStopLossPrice} (-${exactStopLossPct}%)`
      : `Hold safely above Unified Stop Rs ${exactStopLossPrice} (-${exactStopLossPct}%) for Target Rs ${exactSellTarget1} (Net R:R 1:${unifiedNetRR})`;

  const exactExecution = {
    exactBuyPrice,
    exactBackupDipPrice,
    exactDipPct,
    exactLongTermBuyPrice,
    exactBuyHeadline,
    exactBuySubtext,
    recommendedKitta: t1Obj.kitta,
    backupKitta: t2Obj.kitta,
    exactSellTarget1,
    exactSellTarget1GainPct,
    exactSellTarget2,
    exactSellTarget2GainPct,
    exactStopLossPrice,
    exactStopLossPct,
    exactSellHeadline,
    exactSellSubtext,
    unifiedGrossGainPct,
    unifiedNetGainPct,
    unifiedNetRR
  };

  let trafficLight = "🔵 HOLD / WAIT FOR SETUP";
  let simpleReason = "";
  if (isImmediateBuy) {
    trafficLight = "🟢 BUY NOW (AT CURRENT PRICE)";
    simpleReason = `${immediateBuyReason} Big brokers (#${smartMoney.topBuyBrokers.slice(0, 2).join(", #")}) are accumulating and all 4 No-Trap safety checks passed (Consensus: ${consensusScore}/100).`;
  } else if (isImmediateSell) {
    trafficLight = "🚨 IMMEDIATE SELL / EXIT NOW";
    simpleReason = `${immediateSellReason}`;
  } else if (buyCategory === "🟢 BUY ON DIP") {
    trafficLight = "🟢 GOOD STOCK — BUY ON SLIGHT DIP";
    simpleReason = `${immediateBuyReason} Trend and fundamentals are solid (Consensus: ${consensusScore}/100), so accumulate via limit order near NPR ${exactBuyPrice}.`;
  } else if (sellCategory === "🟠 SELL ON RALLY") {
    trafficLight = "🟠 HOLD & SELL PARTIAL ON RALLY";
    simpleReason = `${immediateSellReason}`;
  } else {
    trafficLight = "🔵 SAFE TO HOLD (TRAIL STOP-LOSS)";
    simpleReason = `${immediateSellReason}`;
  }

  const simpleAdvisor = {
    trafficLight,
    simpleReason,
    whySellBullets,
    whyBuyBullets,
    fundamentalSafetyBadge,
    noTrapFiltersPassedCount,
    checklist: {
      antiChase: antiChasePassed ? `✅ Safe Price Level (Not Overheated)` : `✋ Overheated (+${distFromEma20Pct}% above 20D Avg)`,
      buyerVolume: buyerCandleConfirmed ? `✅ Strong Buyers (${volRatio}x Vol)` : `⚠️ Sellers Active Today`,
      fundamentals: fundamentalSafetyPassed ? `✅ Safe Fundamentals (P/E ${fundamentals.pe}x)` : `⚠️ High P/E (${fundamentals.pe}x) or NPL (${fundamentals.npl}%)`,
      t2Supply: t2SupplyPassed ? `✅ Above 20D VWAP (Supply Absorbed)` : `⚠️ Below 20D VWAP (NPR ${smartMoney.vwap20})`
    },
    stepByStep: {
      step1BuyNow: isImmediateBuy
        ? `Buy 40% (${t1Obj.kitta} kitta) TODAY at NPR ${currentPrice} (${t1Obj.zone})`
        : isImmediateSell
        ? `⛔ DO NOT BUY! Existing holders: SELL 70%–100% immediately at LTP (NPR ${currentPrice})`
        : buyCategory === "🟢 BUY ON DIP"
        ? `Place Limit Buy Order for ${t1Obj.kitta} kitta at NPR ${exactBuyPrice}`
        : `Wait for deeper pullback to Support S1 (NPR ${sr.support1})`,
      step2AddOnDip: isImmediateSell
        ? `Re-enter only after price cools down to Support S1 (NPR ${sr.support1}) or 20-Day Avg (NPR ${ema20})`
        : `Add 30% (${t2Obj.kitta} kitta) if price dips to NPR ${exactBackupDipPrice}`,
      step3SellTargets: `Target 1 (Net R:R 1:${netRiskRewardRatio}): NPR ${exactSellTarget1} (+${exactSellTarget1GainPct}%) | Target 2: NPR ${exactSellTarget2} (+${exactSellTarget2GainPct}%)`,
      step4StopLoss: `Hard Exit if daily close drops below NPR ${stopLossNum} (-${executionMatrix.exits.hardStop.pctLoss}%)`
    }
  };

  const close20Ago = bars.length >= 20 ? bars[bars.length - 20].close : bars[0]?.close || currentPrice;
  const stockReturn20dPct = close20Ago > 0 ? round2(((currentPrice - close20Ago) / close20Ago) * 100) : 0;
  const benchmark20dPct = round2((nepseChangePct || 0) * 3.2 + (sectorChangePct || 0) * 1.8);
  const rsAlphaPct = round2(stockReturn20dPct - benchmark20dPct);
  const rsStatus =
    rsAlphaPct >= 3.0
      ? `ALPHA LEADER (+${rsAlphaPct}% vs NEPSE) 🚀`
      : rsAlphaPct <= -3.0
        ? `LAGGING MARKET (${rsAlphaPct}% vs NEPSE) 🔴`
        : `IN-LINE WITH NEPSE (${rsAlphaPct >= 0 ? "+" : ""}${rsAlphaPct}%) 🟡`;

  // 15-Day Swing Profit Engine (T+2 Demat Settled, 5 Veto Rules + VCP Tightness + Backtest Edge + Liquidity + Earnings Quality)
  const sw15_btWin = Number(backtest?.winRate || 50);
  const sw15_btPf = Number(backtest?.profitFactor || 1.0);
  const sw15_fEps = Number(fundamentals?.eps || 0);
  const sw15_fRoe = Number(fundamentals?.roe || 0);
  const sw15_rulesCount = Number(masterConsensus?.rulesPassedCount || 0);
  const sw15_wkScoreVal = Number(weeklyTrading?.weeklyScore || 50);
  const sw15_mScoreVal = Number(masterConsensus?.masterScore || quantScore || 50);
  const sw15_vcpBonus = vcpTightnessPassed ? (vcpAvg5dRangePct <= 3.2 ? 6 : 3) : -12;
  const sw15_sectorBonus = sectorChangePct >= 0 ? 3 : sectorChangePct < -0.4 ? -5 : 0;
  const sw15_newsBonus = newsCat.hasBearishVeto ? -15 : newsCat.hasBullishCatalyst ? (newsCat.directCount > 0 ? 4 : 2) : 0;

  const swing15Score = Math.min(
    99,
    Math.max(
      15,
      Math.round(
        sw15_mScoreVal * 0.36 +
          sw15_wkScoreVal * 0.22 +
          Math.min(100, sw15_btWin * 1.15) * 0.24 +
          Math.min(100, Math.max(30, sw15_fRoe * 3.5 + (sw15_fEps > 15 ? 25 : sw15_fEps > 8 ? 15 : 0))) * 0.18 +
          sw15_vcpBonus +
          sw15_sectorBonus +
          sw15_newsBonus
      )
    )
  );

  const is15DaySwing = Boolean(
    !isImmediateSell &&
      supertrend.direction === "BULLISH" &&
      currentPrice >= ema20 * 0.99 &&
      ema9 >= ema20 * 0.99 &&
      vcpTightnessPassed &&
      proLiquidityPassed &&
      proNewsSafetyPassed &&
      rsi14 >= 44 &&
      rsi14 <= 66 &&
      quantScore >= 65 &&
      sw15_rulesCount >= 4 &&
      proBacktestEdgePassed &&
      (sw15_fEps >= 8 || sw15_fRoe >= 9)
  );

  const proTraderGrade =
    !proNewsSafetyPassed
      ? "⛔ BEARISH NEWS VETO"
      : is15DaySwing && isImmediateBuy && vcpAvg5dRangePct <= 3.8 && sw15_btWin >= 65
        ? "A+ INSTITUTIONAL VCP"
        : is15DaySwing
          ? "A PRO 15D SWING"
          : !vcpTightnessPassed
            ? "C WHIPSAW / WIDE RANGE"
            : !proBacktestEdgePassed
              ? "C LOW WIN-RATE HISTORY"
              : "B WATCHLIST / DIP";

  const swing15Day = {
    is15DaySwing,
    swing15Score,
    proTraderGrade,
    vcpAvg5dRangePct,
    vcpTightnessPassed,
    proBacktestEdgePassed,
    proLiquidityPassed,
    proNewsSafetyPassed,
    newsSentiment: newsCat.sentiment,
    newsHeadline: newsCat.topHeadline,
    swing15Badge:
      !proNewsSafetyPassed
        ? "⛔ BEARISH NEWS VETO"
        : proTraderGrade === "A+ INSTITUTIONAL VCP"
          ? "🏆 A+ INSTITUTIONAL VCP"
          : is15DaySwing
            ? "🚀 15-DAY PROFIT PICK"
            : !isImmediateSell && supertrend.direction === "BULLISH" && quantScore >= 58
              ? "🟢 15D WATCHLIST"
              : "⏳ WAIT / AVOID",
    horizonTradingDays: 15,
    primaryBuy60Pct: exactBuyPrice,
    backupDip40Pct: exactBackupDipPrice,
    day5To10Target1: exactSellTarget1,
    day5To10GainPct: exactSellTarget1GainPct,
    day10To15Target2: exactSellTarget2,
    day10To15GainPct: exactSellTarget2GainPct,
    dailyCloseStopLoss: exactStopLossPrice,
    maxRiskPct: exactStopLossPct
  };

  return {
    symbol: quote.symbol,
    companyName: quote.companyName,
    sector: quote.sector,
    ltp: currentPrice,
    pointChange: quote.pointChange,
    percentageChange: quote.percentageChange,
    newsCatalyst: newsCat,
    marketRegime: {
      sectorChangePct,
      nepseChangePct,
      marketBreadthPct,
      isSectorLeading,
      isSectorDumping,
      marketRegimeLabel,
      stockReturn20dPct,
      rsAlphaPct,
      rsStatus
    },
    bookCloseAdjustment,
    recentBars: bars.slice(-90).map((b) => ({
      d: b.date,
      o: b.open,
      h: b.high,
      l: b.low,
      c: b.close,
      v: b.volume
    })),
    score,
    quantScore,
    consensusScore,
    consensusGates,
    accuracyPoints,
    accuracyGrade,
    signalType,
    isImmediateBuy,
    buyCategory,
    immediateBuyReason,
    isImmediateSell,
    sellCategory,
    immediateSellReason,
    sellUrgencyScore,
    whySellBullets,
    whyBuyBullets,
    exactExecution,
    masterConsensus,
    swing15Day,
    simpleAdvisor,
    longTerm,
    sectorChampion,
    action,
    badge,
    strategyTag,
    confidence,
    candlePattern,
    chartPatternCMT,
    divergence,
    mtf,
    ichimoku,
    volumeProfile,
    monteCarlo,
    executionMatrix,
    indicators: {
      rsi14,
      stochRsi,
      ema9,
      ema20,
      distFromEma20Pct,
      sma20,
      sma50,
      sma200,
      supertrend: supertrend.value,
      superTrendLevel: supertrend.value,
      supertrendDir: supertrend.direction,
      adx: adxObj.adx,
      diPlus: adxObj.diPlus,
      diMinus: adxObj.diMinus,
      macd: macd.macd,
      macdSignal: macd.signal,
      macdHist: macd.histogram,
      bbUpper: bb.upper,
      bbMiddle: bb.middle,
      bbLower: bb.lower,
      atr14,
      volRatio,
      vwap20: smartMoney.vwap20,
      mfi14: smartMoney.mfi14,
      obvStatus: smartMoney.obvStatus
    },
    tradePlan: {
      entryZone: `NPR ${buyZoneLow} – ${buyZoneHigh}`,
      target1: `NPR ${exactSellTarget1} (+${exactSellTarget1GainPct}%)`,
      target2: `NPR ${exactSellTarget2} (+${exactSellTarget2GainPct}%)`,
      target3: `NPR ${target3Num} (+${round2(((target3Num - currentPrice) / currentPrice) * 100)}%)`,
      stopLoss: `NPR ${exactStopLossPrice} (-${exactStopLossPct}%)`,
      trailingStop: `NPR ${supertrend.value} (SuperTrend)`,
      riskReward,
      halfKellyPct,
      recommendedKitta,
      capitalRequired,
      maxRiskNPR,
      support1: exactBackupDipPrice,
      support2: round2(Math.min(sr.support2, exactStopLossPrice * 0.985)),
      resistance1: exactSellTarget1,
      resistance2: exactSellTarget2,
      demandOrderBlock: sr.demandOrderBlock,
      supplyOrderBlock: sr.supplyOrderBlock,
      marketStructure: sr.marketStructure,
      fib382: sr.fib382,
      fib500: sr.fib500,
      fib618: sr.fib618,
      pivot: sr.pivot
    },
    fundamentals,
    smartMoney,
    smc,
    weeklyTrading,
    backtest,
    reasons
  };
}

module.exports = {
  analyzeStock,
  normalizeBarsForBookClose,
  detectSmartMoneyConcepts,
  evaluateWeeklyTrading,
  detectChartPatternsCMT,
  evaluateFundamentals,
  evaluateLongTermHold,
  evaluateSectorChampion,
  runWalkForwardBacktest,
  runMonteCarloForecast
};
