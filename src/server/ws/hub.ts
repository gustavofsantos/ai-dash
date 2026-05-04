import type { ServerWebSocket } from "bun";
import type { WsMessage } from "../../types/canonical.ts";

export interface ClientSocketData {
  type: "client";
  createdAt: number;
}

export class WsHub {
  private clients = new Set<ServerWebSocket<ClientSocketData>>();

  get clientHandlers() {
    return {
      open: (ws: ServerWebSocket<ClientSocketData>) => {
        this.clients.add(ws);
        console.log(`[WS] Client connected. Total: ${this.clients.size}`);
      },
      message: (_ws: ServerWebSocket<ClientSocketData>, message: string | Buffer) => {
        console.log(`[WS] Message from client: ${message}`);
      },
      close: (ws: ServerWebSocket<ClientSocketData>) => {
        this.clients.delete(ws);
        console.log(`[WS] Client disconnected. Total: ${this.clients.size}`);
      },
    };
  }

  broadcast(msg: WsMessage): void {
    if (this.clients.size === 0) return;
    const serialized = JSON.stringify(msg);
    for (const client of this.clients) {
      try {
        client.send(serialized);
      } catch (e) {
        console.error("[WS] Failed to send to client:", e);
        this.clients.delete(client);
      }
    }
  }
}
