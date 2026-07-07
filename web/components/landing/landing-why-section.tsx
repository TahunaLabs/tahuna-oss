const reasons = [
  {
    title: "Capture the real signal",
    body: "The best training signal is hidden in how people use your product: retries, edits, accepts, rejections, evals, and completed tasks. Tahuna captures this signal and turns it into a powerful engine for improvement.",
  },
  {
    title: "Shape model behavior",
    body: "Model behavior is something you shape. Tahuna starts with the primitives to run, compare, auto-research, and promote improvements under your control.",
  },
  {
    title: "Compounding intelligence",
    body: "Move beyond one-off model updates. Every run, eval, prompt, and snapshot becomes part of an improvement loop that compounds over time.",
  },
] as const

export function LandingWhySection() {
  return (
    <section className="relative border-t border-border px-6 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 max-w-2xl">
          <p className="mb-3 text-xs uppercase tracking-ui-eyebrow text-muted-foreground">Build the AI that no one can replicate</p>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">
            From static models
            <br />
            to compounding intelligence
          </h2>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {reasons.map((reason) => (
            <div key={reason.title} className="border-t border-border pt-5">
              <h3 className="text-xl font-semibold tracking-tight text-foreground">{reason.title}</h3>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{reason.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
