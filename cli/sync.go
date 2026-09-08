package main

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

func runSyncWithStatus(environmentID string, scope syncScope) error {
	start := time.Now()
	dynamic := supportsDynamicStatus()
	options := syncOptions{
		logProgress:   true,
		dynamicStatus: dynamic,
	}
	cfg, err := validateProjectConfigWithStatus(environmentID, options)
	if err != nil {
		if dynamic {
			clearStatusLine()
		}
		return err
	}
	prepared, err := prepareSyncManifestsWithStatus(environmentID, scope, options)
	if err != nil {
		if dynamic {
			clearStatusLine()
		}
		return err
	}
	defer cleanupPreparedManifests(prepared)
	if err := finalizeSyncWithStatus(environmentID, cfg, prepared, options); err != nil {
		if dynamic {
			clearStatusLine()
		}
		return err
	}
	if dynamic {
		clearStatusLine()
	}
	printSuccessLine(fmt.Sprintf("sync complete (%s)", formatDuration(time.Since(start))))
	return nil
}

func syncIncremental(environmentID string, scope syncScope, options syncOptions) error {
	cfg, err := validateProjectConfigBindings(environmentID)
	if err != nil {
		return fmt.Errorf("project config validation failed: %w", err)
	}
	prepared, err := prepareSyncManifestsWithStatus(environmentID, scope, options)
	if err != nil {
		return err
	}
	defer cleanupPreparedManifests(prepared)
	return finalizeSyncWithStatus(environmentID, cfg, prepared, options)
}

func validateProjectConfigWithStatus(environmentID string, options syncOptions) (projectConfig, error) {
	configSpinner := newSyncPhaseSpinner("validating project config...", options)
	cfg, err := validateProjectConfigBindings(environmentID)
	if err != nil {
		configSpinner.StopError()
		return projectConfig{}, fmt.Errorf("project config validation failed: %w", err)
	}
	configSpinner.StopSuccess("validating project config")
	return cfg, nil
}

func prepareSyncManifestsWithStatus(environmentID string, scope syncScope, options syncOptions) ([]preparedManifest, error) {
	prepared := []preparedManifest{}

	if scope.code {
		codeSpinner := newSyncPhaseSpinner("syncing code...", options)
		codeManifest, err := prepareCodeManifest()
		if err != nil {
			codeSpinner.StopError()
			return nil, fmt.Errorf("code sync failed: %w", err)
		}
		if err := syncMissingBlobs(environmentID, codeManifest, nil, false); err != nil {
			codeSpinner.StopError()
			return nil, fmt.Errorf("%s sync failed: %w", codeManifest.kind, err)
		}
		codeSpinner.StopSuccess("syncing code")
		prepared = append(prepared, codeManifest)
	}

	if scope.data {
		dataSpinner := newSyncPhaseSpinner("syncing data...", options)
		dataManifest, err := prepareDataManifest()
		if err != nil {
			dataSpinner.StopError()
			return nil, fmt.Errorf("data sync failed: %w", err)
		}
		if err := syncMissingBlobs(environmentID, dataManifest, func(done, total int, phase string) {
			dataSpinner.SetMessage(formatDataSyncProgress(done, total, phase))
		}, false); err != nil {
			dataSpinner.StopError()
			return nil, fmt.Errorf("%s sync failed: %w", dataManifest.kind, err)
		}
		dataSpinner.StopSuccess("syncing data")
		prepared = append(prepared, dataManifest)
	}

	return prepared, nil
}

