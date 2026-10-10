import type { Metadata } from "next";
import AuthForm from "@/components/AuthForm";
import AuthGate from "@/components/AuthGate";
import AuthLayout from "@/components/AuthLayout";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <AuthGate require="guest">
      <AuthLayout>
        <AuthForm mode="signup" />
      </AuthLayout>
    </AuthGate>
  );
}
