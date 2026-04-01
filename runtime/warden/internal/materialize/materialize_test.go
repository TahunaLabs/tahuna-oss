package materialize

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"warden/internal/runtimeapi"
)

func TestWriteManifestEntriesMaterializesVerifiedBlob(t *testing.T) {
	content := []byte("print('hello')")
	hash := sha256.Sum256(content)
	sha := hex.EncodeToString(hash[:])

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(content)
	}))
	defer server.Close()

	entries := []runtimeapi.BootstrapEntry{
		{
			Path:        "train.py",
			SHA256:      sha,
			Size:        int64(len(content)),
			Mode:        0o644,
			DownloadURL: server.URL,
		},
	}

	root := t.TempDir()
	stats, err := WriteManifestEntries(context.Background(), NewDownloader(5*time.Second), entries, root, "code", nil)
	if err != nil {
		t.Fatalf("WriteManifestEntries returned error: %v", err)
	}
	if stats.FileCount != 1 {
		t.Fatalf("expected 1 file, got %d", stats.FileCount)
	}
	materialized, err := os.ReadFile(filepath.Join(root, "train.py"))
	if err != nil {
		t.Fatalf("read materialized file: %v", err)
	}
	if string(materialized) != string(content) {
		t.Fatalf("unexpected materialized content: %q", string(materialized))
	}
}

func TestWriteManifestEntriesRejectsHashMismatch(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("content"))
	}))
	defer server.Close()

	entries := []runtimeapi.BootstrapEntry{
		{
			Path:        "train.py",
			SHA256:      "deadbeef",
			Size:        int64(len("content")),
			Mode:        0o644,
			DownloadURL: server.URL,
		},
	}

	_, err := WriteManifestEntries(context.Background(), NewDownloader(5*time.Second), entries, t.TempDir(), "code", nil)
	if err == nil {
		t.Fatal("expected hash mismatch error")
	}
}

func TestWriteManifestEntriesAllowsMissingHashForModelSnapshots(t *testing.T) {
	content := []byte("adapter-config")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(content)
	}))
	defer server.Close()

	entries := []runtimeapi.BootstrapEntry{
		{
			Path:        "adapter_config.json",
			SHA256:      "",
			Size:        int64(len(content)),
			Mode:        0o644,
			DownloadURL: server.URL,
		},
	}

	root := t.TempDir()
	stats, err := WriteManifestEntries(context.Background(), NewDownloader(5*time.Second), entries, root, "model", nil)
	if err != nil {
		t.Fatalf("WriteManifestEntries returned error: %v", err)
	}
	if stats.FileCount != 1 {
		t.Fatalf("expected 1 file, got %d", stats.FileCount)
	}
	materialized, err := os.ReadFile(filepath.Join(root, "adapter_config.json"))
	if err != nil {
		t.Fatalf("read materialized file: %v", err)
	}
	if string(materialized) != string(content) {
		t.Fatalf("unexpected materialized content: %q", string(materialized))
	}
}

func TestWriteManifestEntriesReportsProgress(t *testing.T) {
	contentA := []byte("file-a")
	hashA := sha256.Sum256(contentA)
	shaA := hex.EncodeToString(hashA[:])
	contentB := []byte("file-b")
	hashB := sha256.Sum256(contentB)
	shaB := hex.EncodeToString(hashB[:])

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/a":
			_, _ = w.Write(contentA)
		case "/b":
			_, _ = w.Write(contentB)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	entries := []runtimeapi.BootstrapEntry{
		{
			Path:        "a.txt",
			SHA256:      shaA,
			Size:        int64(len(contentA)),
			Mode:        0o644,
			DownloadURL: server.URL + "/a",
		},
		{
			Path:        "b.txt",
			SHA256:      shaB,
			Size:        int64(len(contentB)),
			Mode:        0o644,
			DownloadURL: server.URL + "/b",
		},
	}

	var snapshots []Progress
	_, err := WriteManifestEntries(
		context.Background(),
		NewDownloader(5*time.Second),
		entries,
		t.TempDir(),
		"code",
		func(progress Progress) {
			snapshots = append(snapshots, progress)
		},
	)
	if err != nil {
		t.Fatalf("WriteManifestEntries returned error: %v", err)
	}
	if len(snapshots) == 0 {
		t.Fatal("expected at least one progress snapshot")
	}
	last := snapshots[len(snapshots)-1]
	if last.CompletedFiles != 2 || last.TotalFiles != 2 {
		t.Fatalf("unexpected final progress files: %#v", last)
	}
}

func TestExtractDataBundleExtractsBundleAndDeletesArchive(t *testing.T) {
	root := t.TempDir()
	bundleDir := filepath.Join(root, "__tahuna__")
	if err := os.MkdirAll(bundleDir, 0o755); err != nil {
		t.Fatalf("mkdir bundle dir: %v", err)
	}
	bundle, err := CreateTarGzBundle(map[string][]byte{
		"mnist/train/0/example.txt": []byte("sample"),
	})
	if err != nil {
		t.Fatalf("CreateTarGzBundle returned error: %v", err)
	}
	archivePath := filepath.Join(bundleDir, "data_bundle.tar.gz")
	if err := os.WriteFile(archivePath, bundle, 0o644); err != nil {
		t.Fatalf("write archive: %v", err)
	}

	files, totalBytes, _, err := ExtractDataBundle(root)
	if err != nil {
		t.Fatalf("ExtractDataBundle returned error: %v", err)
	}
	if files != 1 {
		t.Fatalf("expected 1 extracted file, got %d", files)
	}
	if totalBytes <= 0 {
		t.Fatalf("expected extracted bytes > 0, got %d", totalBytes)
	}
	if _, err := os.Stat(archivePath); !os.IsNotExist(err) {
		t.Fatalf("expected archive to be removed, stat err: %v", err)
	}
}

