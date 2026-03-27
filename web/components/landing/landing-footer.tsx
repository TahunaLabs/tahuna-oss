import Link from "next/link"

import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Eyebrow } from "@/components/ui/eyebrow"
import { LINKS_CONFIG } from "@/config"

const FOOTER_SECTIONS = [
  {
    title: "Platform",
    links: [
      { label: "Quickstart", href: "https://docs.tahuna.io/quickstart", external: true },
      { label: "Environments", href: "https://docs.tahuna.io/environments", external: true },
      { label: "Runs", href: "https://docs.tahuna.io/runs", external: true },
    ],
  },
  {
    title: "Documentation",
    links: [
      { label: "Getting Started", href: LINKS_CONFIG.gettingStartedUrl, external: true },
      { label: "API Reference", href: LINKS_CONFIG.apiReferenceUrl, external: true },
      { label: "CLI", href: "https://docs.tahuna.io/cli", external: true },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "GitHub", href: LINKS_CONFIG.repoUrl, external: true },
      { label: "Changelog", href: LINKS_CONFIG.changelogUrl, external: true },
    ],
  },
  {
    title: "Follow",
    links: [
      { label: "X", href: "https://x.com/TahunaApp", external: true },
    ],
  },
] as const

export function LandingFooter() {
  return (
    <footer id="start" className="relative overflow-hidden border-t border-white/10 bg-black text-white">
      <div className="absolute top-14 left-12 z-10 md:top-20 md:left-16">
        <Link href="/" className="inline-flex items-center gap-3 text-white">
          <Logo className="h-10" />
          <span className="font-serif text-2xl tracking-tight">Tahuna</span>
        </Link>
      </div>

      <div
        className="relative mx-auto flex max-w-7xl px-6 py-14 md:py-20"
        style={{ minHeight: "clamp(20rem, 36vw, 26rem)" }}
      >
        <div className="ml-auto grid w-full max-w-3xl grid-cols-2 gap-8 md:grid-cols-4">
          {FOOTER_SECTIONS.map((section) => (
            <div key={section.title} className="relative z-10 flex flex-col items-start gap-3">
              <Eyebrow className="[&_[data-slot=separator]]:bg-white/30 [&_span]:text-white/60">
                {section.title}
              </Eyebrow>
              <div className="flex flex-col items-start gap-1">
                {section.links.map((link) => (
                  <Button
                    key={link.label}
                    asChild
                    variant="ghost"
                    size="compact-xs"
                    className="-ml-2 text-white hover:bg-white/10 hover:text-white"
                  >
                    {link.external ? (
                      <Link href={link.href} target="_blank" rel="noreferrer">
                        {link.label}
                      </Link>
                    ) : (
                      <Link href={link.href}>{link.label}</Link>
                    )}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="absolute left-6 bottom-10 z-10 text-sm text-white/45 md:left-16">
          <p>Copyright © 2026 Tahuna. All rights reserved.</p>
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
