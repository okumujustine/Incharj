import { initializeDatabase } from "../db";
import { loadConnectors } from "../connectors/registry";
import { dispatchDueSyncs } from "./scheduler";
import { processOnePendingJob } from "./processor";

async function tick() {
  await dispatchDueSyncs();
  while (await processOnePendingJob()) {
    // drain the queue
  }
}

async function main() {
  await initializeDatabase();
  await loadConnectors();
  while (true) {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 30_000));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
