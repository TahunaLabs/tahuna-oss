import { LandingPage } from "@/components/landing/landing-page"
import { isAuthenticated } from "@/lib/auth-server"
import { redirect } from "next/navigation"

export default async function Home() {
  if (await isAuthenticated()) {
    redirect("/dashboard")
  }

  return <LandingPage />
}