func TestExtractDataBundleExtractsManyNestedFiles(t *testing.T) {
	root := t.TempDir()
	bundleDir := filepath.Join(root, "__tahuna__")
	if err := os.MkdirAll(bundleDir, 0o755); err != nil {
		t.Fatalf("mkdir bundle dir: %v", err)
	}

	entries := map[string][]byte{}
	expectedBytes := int64(0)
	for i := 0; i < 200; i++ {
		path := fmt.Sprintf("mnist/train/class_%02d/sample_%03d.txt", i%10, i)
		content := []byte(fmt.Sprintf("sample-%d", i))
		entries[path] = content
		expectedBytes += int64(len(content))
	}

	bundle, err := CreateTarGzBundle(entries)
	if err != nil {
		t.Fatalf("CreateTarGzBundle returned error: %v", err)
	}
	archivePath := filepath.Join(bundleDir, "data_bundle.tar.gz")
	if err := os.WriteFile(archivePath, bundle, 0o644); err != nil {
		t.Fatalf("write archive: %v", err)
	}

	files, totalBytes, _, err := ExtractDataBundle(root)
	if err != nil {
		t.Fatalf("ExtractDataBundle returned error: %v", err)
	}
	if files != len(entries) {
		t.Fatalf("expected %d extracted files, got %d", len(entries), files)
	}
	if totalBytes != expectedBytes {
		t.Fatalf("expected %d extracted bytes, got %d", expectedBytes, totalBytes)
	}

	samplePath := filepath.Join(root, "mnist/train/class_03/sample_103.txt")
	sample, err := os.ReadFile(samplePath)
	if err != nil {
		t.Fatalf("read extracted sample: %v", err)
	}
	if string(sample) != "sample-103" {
		t.Fatalf("unexpected sample content: %q", string(sample))
	}
}

func TestExtractDataBundleRejectsTruncatedArchive(t *testing.T) {
	root := t.TempDir()
	bundleDir := filepath.Join(root, "__tahuna__")
	if err := os.MkdirAll(bundleDir, 0o755); err != nil {
		t.Fatalf("mkdir bundle dir: %v", err)
	}
	bundle, err := CreateTarGzBundle(map[string][]byte{
		"mnist/train/0/example.txt": []byte("sample-data-for-truncation"),
	})
	if err != nil {
		t.Fatalf("CreateTarGzBundle returned error: %v", err)
	}
	if len(bundle) < 32 {
		t.Fatalf("expected archive bytes >= 32, got %d", len(bundle))
	}

	truncated := bundle[:len(bundle)-32]
	archivePath := filepath.Join(bundleDir, "data_bundle.tar.gz")
	if err := os.WriteFile(archivePath, truncated, 0o644); err != nil {
		t.Fatalf("write truncated archive: %v", err)
	}

	_, _, _, err = ExtractDataBundle(root)
	if err == nil {
		t.Fatal("expected truncated archive extraction to fail")
	}
	if !strings.Contains(err.Error(), "data entry size mismatch") {
		t.Fatalf("expected size mismatch error, got %v", err)
	}
}

func TestExtractDataBundleRejectsNonRegularEntry(t *testing.T) {
	root := t.TempDir()
	bundleDir := filepath.Join(root, "__tahuna__")
	if err := os.MkdirAll(bundleDir, 0o755); err != nil {
		t.Fatalf("mkdir bundle dir: %v", err)
	}

	var buffer bytes.Buffer
	gzWriter := gzip.NewWriter(&buffer)
	tarWriter := tar.NewWriter(gzWriter)
	if err := tarWriter.WriteHeader(&tar.Header{
		Name:     "link.txt",
		Mode:     0o777,
		Typeflag: tar.TypeSymlink,
		Linkname: "target.txt",
	}); err != nil {
		t.Fatalf("write tar header: %v", err)
	}
	if err := tarWriter.Close(); err != nil {
		t.Fatalf("close tar writer: %v", err)
	}
	if err := gzWriter.Close(); err != nil {
		t.Fatalf("close gzip writer: %v", err)
	}

	archivePath := filepath.Join(bundleDir, "data_bundle.tar.gz")
	if err := os.WriteFile(archivePath, buffer.Bytes(), 0o644); err != nil {
		t.Fatalf("write archive: %v", err)
	}

	_, _, _, err := ExtractDataBundle(root)
	if err == nil {
		t.Fatal("expected unsupported entry type error")
	}
	if !strings.Contains(err.Error(), "unsupported data archive entry type") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestSafeRelativePathRejectsTraversal(t *testing.T) {
	if _, err := SafeRelativePath("../etc/passwd"); err == nil {
		t.Fatal("expected traversal path to be rejected")
	}
}
