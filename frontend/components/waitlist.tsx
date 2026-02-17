import { WaitlistForm } from "./waitlist-form"

export function Waitlist() {
  return (
    <section id="waitlist" className="py-24 md:py-32 px-6 bg-card">
      <div className="mx-auto max-w-xl">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight mb-4 text-center">Join the Markovi Waitlist</h2>

        <p className="text-muted-foreground text-center mb-10 leading-relaxed">
          We're onboarding early partners who want to move beyond static prompts and into continuous learning: AI labs,
          infra teams, and ambitious startups building agentic products.
        </p>

        <div className="bg-background rounded-xl p-6 sm:p-8 border border-border">
          <WaitlistForm />
        </div>
      </div>
    </section>
  )
}
