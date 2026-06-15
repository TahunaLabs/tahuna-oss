"use client"

import { parseAsStringLiteral, useQueryState } from "nuqs"

import { HillclimbView } from "@/components/features/dashboard/hillclimb-view"
import {
  useDashboardHillclimbSession,
  useDashboardHillclimbSessions,
} from "@/lib/dashboard-api"

const HILLCLIMB_DIRECTION_VALUES = ["minimize", "maximize"] as const
type HillclimbDirection = (typeof HILLCLIMB_DIRECTION_VALUES)[number]

type HillclimbContainerProps = {
  shouldLoadQueries: boolean
}

function HillclimbContainer({ shouldLoadQueries }: HillclimbContainerProps) {
  const [selectedSessionId, setSelectedSessionId] = useQueryState("hillclimb")
  const [metricName, setMetricName] = useQueryState("hillMetric")
  const [direction, setDirection] = useQueryState(
    "hillDirection",
    parseAsStringLiteral(HILLCLIMB_DIRECTION_VALUES),
  )

  const sessionResult = useDashboardHillclimbSessions(shouldLoadQueries)
  const sessions = sessionResult?.sessions
  const activeSessionId = sessions?.some((session) => session.session_id === selectedSessionId)
    ? selectedSessionId
    : sessions?.[0]?.session_id ?? null

  const detail = useDashboardHillclimbSession(activeSessionId, metricName, shouldLoadQueries)
  const effectiveDirection: HillclimbDirection = direction ?? detail?.inferred_direction ?? "minimize"

  return (
    <HillclimbView
      sessions={sessions}
      selectedSessionId={activeSessionId}
      detail={detail}
      metricName={detail?.objective_metric_name ?? metricName}
      direction={effectiveDirection}
      onSelectSession={(sessionId) => { void setSelectedSessionId(sessionId) }}
      onSelectMetric={(name) => { void setMetricName(name || null) }}
      onSelectDirection={(value) => { void setDirection(value) }}
    />
  )
}

export { HillclimbContainer, type HillclimbDirection }
