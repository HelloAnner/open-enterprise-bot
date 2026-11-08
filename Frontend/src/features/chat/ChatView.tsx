import { lazy, Suspense, useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { toast } from "sonner";
import { BotAvatar } from "@/components/BotAvatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { ChatMessage } from "@/domain/chat/types";
import { copyText } from "@/lib/utils";
import { useBotsQuery } from "@/api/hooks/bots";
import { useMessagesQuery } from "@/api/hooks/messages";
import { useUiStore } from "@/stores/uiStore";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { FilePreviewDialog } from "@/features/files/FilePreviewDialog";

const KanbanDialog = lazy(() => import("@/features/kanban/KanbanDialog").then((module) => ({ default: module.KanbanDialog })));

export function ChatView({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const botsQuery = useBotsQuery();
  const activeBotId = useUiStore((state) => state.activeBotId);
  const selectBot = useUiStore((state) => state.selectBot);
  const bot = botsQuery.data?.find((item) => item.id === activeBotId);
  const messagesQuery = useMessagesQuery(activeBotId, Boolean(bot));
  const thinking = useUiStore((state) => state.typingBotIds.includes(activeBotId));
  const taskPhase = useUiStore((state) => state.taskPhases[activeBotId] ?? "working");
  const [image, setImage] = useState<string>();
  const [file, setFile] = useState<ChatMessage>();
  const [kanbanOpen, setKanbanOpen] = useState(false);
  useEffect(() => {
    if (botsQuery.data?.length && !bot) selectBot(botsQuery.data[0].id);
  }, [bot, botsQuery.data, selectBot]);
  if (!bot) return <main className="conversation"><div className="chat-state">{botsQuery.isLoading ? "正在加载工作空间…" : <><p>{botsQuery.error?.message ?? "当前没有可用的 Bot"}</p>{botsQuery.isError && <Button variant="secondary" onClick={() => void botsQuery.refetch()}>重新加载</Button>}</>}</div></main>;
  return <main className="conversation" style={{ "--accent": bot.accent } as React.CSSProperties}>
    <header className="chat-header"><Button variant="ghost" size="icon" className="round-button mobile-menu" aria-label="打开对话列表" onClick={onOpenSidebar}><Menu /></Button><Button variant="ghost" className="active-bot-pill" aria-label="当前 Bot" onClick={() => toast(`你正在与 ${bot.name} 对话`)}><BotAvatar shape={bot.shape} color={bot.color} /><span>{bot.name}</span></Button><Button variant="ghost" className="share-button" onClick={() => { void copyText(`${location.href.split("#")[0]}#bot=${bot.id}`).then(() => toast.success("分享链接已复制")).catch(() => toast.error("复制失败")); }}>分享</Button></header>
    <MessageList key={bot.id} botId={bot.id} bot={bot} taskPhase={taskPhase} messages={messagesQuery.data ?? []} thinking={thinking} isLoading={messagesQuery.isLoading} isError={messagesQuery.isError} error={messagesQuery.error ?? undefined} onRetry={() => void messagesQuery.refetch()} onImage={setImage} onKanban={() => setKanbanOpen(true)} onFile={setFile} />
    <Composer bot={bot} disabled={messagesQuery.isLoading || messagesQuery.isError} />
    <Dialog open={Boolean(image)} onOpenChange={(open) => { if (!open) setImage(undefined); }}><DialogContent title="图片预览" className="image-dialog"><img className="image-preview" src={image} alt="消息图片大图预览" /></DialogContent></Dialog>
    <FilePreviewDialog message={file} onClose={() => setFile(undefined)} />
    <Suspense fallback={null}><KanbanDialog open={kanbanOpen} onOpenChange={setKanbanOpen} /></Suspense>
  </main>;
}
