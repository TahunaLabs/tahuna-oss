package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"github.com/manifoldco/promptui"
	"io"
	"mime"
	"net"
	"net/http"
	neturl "net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unicode/utf8"
	"unsafe"
)

func printSuccessLine(message string) {
	fmt.Printf("%s✓%s %s\n", cAmpGreen, cReset, message)
}

func monitorRun(runID string, interval int) error {
	return monitorRunWithOptions(runID, interval, false)
}

func monitorRunWithLogs(runID string, interval int) error {
	return monitorRunWithOptions(runID, interval, true)
}

func monitorRunWithOptions(runID string, interval int, streamLogs bool) error {
	dynamic := supportsDynamicStatus()
	if streamLogs {
		dynamic = false
	}
	const maxConsecutivePollErrors = 12
	anchored := false
	headerPrinted := false
	lastStatus := ""
	consecutivePollErrors := 0
	seenLogLines := map[string]struct{}{}
	logFetchWarned := false

	for {
		resp, err := doJSON(http.MethodGet, "/runs/"+runID, nil)
		if err != nil {
			if isRetryableRunPollError(err) {
				consecutivePollErrors++
				fmt.Printf(
					"%swarning:%s unable to poll run status (%v); retrying in %ds (%d/%d)\n",
					cAmpGold,
					cReset,
					err,
					interval,
					consecutivePollErrors,
					maxConsecutivePollErrors,
				)
				if consecutivePollErrors >= maxConsecutivePollErrors {
					return fmt.Errorf(
						"run status polling failed %d times in a row: %w",
						consecutivePollErrors,
						err,
					)
				}
				time.Sleep(time.Duration(interval) * time.Second)
				continue
			}
			return err
		}
		if consecutivePollErrors > 0 {
			fmt.Printf("%sinfo:%s recovered run status polling\n", cAmpMuted, cReset)
			consecutivePollErrors = 0
		}
		status := asString(resp["status"])
		if status == "" {
			status = "queued"
		}
		errMsg := asString(resp["error"])

		if streamLogs {
			if !headerPrinted {
				printPanel(
					"Tahuna",
					[]string{
						fmt.Sprintf("%s>%s Tahuna train", cAmpGold, cReset),
						"",
						fmt.Sprintf("  %sMonitoring run lifecycle...%s", cAmpMuted, cReset),
						fmt.Sprintf("  %s>%s Run ID %s", cAmpGreen, cReset, runID),
						fmt.Sprintf("  %s>%s Dashboard %s", cAmpGreen, cReset, runDashboardURL(runID)),
					},
					"",
					"",
				)
				headerPrinted = true
			}
			if status != lastStatus {
				fmt.Printf("Status: %s\n", status)
				lastStatus = status
			}

			logResp, logErr := doJSON(http.MethodGet, "/runs/"+runID+"/logs", nil)
			if logErr != nil {
				if !logFetchWarned {
					fmt.Printf("%swarning:%s unable to stream logs yet (%v)\n", cAmpGold, cReset, logErr)
					logFetchWarned = true
				}
			} else {
				for _, line := range parseRecentRunLogs(logResp) {
					key := runtimeLogLineKey(line)
					if _, exists := seenLogLines[key]; exists {
						continue
					}
					seenLogLines[key] = struct{}{}
					fmt.Println(formatRuntimeLogLine(line))
				}
			}

			if isTerminalRunStatus(status) {
				if errMsg != "" {
					fmt.Printf("%sError:%s %s\n", cAmpRed, cReset, errMsg)
				}
				break
			}
			time.Sleep(time.Duration(interval) * time.Second)
			continue
		}

		if dynamic {
			if anchored {
				// Restore cursor to the first run panel render and clear below it.
				fmt.Print("\033[u\033[J")
			} else {
				// Save cursor so subsequent updates can redraw in place.
				fmt.Print("\033[s")
				anchored = true
			}
		}

		printRunPanel(runID, status, errMsg)
		if isTerminalRunStatus(status) {
			break
		}
		time.Sleep(time.Duration(interval) * time.Second)
	}
	return nil
}

