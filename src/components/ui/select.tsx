import type { ComponentProps, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import * as SelectPrimitive from "@kobalte/core/select";
import { ChevronDown, Check } from "lucide-solid";
import { cn } from "@/lib/utils";

type SelectRootProps = SelectPrimitive.SelectRootProps & { class?: string };

const Select = (props: SelectRootProps) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <SelectPrimitive.Root data-slot="select" class={cn("flex flex-col gap-1.5", local.class)} {...others}>
      {props.children}
    </SelectPrimitive.Root>
  );
};

type SelectValueProps<T extends ValidComponent = "span"> =
  PolymorphicProps<T, SelectPrimitive.SelectValueProps<T>> & Pick<ComponentProps<T>, "class">;

const SelectValue = <T extends ValidComponent = "span">(props: SelectValueProps<T>) => {
  const [local, others] = splitProps(props as SelectValueProps, ["class"]);
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      data-placeholder
      class={cn("z-select-value", local.class)}
      {...others}
    />
  );
};

type SelectTriggerProps<T extends ValidComponent = "button"> =
  PolymorphicProps<T, SelectPrimitive.SelectTriggerProps<T>> &
  Pick<ComponentProps<T>, "class"> & { size?: "default" | "sm" };

const SelectTrigger = <T extends ValidComponent = "button">(props: SelectTriggerProps<T>) => {
  const [local, others] = splitProps(props as SelectTriggerProps, ["class", "size", "children"]);
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={local.size ?? "default"}
      class={cn(
        "z-select-trigger flex w-full items-center justify-between gap-2 [&_svg]:text-muted-foreground",
        local.class,
      )}
      {...others}
    >
      {local.children}
      <SelectPrimitive.Icon data-slot="select-trigger-icon" class="z-select-trigger-icon">
        <ChevronDown />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
};

type SelectContentProps<T extends ValidComponent = "div"> =
  PolymorphicProps<T, SelectPrimitive.SelectContentProps<T>> & Pick<ComponentProps<T>, "class">;

const SelectContent = <T extends ValidComponent = "div">(props: SelectContentProps<T>) => {
  const [local, others] = splitProps(props as SelectContentProps, ["class"]);
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        class={cn("z-select-content max-h-72 min-w-32 overflow-y-auto", local.class)}
        {...others}
      />
    </SelectPrimitive.Portal>
  );
};

type SelectItemProps<T extends ValidComponent = "div"> =
  PolymorphicProps<T, SelectPrimitive.SelectItemProps<T>> &
  Pick<ComponentProps<T>, "class"> & { value?: string };

const SelectItem = <T extends ValidComponent = "div">(props: SelectItemProps<T>) => {
  const [local, others] = splitProps(props as SelectItemProps, ["class"]);
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      class={cn("z-select-item relative flex items-center", local.class)}
      {...others}
    >
      <SelectPrimitive.ItemIndicator
        data-slot="select-item-indicator"
        class="absolute right-2 flex size-4 items-center justify-center"
      >
        <Check />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText data-slot="select-item-text" class="z-select-item-text">
        {props.children}
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
};

type SelectLabelProps<T extends ValidComponent = "span"> =
  PolymorphicProps<T, SelectPrimitive.SelectLabelProps<T>> & Pick<ComponentProps<T>, "class">;

const SelectLabel = <T extends ValidComponent = "span">(props: SelectLabelProps<T>) => {
  const [local, others] = splitProps(props as SelectLabelProps, ["class"]);
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      class={cn("z-select-label", local.class)}
      {...others}
    />
  );
};

export { Select, SelectValue, SelectTrigger, SelectContent, SelectItem, SelectLabel };