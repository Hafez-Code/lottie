import { type Component, For } from "solid-js";
import { Check, ChevronDown } from "lucide-solid";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAccount, type Theme } from "@/context/account";
import { useToast } from "@/components/ui/toast";
import type { JSX } from "solid-js";

function Row(props: { title: string; description: string; children: JSX.Element }) {
  return (
    <div class="flex items-center gap-3 px-4 py-3">
      <div class="flex flex-1 flex-col">
        <span class="text-foreground text-xxs font-strong">{props.title}</span>
        <span class="text-muted-foreground text-xxs">{props.description}</span>
      </div>
      {props.children}
    </div>
  );
}

const THEMES: { id: Theme; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

const LANGUAGES = ["English", "العربية", "Español", "Français"];

export const GeneralPage: Component = () => {
  const account = useAccount();
  const { toast } = useToast();

  const themeLabel = () => THEMES.find((t) => t.id === account.state().theme)?.label ?? "System";

  return (
    <div class="mx-auto w-full max-w-2xl px-10 py-10">
      <h2 class="text-foreground mb-4 text-sm font-strong">Appearance</h2>
      <div class="divide-border bg-card ring-foreground/5 mb-10 flex flex-col divide-y rounded-xl ring-1">
        <Row title="Theme" description="Applies to the dashboard and the editor.">
          <DropdownMenu>
            <DropdownMenuTrigger
              as="button"
              class="z-input flex h-9 items-center justify-between gap-2 rounded-md border px-2.5 text-xs"
            >
              <span>{themeLabel()}</span>
              <ChevronDown class="text-muted-foreground size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent class="w-36">
              <For each={THEMES}>
                {(t) => (
                  <DropdownMenuItem onSelect={() => account.setTheme(t.id)}>
                    {t.label}
                    <Check
                      class={`ml-auto size-3.5 ${account.state().theme === t.id ? "" : "opacity-0"}`}
                    />
                  </DropdownMenuItem>
                )}
              </For>
            </DropdownMenuContent>
          </DropdownMenu>
        </Row>

        <Row title="Language" description="Interface language.">
          <DropdownMenu>
            <DropdownMenuTrigger
              as="button"
              class="z-input flex h-9 items-center justify-between gap-2 rounded-md border px-2.5 text-xs"
            >
              <span>{account.state().language}</span>
              <ChevronDown class="text-muted-foreground size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent class="w-40">
              <For each={LANGUAGES}>
                {(lang) => (
                  <DropdownMenuItem
                    onSelect={() => {
                      account.setLanguage(lang);
                      toast(`Language set to ${lang}.`);
                    }}
                  >
                    {lang}
                    <Check
                      class={`ml-auto size-3.5 ${account.state().language === lang ? "" : "opacity-0"}`}
                    />
                  </DropdownMenuItem>
                )}
              </For>
            </DropdownMenuContent>
          </DropdownMenu>
        </Row>
      </div>
    </div>
  );
};