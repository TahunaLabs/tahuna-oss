import { LandingPage } from "@/components/landing/landing-page"
import { isAuthenticated } from "@/lib/auth-server"
import { PublicHome } from "@/components/landing/public-home"
import { redirect } from "next/navigation"

export default async function Home() {
  if (await isAuthenticated()) {
    redirect("/dashboard")
  }

  return <LandingPage />
  return <PublicHome />
}
