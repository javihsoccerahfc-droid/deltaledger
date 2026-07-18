import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DELTALEDGER_DB_PATH ?? "./db/deltaledger.sqlite",
  },
});
