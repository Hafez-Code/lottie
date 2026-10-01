import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { A, useParams } from "@solidjs/router";
import { ArrowUp, Square, Paperclip, X } from "lucide-solid";
import { AgentPicker } from "./agent-picker";
import { Button } from "./ui/button";
import { Textarea } from "./ui/input";
import { chatRequest, selectedAgent, type ChatSession } from "@/lib/chat";
import { useCanvas } from "@/context/canvas";
import { useScenes } from "@/context/scenes";
import { prepareReference, briefReferences, type Reference } from "@/lib/references";
import { studioBase } from "@/lib/studio-api";
import { useUI } from "@/context/ui";

export function SceneChat() {
  const params = useParams();
  const canvas = useCanvas();
  const { findProject } = useScenes();
  const { toggleControls } = useUI();
  const [session, setSession] = createSignal<ChatSession>({ messages: [], run: null });
  const [agent, setAgent] = createSignal(selectedAgent());
  const [text, setText] = createSignal("");
  const [error, setError] = createSignal("");
  const [sending, setSending] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [attachments, setAttachments] = createSignal<Reference[]>([]);
  const [preparing, setPreparing] = createSignal(false);
  const [base, setBase] = createSignal("");
  void studioBase().then(setBase).catch(() => {});
  let fileInput!: HTMLInputElement;
  const attach = async (files: File[]) => {
    if (busy() || preparing()) return;
    setPreparing(true); setError("");
    const current = generation;
    try {
      for (const file of files.slice(0, 4 - attachments().length)) {
        if (attachments().reduce((sum, file) => sum + file.size, 0) + file.size > 24 * 1024 * 1024) throw new Error("References must total 24 MB or less");
        const prepared = await prepareReference(file);
        if (current !== generation) break;
        setAttachments((before) => [...before, prepared]);
      }
    } catch (error) { if (generation === current) setError(error instanceof Error ? error.message : "Could not attach file"); }
    finally { setPreparing(false); }
  };
  const busy = () => sending() || ["running", "cancelling"].includes(session().run?.status ?? "");
  let messagesEl!: HTMLDivElement;
  let generation = 0;

  createEffect(() => {
    const project = params.project ?? "";
    const scene = params.scene ?? "";
    const current = ++generation;
    setSession({ messages: [], run: null });
    setText(""); setError(""); setLoading(true);
    setAttachments([]);
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const data = await chatRequest<ChatSession>(`?project=${encodeURIComponent(project)}&scene=${encodeURIComponent(scene)}`);
        if (active) {
          const before = session().run;
          if (before && ["running", "cancelling"].includes(before.status) && !["running", "cancelling"].includes(data.run?.status ?? "")) void canvas.refreshScene().catch(() => setError("Could not reload the updated scene"));
          setSession(data); setLoading(false);
        }
      } catch (err) { if (active) { setError(err instanceof Error ? err.message : "Could not load chat"); setLoading(false); } }
      if (active) timer = setTimeout(poll, 1000);
    };
    void poll();
    onCleanup(() => { active = false; clearTimeout(timer); if (generation === current) ++generation; });
  });

  createEffect(() => {
    session().messages.map((m) => m.text).join();
    queueMicrotask(() => { if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight; });
  });

  const run = async (useBrief = false) => {
    if (busy() || preparing() || !agent() || (!useBrief && !text().trim() && attachments().length === 0)) return;
    const current = generation;
    const project = params.project, scene = params.scene;
    setSending(true); setError("");
    try {
      await canvas.commitSource();
      const dataUrl = canvas.captureFrame();
      if (dataUrl) await chatRequest("/preview", { project, scene, dataUrl });
      const data = await chatRequest<ChatSession>("/run", { project, scene, agent: agent(), text: text(), images: briefReferences(attachments()), useBrief,
        context: { frame: Math.round(canvas.currentFrame()), layer: canvas.selectedLayer() } });
      if (generation === current) { setSession(data); setText(""); setAttachments([]); }
    } catch (err) { if (generation === current) setError(err instanceof Error ? err.message : "Could not run agent"); }
    finally { setSending(false); }
  };

  const stop = async () => {
    try { setSession(await chatRequest<ChatSession>("/stop", { project: params.project, scene: params.scene })); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not stop agent"); }
  };

  return (
    <aside class="absolute inset-y-4 left-4 flex w-[300px] flex-col overflow-hidden rounded-2xl border border-border bg-background text-foreground">
      <div class="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <A href="/" class="truncate text-xs font-medium hover:underline">← {findProject(params.project ?? "")?.label ?? "Projects"}</A>
        <button class="text-[10px] text-muted-foreground hover:text-foreground focus-ring" onClick={toggleControls}>Properties</button>
      </div>
      <div class="border-b border-border p-3"><AgentPicker value={agent()} onChange={setAgent} disabled={busy()} /></div>
      <div ref={messagesEl} class="min-h-0 flex-1 overflow-y-auto p-3" aria-live="polite">
        <Show when={loading()}><p class="text-xs text-muted-foreground">Loading conversation…</p></Show>
        <Show when={!loading() && session().messages.length === 0}><p class="text-xs leading-relaxed text-muted-foreground">Describe what to create or change in this scene. Select a layer in Inspect to include it with your request.</p></Show>
        <For each={session().messages}>{(message) => (
          <div class="mb-4 text-xs leading-relaxed">
            <div class="mb-1 text-[10px] font-medium text-muted-foreground">{message.role === "user" ? "You" : "Agent"}</div>
            <p class="whitespace-pre-wrap break-words" dir="auto">{message.text || (busy() ? "Working…" : "No text response.")}</p>
            <Show when={message.context?.layer}><p class="mt-1 text-[10px] text-muted-foreground">Layer: {message.context?.layer?.name} · Frame {message.context?.frame}</p></Show>
            <For each={message.references ?? []}>{(name) => <a class="mt-1 block truncate text-muted-foreground underline" target="_blank" rel="noreferrer" href={`${base()}/projects/${params.project}/${params.scene}/${name.split("/").map(encodeURIComponent).join("/")}`}>{name.split("/").pop()}</a>}</For>
          </div>
        )}</For>
      </div>
      <div class="shrink-0 border-t border-border p-3">
        <Show when={session().run}><p class="mb-2 text-[10px] text-muted-foreground" role="status">{session().run?.agent}: {session().run?.status}</p></Show>
        <Show when={error() || session().run?.error}><p class="mb-2 max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-xs text-destructive" role="alert">{error() || session().run?.error}</p></Show>
        <Show when={session().run?.status !== "completed" && !busy() && session().messages.length > 0}>
          <Button class="mb-2 w-full" disabled={!agent() || busy() || loading()} onClick={() => void run(true)}>{session().run ? "Retry request" : "Run saved brief"}</Button>
        </Show>
        <Show when={canvas.selectedLayer()}><p class="mb-1 truncate text-[10px] text-muted-foreground">Selected: {canvas.selectedLayer()?.name}</p></Show>
        <For each={attachments()}>{(file) => <div class="mb-1 flex items-center gap-1 text-[10px]"><span class="min-w-0 flex-1 truncate">{file.name}</span><button aria-label={`Remove ${file.name}`} disabled={busy()} onClick={() => setAttachments((prev) => prev.filter((f) => f.id !== file.id))}><X class="size-3" /></button></div>}</For>
        <Show when={preparing()}><p class="mb-1 text-[10px] text-muted-foreground" role="status">Preparing references…</p></Show>
        <Textarea aria-label="Message to agent" placeholder="Describe a change…" value={text()} maxLength={20000} disabled={busy()} class="min-h-20 resize-none text-xs"
          onPaste={(event) => { const files = Array.from(event.clipboardData?.files ?? []); if (files.length) void attach(files); }}
          onInput={(e) => setText(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void run(); } }} />
        <div class="mt-2 flex items-center justify-between">
          <Button size="icon" variant="ghost" aria-label="Attach images, GIFs or videos" disabled={busy() || preparing() || attachments().length >= 4} onClick={() => fileInput.click()}><Paperclip class="size-3" /></Button>
          <span class="text-[10px] text-muted-foreground">⌘ / Ctrl + Enter to send</span>
          <Show when={busy()} fallback={<Button size="icon" aria-label="Send message" disabled={!agent() || (!text().trim() && !attachments().length) || loading() || preparing()} onClick={() => void run()}><ArrowUp class="size-4" /></Button>}>
            <Button size="icon" aria-label="Stop agent" disabled={sending() || session().run?.status === "cancelling"} onClick={() => void stop()}><Square class="size-3" /></Button>
          </Show>
        </div>
        <input ref={fileInput} type="file" accept="image/*,video/*" multiple class="hidden" onChange={(event) => { void attach(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }} />
      </div>
    </aside>
  );
}
