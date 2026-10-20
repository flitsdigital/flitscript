// File System Access API (Chrome); not yet in TypeScript's DOM lib.
interface Window {
  showSaveFilePicker(options?: {
    suggestedName?: string;
    types?: { description?: string; accept: Record<string, string[]> }[];
  }): Promise<FileSystemFileHandle>;
}

interface Window {
  showOpenFilePicker(options?: {
    multiple?: boolean;
    types?: { description?: string; accept: Record<string, string[]> }[];
  }): Promise<FileSystemFileHandle[]>;
}

interface DataTransferItem {
  getAsFileSystemHandle(): Promise<FileSystemHandle | null>;
}

// EyeDropper API (Chrome): pick any colour on screen.
interface Window {
  EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> };
}
