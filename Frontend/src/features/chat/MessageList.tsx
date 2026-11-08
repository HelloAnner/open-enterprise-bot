import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, Copy, MoreHorizontal, Smile, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { DropdownContent, DropdownItem, DropdownMenu, DropdownMenuTrigger, DropdownSeparator } from "@/components/ui/menu";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { messageText } from "@/domain/chat/message";
import type { Bot } from "@/domain/bot/types";
import type { ChatMessage } from "@/domain/chat/types";
import { copyText, cn } from "@/lib/utils";
import { useDeleteMessageMutation, useReactionMutation } from "@/api/hooks/messages";
import { useUiStore } from "@/stores/uiStore";
import { MessageBody, RelayMeta } from "./MessageBody";
import { ThinkingIndicator } from "./ThinkingIndicator";

const cardKinds = ["choice", "secure", "kanban", "email", "images"];
const reactions = ["👍", "❤️", "😂", "🎉", "🙏", "👀"];

function MessageItem({ message, botId, onImage, onKanban, onFile, replyText }: {
  replyText?: string;
  message: ChatMessage; botId: string; onImage: (src: string) => void; onKanban: () => void; onFile: (message: ChatMessage) => void;
}) {
  const setReplyTo = useUiStore((state) => state.setReplyTo);
  const reaction = useReactionMutation(botId);
  const remove = useDeleteMessageMutation(botId);
  const copy = (text: string) => { void copyText(text).then(() => toast.success("已复制")).catch(() => toast.error("复制失败，请检查浏览器权限")); };
  return <motion.article layout="position" className={cn("message-row", message.from, message.reaction && "with-reaction")} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} data-message-id={message.id}>
    <div className={cn("message-stack", cardKinds.includes(message.kind) && "card-stack")}><MessageBody message={message} replyText={replyText} botId={botId} onImage={onImage} onKanban={onKanban} onFile={onFile} />{message.reaction && <span className="reaction">{message.reaction}</span>}</div>
    <div className="message-actions" aria-label="消息操作">
      <Popover><PopoverTrigger asChild><Button variant="ghost" size="icon" className="message-action" aria-label="添加表情"><Smile /></Button></PopoverTrigger><PopoverContent>{reactions.map((emoji) => <PopoverClose asChild key={emoji}><Button variant="ghost" size="icon" className="emoji-choice" onClick={() => reaction.mutate({ messageId: message.id, reaction: emoji })}>{emoji}</Button></PopoverClose>)}</PopoverContent></Popover>
      <Button variant="ghost" size="icon" className="message-action" aria-label="回复" onClick={() => setReplyTo({ id: message.id, text: messageText(message).slice(0, 100) })}><Undo2 /></Button>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="message-action" aria-label="更多操作"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownContent align="end"><DropdownItem onSelect={() => copy(messageText(message))}><Copy />复制</DropdownItem><DropdownItem onSelect={() => copy(message.id)}><Copy />复制消息 ID</DropdownItem><DropdownSeparator /><DropdownItem className="danger" disabled={remove.isPending} onSelect={() => remove.mutate(message.id)}><Trash2 />删除消息</DropdownItem></DropdownContent></DropdownMenu>
    </div>
  </motion.article>;
}

export function MessageList({ botId, bot, taskPhase, messages, thinking, isLoading, isError, error, onRetry, onImage, onKanban, onFile }: {
  botId: string; bot: Bot; taskPhase: "working" | "thinking"; messages: ChatMessage[]; thinking: boolean; isLoading: boolean; isError: boolean; error?: Error; onRetry: () => void;
  onImage: (src: string) => void; onKanban: () => void; onFile: (message: ChatMessage) => void;
}) {
  const scrollRef = useRef<HTMLElement>(null);
  const previousCount = useRef<number | undefined>(undefined);
  const [showBottom, setShowBottom] = useState(false);
  useEffect(() => {
    if (isLoading || isError) return;
    const grew = previousCount.current === undefined || messages.length > previousCount.current;
    previousCount.current = messages.length;
    if ((!grew && !thinking) || (showBottom && messages.at(-1)?.from !== "user")) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "instant" });
  }, [messages.length, thinking, isLoading, isError]);
  useEffect(() => {
    const node = scrollRef.current;
    if (node) setShowBottom(node.scrollHeight - node.scrollTop - node.clientHeight > 150);
  }, [isLoading, messages.length]);
  return <>
    <section className="messages" ref={scrollRef} aria-label="对话消息" aria-busy={isLoading} onScroll={(event) => {
      const node = event.currentTarget;
      setShowBottom(node.scrollHeight - node.scrollTop - node.clientHeight > 150);
    }}><div className="messages-inner" aria-live="polite">
      {isLoading ? <div className="message-loading"><i /><i /><i /></div> : isError ? <div className="chat-state"><p>{error?.message ?? "消息加载失败"}</p><Button variant="secondary" onClick={onRetry}>重新加载</Button></div> : <>
        <AnimatePresence initial={false}>{messages.map((message) => {
          if (message.kind === "time") return <div className="time-divider" key={message.id}>{message.text}</div>;
          if (message.kind === "relay") return <RelayMeta message={message} key={message.id} />;
          const quoted = messages.find(item=>item.id===message.replyTo);
          return <MessageItem key={message.id} message={message} replyText={quoted ? messageText(quoted) : undefined} botId={botId} onImage={onImage} onKanban={onKanban} onFile={onFile} />;
        })}</AnimatePresence>
        {thinking && <ThinkingIndicator bot={bot} phase={taskPhase} />}
      </>}
    </div></section>
    {showBottom && !isLoading && <Button variant="ghost" size="icon" className="scroll-bottom" aria-label="滚动到最新消息" onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })}><ArrowDown /></Button>}
  </>;
}
