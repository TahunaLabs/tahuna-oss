import Link from "next/link"

import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Eyebrow } from "@/components/ui/eyebrow"

export function LandingFooter() {
  return (
    <footer id="start" className="relative overflow-hidden border-t border-white/10 bg-black text-white">
      <div className="absolute top-14 left-12 z-10 md:top-20 md:left-16">
        <Link href="/" className="inline-flex items-center gap-3 text-white">
          <Logo className="h-10" />
          <span className="text-2xl font-medium tracking-tight">Tahuna</span>
        </Link>
      </div>

      <div
        className="relative mx-auto flex max-w-7xl px-6 py-14 md:py-20"
        style={{ minHeight: "clamp(20rem, 36vw, 26rem)" }}
      >
        <div className="absolute top-14 right-6 z-10 flex flex-col items-start gap-2 md:top-20 md:right-16">
          <Eyebrow className="[&_[data-slot=separator]]:bg-white/30 [&_span]:text-white/60">Socials</Eyebrow>
          <Button asChild variant="ghost" size="compact" className="text-white hover:bg-white/10 hover:text-white">
            <Link href="https://x.com/TahunaApp" target="_blank" rel="noreferrer">
              Twitter/X
            </Link>
          </Button>
        </div>

        <div className="pointer-events-none absolute inset-x-6 bottom-0 overflow-hidden">
          <p
            className="font-serif leading-none font-semibold tracking-tight text-white/20"
            style={{ fontSize: "clamp(12rem, 30vw, 28rem)", transform: "translateY(10%)" }}
          >
            Tahuna
          </p>
        </div>
      </div>
    </footer>
  )
}
