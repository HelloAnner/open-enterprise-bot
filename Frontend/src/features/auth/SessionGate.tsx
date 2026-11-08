import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BotAvatar } from "@/components/BotAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login, sessionKey, useSession } from "@/api/session";

export function SessionGate({ children }: { children: ReactNode }) {
  const session = useSession(); const client = useQueryClient();
  const [username, setUsername] = useState(""); const [password, setPassword] = useState("");
  const signIn = useMutation({ mutationFn: () => login(username, password), onSuccess: user => { setPassword(""); client.clear(); client.setQueryData(sessionKey, user); } });
  if (session.data) return children;
  if (session.isPending) return <main className="login-page"><p role="status">正在连接工作空间…</p></main>;
  return <main className="login-page"><section className="login-card"><BotAvatar shape="circle" color="#111111" /><h1>Open Enterprise Bot</h1><p>登录你的工作空间</p>
    <form onSubmit={e => { e.preventDefault(); signIn.mutate(); }}>
      <label>用户名<Input name="username" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required maxLength={64} /></label>
      <label>密码<Input name="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required maxLength={256} /></label>
      {(signIn.error || session.error) && <p className="login-error" role="alert">{(signIn.error || session.error)?.message}</p>}
      <Button type="submit" disabled={signIn.isPending}>{signIn.isPending ? "登录中…" : "登录"}</Button>
    </form><small>对话、Bot 和文件保存于独立工作空间。</small></section></main>;
}
