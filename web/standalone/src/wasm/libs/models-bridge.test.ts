import { describe, expect, it } from "vitest";
import {
  ensureModelInMemfs,
  installModel3dHandler,
  normalizeModelRef,
  scanModelRefs,
} from "./models-bridge";
import type { Model3dSource } from "./models-source";

describe("normalizeModelRef", () => {
  it("strips any vintage of the model-dir var", () => {
    for (const v of ["KICAD6", "KICAD7", "KICAD8", "KICAD9", "KICAD10"]) {
      expect(
        normalizeModelRef(`\${${v}_3DMODEL_DIR}/Resistor_SMD.3dshapes/R_0201.wrl`),
      ).toBe("Resistor_SMD.3dshapes/R_0201.wrl");
    }
  });

  it("accepts the paren syntax and the legacy KISYS3DMOD alias", () => {
    expect(normalizeModelRef("$(KICAD8_3DMODEL_DIR)/L.3dshapes/m.step")).toBe(
      "L.3dshapes/m.step",
    );
    expect(normalizeModelRef("${KISYS3DMOD}/L.3dshapes/m.wrl")).toBe(
      "L.3dshapes/m.wrl",
    );
  });

  it("passes bare relative refs through", () => {
    expect(normalizeModelRef("L.3dshapes/m.wrl")).toBe("L.3dshapes/m.wrl");
  });

  it("rejects refs it cannot serve", () => {
    expect(normalizeModelRef("${KIPRJMOD}/libs/3d/m.wrl")).toBeNull(); // project-local
    expect(normalizeModelRef("/abs/path/m.wrl")).toBeNull();
    expect(normalizeModelRef("kicad_embed://m.wrl")).toBeNull();
    expect(normalizeModelRef("")).toBeNull();
    expect(normalizeModelRef("${UNCLOSED/m.wrl")).toBeNull();
  });
});

describe("ensureModelInMemfs format fallback", () => {
  function installFakes(available: (ref: string) => boolean) {
    const files = new Map<string, Uint8Array>();
    const fs = {
      mkdirTree: () => {},
      writeFile: (p: string, b: Uint8Array) => void files.set(p, b),
      analyzePath: (p: string) => ({ exists: files.has(p) }),
    };
    (globalThis as unknown as { window: unknown }).window ??= globalThis;
    (globalThis as unknown as { FS: unknown }).FS = fs;
    const source: Model3dSource = {
      getModelBody: async (ref) =>
        available(ref) ? new TextEncoder().encode(`body:${ref}`) : null,
      hasModel: async (ref) => available(ref),
    };
    installModel3dHandler(source, () => {});
    return files;
  }

  it("serves a .wrl ask from the same-stem .step, under the .step path", async () => {
    // kicad-packages3D is STEP-only from 10.x — old boards still ask for .wrl.
    const files = installFakes((r) => r.endsWith(".step"));
    const dest = await ensureModelInMemfs("FallbackLibA.3dshapes/M1.wrl");
    // Returned (and written) under the SUBSTITUTED extension: the path picks
    // the parsing plugin, so the .step body must dispatch to oce, not vrml.
    expect(dest).toBe("/pcbjam/3dmodels/FallbackLibA.3dshapes/M1.step");
    expect(files.has("/pcbjam/3dmodels/FallbackLibA.3dshapes/M1.step")).toBe(true);
    expect(files.has("/pcbjam/3dmodels/FallbackLibA.3dshapes/M1.wrl")).toBe(false);
  });

  it("prefers the exact ref when it exists", async () => {
    const files = installFakes(() => true);
    const dest = await ensureModelInMemfs("FallbackLibB.3dshapes/M2.wrl");
    expect(dest).toBe("/pcbjam/3dmodels/FallbackLibB.3dshapes/M2.wrl");
    expect(files.has("/pcbjam/3dmodels/FallbackLibB.3dshapes/M2.wrl")).toBe(true);
  });

  it("resolves null when no format of the model exists", async () => {
    installFakes(() => false);
    expect(await ensureModelInMemfs("FallbackLibC.3dshapes/M3.wrl")).toBeNull();
  });
});

describe("scanModelRefs", () => {
  it("finds, normalizes and dedupes board model refs", () => {
    const board = `
      (footprint "Resistor_THT:R_Axial"
        (model "\${KICAD10_3DMODEL_DIR}/Resistor_THT.3dshapes/R_Axial.step"
          (offset (xyz 0 0 0))))
      (footprint "Resistor_THT:R_Axial"
        (model "\${KICAD10_3DMODEL_DIR}/Resistor_THT.3dshapes/R_Axial.step"))
      (footprint "X:Y"
        (model "\${KIPRJMOD}/libs/3d_shapes/custom.wrl"))
      (footprint "L:M" (model "\${KICAD8_3DMODEL_DIR}/LED_THT.3dshapes/LED_D5.0mm.wrl"))
    `;
    expect(scanModelRefs(board).sort()).toEqual([
      "LED_THT.3dshapes/LED_D5.0mm.wrl",
      "Resistor_THT.3dshapes/R_Axial.step",
    ]);
  });

  it("handles escaped quotes inside the path", () => {
    expect(
      scanModelRefs('(model "${KICAD9_3DMODEL_DIR}/A.3dshapes/we\\"ird.wrl")'),
    ).toEqual(['A.3dshapes/we"ird.wrl']);
  });

  it("returns empty for a board with no models", () => {
    expect(scanModelRefs("(kicad_pcb (version 20240101))")).toEqual([]);
  });
});
