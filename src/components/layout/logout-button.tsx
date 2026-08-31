"use client";

import { LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { IconButton } from "@/components/common/icon-button";

export function LogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onLogout() {
    startTransition(async () => {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch {
        toast.error("No se pudo cerrar la sesión.");
        return;
      }

      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <IconButton
      variant="ghost"
      label="Cerrar sesión"
      disabled={isPending}
      onClick={onLogout}
    >
      <LogOutIcon />
    </IconButton>
  );
}
