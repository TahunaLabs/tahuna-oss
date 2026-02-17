import { Header } from "@/components/header"
import { Hero } from "@/components/hero"
import { TerminalSection } from "@/components/terminal-section"
import { Manifesto } from "@/components/manifesto"
import { Layers } from "@/components/layers"
import { SocialSection } from "@/components/social-section"
import { Waitlist } from "@/components/waitlist"
import { Footer } from "@/components/footer"

export default function Home() {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <Hero />
        <TerminalSection />
        <Manifesto />
        <Layers />
        <div className="relative">
          <div className="absolute inset-0 bg-background/85" />
          <div className="relative">
            <SocialSection />
          </div>
        </div>
        <Waitlist />
      </main>
      <Footer />
    </div>
  )
}
