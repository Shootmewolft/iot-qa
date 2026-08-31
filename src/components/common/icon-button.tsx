"use client";

import type * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type IconButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  "size" | "aria-label"
> & {
  /** Shown in the tooltip and used as the accessible name. */
  label: string;
  size?: "icon" | "icon-xs" | "icon-sm" | "icon-lg";
};

/**
 * An icon-only button that always carries a tooltip.
 *
 * An icon alone is a guess: the label is the only thing that says what the
 * button does. Bundling the two makes it impossible to ship one without the
 * other, and keeps the accessible name in sync with what sighted users read.
 */
export function IconButton({
  label,
  size = "icon",
  className,
  children,
  disabled,
  onClick,
  ...props
}: IconButtonProps) {
  /*
   * `aria-disabled` rather than the native `disabled` attribute.
   *
   * A natively disabled button receives no pointer or focus events, so its
   * tooltip can never open — precisely when the operator most wants to know
   * what the control does and why it is unavailable. This keeps the button
   * reachable and explained while making it inert.
   */
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size={size}
          aria-label={label}
          aria-disabled={disabled || undefined}
          className={cn(disabled && "cursor-not-allowed opacity-50", className)}
          onClick={(event) => {
            if (disabled) {
              event.preventDefault();
              return;
            }
            onClick?.(event);
          }}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
