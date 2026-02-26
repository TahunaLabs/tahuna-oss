import { Header } from "@/components/header"
import { Hero } from "@/components/hero"
import { TerminalSection } from "@/components/terminal-section"
import { Manifesto } from "@/components/manifesto"
import { Layers } from "@/components/layers"
import { Waitlist } from "@/components/waitlist"
import { Footer } from "@/components/footer"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

export default async function Home() {
  const cookieStore = await cookies()
  const cookieName = process.env.AUTH_COOKIE_NAME?.trim() || "tahuna_auth_token"
  if (cookieStore.get(cookieName)?.value) {
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
