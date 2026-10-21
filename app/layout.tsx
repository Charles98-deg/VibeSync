import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VibeSync — Your cultural AI concierge",
  description:
    "VibeSync reads the music, style, and stories you love, then points you to the places that share your frequency.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-dvh bg-zinc-950 text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
