import { Card, CardContent } from '@/components/ui/card'

/* ------------------------------------------------------------------ */
/*  Step badge — a completed automation step                           */
/* ------------------------------------------------------------------ */
function StepBadge({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1">
      <svg viewBox="0 0 16 16" fill="none" className="size-3 shrink-0 text-success">
        <path
          d="M3 8.5l3.5 3.5L13 4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="font-mono text-ui-micro text-muted-foreground whitespace-nowrap">
        {label}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Sparkline — descending loss curve as bars                          */
/* ------------------------------------------------------------------ */
function Sparkline() {
  const bars = [72, 60, 48, 42, 34, 28, 22, 17, 13, 10, 8, 7]
  return (
    <div className="flex items-end gap-px h-7">
      {bars.map((h, i) => (
        <div
          key={i}
          className="w-1.5 rounded-t-sm bg-primary/40"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main hero decoration — the Tahuna story                            */
/*                                                                     */
/*  Diagonal cascade filling the space:                                */
/*  top-left: command → center-left: steps → center: training          */
/*  top-right: dashboard (the outcome, visible from the start)         */
/* ------------------------------------------------------------------ */
export function HeroDecoration() {
  return (
    <div className="relative h-full w-full min-h-[28rem] select-none" aria-hidden>

      {/* ---- ACT 1: The command (top-left) ---- */}
      <Card variant="surface" className="absolute left-[2%] top-[6%] w-48 shadow-sm">
        <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5">
          <div className="size-1.5 rounded-full bg-border" />
          <div className="size-1.5 rounded-full bg-border" />
          <div className="size-1.5 rounded-full bg-border" />
          <span className="ml-1 font-mono text-ui-micro text-muted-foreground tracking-ui-label">
            terminal
          </span>
        </div>
        <CardContent className="px-3 py-2">
          <p className="font-mono text-ui-caption text-foreground">
            <span className="text-primary">$</span> tahuna train
          </p>
        </CardContent>
      </Card>

      {/* ---- Connector: command → steps ---- */}
      <div className="absolute left-[14%] top-[19%] h-[6%] w-px border-l border-dashed border-border/60" />

      {/* ---- ACT 2: Automated steps (center-left) ---- */}
      <div className="absolute left-[8%] top-[26%] flex flex-col gap-1.5">
        <StepBadge label="data bound" />
        <StepBadge label="code synced" />
        <StepBadge label="pods ready" />
      </div>

      {/* ---- Connector: steps → training ---- */}
      <div className="absolute left-[20%] top-[44%] h-[5%] w-px border-l border-dashed border-border/60" />

      {/* ---- ACT 3: The grind — training card (center) ---- */}
      <Card variant="surface" className="absolute left-[14%] top-[50%] w-52 shadow-md">
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
          <span className="font-mono text-ui-micro text-muted-foreground tracking-ui-label">
            training
          </span>
          <span className="flex items-center gap-1">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-success" />
            </span>
            <span className="font-mono text-ui-micro text-success">running</span>
          </span>
        </div>
        <CardContent className="flex flex-col gap-2 px-3 py-2">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-ui-micro text-muted-foreground">epoch</span>
            <span className="font-mono text-ui-caption text-foreground">3 / 8</span>
          </div>
          <div className="h-1 w-full rounded-full bg-border">
            <div className="h-1 w-[37.5%] rounded-full bg-primary" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-ui-micro text-muted-foreground">loss</span>
            <span className="font-mono text-ui-caption text-foreground">
              <span className="text-muted-foreground">2.41 &rarr; 1.87 &rarr;</span> 0.94
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ---- ACT 4: The milestone — dashboard (top-right, the payoff) ---- */}
      <Card variant="surface" className="absolute right-[2%] top-[8%] w-48 shadow-md">
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
          <span className="font-mono text-ui-micro text-muted-foreground tracking-ui-label">
            dashboard
          </span>
          <span className="font-mono text-ui-micro text-primary">live</span>
        </div>
        <CardContent className="flex flex-col gap-2.5 px-3 py-2">
          <Sparkline />
          <div className="flex items-center justify-between">
            <span className="font-mono text-ui-micro text-muted-foreground">eval loss</span>
            <span className="font-mono text-ui-caption text-foreground">0.94</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-ui-micro text-muted-foreground">throughput</span>
            <span className="font-mono text-ui-caption text-foreground">1.2k tok/s</span>
          </div>
        </CardContent>
      </Card>

      {/* ---- Olive branch — sweeps from bottom-left through center to top-right ---- */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 500 500"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Main branch stem — a graceful S-curve */}
        <path
          d="M 60 460 C 100 380, 140 320, 200 280 S 320 200, 360 160 S 420 100, 460 50"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="text-primary/20"
        />

        {/* ---- Leaves along the branch (alternating sides) ---- */}
        {/* Leaf cluster 1 — bottom, near training card */}
        <path d="M 95 400 C 75 380, 55 375, 40 385 C 55 390, 75 395, 95 400Z" className="fill-primary/15" />
        <path d="M 105 395 C 120 370, 135 360, 150 368 C 135 378, 120 388, 105 395Z" className="fill-primary/12" />

        {/* Leaf cluster 2 — mid-left */}
        <path d="M 170 305 C 145 290, 125 280, 115 292 C 130 298, 150 300, 170 305Z" className="fill-primary/15" />
        <path d="M 185 295 C 200 270, 218 258, 230 268 C 215 278, 200 288, 185 295Z" className="fill-primary/12" />
        <path d="M 155 315 C 135 310, 115 315, 112 328 C 128 322, 142 318, 155 315Z" className="fill-primary/10" />

        {/* Leaf cluster 3 — center, the fullest point */}
        <path d="M 260 235 C 238 218, 215 210, 208 222 C 222 228, 242 230, 260 235Z" className="fill-primary/18" />
        <path d="M 275 225 C 292 200, 312 188, 322 200 C 308 210, 290 220, 275 225Z" className="fill-primary/15" />
        <path d="M 248 248 C 225 240, 205 245, 202 258 C 218 252, 235 248, 248 248Z" className="fill-primary/12" />
        <path d="M 285 215 C 300 192, 318 182, 328 192 C 312 202, 298 212, 285 215Z" className="fill-primary/10" />

        {/* Leaf cluster 4 — upper, toward dashboard */}
        <path d="M 365 155 C 345 138, 325 130, 318 142 C 332 148, 350 150, 365 155Z" className="fill-primary/15" />
        <path d="M 378 145 C 395 122, 412 112, 422 122 C 408 132, 392 140, 378 145Z" className="fill-primary/12" />

        {/* Leaf cluster 5 — top, near dashboard */}
        <path d="M 430 95 C 412 78, 395 70, 388 82 C 402 88, 418 90, 430 95Z" className="fill-primary/15" />
        <path d="M 442 85 C 455 62, 468 52, 478 62 C 465 72, 452 80, 442 85Z" className="fill-primary/12" />

        {/* Small olives / berries along the branch */}
        <circle cx="130" cy="350" r="4" className="fill-primary/20" />
        <circle cx="220" cy="265" r="5" className="fill-primary/25" />
        <circle cx="310" cy="190" r="4" className="fill-primary/20" />
        <circle cx="400" cy="120" r="4.5" className="fill-primary/22" />
        <circle cx="455" cy="65" r="3.5" className="fill-primary/18" />

        {/* Secondary thinner branches splitting off */}
        <path
          d="M 200 280 C 175 265, 155 255, 140 260"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          className="text-primary/12"
        />
        <path
          d="M 260 235 C 275 215, 295 205, 310 210"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          className="text-primary/12"
        />
        <path
          d="M 360 160 C 340 145, 325 140, 315 148"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          className="text-primary/12"
        />
      </svg>
    </div>
  )
}
