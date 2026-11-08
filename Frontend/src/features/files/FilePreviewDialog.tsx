import { FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { ChatMessage } from "@/domain/chat/types";

export function FilePreviewDialog({ message, onClose }: { message?: ChatMessage; onClose: () => void }) {
  const url = message?.url && new URL(message.url, location.origin).origin === location.origin ? message.url : undefined;
  const preview = useQuery({ queryKey: ["file-preview", url], enabled: Boolean(url), retry: false, queryFn: async ({signal}) => {
    const response = await fetch(url!, {credentials:"include", signal});
    if(!response.ok) throw new Error(`文件读取失败（${response.status}）`);
    const blob = await response.blob();
    if (blob.size > 256*1024 || !/^(text\/|application\/json)/.test(blob.type)) return null;
    return blob.text();
  }});
  if (!message) return null;
  return <Dialog open onOpenChange={open => {if(!open) onClose();}}><DialogContent title="文件预览"><div className="file-preview"><span className="pdf-icon"><FileText size={34}/></span><h3>{message.name}</h3><p>{message.size}</p>
    {preview.isFetching ? <p role="status">读取文件中…</p> : preview.error ? <p role="alert">{preview.error.message}</p> : preview.data != null ? <pre className="file-text-preview">{preview.data}</pre> : <p>此格式请下载后查看。</p>}
    {url && <a className="button button-secondary button-md download-button" href={url} download={message.name}>下载文件</a>}
  </div></DialogContent></Dialog>;
}