func buildSyncCommitPayload(environmentID string, prepared []preparedManifest, cfg projectConfig) (map[string]any, error) {
	commitPayload := map[string]any{
		"environment_id": environmentID,
		"framework":      strings.TrimSpace(cfg.Framework),
		"version":        strings.TrimSpace(cfg.FrameworkVersion),
		"python_version": strings.TrimSpace(cfg.PythonVersion),
		"gpu_type":       strings.TrimSpace(cfg.GPUType),
		"gpu_count":      cfg.GPUCount,
		"volume_gb":      cfg.VolumeGB,
	}
	for _, item := range prepared {
		commitPayload[item.kind+"_manifest_hash"] = item.hash
	}
	cmd, err := resolveTrainCommand(cfg)
	if err != nil {
		return nil, err
	}
	if len(cmd) > 0 {
		commitPayload["command"] = cmd
	}
	if cfg.TrainDependencyConfigured {
		commitPayload["train_dependency_group"] = normalizeDependencyGroup(cfg.TrainDependencyGroup)
	}
	if outputDir := strings.TrimSpace(cfg.OutputDir); outputDir != "" {
		commitPayload["output_dir"] = outputDir
	} else {
		commitPayload["output_dir"] = "outputs"
	}
	if hasServeSection(cfg) {
		serveSnapshot, err := resolveServeSnapshot(cfg)
		if err != nil {
			return nil, err
		}
		commitPayload["serve_snapshot"] = serveSnapshot
	}
	return commitPayload, nil
}

func finalizeSyncWithStatus(environmentID string, cfg projectConfig, prepared []preparedManifest, options syncOptions) error {
	commitSpinner := newSyncPhaseSpinner("finalizing sync...", options)
	commitPayload, err := buildSyncCommitPayload(environmentID, prepared, cfg)
	if err != nil {
		commitSpinner.StopError()
		return err
	}

	for _, item := range prepared {
		if err := uploadManifest(environmentID, item); err != nil {
			commitSpinner.StopError()
			return fmt.Errorf("%s sync failed: %w", item.kind, err)
		}
	}

	var commitErr error
	backoff := 250 * time.Millisecond
	for attempt := 0; attempt < 8; attempt++ {
		if _, commitErr = syncDoJSON(http.MethodPost, "/sync/commit", commitPayload); commitErr == nil {
			break
		}
		if !isMissingManifestCommitError(commitErr) {
			commitSpinner.StopError()
			return commitErr
		}
		// Re-upload manifests midway in case storage propagation lagged.
		if attempt == 3 {
			for _, item := range prepared {
				if err := uploadManifest(environmentID, item); err != nil {
					commitSpinner.StopError()
					return fmt.Errorf("%s sync failed: %w", item.kind, err)
				}
			}
		}
		if attempt < 7 {
			time.Sleep(backoff)
			if backoff < 2*time.Second {
				backoff *= 2
			}
		}
	}
	if commitErr != nil {
		// Last fallback: one more upload + one last commit try before giving up.
		for _, item := range prepared {
			if err := uploadManifest(environmentID, item); err != nil {
				commitSpinner.StopError()
				return fmt.Errorf("%s sync failed: %w", item.kind, err)
			}
		}
		if _, err := syncDoJSON(http.MethodPost, "/sync/commit", commitPayload); err != nil {
			commitSpinner.StopError()
			return err
		}
	}
	commitSpinner.StopSuccess("finalizing sync")

	for _, item := range prepared {
		if err := saveManifestCache(item); err != nil {
			return fmt.Errorf("%s sync failed: %w", item.kind, err)
		}
	}
	return nil
}

func cleanupPreparedManifests(prepared []preparedManifest) {
	for _, item := range prepared {
		if item.cleanup != nil {
			item.cleanup()
		}
	}
}

func formatDuration(d time.Duration) string {
	if d < time.Second {
		return fmt.Sprintf("%dms", d.Milliseconds())
	}
	return fmt.Sprintf("%.2fs", d.Seconds())
}

func supportsDynamicStatus() bool {
	if strings.EqualFold(strings.TrimSpace(os.Getenv("TERM")), "dumb") {
		return false
	}
	info, err := os.Stdout.Stat()
	if err != nil {
		return false
	}
	return (info.Mode() & os.ModeCharDevice) != 0
}

func printStatusLine(prefix, message string) {
	fmt.Printf("\r\033[2K%s%s%s %s", cAmpGreen, prefix, cReset, message)
}

func clearStatusLine() {
	fmt.Print("\r\033[2K")
}

