import { Queue } from "bullmq";
import { config } from "../config";

export const redisConnection = { url: config.redisUrl };

export const syncQueue = new Queue("incharj-sync", { connection: redisConnection });
export const documentQueue = new Queue("incharj-sync-documents", { connection: redisConnection });
