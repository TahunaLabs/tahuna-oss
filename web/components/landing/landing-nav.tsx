"use client"

import { Moon, Sun } from "lucide-react"
import Link from "next/link"

import { CLOUD_LINKS_CONFIG } from "@/cloud/links"
import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"

const NAV_LINKS = [
  { label: "Pricing", href: "/pricing", external: false },
  { label: "Dashboard", href: "/dashboard", external: false },
  { label: "Docs", href: CLOUD_LINKS_CONFIG.docsUrl, external: true },
  // { label: "Blog", href: "#" },
] as const

export function LandingNav() {
  const { theme, setTheme } = useTheme()

  return (
    <header className="flex h-14 shrink-0 items-center px-6 md:px-8">
      <Link href="/" className="flex shrink-0 items-center gap-2">
        <Logo className="h-6 w-auto" />
        <span className="text-xl font-semibold tracking-tight">Tahuna</span>
      </Link>

      <div className="ml-auto flex items-center gap-1">
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

        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle theme"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>

        <Button variant="outline" size="sm" asChild>
          <Link href="/login">Log in</Link>
        </Button>
        <Button size="sm" asChild>
          <Link href="/login">Get started</Link>
        </Button>
      </div>
    </header>
  )
}
