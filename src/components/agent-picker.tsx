import { createResource, createSignal, For, Show } from "solid-js";
import { chatRequest, rememberAgent, type AgentRunner } from "@/lib/chat";
import { isDesktop } from "@/lib/desktop";

export function AgentPicker(props: { value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const [key, setKey] = createSignal("");
  const [model, setModel] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");
  const save = async () => {
    setSaving(true); setError("");
    try {
      await chatRequest("/provider", { apiKey: key(), model: model() });
      setKey(""); await refetch(); rememberAgent("openai-api"); props.onChange("openai-api");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save provider"); }
    finally { setSaving(false); }
  };
  const [agents, { refetch }] = createResource(async () => (await chatRequest<{ agents: AgentRunner[] }>("/agents")).agents);
  return (
    <div class="flex min-w-0 flex-col gap-1">
      <div class="flex items-center gap-2">
        <select aria-label="AI agent" disabled={props.disabled || agents.loading} value={props.value}
          class="h-8 min-w-0 flex-1 rounded-md border border-border bg-input px-2 text-xs text-foreground focus-ring"
          onChange={(event) => { rememberAgent(event.currentTarget.value); props.onChange(event.currentTarget.value); }}>
          <option value="">Choose AI agent</option>
          <For each={agents() ?? []}>{(agent) => <option value={agent.id} disabled={!agent.executable}>
            {agent.label}{agent.id === "openai-api" ? (agent.executable ? " · Configured" : " · Add key") : agent.executable ? " · CLI found" : agent.detected ? " · CLI missing" : " · Not installed"}
          </option>}</For>
        </select>
        <button type="button" class="text-xs text-muted-foreground hover:text-foreground focus-ring" disabled={props.disabled || agents.loading} onClick={() => void refetch()}>Refresh</button>
      </div>
      <Show when={agents.error}><span class="text-xs text-destructive">Could not discover agents. Refresh to retry.</span></Show>
      <span class="text-[10px] text-muted-foreground">Uses your CLI account. Sign in through the agent's terminal first.</span>
      <details class="text-xs text-muted-foreground">
        <summary class="cursor-pointer py-1 focus-ring">Use an OpenAI API key</summary>
        <div class="flex flex-col gap-2 py-2">
          <input aria-label="OpenAI API key" type="password" autocomplete="off" placeholder="API key" value={key()} disabled={props.disabled || saving()} onInput={(e) => setKey(e.currentTarget.value)} class="h-8 rounded-md border border-border bg-input px-2 text-foreground focus-ring" />
          <input aria-label="OpenAI model" placeholder="Model name" value={model()} disabled={props.disabled || saving()} onInput={(e) => setModel(e.currentTarget.value)} class="h-8 rounded-md border border-border bg-input px-2 text-foreground focus-ring" />
          <p class="text-[10px]">{isDesktop() ? "Stored with your system's encryption." : "Kept in server memory until restart."} Requests use your API quota. Choose a model supporting images and JSON output.</p>
          <button type="button" disabled={props.disabled || saving() || !key().trim() || !model().trim()} onClick={() => void save()} class="h-8 rounded-md bg-muted text-foreground focus-ring disabled:opacity-50">{saving() ? "Saving…" : "Save API configuration"}</button>
          <Show when={error()}><p class="text-destructive" role="alert">{error()}</p></Show>
        </div>
      </details>
    </div>
  );
}
