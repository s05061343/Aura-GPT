"use client";

import { useEffect, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ApprovalRequest = { approvalId: string; tool: string; summary: string; arguments: Record<string, unknown> };

export function ApprovalDialog({ approval, busy, onDecision }: { approval?: ApprovalRequest; busy: boolean; onDecision: (decision: "approve" | "reject") => void }) {
  const approveButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (approval && !busy) approveButtonRef.current?.focus();
  }, [approval, busy]);

  return (
    <Dialog.Root open={Boolean(approval)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/65 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[90] w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-slate-700 bg-[#171c26] p-6 text-slate-100 shadow-[0_24px_80px_rgba(0,0,0,.55)] focus:outline-none"
          aria-describedby="approval-description"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            approveButtonRef.current?.focus();
          }}
        >
          <div className="flex items-start justify-between"><ShieldCheck className="size-9 text-cyan-300" /><Dialog.Close asChild><button className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100" onClick={() => onDecision("reject")} aria-label="拒絕並關閉"><X /></button></Dialog.Close></div>
          <Dialog.Title className="mt-4 text-xl font-bold">允許外部工具？</Dialog.Title>
          <Dialog.Description id="approval-description" className="mt-2 text-sm text-slate-300">{approval?.summary}</Dialog.Description>
          <div className="mt-4 rounded-xl border border-slate-700 bg-[#11151d] p-3"><p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">{approval?.tool}</p><pre className="mt-2 overflow-auto text-xs text-slate-300">{JSON.stringify(approval?.arguments, null, 2)}</pre></div>
          <p className="mt-4 text-xs text-slate-400">批准後，本分頁後續使用相同工具不再詢問；重新整理後授權失效。</p>
          <div className="mt-6 flex justify-end gap-3"><Button variant="outline" disabled={busy} onClick={() => onDecision("reject")}>拒絕</Button><Button ref={approveButtonRef} disabled={busy} onClick={() => onDecision("approve")}>批准並繼續</Button></div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
