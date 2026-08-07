"use client";

export type EvidenceItem = {
  id: string;
  title: string;
  verification: "record_backed" | "user_reported" | "unverified";
  kind: "profile" | "goal" | "decision" | "meeting";
  summary?: string;
  locked?: boolean;
};

const kindLabels: Record<EvidenceItem["kind"], string> = {
  profile: "个人章程",
  goal: "目标",
  decision: "历史决策",
  meeting: "会议记录",
};

const verificationLabels: Record<EvidenceItem["verification"], string> = {
  record_backed: "LifeOrg 记录可核验",
  user_reported: "用户陈述",
  unverified: "尚未核验",
};

export function EvidenceBoard({ items, selected, onToggle }: { items: EvidenceItem[]; selected: Set<string>; onToggle: (id: string, checked: boolean) => void }) {
  return <div className="evidence-board">
    {Object.entries(kindLabels).map(([kind, label]) => {
      const group = items.filter((item) => item.kind === kind);
      if (!group.length) return null;
      return <section className="evidence-group" key={kind}><h3>{label}</h3>{group.map((item) => <label className="evidence-item" key={item.id}>
        <input type="checkbox" value={item.id} checked={selected.has(item.id)} disabled={item.locked} onChange={(event) => onToggle(item.id, event.target.checked)} />
        <span><b>{item.title}</b>{item.summary && <small>{item.summary}</small>}<em>{verificationLabels[item.verification]} · {item.verification}</em></span>
      </label>)}</section>;
    })}
  </div>;
}
