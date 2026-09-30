import { Accessor, createContext, createSignal, onMount, useContext, type JSX } from "solid-js";

const UIContext = createContext<{
  controlsExpanded: Accessor<boolean>;
  toggleControls(): void;
}>();

export function UIProvider(props: { children: JSX.Element }) {
  const [controlsExpanded, setControlsExpanded] = createSignal(true);
  const toggleControls = () => setControlsExpanded((v) => !v);

  // Native menu (Electron) drives the same toggle.
  onMount(() => {
    const handler = () => setControlsExpanded((v) => !v);
    window.addEventListener("diffusion:toggle-controls", handler);
    return () => window.removeEventListener("diffusion:toggle-controls", handler);
  });

  return (
    <UIContext.Provider value={{ controlsExpanded, toggleControls }}>
      {props.children}
    </UIContext.Provider>
  );
}

export function useUI() {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error("useUI must be used within a UIProvider");
  }
  return context;
}
