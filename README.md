# 🇳🇵 NEPSE Quant Pro v4.0 — 6-Perspective Buy/Sell Execution Engine & WhatsApp Bot

An institutional-grade **Nepal Stock Exchange (NEPSE) WhatsApp Bot & Quant Terminal** that answers **WHERE TO BUY** and **WHERE TO SELL** from **every perspective** — combining **Smart Money Concepts (SMC Order Blocks & BOS/CHoCH)**, **Multi-Timeframe Trend (`15M`/`1D`/`1W`)**, **Volume Profile (`POC`/`VAH`/`VAL`) & Institutional VWAP**, **NEPSE Floorsheet & T+2 Settlement Microstructure**, **Graham Intrinsic Valuation**, and **500-Path Monte Carlo Price Simulation**.

---

## 🎯 How We Make Buy & Sell Signals Accurate From Every Perspective

Single-indicator bots fail in NEPSE because of **T+2 settlement supply traps**, **operator volume cornering**, and **SEBON brokerage + CGT friction**. **NEPSE Quant Pro v4.0** solves this by evaluating **6 independent perspectives** before giving you an exact **3-Tranche Pyramid Buying Plan** and **3-Tier Profit-Booking Matrix**:

| # | Perspective | Where to Buy (Accumulation) | Where to Sell (Distribution / Exit) |
| :--- | :--- | :--- | :--- |
| **1️⃣** | **Price Action & Smart Money Concepts (SMC)** | Bullish **Demand Order Block** (`OB`) + **Fibonacci Golden Pocket (`50%–61.8%`)** + Break of Structure (`BOS`) | Bearish **Supply Order Block** + Swing High Resistance (`R1`/`R2`) + Change of Character (`CHoCH`) |
| **2️⃣** | **Multi-Timeframe Trend (`15M` / `1D` / `1W`)** | `1D` & `1W` aligned Bullish + pullback to **EMA(20)**, **Ichimoku Cloud**, or **SuperTrend(10,3)** | Daily candle closes below **EMA(9)** (scalp), **EMA(20)** (swing), or **SuperTrend** (trend exit) |
| **3️⃣** | **Volume Profile (`POC`/`VAH`/`VAL`) & VWAP** | **60-Day Volume POC** (highest institutional volume node), **Value Area Low (`VAL`)**, & **20D VWAP** | **Value Area High (`VAH`)** & Upper Bollinger Band (`2σ` institutional distribution zone) |
| **4️⃣** | **NEPSE Floorsheet & Intraday Timing Clock** | **1:15 PM – 1:50 PM NPT** (Mid-day T+2 seller exhaustion dip) or **2:45 PM NPT** closing confirmation | **11:08 AM – 11:30 AM NPT** (Sell partial kitta into morning retail euphoria spike near R1) |
| **5️⃣** | **Fundamental & Intrinsic Valuation** | Price below **Composite Fair Value** (Graham Number $\sqrt{22.5 \times \text{EPS} \times \text{BVPS}}$ + Sector P/E Value) | Price stretched $>20\%$ above **Intrinsic Fair Value** or Sector P/E ceiling |
| **6️⃣** | **Statistical Monte Carlo & Walk-Forward Backtest** | **10th Percentile Bear Support Floor** with $>55\%$ historical walk-forward win rate | **90th Percentile Bull Exhaustion Ceiling** + **SEBON Net Profit / CGT Calculator** |

---

## 💬 Complete WhatsApp Command Reference

| Command | Example | Description |
| :--- | :--- | :--- |
| **`!buy <SYM> [CAP]`** | `!buy NABIL 100000` | **WHERE TO BUY**: 6-Perspective Buy Zones + **3-Tranche Pyramid Plan (`40% / 30% / 30%`)** + Intraday Clock |
| **`!sell <SYM> [BUY] [QTY]`** | `!sell NABIL 495 100` | **WHERE TO SELL**: **3-Tier Profit Booking (`35% / 40% / 25%`)** + Trailing Stops + **SEBON Net P&L Simulator** |
| **`!signal <SYM>`** | `!signal NABIL` | **6-Perspective Master Signal** (Full Buy & Sell Matrix + Fresh Buyer vs. Existing Holder Verdict) |
| **`!predict <SYM>`** | `!predict NABIL` | **500-Path Monte Carlo Price Forecast** (15-Day Bull/Base/Bear targets, `95% VaR`, Sharpe Ratio) |
| **`!whale [SYM]`** | `!whale` or `!whale CBBL` | **Whale / Operator Cornering Radar** & **T+2 Settlement Supply Absorption** |
| **`!rotation`** | `!rotation` | **Institutional RRG Sector Rotation Matrix** (Leading, Improving, Weakening, Lagging sectors) |
| **`!build <CAPITAL>`** | `!build 200000` | **AI Risk-Parity Portfolio Builder** across 4 uncorrelated NEPSE sectors with exact kitta & WACC |
| **`!ask <QUESTION>`** | `!ask where to buy NABIL` | **Conversational AI Stock Analyst** (answers plain-English questions on any NEPSE stock or sector) |
| **`!scan [buy\|sell]`** | `!scan buy` | **100-Point Market Screener** sorted by Confluence Score & Historical Backtest Win Rate |
| **`!backtest <SYM>`** | `!backtest NABIL` | **220-Day Walk-Forward Backtest** (Win Rate, Profit Factor, Max Drawdown net of SEBON fees) |
| **`!fund <SYM>`** | `!fund SCB` | **Fundamental & Graham Intrinsic Value** (EPS, P/E vs Sector P/E, P/B, ROE, Margin of Safety) |
| **`!smartmoney <SYM>`** | `!smartmoney HDL` | **Broker Floorsheet Concentration**, 20-Day Institutional VWAP & Accumulation Score |
| **`!compare <S1> <S2>`** | `!compare NABIL SCB` | **Head-to-Head Stock Showdown** (Quant Score, Backtest Win%, Graham Margin,ROE) |
| **`!pf`** | `!pf add NABIL 100 505` | **Personal NEPSE Portfolio Tracker** with live SEBON Net P&L and Stop-Loss warnings |
| **`!ipo`** | `!ipo` | **Live IPO, Right Share, FPO & Book Closure Pipeline** |
| **`!live`** | `!live` | **NEPSE Live Index**, Fear & Greed Gauge, Turnover, Breadth & Top Movers |
| **`!calc`** | `!calc buy 100 520` | **Official SEBON Fee, WACC & CGT Calculator** (`7.5%` <365d / `5%` ≥365d) |

---

## 🚀 Quick Start

```bash
cd /Users/pradipgaire/Documents/nepse-whatsapp-bot

# 1. Run the 11-suite automated verification test
npm test

# 2. Start the Web Dashboard + WhatsApp Bot Server (Port 4050)
npm start
```

Then open **`http://localhost:4050`** in your browser to use the interactive **WhatsApp Simulator**, **SMC Buy/Sell Zone Candlestick Chart**, **100-Point Quant Screener**, and **WhatsApp QR Code Linker**.
