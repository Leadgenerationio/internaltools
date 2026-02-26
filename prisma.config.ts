// Prisma config — dotenv not needed in production (Railway injects env vars directly)
// Prisma 7+ requires datasource.url here, NOT in the schema file.
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"]!,
  },
});
