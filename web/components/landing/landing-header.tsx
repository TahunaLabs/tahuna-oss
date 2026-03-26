"use client"

import Link from "next/link"
import { Menu, X } from "lucide-react"
import { useState } from "react"

import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navLinks = [
  { label: "The Layers", href: "/#layers" },
  { label: "The Loop", href: "/#loop" },
  { label: "Start", href: "/#start" },
]

export function LandingHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="inline-flex items-center gap-3 text-foreground">
          <Logo className="h-9" />
          <span className="text-lg font-medium tracking-tight">Tahuna</span>
        </Link>

        <div className="hidden items-center gap-3 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
          <Button asChild variant="ghost" size="compact">
            <Link href="/login">Sign In</Link>
          </Button>
          <Button asChild variant="outline" size="compact" className="rounded-full px-5">
            <Link href="/login">Get Started</Link>
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon-control"
          className="md:hidden"
          onClick={() => setMobileMenuOpen((open) => !open)}
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X /> : <Menu />}
        </Button>
      </nav>

      <div
        className={cn(
          "border-t border-border bg-background px-6 transition-[max-height,opacity] duration-200 md:hidden",
          mobileMenuOpen ? "max-h-80 py-4 opacity-100" : "max-h-0 overflow-hidden py-0 opacity-0",
        )}
      >
        <div className="space-y-3">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="block text-sm text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/login"
            className="block text-sm text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setMobileMenuOpen(false)}
          >
            Sign In
          </Link>
          <Button asChild variant="outline" size="compact" className="w-full rounded-full">
            <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
              Get Started
            </Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
