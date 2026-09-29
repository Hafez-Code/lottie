import { createContext, createSignal, useContext, type Accessor, type JSX } from "solid-js";

export type Theme = "light" | "dark" | "system";
export type Plan = "free" | "pro" | "studio";

export interface UsageEntry {
  id: number;
  label: string;
  model: string;
  credits: number;
  at: number; // epoch ms
}

interface LinkedAccount {
  provider: "google" | "github";
  connected: boolean;
}

interface AccountState {
  firstName: string;
  lastName: string;
  avatar: string; // data URL, empty = initials fallback
  email: string;
  theme: Theme;
  language: string;
  plan: Plan;
  credits: number;
  agents: Record<string, boolean>;
  linked: LinkedAccount[];
  usage: UsageEntry[];
}

const STORAGE_KEY = "diffusion.account.v1";

const DEFAULT_STATE: AccountState = {
  firstName: "",
  lastName: "",
  avatar: "",
  email: "workplus1997@gmail.com",
  theme: "dark",
  language: "English",
  plan: "free",
  credits: 120,
  agents: {
    "claude-code": true,
    "claude-desktop": true,
    cursor: true,
    "vscode-copilot": true,
    codex: true,
    antigravity: true,
    "gemini-cli": true,
    "devin-windsurf": true,
    opencode: true,
  },
  linked: [
    { provider: "google", connected: true },
    { provider: "github", connected: false },
  ],
  usage: [
    { id: 1, label: "Scene edit — Golden Ocean", model: "GPT-5.5", credits: 4, at: Date.now() - 6 * 60_000 },
    { id: 2, label: "Vertical re-cut for social", model: "GPT-5.5", credits: 9, at: Date.now() - 3 * 3_600_000 },
    { id: 3, label: "Caption pass — Movies", model: "GPT-5 mini", credits: 2, at: Date.now() - 26 * 3_600_000 },
  ],
};

function load(): AccountState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STATE;
  }
}

function persist(state: AccountState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be unavailable (private mode); settings stay in-memory only.
  }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
}

interface AccountContextValue {
  state: Accessor<AccountState>;
  fullName(): string;
  setProfile(patch: { firstName?: string; lastName?: string; avatar?: string }): void;
  setEmail(email: string): void;
  setTheme(theme: Theme): void;
  setLanguage(language: string): void;
  link(provider: "google" | "github"): void;
  unlink(provider: "google" | "github"): void;
  setAgent(id: string, enabled: boolean): void;
  enableAllAgents(enabled: boolean): void;
  spendCredits(amount: number, label: string, model: string): void;
  upgradeTo(plan: Exclude<Plan, "free">): void;
}

const AccountContext = createContext<AccountContextValue>();

export function AccountProvider(props: { children: JSX.Element }) {
  const [state, setState] = createSignal<AccountState>(load());

  // Apply the stored theme immediately on load.
  applyTheme(state().theme);

  const update = (patch: Partial<AccountState>) => {
    const next = { ...state(), ...patch };
    setState(next);
    persist(next);
  };

  const context: AccountContextValue = {
    state,
    fullName: () =>
      [state().firstName, state().lastName]
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" ") || "Your account",
    setProfile: (patch) =>
      update({
        firstName: patch.firstName ?? state().firstName,
        lastName: patch.lastName ?? state().lastName,
        avatar: patch.avatar ?? state().avatar,
      }),
    setEmail: (email) => update({ email }),
    setTheme: (theme) => {
      update({ theme });
      applyTheme(theme);
    },
    setLanguage: (language) => update({ language }),
    link: (provider) =>
      update({
        linked: state().linked.map((l) => (l.provider === provider ? { ...l, connected: true } : l)),
      }),
    unlink: (provider) =>
      update({
        linked: state().linked.map((l) => (l.provider === provider ? { ...l, connected: false } : l)),
      }),
    setAgent: (id, enabled) =>
      update({ agents: { ...state().agents, [id]: enabled } }),
    enableAllAgents: (enabled) =>
      update({
        agents: Object.fromEntries(Object.keys(state().agents).map((id) => [id, enabled])),
      }),
    spendCredits: (amount, label, model) => {
      const entry: UsageEntry = {
        id: Date.now(),
        label,
        model,
        credits: amount,
        at: Date.now(),
      };
      update({ credits: Math.max(0, state().credits - amount), usage: [entry, ...state().usage].slice(0, 20) });
    },
    upgradeTo: (plan) => update({ plan, credits: plan === "pro" ? 2000 : 10000 }),
  };

  return (
    <AccountContext.Provider value={context}>
      {props.children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const context = useContext(AccountContext);
  if (!context) {
    throw new Error("useAccount must be used within an AccountProvider");
  }
  return context;
}