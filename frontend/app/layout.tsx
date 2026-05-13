import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "asmc project",
  description: "AI interviewing platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body 
        className="antialiased min-h-screen bg-background" 
        suppressHydrationWarning
        data-suppress-hydration-warning={true}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
