import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "G0DM0D3 Command Center",
  description:
    "Professional Red Teaming & LLM Vulnerability Assessment Dashboard",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-[#0B0F19] text-slate-100">
        <Providers>
          {children}
          <Toaster
            theme="dark"
            position="bottom-right"
            toastOptions={{
              style: {
                background: "#1e293b",
                border: "1px solid #334155",
                color: "#f1f5f9",
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
