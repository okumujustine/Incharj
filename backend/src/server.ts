import { buildApp } from "./app";
import { config } from "./config";

async function main() {
  const app = await buildApp();
  await app.listen({ host: "0.0.0.0", port: config.port });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
