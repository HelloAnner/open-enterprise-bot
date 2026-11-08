import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import type { AvatarShape } from "@/domain/bot/types";
import { cn } from "@/lib/utils";

const bodies: Record<AvatarShape, ReactNode> = {
  home: <path d="M12 23 28 7c3-3 7-3 10 0l15 16c3 3 4 7 4 11l-1 19c0 5-4 8-9 8H17c-6 0-10-4-10-10l-1-18c0-4 2-7 6-10Z" />,
  circle: <circle cx="32" cy="32" r="27" />,
  triangle: <path d="M22 6C12 2 7 10 9 22l7 28c2 8 9 10 16 5l23-17c7-5 6-13-1-18L22 6Z" />,
  bean: <path d="M12 22C16 7 43 9 53 20s5 27-7 32-30 0-35-11-3-13 1-19Z" />,
  drop: <path d="M39 5c3 8 14 17 15 29 1 14-9 24-23 24S7 48 9 34C11 21 25 17 39 5Z" />,
  splat: <path d="M26 5c7-5 12 4 16 6s10-2 13 4-3 9-1 14 9 7 6 13-9 4-12 8-2 11-9 12-8-6-14-5-9 6-14 1 0-10-3-15-9-6-7-12 7-6 9-11-1-11 4-14 8 4 12-1Z" />,
  cloud: <path d="M18 18C24 8 34 12 38 16c7-5 17 0 18 9 8 3 8 15 1 21-8 7-31 12-42 4C3 43 6 25 18 18Z" />,
  spark: <path d="M28 4c6-3 9 9 13 12s16-2 18 5-8 10-8 16 8 12 2 17-13-3-18 0-7 12-14 8-2-13-6-17-15-5-13-12 10-6 13-11-2-14 4-17 6 4 9-1Z" />,
  square: <rect x="10" y="10" width="44" height="44" rx="12" transform="rotate(14 32 32)" />,
  flower: <path d="M25 6c5-6 13-1 14 5 7-4 15 2 13 9 8 0 11 10 5 15 6 5 2 15-5 16 2 8-7 14-14 9-3 7-14 6-17-1-7 4-15-2-13-10-8-1-10-11-4-16-5-5-1-15 6-16-1-8 8-13 15-11Z" />,
  pebble: <path d="M16 10c12-8 31-4 38 9 8 15 1 32-13 38S11 57 7 42 5 19 16 10Z" />,
  pill: <rect x="7" y="15" width="50" height="35" rx="17.5" transform="rotate(10 32 32)" />,
  hex: <path d="m23 6 25 9c5 2 8 7 7 12l-5 22c-1 6-6 9-12 8L13 51c-6-1-9-7-8-13L9 15c1-7 7-11 14-9Z" />,
};

export function BotAvatar({ shape, color, className, active = false }: { shape: AvatarShape; color: string; className?: string; active?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  const reduceMotion = useReducedMotion();
  const eyeX = useMotionValue(0);
  const eyeY = useMotionValue(0);
  const rotation = useMotionValue(0);
  const smoothEyeX = useSpring(eyeX, { stiffness: 380, damping: 26 });
  const smoothEyeY = useSpring(eyeY, { stiffness: 380, damping: 26 });
  const smoothRotation = useSpring(rotation, { stiffness: 300, damping: 22 });
  useEffect(() => {
    if (!active || reduceMotion) {
      eyeX.set(0);
      eyeY.set(0);
      rotation.set(0);
      return;
    }
    const follow = (event: PointerEvent) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      eyeX.set(Math.max(-2.4, Math.min(2.4, dx / 28)));
      eyeY.set(Math.max(-1.8, Math.min(1.8, dy / 28)));
      rotation.set(Math.max(-8, Math.min(8, dx / 22)));
    };
    window.addEventListener("pointermove", follow, { passive: true });
    return () => window.removeEventListener("pointermove", follow);
  }, [active, eyeX, eyeY, reduceMotion, rotation]);
  const blink = reduceMotion ? undefined : { scaleY: [1, 1, 0.08, 1, 1] };
  return <motion.svg ref={ref} className={cn("bot-avatar", className)} style={{ "--avatar": color } as React.CSSProperties} viewBox="0 0 64 64" role="img" aria-label="Bot 头像" animate={active && !reduceMotion ? { scale: 1.07, y: -2 } : { scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 420, damping: 20 }}>
    <motion.g data-avatar-motion style={{ rotate: smoothRotation }}>
      <g className="avatar-body">{bodies[shape]}</g>
      <g transform={shape === "home" ? undefined : "rotate(-25 34 29)"}>
        <motion.g data-eyes style={{ x: smoothEyeX, y: smoothEyeY }}>
          <motion.rect className="avatar-eye" x="25" y="20" width="6" height="14" rx="3" animate={blink} transition={{ duration: 5.2, times: [0, 0.43, 0.44, 0.45, 1], repeat: Infinity }} />
          <motion.rect className="avatar-eye" x="38" y="20" width="6" height="14" rx="3" animate={blink} transition={{ duration: 5.2, times: [0, 0.43, 0.44, 0.45, 1], repeat: Infinity, delay: 0.04 }} />
        </motion.g>
      </g>
    </motion.g>
  </motion.svg>;
}
