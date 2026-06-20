import { Cloud, CloudOff, HardDrive } from "lucide-react";
import type { SourceKind, SourceDescriptor } from "@/lib/project-source-shared";

/**
 * A small chip that says — explicitly — where a project lives and whether saves
 * persist there: "Local (this browser)", "Remote · read-only", or "Remote ·
 * editable". Shown on the home page sections, the project view, and inside the
 * editor so the user always knows what Save does. `title` carries the longer
 * description for hover.
 */
const ICONS: Record<SourceKind, typeof HardDrive> = {
  local: HardDrive,
  "remote-ro": CloudOff,
  "remote-rw": Cloud,
};

// Solid fills with white text + a subtle inset ring, so the chip is legible on
// any backdrop — the home page, the dark boot screen, or the light editor canvas
// (the translucent pastel version washed out on the canvas).
const TONES: Record<SourceKind, string> = {
  local: "bg-emerald-600 text-white ring-emerald-300/30",
  "remote-ro": "bg-amber-600 text-white ring-amber-300/30",
  "remote-rw": "bg-sky-600 text-white ring-sky-300/30",
};

export function SourceChip({
  descriptor,
  className = "",
}: {
  descriptor: SourceDescriptor;
  className?: string;
}) {
  const Icon = ICONS[descriptor.kind];
  return (
    <span
      title={descriptor.description}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium shadow-sm ring-1 ring-inset ${TONES[descriptor.kind]} ${className}`}
    >
      <Icon size={13} />
      {descriptor.label}
    </span>
  );
}
