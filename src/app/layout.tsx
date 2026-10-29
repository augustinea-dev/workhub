import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Workhub",
  description: "Projects, tasks and time for the agency.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
