package viewer

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// 対応している画像ファイルの拡張子
var supportedExtensions = map[string]bool{
	".jpg":  true,
	".jpeg": true,
	".png":  true,
	".gif":  true,
	".webp": true,
	".mp4":  true,
}

// ImageViewerService バックエンドのサービス実装
type ImageViewerService struct {
	ctx context.Context
}

// NewImageViewerService 新しいImageViewerServiceのインスタンスを作成
func NewImageViewerService() *ImageViewerService {
	return &ImageViewerService{}
}

// OnStartup はアプリケーション起動時に呼び出されるメソッド
func (s *ImageViewerService) OnStartup(ctx context.Context) {
	s.ctx = ctx
}

// SelectDirectory はディレクトリ選択ダイアログを表示し、選択されたパスを返す
func (s *ImageViewerService) SelectDirectory() (string, error) {
	if s.ctx == nil {
		return "", errors.New("コンテキストが初期化されていません")
	}

	// ディレクトリ選択ダイアログを表示
	directory, err := runtime.OpenDirectoryDialog(s.ctx, runtime.OpenDialogOptions{
		Title: "画像フォルダを選択",
	})

	if err != nil {
		return "", fmt.Errorf("ディレクトリ選択エラー: %w", err)
	}

	if directory == "" {
		return "", errors.New("ディレクトリが選択されていません")
	}

	return directory, nil
}

// GetImageFiles は指定されたディレクトリ内の画像ファイルのパス一覧を返す
func (s *ImageViewerService) GetImageFiles(directoryPath string) ([]string, error) {
	if directoryPath == "" {
		return nil, errors.New("ディレクトリパスが指定されていません")
	}

	// ディレクトリの存在確認
	fileInfo, err := os.Stat(directoryPath)
	if err != nil {
		return nil, fmt.Errorf("ディレクトリアクセスエラー: %w", err)
	}

	if !fileInfo.IsDir() {
		return nil, errors.New("指定されたパスはディレクトリではありません")
	}

	// ディレクトリ内のエントリを取得
	entries, err := os.ReadDir(directoryPath)
	if err != nil {
		return nil, fmt.Errorf("ディレクトリ読み込みエラー: %w", err)
	}

	var imagePaths []string

	// 画像ファイルをフィルタリング
	for _, entry := range entries {
		if entry.IsDir() {
			continue // サブディレクトリはスキップ
		}

		name := entry.Name()
		extension := strings.ToLower(filepath.Ext(name))
		if supportedExtensions[extension] && !strings.HasPrefix(name, ".") && len(name) > len(extension) {
			imagePaths = append(imagePaths, filepath.Join(directoryPath, name))
		}
	}

	if len(imagePaths) == 0 {
		return nil, errors.New("指定されたディレクトリに画像ファイルが見つかりません")
	}

	return imagePaths, nil
}

// GetImageBase64 指定パスの画像をBase64エンコードして返す。
// 動画や大きなファイルは file:// URL を返すことでメモリ負荷を回避します。
func (s *ImageViewerService) GetImageBase64(imagePath string) (string, error) {
	fi, err := os.Stat(imagePath)
	if err != nil {
		return "", err
	}

	ext := strings.ToLower(filepath.Ext(imagePath))
	// 動画（.mp4）や大きなファイル（ここでは 5MB を閾値）については
	// base64 にせず file:// URL を返す（フロントエンドで直接参照する）
	if ext == ".mp4" || fi.Size() > 5*1024*1024 {
		u := &url.URL{Scheme: "file", Path: imagePath}
		return u.String(), nil
	}

	data, err := os.ReadFile(imagePath)
	if err != nil {
		return "", err
	}

	mime := "image/png"
	switch ext {
	case ".jpg", ".jpeg":
		mime = "image/jpeg"
	case ".png":
		mime = "image/png"
	case ".gif":
		mime = "image/gif"
	case ".webp":
		mime = "image/webp"
	}
	base64Str := base64.StdEncoding.EncodeToString(data)
	return "data:" + mime + ";base64," + base64Str, nil
}

// GetFileBytes は指定パスのファイルのバイト列を返します（フロントエンドで Blob を作成するために使用）
func (s *ImageViewerService) GetFileBytes(imagePath string) ([]byte, error) {
	data, err := os.ReadFile(imagePath)
	if err != nil {
		return nil, err
	}
	return data, nil
}

// GetFileSize は指定ファイルのサイズを返します
func (s *ImageViewerService) GetFileSize(imagePath string) (int64, error) {
	fi, err := os.Stat(imagePath)
	if err != nil {
		return 0, err
	}
	return fi.Size(), nil
}

// GetFileBytesRange は指定オフセットから最大 length バイトを読み取って返します
func (s *ImageViewerService) GetFileBytesRange(imagePath string, offset int64, length int) ([]byte, error) {
	f, err := os.Open(imagePath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	fi, err := f.Stat()
	if err != nil {
		return nil, err
	}

	if offset < 0 || offset >= fi.Size() {
		return nil, fmt.Errorf("invalid offset")
	}
	if length <= 0 {
		return nil, fmt.Errorf("invalid length")
	}

	remaining := fi.Size() - offset
	if int64(length) > remaining {
		length = int(remaining)
	}

	buf := make([]byte, length)
	n, err := f.ReadAt(buf, offset)
	if err != nil && err != io.EOF {
		return nil, err
	}
	return buf[:n], nil
}
