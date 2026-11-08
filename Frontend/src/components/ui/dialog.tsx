import * as RadixDialog from "@radix-ui/react-dialog";
import { motion } from "motion/react";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export function DialogContent({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return <RadixDialog.Portal>
    <RadixDialog.Overlay asChild><motion.div className="dialog-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} /></RadixDialog.Overlay>
    <RadixDialog.Content asChild>
      <motion.section className={cn("panel-dialog", className)} initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.2 }}>
        <div className="dialog-header"><RadixDialog.Title>{title}</RadixDialog.Title><RadixDialog.Close className="icon-button" aria-label="关闭"><X size={19} /></RadixDialog.Close></div>
        <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
        {children}
      </motion.section>
    </RadixDialog.Content>
  </RadixDialog.Portal>;
}
