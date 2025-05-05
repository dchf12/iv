// Wails APIの型定義
declare namespace window {
  namespace go {
    namespace main {
      namespace ImageViewerService {
        function SelectDirectory(): Promise<string>
        function GetImageFiles(directoryPath: string): Promise<string[]>
      }
    }
  }

  namespace runtime {
    function EventsOn(eventName: string, callback: (...args: any[]) => void): () => void
    function EventsOff(eventName: string): void
    function EventsEmit(eventName: string, ...args: any[]): void
  }
}
