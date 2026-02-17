"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight, MessageSquare, FileText } from "lucide-react"

const projects = [
  {
    title: "Multi-agent reward signal propagation case",
    author: "researcher_x",
    avatar: "/avatars/a1.jpg",
    prompts: 4,
    files: 31,
    additions: 1896,
    deletions: 97,
    net: -65,
    badge: "ORACLE",
  },
  {
    title: "RL environment framework design and simulation sizing",
    author: "envbuilder",
    avatar: "/avatars/a2.jpg",
    prompts: 29,
    files: 51,
    additions: 543,
    deletions: 425,
    net: -170,
    badge: "ORACLE",
  },
  {
    title: "Cool effect build review and training files changed",
    author: "mlnugget",
    avatar: "/avatars/a3.jpg",
    prompts: 3,
    files: 5,
    additions: null,
    deletions: null,
    net: null,
    badge: null,
  },
  {
    title: "Add parallel reward correction agent with forced tool call",
    author: "nicolaygerold",
    avatar: "/avatars/a4.jpg",
    prompts: 1,
    files: 12,
    additions: 560,
    deletions: 9,
    net: -7,
    badge: null,
  },
]

export function SocialSection() {
  const [scrollIndex, setScrollIndex] = useState(0)

  const scrollLeft = () => {
    setScrollIndex(Math.max(0, scrollIndex - 1))
  }

  const scrollRight = () => {
    setScrollIndex(Math.min(projects.length - 1, scrollIndex + 1))
  }

  return (
    <section className="py-20 md:py-28 px-6 border-t border-border">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
          <div>
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">
              Social
            </p>
            <h2 className="text-3xl md:text-4xl font-serif tracking-tight text-foreground leading-tight">
              Explore
              <br />
              <span className="italic">With</span> Us
            </h2>
          </div>

          <div className="flex items-center gap-6">
            <p className="text-lg md:text-xl font-serif text-foreground/80">
              See how people are building with Markovi
            </p>
            <div className="hidden md:flex items-center gap-2">
              <button
                onClick={scrollLeft}
                className="p-2 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                aria-label="Scroll left"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={scrollRight}
                className="p-2 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                aria-label="Scroll right"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {projects.map((project, index) => (
            <div
              key={index}
              className="bg-card border border-border rounded-lg overflow-hidden flex flex-col min-h-[380px] relative group hover:border-foreground/20 transition-colors"
            >
              {/* Wave pattern background */}
              <div className="absolute inset-0 opacity-10">
                <svg className="w-full h-full" viewBox="0 0 400 400" preserveAspectRatio="none">
                  <path d="M0,100 Q100,80 200,100 T400,100" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-foreground" />
                  <path d="M0,120 Q100,100 200,120 T400,120" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-foreground" />
                  <path d="M0,140 Q100,120 200,140 T400,140" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-foreground" />
                  <path d="M0,160 Q100,140 200,160 T400,160" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-foreground" />
                  <path d="M0,180 Q100,160 200,180 T400,180" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-foreground" />
                </svg>
              </div>

              {/* Card content */}
              <div className="relative flex flex-col flex-1 p-5">
                <div className="flex-1 flex flex-col justify-center">
                  <h3 className="text-base font-serif text-foreground text-center leading-snug mb-3">
                    {project.title}
                  </h3>
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-muted" />
                    <span className="text-xs text-muted-foreground">{project.author}</span>
                  </div>
                </div>

                {/* Stats */}
                <div className="mt-auto pt-6 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MessageSquare className="h-3 w-3" />
                    <span>{project.prompts} prompts</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <FileText className="h-3 w-3" />
                      <span>{project.files} files</span>
                    </div>
                    {project.additions !== null && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-green-400">+{project.additions}</span>
                        {project.deletions !== null && (
                          <span className="text-red-400">-{project.deletions}</span>
                        )}
                      </div>
                    )}
                  </div>
                  {project.net !== null && (
                    <div className="flex items-center justify-between">
                      {project.badge && (
                        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground border border-border rounded px-2 py-0.5">
                          {project.badge}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">~{Math.abs(project.net)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
