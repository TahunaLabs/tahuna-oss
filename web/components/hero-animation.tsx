"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useState } from "react"

/* ─── Design tokens ──────────────────────────────────────── */
const ORANGE = "#E8602B"
const DARK   = "#2A2A2A"
const MID    = "#8C8C8C"
const LIGHT  = "#C8C8C8"
const FAINT  = "rgba(0,0,0,0.12)"

/* ─── Canvas size ────────────────────────────────────────── */
const VW = 660
const VH = 430

/* ═══════════════════════════════════════════════════════════
   STATE 1 — DOT GRID
   Six rows of nodes (orange, solid, hollow, plus) connected
   by dashed horizontal lines and animated bezier flow paths.
═══════════════════════════════════════════════════════════ */

type NodeType = "O" | "D" | "H" | "P"
interface NodeDef { x: number; y: number; t: NodeType; r?: number }

const NODES: NodeDef[] = [
  // Row 1
  { x: 0.17, y: 0.11, t: "O", r: 9 },
  { x: 0.54, y: 0.11, t: "D", r: 4 },
  // Row 2
  { x: 0.05, y: 0.27, t: "H", r: 5 },
  { x: 0.17, y: 0.27, t: "D", r: 4 },
  { x: 0.25, y: 0.27, t: "P" },
  { x: 0.44, y: 0.27, t: "O", r: 9 },
  { x: 0.53, y: 0.27, t: "H", r: 5 },
  { x: 0.68, y: 0.27, t: "P" },
  { x: 0.91, y: 0.27, t: "D", r: 4 },
  // Row 3
  { x: 0.05, y: 0.43, t: "O", r: 8 },
  { x: 0.18, y: 0.43, t: "H", r: 5 },
  { x: 0.44, y: 0.43, t: "H", r: 5 },
  { x: 0.57, y: 0.43, t: "D", r: 4 },
  { x: 0.70, y: 0.43, t: "O", r: 8 },
  { x: 0.82, y: 0.43, t: "H", r: 5 },
  { x: 0.93, y: 0.43, t: "O", r: 8 },
  // Row 4
  { x: 0.05, y: 0.59, t: "H", r: 5 },
  { x: 0.18, y: 0.59, t: "H", r: 5 },
  { x: 0.27, y: 0.59, t: "D", r: 4 },
  { x: 0.44, y: 0.59, t: "H", r: 5 },
  { x: 0.57, y: 0.59, t: "D", r: 4 },
  { x: 0.68, y: 0.59, t: "P" },
  { x: 0.82, y: 0.59, t: "H", r: 5 },
  // Row 5
  { x: 0.05, y: 0.75, t: "O", r: 9 },
  { x: 0.18, y: 0.75, t: "D", r: 4 },
  { x: 0.36, y: 0.75, t: "O", r: 8 },
  { x: 0.57, y: 0.75, t: "D", r: 4 },
  { x: 0.68, y: 0.75, t: "P" },
  { x: 0.82, y: 0.75, t: "H", r: 5 },
  // Row 6
  { x: 0.17, y: 0.89, t: "O", r: 9 },
  { x: 0.44, y: 0.89, t: "P" },
  { x: 0.57, y: 0.89, t: "D", r: 4 },
]

const ROW_YS = [0.11, 0.27, 0.43, 0.59, 0.75, 0.89]

// Bezier flow paths — S-curves weaving through the grid
const CURVES = [
  // Upper-right dip
  `M ${0.86 * VW} ${0.11 * VH} C ${0.78 * VW} ${0.27 * VH}, ${0.78 * VW} ${0.43 * VH}, ${0.88 * VW} ${0.59 * VH}`,
  // Left mid-arc
  `M ${0.05 * VW} ${0.59 * VH} C ${0.18 * VW} ${0.67 * VH}, ${0.27 * VW} ${0.67 * VH}, ${0.36 * VW} ${0.75 * VH}`,
  // Bottom arc
  `M ${0.05 * VW} ${0.75 * VH} C ${0.18 * VW} ${0.82 * VH}, ${0.32 * VW} ${0.82 * VH}, ${0.44 * VW} ${0.89 * VH}`,
  // Upper-left connect
  `M ${0.17 * VW} ${0.11 * VH} C ${0.25 * VW} ${0.19 * VH}, ${0.36 * VW} ${0.19 * VH}, ${0.44 * VW} ${0.27 * VH}`,
]

function PlusIcon({ cx, cy }: { cx: number; cy: number }) {
  const s = 5
  return (
    <g>
      <line x1={cx - s} y1={cy} x2={cx + s} y2={cy} stroke={MID} strokeWidth={1.2} />
      <line x1={cx} y1={cy - s} x2={cx} y2={cy + s} stroke={MID} strokeWidth={1.2} />
    </g>
  )
}

