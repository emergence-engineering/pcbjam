/**
 * Hand a saved file's bytes to the browser as a download — the save path of
 * last resort when nothing writable backs the session (webkitdirectory
 * folders give a read-only FileList).
 */
export function downloadBytes(relPath: string, bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
  const a = document.createElement("a");
  a.href = url;
  a.download = relPath.split("/").pop() ?? relPath;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
