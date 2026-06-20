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

const TONES: Record<SourceKind, string> = {
  local: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  "remote-ro": "border-amber-500/40 bg-amber-500/10 text-amber-300",
  "remote-rw": "border-sky-500/40 bg-sky-500/10 text-sky-300",
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
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONES[descriptor.kind]} ${className}`}
    >
      <Icon size={13} />
      {descriptor.label}
    </span>
  );
}
