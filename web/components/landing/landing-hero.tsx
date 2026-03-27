import { Eyebrow } from '@/components/ui/eyebrow'
import { TerminalBlock } from '@/components/ui/terminal-block'
import { HeroDecoration } from '@/components/landing/hero-decoration'

export function LandingHero() {
  return (
    <section id="hero" className="flex flex-1 items-center px-8 py-6">
      <div className="grid w-full grid-cols-5 gap-8">
        <div className="col-span-3 flex flex-col justify-center gap-8">
          <Eyebrow>Vision</Eyebrow>

          <h1 className="font-serif text-7xl font-semibold leading-display-tight text-foreground">
            The gap between general and yours.
          </h1>

          <div className="flex flex-col gap-4 font-mono text-sm text-muted-foreground leading-relaxed">
            <p>
              CLI-native post-training. For you, or the agents working alongside you.
            </p>
          </div>

          <TerminalBlock command="curl -fsSL https://app.tahuna.ai/cli | sh" />
        </div>

        <div className="col-span-2 relative">
          <HeroDecoration />
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"

export function LandingHero() {
  return (
    <section className="relative overflow-hidden px-6 py-20 md:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-5xl">
          <h1 className="mb-10 font-serif text-5xl leading-display-tight tracking-tight text-foreground md:text-7xl xl:text-8xl">
            AGI is not a single Oracle.
            <br />
            <span className="italic">It&apos;s billions of species.</span>
          </h1>

          <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-xl">
              <p className="text-lg leading-relaxed text-foreground/85 md:text-xl">
                The future of artificial intelligence is a wide field of specialized systems. Training them should be easily accessible.
              </p>
            </div>

            <Button asChild variant="outline" size="lg" className="self-start rounded-full px-8">
              <Link href="/login">
                Try it
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
