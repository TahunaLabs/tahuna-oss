const testimonials = [
  {
    quote:
      '"My first impressions of using @Markovi to build an RL training pipeline (working on an existing repo built be reward shaping): It feels way more agentic, it feels like I can let the agents/subagents run and it\'ll correctly come up with code reliably and consistently."',
    author: "TheAlexYao",
  },
  {
    quote:
      '"Tried Markovi in lieu of manual reward tuning. It makes me appreciate the level of polish Markovi brings! The whole tool really delivers a premium experience, and I pity whoever is stuck with manual configs."',
    author: "Petr Baudis",
  },
  {
    quote:
      '"We keep trying other training platforms, and keep coming back to Markovi. It\'s built different."',
    author: "Evan Owen",
  },
  {
    quote:
      '"umm ok @Markovi stop being so good - this data flow diagram is actually sick, and generated without me specifically asking for it"',
    author: "Adam Sorensen",
  },
  {
    quote:
      '"Tried @Markovi with GPT5 and Sonnet4. You guys put some juice into the integration. Hard to believe its running the same model under the hood as other platforms."',
    author: "Alfredo Sandoval",
  },
]

export function TestimonialsSection() {
  return (
    <section className="py-20 md:py-28 px-6 border-t border-border">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8">
          {testimonials.map((testimonial, index) => (
            <div key={index} className="flex flex-col">
              <p className="text-sm italic text-foreground/80 leading-relaxed flex-1">
                {testimonial.quote}
              </p>
              <p className="text-sm text-muted-foreground mt-4">
                {"-- "}{testimonial.author}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
