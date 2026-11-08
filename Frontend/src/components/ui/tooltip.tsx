import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ReactElement } from "react";

export const TooltipProvider = RadixTooltip.Provider;
export function Tooltip({ label, children }: { label: string; children: ReactElement }) {
  return <RadixTooltip.Root><RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger><RadixTooltip.Portal><RadixTooltip.Content className="tooltip" sideOffset={7}>{label}</RadixTooltip.Content></RadixTooltip.Portal></RadixTooltip.Root>;
}
