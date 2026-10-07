import AppHeader from "@/components/AppHeader";

export default function PlatformLayout({ children }: LayoutProps<"/app">) {
  return (
    <>
      <AppHeader />
      {children}
    </>
  );
}
