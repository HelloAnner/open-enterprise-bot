import * as Dropdown from "@radix-ui/react-dropdown-menu";
import * as Context from "@radix-ui/react-context-menu";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const DropdownMenu = Dropdown.Root;
export const DropdownMenuTrigger = Dropdown.Trigger;
export const ContextMenu = Context.Root;
export const ContextMenuTrigger = Context.Trigger;

export function DropdownContent({ children, align = "center", className }: { children: ReactNode; align?: "start" | "center" | "end"; className?: string }) {
  return <Dropdown.Portal><Dropdown.Content asChild align={align} sideOffset={7}><motion.div className={cn("context-menu", className)} initial={{ opacity: 0, y: 4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}>{children}</motion.div></Dropdown.Content></Dropdown.Portal>;
}
export function ContextContent({ children }: { children: ReactNode }) {
  return <Context.Portal><Context.Content asChild><motion.div className="context-menu" initial={{ opacity: 0, y: 4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}>{children}</motion.div></Context.Content></Context.Portal>;
}
export const DropdownItem = ({ className, ...props }: Dropdown.DropdownMenuItemProps) => <Dropdown.Item className={cn("menu-item", className)} {...props} />;
export const ContextItem = ({ className, ...props }: Context.ContextMenuItemProps) => <Context.Item className={cn("menu-item", className)} {...props} />;
export const DropdownSeparator = () => <Dropdown.Separator className="menu-separator" />;
export const ContextSeparator = () => <Context.Separator className="menu-separator" />;
