import Link from "next/link"

import { CLOUD_LINKS_CONFIG } from "@/cloud/links"
import { BrandLockup } from "@/components/brand-lockup"
import { FooterWordmark } from "@/components/landing/footer-wordmark"
import { CDN_CONFIG } from "@/config"

const nvidiaInceptionSrc = `${CDN_CONFIG.baseUrl}${CDN_CONFIG.artefactsPath}/${CDN_CONFIG.nvidiaInception}`

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
      { label: "Source code", href: CLOUD_LINKS_CONFIG.repoUrl, external: true },
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
    <footer id="start" className="overflow-hidden border-t border-border bg-foreground text-background">
      <div className="mx-auto max-w-7xl px-6 pt-10 md:px-8 md:pt-14">
        {/* Top area: brand left, links right */}
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          {/* Brand + copyright grouped */}
          <div className="flex shrink-0 flex-col gap-4">
            <BrandLockup className="gap-3 text-background" logoClassName="h-14" />
            <p className="text-sm text-background/40">
              © 2026 Tahuna. Open source under AGPLv3.
            </p>

            {/* Credential: NVIDIA Inception member */}
            <div className="mt-2 flex flex-wrap items-stretch gap-3">
              <Link
                href="https://www.nvidia.com/en-us/startups/"
                target="_blank"
                rel="noreferrer"
                className="group flex flex-col justify-center gap-2 rounded-lg border border-background/15 bg-background/[0.04] px-5 py-4 transition-colors hover:bg-background/[0.08]"
                aria-label="Member of the NVIDIA Inception Program"
              >
                <img
                  src={nvidiaInceptionSrc}
                  alt="NVIDIA Inception Program"
                  className="h-12 w-auto object-contain object-left opacity-90 brightness-0 invert transition-opacity group-hover:opacity-100 dark:invert-0"
                />
              </Link>
            </div>
          </div>

          {/* Link columns — pushed right */}
          <div className="grid grid-cols-2 gap-x-16 gap-y-8 md:grid-cols-4">
            {FOOTER_SECTIONS.map((section) => (
              <div key={section.title} className="flex flex-col gap-3">
                <span className="text-xs font-medium tracking-widest uppercase text-background/50">
                  {section.title}
                </span>
                <ul className="flex flex-col gap-2">
                  {section.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        {...(link.external ? { target: "_blank", rel: "noreferrer" } : {})}
                        className="text-sm text-background/70 transition-colors hover:text-background"
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
        <FooterWordmark />
      </div>
    </footer>
  )
}
