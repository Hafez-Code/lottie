import { Show, type Component, For } from "solid-js";
import { Sparkles } from "lucide-solid";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/context/account";

function timeAgo(at: number): string {
  const minutes = Math.round((Date.now() - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export const CreditsPage: Component = () => {
  const account = useAccount();
  const s = account.state;

  const totalAllowance = () => (s().plan === "free" ? 200 : s().plan === "pro" ? 2000 : 10000);
  const pct = () => Math.min(100, Math.round((s().credits / totalAllowance()) * 100));

  return (
    <div class="mx-auto w-full max-w-2xl px-10 py-10">
      {/* Balance */}
      <div class="bg-card ring-foreground/5 mb-10 rounded-xl p-5 ring-1">
        <div class="mb-4 flex items-center justify-between">
          <div class="flex flex-col gap-0.5">
            <span class="text-muted-foreground text-xxs">Credits available</span>
            <span class="text-foreground text-2xl font-medium">{s().credits}</span>
          </div>
          <div class="bg-secondary text-secondary-foreground flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xxs">
            <Sparkles class="size-3.5" />
            <span class="capitalize">{s().plan} plan</span>
          </div>
        </div>
        <div class="bg-muted h-2 w-full overflow-hidden rounded-full">
          <div
            class="bg-primary h-full rounded-full transition-all"
            style={{ width: `${pct()}%` }}
          />
        </div>
        <div class="text-muted-foreground mt-2 text-xxs">
          {s().credits} of {totalAllowance()} left this month · usage resets on the 1st
        </div>
      </div>

      {/* Usage */}
      <h2 class="text-foreground mb-4 text-sm font-strong">Recent usage</h2>
      <div class="divide-border bg-card ring-foreground/5 flex flex-col divide-y rounded-xl ring-1">
        <Show
          when={s().usage.length > 0}
          fallback={<div class="text-muted-foreground px-4 py-6 text-center text-xxs">No usage yet — send your first edit from Home.</div>}
        >
          <For each={s().usage}>
            {(entry) => (
              <div class="flex items-center gap-3 px-4 py-2.5">
                <div class="flex min-w-0 flex-1 flex-col">
                  <span class="text-foreground truncate text-xxs">{entry.label}</span>
                  <span class="text-muted-foreground text-xxs">{timeAgo(entry.at)}</span>
                </div>
                <span class="text-muted-foreground text-xxs">−{entry.credits} credits</span>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
};