function GridNode({ n, delay }: { n: NodeDef; delay: number }) {
  const cx = n.x * VW
  const cy = n.y * VH
  const r  = n.r ?? 5

  if (n.t === "P") return <PlusIcon cx={cx} cy={cy} />

  if (n.t === "O")
    return (
      <motion.circle
        cx={cx} cy={cy} r={r} fill={ORANGE}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay, duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
      />
    )

  if (n.t === "H")
    return (
      <motion.circle
        cx={cx} cy={cy} r={r}
        fill="none" stroke={MID} strokeWidth={1.2}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay, duration: 0.3 }}
      />
    )

  return (
    <motion.circle
      cx={cx} cy={cy} r={r} fill={DARK}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay, duration: 0.3 }}
    />
  )
}

function DotGrid() {
  return (
    <motion.g
      key="dot-grid"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Dashed horizontal rows */}
      {ROW_YS.map((yr, i) => (
        <line
          key={i}
          x1={0} y1={yr * VH} x2={VW} y2={yr * VH}
          stroke={FAINT} strokeWidth={1} strokeDasharray="3 6"
        />
      ))}

      {/* Animated flow curves */}
      {CURVES.map((d, i) => (
        <motion.path
          key={i}
          d={d}
          fill="none"
          stroke={LIGHT}
          strokeWidth={1.2}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ delay: 0.3 + i * 0.18, duration: 0.9, ease: "easeOut" }}
        />
      ))}

      {/* Nodes */}
      {NODES.map((n, i) => (
        <GridNode key={i} n={n} delay={0.08 + i * 0.025} />
      ))}
    </motion.g>
  )
}

/* ═══════════════════════════════════════════════════════════
   STATE 2 — CONTROL PANEL
   Central diamond with snowflake, 5 pill sliders orbiting it
   connected by dashed lines, plus a code card.
═══════════════════════════════════════════════════════════ */

/* Snowflake / asterisk mark (8-spoke geometric) */
function Snowflake({ cx, cy, size = 18 }: { cx: number; cy: number; size?: number }) {
  const count = 8
  return (
    <g>
      {Array.from({ length: count }, (_, i) => {
        const a  = (i / count) * Math.PI * 2 - Math.PI / 2
        const a1 = a + 0.28
        const a2 = a - 0.28
        const inner = size * 0.28
        const outer = size
        const notch = size * 0.62
        return (
          <g key={i}>
            <line
              x1={cx + Math.cos(a) * inner} y1={cy + Math.sin(a) * inner}
              x2={cx + Math.cos(a) * outer} y2={cy + Math.sin(a) * outer}
              stroke={DARK} strokeWidth={2} strokeLinecap="round"
            />
            <line
              x1={cx + Math.cos(a1) * notch * 0.75} y1={cy + Math.sin(a1) * notch * 0.75}
              x2={cx + Math.cos(a)  * notch}         y2={cy + Math.sin(a)  * notch}
              stroke={DARK} strokeWidth={1.6} strokeLinecap="round"
            />
            <line
              x1={cx + Math.cos(a2) * notch * 0.75} y1={cy + Math.sin(a2) * notch * 0.75}
              x2={cx + Math.cos(a)  * notch}         y2={cy + Math.sin(a)  * notch}
              stroke={DARK} strokeWidth={1.6} strokeLinecap="round"
            />
          </g>
        )
      })}
    </g>
  )
}

interface PillProps {
  x: number; y: number
  width?: number
  orange?: boolean
  thumb?: number   // 0–1 position on track
  delay?: number
}

function PillSlider({ x, y, width = 130, orange = false, thumb = 0.6, delay = 0 }: PillProps) {
  const h        = 28
  const midY     = y + h / 2
  const dot1x    = x + 14
  const dot2x    = x + 26
  const dot3x    = x + 38
  const trackX   = x + 52
  const trackEnd = x + width - 14
  const trackW   = trackEnd - trackX
  const thumbCx  = trackX + thumb * trackW
  const accent   = orange ? ORANGE : LIGHT

  return (
    <motion.g
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.45, ease: "easeOut" }}
    >
      {/* Pill body */}
      <rect x={x} y={y} width={width} height={h} rx={h / 2}
        fill="white" stroke={LIGHT} strokeWidth={1} />
      {/* Three indicator dots */}
      <circle cx={dot1x} cy={midY} r={4} fill={LIGHT} />
      <circle cx={dot2x} cy={midY} r={4} fill={LIGHT} />
      <circle cx={dot3x} cy={midY} r={4} fill={LIGHT} />
      {/* Track background */}
      <rect x={trackX} y={midY - 2} width={trackW} height={4} rx={2} fill="#ECECEC" />
      {/* Track fill */}
      <motion.rect
        x={trackX} y={midY - 2} height={4} rx={2} fill={accent}
        initial={{ width: 0 }}
        animate={{ width: thumb * trackW }}
        transition={{ delay: delay + 0.3, duration: 0.6, ease: "easeOut" }}
      />
      {/* Thumb */}
      <motion.circle
        cy={midY} r={6}
        fill={orange ? ORANGE : "white"}
        stroke={accent} strokeWidth={1.5}
        initial={{ cx: trackX }}
        animate={{ cx: thumbCx }}
        transition={{ delay: delay + 0.3, duration: 0.6, ease: "easeOut" }}
      />
    </motion.g>
  )
}

