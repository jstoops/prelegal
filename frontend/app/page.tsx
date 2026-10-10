import type { Metadata } from "next";
import AuthForm from "@/components/AuthForm";
import AuthGate from "@/components/AuthGate";
import AuthLayout from "@/components/AuthLayout";

// The root layout's title template only applies to nested routes.
export const metadata: Metadata = { title: { absolute: "Sign in | Prelegal" } };

export default function SignInPage() {
  return (
    <AuthGate require="guest">
      <AuthLayout>
        <AuthForm mode="signin" />
      </AuthLayout>
    </AuthGate>
  );
}
