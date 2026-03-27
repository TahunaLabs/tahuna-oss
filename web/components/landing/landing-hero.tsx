import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"

export function LandingHero() {
  return (
    <section className="relative overflow-hidden px-6 py-20 md:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-5xl">
          <h1 className="mb-10 font-serif text-5xl leading-display-tight tracking-tight text-foreground md:text-7xl xl:text-8xl">
            AGI is not a single Oracle.
            <br />
            <span className="italic">It&apos;s billions of species.</span>
          </h1>

          <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-xl">
              <p className="text-lg leading-relaxed text-foreground/85 md:text-xl">
                The future of artificial intelligence is a wide field of specialized systems. Training them should be
                easily accessible.
              </p>
            </div>

            <Button asChild variant="outline" size="lg" className="self-start rounded-full px-8">
              <Link href="/login">
                Try it
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
