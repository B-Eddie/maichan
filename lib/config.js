const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const dotenv = require("dotenv");

const PROVIDERS = [
  { name: "NVIDIA NIM", key: "NVIDIA_API_KEY" },
  { name: "Hack Club AI", key: "API_KEY" },
  { name: "Google Gemini", key: "GEMINI_API_KEY" },
];

function dataDirectory(value = process.env.MAICHAN_DATA_DIR) {
  return path.resolve(value || path.join(os.homedir(), ".maichan"));
}

function readSettings(directory) {
  const file = path.join(directory, ".env");
  return fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
}

function effectiveSettings(directory, environment = process.env) {
  return { ...readSettings(directory), ...environment };
}

function missingSettings(settings) {
  const missing = [];
  if (!settings.BEEPER_ACCESS_TOKEN?.trim()) missing.push("Beeper access token");
  if (!PROVIDERS.some(({ key }) => settings[key]?.trim())) missing.push("an AI API key");
  return missing;
}

function validPort(value) {
  if (!/^\d+$/.test(String(value))) return false;
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function validBeeperUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function ensureConfig(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, "config.json");
  try {
    fs.writeFileSync(target, fs.readFileSync(path.join(__dirname, "../server/config.json.example")), {
      flag: "wx", mode: 0o600,
    });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}

function saveSettings(directory, settings) {
  ensureConfig(directory);
  // Dotenv supports quoted multiline values. Keep optional settings when rerunning setup.
  const contents = Object.entries(settings).map(([key, value]) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`Invalid setting name: ${key}`);
    const text = String(value);
    const quote = text.includes("'") ? '"' : "'";
    if (text.includes("'") && text.includes('"')) throw new Error(`Remove quotation marks from ${key} before saving.`);
    return `${key}=${quote}${text}${quote}`;
  }).join("\n") + "\n";
  const target = path.join(directory, ".env");
  fs.writeFileSync(target, contents, { mode: 0o600 });
  fs.chmodSync(target, 0o600);
}

module.exports = {
  PROVIDERS, dataDirectory, readSettings, effectiveSettings, missingSettings,
  validPort, validBeeperUrl, ensureConfig, saveSettings,
};
