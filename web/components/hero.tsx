import { Section, SectionContainer } from "@/components/section"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import Link from "next/link"

export function Hero() {
  return (
    <Section variant="hero" className="relative overflow-hidden">
      {/* Decorative asterisk */}
      <div className="absolute top-8 right-8 text-primary text-5xl font-serif select-none hidden lg:block" aria-hidden="true">
        {"*"}
      </div>

      <SectionContainer>
        <div className="max-w-4xl">
          <h1 className="mb-10 font-serif text-5xl leading-display-tight tracking-tight text-foreground md:text-7xl lg:text-display-hero">
            <span className="italic">Engineered</span>
            <br />
            <span>For The Frontier</span>
          </h1>

          <div className="max-w-md">
            <p className="text-lg md:text-xl text-foreground/80 leading-relaxed mb-3">
              Tahuna is the frontier training substrate that lets you wield the full power of leading models.
            </p>
            <p className="text-base text-muted-foreground">
              Pay as you go, with no markup for individuals.
            </p>

            <Button variant="pill" size="lg" asChild className="mt-8 px-8 py-3.5 h-auto bg-primary/15 text-primary border-primary/30 hover:bg-primary/25">
              <Link href="/login">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </SectionContainer>
    </Section>
  )
}
