import type { ValidComponent } from "solid-js";
import { splitProps } from "solid-js";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import * as TextFieldPrimitive from "@kobalte/core/text-field";
import { cn } from "@/lib/utils";

type InputProps<T extends ValidComponent = "input"> =
  PolymorphicProps<T, TextFieldPrimitive.InputProps<T>> & { class?: string };

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

type TextareaProps<T extends ValidComponent = "textarea"> =
  PolymorphicProps<T, TextFieldPrimitive.TextAreaProps<T>> & { class?: string };

const Textarea = <T extends ValidComponent = "textarea">(props: TextareaProps<T>) => {
  const [local, others] = splitProps(props as TextareaProps, ["class"]);
  return (
    <TextFieldPrimitive.TextArea
      data-slot="textarea"
      class={cn(
        "z-input flex min-h-16 w-full py-2 text-left",
        local.class,
      )}
      {...others}
    />
  );
};

type TextFieldProps = TextFieldPrimitive.TextFieldRootProps & { class?: string };

const TextField = (props: TextFieldProps) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <TextFieldPrimitive.Root data-slot="textfield" class={cn("flex flex-col gap-1.5", local.class)} {...others}>
      {props.children}
    </TextFieldPrimitive.Root>
  );
};

export { Input, Textarea, TextField };