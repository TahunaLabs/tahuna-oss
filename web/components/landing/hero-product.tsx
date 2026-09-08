import type { ReactNode } from "react"

interface HeroProductProps {
  /** Re-mount key so the fade-in animation replays when the slide changes. */
  slideKey: number
  children: ReactNode
}

// Fixed-size product artwork (its width is set by the screen shell in
// hero-screens). The clip window is ~10% narrower than the artwork, so the
// screenshot reads as continuing past the right edge of the content column.
// Hidden below lg, where the hero is text-only.
export function HeroProduct({ slideKey, children }: HeroProductProps) {
  return (
    <div className="pointer-events-none hidden h-[42rem] w-[40rem] shrink-0 overflow-hidden lg:-mr-16 lg:block xl:-mr-24 xl:w-[47rem]">
      <div key={slideKey} aria-hidden className="animate-in fade-in duration-500">
        {children}
      </div>
    </div>
  )
}
