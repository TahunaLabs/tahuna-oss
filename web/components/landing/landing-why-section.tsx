const reasons = [
  {
    title: "Signal from real usage",
    body: "Benchmarks are a starting point. The durable signal comes from how your product is actually used: retries, edits, accepts, evals, and task outcomes.",
  },
  {
    title: "Steer the learning loop",
    body: "Model behavior is something you shape. Tahuna starts with the primitives to run, compare, and promote improvements under your control.",
  },
  {
    title: "Intelligence that compounds",
    body: "The stack stops being static. Training code, evals, prompts, and model snapshots become part of a repeatable loop that gets better with every iteration.",
  },
] as const

export function LandingWhySection() {
  return (
    <section className="border-t border-border px-6 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 max-w-2xl">
          <p className="mb-3 text-xs uppercase tracking-ui-eyebrow text-muted-foreground">Why it matters</p>
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
