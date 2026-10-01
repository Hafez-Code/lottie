import { studioFetch } from "./studio-api";

export interface AgentRunner {
  id: string;
  label: string;
  detected: boolean;
  executable: boolean;
  status: "available" | "configuration-only" | "not-installed" | "not-configured";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  references?: string[];
  context?: { frame: number; layer?: { index: number; name: string } | null };
}

export interface ChatSession {
  messages: ChatMessage[];
  run: null | { id: string; agent: string; status: "running" | "cancelling" | "completed" | "cancelled" | "failed" | "interrupted"; error?: string };
}

export async function chatRequest<T>(route: string, body?: unknown): Promise<T> {
  const res = await studioFetch(`/api/chat${route}`, body === undefined ? undefined : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export function selectedAgent(): string {
  return localStorage.getItem("diffusion.runner") ?? "";
}

export function rememberAgent(id: string) {
  localStorage.setItem("diffusion.runner", id);
}
