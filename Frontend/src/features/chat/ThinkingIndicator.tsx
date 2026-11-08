import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BotAvatar } from "@/components/BotAvatar";
import type { Bot } from "@/domain/bot/types";

export function ThinkingIndicator({ bot, phase }: { bot: Bot; phase: "working" | "thinking" }) {
  const reduceMotion = useReducedMotion();
  return <div className="thinking-line" role="status" aria-live="polite" aria-label={phase === "working" ? "Bot 工作中" : "Bot 正在思考"}>
    <AnimatePresence mode="wait" initial={false}>
      {phase === "working" ? <motion.div className="thinking-phase" key="working" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }}>
        <span className="thinking-avatar"><BotAvatar shape={bot.shape} color={bot.color} processing /></span>
        <motion.span animate={reduceMotion ? undefined : { opacity: [0.55, 1, 0.55] }} transition={{ duration: 1.6, repeat: Infinity }}>工作中</motion.span>
      </motion.div> : <motion.div className="thinking-phase" key="thinking" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }}>
        <span className="thinking-dots" aria-hidden="true">{[0, 1, 2].map((dot) => <motion.i key={dot} animate={reduceMotion ? undefined : { y: [0, -3, 0], opacity: [0.35, 1, 0.35], scale: [1, 1.15, 1] }} transition={{ duration: 0.9, delay: dot * 0.16, repeat: Infinity }} />)}</span>
        <motion.span animate={reduceMotion ? undefined : { opacity: [0.55, 1, 0.55] }} transition={{ duration: 1.5, repeat: Infinity }}>正在思考</motion.span>
      </motion.div>}
    </AnimatePresence>
  </div>;
}
