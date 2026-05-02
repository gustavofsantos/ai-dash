import { join, resolve } from "node:path";
import { existsSync, mkdirSync, chmodSync } from "node:fs";

function getBinInvocation(): string {
  const exe = process.argv[0] ?? "";
  const isBunRuntime = exe.endsWith("/bun") || exe === "bun";
  return isBunRuntime
    ? `bun ${resolve(process.argv[1]!)}`
    : resolve(process.argv[0]!);
}

export async function installHooks() {
  const cwd = process.cwd();
  console.log(`Installing git-ai-dash hooks in ${cwd}...`);

  // 1. Git Hooks
  const hooksDir = join(cwd, ".git", "hooks");
  if (!existsSync(hooksDir)) {
    console.error("Error: .git/hooks directory not found. Are you in a git repository?");
    return;
  }

  await installGitHook(hooksDir, "prepare-commit-msg");
  await installGitHook(hooksDir, "post-commit");

  // 2. Claude Code Hooks
  const claudeSettingsDir = join(cwd, ".claude");
  if (!existsSync(claudeSettingsDir)) {
    mkdirSync(claudeSettingsDir, { recursive: true });
  }

  const settingsPath = join(claudeSettingsDir, "settings.json");
  let settings: any = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(await Bun.file(settingsPath).text());
    } catch (e) {
      console.warn("Could not parse existing .claude/settings.json, starting fresh.");
    }
  }

  if (!settings.hooks) settings.hooks = {};

  const events = [
    "SessionStart",
    "UserPromptSubmit",
    "Stop",
    "SessionEnd",
    "PreToolUse",
    "PostToolUse",
    "PreCompact",
    "PostCompact"
  ];

  const binInvocation = getBinInvocation();

  for (const ev of events) {
    settings.hooks[ev] = [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": `${binInvocation} hook claude-code ${ev}`
          }
        ]
      }
    ];
  }

  await Bun.write(settingsPath, JSON.stringify(settings, null, 2));
  console.log("Updated .claude/settings.json");

  console.log("Installation complete!");
}

async function installGitHook(hooksDir: string, hookName: string) {
  const binInvocation = getBinInvocation();
  const hookPath = join(hooksDir, hookName);
  const hookScript = `#!/bin/bash
# git-ai-dash hook
${binInvocation} hook git ${hookName} "$@"
`;

  if (existsSync(hookPath)) {
    const existing = await Bun.file(hookPath).text();
    if (existing.includes("git-ai-dash hook")) {
      console.log(`Git hook ${hookName} already installed.`);
      return;
    }
    // Append
    await Bun.write(hookPath, existing + "\n" + hookScript);
    console.log(`Appended to existing git hook ${hookName}`);
  } else {
    // Create new
    await Bun.write(hookPath, hookScript);
    chmodSync(hookPath, 0o755);
    console.log(`Created new git hook ${hookName}`);
  }
}
