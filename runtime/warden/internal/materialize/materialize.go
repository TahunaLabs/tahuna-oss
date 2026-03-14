package materialize

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"warden/internal/runtimeapi"
)

type Stats struct {
	FileCount  int
	TotalBytes int64
}

type Progress struct {
	Kind           string
	CompletedFiles int
	TotalFiles     int
	CompletedBytes int64
	TotalBytes     int64
	CurrentPath    string
}

type Downloader struct {
	http *http.Client
}

func NewDownloader(timeout time.Duration) *Downloader {
	if timeout <= 0 {
		timeout = 120 * time.Second
	}
	return &Downloader{
		http: &http.Client{
			Timeout: timeout,
		},
	}
}

func (d *Downloader) Fetch(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("create download request: %w", err)
	}
	resp, err := d.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("download request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		raw, _ := io.ReadAll(resp.Body)
		msg := strings.TrimSpace(string(raw))
		if msg == "" {
			msg = resp.Status
		}
		return nil, fmt.Errorf("download failed: status=%d body=%s", resp.StatusCode, msg)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read download response: %w", err)
	}
	return body, nil
}

func WriteManifestEntries(
	ctx context.Context,
	downloader *Downloader,
	entries []runtimeapi.BootstrapEntry,
	rootDir string,
	kind string,
	onProgress func(Progress),
) (Stats, error) {
	if downloader == nil {
		return Stats{}, fmt.Errorf("downloader is required")
	}
	if err := os.MkdirAll(rootDir, 0o755); err != nil {
		return Stats{}, fmt.Errorf("create root dir %s: %w", rootDir, err)
	}

	totalBytes := int64(0)
	for _, entry := range entries {
		totalBytes += entry.Size
	}

	stats := Stats{}
	for _, entry := range entries {
		rel, err := SafeRelativePath(entry.Path)
		if err != nil {
			return Stats{}, fmt.Errorf("%s entry path validation failed: %w", kind, err)
		}
		target := filepath.Join(rootDir, rel)
		parent := filepath.Dir(target)
		if parent != "" {
			if err := os.MkdirAll(parent, 0o755); err != nil {
				return Stats{}, fmt.Errorf("create parent dir for %s: %w", rel, err)
			}
		}

		blob, err := downloader.Fetch(ctx, entry.DownloadURL)
		if err != nil {
			return Stats{}, fmt.Errorf("%s blob download failed for %s: %w", kind, rel, err)
		}
		if int64(len(blob)) != entry.Size {
			return Stats{}, fmt.Errorf("%s blob size mismatch for %s", kind, rel)
		}
		if actual := sha256Hex(blob); actual != entry.SHA256 {
			return Stats{}, fmt.Errorf("%s blob hash mismatch for %s", kind, rel)
		}
		if err := os.WriteFile(target, blob, 0o644); err != nil {
			return Stats{}, fmt.Errorf("write file %s: %w", rel, err)
		}
		if entry.Mode > 0 {
			_ = os.Chmod(target, os.FileMode(entry.Mode)&0o777)
		}

		stats.FileCount += 1
		stats.TotalBytes += int64(len(blob))
		if onProgress != nil {
			onProgress(Progress{
				Kind:           kind,
				CompletedFiles: stats.FileCount,
				TotalFiles:     len(entries),
				CompletedBytes: stats.TotalBytes,
				TotalBytes:     totalBytes,
				CurrentPath:    rel,
			})
		}
	}
	return stats, nil
}

