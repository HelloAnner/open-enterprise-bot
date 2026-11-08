import { useEffect, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { AudioLines, FileUp, ImageUp, Mic, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownContent, DropdownItem, DropdownMenu, DropdownMenuTrigger } from "@/components/ui/menu";
import type { Bot } from "@/domain/bot/types";
import { useSendMessageMutation, useUploadMutation } from "@/api/hooks/messages";
import { useUiStore } from "@/stores/uiStore";

export function Composer({ bot, disabled = false }: { bot: Bot; disabled?: boolean }) {
  const sendMessage = useSendMessageMutation(bot.id);
  const upload = useUploadMutation(bot.id);
  const replyTo = useUiStore((state) => state.replyTo);
  const setReplyTo = useUiStore((state) => state.setReplyTo);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (replyTo) inputRef.current?.focus(); }, [replyTo]);
  const submit = () => {
    const content = text.trim();
    if (!content) { toast("输入消息后发送，也可以先添加附件"); return; }
    if (disabled) return;
    const reply = replyTo;
    setText("");
    setReplyTo(undefined);
    sendMessage.mutate({ text: content, replyTo: reply?.text }, { onError: () => { setText(content); setReplyTo(reply); } });
  };
  return <footer className="composer-wrap">
    {replyTo && <div className="reply-preview"><span>回复：{replyTo.text}</span><Button variant="ghost" size="icon" aria-label="取消回复" onClick={() => setReplyTo(undefined)}><X /></Button></div>}
    <form className="composer" onSubmit={(event) => { event.preventDefault(); submit(); }} aria-busy={sendMessage.isPending || upload.isPending}>
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="composer-plus" aria-label="添加附件" disabled={disabled || upload.isPending}><Plus /></Button></DropdownMenuTrigger><DropdownContent align="start"><DropdownItem onSelect={() => { fileRef.current?.setAttribute("accept", "*/*"); fileRef.current?.click(); }}><FileUp />上传文件</DropdownItem><DropdownItem onSelect={() => { fileRef.current?.setAttribute("accept", "image/*"); fileRef.current?.click(); }}><ImageUp />上传图片</DropdownItem></DropdownContent></DropdownMenu>
      <TextareaAutosize className={`textarea ${!text ? "is-empty" : ""}`} ref={inputRef} minRows={1} maxRows={6} maxLength={4000} value={text} disabled={disabled} placeholder={`给 ${bot.name} 发消息`} aria-label="消息" onChange={(event) => setText(event.target.value)} onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); }
      }} />
      <Button variant="ghost" size="icon" className={`mic-button ${listening ? "listening" : ""}`} aria-label="语音输入" onClick={() => { setListening(!listening); toast(listening ? "语音输入已结束" : "正在聆听…再次点击可结束"); }}><Mic /></Button>
      <Button size="icon" className="voice-button" type="submit" aria-label="发送消息" disabled={disabled}><AudioLines /></Button>
    </form>
    <input className="sr-only" ref={fileRef} type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload.mutate(file); event.target.value = ""; }} tabIndex={-1} />
  </footer>;
}
