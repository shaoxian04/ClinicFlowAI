import { ConsentGate } from "../components/ConsentGate";
import { AppShell } from "@/components/ui/AppShell";
import { PortalNav } from "../components/PortalNav";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConsentGate>
      <AppShell variant="paper">
        <PortalNav />
        {children}
      </AppShell>
    </ConsentGate>
  );
}
