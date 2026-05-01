import { useWebSocket } from "./provider.tsx";

export function useSessionFeed() {
  const { isConnected } = useWebSocket();
  return { isConnected };
}
