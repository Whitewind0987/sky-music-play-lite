import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClasses: Record<ButtonVariant, string> = {
  danger:
    "border-red-200 bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800",
  ghost:
    "border-transparent bg-transparent text-slate-700 hover:bg-slate-100 active:bg-slate-200",
  primary:
    "border-blue-600 bg-blue-600 text-white shadow-sm hover:bg-blue-700 active:bg-blue-800",
  secondary:
    "border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50 active:bg-slate-100",
};

const sizeClasses: Record<ButtonSize, string> = {
  lg: "h-11 px-5 text-base",
  md: "h-9 px-4 text-sm",
  sm: "h-8 px-3 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      size = "md",
      type = "button",
      variant = "primary",
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  ),
);

Button.displayName = "Button";
