import type { LibInfo, LibItemInfo, LibsSource } from "./source";

/**
 * A static, in-memory `LibsSource` — two handcrafted symbols, no backend. The
 * offline fallback when no API base is configured (and the origin of the libs
 * 0002 spike). Keeps the editor's lib chooser populated in a bare checkout.
 */

const STATIC_LIB: LibInfo = {
  id: "examples",
  name: "pcbjam-examples",
  description: "Built-in example symbols (offline)",
};

const wrapLib = (symbolBody: string) =>
  `(kicad_symbol_lib (version 20241209) (generator "pcbjam") (generator_version "0.1")
${symbolBody}
)
`;

const SYMBOLS: Record<string, string> = {
  R: `  (symbol "R" (pin_numbers hide) (pin_names (offset 0)) (exclude_from_sim no) (in_bom yes) (on_board yes)
    (property "Reference" "R" (at 2.032 0 90) (effects (font (size 1.27 1.27))))
    (property "Value" "R" (at 0 0 90) (effects (font (size 1.27 1.27))))
    (property "Footprint" "" (at -1.778 0 90) (effects (font (size 1.27 1.27)) hide))
    (property "Datasheet" "~" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
    (property "Description" "Resistor (pcbjam example)" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
    (property "ki_keywords" "R res resistor" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
    (symbol "R_0_1"
      (rectangle (start -1.016 -2.54) (end 1.016 2.54) (stroke (width 0.254) (type default)) (fill (type none)))
    )
    (symbol "R_1_1"
      (pin passive line (at 0 3.81 270) (length 1.27)
        (name "~" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27)))))
      (pin passive line (at 0 -3.81 90) (length 1.27)
        (name "~" (effects (font (size 1.27 1.27)))) (number "2" (effects (font (size 1.27 1.27)))))
    )
  )`,
  C: `  (symbol "C" (pin_numbers hide) (pin_names (offset 0.254)) (exclude_from_sim no) (in_bom yes) (on_board yes)
    (property "Reference" "C" (at 0.635 2.54 0) (effects (font (size 1.27 1.27)) (justify left)))
    (property "Value" "C" (at 0.635 -2.54 0) (effects (font (size 1.27 1.27)) (justify left)))
    (property "Footprint" "" (at 0.9652 -3.81 0) (effects (font (size 1.27 1.27)) hide))
    (property "Datasheet" "~" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
    (property "Description" "Capacitor (pcbjam example)" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
    (property "ki_keywords" "cap capacitor" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
    (symbol "C_0_1"
      (polyline (pts (xy -2.032 -0.762) (xy 2.032 -0.762)) (stroke (width 0.508) (type default)) (fill (type none)))
      (polyline (pts (xy -2.032 0.762) (xy 2.032 0.762)) (stroke (width 0.508) (type default)) (fill (type none)))
    )
    (symbol "C_1_1"
      (pin passive line (at 0 3.81 270) (length 2.794)
        (name "~" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27)))))
      (pin passive line (at 0 -3.81 90) (length 2.794)
        (name "~" (effects (font (size 1.27 1.27)))) (number "2" (effects (font (size 1.27 1.27)))))
    )
  )`,
};

export function staticLibsSource(): LibsSource {
  return {
    async listLibs(): Promise<LibInfo[]> {
      return [STATIC_LIB];
    },
    async listItems(libId: string): Promise<LibItemInfo[]> {
      if (libId !== STATIC_LIB.id) return [];
      return Object.keys(SYMBOLS).map((name) => ({ kind: "symbol", name }));
    },
    async getItemBody(
      libId: string,
      _kind: string,
      name: string,
    ): Promise<string | null> {
      if (libId !== STATIC_LIB.id) return null;
      const body = SYMBOLS[name];
      return body ? wrapLib(body) : null;
    },
  };
}
