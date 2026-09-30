import type { ValidComponent } from "solid-js";
import { splitProps } from "solid-js";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import * as TextFieldPrimitive from "@kobalte/core/text-field";
import type { JSX } from "solid-js";
import { cn } from "@/lib/utils";

type InputProps<T extends ValidComponent = "input"> =
  PolymorphicProps<T, TextFieldPrimitive.TextFieldInputProps<T>> & { class?: string };

const Input = <T extends ValidComponent = "input">(props: InputProps<T>) => {
  const [local, others] = splitProps(props as InputProps, ["class"]);
  return (
    <TextFieldPrimitive.Input
      data-slot="input"
      class={cn("z-input flex w-full", local.class)}
      {...others}
    />
  );
};

type TextareaProps = JSX.TextareaHTMLAttributes<HTMLTextAreaElement> & { class?: string; value?: string };

const Textarea = (props: TextareaProps) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <textarea
      data-slot="textarea"
      class={cn(
        "z-input flex min-h-16 w-full py-2 text-left",
        local.class,
      )}
      {...others}
    />
  );
};

type TextFieldProps = TextFieldPrimitive.TextFieldRootProps & { class?: string; children?: JSX.Element };

const TextField = (props: TextFieldProps) => {
  const [local, others] = splitProps(props, ["class", "children"]);
  return (
    <TextFieldPrimitive.Root data-slot="textfield" class={cn("flex flex-col gap-1.5", local.class)} {...others}>
      {local.children}
    </TextFieldPrimitive.Root>
  );
};

export { Input, Textarea, TextField };