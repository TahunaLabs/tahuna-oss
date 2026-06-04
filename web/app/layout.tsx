import { siteMetadata } from "@/app/site-metadata"
import { ConvexClientProvider } from "@/components/convex-client-provider"
import { PostHogProvider } from "@/components/posthog-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getToken } from "@/lib/auth-server"
import localFont from "next/font/local"
import { cookies } from "next/headers"
import { NuqsAdapter } from "nuqs/adapters/next/app"
import type React from "react"
import "./globals.css"

const geistMono = localFont({
  src: [
    { path: "../public/fonts/geist-mono-latin-ext.woff2", weight: "100 900", style: "normal" },
    { path: "../public/fonts/geist-mono-latin.woff2",     weight: "100 900", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
})

export const metadata = siteMetadata

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const token = await getToken()
  const themeCookie = (await cookies()).get("tahuna-theme")?.value
  const initialTheme = themeCookie === "dark" ? "dark" : "light"

  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${geistMono.variable} ${initialTheme}`}>
      <body className="font-sans antialiased bg-sidebar h-svh overflow-hidden">
        <PostHogProvider>
          <ThemeProvider initialTheme={initialTheme}>
              <TooltipProvider>
                <NuqsAdapter>
                  <ConvexClientProvider initialToken={token}>{children}</ConvexClientProvider>
                </NuqsAdapter>
              </TooltipProvider>
              <Toaster />
          </ThemeProvider>
        </PostHogProvider>
      </body>
    </html>
  )
}
