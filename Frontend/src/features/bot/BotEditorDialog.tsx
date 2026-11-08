import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BotAvatar } from "@/components/BotAvatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AVATAR_SHAPES, BOT_COLORS } from "@/domain/bot/types";
import type { AvatarShape, Bot } from "@/domain/bot/types";
import { useSaveBotMutation } from "@/api/hooks/bots";

export function BotEditorDialog({ bot, open, onOpenChange }: { bot?: Bot; open: boolean; onOpenChange: (open: boolean) => void }) {
  const saveBot = useSaveBotMutation();
  const [name, setName] = useState("");
  const [shape, setShape] = useState<AvatarShape>("home");
  const [color, setColor] = useState("#ff7b18");
  useEffect(() => {
    if (!open) return;
    setName(bot?.name ?? "");
    setShape(bot?.shape ?? "home");
    setColor(bot?.color ?? "#ff7b18");
  }, [bot, open]);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent title={bot ? "重命名 Bot" : "创建新 Bot"} className="bot-dialog">
    <form onSubmit={(event) => {
      event.preventDefault();
      if (!name.trim()) return;
      saveBot.mutate({ id: bot?.id, input: { name: name.trim(), shape, color } }, {
        onSuccess: () => { toast.success(bot ? "Bot 已更新" : `「${name.trim()}」创建成功`); onOpenChange(false); },
        onError: (error) => toast.error(error.message),
      });
    }}>
      <div className="avatar-preview"><BotAvatar shape={shape} color={color} /></div>
      <label className="bot-name-field"><span className="sr-only">Bot 名称</span><Input value={name} onChange={(event) => setName(event.target.value)} maxLength={24} placeholder="给你的 Bot 起个名字" autoComplete="off" required /></label>
      <div className="shape-picker" aria-label="选择头像形状">{AVATAR_SHAPES.map((item) => <Button variant="ghost" key={item} className={`shape-choice ${shape === item ? "selected" : ""}`} aria-label={`选择 ${item} 头像`} aria-pressed={shape === item} onClick={() => setShape(item)}><BotAvatar shape={item} color={color} /></Button>)}</div>
      <div className="color-picker" aria-label="选择主题颜色">{BOT_COLORS.map((item) => <Button variant="ghost" key={item} className={`color-choice ${color === item ? "selected" : ""}`} style={{ "--color": item } as React.CSSProperties} aria-label={`选择颜色 ${item}`} aria-pressed={color === item} onClick={() => setColor(item)} />)}</div>
      <div className="dialog-actions"><DialogClose asChild><Button variant="secondary">取消</Button></DialogClose><Button type="submit" disabled={!name.trim() || saveBot.isPending}>{saveBot.isPending ? "保存中…" : bot ? "保存" : "创建"}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
