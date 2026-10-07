import type { Metadata } from "next";
import LoginForm from "@/components/LoginForm";

// The root layout's title template only applies to nested routes.
export const metadata: Metadata = { title: { absolute: "Sign in | Prelegal" } };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <LoginForm />
    </main>
  );
}
