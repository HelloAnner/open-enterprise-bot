import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bell, ChevronDown, ChevronRight, Copy, EyeOff, Folder, LayoutGrid, Pencil, Pin, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BotAvatar } from "@/components/BotAvatar";
import { BotHoverCard } from "@/components/BotHoverCard";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContextContent, ContextItem, ContextMenu, ContextMenuTrigger, ContextSeparator } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/tooltip";
import type { Bot } from "@/domain/bot/types";
import { copyText, cn } from "@/lib/utils";
import { useBotsQuery, useDeleteBotMutation, usePatchBotMutation } from "@/api/hooks/bots";
import { useUiStore } from "@/stores/uiStore";
import { BotEditorDialog } from "@/features/bot/BotEditorDialog";
import { MoveBotDialog } from "@/features/bot/MoveBotDialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useSession, logout } from "@/api/session";

function BotListItem({ bot, onMove, onRename, onDelete, onSelected }: { bot: Bot; onMove: () => void; onRename: () => void; onDelete: () => void; onSelected: () => void }) {
  const activeBotId = useUiStore((state) => state.activeBotId);
  const selectBot = useUiStore((state) => state.selectBot);
  const patchBot = usePatchBotMutation();
  const processing = useUiStore((state) => state.typingBotIds.includes(bot.id));
  const [hovered, setHovered] = useState(false);
  return <ContextMenu><BotHoverCard bot={bot}><ContextMenuTrigger asChild><button className={cn(bot.pinned ? "pinned-bot" : "bot-item", bot.id === activeBotId && "selected")} onClick={() => { selectBot(bot.id); onSelected(); }} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} onPointerCancel={() => setHovered(false)} onFocus={() => setHovered(true)} onBlur={() => setHovered(false)} aria-label={`打开 ${bot.name}`} aria-current={bot.id === activeBotId ? "page" : undefined}>
    <span className="bot-avatar-wrap"><BotAvatar shape={bot.shape} color={bot.color} active={hovered} processing={processing} /></span>
    {bot.pinned ? <span className="pinned-name">{bot.name}</span> : <span className="bot-copy"><span className="bot-name">{bot.name}</span><span className="bot-preview">{bot.preview}</span></span>}
    {bot.unread && <span className="unread-dot" aria-label="未读" />}
  </button></ContextMenuTrigger></BotHoverCard><ContextContent>
    <ContextItem onSelect={() => patchBot.mutate({ id: bot.id, patch: { pinned: !bot.pinned } })}><Pin />{bot.pinned ? "取消置顶" : "置顶"}</ContextItem>
    <ContextItem onSelect={onMove}><Folder /><span>移至</span><ChevronRight className="menu-trailing" /></ContextItem>
    <ContextItem onSelect={() => patchBot.mutate({ id: bot.id, patch: { unread: true } })}><Bell />标为未读</ContextItem><ContextSeparator />
    <ContextItem onSelect={onRename}><Pencil />重命名 Bot</ContextItem><ContextSeparator />
    <ContextItem onSelect={() => { void copyText(bot.id).then(() => toast.success("Bot ID 已复制")).catch(() => toast.error("复制失败")); }}><Copy />复制 Bot ID</ContextItem><ContextSeparator />
    <ContextItem onSelect={() => patchBot.mutate({ id: bot.id, patch: { hidden: true } }, { onSuccess: () => { if (activeBotId === bot.id) selectBot(""); toast.success("已从侧边栏隐藏"); } })}><EyeOff />从侧边栏隐藏</ContextItem>
    <ContextItem className="danger" onSelect={onDelete}><Trash2 />删除</ContextItem>
  </ContextContent></ContextMenu>;
}

