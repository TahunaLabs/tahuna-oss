"use client"

import { useState } from "react"
import { ChevronDown, Circle, SlidersHorizontal, LayoutGrid, Bell, Plus, BarChart3 } from "lucide-react"
import { cn } from "@/lib/utils"

interface Issue {
  id: string
  key: string
  title: string
  status: "todo" | "in-progress" | "done"
  priority: 1 | 2 | 3
  date: string
  labels?: string[]
}

const mockIssues: Issue[] = [
  { id: "1", key: "TAH-18", title: "P2-DASHBOARD-29: Add environment config-file editor UI", status: "todo", priority: 2, date: "Mar 12" },
  { id: "2", key: "TAH-32", title: "P3-STORAGE-43: Add per-user artifact size limits", status: "todo", priority: 3, date: "Mar 12" },
  { id: "3", key: "TAH-31", title: "P3-CLI-42: Add tahuna pull command", status: "todo", priority: 3, date: "Mar 12", labels: ["tahuna pull"] },
  { id: "4", key: "TAH-30", title: "P3-DATA-41: Implement cross-environment data binding", status: "todo", priority: 3, date: "Mar 12" },
  { id: "5", key: "TAH-29", title: "P3-RUNTIME-40: Support custom Docker images", status: "todo", priority: 3, date: "Mar 12" },
  { id: "6", key: "TAH-28", title: "P3-ML-39: Add wandb-compatible SDK integration", status: "todo", priority: 3, date: "Mar 12" },
  { id: "7", key: "TAH-27", title: "P3-RUN-38: Add optional no-capacity queue UX", status: "todo", priority: 3, date: "Mar 12" },
  { id: "8", key: "TAH-26", title: "P3-SYNC-37: Add sync history and rollback commands", status: "todo", priority: 3, date: "Mar 12" },
  { id: "9", key: "TAH-25", title: "P3-SYNC-36: Implement chunked/resumable upload", status: "todo", priority: 3, date: "Mar 12" },
  { id: "10", key: "TAH-24", title: "P3-RUNTIME-35: Add pod heartbeat/liveness termination when sync stops", status: "todo", priority: 3, date: "Mar 12" },
  { id: "11", key: "TAH-23", title: "P3-RUNTIME-34: Add pod network restriction defaults", status: "todo", priority: 3, date: "Mar 12" },
]

export function IssuesView() {
  const [activeTab, setActiveTab] = useState("active")
  const [todoExpanded, setTodoExpanded] = useState(true)
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null)

  const todoIssues = mockIssues.filter((issue) => issue.status === "todo")

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-orange-500 text-ui-micro">
            🤠
          </div>
          <h1 className="text-sm font-medium text-foreground">Tahuna</h1>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground">
            <Bell className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Tabs and filters */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-1">
          <TabButton label="All issues" active={activeTab === "all"} onClick={() => setActiveTab("all")} />
          <TabButton label="Active" active={activeTab === "active"} onClick={() => setActiveTab("active")} />
          <TabButton label="Backlog" active={activeTab === "backlog"} onClick={() => setActiveTab("backlog")} />
          <button className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground">
            <SlidersHorizontal className="w-4 h-4" />
          </button>
          <button className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground relative">
            <SlidersHorizontal className="w-4 h-4" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-accent rounded-full" />
          </button>
          <button className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground">
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Issue list */}
      <div className="flex-1 overflow-y-auto">
        {/* Todo group */}
        <div>
          <button
            className="flex items-center gap-2 px-4 py-2 w-full hover:bg-secondary/50"
            onClick={() => setTodoExpanded(!todoExpanded)}
          >
            <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", !todoExpanded && "-rotate-90")} />
            <Circle className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Todo</span>
            <span className="text-xs text-muted-foreground">{todoIssues.length}</span>
          </button>

          {todoExpanded && (
            <div>
              {todoIssues.map((issue) => (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  selected={selectedIssue === issue.id}
                  onSelect={() => setSelectedIssue(issue.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface TabButtonProps {
  label: string
  active?: boolean
  onClick?: () => void
}

function TabButton({ label, active, onClick }: TabButtonProps) {
  return (
    <button
      className={cn(
        "px-3 py-1.5 text-sm rounded",
        active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
      )}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

interface IssueRowProps {
  issue: Issue
  selected?: boolean
  onSelect?: () => void
}

function IssueRow({ issue, selected, onSelect }: IssueRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2 hover:bg-secondary/50 cursor-pointer group",
        selected && "bg-secondary"
      )}
      onClick={onSelect}
    >
      {/* Checkbox (hidden by default, shown on hover) */}
      <div className="w-4 h-4 opacity-0 group-hover:opacity-100">
        <input type="checkbox" className="w-4 h-4 rounded border-border" />
      </div>

      {/* Priority */}
      <div className="flex items-center gap-0.5 text-muted-foreground">
        <BarChart3 className="w-4 h-4 rotate-180" />
      </div>

      {/* Issue key */}
      <span className="text-xs text-muted-foreground font-mono">{issue.key}</span>

      {/* Status circle */}
      <Circle className="w-4 h-4 text-muted-foreground" />

      {/* Title */}
      <span className="flex-1 text-sm text-foreground truncate">
        {issue.title.split(":")[0]}:
        {issue.labels?.map((label) => (
          <code key={label} className="mx-1 px-1.5 py-0.5 bg-secondary rounded text-xs">{label}</code>
        ))}
        {issue.title.split(":").slice(1).join(":")}
      </span>

      {/* Assignee */}
      <div className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center">
        <span className="text-ui-micro text-muted-foreground">👤</span>
      </div>

      {/* Date */}
      <span className="text-xs text-muted-foreground">{issue.date}</span>
    </div>
  )
}
