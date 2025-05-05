package viewer

import (
	"context"
	"errors"
	"fmt"
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

		extension := strings.ToLower(filepath.Ext(entry.Name()))
		if supportedExtensions[extension] {
			imagePaths = append(imagePaths, filepath.Join(directoryPath, entry.Name()))
		}
	}

	if len(imagePaths) == 0 {
		return nil, errors.New("指定されたディレクトリに画像ファイルが見つかりません")
	}

	return imagePaths, nil
}
