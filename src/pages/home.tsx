import { createSignal, For, Show, onMount } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { ArrowUp, ChevronDown, Folder, Paperclip, Plus, Settings, Sparkles } from "lucide-solid";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input, Textarea } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useScenes } from "@/context/scenes";
import { useAccount } from "@/context/account";
import { getThumbnail } from "@/lib/thumbnails";
import type { Project } from "@/types";

const MODELS = [
  { id: "gpt-5.5", label: "GPT-5.5" },
  { id: "gpt-5-mini", label: "GPT-5 mini" },
];

const RECENTS_KEY = "diffusion.recents.v1";

type RecentsMap = Record<string, number>; // project slug -> last opened epoch ms

function loadRecents(): RecentsMap {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "{}") as RecentsMap;
  } catch {
    return {};
  }
}

function timeAgo(at: number): string {
  const diff = Date.now() - at;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function ProjectCard(props: { project: Project; index: number }) {
  const navigate = useNavigate();
  const [thumb, setThumb] = createSignal<string>();

  onMount(async () => {
    const scene = props.project.scenes[0];
    if (!scene) return;
    try {
      setThumb(await getThumbnail(scene));
    } catch {
      setThumb(undefined);
    }
  });

  const recents = loadRecents();
  const editedAt = recents[props.project.slug];

  return (
    <button
      type="button"
      onClick={() => {
        const next = { ...loadRecents(), [props.project.slug]: Date.now() };
        try {
          localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
        } catch {
          // Ignore storage failures; navigation still proceeds.
        }
        navigate(`/${props.project.slug}/${props.project.scenes[0]?.slug ?? ""}`);
      }}
      class="group flex w-[135px] flex-col gap-2 text-left"
    >
      <div class="ring-foreground/5 relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-muted shadow-xs ring-1 transition-shadow group-hover:ring-ring/40">
        <Show when={thumb()} fallback={<Plus class="size-5 text-muted-foreground absolute inset-0 m-auto" />}>
          <img src={thumb()} alt={props.project.label} class="absolute inset-0 h-full w-full object-cover" />
        </Show>
      </div>
      <div class="flex flex-col gap-0.5">
        <span class="text-xxs font-strong text-foreground">{props.project.label}</span>
        <span class="text-muted-foreground text-xxs">
          {editedAt ? timeAgo(editedAt) : `${props.project.scenes.length} scene${props.project.scenes.length === 1 ? "" : "s"}`}
        </span>
      </div>
    </button>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const { projects, ready } = useScenes();
  const { state, fullName } = useAccount();
  const { toast } = useToast();

  const [projectId, setProjectId] = createSignal<string>();
  const [model, setModel] = createSignal(MODELS[0].id);
  const [prompt, setPrompt] = createSignal("");
  const [creating, setCreating] = createSignal(false);
  const [sending, setSending] = createSignal(false);

  const selectedProject = () => projects().find((p) => p.slug === projectId());

  const send = () => {
    const text = prompt().trim();
    if (!text) {
      toast("Describe what you want to edit first.");
      return;
    }
    const target = selectedProject() ?? projects()[0];
    if (!target) {
      toast("No projects yet — create one first.");
      return;
    }
    setSending(true);
    setTimeout(() => setSending(false), 900);
    navigate(`/${target.slug}/${target.scenes[0]?.slug ?? ""}`);
  };

  const createProject = async () => {
    if (creating()) return;
    setCreating(true);
    try {
      const res = await fetch("/__scenes/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Untitled project" }),
      });
      const { project, scene } = (await res.json()) as { project: string; scene: string };
      navigate(`/${project}/${scene}`);
    } catch {
      toast("Could not create the project (dev server only).");
    } finally {
      setCreating(false);
    }
  };

  const initials = () => {
    const name = fullName();
    if (name === "Your account") return "D";
    return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  };

  return (
    <div class="absolute inset-0 flex">
      {/* Sidebar */}
      <aside class="w-72 shrink-0 border-r border-border bg-card/60 flex flex-col">
        <div class="flex flex-col gap-6 p-6">
          <div class="flex flex-col gap-4">
            <Icon name="diffusion-logo" class="size-8 text-foreground" />
            <div class="flex flex-col gap-0.5">
              <span class="text-sm font-strong text-foreground">Diffusion Studio</span>
              <span class="text-muted-foreground text-xxs">v1.0.0</span>
            </div>
          </div>
          <nav class="flex flex-col gap-1">
            <span class="bg-accent text-accent-foreground flex h-8 items-center gap-2 rounded-lg px-3 text-xxs">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="size-4">
                <path d="M3 10.5 12 3l9 7.5" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M5 9.5V21h14V9.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              Home
            </span>
            <a
              href="#recents"
              class="text-muted-foreground hover:bg-muted hover:text-foreground flex h-8 items-center gap-2 rounded-lg px-3 text-xxs"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="size-4">
                <rect x="3" y="7" width="18" height="13" rx="2" />
                <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke-linecap="round" />
              </svg>
              Projects
            </a>
          </nav>
        </div>
        <div class="mt-auto flex items-center gap-2 p-6">
          <div class="size-9 overflow-hidden rounded-full bg-secondary flex items-center justify-center">
            <Show when={state().avatar} fallback={<span class="text-primary-foreground text-xxs font-strong">{initials()}</span>}>
              <img src={state().avatar} alt="Avatar" class="h-full w-full object-cover" />
            </Show>
          </div>
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="text-xxs truncate text-foreground">{fullName()}</span>
            <span class="text-muted-foreground text-xxs capitalize">{state().plan} Plan</span>
          </div>
          <A href="/settings/account" class="text-muted-foreground hover:text-foreground" title="Settings">
            <Settings class="size-4" />
          </A>
        </div>
      </aside>

      {/* Main */}
      <main class="no-scrollbar relative flex-1 overflow-y-auto">
        <div class="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center px-8 pb-16 pt-[18vh] gap-14">
          <h1 class="text-foreground text-2xl font-medium tracking-tight">What should we edit?</h1>

          {/* Prompt composer */}
          <div class="bg-secondary/80 ring-foreground/5 w-full max-w-xl rounded-xl p-2 shadow-lg ring-1">
            <div class="flex justify-center">
              <Select
                value={projectId()}
                onChange={(value) => setProjectId(value)}
                disabled={creating()}
                class="min-w-0 flex-1 max-w-xs"
                itemComponent={(props) => (
                  <SelectItem item={props.item} class="pl-6 text-xxs">
                    {props.item.rawValue.label}
                  </SelectItem>
                )}
              >
                <SelectTrigger class="h-9 border-transparent bg-card/80 text-xxs" aria-label="Choose project">
                  <span data-slot="select-value" class="flex items-center gap-1.5 text-foreground">
                    <Folder class="size-3.5 text-muted-foreground" />
                    <SelectValue>
                      {(state) => (state.selectedOption() ? state.selectedOption().label : "Choose project")}
                    </SelectValue>
                  </span>
                  <ChevronDown class="size-3.5 text-muted-foreground" />
                </SelectTrigger>
                <SelectContent>
                  <For each={projects()}>
                    {(p) => <SelectItem value={p.slug}>{p.label}</SelectItem>}
                  </For>
                </SelectContent>
              </Select>
            </div>
            <Textarea
              value={prompt()}
              onInput={(e) => setPrompt(e.currentTarget.value)}
              placeholder={`e.g. Pull the best 30-second moment and make a vertical version for social.`}
              class="border-transparent bg-transparent px-3 pt-3 pb-2 text-xxs leading-relaxed text-foreground placeholder:text-muted-foreground min-h-20 resize-none focus-visible:ring-0 focus-visible:border-transparent"
            />
            <div class="flex items-center justify-between px-1 pb-1">
              <Select
                value={model()}
                onChange={(value) => setModel(value)}
                itemComponent={(props) => (
                  <SelectItem item={props.item} class="text-xxs">
                    {props.item.rawValue.label}
                  </SelectItem>
                )}
              >
                <SelectTrigger
                  class="h-7 w-fit gap-1 rounded-full border-transparent bg-muted/70 px-2 text-xxs dark:bg-muted/40"
                  aria-label="Model"
                >
                  <Sparkles class="size-3.5 text-muted-foreground" />
                  <SelectValue>{(state) => state.selectedOption().label}</SelectValue>
                  <ChevronDown class="size-3 text-muted-foreground" />
                </SelectTrigger>
                <SelectContent class="w-40">
                  <For each={MODELS}>
                    {(m) => <SelectItem value={m.id}>{m.label}</SelectItem>}
                  </For>
                </SelectContent>
              </Select>
              <Button
                size="icon"
                variant="default"
                disabled={sending()}
                onClick={send}
                class="size-8 rounded-full"
                aria-label="Send"
              >
                <ArrowUp class="size-4" />
              </Button>
            </div>
          </div>

          {/* Recents */}
          <section id="recents" class="w-full scroll-mt-8">
            <h2 class="text-foreground mb-4 text-sm font-strong">Recents</h2>
            <div class="flex flex-wrap gap-5">
              <button
                type="button"
                onClick={createProject}
                disabled={creating()}
                class="group flex w-[135px] flex-col gap-2 text-left"
              >
                <div class="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-dashed border-border transition-colors group-hover:border-ring/50">
                  <Plus class="absolute inset-0 m-auto size-5 text-muted-foreground" />
                </div>
                <span class="text-xxs text-foreground">New project</span>
              </button>
              <Show when={!ready()} fallback={<For each={projects()}>{(p, i) => <ProjectCard project={p} index={i()} />}</For>}>
                <div class="flex aspect-[4/3] w-[135px] items-center justify-center rounded-lg bg-muted">
                  <span class="text-muted-foreground text-xxs">Loading…</span>
                </div>
              </Show>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}