import { ConsentGate } from "../components/ConsentGate";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConsentGate>{children}</ConsentGate>;
}
