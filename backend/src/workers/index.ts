import { Worker } from "bullmq";
import { initializeDatabase, query } from "../db";
import { config } from "../config";
import { loadConnectors } from "../connectors/registry";
import { documentQueue, syncQueue, redisConnection } from "./queue";
import { dispatchDueSyncs } from "./scheduler";
import {
  processDocumentJob,
  processEnumerateJob,
  processFinalizeJob,
  type DocumentJobData,
  type EnumerateJobData,
  type FinalizeJobData,
} from "./processor";
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

  const orchestrationWorker = new Worker(
    "incharj-sync",
    async (job) => {
      if (job.name === "dispatch") {
        await dispatchDueSyncs();
        return;
      }

      if (job.name === "sync-enumerate") {
        const { syncJobId, connectorId } = job.data as EnumerateJobData;
        await processEnumerateJob({ syncJobId, connectorId });
        return;
      }

      if (job.name === "sync-finalize") {
        await processFinalizeJob(job.data as FinalizeJobData);
        return;
      }

      logger.warn({ jobName: job.name }, "orchestration worker received unsupported job");
    },
    {
      connection: redisConnection,
      concurrency: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    }
  );

  const documentWorker = new Worker(
    "incharj-sync-documents",
    async (job) => {
      if (job.name === "sync-document") {
        await processDocumentJob(job.data as DocumentJobData, job);
        return;
      }

      logger.warn({ jobName: job.name }, "document worker received unsupported job");
    },
    {
      connection: redisConnection,
      concurrency: Math.max(1, config.documentWorkerConcurrency),
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    }
  );

  orchestrationWorker.on("failed", (job, err) => {
    logger.error({ worker: "orchestration", jobId: job?.id, jobName: job?.name, err }, "bullmq job failed");
  });

  documentWorker.on("failed", (job, err) => {
    logger.error({ worker: "document", jobId: job?.id, jobName: job?.name, err }, "bullmq job failed");
  });

  await documentQueue.waitUntilReady();

  logger.info(
    { documentWorkerConcurrency: Math.max(1, config.documentWorkerConcurrency) },
    "worker started"
  );

  orchestrationWorker.on("error", (err) => {
    logger.error({ worker: "orchestration", err }, "worker error");
  });

  documentWorker.on("error", (err) => {
    logger.error({ worker: "document", err }, "worker error");
  });

  // Keep process alive and report listener-level failures.
  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "uncaught exception in worker process");
    process.exit(1);
  });

  process.on("unhandledRejection", (err) => {
    logger.fatal({ err }, "unhandled rejection in worker process");
    process.exit(1);
  });
}

main().catch((error) => {
  logger.fatal({ err: error }, "worker process crashed");
  process.exit(1);
});
