import { useEffect, useReducer, useCallback, useState, useRef } from 'react';
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
  | { type: "JUMP"; payload: number }
  | { type: "NEXT_IMAGE"; payload?: number }
  | { type: "PREV_IMAGE"; payload?: number }
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
      return {
        ...state,
        status: "idle",
        directoryPath: "",
        imageFiles: [],
        currentImageIndex: 0,
      };
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
    case "NEXT_IMAGE": {
      if (state.imageFiles.length === 0) return state;
      const step = action.payload ?? 1;
      return {
        ...state,
        currentImageIndex: (state.currentImageIndex + step) % state.imageFiles.length,
      };
    }
    case "PREV_IMAGE": {
      if (state.imageFiles.length === 0) return state;
      const step = action.payload ?? 1;
      const L = state.imageFiles.length;
      return {
        ...state,
        currentImageIndex: ((state.currentImageIndex - step) % L + L) % L,
      };
    }
    case "JUMP": {
      if (state.imageFiles.length === 0) return state;
      const L = state.imageFiles.length;
      const n = action.payload % L; // allow large numbers
      const newIndex = ((state.currentImageIndex + n) % L + L) % L;
      return { ...state, currentImageIndex: newIndex };
    }
    case "CLEAR_ERROR":
      return { ...state, status: "idle", errorMessage: undefined };
    default:
      return state;
  }
}

