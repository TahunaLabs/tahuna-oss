import Link from "next/link"
import { ArrowRight, Plus } from "lucide-react"

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

const selfServeItems = [
  "Instant access, no sales call",
  "CLI & full documentation",
  "Bring your own framework",
  "Usage-based pricing",
] as const

function ColumnLabel({ children }: { children: string }) {
  return <p className="mb-6 text-xs uppercase tracking-ui-eyebrow text-muted-foreground">{children}</p>
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

        <Card variant="default" className="overflow-hidden border-border bg-card/95">
          <CardContent className="p-0">
            <div className="grid md:grid-cols-2">
              {/* Forward-deployed — hover to reveal each step */}
              <div className="flex flex-col border-b border-border p-8 md:border-b-0 md:border-r">
                <ColumnLabel>Forward-deployed</ColumnLabel>

                <div className="flex flex-col">
                  {steps.map((s) => (
                    <div
                      key={s.step}
                      tabIndex={0}
                      className="group border-b border-border/60 py-5 first:pt-0 last:border-b-0 last:pb-0 focus-visible:outline-none"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-ui-eyebrow text-muted-foreground">{s.step}</p>
                          <h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground">{s.title}</h3>
                        </div>
                        <Plus
                          aria-hidden
                          className="mt-1 hidden size-4 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:rotate-45 group-focus-visible:rotate-45 md:block"
                        />
                      </div>
                      <div className="grid grid-rows-[1fr] transition-[grid-template-rows] duration-300 ease-out md:grid-rows-[0fr] md:group-hover:grid-rows-[1fr] md:group-focus-visible:grid-rows-[1fr]">
                        <div className="overflow-hidden">
                          <p className="mt-3 text-sm leading-relaxed text-muted-foreground transition-opacity duration-300 md:opacity-0 md:group-hover:opacity-100 md:group-focus-visible:opacity-100">
                            {s.body}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-auto pt-8">
                  <Button asChild size="lg">
                    <Link href="https://cal.com/monaimel/15min" target="_blank" rel="noreferrer">
                      Talk to an engineer
                      <ArrowRight />
                    </Link>
                  </Button>
                </div>
              </div>

              {/* Self-serve */}
              <div className="flex flex-col p-8">
                <ColumnLabel>Self-serve</ColumnLabel>

                <h3 className="text-2xl font-semibold tracking-tight text-foreground">Use it however you want</h3>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  Bring your code, framework, and training loop. Full platform access, CLI, and docs — move at your own
                  pace, no calls required.
                </p>

                <ul className="mt-6 grid gap-3">
                  {selfServeItems.map((item) => (
                    <li
                      key={item}
                      className="border-b border-border/60 pb-2 text-sm text-foreground last:border-b-0 last:pb-0"
                    >
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-8">
                  <Button asChild size="lg" variant="outline">
                    <Link href="/login">
                      Get started
                      <ArrowRight />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
