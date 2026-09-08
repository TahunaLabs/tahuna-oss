// Oversized, faint wordmark anchoring the footer. Its fluid size has no Tailwind
// utility (an arbitrary value would be flagged), so the clamp lives here in one
// decorative component rather than inline in the footer.
export function FooterWordmark() {
  return (
    <div
      className="pointer-events-none -mt-20 select-none overflow-hidden text-center"
      style={{ paddingBottom: "clamp(2rem, 4vw, 4rem)" }}
    >
      <p
        className="whitespace-nowrap font-semibold leading-none tracking-normal text-background/10"
        style={{ fontSize: "clamp(8rem, 18vw, 18rem)", transform: "translateY(22%)" }}
      >
        Tahuna
      </p>
    </div>
  )
}
