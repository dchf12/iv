import { useEffect, useReducer, useCallback } from 'react';
import './App.css';

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
        currentImageIndex: Math.min(state.currentImageIndex + 1, state.imageFiles.length - 1),
      };
    case "PREV_IMAGE":
      return {
        ...state,
        currentImageIndex: Math.max(state.currentImageIndex - 1, 0),
      };
    case "CLEAR_ERROR":
      return { ...state, status: "idle", errorMessage: undefined };
    default:
      return state;
  }
}

function App() {
  const [state, dispatch] = useReducer(reducer, initialState);

  // フォルダ選択処理
  const handleSelectDirectory = async () => {
    try {
      dispatch({ type: "SELECT_DIRECTORY" });
      const directoryPath = await window.go.main.ImageViewerService.SelectDirectory();
      
      if (directoryPath) {
        dispatch({ type: "DIRECTORY_SELECTED", payload: directoryPath });
        const imageFiles = await window.go.main.ImageViewerService.GetImageFiles(directoryPath);
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

  // 前の画像に移動
  const handlePrevImage = () => {
    if (state.status === "viewing" && state.currentImageIndex > 0) {
      dispatch({ type: "PREV_IMAGE" });
    }
  };

  // 次の画像に移動
  const handleNextImage = () => {
    if (state.status === "viewing" && state.currentImageIndex < state.imageFiles.length - 1) {
      dispatch({ type: "NEXT_IMAGE" });
    }
  };

  // キーボードイベントの処理
  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    if (state.status !== "viewing") return;

    if (event.key === "ArrowLeft") {
      handlePrevImage();
    } else if (event.key === "ArrowRight") {
      handleNextImage();
    }
  }, [state.status, state.currentImageIndex, state.imageFiles.length]);

  // キーボードイベントの監視を設定
  useEffect(() => {
    window.addEventListener("keydown", handleKeyPress);
    return () => {
      window.removeEventListener("keydown", handleKeyPress);
    };
  }, [handleKeyPress]);

  // 現在の画像のURLを取得
  const currentImageUrl = state.status === "viewing" && state.imageFiles.length > 0
    ? `file://${state.imageFiles[state.currentImageIndex]}`
    : "";

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>画像閲覧アプリ</h1>
        <button onClick={handleSelectDirectory} className="select-button">
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
            <button onClick={() => dispatch({ type: "CLEAR_ERROR" })}>
              閉じる
            </button>
          </div>
        )}

        {state.status === "viewing" && (
          <>
            <div className="image-container">
              <img 
                src={currentImageUrl} 
                alt="選択された画像" 
                className="displayed-image"
              />
            </div>
            <div className="navigation-controls">
              <button 
                onClick={handlePrevImage}
                disabled={state.currentImageIndex === 0}
                className="nav-button"
              >
                ← 前へ
              </button>
              <span className="image-counter">
                {state.currentImageIndex + 1} / {state.imageFiles.length}
              </span>
              <button 
                onClick={handleNextImage}
                disabled={state.currentImageIndex === state.imageFiles.length - 1}
                className="nav-button"
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
