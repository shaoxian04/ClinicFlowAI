import { ConsentGate } from "../components/ConsentGate";

export default function PrevisitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConsentGate>{children}</ConsentGate>;
}