func ExtractDataBundle(rootDir string) (files int, totalBytes int64, archiveBytes int64, err error) {
	archivePath := filepath.Join(rootDir, "__tahuna__", "data_bundle.tar.gz")
	info, statErr := os.Stat(archivePath)
	if statErr != nil {
		if os.IsNotExist(statErr) {
			return 0, 0, 0, nil
		}
		return 0, 0, 0, fmt.Errorf("stat data bundle: %w", statErr)
	}
	if info.IsDir() {
		return 0, 0, 0, fmt.Errorf("data bundle path is a directory")
	}
	archiveBytes = info.Size()

	file, err := os.Open(archivePath)
	if err != nil {
		return 0, 0, archiveBytes, fmt.Errorf("open data bundle: %w", err)
	}
	defer file.Close()

	gzReader, err := gzip.NewReader(file)
	if err != nil {
		return 0, 0, archiveBytes, fmt.Errorf("open gzip reader: %w", err)
	}
	defer gzReader.Close()
	tarReader := tar.NewReader(gzReader)
	createdParents := map[string]struct{}{}
	copyBuffer := make([]byte, 128*1024)

	for {
		header, nextErr := tarReader.Next()
		if nextErr == io.EOF {
			break
		}
		if nextErr != nil {
			return 0, 0, archiveBytes, fmt.Errorf("read data bundle entry: %w", nextErr)
		}
		if header.FileInfo().IsDir() {
			continue
		}
		if header.Typeflag != tar.TypeReg {
			return 0, 0, archiveBytes, fmt.Errorf("unsupported data archive entry type: %s", header.Name)
		}

		rel, err := SafeRelativePath(header.Name)
		if err != nil {
			return 0, 0, archiveBytes, fmt.Errorf("invalid data archive path: %w", err)
		}
		target := filepath.Join(rootDir, rel)
		parent := filepath.Dir(target)
		if parent != "" {
			if _, exists := createdParents[parent]; !exists {
				if err := os.MkdirAll(parent, 0o755); err != nil {
					return 0, 0, archiveBytes, fmt.Errorf("create data parent dir: %w", err)
				}
				createdParents[parent] = struct{}{}
			}
		}

		outFile, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
		if err != nil {
			return 0, 0, archiveBytes, fmt.Errorf("open data entry %s: %w", rel, err)
		}

		written, err := io.CopyBuffer(outFile, tarReader, copyBuffer)
		closeErr := outFile.Close()
		if closeErr != nil {
			return 0, 0, archiveBytes, fmt.Errorf("close data entry %s: %w", rel, closeErr)
		}
		if written != header.Size {
			if err != nil {
				return 0, 0, archiveBytes, fmt.Errorf(
					"data entry size mismatch detail=path=%s expected=%d actual=%d copy_error=%v",
					rel,
					header.Size,
					written,
					err,
				)
			}
			return 0, 0, archiveBytes, fmt.Errorf(
				"data entry size mismatch detail=path=%s expected=%d actual=%d",
				rel,
				header.Size,
				written,
			)
		}
		if err != nil {
			return 0, 0, archiveBytes, fmt.Errorf("stream data entry %s: %w", rel, err)
		}

		mode := header.FileInfo().Mode().Perm()
		if mode > 0 && mode != 0o644 {
			_ = os.Chmod(target, mode)
		}

		files += 1
		totalBytes += written
	}

	_ = os.Remove(archivePath)
	bundleDir := filepath.Dir(archivePath)
	if dirEntries, readErr := os.ReadDir(bundleDir); readErr == nil && len(dirEntries) == 0 {
		_ = os.Remove(bundleDir)
	}
	return files, totalBytes, archiveBytes, nil
}

func SafeRelativePath(path string) (string, error) {
	clean := filepath.Clean(strings.ReplaceAll(strings.TrimSpace(path), "\\", "/"))
	clean = strings.TrimPrefix(clean, "/")
	if clean == "" || clean == "." || clean == ".." || strings.HasPrefix(clean, "../") {
		return "", fmt.Errorf("invalid path: %q", path)
	}
	return clean, nil
}

func sha256Hex(blob []byte) string {
	sum := sha256.Sum256(blob)
	return hex.EncodeToString(sum[:])
}

func CreateTarGzBundle(entries map[string][]byte) ([]byte, error) {
	var buf bytes.Buffer
	gzw := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gzw)
	for name, data := range entries {
		if err := tw.WriteHeader(&tar.Header{
			Name: name,
			Mode: 0o644,
			Size: int64(len(data)),
		}); err != nil {
			return nil, err
		}
		if _, err := tw.Write(data); err != nil {
			return nil, err
		}
	}
	if err := tw.Close(); err != nil {
		return nil, err
	}
	if err := gzw.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
