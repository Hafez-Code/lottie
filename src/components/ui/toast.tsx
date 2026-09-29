import { createContext, createSignal, useContext, type Accessor, type JSX } from "solid-js";
import { Check } from "lucide-solid";

export interface Toast {
  id: number;
  message: string;
}

const ToastContext = createContext<{
  toasts: Accessor<Toast[]>;
  toast(message: string): void;
}>();

export function ToastProvider(props: { children: JSX.Element }) {
  const [toasts, setToasts] = createSignal<Toast[]>([]);

  const toast = (message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  };

  return (
    <ToastContext.Provider value={{ toasts, toast }}>
      {props.children}
      <div class="pointer-events-none fixed bottom-4 right-4 z-100 flex flex-col items-end gap-2">
        {toasts().map((t) => (
          <div
            class="bg-popover text-popover-foreground ring-foreground/10 animate-in fade-in slide-in-from-bottom-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs shadow-md ring-1"
          >
            <Check class="size-3.5 text-primary" />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}