import { createSignal, For, Show, onMount, type Component } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { ArrowUp, ChevronDown, Folder, ImagePlus, Plus, Settings, X } from "lucide-solid";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Icon } from "@/components/ui/icon";
import { useScenes } from "@/context/scenes";
import { useAccount } from "@/context/account";
import { getThumbnail } from "@/lib/thumbnails";
import { createSceneFromBrief, fileToDataUrl, type BriefImage } from "@/lib/brief";
import { isDesktop } from "@/lib/desktop";
import type { Project } from "@/types";

const RECENTS_KEY = "diffusion.recents.v1";

/** Reference images carried with a chat brief; capped to keep request bodies sane. */
const MAX_IMAGES = 4;

interface Attachment extends BriefImage {
  id: string;
}

type RecentsMap = Record<string, number>; // project slug -> last opened epoch ms

function loadRecents(): RecentsMap {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "{}") as RecentsMap;
  } catch {
    return {};
  }
}

function touchRecent(slug: string) {
  const next = { ...loadRecents(), [slug]: Date.now() };
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // Storage may be unavailable; navigation still proceeds.
  }
}

function timeAgo(at: number): string {
  const minutes = Math.round((Date.now() - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

const ProjectCard: Component<{ project: Project }> = (props) => {
  const navigate = useNavigate();
  const [thumb, setThumb] = createSignal<string>();

  onMount(async () => {
    const scene = props.project.scenes[0];
    if (!scene) return;
    try {
      setThumb(await getThumbnail(scene));
    } catch {
      // Thumbnail failure is non-fatal; the placeholder stays.
    }
  });

  const editedAt = () => loadRecents()[props.project.slug];

  return (
    <button
      type="button"
      onClick={() => {
        touchRecent(props.project.slug);
        navigate(`/${props.project.slug}/${props.project.scenes[0]?.slug ?? ""}`);
      }}
      class="group flex w-[135px] flex-col gap-2 text-left"
    >
      <div class="ring-foreground/5 relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-muted shadow-xs ring-1 transition-shadow group-hover:ring-ring/40">
        <Show
          when={thumb()}
          fallback={<Plus class="absolute inset-0 m-auto size-5 text-muted-foreground" />}
        >
          <img src={thumb()} alt={props.project.label} class="absolute inset-0 h-full w-full object-cover" />
        </Show>
      </div>
      <div class="flex flex-col gap-0.5">
        <span class="text-foreground text-xxs font-strong">{props.project.label}</span>
        <span class="text-muted-foreground text-xxs">
          {editedAt()
            ? timeAgo(editedAt())
            : `${props.project.scenes.length} scene${props.project.scenes.length === 1 ? "" : "s"}`}
        </span>
      </div>
    </button>
  );
};

export function HomePage() {
  const navigate = useNavigate();
  const { projects, ready } = useScenes();
  const { state, fullName } = useAccount();
  const { toast } = useToast();

  const [projectId, setProjectId] = createSignal<string>();
  const [prompt, setPrompt] = createSignal("");
  const [images, setImages] = createSignal<Attachment[]>([]);
  const [dragActive, setDragActive] = createSignal(false);
  const [creating, setCreating] = createSignal(false);
  const [sending, setSending] = createSignal(false);
  let fileInput: HTMLInputElement | undefined;

  const chosenProject = () => projects().find((p) => p.slug === projectId());

  const addFiles = async (files: File[]) => {
    const incoming = files.filter((file) => file.type.startsWith("image/"));
    if (incoming.length === 0) {
      toast("Only images can be attached to a brief.");
      return;
    }
    const room = MAX_IMAGES - images().length;
    if (room <= 0) {
      toast(`Up to ${MAX_IMAGES} reference images per brief.`);
      return;
    }
    if (incoming.length > room) toast(`Only the first ${room} image(s) were added.`);

    const next: Attachment[] = [];
    for (const file of incoming.slice(0, room)) {
      next.push({
        id: `${file.name}-${file.lastModified}-${next.length}`,
        name: file.name,
        dataUrl: await fileToDataUrl(file),
      });
    }
    setImages((prev) => [...prev, ...next]);
  };

  const removeImage = (id: string) => setImages((prev) => prev.filter((image) => image.id !== id));

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragActive(false);
    void addFiles(Array.from(event.dataTransfer?.files ?? []));
  };

  const handlePaste = (event: ClipboardEvent) => {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length > 0) void addFiles(files);
  };

  const send = async () => {
    if (sending()) return;
    const text = prompt().trim();
    const attachments = images();
    if (!text && attachments.length === 0) {
      toast("Describe what you want to create, or attach a reference image.");
      return;
    }

    // No selected project is fine — the server starts a new one.
    const target = chosenProject() ?? projects()[0];
    setSending(true);
    try {
      const created = await createSceneFromBrief(target?.slug, {
        description: text,
        images: attachments.map(({ name, dataUrl }): BriefImage => ({ name, dataUrl })),
      });
      touchRecent(created.project);
      setPrompt("");
      setImages([]);
      toast(`Scene created in “${target?.label ?? created.project}”.`);
      navigate(`/${created.project}/${created.scene}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not create the scene.");
    } finally {
      setSending(false);
    }
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
      <aside class="border-border bg-card/60 flex w-72 shrink-0 flex-col border-r">
        <div class="flex flex-col gap-6 p-6">
          <div class="flex flex-col gap-4">
            <Icon name="diffusion-logo" class="text-foreground size-8" />
            <div class="flex flex-col gap-0.5">
              <span class="text-foreground text-sm font-strong">Diffusion Studio</span>
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
          <div class="bg-secondary flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full">
            <Show
              when={state().avatar}
              fallback={<span class="text-primary-foreground text-xxs font-strong">{initials()}</span>}
            >
              <img src={state().avatar} alt="Avatar" class="h-full w-full object-cover" />
            </Show>
          </div>
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="text-foreground truncate text-xxs">{fullName()}</span>
            <span class="text-muted-foreground text-xxs capitalize">{state().plan} Plan</span>
          </div>
          <A href="/settings/account" class="text-muted-foreground hover:text-foreground" title="Settings">
            <Settings class="size-4" />
          </A>
        </div>
      </aside>

      {/* Main */}
      <main class="no-scrollbar relative flex-1 overflow-y-auto">
        <div
          class="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center gap-14 px-8 pb-16"
          classList={{
            // Leave room for the real traffic lights when running as a desktop
            // app; browser users get the same spacing as the reference UI.
            "pt-16": isDesktop(),
            "pt-[16vh]": !isDesktop(),
          }}
        >
          <h1 class="text-foreground text-2xl font-medium tracking-tight">What should we create?</h1>

          {/* Prompt composer */}
          <div
            class="bg-secondary/80 ring-foreground/5 w-full max-w-xl rounded-xl p-2 shadow-lg ring-1 transition-colors"
            classList={{ "ring-primary/60 bg-secondary": dragActive() }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            {/* Choose project */}
            <DropdownMenu>
              <DropdownMenuTrigger
                as="button"
                class="bg-card/80 hover:bg-card ring-foreground/5 mx-auto flex h-9 w-full max-w-xs items-center justify-center gap-1.5 rounded-t-lg px-3 text-xxs ring-1"
              >
                <Folder class="text-muted-foreground size-3.5" />
                <span class="text-foreground">{chosenProject()?.label ?? "Choose project"}</span>
                <ChevronDown class="text-muted-foreground size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent class="w-64">
                <For each={projects()}>
                  {(p) => (
                    <DropdownMenuItem onSelect={() => setProjectId(p.slug)}>
                      <Folder class="text-muted-foreground size-3.5" />
                      <span>{p.label}</span>
                    </DropdownMenuItem>
                  )}
                </For>
                <Show when={projects().length === 0}>
                  <div class="text-muted-foreground px-2 py-1.5 text-xs">No projects yet</div>
                </Show>
              </DropdownMenuContent>
            </DropdownMenu>

            <Textarea
              value={prompt()}
              onInput={(e) => setPrompt(e.currentTarget.value)}
              onPaste={handlePaste}
              placeholder="Describe the scene — and drop or paste reference images. e.g. a 3s logo reveal on a dark background."
              class="border-transparent bg-transparent focus-visible:ring-0 min-h-20 resize-none px-3 pt-3 pb-2 text-xxs leading-relaxed text-foreground placeholder:text-muted-foreground focus-visible:border-transparent"
            />

            <Show when={images().length > 0}>
              <div class="flex flex-wrap gap-2 px-1 pb-1 pt-1">
                <For each={images()}>
                  {(image) => (
                    <div class="group relative size-14 overflow-hidden rounded-md ring-1 ring-foreground/10">
                      <img src={image.dataUrl} alt={image.name} class="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(image.id)}
                        class="bg-overlay text-foreground absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label={`Remove ${image.name}`}
                      >
                        <X class="size-3" />
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            <div class="flex items-center justify-between px-1 pb-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => fileInput?.click()}
                disabled={images().length >= MAX_IMAGES}
                aria-label="Attach reference images"
                title="Attach reference images"
              >
                <ImagePlus class="size-4" />
              </Button>
              <Button
                size="icon"
                variant="default"
                disabled={sending()}
                onClick={() => void send()}
                class="size-8 rounded-full"
                aria-label="Create scene"
              >
                <ArrowUp class="size-4" />
              </Button>
            </div>

            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              class="hidden"
              onChange={(event) => {
                void addFiles(Array.from(event.currentTarget.files ?? []));
                event.currentTarget.value = "";
              }}
            />
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
                <span class="text-foreground text-xxs">New project</span>
              </button>
              <Show
                when={ready()}
                fallback={
                  <div class="flex aspect-[4/3] w-[135px] items-center justify-center rounded-lg bg-muted">
                    <span class="text-muted-foreground text-xxs">Loading…</span>
                  </div>
                }
              >
                <For each={projects()}>{(p) => <ProjectCard project={p} />}</For>
              </Show>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}