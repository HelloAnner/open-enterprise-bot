import * as RadixHoverCard from "@radix-ui/react-hover-card";
import { motion } from "motion/react";
import type { ReactNode } from "react";

export const HoverCard = RadixHoverCard.Root;
export const HoverCardTrigger = RadixHoverCard.Trigger;
export function HoverCardContent({ children }: { children: ReactNode }) {
  return <RadixHoverCard.Portal><RadixHoverCard.Content asChild side="right" align="start" sideOffset={12} collisionPadding={12}><motion.aside className="bot-hover-card" initial={{ opacity: 0, x: -5, scale: 0.98 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ duration: 0.16 }}>{children}</motion.aside></RadixHoverCard.Content></RadixHoverCard.Portal>;
}
