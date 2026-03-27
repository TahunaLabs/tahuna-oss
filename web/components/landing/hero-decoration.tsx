import { Card, CardContent } from '@/components/ui/card'

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

function OliveBranch() {
  const gold = 'var(--primary)'
  const stone = '#b3aea2' // from the logo's lighter fill

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 500 550"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
    >
      {/* Main stem — thick, organic, slightly irregular S-curve */}
      <path
        d="M 40 510 C 70 440, 110 380, 160 330
           C 210 280, 250 260, 290 230
           C 330 200, 370 165, 400 130
           C 430 95, 450 70, 475 35"
        stroke={gold}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.18"
      />
      {/* Secondary thinner line along the stem — gives organic depth */}
      <path
        d="M 45 505 C 75 435, 115 378, 165 328
           C 215 275, 255 255, 295 225
           C 335 195, 372 160, 405 125"
        stroke={stone}
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.10"
      />

      {/* ---- Sub-branches splitting off the main stem ---- */}
      <path d="M 120 385 C 95 365, 70 360, 55 370" stroke={gold} strokeWidth="1.5" strokeLinecap="round" opacity="0.14" />
      <path d="M 200 295 C 175 275, 148 268, 132 278" stroke={gold} strokeWidth="1.5" strokeLinecap="round" opacity="0.14" />
      <path d="M 200 295 C 220 268, 245 252, 265 258" stroke={gold} strokeWidth="1.2" strokeLinecap="round" opacity="0.12" />
      <path d="M 290 230 C 265 212, 242 206, 228 218" stroke={gold} strokeWidth="1.5" strokeLinecap="round" opacity="0.14" />
      <path d="M 340 185 C 360 158, 382 145, 398 152" stroke={gold} strokeWidth="1.2" strokeLinecap="round" opacity="0.12" />
      <path d="M 400 130 C 378 115, 358 110, 345 120" stroke={gold} strokeWidth="1.5" strokeLinecap="round" opacity="0.14" />
      <path d="M 440 80 C 455 55, 470 42, 485 48" stroke={gold} strokeWidth="1" strokeLinecap="round" opacity="0.10" />

      {/* ---- Leaves — organic teardrop shapes, alternating sides ---- */}

      {/* Bottom cluster (near training card) */}
      <path d="M 80 410 C 55 392, 35 385, 28 398 C 42 402, 62 406, 80 410Z" fill={gold} opacity="0.14" />
      <path d="M 90 405 C 108 382, 128 372, 138 384 C 122 392, 105 400, 90 405Z" fill={gold} opacity="0.11" />
      <path d="M 65 420 C 42 415, 25 420, 22 432 C 36 428, 52 424, 65 420Z" fill={stone} opacity="0.08" />

      {/* Lower-mid cluster */}
      <path d="M 155 340 C 130 322, 108 315, 100 328 C 116 332, 136 336, 155 340Z" fill={gold} opacity="0.16" />
      <path d="M 168 332 C 188 308, 210 296, 222 308 C 206 318, 186 328, 168 332Z" fill={gold} opacity="0.12" />
      <path d="M 140 350 C 118 348, 98 355, 96 366 C 112 360, 128 354, 140 350Z" fill={stone} opacity="0.09" />

      {/* Center cluster — the fullest, most visible */}
      <path d="M 260 252 C 235 232, 212 224, 204 238 C 220 244, 240 248, 260 252Z" fill={gold} opacity="0.20" />
      <path d="M 275 242 C 298 216, 320 204, 332 216 C 316 228, 295 238, 275 242Z" fill={gold} opacity="0.16" />
      <path d="M 248 265 C 224 260, 204 266, 200 280 C 216 274, 234 268, 248 265Z" fill={gold} opacity="0.13" />
      <path d="M 288 232 C 308 208, 330 198, 340 210 C 324 220, 306 228, 288 232Z" fill={stone} opacity="0.10" />
      <path d="M 242 258 C 220 248, 198 252, 195 264 C 210 260, 228 256, 242 258Z" fill={stone} opacity="0.07" />

      {/* Upper cluster (between training & dashboard) */}
      <path d="M 355 172 C 332 154, 312 146, 305 158 C 320 164, 338 168, 355 172Z" fill={gold} opacity="0.16" />
      <path d="M 368 162 C 388 138, 408 128, 418 140 C 402 150, 384 158, 368 162Z" fill={gold} opacity="0.12" />
      <path d="M 342 182 C 320 178, 300 185, 298 196 C 314 190, 330 186, 342 182Z" fill={stone} opacity="0.09" />

      {/* Top cluster (near dashboard) */}
      <path d="M 425 108 C 405 90, 385 82, 378 94 C 392 100, 410 104, 425 108Z" fill={gold} opacity="0.16" />
      <path d="M 438 98 C 454 74, 470 64, 480 76 C 466 86, 450 94, 438 98Z" fill={gold} opacity="0.12" />
      <path d="M 460 68 C 472 48, 486 40, 494 50 C 482 58, 470 64, 460 68Z" fill={gold} opacity="0.10" />

      {/* ---- Olives / berries — small filled circles along the stem ---- */}
      <circle cx="100" cy="392" r="5" fill={gold} opacity="0.18" />
      <circle cx="105" cy="395" r="2.5" fill={stone} opacity="0.25" />

      <circle cx="182" cy="310" r="5.5" fill={gold} opacity="0.20" />
      <circle cx="185" cy="313" r="2.5" fill={stone} opacity="0.28" />

      <circle cx="270" cy="240" r="6" fill={gold} opacity="0.22" />
      <circle cx="273" cy="243" r="3" fill={stone} opacity="0.30" />

      <circle cx="358" cy="165" r="5" fill={gold} opacity="0.18" />
      <circle cx="361" cy="168" r="2.5" fill={stone} opacity="0.25" />

      <circle cx="445" cy="82" r="4.5" fill={gold} opacity="0.16" />
      <circle cx="447" cy="84" r="2" fill={stone} opacity="0.22" />
    </svg>
  )
}

export function HeroDecoration() {
  return (
    <div className="relative h-full w-full min-h-96 select-none" aria-hidden>

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
            <div className="h-1 w-2/5 rounded-full bg-primary" />
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

      {/* ---- Olive branch — organic, behind cards ---- */}
      <OliveBranch />
    </div>
  )
}
