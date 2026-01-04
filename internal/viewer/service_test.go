package viewer

import (
	"os"
	"path/filepath"
	"testing"
)

func TestGetImageBase64_PDFHandling(t *testing.T) {
	svc := NewImageViewerService()

	td := t.TempDir()

	// 小さいPDFファイルを作成
	smallPDF := filepath.Join(td, "doc_small.pdf")
	smallContent := []byte("%PDF-1.4\n%EOF\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF")
	if err := os.WriteFile(smallPDF, smallContent, 0644); err != nil {
		t.Fatalf("failed to write small pdf: %v", err)
	}

	res, err := svc.GetImageBase64(smallPDF)
	if err != nil {
		t.Fatalf("GetImageBase64 failed for small pdf: %v", err)
	}
	if len(res) == 0 {
		t.Fatalf("empty result for small pdf")
	}
	if !startsWith(res, "data:application/pdf;base64,") {
		t.Fatalf("expected data URL for small pdf, got: %s", res[:30])
	}

	// 大きいPDFを作成 (>5MB)
	largePDF := filepath.Join(td, "doc_large.pdf")
	largeSize := 6 * 1024 * 1024
	largeF, err := os.Create(largePDF)
	if err != nil {
		t.Fatalf("failed to create large pdf: %v", err)
	}
	defer largeF.Close()
	buf := make([]byte, 1024*1024)
	for i := range buf {
		buf[i] = byte(i % 256)
	}
	for written := 0; written < largeSize; written += len(buf) {
		if _, err := largeF.Write(buf); err != nil {
			t.Fatalf("failed to write to large pdf: %v", err)
		}
	}

	res2, err := svc.GetImageBase64(largePDF)
	if err != nil {
		t.Fatalf("GetImageBase64 failed for large pdf: %v", err)
	}
	if !startsWith(res2, "file://") {
		t.Fatalf("expected file:// URL for large pdf, got: %s", res2)
	}
}

func startsWith(s, p string) bool { return len(s) >= len(p) && s[:len(p)] == p }
