import { fileToDataUrl, type BriefImage } from "./brief";

export interface Reference extends BriefImage {
  id: string;
  kind: "image" | "video";
  size: number;
  frames?: BriefImage[];
}

export async function prepareReference(file: File): Promise<Reference> {
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) throw new Error("Attach images, GIFs or videos.");
  if (!["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml", "image/avif", "video/mp4", "video/webm", "video/quicktime"].includes(file.type)) throw new Error("Use a PNG, JPEG, WebP, GIF, SVG, AVIF, MP4, WebM or MOV reference.");
  if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name}: the file limit is 8 MB.`);
  const reference: Reference = { id: crypto.randomUUID(), name: file.name, size: file.size, kind: file.type.startsWith("video/") ? "video" : "image", dataUrl: await fileToDataUrl(file) };
  if (["image/gif", "image/svg+xml", "image/avif"].includes(file.type)) {
    const url = URL.createObjectURL(file);
    const image = new Image();
    try {
      image.src = url; await image.decode();
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 960 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
      reference.frames = [{ name: `${file.name} visual reference`, dataUrl: canvas.toDataURL("image/png") }];
    } finally { URL.revokeObjectURL(url); }
  }
  if (reference.kind === "video") {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true; video.preload = "auto"; video.src = url;
    const wait = (name: string) => new Promise<void>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); video.removeEventListener(name, done); video.removeEventListener("error", failed); };
      const done = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error(`Could not decode ${file.name}. Try an MP4 or WebM video.`)); };
      const timer = setTimeout(failed, 10000);
      video.addEventListener(name, done, { once: true }); video.addEventListener("error", failed, { once: true });
    });
    try {
      await wait("loadeddata");
      if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error("This video has no readable duration.");
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext("2d")!;
      reference.frames = [];
      for (const fraction of [0.05, 0.5, 0.95]) {
        const seeked = wait("seeked"); video.currentTime = video.duration * fraction; await seeked;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        reference.frames.push({ name: `${file.name} at ${(video.duration * fraction).toFixed(2)}s`, dataUrl: canvas.toDataURL("image/jpeg", 0.85) });
      }
    } finally { video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); }
  }
  return reference;
}

export function briefReferences(references: Reference[]): BriefImage[] {
  return references.flatMap((reference) => [{ name: reference.name, dataUrl: reference.dataUrl }, ...(reference.frames ?? [])]);
}
