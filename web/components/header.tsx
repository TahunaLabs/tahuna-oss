"use client"

import { Button } from "@/components/ui/button"
import { Menu, X } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, type MouseEvent } from "react"

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const pathname = usePathname()

  const navLinks = [
    { label: "Manifesto", href: "/#manifesto" },
    { label: "Get in Touch", href: "/#waitlist" },
  ]

  const handleAnchorClick = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (pathname !== "/" || !href.startsWith("/#")) return

    const targetId = href.slice(2)
    const section = document.getElementById(targetId)
    if (!section) return

    event.preventDefault()
    section.scrollIntoView({ behavior: "smooth", block: "start" })
    window.history.replaceState(null, "", href)
  }

  return (
    <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
      <nav className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="text-logo text-2xl font-serif font-semibold tracking-tight">
          Tahuna
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={handleAnchorClick(link.href)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <Button variant="pill" size="sm" asChild className="px-5 py-2 h-auto">
            <Link href="/login">
              Sign In
            </Link>
          </Button>
        </div>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden p-2 text-foreground"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-background px-6 py-4 space-y-4">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={(event) => {
                handleAnchorClick(link.href)(event)
                setMobileMenuOpen(false)
              }}
              className="block text-sm text-muted-foreground hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
          <Button variant="pill" asChild className="w-full justify-center px-5 py-2 h-auto">
            <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
              Sign In
            </Link>
          </Button>
        </div>
      )}
    </header>
  )
}
