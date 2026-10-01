import { A, Navigate, Route, Router, useParams } from "@solidjs/router";
import { Match, Switch, createMemo, Show, type JSX } from "solid-js";
import { CenteredContainer } from "@/components/ui/container";
import { ToastProvider } from "@/components/ui/toast";
import { App } from "./app";
import { AccountProvider } from "./context/account";
import { CanvasProvider } from "./context/canvas";
import { ScenesProvider, useScenes } from "./context/scenes";
import { UIProvider } from "./context/ui";
import { DesktopBridgeListener } from "./lib/desktop";
import { HomePage } from "./pages/home";
import { SettingsPage } from "./pages/settings/settings";
import { AccountPage } from "./pages/settings/account";
import { GeneralPage } from "./pages/settings/general";
import { McpPage } from "./pages/settings/mcp";
import { CreditsPage } from "./pages/settings/credits";
import { BillingPage } from "./pages/settings/billing";
import { HelpPage } from "./pages/settings/help";
import { StartupScreen } from "./components/startup-screen";

function Providers(props: { children?: JSX.Element }) {
  return (
    <AccountProvider>
      <ScenesProvider>
        <UIProvider>
          <CanvasProvider>
            <ToastProvider>
              <DesktopBridgeListener />
              <StartupScreen>{props.children}</StartupScreen>
            </ToastProvider>
          </CanvasProvider>
        </UIProvider>
      </ScenesProvider>
    </AccountProvider>
  );
}

function NotFound() {
  return (
    <CenteredContainer>
      <div class="flex flex-col items-center gap-2">
        <span>Project or scene not found.</span>
        <A href="/" class="text-foreground underline">
          Back to dashboard
        </A>
      </div>
    </CenteredContainer>
  );
}

function SectionRoute() {
  const params = useParams();

  return (
    <Switch
      fallback={<GeneralPage />}
    >
      <Match when={params.section === "account"}>
        <AccountPage />
      </Match>
      <Match when={params.section === "general"}>
        <GeneralPage />
      </Match>
      <Match when={params.section === "mcp"}>
        <McpPage />
      </Match>
      <Match when={params.section === "credits"}>
        <CreditsPage />
      </Match>
      <Match when={params.section === "billing"}>
        <BillingPage />
      </Match>
      <Match when={params.section === "help"}>
        <HelpPage />
      </Match>
    </Switch>
  );
}

function SceneRoute() {
  const params = useParams();
  const { findScene, ready } = useScenes();

  const isSceneAvailable = createMemo(() => {
    return params.project && params.scene && findScene(params.project, params.scene);
  });

  return (
    <Show when={ready()} fallback={<CenteredContainer>Loading scenes…</CenteredContainer>}>
      <Show when={isSceneAvailable()} fallback={<NotFound />}>
        <App />
      </Show>
    </Show>
  );
}

export function Root() {
  return (
    <Router root={Providers}>
      <Route path="/" component={HomePage} />
      <Route path="/settings" component={SettingsPage}>
        <Route path="/" component={() => <Navigate href="/settings/account" />} />
        <Route path="/:section" component={SectionRoute} />
      </Route>
      <Route path="/:project/:scene" component={SceneRoute} />
      <Route path="*" component={NotFound} />
    </Router>
  );
}
