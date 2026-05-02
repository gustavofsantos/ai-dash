# Product: git-ai-dash

## What it is

A local-first personal analytics dashboard for tracking AI-assisted code sessions. It stores and visualizes your AI coding sessions, line attribution stats, and full conversation history — no cloud account, no authentication, no data leaves your machine.

## The problem

Understanding your AI-assisted coding patterns—how much code is AI-written, which projects rely on AI most, how often you accept vs. override suggestions, and what you actually asked the AI to do—is valuable for productivity analysis. git-ai-dash provides a local dashboard: run `bun start`, open `localhost:3333`, and see your AI usage without touching the cloud.

## Target user

A developer who uses one or more AI coding agents (Claude Code, Cursor, Gemini CLI, etc.) and wants to understand their own AI usage patterns: how much code is AI-written, which projects rely on AI most, how often they accept vs. override suggestions, and what they actually asked the AI to do.

## What we track

The dashboard records:

- Every AI coding session: the tool, model, working directory, and timing
- Events during sessions: messages, tool calls, and responses
- Checkpoints with line-level attribution: lines added/deleted, accepted vs. overridden
- The commit SHA once the session is reconciled at commit time
- Token usage and conversation transcripts

This data lives in `~/.git-ai-dash/db` (SQLite).

## Features

### Overview (`/`)

- **Stat cards**: total sessions, total AI lines written, overall acceptance rate (lines kept / lines written), distinct projects touched
- **Activity chart**: dual-axis line chart of sessions and AI lines over time
- **Top projects**: horizontal bar chart of most-active projects by session count
- **Recent sessions**: table of the 10 latest sessions with project, model, line counts, acceptance rate, and first-message preview

### Sessions (`/sessions`)

Paginated list of all sessions (20 per page). Each row shows project, AI tool, model, lines added, lines removed, acceptance rate (with a green/gray status dot), and date. Click any row to drill into the session detail.

### Session detail (`/sessions/:id`)

Two-panel layout:
- **Session info**: project path, working directory, tool, model, human author, creation time, commit SHA
- **Attribution stats**: lines written, lines removed, lines accepted, lines overridden, acceptance rate

Below the panels: the full conversation transcript — every user message, AI response, and tool call, rendered in chronological order with timestamps.

### Live updates

A WebSocket connection pushes new sessions to all connected browser tabs in real time. The server polls the database every 30 seconds and broadcasts any sessions created since the last check.

## Non-goals

- No authentication or user accounts
- No cloud sync or remote data sources
- Not a team/org dashboard — designed for a single developer's local machine

## Design

The "Minimalist Precision" design system (see `DESIGN.md`): achromatic core, no shadows or gradients, color used only as a signal (status, action, error). Dual light/dark theme adapts to the OS preference. Typography uses Space Grotesk for structural elements, Inter for body text, and JetBrains Mono for code/IDs.

## Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | Bun | Native SQLite, WebSocket, fast TS execution |
| API server | Hono on `Bun.serve()` | Lightweight, no Express overhead |
| Database | `bun:sqlite` → `~/.git-ai-dash/db` | Direct access, no ORM |
| Frontend | React SPA (TypeScript) | Component model for three distinct pages |
| Routing | React Router | Client-side navigation without full reloads |
| Charts | Chart.js (CDN) | Line + bar charts with minimal config |
| Bundler | Vite | Fast HMR during development |
| Live updates | Native WebSocket | 30s polling loop, broadcasts `session.new` events |
