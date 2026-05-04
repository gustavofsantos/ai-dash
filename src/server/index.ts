import { createApp } from "./app.ts";
import type { ClientSocketData } from "./ws/hub.ts";
import index from "../client/index.html";

const PORT = parseInt(process.env.PORT ?? "3333", 10);
const { api, websocket, collect } = createApp();

const server = Bun.serve<ClientSocketData>({
  port: PORT,
  development: process.env.NODE_ENV !== "production",
  routes: {
    "/ws": (req, server) => {
      const ok = server.upgrade(req, { data: { type: "client", createdAt: Date.now() } });
      return ok ? undefined : new Response("Upgrade failed", { status: 400 });
    },
    "/collect": (req) => {
      if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
      return collect(req);
    },
    "/api/*": (req) => api.fetch(req),
    "/*": index,
  },
  websocket,
});

console.log(`Git AI Dashboard → http://localhost:${server.port}`);
