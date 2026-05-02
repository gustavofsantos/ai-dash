#!/usr/bin/env bun
const args = process.argv.slice(2);

async function main() {
  if (args.includes("--serve")) {
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
    console.log("  ai-dash --serve            Start the dashboard server");
    console.log("  ai-dash hook <tool> <ev>   Process agent hook event (reads from stdin)");
    console.log("  ai-dash install            Install hooks into the current project");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("CLI Error:", err);
  process.exit(1);
});
