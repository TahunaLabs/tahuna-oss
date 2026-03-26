import Link from "next/link"

import { Logo } from "@/components/logo"

export function LandingFooter() {
  return (
    <footer id="start" className="border-t border-border px-6 py-16 md:py-20">
      <div className="mx-auto flex max-w-7xl items-center justify-center">
        <Link href="/" className="inline-flex items-center gap-3 text-foreground">
          <Logo className="h-10" />
          <span className="text-2xl font-medium tracking-tight">Tahuna</span>
        </Link>
      </div>
    </footer>
  )
}
