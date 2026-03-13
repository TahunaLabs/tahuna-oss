import Link from "next/link"

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 text-center">
      <div className="w-16 h-16 rounded-xl bg-emerald-600 flex items-center justify-center text-2xl font-bold text-white">
        T
      </div>
      <h1 className="text-4xl font-bold">Tahuna</h1>
      <p className="text-fd-muted-foreground max-w-lg text-lg">
        The compute platform for machine learning. Train, deploy, and manage
        your ML workloads with GPU-accelerated environments.
      </p>
      <div className="flex items-center gap-4">
        <Link
          href="/docs"
          className="rounded-lg bg-fd-primary px-6 py-3 text-sm font-medium text-fd-primary-foreground hover:bg-fd-primary/90"
        >
          Get Started
        </Link>
        <Link
          href="/docs/cli"
          className="rounded-lg border border-fd-border px-6 py-3 text-sm font-medium hover:bg-fd-accent"
        >
          CLI Reference
        </Link>
      </div>
    </main>
  )
}
