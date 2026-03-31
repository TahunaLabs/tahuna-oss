"use client"

import { useQuery } from "convex/react"

import { api } from "@convex/_generated/api"
import { type EnvironmentRow, type ServeSnapshot } from "@/components/features/dashboard-model"
import { ServingView } from "@/components/features/dashboard/serving-view"

type Props = {
  shouldLoadQueries: boolean
}

type SyncedServingEnvironment = EnvironmentRow & {
  serve_snapshot: ServeSnapshot
}

function hasServeSnapshot(environment: EnvironmentRow): environment is SyncedServingEnvironment {
  return environment.serve_snapshot !== null
}

export function ServingContainer({ shouldLoadQueries }: Props) {
  const envResult = useQuery(api.environments.list, shouldLoadQueries ? {} : "skip") as
    | { environments: EnvironmentRow[] }
    | undefined

  const environments = envResult?.environments ?? []
  const syncedEnvironments = environments.filter(hasServeSnapshot)

  return (
    <ServingView
      environments={syncedEnvironments}
      loading={!shouldLoadQueries || envResult === undefined}
    />
  )
}
