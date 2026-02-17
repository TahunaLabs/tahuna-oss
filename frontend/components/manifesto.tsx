export function Manifesto() {
  const principles = [
    {
      number: "01",
      title: "Agents should get better the more they're used.",
      description:
        "Today's models reset to factory settings on every call. They never remember that your support workflow is weird, your Jira instance is messy, or your customers ask the same question five different ways. We believe production traffic should be training data, not waste heat. Every deployment should be a feedback loop.",
    },
    {
      number: "02",
      title: "The environment matters as much as the model.",
      description:
        "You can't teach real-world skills with toy problems. Agents need realistic environments: noisy customers, flaky APIs, messy enterprise tools, adversarial edge cases. The quality of the environment—and the evaluators inside it—will matter more than the architecture of the model itself.",
    },
    {
      number: "03",
      title: "Reward design is the new prompt engineering.",
      description:
        "Prompts nudge a single response. Rewards shape long-term behavior. We believe the real leverage lies in specifying what good looks like over time: faster resolution, happier users, fewer errors, lower costs. Markovi is a platform for encoding those goals into reward functions, and letting agents discover strategies we wouldn't think to hard-code.",
    },
    {
      number: "04",
      title: "Learning must be safe, observable, and reversible.",
      description:
        "Agents that learn autonomously must do so with guardrails: sandboxed simulations, gradual rollout, shadow modes, clear audit trails, and instant rollbacks. We're building RL infrastructure that teams can trust in regulated, high-stakes environments—not just in research demos.",
    },
  ]

  return (
    <section id="manifesto" className="py-24 md:py-32 px-6 bg-card">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight mb-8">The Markovi Manifesto</h2>

        <p className="text-lg text-muted-foreground leading-relaxed mb-16 max-w-3xl">
          Foundation models gave us raw intelligence. But they're still snapshots—frozen in time, blind to what happens
          after the response is sent. The next wave will belong to systems that keep learning from every interaction,
          every mistake, every edge case. That's what Markovi exists to build.
        </p>

        <div className="space-y-12">
          {principles.map((principle) => (
            <div key={principle.number} className="border-t border-border pt-8">
              <div className="flex gap-6">
                <span className="text-sm text-muted-foreground font-mono shrink-0">{principle.number}</span>
                <div>
                  <h3 className="text-lg font-medium mb-3">{principle.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{principle.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 pt-8 border-t border-border">
          <p className="text-lg italic text-muted-foreground leading-relaxed">
            If you believe AI should be less like a static API and more like a colleague that actually learns, you're in
            the right place.
          </p>
        </div>
      </div>
    </section>
  )
}
