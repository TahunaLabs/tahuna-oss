import Link from "next/link"

const FOUNDERS_INC_LOGO_URL =
  "https://framerusercontent.com/images/l5QcIiKQDZnMLRqyEZxspYyuXAc.png?width=6588&height=1080"

export function LandingFoundersIncBadge() {
  return (
    <Link
      href="https://f.inc/"
      target="_blank"
      rel="noreferrer"
      className="group inline-flex items-center gap-3 rounded-full border border-primary/20 bg-card/90 px-4 py-2 text-left transition-colors hover:border-primary/40 hover:bg-card"
    >
      <span className="font-mono text-ui-caption uppercase tracking-ui-eyebrow text-muted-foreground">
        Backed by
      </span>
      <div className="shrink-0 rounded-full border border-border/80 bg-background/80 px-3 py-1.5">
        <img
          src={FOUNDERS_INC_LOGO_URL}
          alt="Founders, Inc."
          className="h-4 w-auto object-contain"
        />
      </div>
    </Link>
  )
}
