const fs = require("fs");
const path = require("path");

const configPath = path.join(__dirname, "../server/config.json");
const examplePath = path.join(__dirname, "../server/config.json.example");

if (fs.existsSync(configPath)) {
  console.log("setup: keeping your existing server/config.json");
} else if (fs.existsSync(examplePath)) {
  fs.copyFileSync(examplePath, configPath);
  console.log("setup: created server/config.json from config.json.example");
} else {
  fs.writeFileSync(
    configPath,
    JSON.stringify(
      {
        watchedChats: [],
        backgroundInfo: "",
        chatPersonalities: {},
        calendarEnabled: true,
        calendarAutoWrite: true,
        draftMode: true,
        sendDelayMinSec: 0,
        sendDelayMaxSec: 0,
      },
      null,
      2,
    ),
  );
  console.log("setup: created blank server/config.json");
}
