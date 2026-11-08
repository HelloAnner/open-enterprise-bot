import * as RadixAlert from "@radix-ui/react-alert-dialog";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Button } from "./button";

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; confirmLabel: string; onConfirm: () => void;
}) {
  return <RadixAlert.Root open={open} onOpenChange={onOpenChange}><RadixAlert.Portal>
    <RadixAlert.Overlay asChild><motion.div className="dialog-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} /></RadixAlert.Overlay>
    <RadixAlert.Content asChild><motion.section className="panel-dialog confirm-dialog" initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
      <RadixAlert.Title className="confirm-title">{title}</RadixAlert.Title>
      <RadixAlert.Description className="panel-description">{description}</RadixAlert.Description>
      <div className="panel-actions"><RadixAlert.Cancel asChild><Button variant="secondary">取消</Button></RadixAlert.Cancel><RadixAlert.Action asChild><Button variant="danger" onClick={onConfirm}>{confirmLabel}</Button></RadixAlert.Action></div>
    </motion.section></RadixAlert.Content>
  </RadixAlert.Portal></RadixAlert.Root>;
}

export function DialogBody({ children }: { children: ReactNode }) {
  return <div className="panel-form">{children}</div>;
}
