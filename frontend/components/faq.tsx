import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

export function FAQ() {
  const faqs = [
    {
      question: "Is Markovi another foundation model?",
      answer:
        "No. We're not building a new base model—we're building the learning substrate on top of them. Markovi connects models, environments, rewards, and data into a continuous training loop.",
    },
    {
      question: "Who is Markovi for?",
      answer:
        "AI labs, infra teams, and startups that want agents to operate real workflows—support, ops, growth, logistics, internal tools—while continuously improving instead of staying frozen at deployment.",
    },
    {
      question: "When will early access start?",
      answer:
        "We're onboarding a small group of design partners first. If you have a clear use case and are willing to co-design environments and rewards with us, mention that in your waitlist note.",
    },
  ]

  return (
    <section id="faq" className="py-24 md:py-32 px-6">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight mb-10 text-center">FAQ</h2>

        <Accordion type="single" collapsible className="w-full">
          {faqs.map((faq, index) => (
            <AccordionItem key={index} value={`item-${index}`} className="border-border">
              <AccordionTrigger className="text-left text-base font-medium hover:no-underline">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">{faq.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}
