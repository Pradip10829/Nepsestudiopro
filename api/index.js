const requestHandler = require("../src/server");
const liveQuotesCache = require("../data/live_quotes_cache.json");
const realMarketCache = require("../data/real_market_cache.json");
const liveNewsCache = require("../data/live_news_cache.json");
const meroPortfolioCache = require("../data/meroshare_mero_portfolio.json");

void liveQuotesCache;
void realMarketCache;
void liveNewsCache;
void meroPortfolioCache;

module.exports = async (req, res) => {
  return requestHandler(req, res);
};
