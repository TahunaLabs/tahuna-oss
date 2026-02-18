export function Manifesto() {
  const principles = [
    {
      number: "01",
      title: "Agents should get better the more they're used.",
      description:
        "Base models are broad but shallow. High-performance agents need to be specialized. We fine-tune models on your specific workflows, correcting mistakes and reinforcing success until they master your domain.",
    },
    {
      number: "02",
      title: "The environment matters as much as the model.",
      description:
        "You can't teach real-world skills with toy problems. We build realistic training environments that mimic your actual tools and edge cases, so agents learn to handle the messiness of production before they ever see a real user.",
    },
    {
      number: "03",
      title: "Reward design is the new prompt engineering.",
      description:
        "Prompts are brittle. Rewards are robust. We help you define what 'good' looks like—faster resolution, accurate data entry, safe tool use—and train agents to maximize those outcomes, discovering strategies that prompt engineering can't reach.",
    },
    {
      number: "04",
      title: "Learning must be safe, observable, and reversible.",
      description:
        "Autonomous agents need guardrails. Our training process includes safety checks, shadow deployment modes, and continuous evaluation to ensure your agents improve without going off the rails.",
    },
  ]

  return (
    <section id="manifesto" className="py-24 md:py-32 px-6 bg-card">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight mb-8">The Markovi Manifesto</h2>

        <p className="text-lg text-muted-foreground leading-relaxed mb-16 max-w-3xl">
          Foundation models gave us raw intelligence. But they're still generalists. The next wave belongs to
          agents that are experts in your business. We build the feedback loops that turn general intelligence into
          specialized mastery.
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
            If you're ready to move beyond prompting and start training, we're ready to help.
          </p>
        </div>
      </div>
    </section>
  )
}
