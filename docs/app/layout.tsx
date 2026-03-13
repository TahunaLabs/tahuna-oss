import "./globals.css"
import { RootProvider } from "fumadocs-ui/provider/next"
import type { ReactNode } from "react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: {
    template: "%s | Tahuna Docs",
    default: "Tahuna Docs",
  },
  description: "Documentation for the Tahuna compute platform",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  )
}
