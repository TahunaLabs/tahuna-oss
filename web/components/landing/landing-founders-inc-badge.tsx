import Link from "next/link"

import { Badge } from "@/components/ui/badge"

const FOUNDERS_INC_LOGO_URL =
  "https://framerusercontent.com/images/l5QcIiKQDZnMLRqyEZxspYyuXAc.png?width=6588&height=1080"

export function LandingFoundersIncBadge() {
  return (
    <Link
      href="https://f.inc/"
      target="_blank"
      rel="noreferrer"
      className="group inline-flex items-center gap-3 rounded-full border border-border bg-card px-3 py-1.5 text-left transition-colors hover:bg-muted"
    >
      <Badge variant="ghost" className="text-ui-caption tracking-ui-eyebrow">
        Backed by
      </Badge>
      <img
        src={FOUNDERS_INC_LOGO_URL}
        alt="Founders, Inc."
        className="h-4 w-auto object-contain opacity-65 grayscale brightness-0 transition-opacity group-hover:opacity-85 dark:invert"
      />
    </Link>
  )
}