export function Sidebar({ mobileOpen, onMobileClose }: { mobileOpen: boolean; onMobileClose: () => void }) {
  const botsQuery = useBotsQuery();
  const deleteBot = useDeleteBotMutation();
  const bots = botsQuery.data ?? [];
  const session = useSession();
  const patch = usePatchBotMutation();
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const query = useUiStore((state) => state.searchQuery);
  const collapsed = useUiStore((state) => state.collapsedGroups);
  const { selectBot, setSearchQuery, toggleGroup } = useUiStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingBot, setEditingBot] = useState<Bot>();
  const [movingBot, setMovingBot] = useState<Bot>();
  const [deletingBot, setDeletingBot] = useState<Bot>();
  const visibleBots = bots.filter((bot) => !bot.hidden && `${bot.name} ${bot.preview}`.toLowerCase().includes(query.trim().toLowerCase()));
  const pinnedBots = visibleBots.filter((bot) => bot.pinned);
  const listedBots = visibleBots.filter((bot) => !bot.pinned);
  const groups = [...new Set(listedBots.map((bot) => bot.group))].sort((a, b) => a === "未分组" ? 1 : b === "未分组" ? -1 : 0);
  const itemProps = (bot: Bot) => ({ bot, onMove: () => setMovingBot(bot), onRename: () => { setEditingBot(bot); setEditorOpen(true); }, onDelete: () => setDeletingBot(bot), onSelected: onMobileClose });

  return <>
    <aside className={cn("sidebar", mobileOpen && "open", searchOpen && "search-open")} aria-label="Bot 对话列表">
      <div className="sidebar-actions"><Tooltip label="搜索对话"><Button variant="ghost" size="icon" className="round-button" aria-label="搜索对话" onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearchQuery(""); }}><Search /></Button></Tooltip><Tooltip label="创建新 Bot"><Button variant="ghost" size="icon" className="round-button" aria-label="创建新 Bot" onClick={() => { setEditingBot(undefined); setEditorOpen(true); }}><Plus /></Button></Tooltip></div>
      <AnimatePresence>{searchOpen && <motion.div className="search-panel" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}><Search size={16} /><Input type="search" value={query} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜索 Bot" aria-label="搜索 Bot" autoFocus /></motion.div>}</AnimatePresence>
      <nav className="bot-list" aria-busy={botsQuery.isLoading}>{botsQuery.isLoading ? <div className="bot-list-loading">{[1, 2, 3, 4].map((item) => <div className="bot-skeleton" key={item} />)}</div> : botsQuery.isError ? <div className="empty-search"><p>{botsQuery.error.message}</p><Button variant="secondary" size="sm" onClick={() => void botsQuery.refetch()}>重新加载</Button></div> : !visibleBots.length ? <div className="empty-search">没有找到相关 Bot</div> : <>
        {pinnedBots.length > 0 && <section className="pinned-bots" aria-label="置顶 Bot">{pinnedBots.map((bot) => <BotListItem key={bot.id} {...itemProps(bot)} />)}</section>}
        {query.trim() ? listedBots.map((bot) => <BotListItem key={bot.id} {...itemProps(bot)} />) : groups.map((group) => <section key={group}>
          <button className="group-title" onClick={() => toggleGroup(group)} aria-expanded={!collapsed.includes(group)}><span>{group}</span><ChevronDown className={cn("group-chevron", collapsed.includes(group) && "collapsed")} /></button>
          {!collapsed.includes(group) && <div>{listedBots.filter((bot) => bot.group === group).map((bot) => <BotListItem key={bot.id} {...itemProps(bot)} />)}</div>}
        </section>)}
      </>}</nav>
      <div className="sidebar-footer"><Button variant="ghost" className="profile" onClick={() => setProfileOpen(true)}><span className="profile-avatar">{session.data?.name.slice(0,1)}</span><span>{session.data?.name}</span></Button><Tooltip label="全部 Bot"><Button variant="ghost" size="icon" aria-label="全部 Bot" onClick={() => setDirectoryOpen(true)}><LayoutGrid /></Button></Tooltip></div>
    </aside>
    {mobileOpen && <motion.button className="sidebar-scrim" aria-label="关闭对话列表" onClick={onMobileClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} />}
    <Dialog open={profileOpen} onOpenChange={setProfileOpen}><DialogContent title="当前账户"><p>{session.data?.name} · {session.data?.username}</p><Button variant="secondary" onClick={() => void logout().catch(e=>toast.error(e.message))}>退出登录</Button></DialogContent></Dialog>
    <Dialog open={directoryOpen} onOpenChange={setDirectoryOpen}><DialogContent title={`全部 Bot · ${bots.length}`}><div className="bot-directory">{bots.length ? bots.map(bot => <Button key={bot.id} variant="secondary" onClick={() => { if(bot.hidden) patch.mutate({id:bot.id,patch:{hidden:false}},{onSuccess:()=>selectBot(bot.id)}); else selectBot(bot.id);setDirectoryOpen(false); }}>{bot.name}{bot.hidden ? " · 已隐藏，点击恢复" : ""}</Button>) : <p>暂无 Bot，请创建你的第一个 Bot。</p>}</div></DialogContent></Dialog>
    <BotEditorDialog bot={editingBot} open={editorOpen} onOpenChange={setEditorOpen} />
    <MoveBotDialog bot={movingBot} onClose={() => setMovingBot(undefined)} />
    <ConfirmDialog open={Boolean(deletingBot)} onOpenChange={(open) => { if (!open) setDeletingBot(undefined); }} title="删除 Bot" description={`确定删除「${deletingBot?.name ?? ""}」吗？此 Bot 和其对话将不再显示。`} confirmLabel={deleteBot.isPending ? "删除中…" : "删除"} onConfirm={() => { if (deletingBot) deleteBot.mutate(deletingBot.id, { onSuccess: () => toast.success("Bot 已删除"), onError: (error) => toast.error(error.message) }); }} />
  </>;
}