func isRetryableRunPollError(err error) bool {
	if err == nil {
		return false
	}
	var netErr net.Error
	if errors.As(err, &netErr) {
		return true
	}
	var apiErr *apiRequestError
	if errors.As(err, &apiErr) {
		return apiErr.status >= 500 || apiErr.status == http.StatusTooManyRequests
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "api response was not json")
}

func printRunPanel(runID, status, errMsg string) {
	statusColor := cAmpGold
	if status == "running" || status == "completed" {
		statusColor = cAmpGreen
	}
	lines := []string{
		fmt.Sprintf("%s>%s Tahuna run watch --id %s", cAmpGold, cReset, runID),
		"",
		fmt.Sprintf("  %sMonitoring run lifecycle...%s", cAmpMuted, cReset),
		"",
		fmt.Sprintf("  %s✓%s Status %s%s%s", cAmpGreen, cReset, statusColor, status, cReset),
		fmt.Sprintf("  %s>%s Last update %s", cAmpGreen, cReset, time.Now().Format(time.RFC3339)),
	}
	if errMsg != "" {
		lines = append(lines, fmt.Sprintf("  %s>%s Error %s", cAmpGold, cReset, errMsg))
	}
	printPanel("Tahuna", lines, "", "")
}

func printPanel(title string, lines []string, leftFooter, rightFooter string) {
	width := panelWidth()
	border := strings.Repeat("─", width-2)

	fmt.Printf("\n%s╭%s╮%s\n", cAmpTeal, border, cReset)
	printPanelLine(width, fmt.Sprintf("%s● ● ●%s  %s%s%s", cAmpMuted, cReset, cAmpText, title, cReset))
	fmt.Printf("%s├%s┤%s\n", cAmpTeal, border, cReset)
	for _, line := range lines {
		printPanelLine(width, line)
	}
	if strings.TrimSpace(leftFooter) != "" || strings.TrimSpace(rightFooter) != "" {
		fmt.Printf("%s├%s┤%s\n", cAmpTeal, border, cReset)
		footerGap := width - 4 - visibleLen(leftFooter) - visibleLen(rightFooter)
		if footerGap < 1 {
			footerGap = 1
		}
		printPanelLine(width, leftFooter+strings.Repeat(" ", footerGap)+rightFooter)
	}
	fmt.Printf("%s╰%s╯%s\n", cAmpTeal, border, cReset)
}

func printPanelLine(width int, content string) {
	space := width - 6 - visibleLen(content)
	if space < 0 {
		space = 0
	}
	fmt.Printf("%s│%s  %s%s  %s│%s\n", cAmpTeal, cReset, content, strings.Repeat(" ", space), cAmpTeal, cReset)
}

func visibleLen(s string) int {
	n := 0
	for i := 0; i < len(s); {
		if s[i] == 0x1b {
			for i < len(s) && s[i] != 'm' {
				i++
			}
			if i < len(s) {
				i++
			}
			continue
		}
		_, size := utf8.DecodeRuneInString(s[i:])
		n++
		i += size
	}
	return n
}

func panelWidth() int {
	cols := terminalColumns()
	if cols <= 0 {
		cols = 100
	}

	// Keep the panel readable on small terminals and avoid getting too wide.
	width := cols - 2
	if width < 72 {
		width = 72
	}
	if width > 120 {
		width = 120
	}
	return width
}

func terminalColumns() int {
	if v := strings.TrimSpace(os.Getenv("COLUMNS")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}

	type winsize struct {
		Row    uint16
		Col    uint16
		Xpixel uint16
		Ypixel uint16
	}
	ws := winsize{}
	_, _, errno := syscall.Syscall(
		syscall.SYS_IOCTL,
		uintptr(os.Stdout.Fd()),
		uintptr(syscall.TIOCGWINSZ),
		uintptr(unsafe.Pointer(&ws)),
	)
	if errno == 0 && ws.Col > 0 {
		return int(ws.Col)
	}
	return 0
}

type catalogGPU struct {
	ID           string
	DisplayName  string
	MaxGPUCount  int
	MemoryGB     int
	PricePerHour float64
}

