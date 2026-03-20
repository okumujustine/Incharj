import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import express from "express";
import { Queue } from "bullmq";
import { config } from "./src/config";

const redisConnection = { url: config.redisUrl };

const syncQueue = new Queue("incharj-sync", { connection: redisConnection });
const documentQueue = new Queue("incharj-sync-documents", { connection: redisConnection });

const app = express();
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/");

createBullBoard({
  queues: [
    new BullMQAdapter(syncQueue),
    new BullMQAdapter(documentQueue),
  ],
  serverAdapter,
});

app.use("/", serverAdapter.getRouter());

const PORT = 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Bull Board running at http://0.0.0.0:${PORT}`);
});
