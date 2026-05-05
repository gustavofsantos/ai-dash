import { join, resolve } from "node:path";
import { existsSync, mkdirSync, chmodSync } from "node:fs";

function getBinInvocation(): string {
  const exe = process.argv[0] ?? "";
  const isBunRuntime = exe.endsWith("/bun") || exe === "bun";
  return isBunRuntime
    ? `bun ${resolve(process.argv[1]!)}`
    : resolve(process.argv[0]!);
}

export async function installHooks(options?: { claudeCode?: boolean; gemini?: boolean; cursor?: boolean }) {
  const cwd = process.cwd();
  console.log(`Installing git-ai-dash hooks in ${cwd}...`);

  // Default to all targets if no flags provided
  const installClaudeCode = options?.claudeCode ?? options === undefined;
  const installGemini = options?.gemini ?? options === undefined;
  const installCursor = options?.cursor ?? options === undefined;

  // 1. Git Hooks (always installed)
  const hooksDir = join(cwd, ".git", "hooks");
  if (!existsSync(hooksDir)) {
    console.error("Error: .git/hooks directory not found. Are you in a git repository?");
    return;
  }

  await installGitHook(hooksDir, "prepare-commit-msg");
  await installGitHook(hooksDir, "post-commit");

  // 2. Claude Code Hooks
  if (installClaudeCode) {
    await installClaudeCodeHooks(cwd);
  }

  // 3. Gemini Hooks
  if (installGemini) {
    await installGeminiHooks();
  }

  // 4. Cursor Hooks
  if (installCursor) {
    await installCursorHooks(cwd);
  }

  console.log("Installation complete!");
}

async function installClaudeCodeHooks(cwd: string) {
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
}

async function installGeminiHooks() {
  const homeDir = Bun.env.HOME;
  if (!homeDir) {
    console.warn("Could not determine HOME directory. Skipping Gemini hooks installation.");
    return;
  }

  const geminiSettingsDir = join(homeDir, ".gemini");
  if (!existsSync(geminiSettingsDir)) {
    mkdirSync(geminiSettingsDir, { recursive: true });
  }

  const settingsPath = join(geminiSettingsDir, "settings.json");
  let settings: any = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(await Bun.file(settingsPath).text());
    } catch (e) {
      console.warn("Could not parse existing ~/.gemini/settings.json, starting fresh.");
    }
  }

  if (!settings.hooks) settings.hooks = {};

  const events = ["SessionStart", "SessionEnd", "AfterAgent"];
  const binInvocation = getBinInvocation();

  for (const ev of events) {
    settings.hooks[ev] = [
      {
        type: "command",
        command: `${binInvocation} hook gemini`,
        timeout: 5000,
        name: "git-ai-dash"
      }
    ];
  }

  await Bun.write(settingsPath, JSON.stringify(settings, null, 2));
  console.log("Updated ~/.gemini/settings.json");
}

async function installCursorHooks(cwd: string) {
  const cursorDir = join(cwd, ".cursor");
  const hooksDir = join(cursorDir, "hooks");

  if (!existsSync(cursorDir)) {
    mkdirSync(cursorDir, { recursive: true });
  }
  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  // Create the hook script
  const hookScriptPath = join(hooksDir, "ai-dash.sh");
  const hookScript = `#!/bin/bash
# Cursor hooks integration for ai-dash
set -e

HOOK_EVENT="\${1:-\${CURSOR_HOOK_EVENT:-}}"

if [ -z "$HOOK_EVENT" ]; then
  cat > /dev/null
  exit 0
fi

PAYLOAD=\$(cat)

if command -v ai-dash &> /dev/null; then
  ai-dash cursor "$HOOK_EVENT" <<< "$PAYLOAD"
elif [ -f "node_modules/.bin/ai-dash" ]; then
  node_modules/.bin/ai-dash cursor "$HOOK_EVENT" <<< "$PAYLOAD"
else
  if command -v bun &> /dev/null; then
    SCRIPT_DIR="$( cd "$( dirname "\${BASH_SOURCE[0]}" )" && pwd )"
    PROJECT_ROOT="$( cd "$SCRIPT_DIR/../.." && pwd )"
    BUN_FILE="$PROJECT_ROOT/src/bin/ai-dash.ts"
    
    if [ -f "$BUN_FILE" ]; then
      bun "$BUN_FILE" cursor "$HOOK_EVENT" <<< "$PAYLOAD"
    fi
  fi
fi

exit 0
`;

  await Bun.write(hookScriptPath, hookScript);
  chmodSync(hookScriptPath, 0o755);

  // Create the hooks.json configuration
  const hooksJsonPath = join(cursorDir, "hooks.json");
  const hooksJson = {
    version: 1,
    hooks: {
      sessionStart: [{ command: ".cursor/hooks/ai-dash.sh sessionStart" }],
      sessionEnd: [{ command: ".cursor/hooks/ai-dash.sh sessionEnd" }],
      beforeShellExecution: [
        { command: ".cursor/hooks/ai-dash.sh beforeShellExecution", timeout: 5 }
      ],
      afterShellExecution: [{ command: ".cursor/hooks/ai-dash.sh afterShellExecution" }],
      afterFileEdit: [{ command: ".cursor/hooks/ai-dash.sh afterFileEdit" }],
      stop: [{ command: ".cursor/hooks/ai-dash.sh stop" }]
    }
  };

  if (existsSync(hooksJsonPath)) {
    try {
      const existing = JSON.parse(await Bun.file(hooksJsonPath).text());
      // Merge hooks
      if (existing.hooks) {
        for (const [event, hooks] of Object.entries(hooksJson.hooks)) {
          existing.hooks[event] = hooks;
        }
      }
      await Bun.write(hooksJsonPath, JSON.stringify(existing, null, 2));
      console.log("Updated .cursor/hooks.json");
    } catch (e) {
      console.warn("Could not parse existing .cursor/hooks.json, overwriting.");
      await Bun.write(hooksJsonPath, JSON.stringify(hooksJson, null, 2));
    }
  } else {
    await Bun.write(hooksJsonPath, JSON.stringify(hooksJson, null, 2));
  }

  console.log("Installed Cursor hooks in .cursor/");
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
