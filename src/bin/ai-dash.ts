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
  } else if (args[0] === "hook") {
    const { handleHook } = await import("../cli/hooks.ts");
    await handleHook(args.slice(1));
  } else if (args[0] === "reconcile") {
    const { reconcileRepo } = await import("../cli/reconcile.ts");
    await reconcileRepo(process.cwd());
  } else if (args[0] === "install") {
    const { installHooks } = await import("../cli/install.ts");
    await installHooks();
  } else {
    console.log("Git AI Dashboard CLI");
    console.log("");
    console.log("Usage:");
    console.log("  ai-dash --serve            Start the production server");
    console.log("  ai-dash hook <tool> <ev>   Process agent hook event (reads from stdin)");
    console.log("  ai-dash install            Install hooks into the current project");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("CLI Error:", err);
  process.exit(1);
});
