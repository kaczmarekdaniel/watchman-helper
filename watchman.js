import { Client } from "fb-watchman";
import { spawn } from "child_process";
import path from "path";

const client = new Client();
const directoryToWatch = process.argv[2] || process.cwd();
let isTestRunning = false;

function runTests() {
  if (isTestRunning) {
    console.log("Test is already running, skipping this trigger");
    return;
  }
  console.log("\n🔄 Changes detected, running tests...");
  isTestRunning = true;

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const testProcess = spawn(npm, ["run", "test"], {
    cwd: directoryToWatch,
    stdio: "inherit",
    shell: true,
  });

  testProcess.on("close", (code) => {
    isTestRunning = false;
    if (code !== 0) {
      console.log(`\n❌ Tests failed with exit code ${code}`);
    } else {
      console.log("\n✅ Tests completed successfully");
    }
    console.log("👀 Watching for changes...");
  });
}

client.capabilityCheck(
  { optional: [], required: ["relative_root"] },
  (error, resp) => {
    if (error) {
      console.error("Error during capability check:", error);
      client.end();
      process.exit(1);
    }

    client.command(["watch-project", directoryToWatch], (error, resp) => {
      if (error) {
        console.error("Error initiating watch:", error);
        client.end();
        process.exit(1);
      }
      console.log(`Watch established on ${resp.watch}`);
      console.log(`Watching directory: ${directoryToWatch}`);
      console.log("👀 Watching for changes...");

      const watchPath = resp.relative_path ? resp.relative_path : "";

      const sub = {
        expression: ["allof", ["type", "f"]],
        fields: ["name", "exists"],
      };

      if (watchPath) {
        sub.relative_root = watchPath;
      }

      client.command(
        ["subscribe", resp.watch, "all-changes", sub],
        (error, resp) => {
          if (error) {
            console.error("Failed to subscribe:", error);
            client.end();
            process.exit(1);
          }
          console.log("Subscription established");
        },
      );
    });
  },
);

let debounceTimer;
const DEBOUNCE_DELAY = 500;

client.on("subscription", (resp) => {
  if (resp.subscription !== "all-changes") return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    runTests();
  }, DEBOUNCE_DELAY);
});

process.on("SIGINT", () => {
  console.log("Shutting down watchman client...");
  client.end();
  process.exit(0);
});