func parseCatalogGPUs(resp map[string]any) []catalogGPU {
	gpuRaw, ok := resp["gpus"].([]any)
	if !ok {
		return nil
	}
	gpus := make([]catalogGPU, 0, len(gpuRaw))
	for _, raw := range gpuRaw {
		switch row := raw.(type) {
		case map[string]any:
			id := strings.TrimSpace(asString(row["id"]))
			display := strings.TrimSpace(asString(row["display_name"]))
			if display == "" {
				display = id
			}
			if id == "" {
				id = display
			}
			if id == "" {
				continue
			}
			price, _ := asFloat64(row["price_per_hour"])
			gpus = append(gpus, catalogGPU{
				ID:           id,
				DisplayName:  display,
				MaxGPUCount:  int(asInt64(row["max_gpu_count"])),
				MemoryGB:     int(asInt64(row["memory_gb"])),
				PricePerHour: price,
			})
		default:
			id := strings.TrimSpace(asString(raw))
			if id == "" {
				continue
			}
			gpus = append(gpus, catalogGPU{
				ID:           id,
				DisplayName:  id,
				MaxGPUCount:  0,
				MemoryGB:     0,
				PricePerHour: 0,
			})
		}
	}
	sort.Slice(gpus, func(i, j int) bool {
		return strings.ToLower(gpus[i].DisplayName) < strings.ToLower(gpus[j].DisplayName)
	})
	return gpus
}

func fetchCatalog() ([]string, map[string][]string, error) {
	resp, err := doJSON(http.MethodGet, "/catalog", nil)
	if err != nil {
		return nil, nil, err
	}
	parsedGpus := parseCatalogGPUs(resp)
	if len(parsedGpus) == 0 {
		return nil, nil, errors.New("invalid catalog response: gpus missing")
	}
	gpus := make([]string, 0, len(parsedGpus))
	for _, gpu := range parsedGpus {
		gpus = append(gpus, gpu.ID)
	}

	imagesRaw, ok := resp["images"].(map[string]any)
	if !ok {
		return nil, nil, errors.New("invalid catalog response: images missing")
	}

	versionsByFramework := map[string][]string{}
	for framework, versionsAny := range imagesRaw {
		versionsMap, ok := versionsAny.(map[string]any)
		if !ok {
			continue
		}
		versions := make([]string, 0, len(versionsMap))
		for v := range versionsMap {
			versions = append(versions, v)
		}
		sort.Strings(versions)
		versionsByFramework[framework] = versions
	}
	return gpus, versionsByFramework, nil
}

func fetchCatalogGPUByID() (map[string]catalogGPU, error) {
	resp, err := doJSON(http.MethodGet, "/catalog", nil)
	if err != nil {
		return nil, err
	}
	entries := parseCatalogGPUs(resp)
	if len(entries) == 0 {
		return nil, errors.New("invalid catalog response: gpus missing")
	}
	out := make(map[string]catalogGPU, len(entries))
	for _, entry := range entries {
		out[strings.ToLower(strings.TrimSpace(entry.ID))] = entry
		if strings.TrimSpace(entry.DisplayName) != "" {
			out[strings.ToLower(strings.TrimSpace(entry.DisplayName))] = entry
		}
	}
	return out, nil
}

func validateGPUSelection(gpuType string, gpuCount int) error {
	trimmedType := strings.TrimSpace(gpuType)
	if trimmedType == "" || gpuCount <= 0 {
		return nil
	}
	entries, err := fetchCatalogGPUByID()
	if err != nil {
		return nil
	}
	entry, ok := entries[strings.ToLower(trimmedType)]
	if !ok {
		return fmt.Errorf("GPU type %q is not available. Run `tahuna catalog gpus`.", trimmedType)
	}
	if entry.MaxGPUCount > 0 && gpuCount > entry.MaxGPUCount {
		return fmt.Errorf("Max GPU count for %s is %d.", trimmedType, entry.MaxGPUCount)
	}
	return nil
}

func resolveEffectiveGPUTypeForEnvironment(environmentID, overrideType string) (string, error) {
	if strings.TrimSpace(overrideType) != "" {
		return strings.TrimSpace(overrideType), nil
	}
	resp, err := doJSON(http.MethodGet, "/environments/"+environmentID, nil)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(asString(resp["gpu_type"])), nil
}

func humanSize(bytes int64) string {
	if bytes <= 0 {
		return "0B"
	}
	units := []string{"B", "KB", "MB", "GB", "TB"}
	size := float64(bytes)
	unit := 0
	for size >= 1024 && unit < len(units)-1 {
		size /= 1024
		unit++
	}
	if unit == 0 {
		return fmt.Sprintf("%d%s", int64(size), units[unit])
	}
	return fmt.Sprintf("%.1f%s", size, units[unit])
}

