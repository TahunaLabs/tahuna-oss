import { Header } from "@/components/header"
import { Hero } from "@/components/hero"
import { TerminalSection } from "@/components/terminal-section"
import { Manifesto } from "@/components/manifesto"
import { Layers } from "@/components/layers"
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
        <Waitlist />
      </main>
      <Footer />
    </div>
  )
}
