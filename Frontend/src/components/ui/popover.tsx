import * as RadixPopover from "@radix-ui/react-popover";
import { motion } from "motion/react";
import type { ReactNode } from "react";

export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;
export const PopoverClose = RadixPopover.Close;
export function PopoverContent({ children }: { children: ReactNode }) {
  return <RadixPopover.Portal><RadixPopover.Content asChild sideOffset={6}><motion.div className="emoji-popover" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>{children}</motion.div></RadixPopover.Content></RadixPopover.Portal>;
}
