# git-ai-dash

A local dashboard for [Git AI](https://usegitai.com) that visualizes your AI coding sessions, line attribution stats, and conversation history — all from the data Git AI collects on your machine.

## Install

### Binary (recommended)

Download the latest binary for your platform from [Releases](../../releases/latest):

| Platform | File |
|----------|------|
| macOS Apple Silicon | `ai-dash-darwin-arm64` |
| macOS Intel | `ai-dash-darwin-x64` |
| Linux x64 | `ai-dash-linux-x64` |
| Linux ARM64 | `ai-dash-linux-arm64` |

```sh
# macOS (Apple Silicon)
curl -L https://github.com/gsantos-hc/git-ai-dash/releases/latest/download/ai-dash-darwin-arm64 \
  -o /usr/local/bin/ai-dash && chmod +x /usr/local/bin/ai-dash

# macOS (Intel)
curl -L https://github.com/gsantos-hc/git-ai-dash/releases/latest/download/ai-dash-darwin-x64 \
  -o /usr/local/bin/ai-dash && chmod +x /usr/local/bin/ai-dash

# Linux x64
curl -L https://github.com/gsantos-hc/git-ai-dash/releases/latest/download/ai-dash-linux-x64 \
  -o /usr/local/bin/ai-dash && chmod +x /usr/local/bin/ai-dash
```

> **macOS note:** On first run you may need to allow the binary in **System Settings → Privacy & Security**, or remove the quarantine flag:
> ```sh
> xattr -d com.apple.quarantine /usr/local/bin/ai-dash
> ```

### Start the server

```sh
ai-dash --serve
```

Open [http://localhost:3333](http://localhost:3333). Use `PORT=4000 ai-dash --serve` for a different port.

### Connect your AI agent

Run this once inside any project you want to track:

```sh
ai-dash install
```

This writes hooks to `.claude/settings.json` and `.git/hooks/` so Claude Code (and other supported agents) automatically send events to the dashboard.

### From source (requires [Bun](https://bun.sh) ≥ 1.3)

```sh
git clone https://github.com/gsantos-hc/git-ai-dash
cd git-ai-dash
bun install
bun dev
```

## Pages

| Route | Description |
|-------|-------------|
| `/` | Overview: stats cards, activity chart, top projects, recent sessions |
| `/sessions` | Paginated list of all sessions with prompt preview |
| `/sessions/:id` | Session detail: metadata, attribution stats, full conversation |

## Data sources

All data is stored in the dashboard's local SQLite database at `~/.git-ai-dash/db`.

| Field | What it shows |
|-------|---------------|
| Sessions | AI coding agent sessions captured and stored |
| AI Lines Written | Line additions and modifications tracked |
| Acceptance Rate | Lines you kept vs. total changes |
| Projects | Distinct projects touched across sessions |

## Project structure

```
src/
  cli/        CLI commands for git hooks
  client/     React frontend (SPA)
  server/     Bun server with Hono routes
  server/data/  SQLite database and queries
```
