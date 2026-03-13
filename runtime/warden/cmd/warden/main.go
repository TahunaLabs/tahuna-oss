package main

import (
	"context"
	"os"

	"warden/internal/app"
)

func main() {
	os.Exit(app.Run(context.Background(), os.Stdout, os.Stderr))
}
