#!/usr/bin/env node

const { main } = require("../lib/cli");

main().catch((error) => {
  if (error.name === "ExitPromptError" || error.name === "AbortPromptError") {
    console.log("\nSetup cancelled. Run maichan when you're ready to try again.");
    process.exitCode = 130;
    return;
  }
  console.error(`\nMaichan: ${error.message}`);
  console.error("Run maichan --help for usage.");
  process.exitCode = 1;
});
