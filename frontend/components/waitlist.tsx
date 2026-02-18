import { WaitlistForm } from "./waitlist-form"

export function Waitlist() {
  return (
    <section id="waitlist" className="py-24 md:py-32 px-6 bg-card">
      <div className="mx-auto max-w-xl">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight mb-4 text-center">Get in Touch</h2>

        <p className="text-muted-foreground text-center mb-10 leading-relaxed">
          We are a service for fine-tuning agents. We work with AI labs, infra teams, and ambitious startups to build specific, high-performance agentic workflows.
        </p>

        <div className="bg-background rounded-xl p-6 sm:p-8 border border-border">
          <WaitlistForm />
        </div>
      </div>
    </section>
  )
}
