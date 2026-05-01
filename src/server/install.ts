import { join } from "node:path";
import { existsSync, mkdirSync, chmodSync } from "node:fs";

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

  // We'll use a local alias or the full path if possible. 
  // For simplicity, we'll assume 'ai-dash' is available or use bun run.
  const hookCmd = "ai-dash hook claude-code";

  for (const ev of events) {
    settings.hooks[ev] = `${hookCmd} ${ev}`;
  }

  await Bun.write(settingsPath, JSON.stringify(settings, null, 2));
  console.log("Updated .claude/settings.json");

  console.log("Installation complete!");
}

async function installGitHook(hooksDir: string, hookName: string) {
  const hookPath = join(hooksDir, hookName);
  const hookScript = `#!/bin/bash
# git-ai-dash hook
ai-dash hook git ${hookName} "$@"
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
