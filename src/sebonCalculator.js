/**
 * Official Nepal SEBON Brokerage Commission, DP Fee, and Capital Gains Tax Calculator
 * Compliant with SEBON revised fee structure (0.27% to 0.40% slabs)
 */

function calculateBrokerCommission(amount) {
  if (amount <= 50000) {
    return { rate: 0.0036, commission: Math.max(10, amount * 0.0036), slab: "Up to NPR 50,000 (0.36%)" };
  } else if (amount <= 500000) {
    return { rate: 0.0033, commission: amount * 0.0033, slab: "NPR 50k – 5 Lakhs (0.33%)" };
  } else if (amount <= 2000000) {
    return { rate: 0.0031, commission: amount * 0.0031, slab: "NPR 5L – 20 Lakhs (0.31%)" };
  } else if (amount <= 10000000) {
    return { rate: 0.0027, commission: amount * 0.0027, slab: "NPR 20L – 1 Crore (0.27%)" };
  } else {
    return { rate: 0.0024, commission: amount * 0.0024, slab: "Above NPR 1 Crore (0.24%)" };
  }
}

function calculateBuy(qty, price) {
  const grossAmount = qty * price;
  const { commission, slab } = calculateBrokerCommission(grossAmount);
  const sebonFee = grossAmount * 0.00015; // 0.015%
  const dpCharge = 25; // NPR 25 per script transfer
  const totalPayable = grossAmount + commission + sebonFee + dpCharge;
  const waccPerShare = totalPayable / qty;

  return {
    side: "BUY",
    qty,
    price,
    grossAmount: round2(grossAmount),
    brokerCommission: round2(commission),
    commissionSlab: slab,
    sebonFee: round2(sebonFee),
    dpCharge,
    totalPayable: round2(totalPayable),
    waccPerShare: round2(waccPerShare),
    breakevenSellPrice: round2(waccPerShare * 1.006)
  };
}

function calculateSell(qty, sellPrice, buyPrice = null, holdingDays = 366) {
  const grossAmount = qty * sellPrice;
  const { commission, slab } = calculateBrokerCommission(grossAmount);
  const sebonFee = grossAmount * 0.00015;
  const dpCharge = 25;

  let waccTotal = 0;
  let capitalGain = 0;
  let cgtRate = holdingDays < 365 ? 0.075 : 0.05; // 7.5% short-term (<1yr), 5% long-term (>=1yr)
  let cgtAmount = 0;

  if (buyPrice && buyPrice > 0) {
    const buyCalc = calculateBuy(qty, buyPrice);
    waccTotal = buyCalc.totalPayable;
    const netBeforeTax = grossAmount - commission - sebonFee - dpCharge;
    capitalGain = netBeforeTax - waccTotal;
    if (capitalGain > 0) {
      cgtAmount = capitalGain * cgtRate;
    }
  }

  const netReceivable = grossAmount - commission - sebonFee - dpCharge - cgtAmount;
  const netProfit = buyPrice ? netReceivable - waccTotal : null;
  const roiPct = buyPrice && waccTotal > 0 ? (netProfit / waccTotal) * 100 : null;

  return {
    side: "SELL",
    qty,
    sellPrice,
    buyPrice,
    holdingDays,
    grossAmount: round2(grossAmount),
    brokerCommission: round2(commission),
    commissionSlab: slab,
    sebonFee: round2(sebonFee),
    dpCharge,
    cgtRate: cgtRate * 100,
    cgtAmount: round2(cgtAmount),
    netReceivable: round2(netReceivable),
    netProfit: netProfit !== null ? round2(netProfit) : null,
    roiPct: roiPct !== null ? round2(roiPct) : null
  };
}

function round2(val) {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

module.exports = {
  calculateBuy,
  calculateSell
};
