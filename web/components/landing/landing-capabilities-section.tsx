const capabilities = [
  {
    name: "Tahuna Compute",
    label: "Train",
    body: "Post-train models and run sandboxed experiments on managed GPUs. Code, data, checkpoints, and metrics stay attached to the run that produced them.",
  },
  {
    name: "Tahuna Serve",
    label: "Serve",
    body: "Promote any checkpoint into a production inference endpoint in one step. No gap between the training run and the release.",
  },
  {
    name: "Tahuna Observability",
    label: "Observe",
    body: "Capture traces, feedback, evals, and outcomes from production — the evidence that decides what improves next.",
  },
  {
    name: "Tahuna Hillclimb",
    label: "Hillclimb",
    body: "Autonomous research on your models. Give an agent an objective and compute: it runs experiments, benchmarks them, keeps what moves the metric, and climbs.",
  },
] as const

export function LandingCapabilitiesSection() {
  return (
    <section id="capabilities" className="border-t border-border bg-muted/30 px-6 py-20 md:px-8 md:py-24">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-5">
          <p className="mb-3 text-xs uppercase tracking-ui-eyebrow text-muted-foreground">The Platform</p>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">
            Primitives for
            <br />
            Continual Learning
          </h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
            One loop that compounds. Train on managed GPUs, serve any checkpoint in production, observe what production tells you, and point Hillclimb at a metric to run autonomous research that climbs it.
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-2 lg:col-span-7">
          {capabilities.map((capability) => (
            <div key={capability.name} className="border-t border-border pt-5">
              <p className="font-mono text-xs uppercase tracking-ui-eyebrow text-muted-foreground">
                {capability.name}
              </p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{capability.label}</h3>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">{capability.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
