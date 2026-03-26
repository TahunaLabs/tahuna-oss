"use client"

import { Moon, Sun } from "lucide-react"

import { FrameworksBar } from '@/components/landing/frameworks-bar'
import { LandingHero } from '@/components/landing/landing-hero'
import { LandingNav } from '@/components/landing/landing-nav'
import { ManifestoSection } from '@/components/landing/manifesto-section'
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"

export function LandingPage() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="h-full overflow-y-auto bg-background">
      {/* First screen — nav + hero + frameworks fill exactly the viewport */}
      <div className="flex min-h-full flex-col">
        <LandingNav />
        <LandingHero />
        <FrameworksBar />
      </div>

      {/* Subsequent sections start below the fold */}
      <ManifestoSection />

      {/* Theme toggle — fixed bottom-right */}
      <Button
        variant="outline"
        size="icon"
        className="fixed bottom-4 right-4 z-50"
        aria-label="Toggle theme"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>
    </div>
  )
}
