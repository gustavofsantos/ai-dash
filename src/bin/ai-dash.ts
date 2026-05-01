#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);

async function main() {
  if (args.includes("--serve")) {
    const distPath = join(process.cwd(), "dist", "client");
    if (!existsSync(join(distPath, "index.html"))) {
      console.error("Error: Production build missing.");
      console.error("Please run 'bun run build' first.");
      process.exit(1);
    }

    console.log("Starting server in production mode...");
    // @ts-ignore - dynamic import of the server
    await import("../server/index.ts");
  } else {
    console.log("Git AI Dashboard CLI");
    console.log("");
    console.log("Usage:");
    console.log("  ai-dash --serve    Start the production server");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("CLI Error:", err);
  process.exit(1);
});
