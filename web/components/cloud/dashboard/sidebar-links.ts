import { BookOpen, FileText, Layers } from "lucide-react"

import { CLOUD_LINKS_CONFIG } from "@/cloud/links"
import type { DashboardNavDocItem } from "@/components/features/dashboard/sidebar"

export const CLOUD_DASHBOARD_DOCS_NAV: DashboardNavDocItem[] = [
  { icon: BookOpen, label: "Documentation", href: CLOUD_LINKS_CONFIG.docsUrl },
  { icon: FileText, label: "CLI reference", href: CLOUD_LINKS_CONFIG.cliReferenceUrl },
  { icon: Layers, label: "Changelog", href: CLOUD_LINKS_CONFIG.changelogUrl },
]
