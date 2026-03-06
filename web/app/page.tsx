import { Footer } from "@/components/footer"
import { Header } from "@/components/header"
import { Hero } from "@/components/hero"
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
    <div className="landing-theme min-h-screen landing-page-bg">
      <Header />
      <main>
        <Hero />
        <TerminalSection />
        <Manifesto />
        <Waitlist />
      </main>
      <Footer />
    </div>
  )
}
