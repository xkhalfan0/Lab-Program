import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { DeletionRequestModal } from "@/components/DeletionRequestModal";

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
  const directDelete = trpc.deletion.directDelete.useMutation({
    onSuccess: () => {
      toast.success("Record deleted successfully");
      onSuccess?.();
    },
    onError: (e) => {
      toast.error(e.message || "Delete failed");
    },
  });

  const role = user?.role ?? "";
  const canRequest = ["admin", "lab_manager", "sample_manager", "qc_inspector"].includes(role);
  const isAdmin = role === "admin";

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

  // Icon variant (for action menus)
  if (variant === "icon") {
    return (
      <>
        <button
          onClick={isAdmin ? handleAdminDirectDelete : () => setShowModal(true)}
          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title="Request Deletion"
          disabled={directDelete.isPending}
        >
          <Trash2 className="h-4 w-4" />
        </button>
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
        <button
          onClick={isAdmin ? handleAdminDirectDelete : () => setShowModal(true)}
          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
          disabled={directDelete.isPending}
        >
          <Trash2 className="h-4 w-4" />
          <span>Request Deletion</span>
        </button>
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
      <button
        onClick={isAdmin ? handleAdminDirectDelete : () => setShowModal(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        disabled={directDelete.isPending}
      >
        <Trash2 className="h-4 w-4" />
        <span>Request Deletion</span>
      </button>
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