func isMissingManifestCommitError(err error) bool {
	if err == nil {
		return false
	}
	var apiErr *apiRequestError
	if errors.As(err, &apiErr) {
		return apiErr.status == http.StatusBadRequest &&
			strings.Contains(strings.ToLower(apiErr.detail), "manifest not found in object storage")
	}
	return strings.Contains(strings.ToLower(err.Error()), "manifest not found in object storage")
}

func prepareCodeManifest() (preparedManifest, error) {
	cfg, err := loadProjectConfig()
	if err != nil {
		return preparedManifest{}, err
	}
	dataDir := strings.TrimSpace(cfg.DataDir)
	if dataDir == "" {
		dataDir = "data"
	}
	outputDir := strings.TrimSpace(cfg.OutputDir)
	if outputDir == "" {
		outputDir = "outputs"
	}
	cachePath := filepath.Join(projectStateDir, "sync_code_manifest.json")
	return buildManifest("code", cachePath, []string{dataDir, outputDir})
}

func prepareDataManifest() (preparedManifest, error) {
	cachePath := filepath.Join(projectStateDir, "sync_data_manifest.json")
	return buildManifest("data", cachePath, nil)
}

func buildManifest(kind, cachePath string, excludeDirs []string) (preparedManifest, error) {
	entries, filesByID, cleanup, err := collectManifestEntries(kind, excludeDirs)
	if err != nil {
		return preparedManifest{}, err
	}

	createdAt := time.Now().UnixMilli()
	if cached, cachedHash, cachedOK := loadManifestCache(cachePath); cachedOK {
		if cachedHash != "" && manifestEntriesEqual(cached.Entries, entries) {
			createdAt = cached.CreatedAt
		}
	}

	manifest := syncManifest{
		Version:   1,
		Type:      kind,
		CreatedAt: createdAt,
		Entries:   entries,
	}
	raw, hash, err := marshalAndHashManifest(manifest)
	if err != nil {
		return preparedManifest{}, err
	}

	return preparedManifest{
		kind:      kind,
		manifest:  manifest,
		hash:      hash,
		raw:       raw,
		cachePath: cachePath,
		filesByID: filesByID,
		cleanup:   cleanup,
	}, nil
}

