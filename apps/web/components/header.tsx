"use client"

import Link from "next/link"
import { useState } from "react"
import { Menu, X } from "lucide-react"

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navLinks = [
    { label: "Manifesto", href: "/#manifesto" },
    { label: "The Stack", href: "/#layers" },
    { label: "Sign In", href: "/sign-in" },
    { label: "Sign Up", href: "/sign-up" },
  ]

  return (
    <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
      <nav className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="text-2xl font-serif font-semibold tracking-tight text-foreground">
          Tahuna
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/api-key"
            className="text-sm font-medium text-foreground border border-foreground/30 rounded-full px-5 py-2 hover:bg-foreground/5 transition-colors"
          >
            Get API Key
          </Link>
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
              className="block text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/api-key"
            className="block text-sm font-medium text-foreground border border-foreground/30 rounded-full px-5 py-2 text-center hover:bg-foreground/5 transition-colors"
            onClick={() => setMobileMenuOpen(false)}
          >
            Get API Key
          </Link>
        </div>
      )}
    </header>
  )
}
