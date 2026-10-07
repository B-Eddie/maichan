const fs = require("node:fs");
const path = require("node:path");
const { parseArgs } = require("node:util");
const { spawn } = require("node:child_process");
const {
  PROVIDERS, dataDirectory, readSettings, effectiveSettings, missingSettings,
  validPort, validBeeperUrl, ensureConfig, saveSettings,
} = require("./config");
const { version } = require("../package.json");

const HELP = `Maichan ${version} — your AI companion for Beeper chats

Usage: maichan [command] [options]

Commands:
  start       Start the dashboard (default); guide setup on first run
  setup       Configure your Beeper token and AI provider
  doctor      Check configuration, dashboard files, and Beeper connection

Options:
  --no-open          Start without opening a browser
  --port <number>    Dashboard port (default: 5001)
  --data-dir <path>  Store settings here (default: ~/.maichan)
  -h, --help         Show these instructions
  -v, --version      Show the version

Examples:
  npx maichan
  maichan setup
  maichan start --no-open --port 5002
  maichan doctor

Requires Node.js 22.12+ and Beeper Desktop with its local API enabled.
Keep this terminal open while using Maichan. Press Ctrl+C to stop.
`;

function parseOptions(args) {
  const { values, positionals } = parseArgs({
    args, allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      "no-open": { type: "boolean" },
      port: { type: "string" },
      "data-dir": { type: "string" },
    },
  });
  const command = positionals[0] || "start";
  if (!values.help && !values.version && (positionals.length > 1 || !["start", "setup", "doctor"].includes(command))) {
    throw new Error(`Unknown command: ${positionals.join(" ")}. Run maichan --help.`);
  }
  if (values.port !== undefined && !validPort(values.port)) throw new Error("Choose a port between 1 and 65535.");
  return { ...values, command, directory: dataDirectory(values["data-dir"]) };
}

async function setup(directory) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(`Setup needs an interactive terminal. Run maichan setup in a terminal, or configure ${path.join(directory, ".env")} (see the README).`);
  }
  const { input, password, select } = await import("@inquirer/prompts");
  const saved = readSettings(directory);
  const settings = effectiveSettings(directory);
  console.log("\nWelcome to Maichan! Open Beeper Desktop and enable its local API in Settings.");
  console.log("Copy the Beeper access token from Beeper Settings. Tokens and API keys stay hidden while you type.\n");
  const token = await password({
    message: `Beeper access token${settings.BEEPER_ACCESS_TOKEN ? " (leave blank to keep current)" : ""}:`,
    mask: "*",
    validate: (value) => !!(value.trim() || settings.BEEPER_ACCESS_TOKEN?.trim()) || "Paste your Beeper access token.",
  });
  const provider = await select({
    message: "Which AI provider key would you like to configure?",
    choices: PROVIDERS.map(({ name, key }) => ({ name, value: key })),
    default: PROVIDERS.find(({ key }) => settings[key])?.key,
  });
  const key = await password({
    message: `AI API key${settings[provider] ? " (leave blank to keep current)" : ""}:`,
    mask: "*",
    validate: (value) => !!(value.trim() || settings[provider]?.trim()) || "Paste an API key for the selected provider.",
  });
  const baseUrl = await input({
    message: "Beeper API URL:",
    default: settings.BEEPER_BASE_URL || "http://localhost:23373/v1",
    validate: (value) => validBeeperUrl(value) || "Enter an http:// or https:// URL without embedded credentials, query, or fragment.",
  });
  const port = await input({
    message: "Dashboard port:", default: settings.PORT || "5001",
    validate: (value) => validPort(value) || "Choose a port between 1 and 65535.",
  });
  saveSettings(directory, {
    ...saved,
    BEEPER_ACCESS_TOKEN: token.trim() || settings.BEEPER_ACCESS_TOKEN,
    [provider]: key.trim() || settings[provider],
    BEEPER_BASE_URL: baseUrl.replace(/\/+$/, ""),
    PORT: port,
  });
  console.log(`\nSaved settings to ${directory}. Existing chat settings are preserved.`);
  console.log("New installations start in draft mode. Choose your chats and personality in the dashboard.");
  console.log("Run maichan to open it, or maichan doctor to check your connection.\n");
}

