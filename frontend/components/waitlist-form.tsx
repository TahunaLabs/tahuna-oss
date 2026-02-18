"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { CheckCircle2 } from "lucide-react"

export function WaitlistForm() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500))

    setIsSubmitting(false)
    setIsSuccess(true)
  }

  if (isSuccess) {
    return (
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-secondary mb-6">
          <CheckCircle2 className="h-8 w-8 text-foreground" />
        </div>
        <h3 className="text-2xl font-medium mb-4">You're in.</h3>
        <p className="text-muted-foreground leading-relaxed max-w-md mx-auto mb-4">
          Thanks for joining the Markovi waitlist. As we open up early access, we'll prioritize people with concrete
          agent use-cases and share behind-the-scenes updates on the platform, the environments we're launching first,
          and opportunities to help shape The Layers.
        </p>
        <p className="text-sm text-muted-foreground italic">
          In the meantime, keep an eye on your inbox—and start thinking about what you want your agents to actually
          learn.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-5">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">
            Work email
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="you@company.com"
            required
            className="bg-background border-border"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="name" className="text-sm font-medium">
            Name
          </Label>
          <Input id="name" type="text" placeholder="Ada Lovelace" required className="bg-background border-border" />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <div className="space-y-2">
          <Label htmlFor="organization" className="text-sm font-medium">
            Organization
          </Label>
          <Input
            id="organization"
            type="text"
            placeholder="Company, lab, or project name"
            className="bg-background border-border"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="role" className="text-sm font-medium">
            Role
          </Label>
          <Input
            id="role"
            type="text"
            placeholder="e.g. ML engineer, founder, head of ops"
            className="bg-background border-border"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="usecase" className="text-sm font-medium">
          What do you want to teach your agents to do?
        </Label>
        <Textarea
          id="usecase"
          placeholder="Tell us about the workflows, tools, or domains where you want agents to learn and improve over time."
          rows={4}
          className="bg-background border-border resize-none"
        />
      </div>

      <div className="flex items-start gap-3">
        <Checkbox id="updates" className="mt-0.5" />
        <Label htmlFor="updates" className="text-sm text-muted-foreground font-normal cursor-pointer">
          I'd like early access and occasional product updates from Markovi.
        </Label>
      </div>

      <Button type="submit" size="lg" className="w-full rounded-full" disabled={isSubmitting}>
        {isSubmitting ? "Submitting…" : "Get in Touch"}
      </Button>
    </form>
  )
}
