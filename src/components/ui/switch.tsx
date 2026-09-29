import type { JSX, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import * as SwitchPrimitive from "@kobalte/core/switch";
import { cn } from "@/lib/utils";

type SwitchProps<T extends ValidComponent = "input"> =
  SwitchPrimitive.SwitchRootProps<T> &
  { class?: string; label?: JSX.Element };

const Switch = <T extends ValidComponent = "input">(props: SwitchProps<T>) => {
  const [local, others] = splitProps(props as SwitchProps, ["class", "label"]);
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      class={cn(
        "group/switch peer inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0 outline-none",
        local.class,
      )}
      {...others}
    >
      <SwitchPrimitive.Input class="size-4 cursor-pointer appearance-none rounded-full border-transparent" />
      <span
        data-slot="switch-track"
        class="bg-input dark:bg-input/60 group-data-[checked]/switch:bg-primary flex h-full w-full items-center rounded-full transition-colors"
      >
        <span
          data-slot="switch-thumb"
          class="pointer-events-none block size-4 translate-x-0.5 rounded-full bg-background shadow-sm transition-transform group-data-[checked]/switch:translate-x-[18px] dark:bg-foreground"
        />
      </span>
    </SwitchPrimitive.Root>
  );
};

export { Switch };