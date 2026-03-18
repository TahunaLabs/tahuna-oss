package artifacts

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"warden/internal/runtimeapi"
)

type API interface {
	GetArtifactUploadURLs(ctx context.Context, artifacts []runtimeapi.ArtifactRequest) ([]runtimeapi.ArtifactUpload, error)
	CommitArtifacts(ctx context.Context, keys []string) (int, error)
}

type SyncResult struct {
	Discovered int
	Uploaded   int
	Keys       []string
}

type fileEntry struct {
	fullPath string
	name     string
	size     int64
}

func Sync(
	ctx context.Context,
	api API,
	workspaceRoot string,
	putTimeout time.Duration,
	emitLog func(level, source, message string),
) SyncResult {
	outputDir := filepath.Join(workspaceRoot, "outputs")
	info, err := os.Stat(outputDir)
	if err != nil || info == nil || !info.IsDir() {
		log(emitLog, "info", "bootstrap", "artifacts: no outputs directory found at "+outputDir+" (skipping upload)")
		return SyncResult{}
	}

	files, collectErr := collectFiles(outputDir)
	if collectErr != nil {
		log(emitLog, "warn", "bootstrap", "artifacts: failed to enumerate outputs: "+collectErr.Error())
		return SyncResult{}
	}
	if len(files) == 0 {
		log(emitLog, "info", "bootstrap", "artifacts: outputs directory is empty (skipping upload)")
		return SyncResult{}
	}
	log(emitLog, "info", "bootstrap", fmt.Sprintf("artifacts: found %d output file(s) to upload", len(files)))

	requests := make([]runtimeapi.ArtifactRequest, 0, len(files))
	for _, file := range files {
		requests = append(requests, runtimeapi.ArtifactRequest{
			Name:      file.name,
			SizeBytes: file.size,
		})
	}
	uploads, err := api.GetArtifactUploadURLs(ctx, requests)
	if err != nil {
		log(emitLog, "warn", "bootstrap", "artifacts: failed to get upload URLs: "+err.Error())
		return SyncResult{Discovered: len(files)}
	}
	if len(uploads) == 0 {
		log(emitLog, "warn", "bootstrap", "artifacts: no upload URLs returned")
		return SyncResult{Discovered: len(files)}
	}

	uploadByName := map[string]runtimeapi.ArtifactUpload{}
	for _, upload := range uploads {
		uploadByName[upload.Name] = upload
	}

	if putTimeout <= 0 {
		putTimeout = 120 * time.Second
	}
	putClient := &http.Client{Timeout: putTimeout}
	uploadedKeys := make([]string, 0, len(files))
	for _, file := range files {
		upload, ok := uploadByName[file.name]
		if !ok {
			log(emitLog, "warn", "bootstrap", "artifacts: no upload URL for "+file.name+" (skipping)")
			continue
		}
		f, openErr := os.Open(file.fullPath)
		if openErr != nil {
			log(emitLog, "warn", "bootstrap", "artifacts: failed opening "+file.name+": "+openErr.Error())
			continue
		}
		req, reqErr := http.NewRequestWithContext(ctx, http.MethodPut, upload.URL, f)
		if reqErr != nil {
			_ = f.Close()
			log(emitLog, "warn", "bootstrap", "artifacts: upload request failed for "+file.name+": "+reqErr.Error())
			continue
		}
		req.ContentLength = file.size
		req.Header.Set("Content-Type", "application/octet-stream")
		resp, putErr := putClient.Do(req)
		_ = f.Close()
		if putErr != nil {
			log(emitLog, "warn", "bootstrap", "artifacts: upload failed for "+file.name+": "+putErr.Error())
			continue
		}
		_ = resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode > 299 {
			log(emitLog, "warn", "bootstrap", fmt.Sprintf("artifacts: upload failed for %s: status=%d", file.name, resp.StatusCode))
			continue
		}
		uploadedKeys = append(uploadedKeys, upload.Key)
		log(emitLog, "info", "bootstrap", fmt.Sprintf("artifacts: uploaded %s (%d bytes)", file.name, file.size))
	}

	if len(uploadedKeys) > 0 {
		if _, err := api.CommitArtifacts(ctx, uploadedKeys); err != nil {
			log(emitLog, "warn", "bootstrap", "artifacts: commit failed: "+err.Error())
		} else {
			log(emitLog, "info", "bootstrap", fmt.Sprintf("artifacts: committed %d artifact key(s)", len(uploadedKeys)))
		}
	}
	return SyncResult{
		Discovered: len(files),
		Uploaded:   len(uploadedKeys),
		Keys:       uploadedKeys,
	}
}

func collectFiles(outputDir string) ([]fileEntry, error) {
	files := []fileEntry{}
	walkErr := filepath.WalkDir(outputDir, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		info, statErr := entry.Info()
		if statErr != nil {
			return statErr
		}
		if info.Size() <= 0 {
			return nil
		}
		rel, relErr := filepath.Rel(outputDir, path)
		if relErr != nil {
			return relErr
		}
		name := sanitizeName(rel)
		files = append(files, fileEntry{
			fullPath: path,
			name:     name,
			size:     info.Size(),
		})
		return nil
	})
	if walkErr != nil {
		return nil, walkErr
	}
	return files, nil
}

func sanitizeName(relPath string) string {
	normalized := strings.ReplaceAll(filepath.ToSlash(relPath), "\\", "/")
	normalized = strings.TrimLeft(normalized, "/")
	normalized = strings.ReplaceAll(normalized, "..", "_")
	return normalized
}

func log(emitLog func(level, source, message string), level, source, message string) {
	if emitLog != nil {
		emitLog(level, source, message)
	}
}
