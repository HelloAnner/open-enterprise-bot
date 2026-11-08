export const AVATAR_SHAPES = [
  "circle", "bean", "square", "spark", "flower",
  "cloud", "splat", "drop", "pill", "triangle",
  "home", "pebble", "hex",
] as const;

export type AvatarShape = (typeof AVATAR_SHAPES)[number];

export const BOT_COLORS = [
  "#111111", "#a97943", "#ff4967", "#ff7b18", "#ffac19", "#18c884",
  "#13bfa6", "#2589f5", "#9655ed", "#f23e98", "#a6a6a6",
] as const;

export interface Bot {
  id: string;
  name: string;
  shape: AvatarShape;
  color: string;
  accent: string;
  preview: string;
  group: string;
  hiddenInList?: boolean;
  hidden?: boolean;
  pinned?: boolean;
  unread?: boolean;
}
