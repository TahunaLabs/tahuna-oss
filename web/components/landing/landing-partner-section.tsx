import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { DotGrid } from "@/components/landing/section-decorations"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const steps = [
  {
    step: "Step 1",
    title: "AI Opportunity Audit",
    body: "We run a structured audit of how work moves through your product and organization — across teams, systems, and decision points. The goal is to pinpoint where a model that learns from your production signal reduces operational overhead, accelerates execution, or replaces manual coordination entirely.",
  },
  {
    step: "Step 2",
    title: "Architecture & Design",
    body: "Tahuna designs and builds the model-improvement loop that will power the workflow — integrating evals, reward logic, and your training code with the enterprise tools, data, and operational logic behind the process. You're kept in the loop the entire time.",
  },
  {
    step: "Step 3",
    title: "Production Deployment",
    body: "Tahuna deploys the loop into your enterprise stack, connecting it to live systems and workflows so the model starts improving on real production work. Everything is built on top of your existing software — no migrations required.",
  },
] as const

function DividerLabel({ children }: { children: string }) {
  return (
    <div className="mb-5 flex items-center gap-4">
      <span className="text-xs uppercase tracking-ui-eyebrow text-muted-foreground">{children}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

export function LandingPartnerSection() {
  return (
    <section id="partner" className="relative overflow-hidden border-t border-border px-6 py-20 md:px-8 md:py-24">
      <DotGrid className="right-0 top-16 h-64 w-1/3" />
      <div className="relative mx-auto max-w-7xl">
        <div className="mb-12 max-w-2xl">
          <p className="mb-3 text-xs uppercase tracking-ui-eyebrow text-muted-foreground">How we partner</p>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">
            Two ways to work
            <br />
            with Tahuna
          </h2>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
            Want us in the room shipping your first model, or the platform to build on your own? Either way you own the
            loop.
          </p>
        </div>

        <DividerLabel>Forward-deployed</DividerLabel>
        <div className="grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <Card key={s.step} variant="default" className="border-border bg-card/95">
              <CardContent className="p-8">
                <p className="text-xs uppercase tracking-ui-eyebrow text-muted-foreground">{s.step}</p>
                <h3 className="mt-3 text-xl font-semibold tracking-tight text-foreground">{s.title}</h3>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-6 flex justify-center md:justify-start">
          <Button asChild size="lg">
            <Link href="https://cal.com/monaimel/15min" target="_blank" rel="noreferrer">
              Talk to an engineer
              <ArrowRight />
            </Link>
          </Button>
        </div>

        <div className="mt-14">
          <DividerLabel>Self-serve</DividerLabel>
          <Card variant="default" className="border-border bg-card/95">
            <CardContent className="flex flex-col gap-6 p-8 md:flex-row md:items-center md:justify-between">
              <div className="max-w-xl">
                <h3 className="text-xl font-semibold tracking-tight text-foreground">Or use it however you want</h3>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  Bring your code, framework, and training loop. Full platform access, CLI, and docs — move at your own
                  pace, no calls required.
                </p>
              </div>
              <Button asChild size="lg" variant="outline" className="shrink-0">
                <Link href="/login">
                  Get started
                  <ArrowRight />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  )
}
