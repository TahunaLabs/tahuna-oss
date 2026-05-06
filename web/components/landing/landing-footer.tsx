import Link from "next/link"

import { CLOUD_LINKS_CONFIG } from "@/cloud/links"
import { Logo } from "@/components/logo"

const FOOTER_SECTIONS = [
  {
    title: "Platform",
    links: [
      { label: "Quickstart", href: CLOUD_LINKS_CONFIG.quickstartUrl, external: true },
      { label: "Environments", href: CLOUD_LINKS_CONFIG.environmentsUrl, external: true },
      { label: "Runs", href: CLOUD_LINKS_CONFIG.runsUrl, external: true },
    ],
  },
  {
    title: "Documentation",
    links: [
      { label: "Documentation", href: CLOUD_LINKS_CONFIG.docsUrl, external: true },
      { label: "CLI Reference", href: CLOUD_LINKS_CONFIG.cliReferenceUrl, external: true },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Changelog", href: CLOUD_LINKS_CONFIG.changelogUrl, external: true },
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
    <footer id="start" className="overflow-hidden border-t border-white/10 bg-black text-white">
      <div className="mx-auto max-w-7xl px-6 pt-10 md:px-16 md:pt-14">
        {/* Top area: brand left, links right */}
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          {/* Brand + copyright grouped */}
          <div className="flex shrink-0 flex-col gap-4">
            <Link href="/" className="inline-flex items-center gap-3 text-white">
              <Logo className="h-7" />
              <span className="font-serif text-xl tracking-tight">Tahuna</span>
            </Link>
            <p className="text-sm text-white/40">
              © 2026 Tahuna. All rights reserved.
            </p>
          </div>

          {/* Link columns — pushed right */}
          <div className="grid grid-cols-2 gap-x-16 gap-y-8 md:grid-cols-4">
            {FOOTER_SECTIONS.map((section) => (
              <div key={section.title} className="flex flex-col gap-3">
                <span className="text-xs font-medium tracking-widest uppercase text-white/50">
                  {section.title}
                </span>
                <ul className="flex flex-col gap-2">
                  {section.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        {...(link.external ? { target: "_blank", rel: "noreferrer" } : {})}
                        className="text-sm text-white/70 transition-colors hover:text-white"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Decorative text — in normal flow, no overlap */}
        <div className="pointer-events-none -mt-20 select-none overflow-hidden text-center">
          <p
            className="font-serif leading-none font-semibold tracking-tight text-white/10"
            style={{ fontSize: "clamp(10rem, 24vw, 24rem)", transform: "translateY(22%)" }}
          >
            Tahuna
          </p>
        </div>
      </div>
    </footer>
  )
}