func collectManifestEntries(kind string, excludeDirs []string) ([]syncManifestEntry, map[string]string, func(), error) {
	baseDir, err := os.Getwd()
	if err != nil {
		return nil, nil, nil, err
	}

	entries := []syncManifestEntry{}
	filesByID := map[string]string{}

	addEntry := func(fullPath, relPath string, fileInfo fs.FileInfo) error {
		hash, size, err := fileSHA256(fullPath)
		if err != nil {
			return err
		}
		if !isUploadableBlobSize(size) {
			return nil
		}
		normalized := filepath.ToSlash(relPath)
		entries = append(entries, syncManifestEntry{
			Path:   normalized,
			SHA256: hash,
			Size:   size,
			Mode:   uint32(fileInfo.Mode().Perm()),
		})
		if _, exists := filesByID[hash]; !exists {
			filesByID[hash] = fullPath
		}
		return nil
	}

	if kind == "data" {
		cfg, cfgErr := loadProjectConfig()
		if cfgErr != nil {
			return nil, nil, nil, cfgErr
		}
		resolvedDataDir := strings.TrimSpace(cfg.DataDir)
		if resolvedDataDir == "" {
			resolvedDataDir = "data"
		}
		info, statErr := os.Stat(resolvedDataDir)
		if statErr != nil {
			if errors.Is(statErr, os.ErrNotExist) {
				return entries, filesByID, nil, nil
			}
			return nil, nil, nil, statErr
		}
		if !info.IsDir() {
			return entries, filesByID, nil, nil
		}
		archiveEntry, archivePath, walkErr := buildDataArchiveEntry(resolvedDataDir)
		if walkErr != nil {
			return nil, nil, nil, walkErr
		}
		if archiveEntry == nil {
			return entries, filesByID, nil, nil
		}
		entries = append(entries, *archiveEntry)
		filesByID[archiveEntry.SHA256] = archivePath
		return entries, filesByID, func() {
			_ = os.Remove(archivePath)
		}, nil
	}

	normalizedExcludeDirs := make([]string, 0, len(excludeDirs))
	for _, dir := range excludeDirs {
		nd := filepath.Clean(dir)
		if filepath.IsAbs(nd) {
			if relDir, relErr := filepath.Rel(baseDir, nd); relErr == nil && relDir != "." && relDir != ".." && !strings.HasPrefix(relDir, ".."+string(filepath.Separator)) {
				nd = filepath.Clean(relDir)
			}
		}
		normalizedExcludeDirs = append(normalizedExcludeDirs, nd)
	}

	gitEntries, gitFilesByID, gitErr := collectCodeEntriesWithGitIgnore(baseDir, normalizedExcludeDirs)
	if gitErr == nil {
		if len(gitEntries) == 0 {
			return nil, nil, nil, errors.New("no code files found to sync")
		}
		sort.Slice(gitEntries, func(i, j int) bool { return gitEntries[i].Path < gitEntries[j].Path })
		return gitEntries, gitFilesByID, nil, nil
	}

	walkErr := filepath.WalkDir(baseDir, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path == baseDir {
			return nil
		}

		relPath, relErr := filepath.Rel(baseDir, path)
		if relErr != nil {
			return relErr
		}
		relPath = filepath.Clean(relPath)

		if d.IsDir() && shouldSkipCodePath(relPath, excludeDirs) {
			return filepath.SkipDir
		}
		if d.IsDir() {
			return nil
		}
		if shouldSkipCodePath(relPath, excludeDirs) {
			return nil
		}
		if !d.Type().IsRegular() || (d.Type()&os.ModeSymlink) != 0 {
			return nil
		}

		fileInfo, infoErr := d.Info()
		if infoErr != nil {
			return infoErr
		}
		return addEntry(path, relPath, fileInfo)
	})
	if walkErr != nil {
		return nil, nil, nil, walkErr
	}
	if len(entries) == 0 {
		return nil, nil, nil, errors.New("no code files found to sync")
	}

	sort.Slice(entries, func(i, j int) bool { return entries[i].Path < entries[j].Path })
	return entries, filesByID, nil, nil
}

func buildDataArchiveEntry(dataDir string) (*syncManifestEntry, string, error) {
	files, err := listDataFiles(dataDir)
	if err != nil {
		return nil, "", err
	}
	if len(files) == 0 {
		return nil, "", nil
	}
	if err := os.MkdirAll(projectStateDir, 0o755); err != nil {
		return nil, "", err
	}

	archiveFile, err := os.CreateTemp(projectStateDir, "data_bundle_*.tar.gz")
	if err != nil {
		return nil, "", err
	}
	archivePath := archiveFile.Name()
	if err := writeDeterministicDataArchive(archiveFile, dataDir, files); err != nil {
		_ = archiveFile.Close()
		_ = os.Remove(archivePath)
		return nil, "", err
	}
	if err := archiveFile.Close(); err != nil {
		_ = os.Remove(archivePath)
		return nil, "", err
	}

	hash, size, err := fileSHA256(archivePath)
	if err != nil {
		_ = os.Remove(archivePath)
		return nil, "", err
	}
	entry := syncManifestEntry{
		Path:   "__tahuna__/data_bundle.tar.gz",
		SHA256: hash,
		Size:   size,
		Mode:   0o644,
	}
	return &entry, archivePath, nil
}

func listDataFiles(dataDir string) ([]string, error) {
	files := []string{}
	err := filepath.WalkDir(dataDir, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			return nil
		}
		if !d.Type().IsRegular() || (d.Type()&os.ModeSymlink) != 0 {
			return nil
		}
		relPath, relErr := filepath.Rel(dataDir, path)
		if relErr != nil {
			return relErr
		}
		files = append(files, filepath.ToSlash(relPath))
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Strings(files)
	return files, nil
}

