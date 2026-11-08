import { BarChart3, FileText, LockKeyhole, Mail } from "lucide-react";
import { BotAvatar } from "@/components/BotAvatar";
import type { ChatMessage } from "@/domain/chat/types";
import { useChoiceMutation } from "@/api/hooks/messages";
import { MessageText } from "./components/MessageText";

export function MessageBody({ message, botId, onImage, onKanban, onFile, replyText }: {
  message: ChatMessage;
  replyText?: string;
  botId: string;
  onImage: (src: string) => void;
  onKanban: () => void;
  onFile: (message: ChatMessage) => void;
}) {
  const chooseOption = useChoiceMutation(botId);
  if (message.kind === "choice") return <div className="choice-card"><p className="choice-title">{message.title}</p>{message.options?.map((option, index) => {
    const letter = String.fromCharCode(65 + index);
    return <button className={`choice-option ${message.selected === letter ? "selected" : ""}`} key={option} onClick={() => chooseOption.mutate({ messageId: message.id, optionIndex: index })} disabled={Boolean(message.selected) || chooseOption.isPending}><span className="choice-letter">{letter}</span><span>{option}</span></button>;
  })}</div>;
  if (message.kind === "file") return <button className="file-card" onClick={() => onFile(message)}><span className="pdf-icon"><FileText size={25} /></span><span className="file-copy"><span className="file-name">{message.name}</span><span className="file-size">{message.size}</span></span></button>;
  if (message.kind === "kanban") return <button className="kanban-card" onClick={onKanban}><span className="kanban-icon"><BarChart3 size={23} /></span><span className="kanban-copy"><span className="kanban-title">{message.title}</span><span className="kanban-subtitle">{message.subtitle}</span></span></button>;
  if (message.kind === "email") return <div className="email-card"><span className="email-icon"><Mail /></span><span className="email-copy"><span className="email-title">{message.title}</span><span className="email-subtitle">{message.text ?? message.subtitle}</span></span></div>;
  if (message.kind === "secure") return <div className="secure-card"><span className="secure-icon"><LockKeyhole /></span><span className="secure-copy"><span className="secure-title">{message.title}</span><span className="secure-subtitle">{message.text ?? message.subtitle}</span></span></div>;
  if (message.kind === "images") return <div className="image-message image-grid">{message.images?.map((src, index) => <button key={`${src}-${index}`} onClick={() => onImage(src)} aria-label="查看大图"><img src={src} alt="对话图片" /></button>)}</div>;
  if (message.kind === "image") return <button className="single-image image-message" onClick={() => message.images?.[0] && onImage(message.images[0])} aria-label="查看大图"><img src={message.images?.[0]} alt="消息图片" /></button>;
  return <div className="message-bubble">{message.replyTo && <blockquote className="reply-quote">{replyText ?? "引用消息已删除"}</blockquote>}{message.title && <strong className="message-heading">{message.title}</strong>}{message.paragraphs ? message.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>) : message.text && (message.from === "bot" ? <MessageText text={message.text} /> : <p>{message.text}</p>)}{message.list && <ul>{message.list.map((item) => <li key={item}>{item}</li>)}</ul>}</div>;
}

export function RelayMeta({ message }: { message: ChatMessage }) {
  if (!message.relay) return null;
  return <div className="relay-meta"><span>{message.text}</span><BotAvatar shape={message.relay.shape} color={message.relay.color} /><strong>{message.relay.name}</strong></div>;
}
