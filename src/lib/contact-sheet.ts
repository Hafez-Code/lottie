import { planSheet } from "@/vendor/diffusionstudio/contact-sheet";

export async function captureContactSheet(frames: number[], capture: (frame: number) => string | null): Promise<string> {
  const images: HTMLImageElement[] = [];
  for (const frame of frames) {
    const data = capture(frame);
    if (!data) throw new Error("The scene renderer is not ready");
    const image = new Image();
    image.src = data;
    await image.decode();
    images.push(image);
  }
  const plan = planSheet(images.length, { width: images[0].naturalWidth, height: images[0].naturalHeight });
  const sheet = document.createElement("canvas");
  sheet.width = plan.width; sheet.height = plan.height;
  const ctx = sheet.getContext("2d");
  if (!ctx) throw new Error("Contact sheet renderer is unavailable");
  ctx.fillStyle = "#444"; ctx.fillRect(0, 0, sheet.width, sheet.height);
  images.forEach((image, i) => {
    const x = 4 + (i % plan.columns) * (plan.cellWidth + 8);
    const y = 4 + Math.floor(i / plan.columns) * (plan.cellHeight + 8);
    ctx.drawImage(image, x, y, plan.cellWidth, plan.cellHeight);
    const band = Math.min(30, plan.cellHeight);
    ctx.fillStyle = "rgba(0,0,0,.75)"; ctx.fillRect(x, y, plan.cellWidth, band);
    ctx.fillStyle = "#fff"; ctx.font = `${Math.min(16, band * .7)}px monospace`;
    ctx.fillText(`Frame ${frames[i]}`, x + 5, y + band * .7, Math.max(1, plan.cellWidth - 10));
  });
  return sheet.toDataURL("image/png");
}
