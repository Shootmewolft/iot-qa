"use client";

import { useState } from "react";

import {
  BackupCard,
  type BackupResult,
} from "@/components/maintenance/backup-card";
import { ClearChannelCard } from "@/components/maintenance/clear-channel-card";

/**
 * Holds the backup receipt so the destructive card can require it.
 *
 * State lives here rather than in localStorage on purpose: a receipt that
 * survives a reload would let an operator clear the channel today against a
 * backup they took last week.
 */
export function MaintenanceWorkbench({
  channelId,
  channelName,
  entryCount,
}: {
  channelId: number;
  channelName: string;
  entryCount: number | null;
}) {
  const [backup, setBackup] = useState<BackupResult | null>(null);

  return (
    <div className="grid gap-4">
      <BackupCard
        channelId={channelId}
        channelName={channelName}
        lastBackup={backup}
        onBackup={setBackup}
      />
      <ClearChannelCard
        channelId={channelId}
        entryCount={entryCount}
        backup={backup}
      />
    </div>
  );
}
