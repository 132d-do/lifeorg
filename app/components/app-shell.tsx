"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { FocusTimer } from "./action-controls";

const navigation = [
  { href: "/", label: "经营总览", icon: "总" },
  { href: "/meetings", label: "会议中心", icon: "会" },
  { href: "/goals", label: "目标组合", icon: "标" },
  { href: "/decisions", label: "决策日志", icon: "策" },
  { href: "/insights", label: "经营洞察", icon: "察" },
  { href: "/settings/profile", label: "组织设置", icon: "设" },
] as const;

const pageCopy: Record<string, [string, string]> = {
  overview: ["经营总览", "围绕需要你批准的事项，经营今天和本周期。"],
  meetings: ["会议中心", "让四个角色围绕真实记录补问、评议并形成可验证建议。"],
  goals: ["目标组合", "把有限的时间和精力投向真正服务长期方向的目标。"],
  decisions: ["决策日志", "保留当时的证据、选择和复查时间，让结果校准判断。"],
  insights: ["经营洞察", "只从真实记录中寻找趋势，不给人生制造虚假分数。"],
  settings: ["组织设置", "定义个人经营章程、Agent 边界和安全连接。"],
};

export function AppShell({ section, children, status = "正在连接个人经营记录…" }: { section: keyof typeof pageCopy; children: ReactNode; status?: string }) {
  const pathname = usePathname();
  const [title, description] = pageCopy[section];
  const active = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href.split("/").slice(0, 2).join("/"));

  return <main className="app-shell">
    <aside className="sidebar">
      <Link className="brand-block" href="/" aria-label="LifeOrg 经营总览">
        <span className="brand">LifeOrg</span><span className="brand-subtitle">个人经营系统</span>
      </Link>
      <nav className="nav-list" aria-label="主导航">
        {navigation.map((item) => <Link className={`nav-item ${active(item.href) ? "active" : ""}`} aria-current={active(item.href) ? "page" : undefined} href={item.href} key={item.href}><span className="nav-icon">{item.icon}</span><span>{item.label}</span></Link>)}
      </nav>
      <div className="sync-state" role="status"><span />{status}</div>
      <Link className="profile" href="/settings/profile"><span className="avatar">我</span><span><strong>人生经营者</strong><small>最终决策者 · CEO</small></span><b>→</b></Link>
    </aside>
    <section className="workspace">
      <header className="page-header"><div><p className="eyebrow">PERSONAL OPERATING SYSTEM</p><h1>{title}</h1><p>{description}</p></div><FocusTimer /></header>
      {children}
    </section>
  </main>;
}