func writeDeterministicDataArchive(dst *os.File, dataDir string, files []string) error {
	gw := gzip.NewWriter(dst)
	gw.Header.ModTime = time.Unix(0, 0)
	gw.Header.OS = 255
	tw := tar.NewWriter(gw)

	for _, rel := range files {
		fullPath := filepath.Join(dataDir, filepath.FromSlash(rel))
		info, err := os.Stat(fullPath)
		if err != nil {
			_ = tw.Close()
			_ = gw.Close()
			return err
		}
		header := &tar.Header{
			Name:     rel,
			Mode:     int64(info.Mode().Perm()),
			Size:     info.Size(),
			ModTime:  time.Unix(0, 0),
			Typeflag: tar.TypeReg,
			Format:   tar.FormatUSTAR,
		}
		if err := tw.WriteHeader(header); err != nil {
			_ = tw.Close()
			_ = gw.Close()
			return err
		}
		file, err := os.Open(fullPath)
		if err != nil {
			_ = tw.Close()
			_ = gw.Close()
			return err
		}
		_, copyErr := io.Copy(tw, file)
		closeErr := file.Close()
		if copyErr != nil {
			_ = tw.Close()
			_ = gw.Close()
			return copyErr
		}
		if closeErr != nil {
			_ = tw.Close()
			_ = gw.Close()
			return closeErr
		}
	}
	if err := tw.Close(); err != nil {
		_ = gw.Close()
		return err
	}
	return gw.Close()
}

func shouldSkipCodePath(relPath string, excludeDirs []string) bool {
	if relPath == "." {
		return false
	}
	if relPath == ".git" || strings.HasPrefix(relPath, ".git"+string(filepath.Separator)) {
		return true
	}
	if relPath == projectStateDir || strings.HasPrefix(relPath, projectStateDir+string(filepath.Separator)) {
		return true
	}
	// Hardcoded exclusions
	for _, dir := range []string{"node_modules", "__pycache__"} {
		if relPath == dir || strings.HasPrefix(relPath, dir+string(filepath.Separator)) {
			return true
		}
	}
	for _, dir := range excludeDirs {
		if dir != "." && dir != "" {
			if relPath == dir || strings.HasPrefix(relPath, dir+string(filepath.Separator)) {
				return true
			}
		}
	}
	return false
}

func collectCodeEntriesWithGitIgnore(
	baseDir string,
	excludeDirs []string,
) ([]syncManifestEntry, map[string]string, error) {
	cmd := exec.Command("git", "rev-parse", "--is-inside-work-tree")
	cmd.Dir = baseDir
	checkRaw, err := cmd.Output()
	if err != nil || strings.TrimSpace(string(checkRaw)) != "true" {
		return nil, nil, errors.New("not a git work tree")
	}

	listCmd := exec.Command("git", "ls-files", "-co", "--exclude-standard")
	listCmd.Dir = baseDir
	raw, err := listCmd.Output()
	if err != nil {
		return nil, nil, err
	}

	entries := []syncManifestEntry{}
	filesByID := map[string]string{}
	lines := strings.Split(string(raw), "\n")
	for _, line := range lines {
		relPath := filepath.Clean(strings.TrimSpace(line))
		if relPath == "" || relPath == "." || strings.HasPrefix(relPath, ".."+string(filepath.Separator)) {
			continue
		}
		if shouldSkipCodePath(relPath, excludeDirs) {
			continue
		}

		fullPath := filepath.Join(baseDir, relPath)
		info, statErr := os.Lstat(fullPath)
		if statErr != nil {
			if errors.Is(statErr, os.ErrNotExist) {
				continue
			}
			return nil, nil, statErr
		}
		if info.IsDir() || !info.Mode().IsRegular() || (info.Mode()&os.ModeSymlink) != 0 {
			continue
		}

		hash, size, err := fileSHA256(fullPath)
		if err != nil {
			return nil, nil, err
		}
		if !isUploadableBlobSize(size) {
			continue
		}
		entries = append(entries, syncManifestEntry{
			Path:   filepath.ToSlash(relPath),
			SHA256: hash,
			Size:   size,
			Mode:   uint32(info.Mode().Perm()),
		})
		if _, exists := filesByID[hash]; !exists {
			filesByID[hash] = fullPath
		}
	}
	return entries, filesByID, nil
}

