import { ConsentGate } from "../components/ConsentGate";
import { AppShell } from "@/components/ui/AppShell";

export default function PrevisitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConsentGate>
      <AppShell variant="paper">
        <div className="max-w-2xl mx-auto px-6 py-8">{children}</div>
      </AppShell>
    </ConsentGate>
  );
}
