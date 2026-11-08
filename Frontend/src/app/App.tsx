import { useEffect, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { MotionConfig } from "motion/react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ChatView } from "@/features/chat/ChatView";
import { Sidebar } from "@/features/sidebar/Sidebar";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { SessionGate } from "@/features/auth/SessionGate";
import { RealtimeSync } from "@/api/RealtimeSync";
import "@/styles/auth.css";

export function App() { return <SessionGate><Workspace /></SessionGate>; }

function Workspace() {
  const isMobile = useMediaQuery("(max-width: 720px)");
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { if (!isMobile) setMobileOpen(false); }, [isMobile]);
  const sidebar = <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />;
  const chat = <ChatView onOpenSidebar={() => setMobileOpen(true)} />;
  return <MotionConfig reducedMotion="user"><TooltipProvider delayDuration={350}><RealtimeSync />
    {isMobile ? <div className="app">{sidebar}{chat}</div> : <PanelGroup className="app" direction="horizontal">
      <Panel defaultSize={Math.max(14.5, Math.min(25, 290 / window.innerWidth * 100))} minSize={12} maxSize={25} className="sidebar-panel">{sidebar}</Panel>
      <PanelResizeHandle className="resize-handle" aria-label="调整侧边栏宽度" />
      <Panel minSize={55}>{chat}</Panel>
    </PanelGroup>}
    <Toaster theme="system" position="bottom-center" toastOptions={{ className: "app-toast" }} />
  </TooltipProvider></MotionConfig>;
}