func marshalAndHashManifest(manifest syncManifest) ([]byte, string, error) {
	raw, err := json.Marshal(manifest)
	if err != nil {
		return nil, "", err
	}
	sum := sha256.Sum256(raw)
	return raw, hex.EncodeToString(sum[:]), nil
}

func loadManifestCache(path string) (syncManifest, string, bool) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return syncManifest{}, "", false
	}
	var manifest syncManifest
	if err := json.Unmarshal(raw, &manifest); err != nil {
		return syncManifest{}, "", false
	}
	_, hash, err := marshalAndHashManifest(manifest)
	if err != nil {
		return syncManifest{}, "", false
	}
	return manifest, hash, true
}

func saveManifestCache(item preparedManifest) error {
	if err := os.MkdirAll(projectStateDir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(item.cachePath, append(item.raw, '\n'), 0o600)
}

func manifestEntriesEqual(a, b []syncManifestEntry) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func syncMissingBlobs(
	environmentID string,
	item preparedManifest,
	onProgress func(done, total int, phase string),
	forceUploadAll bool,
) error {
	hashes := uniqueSortedHashes(item.manifest.Entries)
	totalHashes := len(hashes)
	if onProgress != nil {
		onProgress(0, totalHashes, "checking")
	}
	if len(hashes) == 0 {
		if onProgress != nil {
			onProgress(0, 0, "done")
		}
		return nil
	}
	sizeByHash := manifestSizesByHash(item.manifest.Entries)
	missingHashes := make([]string, 0, len(hashes))
	confirmedCount := 0
	if forceUploadAll {
		missingHashes = append(missingHashes, hashes...)
	} else {
		const missingCheckChunkSize = 500
		for start := 0; start < len(hashes); start += missingCheckChunkSize {
			end := start + missingCheckChunkSize
			if end > len(hashes) {
				end = len(hashes)
			}
			chunk := hashes[start:end]
			missingChunk, err := fetchMissingBlobHashesWithRetry(environmentID, item.kind, chunk)
			if err != nil {
				return err
			}
			missingHashes = append(missingHashes, missingChunk...)
			confirmedCount += len(chunk) - len(missingChunk)
			if onProgress != nil {
				onProgress(confirmedCount, totalHashes, "checking")
			}
		}
	}

	if onProgress != nil {
		onProgress(confirmedCount, totalHashes, "uploading")
	}

	type blobUploadTask struct {
		hash string
		path string
		size int64
	}
	tasks := make([]blobUploadTask, 0, len(missingHashes))
	for _, hash := range missingHashes {
		if hash == "" {
			continue
		}
		path, exists := item.filesByID[hash]
		if !exists {
			return fmt.Errorf("missing local blob for hash %s", hash)
		}
		sizeBytes, hasSize := sizeByHash[hash]
		if !hasSize || !isUploadableBlobSize(sizeBytes) {
			return fmt.Errorf("missing local size for hash %s", hash)
		}
		tasks = append(tasks, blobUploadTask{
			hash: hash,
			path: path,
			size: sizeBytes,
		})
	}
	if len(tasks) == 0 {
		return nil
	}

	workerCount := syncUploadWorkerCount(len(tasks))
	jobs := make(chan blobUploadTask)
	errCh := make(chan error, 1)
	var wg sync.WaitGroup
	var completed atomic.Int64
	completed.Store(int64(confirmedCount))

	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for task := range jobs {
				_, err := uploadBlobTask(environmentID, item.kind, task.hash, task.path, task.size)
				if err != nil {
					select {
					case errCh <- err:
					default:
					}
					return
				}
				if onProgress != nil {
					done := int(completed.Add(1))
					onProgress(done, totalHashes, "uploading")
				}
			}
		}()
	}

	var firstErr error
sendLoop:
	for _, task := range tasks {
		select {
		case err := <-errCh:
			firstErr = err
			break sendLoop
		default:
		}
		jobs <- task
	}
	close(jobs)
	wg.Wait()
	if firstErr == nil {
		select {
		case err := <-errCh:
			firstErr = err
		default:
		}
	}
	if firstErr != nil {
		return firstErr
	}

	if onProgress != nil {
		onProgress(int(completed.Load()), totalHashes, "finalizing")
	}
	return nil
}

