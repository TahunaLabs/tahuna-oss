import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(timestamp?: number) {
  if (!timestamp) return "—"
  return new Date(timestamp).toLocaleString()
}
