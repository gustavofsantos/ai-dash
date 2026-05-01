export function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function projectName(workdir: string | null): string {
  if (!workdir) return "unknown";
  return workdir.split("/").pop() || workdir;
}

export function shortModel(model: string): string {
  return model.replace("claude-", "").replace(/-\d{8}$/, "");
}

export function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function acceptanceRate(accepted: number, added: number): string {
  if (!added) return "—";
  return `${Math.round((accepted / added) * 100)}%`;
}

export function firstUserMessage(messagesJson: string): string {
  try {
    const parsed = JSON.parse(messagesJson);
    const msgs = Array.isArray(parsed) ? parsed : parsed.messages ?? [];
    const first = msgs.find((m: { type: string }) => m.type === "user");
    const text: string = first?.text ?? "";
    return text.slice(0, 120) + (text.length > 120 ? "…" : "");
  } catch {
    return "";
  }
}
