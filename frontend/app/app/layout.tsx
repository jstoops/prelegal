import AppHeader from "@/components/AppHeader";
import AuthGate from "@/components/AuthGate";

export default function PlatformLayout({ children }: LayoutProps<"/app">) {
  return (
    <AuthGate require="user">
      <AppHeader />
      {children}
    </AuthGate>
  );
}
