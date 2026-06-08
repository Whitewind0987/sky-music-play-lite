import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type IconButtonVariant = "ghost" | "soft" | "danger";
export type IconButtonSize = "sm" | "md" | "lg";

export type IconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label"
> & {
  "aria-label": string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
};

const variantClasses: Record<IconButtonVariant, string> = {
  danger:
    "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 active:bg-red-200",
  ghost:
    "border-transparent bg-transparent text-slate-700 hover:bg-slate-100 active:bg-slate-200",
  soft:
    "border-slate-200 bg-slate-100 text-slate-800 hover:bg-slate-200 active:bg-slate-300",
};

const sizeClasses: Record<IconButtonSize, string> = {
  lg: "h-11 w-11",
  md: "h-9 w-9",
  sm: "h-8 w-8",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      className,
      size = "md",
      type = "button",
      variant = "ghost",
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  ),
);

IconButton.displayName = "IconButton";
