import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva("ui-button", {
  variants: {
    variant: {
      default: "ui-primary",
      outline: "ui-outline",
      ghost: "ui-ghost",
      white: "ui-white",
      translucent: "ui-translucent",
    },
    size: { default: "ui-regular", sm: "ui-small", icon: "ui-icon" },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export function Button({
  className, variant, size, asChild, ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : "button";
  return <Component data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