func promptString(label, defaultValue string) string {
	validate := func(input string) error {
		if strings.TrimSpace(input) == "" && defaultValue == "" {
			return errors.New("value is required")
		}
		return nil
	}

	prompt := promptui.Prompt{
		Label:    label,
		Default:  defaultValue,
		Validate: validate,
		Templates: &promptui.PromptTemplates{
			Prompt:  "{{ . }} ",
			Success: "✓ {{ . }} ",
		},
	}

	value, err := prompt.Run()
	must(err)
	value = strings.TrimSpace(value)
	if value == "" {
		return defaultValue
	}
	return value
}

func promptInt(label string, defaultValue int) int {
	for {
		raw := promptString(label, strconv.Itoa(defaultValue))
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 {
			fmt.Println("Please enter a valid positive number.")
			continue
		}
		return value
	}
}

func promptChoice(label string, options []string, defaultIndex int) string {
	if len(options) == 0 {
		must(errors.New("no options available for " + label))
	}
	prompt := promptui.Select{
		Label:     label,
		Items:     options,
		CursorPos: defaultIndex,
		HideHelp:  true,
		Size:      10,
		Templates: &promptui.SelectTemplates{
			Label:    "{{ . }}",
			Active:   fmt.Sprintf("%s>%s {{ . }}", cAmpGold, cReset),
			Inactive: fmt.Sprintf("%s  {{ . }}%s", cAmpMuted, cReset),
			Selected: "✓ {{ .Label }}: {{ . }}",
		},
	}
	_, value, err := prompt.Run()
	must(err)
	return value
}

func sortedKeys(m map[string][]string) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func uploadFileToSignedURL(path, rawURL string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return err
	}

	req, err := http.NewRequest(http.MethodPut, rawURL, file)
	if err != nil {
		return err
	}
	req.ContentLength = info.Size()
	req.Header.Set("Content-Length", strconv.FormatInt(info.Size(), 10))
	if contentType := mime.TypeByExtension(filepath.Ext(path)); contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}

	client := &http.Client{Timeout: 30 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 400))
		return &uploadRequestError{
			status: resp.StatusCode,
			detail: strings.TrimSpace(string(raw)),
		}
	}
	return nil
}

func uploadFileToSignedURLWithRetry(path, rawURL string, attempts int) error {
	var lastErr error
	for i := 1; i <= attempts; i++ {
		if err := uploadFileToSignedURL(path, rawURL); err == nil {
			return nil
		} else {
			lastErr = err
			if !isRetryableUploadError(err) {
				return err
			}
		}
		if i < attempts {
			time.Sleep(time.Duration(1<<(i-1)) * time.Second)
		}
	}
	return lastErr
}

func uploadBytesToSignedURL(raw []byte, rawURL, contentType string) error {
	req, err := http.NewRequest(http.MethodPut, rawURL, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.ContentLength = int64(len(raw))
	req.Header.Set("Content-Length", strconv.Itoa(len(raw)))
	if strings.TrimSpace(contentType) != "" {
		req.Header.Set("Content-Type", contentType)
	}

	client := &http.Client{Timeout: 30 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 400))
		return &uploadRequestError{
			status: resp.StatusCode,
			detail: strings.TrimSpace(string(body)),
		}
	}
	return nil
}

func uploadBytesToSignedURLWithRetry(raw []byte, rawURL, contentType string, attempts int) error {
	var lastErr error
	for i := 1; i <= attempts; i++ {
		if err := uploadBytesToSignedURL(raw, rawURL, contentType); err == nil {
			return nil
		} else {
			lastErr = err
			if !isRetryableUploadError(err) {
				return err
			}
		}
		if i < attempts {
			time.Sleep(time.Duration(1<<(i-1)) * time.Second)
		}
	}
	return lastErr
}

type uploadRequestError struct {
	status int
	detail string
}

func (e *uploadRequestError) Error() string {
	return fmt.Sprintf("upload failed (%d): %s", e.status, e.detail)
}