async function checkBeeper(settings) {
  const base = settings.BEEPER_BASE_URL || "http://localhost:23373/v1";
  if (!validBeeperUrl(base)) return { ok: false, message: "Invalid Beeper API URL. Run maichan setup." };
  try {
    const response = await fetch(`${base.replace(/\/+$/, "")}/chats/search?limit=1`, {
      headers: { Authorization: `Bearer ${settings.BEEPER_ACCESS_TOKEN}` },
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: "Beeper rejected the token. Copy a fresh token from Beeper Settings and run maichan setup." };
    }
    if (!response.ok) return { ok: false, message: `Beeper returned HTTP ${response.status}. Check its local API URL in maichan setup.` };
    await response.json();
    return { ok: true, message: "Connected to Beeper Desktop." };
  } catch {
    return { ok: false, message: "Could not reach Beeper's API. Open Beeper Desktop, enable its local API, and check the URL with maichan setup." };
  }
}

async function doctor(directory, port) {
  const settings = effectiveSettings(directory);
  const missing = missingSettings(settings);
  let ok = missing.length === 0;
  console.log(`Settings: ${directory}`);
  console.log(missing.length ? `Missing ${missing.join(" and ")}. Run maichan setup.` : "Beeper token and AI API key are configured (AI key validity is checked when used).");
  if (!validPort(port || settings.PORT || "5001")) {
    console.log("Invalid dashboard port. Run maichan setup.");
    ok = false;
  }
  const dashboard = fs.existsSync(path.join(__dirname, "../dist/index.html"));
  console.log(dashboard ? "Bundled dashboard is present." : "Dashboard is missing. Reinstall Maichan; for a source checkout, run npm run build.");
  ok = ok && dashboard;
  if (settings.BEEPER_ACCESS_TOKEN) {
    const connection = await checkBeeper(settings);
    console.log(connection.message);
    ok = ok && connection.ok;
  }
  if (!ok) process.exitCode = 1;
}

function openBrowser(url) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "rundll32.exe" : "xdg-open";
  const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  const fallback = () => console.log(`Open ${url} in your browser.`);
  child.once("error", fallback);
  child.once("exit", (code) => { if (code) fallback(); });
  child.unref();
}

async function start(options) {
  let settings = effectiveSettings(options.directory);
  if (missingSettings(settings).length) {
    console.log(`Missing ${missingSettings(settings).join(" and ")}. Let's set up Maichan.`);
    await setup(options.directory);
    settings = effectiveSettings(options.directory);
  }
  const port = options.port || settings.PORT || "5001";
  if (!validPort(port)) throw new Error("Invalid dashboard port. Run maichan setup or pass --port 5001.");
  if (!fs.existsSync(path.join(__dirname, "../dist/index.html")) && !process.execArgv.includes("--watch")) {
    throw new Error("The dashboard is missing. Reinstall Maichan; for a source checkout, run npm run build.");
  }
  ensureConfig(options.directory);
  const connection = await checkBeeper(settings);
  if (!connection.ok) console.log(`\n${connection.message}\nThe dashboard will still open; connect Beeper to load chats.\n`);
  process.env.MAICHAN_DATA_DIR = options.directory;
  for (const [key, value] of Object.entries(readSettings(options.directory))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  process.env.BEEPER_BASE_URL ||= "http://localhost:23373/v1";
  const { startServer } = require("../server/index");
  let server;
  try {
    server = await startServer({ port: Number(port) });
  } catch (error) {
    if (error.code === "EADDRINUSE") throw new Error(`Port ${port} is already in use. Stop the other app or run maichan --port ${Number(port) === 65535 ? 5001 : Number(port) + 1}.`);
    throw error;
  }
  const url = `http://127.0.0.1:${port}`;
  console.log(`\nMaichan is running at ${url}`);
  console.log(`Settings: ${options.directory}`);
  console.log("Choose your chats and personality in the dashboard. Press Ctrl+C to stop.\n");
  if (!options["no-open"]) openBrowser(url);
  const stop = () => {
    console.log("\nStopping Maichan...");
    server.close();
    server.closeAllConnections();
    const timeout = setTimeout(() => process.exit(0), 2000);
    timeout.unref();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args);
  if (options.help) return console.log(HELP);
  if (options.version) return console.log(version);
  if (options.command === "setup") return setup(options.directory);
  if (options.command === "doctor") return doctor(options.directory, options.port);
  return start(options);
}

module.exports = { main, parseOptions, checkBeeper };
