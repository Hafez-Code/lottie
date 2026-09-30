import { type Component, For } from "solid-js";
import { BookOpen, Bug, MessageCircle, Keyboard } from "lucide-solid";
import { useToast } from "@/components/ui/toast";

const LINKS = [
  { icon: BookOpen, title: "Documentation", description: "Guides for scenes, controls and the player contract." },
  { icon: MessageCircle, title: "Community", description: "Ask questions and share work with other creators." },
  { icon: Bug, title: "Report a bug", description: "Something looks off? Tell us and we'll fix it." },
  { icon: Keyboard, title: "Keyboard shortcuts", description: "Space to play, ⇧⌘D for dashboard, ⌘K search." },
];

export const HelpPage: Component = () => {
  const { toast } = useToast();

  return (
    <div class="mx-auto w-full max-w-2xl px-10 py-10">
      <h2 class="text-foreground mb-4 text-sm font-strong">Get help</h2>
      <div class="grid grid-cols-2 gap-4">
        <For each={LINKS}>
          {(link) => {
            const IconC = link.icon;
            return (
              <button
                type="button"
                class="bg-card ring-foreground/5 hover:ring-ring/40 flex flex-col items-start gap-2 rounded-xl p-4 text-left ring-1 transition-shadow"
                onClick={() => toast(`${link.title} — coming soon in this demo.`)}
              >
                <IconC class="text-muted-foreground size-4" />
                <span class="text-foreground text-xxs font-strong">{link.title}</span>
                <span class="text-muted-foreground text-xxs">{link.description}</span>
              </button>
            );
          }}
        </For>
      </div>
    </div>
  );
};