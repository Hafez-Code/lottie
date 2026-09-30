import { createSignal, Show, type Component } from "solid-js";
import { A } from "@solidjs/router";
import { Mail, Monitor } from "lucide-solid";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { TextField, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useAccount } from "@/context/account";

function initials(name: string): string {
  if (!name || name === "Your account") return "D";
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export const AccountPage: Component = () => {
  const account = useAccount();
  const { toast } = useToast();

  const [firstName, setFirstName] = createSignal(account.state().firstName);
  const [lastName, setLastName] = createSignal(account.state().lastName);

  const [emailOpen, setEmailOpen] = createSignal(false);
  const [emailDraft, setEmailDraft] = createSignal(account.state().email);

  const [disconnectTarget, setDisconnectTarget] = createSignal<"google" | "github">();

  let fileInputRef: HTMLInputElement | undefined;

  const linked = (provider: "google" | "github") =>
    account.state().linked.find((l) => l.provider === provider)?.connected ?? false;

  const google = () => linked("google");
  const github = () => linked("github");

  const providerRow = (provider: "google" | "github") => {
    const name = provider === "google" ? "Google" : "GitHub";
    const connected = provider === "google" ? google() : github();
    return (
      <div class="flex items-center gap-3 rounded-xl bg-card px-4 py-3 ring-foreground/5 ring-1">
        <span class="bg-muted flex size-8 items-center justify-center rounded-md text-xxs font-strong">
          {provider === "google" ? "G" : "GH"}
        </span>
        <div class="flex flex-1 flex-col">
          <div class="flex items-center gap-1.5">
            <span class="text-foreground text-xxs font-strong">{name}</span>
            <Show when={connected}>
              <span class="text-muted-foreground text-xxs">· Connected</span>
            </Show>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            connected ? setDisconnectTarget(provider) : (account.link(provider), toast(`${name} connected.`))
          }
        >
          {connected ? "Disconnect" : "Connect"}
        </Button>
      </div>
    );
  };

  return (
    <div class="mx-auto w-full max-w-2xl px-10 py-10">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        class="hidden"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            account.setProfile({ avatar: String(reader.result) });
            toast("Profile photo updated.");
          };
          reader.readAsDataURL(file);
        }}
      />

      {/* Personal details */}
      <h2 class="text-foreground mb-4 text-sm font-strong">Personal details</h2>
      <div class="bg-card ring-foreground/5 mb-10 rounded-xl p-5 ring-1">
        <div class="mb-4 flex items-center gap-4">
          <div class="bg-secondary flex size-14 items-center justify-center overflow-hidden rounded-lg">
            <Show
              when={account.state().avatar}
              fallback={<span class="text-primary-foreground text-sm font-strong">{initials(account.fullName())}</span>}
            >
              <img src={account.state().avatar} alt="Avatar" class="h-full w-full object-cover" />
            </Show>
          </div>
          <Button variant="outline" size="sm" onClick={() => fileInputRef?.click()}>
            Change image
          </Button>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <TextField value={firstName()} onChange={setFirstName}>
            <span class="text-muted-foreground mb-1.5 block text-xxs">First name</span>
            <Input class="h-9" placeholder="First name" />
          </TextField>
          <TextField value={lastName()} onChange={setLastName}>
            <span class="text-muted-foreground mb-1.5 block text-xxs">Last name</span>
            <Input class="h-9" placeholder="Last name" />
          </TextField>
        </div>

        <div class="mt-4">
          <Button
            size="sm"
            onClick={() => {
              account.setProfile({ firstName: firstName(), lastName: lastName() });
              toast("Profile updated.");
            }}
          >
            Save changes
          </Button>
        </div>
      </div>

      {/* Login & security */}
      <h2 class="text-foreground mb-4 text-sm font-strong">Login &amp; security</h2>
      <div class="mb-10 flex flex-col gap-4">
        <div class="flex items-center gap-3 rounded-xl bg-card px-4 py-3 ring-foreground/5 ring-1">
          <Mail class="text-muted-foreground size-4" />
          <div class="flex flex-1 flex-col">
            <div class="flex items-center gap-1.5">
              <span class="text-foreground text-xxs font-strong">Email address</span>
              <span class="text-muted-foreground text-xxs">· Verified</span>
            </div>
            <span class="text-muted-foreground text-xxs">{account.state().email}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEmailDraft(account.state().email);
              setEmailOpen(true);
            }}
          >
            Change email
          </Button>
        </div>

        <div class="flex items-center gap-3 rounded-xl bg-card px-4 py-3 ring-foreground/5 ring-1">
          <Monitor class="text-muted-foreground size-4" />
          <div class="flex flex-1 flex-col">
            <div class="flex items-center gap-1.5">
              <span class="text-foreground text-xxs font-strong">Current session</span>
              <span class="text-primary text-xxs">· Active</span>
            </div>
            <span class="text-muted-foreground text-xxs">This browser · started today</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast("You are signed out of other sessions.")}
          >
            Log out
          </Button>
        </div>
      </div>

      {/* Linked accounts */}
      <h2 class="text-foreground mb-4 text-sm font-strong">Linked accounts</h2>
      <div class="mb-10 flex flex-col gap-3">
        {providerRow("google")}
        {providerRow("github")}
      </div>

      {/* Plan */}
      <h2 class="text-foreground mb-4 text-sm font-strong">Plan</h2>
      <div class="bg-card ring-foreground/5 flex items-center gap-3 rounded-xl px-4 py-3 ring-1">
        <span class="bg-muted flex size-8 items-center justify-center rounded-md text-xxs font-strong">
          ✦
        </span>
        <div class="flex flex-1 flex-col">
          <span class="text-foreground text-xxs font-strong capitalize">{account.state().plan} plan</span>
          <span class="text-muted-foreground text-xxs">
            {account.state().plan === "free" ? "Limited AI credits. Upgrade any time." : "Thanks for the support!"}
          </span>
        </div>
        <A href="/settings/billing">
          <Button variant="outline" size="sm">
            {account.state().plan === "free" ? "Upgrade" : "Manage plan"}
          </Button>
        </A>
      </div>

      {/* Change email dialog */}
      <AlertDialog open={emailOpen()} onOpenChange={setEmailOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change email</AlertDialogTitle>
            <AlertDialogDescription>
              Enter the new email address. A verification link will be sent there.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <TextField value={emailDraft()} onChange={setEmailDraft}>
            <Input class="h-9" type="email" placeholder="name@example.com" />
          </TextField>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                account.setEmail(emailDraft().trim());
                toast("Verification email sent.");
              }}
            >
              Save email
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disconnect confirm dialog */}
      <AlertDialog open={!!disconnectTarget()} onOpenChange={(open) => !open && setDisconnectTarget(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {disconnectTarget() === "google" ? "Google" : "GitHub"}?</AlertDialogTitle>
            <AlertDialogDescription>
              You will no longer be able to sign in with this account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                account.unlink(disconnectTarget()!);
                toast("Account disconnected.");
              }}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};