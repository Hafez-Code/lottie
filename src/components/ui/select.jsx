import { splitProps } from "solid-js";
import * as SelectPrimitive from "@kobalte/core/select";
import { ChevronDown, Check } from "lucide-solid";
import { cn } from "@/lib/utils";
const Select = (props) => {
    const [local, others] = splitProps(props, ["class"]);
    return (<SelectPrimitive.Root data-slot="select" class={cn("flex flex-col gap-1.5", local.class)} {...others}>
      {props.children}
    </SelectPrimitive.Root>);
};
const SelectValue = (props) => {
    const [local, others] = splitProps(props, ["class"]);
    return (<SelectPrimitive.Value data-slot="select-value" data-placeholder class={cn("z-select-value", local.class)} {...others}/>);
};
const SelectTrigger = (props) => {
    const [local, others] = splitProps(props, ["class", "size", "children"]);
    return (<SelectPrimitive.Trigger data-slot="select-trigger" data-size={local.size ?? "default"} class={cn("z-select-trigger flex w-full items-center justify-between gap-2 [&_svg]:text-muted-foreground", local.class)} {...others}>
      {local.children}
      <SelectPrimitive.Icon data-slot="select-trigger-icon" class="z-select-trigger-icon">
        <ChevronDown />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>);
};
const SelectContent = (props) => {
    const [local, others] = splitProps(props, ["class"]);
    return (<SelectPrimitive.Portal>
      <SelectPrimitive.Content data-slot="select-content" class={cn("z-select-content max-h-72 min-w-32 overflow-y-auto", local.class)} {...others}/>
    </SelectPrimitive.Portal>);
};
const SelectItem = (props) => {
    const [local, others] = splitProps(props, ["class"]);
    return (<SelectPrimitive.Item data-slot="select-item" class={cn("z-select-item relative flex items-center", local.class)} {...others}>
      <SelectPrimitive.ItemIndicator data-slot="select-item-indicator" class="absolute right-2 flex size-4 items-center justify-center">
        <Check />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText data-slot="select-item-text" class="z-select-item-text">
        {props.children}
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>);
};
const SelectLabel = (props) => {
    const [local, others] = splitProps(props, ["class"]);
    return (<SelectPrimitive.Label data-slot="select-label" class={cn("z-select-label", local.class)} {...others}/>);
};
export { Select, SelectValue, SelectTrigger, SelectContent, SelectItem, SelectLabel };
