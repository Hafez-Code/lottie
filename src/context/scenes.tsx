import { createContext, createResource, useContext, onCleanup, onMount, type JSX } from "solid-js";
import type { ScenesTree, Project, Scene } from "@/types";
import { isDesktop } from "@/lib/desktop";
import { studioBase, studioFetch } from "@/lib/studio-api";

// Dev: the scenes-discovery plugin serves a live tree at /__scenes and pushes
// updates over the HMR socket. Build: the plugin emits a static scenes.json.
const SCENES_URL = import.meta.env.DEV ? "/__scenes" : "/scenes.json";

const ScenesContext = createContext<{
  projects: () => Project[];
  findProject: (slug: string) => Project | undefined;
  findScene: (projectSlug: string, sceneSlug: string) => Scene | undefined;
  defaultScene: () => { project: Project; scene: Scene } | undefined;
  ready: () => boolean;
  refresh: () => Promise<void>;
  error: () => unknown;
}>();

let previousTree: ScenesTree | undefined;
async function loadScenes(): Promise<ScenesTree> {
  const res = await studioFetch(isDesktop() ? "/api/projects" : SCENES_URL);
  if (!res.ok) throw new Error(`Failed to load scenes from ${SCENES_URL} (HTTP ${res.status})`);
  const tree = (await res.json()) as ScenesTree;
  const base = await studioBase();
  if (base) for (const project of tree.projects) for (const scene of project.scenes) {
    scene.lottie = base + scene.lottie;
    if (scene.controls) scene.controls = base + scene.controls;
    if (scene.brief) scene.brief = base + scene.brief;
    scene.images = scene.images.map((url) => base + url);
    scene.fonts = scene.fonts.map((url) => base + url);
  }
  if (previousTree && JSON.stringify(previousTree) === JSON.stringify(tree)) return previousTree;
  previousTree = tree;
  return tree;
}

export function ScenesProvider(props: { children: JSX.Element }) {
  const [tree, { mutate, refetch }] = createResource(loadScenes);
  const refresh = async () => { await refetch(); };
  onMount(() => {
    if (isDesktop()) {
      const timer = setInterval(() => void refresh().catch(() => {}), 2000);
      onCleanup(() => clearInterval(timer));
    }
  });

  // Live-patch the tree when the dev plugin reports filesystem changes.
  import.meta.hot?.on("scenes:update", (next: ScenesTree) => mutate(next));

  const projects = () => tree()?.projects ?? [];
  const findProject = (slug: string) => projects().find((p) => p.slug === slug);
  const findScene = (projectSlug: string, sceneSlug: string) =>
    findProject(projectSlug)?.scenes.find((s) => s.slug === sceneSlug);
  const defaultScene = () => {
    const project = projects()[0];
    const scene = project?.scenes[0];
    return project && scene ? { project, scene } : undefined;
  };
  const ready = () => tree() != null;

  return (
    <ScenesContext.Provider value={{ projects, findProject, findScene, defaultScene, ready, refresh, error: () => tree.error }}>
      {props.children}
    </ScenesContext.Provider>
  );
}

export function useScenes() {
  const context = useContext(ScenesContext);
  if (!context) {
    throw new Error("useScenes must be used within a ScenesProvider");
  }
  return context;
}
