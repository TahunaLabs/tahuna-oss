import { Header } from "@/components/header"
import { Hero } from "@/components/hero"
import { TerminalSection } from "@/components/terminal-section"
import { SocialSection } from "@/components/social-section"
import { NewsSection } from "@/components/news-section"
import { TestimonialsSection } from "@/components/testimonials-section"
import { Footer } from "@/components/footer"

export default function Home() {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <Hero />
        <TerminalSection />
        <div className="relative">
          <div className="absolute inset-0 bg-background/85" />
          <div className="relative">
            <SocialSection />
            <NewsSection />
            <TestimonialsSection />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
