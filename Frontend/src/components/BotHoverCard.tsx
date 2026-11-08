import type { ReactElement } from "react";
import type { Bot } from "@/domain/bot/types";
import { BotAvatar } from "./BotAvatar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./ui/hover-card";

export function BotHoverCard({ bot, children }: { bot?: Bot; children: ReactElement }) {
  if (!bot) return children;
  return <HoverCard openDelay={350} closeDelay={140}><HoverCardTrigger asChild>{children}</HoverCardTrigger><HoverCardContent>
    <div className="hover-card-heading"><span className="mini-brand-avatar"><BotAvatar shape={bot.shape} color={bot.color} /></span><strong>{bot.name}</strong></div>
    <p>{bot.preview}</p>
  </HoverCardContent></HoverCard>;
}