function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [imageSrc, setImageSrc] = useState<string>("");
  const [isSpreadMode, setIsSpreadMode] = useState(false);
  const [secondImageSrc, setSecondImageSrc] = useState<string>("");
  const secondObjectUrlRef = useRef<string | null>(null);

  const currentPath = state.imageFiles.length > 0 ? state.imageFiles[state.currentImageIndex] : "";
  const isVideo = currentPath.toLowerCase().endsWith(".mp4");
  const isPdf = currentPath.toLowerCase().endsWith(".pdf");

  // 数字入力バッファ（ページジャンプ用）
  const digitBufferRef = ({} as { current?: string });
  const digitTimerRef = ({} as { current?: number | null });
  // 一時的に作成した Object URL を保持しておき、不要時に revoke する
  const objectUrlRef = useRef<string | null>(null);
  const revokeRef = (ref: React.MutableRefObject<string | null>) => {
    if (ref.current) {
      try { URL.revokeObjectURL(ref.current); } catch (e) { /* ignore */ }
      ref.current = null;
    }
  };
  const revokeObjectUrl = () => revokeRef(objectUrlRef);
  const revokeSecondObjectUrl = () => revokeRef(secondObjectUrlRef);

  // 動画要素への参照（シーク制御用）
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const seekVideo = (deltaSeconds: number) => {
    const v = videoRef.current;
    if (!v) return;
    try {
      const dur = isFinite(v.duration) ? v.duration : 0;
      let t = (v.currentTime || 0) + deltaSeconds;
      if (t < 0) t = 0;
      if (dur > 0 && t > dur) t = dur;
      v.currentTime = t;
    } catch (e) {
      // ignore
    }
  };

  const togglePlayPause = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => { });
    } else {
      v.pause();
    }
  };
  const [videoPlaying, setVideoPlaying] = useState(false);
  // 表示用ファイル名を短縮して返すユーティリティ
  const getBasename = (path: string) => {
    if (!path) return "";
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1];
  };

  const truncate = (s: string, max = 30) => {
    if (!s) return "";
    if (s.length <= max) return s;
    const half = Math.floor((max - 3) / 2);
    return s.slice(0, half) + '...' + s.slice(s.length - half);
  };

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

  // 指定パスの画像を読み込み、src文字列を返すヘルパー
  const loadImageSrc = async (
    filePath: string,
    urlRef: React.MutableRefObject<string | null>,
  ): Promise<string> => {
    const src = await GetImageBase64(filePath);

    // サーバーが file:// を返す場合は、チャンクで読み込みつつ Blob を組み立てる
    if (typeof src === 'string' && src.startsWith('file://')) {
      const sizeRaw: any = await (window as any).go.viewer.ImageViewerService.GetFileSize(filePath);
      const totalSize = typeof sizeRaw === 'number' ? sizeRaw : parseInt(String(sizeRaw), 10);
      const chunkSize = 1024 * 1024; // 1MB

      const total = new Uint8Array(totalSize);
      let offset = 0;
      while (offset < totalSize) {
        const len = Math.min(chunkSize, totalSize - offset);
        const chunkRaw: any = await (window as any).go.viewer.ImageViewerService.GetFileBytesRange(filePath, offset, len);

        let chunkBytes: Uint8Array;
        if (typeof chunkRaw === 'string') {
          const bin = atob(chunkRaw);
          chunkBytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) chunkBytes[i] = bin.charCodeAt(i);
        } else if (chunkRaw instanceof Uint8Array) {
          chunkBytes = chunkRaw as Uint8Array;
        } else if (chunkRaw && chunkRaw.length) {
          chunkBytes = new Uint8Array(chunkRaw);
        } else {
          throw new Error('不明なバイナリ形式');
        }

        total.set(chunkBytes, offset);
        offset += chunkBytes.length;
      }

      const ext = filePath.split('.').pop()?.toLowerCase() || '';
      const mimeMap: Record<string, string> = {
        mp4: 'video/mp4', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        png: 'image/png', gif: 'image/gif', webp: 'image/webp',
        pdf: 'application/pdf',
      };
      const mime = mimeMap[ext] || 'application/octet-stream';

      const blob = new Blob([total.buffer as ArrayBuffer], { type: mime });
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      return url;
    }

    // data: URI や直接使える URL の場合はそのまま返す
    return src;
  };

  // 現在の画像のBase64データを取得
  const loadCurrentImage = useCallback(async () => {
    revokeObjectUrl();
    revokeSecondObjectUrl();

    if (state.status === "viewing" && state.imageFiles.length > 0) {
      const imagePath = state.imageFiles[state.currentImageIndex];
      try {
        const src = await loadImageSrc(imagePath, objectUrlRef);
        setImageSrc(src);
      } catch (e) {
        setImageSrc("");
      }

      // 見開きモード: 2枚目を読み込む（1枚目が画像の場合のみ）
      if (isSpreadMode && !isVideo && !isPdf) {
        const nextIdx = state.currentImageIndex + 1;
        if (nextIdx < state.imageFiles.length) {
          const nextPath = state.imageFiles[nextIdx];
          const nextExt = nextPath.toLowerCase().split('.').pop() || '';
          const isNextMediaOrPdf = nextExt === 'mp4' || nextExt === 'pdf';
          if (!isNextMediaOrPdf) {
            try {
              const src2 = await loadImageSrc(nextPath, secondObjectUrlRef);
              setSecondImageSrc(src2);
            } catch (e) {
              setSecondImageSrc("");
            }
          } else {
            setSecondImageSrc("");
          }
        } else {
          setSecondImageSrc("");
        }
      } else {
        setSecondImageSrc("");
      }
    } else {
      setImageSrc("");
      setSecondImageSrc("");
    }
  }, [state.status, state.imageFiles, state.currentImageIndex, isVideo, isPdf, isSpreadMode]);

  // 画像切り替え時にBase64データを取得
  useEffect(() => {
    loadCurrentImage();
  }, [loadCurrentImage]);

  // 前の画像に移動
  const handlePrevImage = useCallback(() => {
    if (state.status === "viewing") {
      const step = isSpreadMode ? 2 : 1;
      dispatch({ type: "PREV_IMAGE", payload: step });
    }
  }, [state.status, isSpreadMode]);

  // 次の画像に移動
  const handleNextImage = useCallback(() => {
    if (state.status === "viewing") {
      const step = isSpreadMode ? 2 : 1;
      dispatch({ type: "NEXT_IMAGE", payload: step });
    }
  }, [state.status, isSpreadMode]);

  // キーボードイベントの処理
  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    // 数字入力の開始・継続
    const isDigit = /^[0-9]$/.test(event.key);
    if (isDigit) {
      event.preventDefault();
      // 数字は viewing 状態でなくても受け付ける（選択前の入力を許可）
      digitBufferRef.current = (digitBufferRef.current || '') + event.key;
      // タイマーをリセット
      if (digitTimerRef.current) {
        window.clearTimeout(digitTimerRef.current as number);
      }
      digitTimerRef.current = window.setTimeout(() => {
        digitBufferRef.current = '';
        digitTimerRef.current = null;
      }, 3000);
      return;
    }

    if (state.status !== "viewing" && event.key !== "o") return;

    // 移動系キーと組み合わせた場合、数字バッファを使ってジャンプ
    const buffer = digitBufferRef.current ? parseInt(digitBufferRef.current || '0', 10) : 0;
    if ((event.key === "ArrowLeft" || event.key === "h" || event.key === "k") && buffer > 0) {
      event.preventDefault();
      // 左へは負にして扱う
      dispatch({ type: 'JUMP', payload: -buffer });
      digitBufferRef.current = '';
      if (digitTimerRef.current) { window.clearTimeout(digitTimerRef.current as number); digitTimerRef.current = null; }
      return;
    }
    if ((event.key === "ArrowRight" || event.key === "l" || event.key === "j") && buffer > 0) {
      event.preventDefault();
      dispatch({ type: 'JUMP', payload: buffer });
      digitBufferRef.current = '';
      if (digitTimerRef.current) { window.clearTimeout(digitTimerRef.current as number); digitTimerRef.current = null; }
      return;
    }

    // ArrowLeft / ArrowRight は 15 秒シーク（動画再生時）、画像なら左右移動を維持
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      // 動画再生中でも、動画要素がフォーカスされていない場合は前の画像へ移動する
      if (isVideo && videoRef.current && document.activeElement === videoRef.current) {
        seekVideo(-15);
      } else {
        handlePrevImage();
      }
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      // 動画要素がフォーカスされていない場合は次の画像へ移動する
      if (isVideo && videoRef.current && document.activeElement === videoRef.current) {
        seekVideo(15);
      } else {
        handleNextImage();
      }
    } else if (event.key === ' ' || event.code === 'Space' || event.key === 'Spacebar') {
      if (!isVideo) return;
      event.preventDefault();
      // 動画がフォーカスされていなくても Space で再生/一時停止をトグルし、動画にフォーカスを移す
      if (videoRef.current) {
        try { videoRef.current.focus(); } catch (e) { /* ignore */ }
      }
      togglePlayPause();
    } else if (event.key === "h" || event.key === "k") {
      event.preventDefault();
      handlePrevImage();
    } else if (event.key === "l" || event.key === "j") {
      event.preventDefault();
      handleNextImage();
    } else if (event.key === "q" || event.key === "Escape") {
      event.preventDefault();
      dispatch({ type: "CANCEL_SELECTION" });
    } else if (event.key === "d") {
      event.preventDefault();
      setIsSpreadMode(prev => !prev);
    } else if (event.key === "o") {
      event.preventDefault();
      handleSelectDirectory();
    }
  }, [state.status, handlePrevImage, handleNextImage, isVideo]);

  // コンポーネントアンマウント時にタイマーをクリアし、作成した Object URL を破棄
  useEffect(() => {
    return () => {
      if (digitTimerRef.current) {
        window.clearTimeout(digitTimerRef.current as number);
      }
      // 作成した URL を破棄
      revokeRef(objectUrlRef);
      revokeRef(secondObjectUrlRef);
    };
  }, []);

  // キーボードイベントの監視を設定
  useEffect(() => {
    window.addEventListener("keydown", handleKeyPress);
    return () => {
      window.removeEventListener("keydown", handleKeyPress);
    };
  }, [handleKeyPress]);

  return (
    <div className="app-container">
      <header className="app-header" style={{ padding: '0.5rem 1rem', minHeight: 'unset', height: '48px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <h1 style={{ fontSize: '1.2rem', margin: 0 }}>画像閲覧アプリ</h1>
        {/* 現在表示中のファイル名を中央に表示（長ければ省略） */}
        <div style={{ flex: '0 0 auto', textAlign: 'center', maxWidth: '50%', overflow: 'hidden' }}>
          <span style={{ fontSize: '0.95rem', color: '#444' }}>
            {state.status === 'viewing' && state.imageFiles.length > 0
              ? truncate(getBasename(state.imageFiles[state.currentImageIndex]), 40)
              : ''}
          </span>
        </div>
        {state.status === 'viewing' && (
          <span style={{ fontSize: '0.8rem', color: '#888', whiteSpace: 'nowrap' }}>
            {isSpreadMode ? '[見開き]' : '[単頁]'}
          </span>
        )}
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
            <div className={`image-container${isSpreadMode && !isVideo && !isPdf ? ' spread-mode' : ''}`}>
              {isVideo ? (
                <>
                  <video
                    ref={videoRef}
                    src={imageSrc}
                    className="displayed-image"
                    controls
                    preload="metadata"
                    tabIndex={0}
                    onPlay={() => setVideoPlaying(true)}
                    onPause={() => setVideoPlaying(false)}
                  />
                  <div className="video-osd" aria-hidden>{videoPlaying ? '再生中 ▶' : '停止中 ⏸'}</div>
                </>
              ) : isPdf ? (
                <iframe
                  src={imageSrc}
                  title="PDF Viewer"
                  className="displayed-image pdf-viewer"
                />
              ) : (
                <>
                  <img
                    src={imageSrc}
                    alt="選択された画像"
                    className="displayed-image"
                  />
                  {isSpreadMode && secondImageSrc && (
                    <img
                      src={secondImageSrc}
                      alt="見開き2ページ目"
                      className="displayed-image"
                    />
                  )}
                </>
              )}
            </div>
            <div className="navigation-controls" style={{ height: '28px', display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button
                onClick={handlePrevImage}
                className="nav-button"
                type="button"
              >
                ← 前へ
              </button>
              <span className="image-counter">
                {isSpreadMode && secondImageSrc
                  ? `${state.currentImageIndex + 1}-${state.currentImageIndex + 2} / ${state.imageFiles.length}`
                  : `${state.currentImageIndex + 1} / ${state.imageFiles.length}`}
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
