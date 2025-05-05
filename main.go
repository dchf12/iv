package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"

	"image-viewer/internal/viewer"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the image viewer service
	imageViewerService := viewer.NewImageViewerService()

	// Create application with options
	err := wails.Run(&options.App{
		Title:  "画像閲覧アプリ",
		Width:  800,
		Height: 600,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 255, G: 255, B: 255, A: 1},
		OnStartup:        imageViewerService.OnStartup,
		Bind: []interface{}{
			imageViewerService,
		},
		Mac: &mac.Options{
			TitleBar:             mac.TitleBarHiddenInset(),
			Appearance:           mac.NSAppearanceNameVibrantLight,
			WebviewIsTransparent: true,
			WindowIsTranslucent:  true,
		},
	})

	if err != nil {
		log.Fatal(err)
	}
}
