import { siteMetadata } from "@/app/site-metadata"
import { ConvexClientProvider } from "@/components/convex-client-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getToken } from "@/lib/auth-server"
import { Cormorant_Garamond, Geist, Geist_Mono } from "next/font/google"
import { cookies } from "next/headers"
import { NuqsAdapter } from "nuqs/adapters/next/app"
import type React from "react"
import "./globals.css"

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-serif",
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
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${cormorant.variable} ${initialTheme}`}>
      <body className="font-sans antialiased bg-sidebar h-svh overflow-hidden">
        <ThemeProvider initialTheme={initialTheme}>
            <TooltipProvider>
              <NuqsAdapter>
                <ConvexClientProvider initialToken={token}>{children}</ConvexClientProvider>
              </NuqsAdapter>
            </TooltipProvider>
            <Toaster />
        </ThemeProvider>
</body>
    </html>
  )
}