func syncUploadWorkerCount(total int) int {
	if total <= 1 {
		return 1
	}
	workers := 8
	if raw := strings.TrimSpace(os.Getenv("TAHUNA_SYNC_UPLOAD_WORKERS")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			workers = parsed
		}
	}
	if workers < 1 {
		workers = 1
	}
	if workers > 16 {
		workers = 16
	}
	if workers > total {
		workers = total
	}
	return workers
}

func uploadBlobTask(environmentID, kind, hash, path string, sizeBytes int64) (string, error) {
	uploadResp, uploadErr := syncDoJSON(http.MethodPost, "/sync/blobs/upload-url", map[string]any{
		"environment_id": environmentID,
		"kind":           kind,
		"sha256":         hash,
		"size_bytes":     sizeBytes,
	})
	if uploadErr != nil {
		return "", uploadErr
	}
	uploadURL := asString(uploadResp["url"])
	key := asString(uploadResp["key"])
	if uploadURL == "" || key == "" {
		return "", errors.New("invalid blob upload URL response")
	}
	if err := syncUploadFileToSignedURLRetry(path, uploadURL, 3); err != nil {
		return "", err
	}
	return key, nil
}

func fetchMissingBlobHashesWithRetry(environmentID, kind string, hashes []string) ([]string, error) {
	var lastErr error
	backoff := 750 * time.Millisecond
	for attempt := 0; attempt < 4; attempt++ {
		missing, err := fetchMissingBlobHashes(environmentID, kind, hashes)
		if err == nil {
			return missing, nil
		}
		lastErr = err
		if !isRetryableSyncError(err) {
			return nil, err
		}
		if attempt < 3 {
			time.Sleep(backoff)
			if backoff < 4*time.Second {
				backoff *= 2
			}
		}
	}
	return nil, lastErr
}

func fetchMissingBlobHashes(environmentID, kind string, hashes []string) ([]string, error) {
	resp, err := syncDoJSON(http.MethodPost, "/sync/blobs/missing", map[string]any{
		"environment_id": environmentID,
		"kind":           kind,
		"hashes":         hashes,
	})
	if err != nil {
		return nil, err
	}

	missingAny, ok := resp["missing"].([]any)
	if !ok {
		return nil, errors.New("invalid missing blob response")
	}
	missing := make([]string, 0, len(missingAny))
	for _, rawHash := range missingAny {
		hash := asString(rawHash)
		if hash == "" {
			continue
		}
		missing = append(missing, hash)
	}
	return missing, nil
}

func isRetryableSyncError(err error) bool {
	if err == nil {
		return false
	}
	var apiErr *apiRequestError
	if errors.As(err, &apiErr) {
		switch apiErr.status {
		case 408, 429, 502, 503, 504, 524:
			return true
		case 409:
			return strings.Contains(strings.ToLower(apiErr.detail), "not ready")
		default:
			return false
		}
	}

	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return true
	}
	if errors.Is(err, io.EOF) {
		return true
	}
	var opErr *net.OpError
	if errors.As(err, &opErr) {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "connection reset")
}

func formatDataSyncProgress(done, total int, phase string) string {
	if total == 0 {
		return "syncing data... [====================] 100% (0/0) up to date"
	}
	width := 20
	filled := int(float64(done) / float64(total) * float64(width))
	if filled > width {
		filled = width
	}
	bar := strings.Repeat("=", filled) + strings.Repeat(" ", width-filled)
	percent := int(float64(done) / float64(total) * 100)
	switch phase {
	case "checking":
		return fmt.Sprintf("syncing data... [%s] %3d%% (%d/%d) checking remote", bar, percent, done, total)
	case "uploading":
		return fmt.Sprintf("syncing data... [%s] %3d%% (%d/%d) uploading missing blobs", bar, percent, done, total)
	case "finalizing":
		return fmt.Sprintf("syncing data... [%s] %3d%% (%d/%d) finalizing", bar, percent, done, total)
	default:
		return fmt.Sprintf("syncing data... [%s] %3d%% (%d/%d)", bar, percent, done, total)
	}
}

