import { test, expect, mock, beforeEach, afterEach } from "bun:test";
import React from "react";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WebSocketProvider } from "./provider.tsx";
import { Window } from "happy-dom";

const window = new Window();
// @ts-ignore
global.window = window;
// @ts-ignore
global.document = window.document;
// @ts-ignore
global.navigator = window.navigator;
// @ts-ignore
global.Node = window.Node;
// @ts-ignore
global.Element = window.Element;
// @ts-ignore
global.HTMLElement = window.HTMLElement;
// @ts-ignore
global.HTMLDivElement = window.HTMLDivElement;

// Mock WebSocket
class MockWebSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((err: any) => void) | null = null;
  url: string;

  constructor(url: string) {
    this.url = url;
    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 0);
  }

  send(data: string) {}
  close() {
    if (this.onclose) this.onclose();
  }

  // Helper to simulate receiving a message
  receive(data: any) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }
}

// @ts-ignore
global.WebSocket = MockWebSocket;

// Mock window.location
// @ts-ignore
delete window.location;
// @ts-ignore
window.location = {
  protocol: "http:",
  host: "localhost:3333",
};

test("WebSocketProvider invalidates queries on session.new message", async () => {
  const queryClient = new QueryClient();
  const invalidateSpy = mock(() => Promise.resolve());
  queryClient.invalidateQueries = invalidateSpy as any;

  let capturedWs: MockWebSocket | null = null;
  // @ts-ignore
  global.WebSocket = class extends MockWebSocket {
    constructor(url: string) {
      super(url);
      capturedWs = this;
    }
  };

  render(
    <QueryClientProvider client={queryClient}>
      <WebSocketProvider>
        <div>Test Child</div>
      </WebSocketProvider>
    </QueryClientProvider>
  );

  // Wait for connection
  await waitFor(() => expect(capturedWs).not.toBeNull());

  // Simulate session.new message
  capturedWs!.receive({ type: "session.new", payload: { id: "new-1" } });

  // Check if queries were invalidated
  await waitFor(() => {
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["stats"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["sessions"] });
  });
});
