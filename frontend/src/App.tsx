import { useEffect, useReducer, useCallback, useState } from 'react';
import './App.css';
import { GetImageFiles, SelectDirectory, GetImageBase64 } from '../wailsjs/go/viewer/ImageViewerService';

// 状態の型定義
type AppState = {
  status: "idle" | "selecting" | "loading" | "viewing" | "error";
  directoryPath: string;
  imageFiles: string[];
  currentImageIndex: number;
  errorMessage?: string;
};

// アクションの型定義
type Action =
  | { type: "SELECT_DIRECTORY" }
  | { type: "CANCEL_SELECTION" }
  | { type: "DIRECTORY_SELECTED"; payload: string }
  | { type: "IMAGES_LOADED"; payload: string[] }
  | { type: "IMAGE_LOAD_FAILED"; payload: string }
  | { type: "NEXT_IMAGE" }
  | { type: "PREV_IMAGE" }
  | { type: "CLEAR_ERROR" };

// 初期状態
const initialState: AppState = {
  status: "idle",
  directoryPath: "",
  imageFiles: [],
  currentImageIndex: 0,
};

// Reducer関数
function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SELECT_DIRECTORY":
      return { ...state, status: "selecting" };
    case "CANCEL_SELECTION":
      return { ...state, status: "idle" };
    case "DIRECTORY_SELECTED":
      return {
        ...state,
        status: "loading",
        directoryPath: action.payload,
        imageFiles: [],
        currentImageIndex: 0,
      };
    case "IMAGES_LOADED":
      return {
        ...state,
        status: "viewing",
        imageFiles: action.payload,
        currentImageIndex: 0,
      };
    case "IMAGE_LOAD_FAILED":
      return {
        ...state,
        status: "error",
        errorMessage: action.payload,
      };
    case "NEXT_IMAGE":
      return {
        ...state,
        currentImageIndex: state.imageFiles.length === 0
          ? 0
          : (state.currentImageIndex + 1) % state.imageFiles.length,
      };
    case "PREV_IMAGE":
      return {
        ...state,
        currentImageIndex: state.imageFiles.length === 0
          ? 0
          : (state.currentImageIndex - 1 + state.imageFiles.length) % state.imageFiles.length,
      };
    case "CLEAR_ERROR":
      return { ...state, status: "idle", errorMessage: undefined };
    default:
      return state;
  }
}

function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [imageSrc, setImageSrc] = useState<string>("");

  // フォルダ選択処理
  const handleSelectDirectory = async () => {
    try {
      dispatch({ type: "SELECT_DIRECTORY" });
      const directoryPath = await SelectDirectory();

      if (directoryPath) {
        dispatch({ type: "DIRECTORY_SELECTED", payload: directoryPath });
        const imageFiles = await GetImageFiles(directoryPath);
        dispatch({ type: "IMAGES_LOADED", payload: imageFiles });
      } else {
        dispatch({ type: "CANCEL_SELECTION" });
      }
    } catch (error) {
      dispatch({ 
        type: "IMAGE_LOAD_FAILED", 
        payload: `エラーが発生しました: ${error instanceof Error ? error.message : String(error)}` 
      });
    }
  };

  // 現在の画像のBase64データを取得
  const loadCurrentImage = useCallback(async () => {
    if (state.status === "viewing" && state.imageFiles.length > 0) {
      const imagePath = state.imageFiles[state.currentImageIndex];
      try {
        const base64 = await GetImageBase64(imagePath);
        setImageSrc(base64);
      } catch (e) {
        setImageSrc("");
      }
    } else {
      setImageSrc("");
    }
  }, [state.status, state.imageFiles, state.currentImageIndex]);

  // 画像切り替え時にBase64データを取得
  useEffect(() => {
    loadCurrentImage();
  }, [loadCurrentImage]);

  // 前の画像に移動
  const handlePrevImage = useCallback(() => {
    if (state.status === "viewing") {
      dispatch({ type: "PREV_IMAGE" });
    }
  }, [state.status]);

  // 次の画像に移動
  const handleNextImage = useCallback(() => {
    if (state.status === "viewing") {
      dispatch({ type: "NEXT_IMAGE" });
    }
  }, [state.status]);

  // キーボードイベントの処理
  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    if (state.status !== "viewing") return;

    if (event.key === "ArrowLeft" || event.key === "h") {
      event.preventDefault();
      handlePrevImage();
    } else if (event.key === "ArrowRight" || event.key === "l") {
      event.preventDefault();
      handleNextImage();
    }
  }, [state.status, handlePrevImage, handleNextImage]);

  // キーボードイベントの監視を設定
  useEffect(() => {
    window.addEventListener("keydown", handleKeyPress);
    return () => {
      window.removeEventListener("keydown", handleKeyPress);
    };
  }, [handleKeyPress]);

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>画像閲覧アプリ</h1>
        <button onClick={handleSelectDirectory} className="select-button" type="button">
          フォルダ選択
        </button>
      </header>

      <main className="image-viewer">
        {state.status === "idle" && (
          <div className="empty-state">
            <p>フォルダを選択して画像を表示します</p>
          </div>
        )}

        {state.status === "loading" && (
          <div className="loading-state">
            <p>読み込み中...</p>
          </div>
        )}

        {state.status === "error" && (
          <div className="error-state">
            <p>{state.errorMessage}</p>
            <button onClick={() => dispatch({ type: "CLEAR_ERROR" })} type="button">
              閉じる
            </button>
          </div>
        )}

        {state.status === "viewing" && (
          <>
            <div className="image-container">
              <img 
                src={imageSrc} 
                alt="選択された画像" 
                className="displayed-image"
              />
            </div>
            <div className="navigation-controls">
              <button 
                onClick={handlePrevImage}
                className="nav-button"
                type="button"
              >
                ← 前へ
              </button>
              <span className="image-counter">
                {state.currentImageIndex + 1} / {state.imageFiles.length}
              </span>
              <button 
                onClick={handleNextImage}
                className="nav-button"
                type="button"
              >
                次へ →
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
