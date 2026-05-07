import { useState } from "react";
import { Trash2 } from "lucide-react";
import { DeletionRequestModal } from "./DeletionRequestModal";

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
  const [showModal, setShowModal] = useState(false);

  const handleSuccess = () => {
    setShowModal(false);
    onSuccess?.();
  };

  // Icon variant (for action menus)
  if (variant === "icon") {
    return (
      <>
        <button
          onClick={() => setShowModal(true)}
          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title="Request Deletion"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        {showModal && (
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
          onClick={() => setShowModal(true)}
          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
          <span>Request Deletion</span>
        </button>
        {showModal && (
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
        onClick={() => setShowModal(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
      >
        <Trash2 className="h-4 w-4" />
        <span>Request Deletion</span>
      </button>
      {showModal && (
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
