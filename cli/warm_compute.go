package main

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

const maxKeepWarmAfterSeconds = 60 * 60

func parseKeepWarmDuration(raw string) (int, error) {
	value := strings.ToLower(strings.TrimSpace(raw))
	if value == "" {
		return 0, fmt.Errorf("duration is required")
	}
	value = strings.ReplaceAll(value, " ", "")
	replacements := []struct {
		from string
		to   string
	}{
		{"minutes", "m"},
		{"minute", "m"},
		{"mins", "m"},
		{"min", "m"},
		{"seconds", "s"},
		{"second", "s"},
		{"secs", "s"},
		{"sec", "s"},
		{"hours", "h"},
		{"hour", "h"},
		{"hrs", "h"},
		{"hr", "h"},
	}
	for _, replacement := range replacements {
		value = strings.ReplaceAll(value, replacement.from, replacement.to)
	}
	if _, err := strconv.Atoi(value); err == nil {
		return 0, fmt.Errorf("duration must include a unit, for example 10m or 60s")
	}
	duration, err := time.ParseDuration(value)
	if err != nil || duration <= 0 {
		return 0, fmt.Errorf("invalid duration %q; use values like 10m, 60s, or 1h", raw)
	}
	seconds := int(duration.Round(time.Second).Seconds())
	if seconds <= 0 {
		return 0, fmt.Errorf("duration must be at least 1s")
	}
	if seconds > maxKeepWarmAfterSeconds {
		return 0, fmt.Errorf("duration must be <= %s", formatKeepWarmDuration(maxKeepWarmAfterSeconds))
	}
	return seconds, nil
}

func formatKeepWarmDuration(seconds int) string {
	if seconds <= 0 {
		return "0s"
	}
	if seconds%3600 == 0 {
		return fmt.Sprintf("%dh", seconds/3600)
	}
	if seconds%60 == 0 {
		return fmt.Sprintf("%dm", seconds/60)
	}
	return fmt.Sprintf("%ds", seconds)
}
