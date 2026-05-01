import type { ServerWebSocket } from "bun";
import type { DashRepository } from "./data/dash.repository.ts";

export interface WebSocketData {
  createdAt: number;
}

export class WebSocketService {
  private clients = new Set<ServerWebSocket<WebSocketData>>();
  private lastCheckTime = Math.floor(Date.now() / 1000);

  constructor(private dashRepo: DashRepository) {
    this.startPolling();
  }

  get handlers() {
    return {
      open: (ws: ServerWebSocket<WebSocketData>) => {
        this.clients.add(ws);
        console.log(`[WS] Client connected. Total: ${this.clients.size}`);
      },
      message: (ws: ServerWebSocket<WebSocketData>, message: string | Buffer) => {
        console.log(`[WS] Received message: ${message}`);
      },
      close: (ws: ServerWebSocket<WebSocketData>) => {
        this.clients.delete(ws);
        console.log(`[WS] Client disconnected. Total: ${this.clients.size}`);
      },
    };
  }

  private startPolling() {
    setInterval(() => {
      if (this.clients.size === 0) {
        this.lastCheckTime = Math.floor(Date.now() / 1000);
        return;
      }

      const newSessions = this.dashRepo.getSessionsAfter(this.lastCheckTime);
      if (newSessions.length > 0) {
        console.log(`[WS] Found ${newSessions.length} new sessions. Broadcasting...`);

        for (const session of newSessions) {
          const message = JSON.stringify({
            type: "session.new",
            payload: session,
          });

          for (const client of this.clients) {
            client.send(message);
          }

          const sessionTs = Math.floor(new Date(session.started_at).getTime() / 1000);
          if (sessionTs > this.lastCheckTime) {
            this.lastCheckTime = sessionTs;
          }
        }
      } else {
        this.lastCheckTime = Math.floor(Date.now() / 1000);
      }
    }, 30000);

    console.log("[WS] Polling loop started (30s interval)");
  }
}
