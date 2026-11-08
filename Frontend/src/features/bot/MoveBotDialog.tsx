import { useEffect, useState } from "react";
import { Check, Folder } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Bot } from "@/domain/bot/types";
import { useBotsQuery, usePatchBotMutation } from "@/api/hooks/bots";

export function MoveBotDialog({ bot, onClose }: { bot?: Bot; onClose: () => void }) {
  const bots = useBotsQuery().data ?? [];
  const patchBot = usePatchBotMutation();
  const [groupName, setGroupName] = useState("");
  useEffect(() => { if (bot) setGroupName(""); }, [bot]);
  if (!bot) return null;
  const groups = [...new Set(bots.map((item) => item.group))];
  const move = (group: string) => patchBot.mutate({ id: bot.id, patch: { group } }, {
    onSuccess: () => { toast.success(`已移至「${group}」`); onClose(); },
    onError: (error) => toast.error(error.message),
  });
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent title="移至分组">
    <div className="panel-list">{groups.map((group) => <Button variant="ghost" key={group} disabled={patchBot.isPending} onClick={() => move(group)}><Folder size={17} /><span>{group}</span>{bot.group === group && <Check size={16} className="menu-trailing" />}</Button>)}</div>
    <form className="panel-form" onSubmit={(event) => { event.preventDefault(); if (groupName.trim()) move(groupName.trim()); }}>
      <Input value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={20} placeholder="或输入新分组名称" aria-label="新分组名称" required />
      <div className="panel-actions"><Button type="submit" disabled={patchBot.isPending}>{patchBot.isPending ? "保存中…" : "新建并移入"}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
