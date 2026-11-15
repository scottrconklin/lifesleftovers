import { existsSync } from "node:fs";

// Load .env.local for DB tests run outside Next (CI provides env directly).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
