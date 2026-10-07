const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn, spawnSync } = require("node:child_process");
const { once } = require("node:events");
const root = process.env.MAICHAN_TEST_PACKAGE_ROOT || path.resolve(__dirname, "..");
const {
  readSettings, effectiveSettings, missingSettings, saveSettings, validPort,
} = require(path.join(root, "lib/config"));
const { parseOptions, checkBeeper } = require(path.join(root, "lib/cli"));

const cli = path.join(root, "bin/maichan.js");

function tempDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "maichan-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function isolatedEnvironment() {
  const environment = { ...process.env };
  for (const key of ["BEEPER_ACCESS_TOKEN", "BEEPER_BASE_URL", "NVIDIA_API_KEY", "API_KEY", "GEMINI_API_KEY", "PORT", "MAICHAN_DATA_DIR"]) {
    delete environment[key];
  }
  return environment;
}

async function fakeBeeper(t, status = 200) {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({ url: req.url, authorization: req.headers.authorization });
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ items: [] }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { requests, baseUrl: `http://127.0.0.1:${server.address().port}/v1` };
}

async function availablePort() {
  const server = http.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function runCli(args, environment = isolatedEnvironment()) {
  const child = spawn(process.execPath, [cli, ...args], { env: environment, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const [code] = await once(child, "exit");
  return { code, output };
}

test("help and version work from another directory without creating settings", (t) => {
  const directory = tempDirectory(t);
  const result = spawnSync(process.execPath, [cli, "--help", "--data-dir", path.join(directory, "settings")], {
    cwd: directory, env: isolatedEnvironment(), encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /setup/);
  assert.match(result.stdout, /doctor/);
  assert.equal(fs.existsSync(path.join(directory, "settings")), false);
  const version = spawnSync(process.execPath, [cli, "--version"], { encoding: "utf8" });
  assert.equal(version.stdout.trim(), require(path.join(root, "package.json")).version);
});

test("CLI rejects typos, extra arguments, and invalid ports", () => {
  assert.throws(() => parseOptions(["strat"]), /Unknown command/);
  assert.throws(() => parseOptions(["start", "extra"]), /Unknown command/);
  assert.throws(() => parseOptions(["--unknown"]));
  for (const port of ["0", "65536", "1.5", "5e3", "abc"]) {
    assert.equal(validPort(port), false);
    assert.throws(() => parseOptions(["--port", port]), /port/);
  }
  assert.equal(parseOptions(["--port", "5002"]).port, "5002");
});

test("setup storage keeps secrets private and preserves existing chat configuration", (t) => {
  const directory = tempDirectory(t);
  const settings = { BEEPER_ACCESS_TOKEN: "token#with=symbols", NVIDIA_API_KEY: "test-key", GOOGLE_CALENDAR_CLIENT_SECRET: "keep-me" };
  saveSettings(directory, settings);
  const configPath = path.join(directory, "config.json");
  const config = JSON.parse(fs.readFileSync(configPath));
  assert.equal(config.draftMode, true);
  assert.deepEqual(config.watchedChats, []);
  fs.writeFileSync(configPath, JSON.stringify({ watchedChats: ["existing-chat"], draftMode: false }));
  saveSettings(directory, { ...readSettings(directory), NVIDIA_API_KEY: "replacement" });
  assert.deepEqual(JSON.parse(fs.readFileSync(configPath)).watchedChats, ["existing-chat"]);
  assert.equal(readSettings(directory).GOOGLE_CALENDAR_CLIENT_SECRET, "keep-me");
  assert.equal(readSettings(directory).BEEPER_ACCESS_TOKEN, settings.BEEPER_ACCESS_TOKEN);
  if (process.platform !== "win32") assert.equal(fs.statSync(path.join(directory, ".env")).mode & 0o777, 0o600);
  assert.equal(effectiveSettings(directory, { NVIDIA_API_KEY: "override" }).NVIDIA_API_KEY, "override");
});

test("configuration requires Beeper and at least one supported AI provider", () => {
  assert.equal(missingSettings({}).length, 2);
  for (const key of ["NVIDIA_API_KEY", "API_KEY", "GEMINI_API_KEY"]) {
    assert.deepEqual(missingSettings({ BEEPER_ACCESS_TOKEN: "token", [key]: "key" }), []);
  }
});

test("noninteractive first run gives setup guidance without writing files or printing secrets", async (t) => {
  const directory = tempDirectory(t);
  const result = await runCli(["--data-dir", directory, "--no-open"]);
  assert.equal(result.code, 1);
  assert.match(result.output, /interactive terminal/);
  assert.equal(fs.existsSync(path.join(directory, ".env")), false);
});

test("connection diagnostics distinguish a rejected token and a reachable API", async (t) => {
  const beeper = await fakeBeeper(t);
  const settings = { BEEPER_BASE_URL: beeper.baseUrl, BEEPER_ACCESS_TOKEN: "test-token" };
  assert.equal((await checkBeeper(settings)).ok, true);
  assert.equal(beeper.requests[0].authorization, "Bearer test-token");
  const rejected = await fakeBeeper(t, 401);
  assert.match((await checkBeeper({ ...settings, BEEPER_BASE_URL: rejected.baseUrl })).message, /rejected the token/);
  assert.equal((await checkBeeper({ ...settings, BEEPER_BASE_URL: "file:///tmp" })).ok, false);
});

test("doctor succeeds with a bundled dashboard and fake Beeper without revealing credentials", async (t) => {
  const directory = tempDirectory(t);
  const beeper = await fakeBeeper(t);
  saveSettings(directory, { BEEPER_ACCESS_TOKEN: "secret-token", NVIDIA_API_KEY: "secret-api-key", BEEPER_BASE_URL: beeper.baseUrl });
  const result = await runCli(["doctor", "--data-dir", directory]);
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /Connected to Beeper/);
  assert.doesNotMatch(result.output, /secret-token|secret-api-key/);
  const missing = await runCli(["doctor", "--data-dir", path.join(directory, "missing")]);
  assert.equal(missing.code, 1);
  assert.match(missing.output, /Missing/);
});

test("start serves the dashboard and API from another cwd, persists settings, and stops cleanly", { timeout: 15000 }, async (t) => {
  const directory = tempDirectory(t);
  const beeper = await fakeBeeper(t);
  const port = await availablePort();
  saveSettings(directory, { BEEPER_ACCESS_TOKEN: "fake-token", GEMINI_API_KEY: "fake-key", BEEPER_BASE_URL: beeper.baseUrl });
  const child = spawn(process.execPath, [cli, "--data-dir", directory, "--no-open", "--port", String(port)], {
    cwd: directory, env: isolatedEnvironment(), stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => { if (child.exitCode === null) child.kill("SIGKILL"); });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const exited = once(child, "exit");
  for (let attempt = 0; attempt < 100 && !output.includes("Maichan is running"); attempt++) {
    if (child.exitCode !== null) assert.fail(output);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.match(output, /Maichan is running/, output);
  const base = `http://127.0.0.1:${port}`;
  const dashboard = await fetch(base);
  assert.match(await dashboard.text(), /<div id="root">/);
  const config = await (await fetch(`${base}/api/config`)).json();
  assert.equal(config.draftMode, true);
  assert.deepEqual(config.watchedChats, []);
  await fetch(`${base}/api/config`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...config, backgroundInfo: "persisted personality" }),
  });
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "config.json"))).backgroundInfo, "persisted personality");
  assert.doesNotMatch(output, /fake-token|fake-key/);
  child.kill("SIGINT");
  const [code] = await exited;
  assert.equal(code, 0, output);
});

test("an occupied port produces an actionable error", { timeout: 15000 }, async (t) => {
  const directory = tempDirectory(t);
  const beeper = await fakeBeeper(t);
  const server = http.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  saveSettings(directory, { BEEPER_ACCESS_TOKEN: "fake-token", API_KEY: "fake-key", BEEPER_BASE_URL: beeper.baseUrl });
  const result = await runCli(["--data-dir", directory, "--no-open", "--port", String(server.address().port)]);
  assert.equal(result.code, 1);
  assert.match(result.output, /already in use/);
  assert.match(result.output, /--port/);
});
