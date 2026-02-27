import { Footer } from "@/components/footer"
import { Header } from "@/components/header"
import { Hero } from "@/components/hero"
import { Layers } from "@/components/layers"
import { Manifesto } from "@/components/manifesto"
import { TerminalSection } from "@/components/terminal-section"
import { Waitlist } from "@/components/waitlist"
import { isAuthenticated } from "@/lib/auth-server"
import { redirect } from "next/navigation"

export default async function Home() {
  if (await isAuthenticated()) {
    redirect("/dashboard")
  }

  return (
    <div className="min-h-screen landing-page-bg">
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
