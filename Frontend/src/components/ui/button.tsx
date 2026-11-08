import { cva } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva("button", {
  variants: {
    variant: { default: "button-primary", secondary: "button-secondary", ghost: "button-ghost", danger: "button-danger" },
    size: { default: "button-md", sm: "button-sm", icon: "button-icon" },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "ghost" | "danger";
  size?: "default" | "sm" | "icon";
}

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
