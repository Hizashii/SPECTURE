import {
  CircleHelp,
  Cpu,
  Database,
  HardDrive,
  KeyRound,
  Lock,
  Server,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import type { EdgeKind } from "../../lib/schemas";
import type { NodeKind } from "./model";

export const KIND_META: Record<NodeKind, { label: string; icon: LucideIcon }> = {
  user: { label: "Human identity", icon: UserRound },
  service: { label: "Service identity", icon: Server },
  role: { label: "IAM role", icon: KeyRound },
  database: { label: "Database", icon: Database },
  object_storage: { label: "Object storage", icon: HardDrive },
  secret: { label: "Secret", icon: Lock },
  compute: { label: "Compute", icon: Cpu },
  unknown: { label: "Unknown type", icon: CircleHelp },
};

export const EDGE_META: Record<EdgeKind, { label: string; color: string; dash?: string }> = {
  inventory: { label: "Declared in scenario", color: "var(--color-ink-3)", dash: "2 4" },
  authorized: { label: "Allowed transition", color: "var(--color-signal)" },
  prerequisite: { label: "Modeled prerequisite", color: "var(--color-high)" },
  rejected: { label: "Rejected", color: "var(--color-critical)", dash: "6 4" },
  unsupported: { label: "Unsupported", color: "var(--color-unsupported)", dash: "1 5" },
};

export const EDGE_ORDER: EdgeKind[] = [
  "authorized",
  "prerequisite",
  "rejected",
  "unsupported",
  "inventory",
];
