import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Bebas_Neue, Fredoka, Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const fredoka = Fredoka({ subsets: ["latin"], variable: "--font-fredoka" });
const bebas = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-bebas" });

export const metadata: Metadata = {
  title: "Volt — Tel Aviv dispatch",
  description: "Draw paths for food-delivery riders across a paper map of Tel Aviv.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#8ec8d6",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable, fredoka.variable, bebas.variable)}>
      <body className="min-h-dvh overflow-hidden overscroll-none bg-[#8ec8d6] text-[#3d3830] antialiased">
        {children}
      </body>
    </html>
  );
}
