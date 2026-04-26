const fs = require("fs");
const yaml = require("js-yaml");

let config = {};
try {
  const file = fs.readFileSync("./bot.yml", "utf8");
  config = yaml.load(file) || {};
} catch (err) {
  console.error("Warning: Failed to load bot.yml:", err);
}

module.exports = config;