function CodeCard({ x, y, delay = 0 }: { x: number; y: number; delay?: number }) {
  const w = 175
  const lineWidths = [100, 78, 88, 18, 0, 72, 90]
  const lineColors = [DARK, MID, ORANGE, DARK, DARK, DARK, MID]
  return (
    <motion.g
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45 }}
    >
      <rect x={x} y={y} width={w} height={104} rx={6}
        fill="white" stroke={LIGHT} strokeWidth={1} />
      {/* Title bar */}
      <rect x={x} y={y} width={w} height={20} rx={6} fill="#F4F4F4" />
      <rect x={x} y={y + 14} width={w} height={6} fill="#F4F4F4" />
      <circle cx={x + 10} cy={y + 10} r={3.5} fill="#DCDCDC" />
      <circle cx={x + 22} cy={y + 10} r={3.5} fill="#DCDCDC" />
      <circle cx={x + 34} cy={y + 10} r={3.5} fill="#DCDCDC" />
      {/* Code lines (as colored rects) */}
      {lineWidths.map((lw, i) =>
        lw > 0 ? (
          <motion.rect
            key={i}
            x={x + 10 + (i === 2 ? 8 : i === 5 || i === 6 ? 6 : 0)}
            y={y + 28 + i * 11}
            width={lw} height={6} rx={2}
            fill={lineColors[i]} opacity={0.45}
            initial={{ width: 0 }}
            animate={{ width: lw }}
            transition={{ delay: delay + 0.2 + i * 0.05, duration: 0.3 }}
          />
        ) : null
      )}
    </motion.g>
  )
}

const CX = VW * 0.50
const CY = VH * 0.47
const DS = 52 // diamond half-size

const PILLS: PillProps[] = [
  { x: VW * 0.05, y: VH * 0.15, width: 130, orange: false, thumb: 0.70, delay: 0.10 },
  { x: VW * 0.05, y: VH * 0.47, width: 130, orange: false, thumb: 0.45, delay: 0.20 },
  { x: VW * 0.63, y: VH * 0.15, width: 130, orange: true,  thumb: 0.65, delay: 0.15 },
  { x: VW * 0.63, y: VH * 0.47, width: 130, orange: false, thumb: 0.38, delay: 0.25 },
  { x: VW * 0.05, y: VH * 0.76, width: 130, orange: false, thumb: 0.28, delay: 0.30 },
]

// Center of each pill for connecting lines
const pillCenter = (p: PillProps) => ({
  x: p.x + (p.width ?? 130) / 2,
  y: p.y + 14,
})

function ControlPanel() {
  return (
    <motion.g
      key="control-panel"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Outer dashed bounding rect */}
      <rect
        x={CX - 175} y={CY - 130}
        width={350} height={260} rx={4}
        fill="none" stroke={LIGHT} strokeWidth={1} strokeDasharray="4 5"
      />

      {/* Dashed connection lines: center → each pill */}
      {PILLS.map((p, i) => {
        const pc = pillCenter(p)
        return (
          <motion.line
            key={i}
            x1={CX} y1={CY}
            x2={pc.x} y2={pc.y}
            stroke={FAINT} strokeWidth={1} strokeDasharray="3 4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 + i * 0.07 }}
          />
        )
      })}

      {/* Diamond */}
      <motion.rect
        x={CX - DS / 2} y={CY - DS / 2}
        width={DS} height={DS} rx={4}
        fill="white" stroke={LIGHT} strokeWidth={1.5}
        style={{ rotate: "45deg", transformOrigin: `${CX}px ${CY}px` }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
      />

      {/* Snowflake icon */}
      <motion.g
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        style={{ transformOrigin: `${CX}px ${CY}px` }}
      >
        <Snowflake cx={CX} cy={CY} size={17} />
      </motion.g>

      {/* Pill sliders */}
      {PILLS.map((p, i) => (
        <PillSlider key={i} {...p} />
      ))}

      {/* Code card bottom-right */}
      <CodeCard x={VW * 0.63} y={VH * 0.62} delay={0.40} />
    </motion.g>
  )
}

/* ═══════════════════════════════════════════════════════════
   MAIN — cycles every 5 s between the two states
═══════════════════════════════════════════════════════════ */

export function HeroAnimation({ className }: { className?: string }) {
  const [state, setState] = useState<0 | 1>(0)

  useEffect(() => {
    const id = setInterval(() => setState(s => (s === 0 ? 1 : 0)), 5000)
    return () => clearInterval(id)
  }, [])

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      width={VW}
      height={VH}
      className={className}
      aria-hidden="true"
    >
      <AnimatePresence mode="wait">
        {state === 0 ? <DotGrid key="grid" /> : <ControlPanel key="panel" />}
      </AnimatePresence>
    </svg>
  )
}
