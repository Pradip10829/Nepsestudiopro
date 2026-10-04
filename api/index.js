const path = require("path");
const fs = require("fs");
const requestHandler = require("../src/server");

// Ensure @vercel/nft traces and bundles data/ and public/ files into the serverless function
const BUNDLED_PATHS = [
  path.join(__dirname, "..", "public", "index.html"),
  path.join(__dirname, "..", "data", "live_quotes_cache.json"),
  path.join(__dirname, "..", "data", "real_market_cache.json"),
  path.join(__dirname, "..", "data", "live_news_cache.json"),
  path.join(__dirname, "..", "data", "meroshare_mero_portfolio.json")
];
void BUNDLED_PATHS.length;
void fs;

module.exports = async (req, res) => {
  return requestHandler(req, res);
};
