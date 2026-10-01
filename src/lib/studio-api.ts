import { isDesktop } from "./desktop";

let basePromise: Promise<string> | undefined;
export function setStudioPort(port: number) {
  basePromise = Promise.resolve(`http://127.0.0.1:${port}`);
}

export async function studioBase(): Promise<string> {
  if (!isDesktop()) return "";
  if (!basePromise) basePromise = window.diffusionDesktop!.services!.start().then((status) => {
    if (!status.running || status.error) throw new Error(status.error ?? "Local services are not running");
    return `http://127.0.0.1:${status.port}`;
  }).catch((error) => { basePromise = undefined; throw error; });
  return basePromise;
}

export async function studioFetch(route: string, init?: RequestInit) {
  return fetch(`${await studioBase()}${route}`, init);
}
