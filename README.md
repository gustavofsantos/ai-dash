# git-ai-dash

A local dashboard for [Git AI](https://usegitai.com) that visualizes your AI coding sessions, line attribution stats, and conversation history — all from the data Git AI collects on your machine.

## Requirements

- [Bun](https://bun.sh) ≥ 1.3
- [Git AI](https://usegitai.com/docs/cli) installed and used at least once (data lives in `~/.git-ai/internal/db`)
- Internet access for Chart.js (loaded from CDN)

## Install

```sh
bun install
```

## Run

```sh
bun start
```

Then open [http://localhost:3333](http://localhost:3333).

To auto-restart on file changes during development:

```sh
bun dev
```

To use a different port:

```sh
PORT=4000 bun start
```

## Pages

| Route | Description |
|-------|-------------|
| `/` | Overview: stats cards, activity chart, top projects, recent sessions |
| `/sessions` | Paginated list of all sessions with prompt preview |
| `/sessions/:id` | Session detail: metadata, attribution stats, full conversation |

## Data sources

All data is read directly from Git AI's local SQLite database at `~/.git-ai/internal/db`. The dashboard opens it **read-only** and never writes to it.

| Field | What it shows |
|-------|---------------|
| Sessions | Each time an AI agent (e.g. Claude Code) ran and was tracked by Git AI |
| AI Lines Written | `total_additions` across all sessions |
| Acceptance Rate | `accepted_lines / total_additions` — lines you kept vs. AI wrote |
| Projects | Distinct `workdir` paths touched across sessions |

> **Note:** `accepted_lines` populates only after Git AI reconciles checkpoints at commit time. Early sessions may show 0%.

## Project structure

```
src/
  db.ts       read-only SQLite queries against ~/.git-ai/internal/db
  views.ts    server-rendered HTML (dark theme, Chart.js charts)
  index.ts    Hono routes + Bun server
```