func isRetryableUploadError(err error) bool {
	if err == nil {
		return false
	}
	var uploadErr *uploadRequestError
	if errors.As(err, &uploadErr) {
		switch uploadErr.status {
		case 408, 429:
			return true
		default:
			return uploadErr.status >= 500
		}
	}
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return true
	}
	if errors.Is(err, io.EOF) {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "connection reset")
}

type apiRequestError struct {
	status int
	detail string
}

func (e *apiRequestError) Error() string {
	return fmt.Sprintf("api error (%d): %s", e.status, e.detail)
}

func friendlyError(err error) string {
	var apiErr *apiRequestError
	if errors.As(err, &apiErr) {
		detail := strings.ToLower(apiErr.detail)
		switch {
		case apiErr.status == 401 && strings.Contains(detail, "expired"):
			return "Session expired. Run `tahuna login` to re-authenticate."
		case apiErr.status == 401:
			return "Not authenticated. Run `tahuna login` first."
		case apiErr.status == 403:
			return "Access denied."
		case apiErr.status == 404 && strings.Contains(detail, "environment"):
			return "Environment not found."
		case apiErr.status == 404 && strings.Contains(detail, "run"):
			return "Run not found."
		case apiErr.status == 404:
			return "Resource not found."
		case apiErr.status == 409:
			return apiErr.detail
		case apiErr.status == 400:
			return apiErr.detail
		case apiErr.status >= 500:
			return "Something went wrong. Try again or check status."
		}
		return ""
	}
	var netErr net.Error
	if errors.As(err, &netErr) {
		return "Cannot reach Tahuna backend. Check your connection."
	}
	return ""
}

func doJSON(method, path string, payload map[string]any) (map[string]any, error) {
	var body io.Reader
	if payload != nil {
		raw, err := json.Marshal(payload)
		if err != nil {
			return nil, err
		}
		body = bytes.NewReader(raw)
	}

	baseURL := apiURL()
	requestPath := normalizedAPIPath(path)
	if strings.HasSuffix(baseURL, apiPrefix) {
		requestPath = strings.TrimPrefix(requestPath, apiPrefix)
		if requestPath == "" {
			requestPath = "/"
		}
	}

	req, err := http.NewRequest(method, baseURL+requestPath, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if key := lookupConfigValue("TAHUNA_API_KEY"); key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var out map[string]any
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &out); err != nil {
			snippet := strings.TrimSpace(string(raw))
			if len(snippet) > 140 {
				snippet = snippet[:140] + "..."
			}
			return nil, fmt.Errorf(
				"api response was not JSON (%s %s -> %d). check TAHUNA_API_URL and that Tahuna web+convex are running. body starts with: %q",
				method,
				baseURL+requestPath,
				resp.StatusCode,
				snippet,
			)
		}
	} else {
		out = map[string]any{}
	}

	if resp.StatusCode >= 400 {
		msg := asString(out["detail"])
		if msg == "" {
			msg = string(raw)
		}
		return nil, &apiRequestError{
			status: resp.StatusCode,
			detail: msg,
		}
	}

	return out, nil
}

func lookupConfigValue(key string) string {
	if key == "" {
		return ""
	}
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}

	for _, path := range candidateEnvFiles() {
		if v, ok := readKeyFromEnvFile(path, key); ok {
			return v
		}
	}
	return ""
}

func candidateEnvFiles() []string {
	candidates := []string{}
	seen := map[string]struct{}{}
	add := func(path string) {
		if path == "" {
			return
		}
		clean := filepath.Clean(path)
		if _, ok := seen[clean]; ok {
			return
		}
		seen[clean] = struct{}{}
		candidates = append(candidates, clean)
	}

	// Primary CLI config file (global, CLI-only).
	add(defaultEnvFilePath())

	return candidates
}

func readKeyFromEnvFile(path, key string) (string, bool) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", false
	}
	prefix := key + "="
	for _, line := range strings.Split(string(raw), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		if !strings.HasPrefix(trimmed, prefix) {
			continue
		}
		value := strings.TrimSpace(strings.TrimPrefix(trimmed, prefix))
		value = strings.Trim(value, `"'`)
		if value == "" {
			return "", false
		}
		return value, true
	}
	return "", false
}

