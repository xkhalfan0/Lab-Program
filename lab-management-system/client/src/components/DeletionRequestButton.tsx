import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { effectiveUserRole } from "@/lib/labTypes";
import { DeletionRequestModal } from "@/components/DeletionRequestModal";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface DeletionRequestButtonProps {
  targetTable: string;
  targetId: number;
  targetLabel: string; // Human-readable name (e.g., "Contract #123", "Sample ABC-001")
  variant?: "icon" | "button" | "menu-item";
  onSuccess?: () => void;
}

export function DeletionRequestButton({
  targetTable,
  targetId,
  targetLabel,
  variant = "button",
  onSuccess,
}: DeletionRequestButtonProps) {
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const role = user?.role ?? "";
  const canRequest = ["admin", "lab_manager", "qc_inspector"].includes(effectiveUserRole(role));
  const isAdmin = role === "admin";

  const { data: existingRequest } = trpc.deletion.getPendingForTarget.useQuery(
    { targetTable, targetId },
    { enabled: canRequest && targetId > 0 }
  );
  const hasPendingRequest = Boolean(existingRequest?.pending);

  const directDelete = trpc.deletion.directDelete.useMutation({
    onSuccess: () => {
      toast.success("Record deleted successfully");
      onSuccess?.();
    },
    onError: (e) => {
      toast.error(e.message || "Delete failed");
    },
  });

  if (!canRequest) return null;

  const handleSuccess = () => {
    setShowModal(false);
    onSuccess?.();
  };

  const handleAdminDirectDelete = () => {
    const ok = window.confirm(
      "⚠️ ADMIN DELETE: This will permanently delete this record and ALL related data including billing records. This action cannot be undone. Are you absolutely sure?"
    );
    if (!ok) return;
    directDelete.mutate({
      targetTable,
      targetId,
      reason: `Admin direct delete: ${targetLabel}`,
    });
  };

  const isBusy = directDelete.isPending;

  // Icon variant (for action menus)
  if (variant === "icon") {
    return (
      <>
        {hasPendingRequest ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex cursor-not-allowed">
                <button
                  type="button"
                  className="p-2 text-red-600 rounded-lg transition-colors opacity-50 pointer-events-none"
                  title="Request Deletion"
                  disabled
                  aria-disabled
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Deletion request already pending</TooltipContent>
          </Tooltip>
        ) : (
          <button
            type="button"
            onClick={isAdmin ? handleAdminDirectDelete : () => setShowModal(true)}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Request Deletion"
            disabled={isBusy}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        {!isAdmin && showModal && (
          <DeletionRequestModal
            targetTable={targetTable}
            targetId={targetId}
            targetLabel={targetLabel}
            onClose={() => setShowModal(false)}
            onSuccess={handleSuccess}
          />
        )}
      </>
    );
  }

  // Menu item variant (for dropdown menus)
  if (variant === "menu-item") {
    return (
      <>
        {hasPendingRequest ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex w-full cursor-not-allowed">
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 opacity-50 pointer-events-none"
                  disabled
                  aria-disabled
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Request Deletion</span>
                </button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Deletion request already pending</TooltipContent>
          </Tooltip>
        ) : (
          <button
            type="button"
            onClick={isAdmin ? handleAdminDirectDelete : () => setShowModal(true)}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            disabled={isBusy}
          >
            <Trash2 className="h-4 w-4" />
            <span>Request Deletion</span>
          </button>
        )}
        {!isAdmin && showModal && (
          <DeletionRequestModal
            targetTable={targetTable}
            targetId={targetId}
            targetLabel={targetLabel}
            onClose={() => setShowModal(false)}
            onSuccess={handleSuccess}
          />
        )}
      </>
    );
  }

  // Button variant (default)
  return (
    <>
      {hasPendingRequest ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-not-allowed">
              <button
                type="button"
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg transition-colors opacity-50 pointer-events-none"
                disabled
                aria-disabled
              >
                <Trash2 className="h-4 w-4" />
                <span>Request Deletion</span>
              </button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Deletion request already pending</TooltipContent>
        </Tooltip>
      ) : (
        <button
          type="button"
          onClick={isAdmin ? handleAdminDirectDelete : () => setShowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          disabled={isBusy}
        >
          <Trash2 className="h-4 w-4" />
          <span>Request Deletion</span>
        </button>
      )}
      {!isAdmin && showModal && (
        <DeletionRequestModal
          targetTable={targetTable}
          targetId={targetId}
          targetLabel={targetLabel}
          onClose={() => setShowModal(false)}
          onSuccess={handleSuccess}
        />
      )}
    </>
  );
}
