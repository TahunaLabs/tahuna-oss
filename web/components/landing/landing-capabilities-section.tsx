const capabilities = [
  {
    name: "Tahuna Sync",
    label: "Sync your project",
    body: "Upload code and data as reproducible, content-addressed snapshots. Only changed files need to move between runs.",
  },
  {
    name: "Tahuna Compute",
    label: "Provision compute",
    body: "Select a runtime and GPU. Tahuna creates the remote machine and reconstructs the environment your project needs.",
  },
  {
    name: "Tahuna Runtime",
    label: "Run your workload",
    body: "Execute your Python entrypoint while authenticated logs and metrics stream back to the control plane.",
  },
  {
    name: "Tahuna Results",
    label: "Keep the results",
    body: "Persist checkpoints and output artifacts with the run, then terminate the compute automatically when the work is done.",
  },
] as const

export function LandingCapabilitiesSection() {
  return (
    <section id="capabilities" className="border-t border-border bg-muted/30 px-6 py-20 md:px-8 md:py-24">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-5">
          <p className="mb-3 text-xs uppercase tracking-ui-eyebrow text-muted-foreground">How it works</p>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">
            From local code
            <br />
            to a finished GPU run
          </h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
            Keep your existing Python project and training framework. Tahuna handles the infrastructure surrounding
            each run.
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
