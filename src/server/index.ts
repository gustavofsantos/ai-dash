import { createApp } from "./app.ts";
import type { WebSocketData } from "./ws.ts";
import index from "../client/index.html";

const PORT = parseInt(process.env.PORT ?? "3333", 10);
const { api, websocket } = createApp();

const server = Bun.serve<WebSocketData>({
  port: PORT,
  development: process.env.NODE_ENV !== "production",
  routes: {
    "/ws": (req, server) => {
      const ok = server.upgrade(req, { data: { createdAt: Date.now() } });
      return ok ? undefined : new Response("Upgrade failed", { status: 400 });
    },
    "/api/*": (req) => api.fetch(req),
    "/*": index,
  },
  websocket,
});

console.log(`Git AI Dashboard → http://localhost:${server.port}`);
