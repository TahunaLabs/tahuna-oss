import Link from "next/link"

const FOUNDERS_INC_LOGO_URL =
  "https://framerusercontent.com/images/l5QcIiKQDZnMLRqyEZxspYyuXAc.png?width=6588&height=1080"

export function LandingFoundersIncBadge() {
  return (
    <Link
      href="https://f.inc/"
      target="_blank"
      rel="noreferrer"
      className="group flex w-full max-w-sm flex-col gap-4 rounded-lg border border-primary/25 bg-linear-to-b from-primary/12 via-primary/8 to-card px-4 py-4 text-left transition-colors hover:border-primary/45 hover:bg-primary/10"
    >
      <div className="space-y-1">
        <p className="font-mono text-ui-caption uppercase tracking-ui-eyebrow text-muted-foreground">
          Social proof
        </p>
        <p className="font-serif text-xl leading-tight text-foreground">
          Accepted into Canopy at Founders, Inc.
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-primary/15 pt-4">
        <p className="max-w-40 text-sm leading-relaxed text-muted-foreground">
          Building Tahuna alongside a serious founder community.
        </p>
        <div className="shrink-0 rounded-md bg-background/80 px-3 py-2">
          <img
            src={FOUNDERS_INC_LOGO_URL}
            alt="Founders, Inc."
            className="h-5 w-auto object-contain"
          />
        </div>
      </div>
    </Link>
  )
}
