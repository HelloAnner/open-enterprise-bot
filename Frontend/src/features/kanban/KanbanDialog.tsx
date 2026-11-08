import { useState } from "react";
import { closestCorners, DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { JobOpportunity } from "@/domain/kanban/types";
import { cn } from "@/lib/utils";
import { useBoardQuery, useMoveJobMutation } from "@/api/hooks/board";

function JobCard({ job, overlay = false }: { job: JobOpportunity; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: job.id, disabled: overlay });
  return <button ref={setNodeRef} className={cn("job-card", isDragging && "dragging", overlay && "drag-overlay")} style={{ transform: CSS.Translate.toString(transform) }} {...listeners} {...attributes} onClick={() => toast(`${job.company} · 已同步最新投递状态`)}><span className="job-company">{job.company}</span><span className="job-title">{job.title}</span><span className="job-meta"><span>{job.meta}</span><span>›</span></span></button>;
}

export function KanbanDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const boardQuery = useBoardQuery(open);
  const moveJob = useMoveJobMutation();
  const columns = boardQuery.data ?? [];
  const [activeJobId, setActiveJobId] = useState<string>();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const total = columns.reduce((sum, column) => sum + column.jobs.length, 0);
  const activeJob = columns.flatMap((column) => column.jobs).find((job) => job.id === activeJobId);
  const onDragStart = (event: DragStartEvent) => setActiveJobId(String(event.active.id));
  const onDragEnd = (event: DragEndEvent) => {
    if (event.over) moveJob.mutate({ jobId: String(event.active.id), columnId: String(event.over.id) });
    setActiveJobId(undefined);
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent title="面试机会看板 · 70–80万" className="wide">
    <div className="board-toolbar"><p>{total} 个机会 · 拖拽卡片可更新状态</p><Button variant="secondary" size="sm" onClick={() => toast("当前显示全部机会")}>全部机会<ChevronDown /></Button></div>
    {boardQuery.isLoading ? <div className="board-state">正在同步看板数据…</div> : boardQuery.isError ? <div className="board-state"><p>{boardQuery.error.message}</p><Button variant="secondary" onClick={() => void boardQuery.refetch()}>重新加载</Button></div> : <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveJobId(undefined)}>
      <div className="kanban-board">{columns.map((column) => <BoardColumnView key={column.id} id={column.id} title={column.title} jobs={column.jobs} />)}</div>
      <DragOverlay>{activeJob ? <JobCard job={activeJob} overlay /> : null}</DragOverlay>
    </DndContext>}
  </DialogContent></Dialog>;
}

function BoardColumnView({ id, title, jobs }: { id: string; title: string; jobs: JobOpportunity[] }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <section ref={setNodeRef} className={cn("board-column", isOver && "drag-over")}><div className="board-column-header"><span>{title}</span><span className="board-count">{jobs.length}</span></div>{jobs.length ? jobs.map((job) => <JobCard key={job.id} job={job} />) : <div className="board-empty">拖拽机会到这里</div>}</section>;
}
