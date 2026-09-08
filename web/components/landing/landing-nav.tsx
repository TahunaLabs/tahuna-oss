"use client"

import { Moon, Sun } from "lucide-react"
import Link from "next/link"

import { CLOUD_LINKS_CONFIG } from "@/cloud/links"
import { BrandLockup } from "@/components/brand-lockup"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"

const NAV_LINKS = [
  { label: "Quickstart", href: CLOUD_LINKS_CONFIG.quickstartUrl, external: true },
  { label: "Dashboard", href: "/dashboard", external: false },
  { label: "Docs", href: CLOUD_LINKS_CONFIG.docsUrl, external: true },
  { label: "GitHub", href: CLOUD_LINKS_CONFIG.repoUrl, external: true },
] as const

export function LandingNav() {
  const { theme, setTheme } = useTheme()

  return (
    <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center border-b border-border bg-background/95 px-4 backdrop-blur md:px-8">
      <BrandLockup className="shrink-0" />

      <div className="ml-auto flex items-center gap-1">
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map(({ label, href, external }) => (
            <Button key={label} variant="ghost" size="sm" asChild>
              {external ? (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {label}
                </a>
              ) : (
                <Link href={href}>{label}</Link>
              )}
            </Button>
          ))}
        </nav>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle theme"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>

        <Button variant="outline" size="sm" className="hidden sm:inline-flex" asChild>
          <Link href="/login">Log in</Link>
        </Button>
        <Button size="sm" asChild>
          <Link href="/login">Run your first SFT/RL workload</Link>
        </Button>
      </div>
    </header>
  )
}
