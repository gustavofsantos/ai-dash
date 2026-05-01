import { createApp } from "./app.ts";
import type { WebSocketData } from "./ws.ts";

const PORT = parseInt(process.env.PORT ?? "3333", 10);
const { api, websocket } = createApp();

const server = Bun.serve<WebSocketData>({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    // 1. WebSocket upgrade
    if (url.pathname === "/ws") {
      const success = server.upgrade(req, {
        data: { createdAt: Date.now() },
      });
      return success ? undefined : new Response("Upgrade failed", { status: 400 });
    }

    // 2. API routes
    if (url.pathname.startsWith("/api")) {
      return api.fetch(req);
    }

    // 3. Static files & SPA fallback
    // In a real app we'd bundle this, but for this task we'll serve from src/client
    // and assume the dev server/bundler handles the rest or we serve them as is
    // for Bun's own transpile-on-the-fly (if configured) or just serve index.html
    
    const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(`./dist/client${filePath}`);
    
    return file.exists().then((exists) => {
      if (exists) {
        return new Response(file);
      }
      // SPA Fallback: serve index.html for all other routes
      return new Response(Bun.file("./dist/client/index.html"));
    });
  },
  websocket: websocket,
});

console.log(`Git AI Dashboard → http://localhost:${server.port}`);
