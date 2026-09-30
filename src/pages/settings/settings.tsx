import { Show, For, type Component, type JSX } from "solid-js";
import { A, useParams } from "@solidjs/router";
import { ArrowLeft } from "lucide-solid";
import { useAccount } from "@/context/account";

const SECTIONS = [
  { slug: "account", label: "Account" },
  { slug: "general", label: "General" },
  { slug: "mcp", label: "MCP & CLI" },
  { slug: "credits", label: "AI credits" },
  { slug: "billing", label: "Billing" },
  { slug: "help", label: "Help" },
];

const SECTION_ICONS: Record<string, Component<{ class?: string }>> = {
  account: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class={props.class}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" stroke-linecap="round" />
    </svg>
  ),
  general: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class={props.class}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7" stroke-linecap="round" />
    </svg>
  ),
  mcp: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class={props.class}>
      <path d="m8.5 5.5-3 3 3 3M15.5 12.5l3 3-3 3" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M13.5 4.5 10.5 19.5" stroke-linecap="round" />
    </svg>
  ),
  credits: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class={props.class}>
      <path d="M12 3l1.9 5.6L20 10l-5 3.4L16 20l-4-3-4 3 1-6.6L4 10l6.1-1.4L12 3z" stroke-linejoin="round" />
    </svg>
  ),
  billing: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class={props.class}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M4 10h16" />
    </svg>
  ),
  help: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class={props.class}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.8 9.4A2.4 2.4 0 0 1 12 7.5c1.3 0 2.4 1 2.4 2.2 0 1.6-2.4 1.7-2.4 3.3" stroke-linecap="round" />
      <circle cx="12" cy="16.4" r="0.4" fill="currentColor" />
    </svg>
  ),
};

export function SettingsPage(props: { children?: JSX.Element }) {
  const params = useParams();
  const { fullName, state } = useAccount();

  const section = () => (SECTIONS.some((s) => s.slug === params.section) ? params.section : "account");

  return (
    <div class="absolute inset-0 flex">
      {/* Settings sidebar */}
      <aside class="border-border w-[280px] shrink-0 border-r p-6">
        <A
          href="/"
          class="text-muted-foreground hover:text-foreground mb-10 flex items-center gap-2 text-xxs"
        >
          <ArrowLeft class="size-3.5" />
          Back to dashboard
        </A>

        <div class="mb-3 px-2 text-xxs text-muted-foreground">Settings</div>
        <nav class="flex flex-col gap-0.5">
          <For each={SECTIONS}>
            {(item) => {
              const active = () => section() === item.slug;
              const IconC = SECTION_ICONS[item.slug]!;
              return (
                <A
                  href={`/settings/${item.slug}`}
                  class="flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-xxs"
                  classList={{
                    "bg-accent text-accent-foreground ring-ring/40 ring-1": active(),
                    "text-muted-foreground hover:bg-muted hover:text-foreground": !active(),
                  }}
                >
                  <IconC class="size-4" />
                  {item.label}
                </A>
              );
            }}
          </For>
        </nav>

        <div class="mt-auto hidden items-center gap-2 p-2">
          <span class="text-muted-foreground text-xxs">{fullName()}</span>
          <span class="text-muted-foreground text-xxs capitalize">{state().plan} plan</span>
        </div>
      </aside>

      {/* Content */}
      <main class="no-scrollbar flex-1 overflow-y-auto">
        <Show when={props.children} fallback={<div />}>
          {props.children}
        </Show>
      </main>
    </div>
  );
}