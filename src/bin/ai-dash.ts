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
   const options: { claudeCode?: boolean; gemini?: boolean } = {};
   if (args.includes("--claude-code")) options.claudeCode = true;
   if (args.includes("--gemini")) options.gemini = true;
   await installHooks(Object.keys(options).length > 0 ? options : undefined);
  } else {
   console.log("Git AI Dashboard CLI");
   console.log("");
   console.log("Usage:");
   console.log("  ai-dash --serve              Start the dashboard server");
   console.log("  ai-dash hook <tool> <ev>     Process agent hook event (reads from stdin)");
   console.log("  ai-dash install [FLAGS]      Install hooks into the current project");
   console.log("");
   console.log("Install flags:");
   console.log("  --claude-code                Install only Claude Code hooks");
   console.log("  --gemini                     Install only Gemini hooks");
   console.log("  (no flags)                   Install all hooks (default)");
   process.exit(0);
  }
}

main().catch((err) => {
  console.error("CLI Error:", err);
  process.exit(1);
});
