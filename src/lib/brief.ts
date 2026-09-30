import { isDesktop } from "@/lib/desktop";

/** A reference image travelling with a chat brief, as a `data:` URL. */
export interface BriefImage {
  name: string;
  dataUrl: string;
}

/** The chat payload: what the user wants, plus any reference images. */
export interface SceneBrief {
  description: string;
  images: BriefImage[];
}

export interface BriefResult {
  project: string;
  scene: string;
}

/** Read a File into a `data:` URL so it can travel inside a JSON request body. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/**
 * Create a scene from a chat brief (description + reference images).
 *
 * The desktop app hosts the service server (`/api/brief`); the plain Vite dev
 * server exposes the same route through the scenes plugin (`/__scenes/brief`).
 * Both write identical files into the scene folder: `brief.json` plus the
 * reference images, which the connected agent reads over MCP.
 *
 * Passing no `projectSlug` starts a brand-new project.
 */
export async function createSceneFromBrief(
  projectSlug: string | undefined,
  brief: SceneBrief,
): Promise<BriefResult> {
  const endpoint = isDesktop() ? "/api/brief" : "/__scenes/brief";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project: projectSlug ?? "", ...brief }),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error ?? `Could not create the scene (HTTP ${res.status})`);
  }
  return (await res.json()) as BriefResult;
}
