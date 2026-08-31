import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Entrar · ThingSpeak QA",
  robots: { index: false, follow: false, nocache: true },
};

export default function LoginPage() {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center p-4">
      <LoginForm />
    </div>
  );
}
