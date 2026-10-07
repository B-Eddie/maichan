const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "maichan-package-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

try {
  execFileSync(npm, ["run", "build"], { cwd: root, stdio: "inherit" });
  const [packed] = JSON.parse(execFileSync(npm, ["pack", "--ignore-scripts", "--json", "--pack-destination", temporary], {
    cwd: root, encoding: "utf8",
  }));
  const paths = packed.files.map(({ path: file }) => file);
  assert(paths.includes("bin/maichan.js"));
  assert(paths.includes("dist/index.html"));
  assert(paths.some((file) => file.endsWith(".glb")), "3D assets are bundled");
  for (const file of paths) {
    assert(!/(^|\/)node_modules\//.test(file), `Do not bundle dependencies: ${file}`);
    assert(!/(^|\/)(\.env|config\.json|calendar-tokens\.json|credentials\.json)$/.test(file), `Private file in package: ${file}`);
    assert(!file.startsWith("client/src/"), "Only compiled frontend assets belong in the package");
  }
  const install = path.join(temporary, "install");
  fs.mkdirSync(install);
  fs.writeFileSync(path.join(install, "package.json"), '{"private":true}');
  execFileSync(npm, ["install", "--omit=dev", "--no-audit", "--no-fund", path.join(temporary, packed.filename)], {
    cwd: install, stdio: "inherit",
  });
  const packageRoot = path.join(install, "node_modules/maichan");
  assert(!fs.existsSync(path.join(install, "node_modules/vite")), "Users do not need Vite");
  execFileSync(npm, ["exec", "--no", "--", "maichan", "--version"], { cwd: install, stdio: "inherit" });
  execFileSync(process.execPath, ["--test", path.join(root, "test/cli.test.js")], {
    cwd: install, env: { ...process.env, MAICHAN_TEST_PACKAGE_ROOT: packageRoot }, stdio: "inherit",
  });
  fs.copyFileSync(path.join(temporary, packed.filename), path.join(root, packed.filename));
  console.log(`\nVerified ${packed.filename}: ${paths.length} files, ${Math.round(packed.size / 1024)} KiB. Ready to publish.`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
