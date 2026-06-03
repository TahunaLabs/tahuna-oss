const capabilities = [
  {
    name: "Tahuna Compute",
    label: "Compute",
    body: "Run training and inference on managed GPUs Sandboxes for safe experimentation and debugging",
  },
  {
    name: "Tahuna Hillclimb",
    label: "Hillclimb",
    body: "Autonomous research to recursively improve model performance",
  },
  {
    name: "Tahuna Serve",
    label: "Serve",
    body: "Promote model snapshots into inference endpoints.",
  },
  {
    name: "Tahuna Lineage",
    label: "Lineage",
    body: "Track the code, data, metrics, checkpoints, and artifacts behind each result.",
  },
] as const

export function LandingCapabilitiesSection() {
  return (
    <section id="capabilities" className="border-t border-border bg-muted/30 px-6 py-20 md:px-8 md:py-24">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-5">
          <p className="mb-3 text-xs uppercase tracking-ui-eyebrow text-muted-foreground">Capabilities</p>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">
            Primitives for
            <br />
            Owned Intelligence
          </h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
            Start with the pieces that exist today: compute for training and serving, hillclimb for experiment search,
            and lineage for the evidence behind every result.
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
