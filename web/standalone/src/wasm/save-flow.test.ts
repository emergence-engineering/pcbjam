import { describe, expect, it, vi } from "vitest";
import { MEMFS_PROJECTS_DIR } from "./constants";
import { registerSaveHook, type SaveHookWindow } from "./save-flow";

const SLUG = "myproj";
const HOME = MEMFS_PROJECTS_DIR; // …/projects  (editor's default "projects home")
const PROJ = `${HOME}/${SLUG}`; // …/projects/myproj  (this project's own folder)

function setup() {
  const saveBytes = vi.fn(async () => {});
  const onSaved = vi.fn();
  const win: SaveHookWindow = {
    FS: { readFile: () => new Uint8Array([1, 2, 3]) } as unknown as SaveHookWindow["FS"],
    kicadCollab: {},
  };
  registerSaveHook(win, { slug: SLUG, saveBytes, onSaved, log: () => {}, onStatus: () => {} });
  return { fire: (p: string) => win.kicadCollab!.onSave!(p), saveBytes, onSaved };
}

describe("registerSaveHook path routing", () => {
  it("routes a file in the project's own folder with its full relative path", () => {
    const { fire, saveBytes, onSaved } = setup();
    fire(`${PROJ}/sub/sheet.kicad_sch`);
    expect(onSaved).toHaveBeenCalledWith("sub/sheet.kicad_sch");
    expect(saveBytes).toHaveBeenCalledWith("sub/sheet.kicad_sch", expect.any(Uint8Array));
  });

  it("routes a bare file saved in the editor's default projects home to the project root", () => {
    const { fire, saveBytes, onSaved } = setup();
    fire(`${HOME}/main.kicad_sch`);
    expect(onSaved).toHaveBeenCalledWith("main.kicad_sch");
    expect(saveBytes).toHaveBeenCalledWith("main.kicad_sch", expect.any(Uint8Array));
  });

  it("ignores a save outside the projects tree", () => {
    const { fire, saveBytes, onSaved } = setup();
    fire(`/home/kicad/stray.kicad_sch`);
    expect(onSaved).not.toHaveBeenCalled();
    expect(saveBytes).not.toHaveBeenCalled();
  });

  it("ignores a file under a DIFFERENT project's folder in the home dir", () => {
    const { fire, saveBytes, onSaved } = setup();
    fire(`${HOME}/other/board.kicad_pcb`);
    expect(onSaved).not.toHaveBeenCalled();
    expect(saveBytes).not.toHaveBeenCalled();
  });
});
