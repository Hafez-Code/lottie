import { createSignal, For, Show, onMount, onCleanup } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { ChevronDown, Download, Trash } from "lucide-solid";
import { Icon } from "@/components/ui/icon";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useScenes } from "@/context/scenes";
import { useUI } from "@/context/ui";
import { useToast } from "@/components/ui/toast";
import { Button } from "./ui/button";

import type { Project } from "@/types";

export function SidebarLeft() {
  const params = useParams();
  const navigate = useNavigate();
  const { projects, findProject, findScene } = useScenes();
  const { controlsExpanded, toggleControls } = useUI();
  const { toast } = useToast();
  const [creating, setCreating] = createSignal(false);
  const [name, setName] = createSignal("New project");

  const activeProject = () => findProject(params.project ?? "");
  const activeLabel = () => activeProject()?.label ?? "Dashboard";

  // ⇧⌘D — go to dashboard.
  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        navigate("/");
      }
    };
    window.addEventListener("keydown", handler);
    onCleanup(() => window.removeEventListener("keydown", handler));
  });

  const downloadSceneJson = async () => {
    const scene = findScene(params.project ?? "", params.scene ?? "");
    if (!scene) {
      toast("Open a scene first.");
      return;
    }
    try {
      const res = await fetch(scene.lottie);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${params.project}-${params.scene}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast("Scene JSON downloaded.");
    } catch {
      toast("Could not download the scene JSON.");
    }
  };

  const copyProjectPath = async () => {
    try {
      await navigator.clipboard.writeText(`/${params.project ?? ""}/${params.scene ?? ""}`);
      toast("Scene path copied.");
    } catch {
      toast("Could not access the clipboard.");
    }
  };

  const handleBlur = () => {
    setCreating(false);
    setName("New project");
  }

  const createProject = async (projectName: string): Promise<boolean> => {
    const res = await fetch("/__scenes/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: projectName }),
    });
    const { project, scene } = (await res.json()) as { project: string; scene: string };
    navigate(`/${project}/${scene}`);
    return true;
  };

  const createNewProject = async () => {
    try {
      await createProject("Untitled project");
    } catch {
      toast("Could not create the project (dev server only).");
    }
  };

  const handleKeyDown = async (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      handleBlur();
      return;
    }

    if (e.key === "Enter") {
      const value = name().trim();
      handleBlur();

      if (value) {
        try {
          await createProject(value);
        } catch {
          toast("Could not create the project.");
        }
      }
    }
  }

  const handleInputMounted = (el: HTMLInputElement) => {
    queueMicrotask(() => {
      el.focus();
      el.select();
    });
  }

  const deleteProject = async (project: Project) => {
    await fetch("/__scenes/project", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: project.slug }),
    });
    // If the active project was removed, let the default route pick a new one.
    // The tree refreshes over HMR.
    if (project.slug === params.project) navigate("/");
  }

  return (
    <div
      class="absolute left-4 top-4 flex flex-col max-h-full rounded-2xl gap-0 bg-background border border-border text-muted-foreground"
      classList={{ 
        "w-[188px]": !controlsExpanded(),
        "w-[236px]": controlsExpanded(),
      }}
    >
      <div class="flex items-center justify-between h-12 px-3">
        <DropdownMenu>
          <DropdownMenuTrigger
            as="button"
            class="flex items-center justify-center gap-1 rounded-md px-1 aria-expanded:bg-muted"
          >
            <Icon name="diffusion-logo" class="size-6" />
            <span class="text-xxs font-strong">{activeLabel()}</span>
            <ChevronDown class="text-muted-foreground size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent class="w-56">
            <DropdownMenuItem onSelect={() => navigate("/")}>
              <span>Go to dashboard</span>
              <span class="text-muted-foreground ml-auto text-xxs tracking-wider">⇧⌘D</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>File</DropdownMenuSubTrigger>
              <DropdownMenuSubContent class="w-48">
                <DropdownMenuItem onSelect={() => createNewProject()}>
                  <span>New project</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={downloadSceneJson}>
                  <Download />
                  <span>Download scene JSON</span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Edit</DropdownMenuSubTrigger>
              <DropdownMenuSubContent class="w-32">
                <DropdownMenuItem data-disabled>Undo</DropdownMenuItem>
                <DropdownMenuItem data-disabled>Redo</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>View</DropdownMenuSubTrigger>
              <DropdownMenuSubContent class="w-48">
                <DropdownMenuItem onSelect={toggleControls}>
                  <span>Toggle controls</span>
                  <ChevronDown class="ml-auto hidden" />
                  <span class="text-muted-foreground ml-auto text-xxs">{controlsExpanded() ? "On" : "Off"}</span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Tool</DropdownMenuSubTrigger>
              <DropdownMenuSubContent class="w-48">
                <DropdownMenuItem onSelect={copyProjectPath}>
                  <span>Copy scene path</span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate("/settings/credits")}>AI credits</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate("/settings/help")}>Help</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate("/settings/account")}>Account</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="icon" variant="ghost" onClick={toggleControls}>
          <Icon name="sidebar" />
        </Button>
      </div>
      <Show when={controlsExpanded()}>
        <div class="px-4 py-3 border-t border-border flex flex-col">
          <div class="flex items-center justify-between h-8">
            <span class="text-xxs text-muted-foreground px-1">Projects</span>
            <Button
              size="icon"
              variant="ghost"
              class="text-muted-foreground"
              onClick={() => setCreating(true)}
            >
              <Icon name="plus-add" />
            </Button>
          </div>
          <Show when={creating()}>
            <div class="flex items-center h-7 rounded-md px-0.5 gap-0.5 my-0.5 text-foreground">
              <Icon name="folder" />
              <input
                ref={handleInputMounted}
                type="text"
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                class="bg-transparent text-xxs outline-none flex-1 w-0 focus-ring px-1 py-0.5 rounded-sm"
              />
            </div>
          </Show>
          <For each={projects()}>
            {(project) => {
              const active = () => project.slug === params.project;
              return (
                <ContextMenu>
                  <ContextMenuTrigger
                    as="button"
                    type="button"
                    onClick={() => navigate(`/${project.slug}/${project.scenes[0]?.slug ?? ""}`)}
                    class="flex items-center h-7 rounded-md px-0.5 gap-1.5 my-0.5 flex-1"
                    classList={{
                      "bg-muted text-foreground": active(),
                      "text-muted-foreground": !active(),
                    }}
                  >
                    <Icon name="folder" />
                    <span class="text-xxs">{project.label}</span>
                    <Show when={active()}>
                      <Icon name="confirm-check" class="ml-auto" />
                    </Show>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onSelect={() => deleteProject(project)}>
                      <Trash />
                      <span>Delete project</span>
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  )
}
