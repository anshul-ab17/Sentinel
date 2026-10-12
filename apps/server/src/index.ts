import { buildApi } from "./api.ts";
import { loadConfig } from "../../../packages/config/runtime.ts";
const config = loadConfig();
const app = await buildApi(config);
await app.listen({ port: config.port, host: config.host });
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    void app.close().then(() => process.exit(0));
  });
