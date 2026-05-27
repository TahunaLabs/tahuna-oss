package main

import (
	"fmt"
	"strconv"
	"strings"
)

const maxKeepWarmAfterMinutes = 60

func parseKeepWarmMinutes(raw string) (float64, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return 0, fmt.Errorf("keep-warm minutes is required")
	}
	minutes, err := strconv.ParseFloat(value, 64)
	if err != nil || minutes <= 0 {
		return 0, fmt.Errorf("invalid keep-warm minutes %q; use a positive number like 0.5 or 10", raw)
	}
	if minutes > maxKeepWarmAfterMinutes {
		return 0, fmt.Errorf("keep-warm minutes must be <= %g", float64(maxKeepWarmAfterMinutes))
	}
	return minutes, nil
}

func formatKeepWarmMinutes(minutes float64) string {
	if minutes == 1 {
		return "1 minute"
	}
	return fmt.Sprintf("%g minutes", minutes)
}
