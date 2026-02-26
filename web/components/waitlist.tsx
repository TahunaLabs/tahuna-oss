import { Card, CardContent, CardDots, CardHeader, CardTitle } from "@/components/ui/card"
import { Section, SectionContainer } from "@/components/ui/section"
import { SectionHeading } from "@/components/ui/section-heading"
import { WaitlistForm } from "./waitlist-form"

export function Waitlist() {
  return (
    <Section variant="blurred" id="waitlist">
      <SectionContainer size="sm">
        <SectionHeading variant="medium" className="mb-4 text-center">
          Get in Touch
        </SectionHeading>

        <p className="text-muted-foreground text-center mb-10 leading-relaxed">
          We are a service for fine-tuning agents. We work with AI labs, infra teams, and ambitious startups to build specific, high-performance agentic workflows.
        </p>

        <Card>
          <CardHeader>
            <CardDots />
            <CardTitle className="ml-2">Contact</CardTitle>
          </CardHeader>
          <CardContent className="p-6 sm:p-8">
            <WaitlistForm />
          </CardContent>
        </Card>
      </SectionContainer>
    </Section>
  )
}
