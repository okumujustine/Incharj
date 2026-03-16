import { Worker } from "bullmq";
import { initializeDatabase, query } from "../db";
import { loadConnectors } from "../connectors/registry";
import { syncQueue, redisConnection } from "./queue";
import { dispatchDueSyncs } from "./scheduler";
import { processSyncJob } from "./processor";
import { logger } from "../utils/logger";

const SQL_RESET_STUCK_JOBS = `
  UPDATE sync_jobs
  SET status = 'failed', error_message = 'Worker restarted unexpectedly', finished_at = now()
  WHERE status = 'running'
`;

async function main() {
  await initializeDatabase();
  await loadConnectors();

  // Reset any jobs left in 'running' state from a previous crash
  await query(SQL_RESET_STUCK_JOBS);
  logger.info("reset any stuck running jobs");

  // Schedule a repeatable dispatch tick every 30s
  await syncQueue.add("dispatch", {}, {
    repeat: { every: 30_000 },
    jobId: "dispatch",
    removeOnComplete: true,
  });

  const worker = new Worker(
    "incharj-sync",
    async (job) => {
      if (job.name === "dispatch") {
        await dispatchDueSyncs();
        return;
      }
      const { syncJobId, connectorId } = job.data as { syncJobId: string; connectorId: string };
      await processSyncJob(syncJobId, connectorId);
    },
    {
      connection: redisConnection,
      concurrency: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    }
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, jobName: job?.name, err }, "bullmq job failed");
  });

  logger.info("worker started");
}

main().catch((error) => {
  logger.fatal({ err: error }, "worker process crashed");
  process.exit(1);
});
