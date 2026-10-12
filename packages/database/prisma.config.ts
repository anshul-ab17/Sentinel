import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

export default defineConfig({
  schema: "schema.prisma",
  migrations: { path: "migrations" },
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://sentinel:sentinel@localhost:5432/sentinel",
  },
});
