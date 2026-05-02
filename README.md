# git-ai-dash

A local dashboard for [Git AI](https://usegitai.com) that visualizes your AI coding sessions, line attribution stats, and conversation history — all from the data Git AI collects on your machine.

## Requirements

- [Bun](https://bun.sh) ≥ 1.3
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