type syncPhaseSpinner struct {
	options syncOptions
	done    chan struct{}
	stopped chan struct{}
	mu      sync.RWMutex
	message string
}

func newSyncPhaseSpinner(initialMessage string, options syncOptions) *syncPhaseSpinner {
	sp := &syncPhaseSpinner{
		options: options,
		done:    make(chan struct{}),
		stopped: make(chan struct{}),
		message: initialMessage,
	}
	if !options.logProgress {
		close(sp.stopped)
		return sp
	}
	if !options.dynamicStatus {
		fmt.Println(initialMessage)
		close(sp.stopped)
		return sp
	}

	frames := []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}
	go func() {
		defer close(sp.stopped)
		ticker := time.NewTicker(90 * time.Millisecond)
		defer ticker.Stop()
		frame := 0
		for {
			sp.mu.RLock()
			message := sp.message
			sp.mu.RUnlock()
			printStatusLine(frames[frame%len(frames)], message)
			frame++
			select {
			case <-sp.done:
				return
			case <-ticker.C:
			}
		}
	}()
	return sp
}

func (sp *syncPhaseSpinner) SetMessage(message string) {
	sp.mu.Lock()
	sp.message = message
	sp.mu.Unlock()
	if sp.options.logProgress && !sp.options.dynamicStatus {
		fmt.Println(message)
	}
}

func (sp *syncPhaseSpinner) StopSuccess(label string) {
	if !sp.options.logProgress {
		return
	}
	if sp.options.dynamicStatus {
		close(sp.done)
		<-sp.stopped
		fmt.Printf("\r\033[2K%s✓%s %s\n", cAmpGreen, cReset, label)
		return
	}
	fmt.Printf("%s✓%s %s\n", cAmpGreen, cReset, label)
}

func (sp *syncPhaseSpinner) StopError() {
	if !sp.options.dynamicStatus || !sp.options.logProgress {
		return
	}
	close(sp.done)
	<-sp.stopped
	clearStatusLine()
}

func uploadManifest(environmentID string, item preparedManifest) error {
	uploadResp, err := syncDoJSON(http.MethodPost, "/sync/manifests/upload-url", map[string]any{
		"environment_id": environmentID,
		"kind":           item.kind,
		"manifest_hash":  item.hash,
		"size_bytes":     len(item.raw),
	})
	if err != nil {
		return err
	}
	uploadURL := asString(uploadResp["url"])
	key := asString(uploadResp["key"])
	if uploadURL == "" {
		return errors.New("invalid manifest upload URL response")
	}
	if key == "" {
		return errors.New("invalid manifest upload URL response")
	}
	if err := syncUploadBytesToSignedURLRetry(item.raw, uploadURL, "application/json", 3); err != nil {
		return err
	}
	return nil
}

func uniqueSortedHashes(entries []syncManifestEntry) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.SHA256 == "" {
			continue
		}
		if _, exists := seen[entry.SHA256]; exists {
			continue
		}
		seen[entry.SHA256] = struct{}{}
		out = append(out, entry.SHA256)
	}
	sort.Strings(out)
	return out
}

func manifestSizesByHash(entries []syncManifestEntry) map[string]int64 {
	out := make(map[string]int64, len(entries))
	for _, entry := range entries {
		if entry.SHA256 == "" || !isUploadableBlobSize(entry.Size) {
			continue
		}
		if _, exists := out[entry.SHA256]; exists {
			continue
		}
		out[entry.SHA256] = entry.Size
	}
	return out
}

func isUploadableBlobSize(size int64) bool {
	return size > 0
}

func fileSHA256(path string) (string, int64, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", 0, err
	}
	defer file.Close()

	hasher := sha256.New()
	size, err := io.Copy(hasher, file)
	if err != nil {
		return "", 0, err
	}
	return hex.EncodeToString(hasher.Sum(nil)), size, nil
}
