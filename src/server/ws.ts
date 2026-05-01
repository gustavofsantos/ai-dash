import type { ServerWebSocket } from "bun";
import { getSessionsAfter, type Session } from "./db.ts";

export interface WebSocketData {
  createdAt: number;
}

const clients = new Set<ServerWebSocket<WebSocketData>>();
let lastCheckTime = Math.floor(Date.now() / 1000);

export const wsHandlers = {
  open(ws: ServerWebSocket<WebSocketData>) {
    clients.add(ws);
    console.log(`[WS] Client connected. Total: ${clients.size}`);
  },
  message(ws: ServerWebSocket<WebSocketData>, message: string | Buffer) {
    // We don't expect messages from client, but log for debug
    console.log(`[WS] Received message: ${message}`);
  },
  close(ws: ServerWebSocket<WebSocketData>) {
    clients.delete(ws);
    console.log(`[WS] Client disconnected. Total: ${clients.size}`);
  },
};

// Start the polling loop
setInterval(() => {
  if (clients.size === 0) {
    lastCheckTime = Math.floor(Date.now() / 1000);
    return;
  }

  const newSessions = getSessionsAfter(lastCheckTime);
  if (newSessions.length > 0) {
    console.log(`[WS] Found ${newSessions.length} new sessions. Broadcasting...`);
    
    for (const session of newSessions) {
      const message = JSON.stringify({
        type: "session.new",
        payload: session,
      });
      
      for (const client of clients) {
        client.send(message);
      }
      
      if (session.created_at > lastCheckTime) {
        lastCheckTime = session.created_at;
      }
    }
  } else {
    lastCheckTime = Math.floor(Date.now() / 1000);
  }
}, 30000);

console.log("[WS] Polling loop started (30s interval)");
