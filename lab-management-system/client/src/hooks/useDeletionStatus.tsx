import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Clock } from "lucide-react";

export function useDeletionStatus(targetTable: string, targetId: number) {
  const enabled = Boolean(targetTable && targetId > 0);

  const { data, isLoading, refetch } = trpc.deletion.getPendingForTarget.useQuery(
    { targetTable, targetId },
    { enabled }
  );

  const hasPendingDeletion = Boolean(data?.pending);

  const PendingDeletionBadge = hasPendingDeletion ? (
    <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300 gap-1">
      <Clock className="h-3 w-3" />
      Deletion Pending
    </Badge>
  ) : null;

  const DisabledWarning = hasPendingDeletion ? (
    <span className="inline-flex items-center gap-1 text-xs text-orange-700">
      <AlertCircle className="h-3 w-3 shrink-0" />
      A deletion request is pending for this record.
    </span>
  ) : null;

  return {
    hasPendingDeletion,
    isLoading,
    requestId: data?.requestId ?? null,
    refetch,
    PendingDeletionBadge,
    DisabledWarning,
  };
}