func normalizedAPIPath(path string) string {
	if path == "" {
		return apiPrefix
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	if strings.HasPrefix(path, apiPrefix+"/") || path == apiPrefix {
		return path
	}
	return apiPrefix + path
}

func browserBaseURL() string {
	if v := lookupConfigValue("TAHUNA_BROWSER_URL"); v != "" {
		base := strings.TrimRight(v, "/")
		base = strings.TrimSuffix(base, apiPrefix)
		return base
	}

	base := strings.TrimRight(apiURL(), "/")
	base = strings.TrimSuffix(base, apiPrefix)
	// Convex backend hosts serve /api routes but not Next.js app routes like /auth/cli.
	// Default to local web app URL unless browser base is explicitly configured.
	if strings.Contains(base, ".convex.cloud") {
		return defaultAPIURL
	}
	return base
}

func runDashboardURL(runID string) string {
	base := strings.TrimRight(browserBaseURL(), "/")
	if strings.TrimSpace(runID) == "" {
		return base + "/dashboard/runs"
	}
	return fmt.Sprintf("%s/dashboard/runs/%s", base, neturl.QueryEscape(runID))
}

func resolveLoginBrowserBaseURL() string {
	if v := lookupConfigValue("TAHUNA_BROWSER_URL"); strings.TrimSpace(v) != "" {
		return cleanBrowserBaseURL(v)
	}

	candidates := loginBrowserCandidates()
	for _, candidate := range candidates {
		if loginRouteAvailable(candidate) {
			return candidate
		}
	}

	if len(candidates) > 0 {
		return candidates[0]
	}
	return defaultAPIURL
}

func loginBrowserCandidates() []string {
	rawCandidates := []string{browserBaseURL(), defaultAPIURL}
	candidates := []string{}
	seen := map[string]struct{}{}
	for _, raw := range rawCandidates {
		clean := cleanBrowserBaseURL(raw)
		if clean == "" {
			continue
		}
		if _, exists := seen[clean]; exists {
			continue
		}
		seen[clean] = struct{}{}
		candidates = append(candidates, clean)
	}
	return candidates
}

func cleanBrowserBaseURL(raw string) string {
	base := strings.TrimSpace(strings.TrimRight(raw, "/"))
	base = strings.TrimSuffix(base, apiPrefix)
	return base
}

func loginRouteAvailable(base string) bool {
	client := &http.Client{Timeout: 3 * time.Second}
	req, err := http.NewRequest(http.MethodGet, cleanBrowserBaseURL(base)+"/auth/cli", nil)
	if err != nil {
		return false
	}

	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return false
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
	return !strings.Contains(strings.ToLower(string(body)), "no matching routes found")
}

func saveConfigValues(values map[string]string) error {
	if len(values) == 0 {
		return nil
	}

	path := defaultEnvFilePath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	existing, err := os.ReadFile(path)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}

	filtered := []string{}
	if len(existing) > 0 {
		for _, line := range strings.Split(string(existing), "\n") {
			trimmed := strings.TrimSpace(line)
			if trimmed == "" {
				continue
			}

			skip := false
			for key := range values {
				if strings.HasPrefix(trimmed, key+"=") {
					skip = true
					break
				}
			}
			if skip {
				continue
			}
			filtered = append(filtered, line)
		}
	}

	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		value := strings.TrimSpace(values[key])
		if value == "" {
			continue
		}
		filtered = append(filtered, key+"="+value)
	}

	output := strings.Join(filtered, "\n")
	if output != "" && !strings.HasSuffix(output, "\n") {
		output += "\n"
	}

	return os.WriteFile(path, []byte(output), 0o600)
}

func printJSON(v any) {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}

func mustParseFlags(fs *flag.FlagSet, args []string) {
	must(fs.Parse(args))
}

func asString(v any) string {
	if v == nil {
		return ""
	}
	s, ok := v.(string)
	if ok {
		return s
	}
	return fmt.Sprintf("%v", v)
}

func require(condition bool, msg string) {
	if condition {
		return
	}
	must(errors.New(msg))
}

func must(err error) {
	if err == nil {
		return
	}
	if msg := friendlyError(err); msg != "" {
		fmt.Fprintln(os.Stderr, "error:", msg)
	} else {
		fmt.Fprintln(os.Stderr, "error:", err)
	}
	os.Exit(1)
}
