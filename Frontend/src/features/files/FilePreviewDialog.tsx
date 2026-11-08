import { FileText } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { ChatMessage } from "@/domain/chat/types";

export function FilePreviewDialog({ message, onClose }: { message?: ChatMessage; onClose: () => void }) {
  if (!message) return null;
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent title="文件预览"><div className="file-preview"><span className="pdf-icon"><FileText size={34} /></span><h3>{message.name}</h3><p>{message.size} · 本地演示文件</p><div className="file-preview-page"><strong>Agent 工程师简历</strong>{[1, 2, 3, 4].map((line) => <div className="file-preview-lines" key={line} />)}</div>{message.url && <a className="button button-secondary button-md download-button" href={message.url} download={message.name}>下载文件</a>}</div></DialogContent></Dialog>;
}
