import { Geist, Geist_Mono } from "next/font/google";
import AppShell from "@/components/AppShell";
import ToastProvider from "@/components/ToastProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "bimimport",
  description: "IFC import, link, and calculate workflow",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-dvh min-h-0 antialiased`}
    >
      <body className="flex h-dvh min-h-0 flex-col overflow-hidden">
        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </body>
    </html>
  );
}
