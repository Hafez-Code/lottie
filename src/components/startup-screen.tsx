import { Show, type JSX } from "solid-js";
import { useScenes } from "@/context/scenes";
import { Icon } from "./ui/icon";

export function StartupScreen(props: { children: JSX.Element }) {
  const { ready, error, refresh } = useScenes();
  return <Show when={ready()} fallback={<div class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background text-foreground" role="status">
    <Icon name="diffusion-logo" class="size-12" />
    <span class="text-lg font-medium">Studio ProMax</span>
    <Show when={!error()} fallback={<><span class="text-xs text-destructive" role="alert">Could not load the workspace.</span><button class="rounded-md bg-muted px-4 py-2 text-xs focus-ring" onClick={() => void refresh()}>Retry</button></>}>
      <span class="text-xs text-muted-foreground">Loading your projects and preparing the workspace…</span>
    </Show>
  </div>}>{props.children}</Show>;
}
