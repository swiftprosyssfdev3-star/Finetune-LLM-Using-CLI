/**
 * Global TypeScript declarations for Bauhaus Fine-Tuning Studio
 */

// Extend HTMLInputElement for webkitdirectory support (folder uploads)
declare global {
  interface HTMLInputElement {
    webkitdirectory: boolean;
    directory: boolean;
  }
}

// File System Entry API for drag-and-drop folder support
interface FileSystemEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
}

interface FileSystemFileEntry extends FileSystemEntry {
  isFile: true;
  isDirectory: false;
  file(successCallback: (file: File) => void, errorCallback?: (error: Error) => void): void;
}

interface FileSystemDirectoryEntry extends FileSystemEntry {
  isFile: false;
  isDirectory: true;
  createReader(): FileSystemDirectoryReader;
}

interface FileSystemDirectoryReader {
  readEntries(
    successCallback: (entries: FileSystemEntry[]) => void,
    errorCallback?: (error: Error) => void
  ): void;
}

// Extend DataTransferItem for webkitGetAsEntry
interface DataTransferItem {
  webkitGetAsEntry(): FileSystemEntry | null;
}

// Extend File for webkitRelativePath
interface File {
  readonly webkitRelativePath: string;
}

export {};
