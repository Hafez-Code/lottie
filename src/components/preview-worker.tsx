import { createEffect, onCleanup } from "solid-js";
import { useParams } from "@solidjs/router";
import { useCanvas } from "@/context/canvas";
import { captureContactSheet } from "@/lib/contact-sheet";
import { chatRequest } from "@/lib/chat";

export function PreviewWorker() {
  const params = useParams();
  const canvas = useCanvas();
  createEffect(() => {
    const project = params.project ?? "", scene = params.scene ?? "";
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const jobs = await chatRequest<{ id: string; frame: number; frames?: number[] }[]>(`/capture-pending?project=${encodeURIComponent(project)}&scene=${encodeURIComponent(scene)}`);
        for (const job of jobs) {
          if (!active) break;
          try {
            await canvas.refreshScene();
            if (!active) break;
            const dataUrl = job.frames ? await captureContactSheet(job.frames, canvas.captureFrame) : canvas.captureFrame(job.frame);
            if (!dataUrl) throw new Error("The scene renderer is not ready");
            await chatRequest("/capture-result", { id: job.id, project, scene, dataUrl });
          } catch (error) {
            await chatRequest("/capture-result", { id: job.id, project, scene, error: error instanceof Error ? error.message : "Rendering failed" }).catch(() => {});
          }
        }
      } catch { /* Retry while local services reconnect. */ }
      if (active) timer = setTimeout(poll, 1000);
    };
    void poll();
    onCleanup(() => { active = false; clearTimeout(timer); });
  });
  return null;
}
