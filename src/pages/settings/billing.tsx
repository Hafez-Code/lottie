import { type Component } from "solid-js";
import { Check } from "lucide-solid";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useAccount } from "@/context/account";

const PLANS = [
  {
    id: "pro" as const,
    name: "Pro",
    price: "$20",
    period: "/ month",
    credits: "2,000 AI credits / month",
    features: ["Unlimited projects & scenes", "Connect any MCP agent", "Priority queue", "Export without watermark"],
  },
  {
    id: "studio" as const,
    name: "Studio",
    price: "$60",
    period: "/ month",
    credits: "10,000 AI credits / month",
    features: ["Everything in Pro", "Team seats (up to 5)", "Shared asset library", "API & CLI access"],
  },
];

export const BillingPage: Component = () => {
  const account = useAccount();
  const { toast } = useToast();

  return (
    <div class="mx-auto w-full max-w-3xl px-10 py-10">
      {/* Current plan */}
      <div class="bg-card ring-foreground/5 mb-8 flex items-center gap-3 rounded-xl px-4 py-3 ring-1">
        <div class="flex flex-1 flex-col">
          <span class="text-foreground text-xxs font-strong capitalize">Current plan — {account.state().plan}</span>
          <span class="text-muted-foreground text-xxs">
            {account.state().plan === "free"
              ? "You're on the free plan with limited monthly credits."
              : "Your subscription renews automatically each month."}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => toast("Checkout is not wired up in this demo.")}
        >
          Manage payment
        </Button>
      </div>

      {/* Plans */}
      <h2 class="text-foreground mb-4 text-sm font-strong">Upgrade</h2>
      <div class="mb-10 grid grid-cols-2 gap-4">
        {PLANS.map((plan) => {
          const active = () => account.state().plan === plan.id;
          return (
            <div class="bg-card ring-foreground/5 relative flex flex-col gap-3 rounded-xl p-5 ring-1">
              <div class="flex items-center justify-between">
                <span class="text-foreground text-sm font-strong">{plan.name}</span>
                <span class="text-foreground text-sm">
                  {plan.price}
                  <span class="text-muted-foreground text-xxs">{plan.period}</span>
                </span>
              </div>
              <span class="text-muted-foreground text-xxs">{plan.credits}</span>
              <ul class="mb-1 flex flex-col gap-1.5">
                {plan.features.map((f) => (
                  <li class="text-muted-foreground flex items-center gap-2 text-xxs">
                    <Check class="text-primary size-3.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                variant={active() ? "secondary" : "default"}
                size="sm"
                class="mt-auto"
                disabled={active()}
                onClick={() => {
                  account.upgradeTo(plan.id);
                  toast(`Welcome to ${plan.name}!`);
                }}
              >
                {active() ? "Current plan" : `Choose ${plan.name}`}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
};