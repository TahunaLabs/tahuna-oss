export function Manifesto() {
  return (
    <section id="manifesto" className="py-24 md:py-32 px-6 bg-background/50 backdrop-blur-sm">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-serif italic tracking-tight mb-12 text-foreground">
          Vibe Research.
        </h2>

        <div className="space-y-6 text-lg text-muted-foreground leading-relaxed max-w-3xl">
          <p>
            You can&apos;t prompt your way into high-quality agentic behavior. Prompts are brittle.
            The more complex your system — the more steps, the more tools, the more edge cases — the
            faster a generic model drifts, hallucinates, or breaks.
          </p>

          <p>
            Reinforcement learning is the mechanism that changes this. It takes something that works
            &ldquo;okay&rdquo; in simple settings and makes it robust enough to handle long-horizon,
            multi-step tasks reliably. This is exactly how the frontier labs are building their next
            generation of models — and the results speak for themselves.
          </p>

          <p className="text-foreground font-medium">
            Markovi brings this capability to everyone. We make it possible to train, evaluate, and
            iterate on agentic reasoners — with clean reward signals, rigorous evaluation, and
            continuous improvement loops — without needing a research lab to do it.
          </p>

          <p>
            The recipe is becoming clear: RL, evaluators, synthetic data, and iterative refinement.
            We&apos;re making it accessible, fun, and scalable.
          </p>
        </div>

        <div className="mt-16 pt-8 border-t border-border">
          <p className="text-lg italic text-muted-foreground leading-relaxed">
            Two Senior ML Engineers. One mission: make the frontier accessible.
          </p>
        </div>
      </div>
    </section>
  )
}
