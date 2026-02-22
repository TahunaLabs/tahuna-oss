# Tahuna

Landing page for Tahuna — making agentic reasoner training accessible, fun, and scalable.

## Getting Started

```bash
cd apps/web
bun install
bun run dev
```

The dev server runs at [http://localhost:3000](http://localhost:3000).

## Tech Stack

- **Framework**: Next.js (App Router)
- **Styling**: Tailwind CSS
- **Language**: TypeScript

## Project Structure

```
frontend/
├── app/              # Next.js app router pages
├── components/       # React components
│   ├── header.tsx        # Navigation bar
│   ├── hero.tsx          # Hero section
│   ├── terminal-section.tsx  # Terminal demo + install command
│   ├── manifesto.tsx     # "Vibe Research" thesis
│   ├── layers.tsx        # "The Stack" — product layers
│   ├── waitlist.tsx      # Get in Touch form
│   ├── footer.tsx        # Footer
│   └── ui/               # Shared UI primitives
├── public/           # Static assets
└── lib/              # Utilities
```
