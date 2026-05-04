# Add a New Agent

Use this skill to add hook support for a new AI coding agent (e.g., Cursor, Windsurf, Copilot).

---

## Overview

The system receives hook events from agents via HTTP POST to `/collect`. Each event is wrapped in an `Envelope<T>` that carries source metadata, and the payload is typed per agent and per event. New agents follow this same funnel:

```
Agent hook → Envelope<AgentPayload> → POST /collect → Pipeline → DB → WS broadcast
```

---

## Step 1 — Add payload types

Create `src/types/agents/<agent-name>.ts`. Define one interface per hook event the agent emits. Use the fixture files as the source of truth for field names and shapes.

```typescript
// src/types/agents/cursor.ts

interface CursorBase {
  session_id: string;
  cwd: string;
  hook_event_name: string;
}

export interface CursorSessionStart extends CursorBase {
  hook_event_name: "SessionStart";
  model: string;
}

export interface CursorAcceptEdit extends CursorBase {
  hook_event_name: "AcceptEdit";
  file_path: string;
  diff: string;
}

export type CursorPayload = CursorSessionStart | CursorAcceptEdit;
```

---

## Step 2 — Add fixture files

Create `fixtures/hooks/<agent-name>/` and add one `.json` file per event, copied from a real session. These become the ground truth for tests.

```
fixtures/hooks/cursor/
  session-start.json
  accept-edit.json
  session-end.json
```

Example `session-start.json`:
```json
{
  "session_id": "cursor-abc123",
  "cwd": "/projects/myapp",
  "hook_event_name": "SessionStart",
  "model": "claude-3-5-sonnet"
}
```

Update `fixtures/loader.ts` to accept the new agent name in the union:
```typescript
export function loadHookPayload(
  agent: "claude-code" | "gemini" | "git" | "cursor",
  event: string
): unknown { ... }
```

---

## Step 3 — Register transformers

In `src/server/pipeline/transform.ts`, add a `register()` call for each event:

```typescript
register("cursor", "SessionStart", (env, repoId) => ({
  id: randomUUID(),
  sessionId: (env.payload as CursorSessionStart).session_id,
  repoId,
  agent: "cursor" as any,
  type: "SessionStart",
  ts: env.source.timestamp,
  payload: env.payload as Record<string, unknown>,
  model: (env.payload as CursorSessionStart).model,
}));
```

---

## Step 4 — Extend the envelope source union

In `src/types/envelope.ts`, add the new agent to the union:

```typescript
export interface EnvelopeSource {
  agent: "claude-code" | "gemini" | "git" | "cursor";
  // ...
}
```

Also extend the `DashEvent.agent` type in `src/types/canonical.ts` if the field is narrowly typed.

---

## Step 5 — Handle lifecycle events in persist.ts (if needed)

If the new agent has session lifecycle semantics that differ from Claude Code or Gemini (e.g., different state transitions, token extraction from a custom transcript format), add a handler branch in `src/server/pipeline/persist.ts`.

---

## Step 6 — Add hook installer support

In `src/cli/install.ts`, add a `--<agent>` flag and the logic that writes the agent's settings file with the `ai-dash hook <agent> <event>` invocations.

For Cursor, this would write to `.cursor/settings.json` or the equivalent config location.

---

## Step 7 — Write tests

Add a test file at `src/server/services/<agent>.service.test.ts` or extend `data-collection.test.ts`. Load payloads from fixtures:

```typescript
import { loadHookPayload } from "../../../fixtures/loader.ts";

test("CursorSessionStart creates a session", async () => {
  const payload = {
    ...loadHookPayload("cursor", "session-start") as any,
    session_id: "test-session",
    cwd: testDir,
  };
  await hookService.handleHookEvent("cursor", payload);
  // assert...
});
```

Cover at minimum:
- Session is created on `SessionStart`
- Session state transitions (idle, ended)
- Token usage extraction (if the agent emits transcripts)
- Envelope is accepted and processed by `/collect`

---

## Step 8 — Update the README

Add the new agent to the supported agents table in `README.md`.

---

## Checklist

- [ ] `src/types/agents/<agent>.ts` — payload types defined
- [ ] `fixtures/hooks/<agent>/` — at least one `.json` per event
- [ ] `fixtures/loader.ts` — agent name added to union
- [ ] `src/types/envelope.ts` — agent added to `EnvelopeSource.agent` union
- [ ] `src/server/pipeline/transform.ts` — transformer registered for each event
- [ ] `src/server/pipeline/persist.ts` — lifecycle mutations handled (if needed)
- [ ] `src/cli/install.ts` — `--<agent>` flag wired up
- [ ] Tests written and passing (`bun test`)
- [ ] `README.md` updated
