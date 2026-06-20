import type { NewFile } from "./idb-project-store";

/**
 * Read a picked folder's bytes into memory so it can be COPIED into a
 * browser-local (IndexedDB) project. Unlike the File System Access write-back
 * flow, this never holds disk handles — the import is a snapshot; the user's
 * original files are untouched and edits live only in IDB (export to get them
 * back out). Two pickers, same result: FSA directory handle (Chromium) or a
 * webkitdirectory FileList (Firefox/Safari).
 */
export interface ImportedFolder {
  name: string;
  files: NewFile[];
}

/** Walk a File System Access directory handle, reading every file's bytes. */
export async function importFsaFolder(
  root: FileSystemDirectoryHandle,
): Promise<ImportedFolder> {
  const files: NewFile[] = [];
  async function walk(
    dir: FileSystemDirectoryHandle,
    prefix: string,
  ): Promise<void> {
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === "file") {
        const file = await (handle as FileSystemFileHandle).getFile();
        files.push({
          path: prefix + name,
          bytes: new Uint8Array(await file.arrayBuffer()),
        });
      } else {
        await walk(handle as FileSystemDirectoryHandle, `${prefix}${name}/`);
      }
    }
  }
  await walk(root, "");
  return { name: root.name, files };
}

/** Read a webkitdirectory FileList, stripping the leading top-folder segment. */
export async function importFileList(fileList: FileList): Promise<ImportedFolder> {
  const list = Array.from(fileList);
  const first = list[0];
  const topPrefix = first?.webkitRelativePath?.includes("/")
    ? first.webkitRelativePath.split("/")[0] + "/"
    : "";
  const files: NewFile[] = [];
  for (const f of list) {
    const rel = f.webkitRelativePath || f.name;
    const path = rel.startsWith(topPrefix) ? rel.slice(topPrefix.length) : rel;
    files.push({ path, bytes: new Uint8Array(await f.arrayBuffer()) });
  }
  return { name: topPrefix ? topPrefix.slice(0, -1) : "local", files };
}
