import type * as React from "react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { LogoutButton } from "@/components/layout/logout-button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          {/*
            Icon-only, so it gets the same treatment as every other one.
            SidebarTrigger is vendored from the shadcn registry, so the
            tooltip is composed around it rather than edited into it.
          */}
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarTrigger
                className="-ml-1"
                aria-label="Mostrar u ocultar el menú"
              />
            </TooltipTrigger>
            <TooltipContent>Mostrar u ocultar el menú</TooltipContent>
          </Tooltip>
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          />
          <div className="flex-1" />
          <ThemeToggle />
          <LogoutButton />
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
