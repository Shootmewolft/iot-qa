"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { IconButton } from "@/components/common/icon-button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <IconButton
      variant="ghost"
      /*
       * The label must NOT depend on `resolvedTheme`: next-themes cannot know
       * the theme during SSR, so it is undefined on the server and resolved on
       * the client, and React reports a hydration mismatch on the attribute.
       * The icons may swap because they do it in CSS, never in JS state.
       */
      label="Cambiar tema"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <SunIcon className="hidden dark:block" />
      <MoonIcon className="block dark:hidden" />
    </IconButton>
  );
}
