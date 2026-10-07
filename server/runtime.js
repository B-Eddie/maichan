const path = require("node:path");

// Direct source launches retain their old location; the CLI sets a persistent directory.
const DATA_DIR = path.resolve(process.env.MAICHAN_DATA_DIR || __dirname);
require("dotenv").config({ path: path.join(DATA_DIR, ".env"), quiet: true });

module.exports = { DATA_DIR };
