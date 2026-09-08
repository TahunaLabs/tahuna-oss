const reasons = [
  {
    title: "No SSH or SCP",
    body: "Stop manually copying projects, configuring machines, and following remote log files every time you need a GPU.",
  },
  {
    title: "Reproducible environments",
    body: "Every run keeps its code, data, runtime configuration, metrics, and artifacts together so you can inspect what actually ran.",
  },
  {
    title: "No forgotten GPUs",
    body: "Compute is ephemeral and automatically terminated when the workload finishes, so idle machines do not keep running unnoticed.",
  },
] as const

export function LandingWhySection() {
  return (
    <section className="relative border-t border-border px-6 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 max-w-2xl">
          <p className="mb-3 text-xs uppercase tracking-ui-eyebrow text-muted-foreground">Less infrastructure glue</p>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">
            Keep your workflow.
            <br />
            Lose the manual setup.
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
