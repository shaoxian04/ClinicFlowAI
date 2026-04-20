import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CliniFlow AI",
  description: "AI-powered clinical workflow for SME clinics.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
