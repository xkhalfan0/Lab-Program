import { useState } from "react";
import { AlertCircle, Loader2, X } from "lucide-react";
import { trpc } from "../lib/trpc";
import { DeletionImpactDisplay } from "./DeletionImpactDisplay";

interface DeletionRequestModalProps {
  targetTable: string;
  targetId: number;
  targetLabel: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function DeletionRequestModal({
  targetTable,
  targetId,
  targetLabel,
  onClose,
  onSuccess,
}: DeletionRequestModalProps) {
  const [reason, setReason] = useState("");
  const [reasonCategory, setReasonCategory] = useState<
    "data_error" | "duplicate" | "customer_request" | "compliance" | "test_data" | "other"
  >("other");

  const utils = trpc.useUtils();

  // Fetch impact analysis
  const { data: impact, isLoading: loadingImpact } = trpc.deletion.getDeletionImpact.useQuery({
    targetTable,
    targetId,
  });

  // Submit deletion request
  const submitRequest = trpc.deletion.requestDeletion.useMutation({
    onSuccess: async () => {
      await utils.deletion.getPendingForTarget.invalidate();
      onSuccess(); // Parent refetch (lists, etc.)
      onClose(); // Close the modal
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isOther = reasonCategory === "other";
    const trimmedReason = reason.trim();
    if (isOther && trimmedReason.length < 10) {
      alert("Please provide a reason of at least 10 characters");
      return;
    }
    submitRequest.mutate({
      targetTable,
      targetId,
      reason: trimmedReason.length > 0 ? trimmedReason : `Category: ${reasonCategory}`,
      reasonCategory,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Request Deletion</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Target Info */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-sm text-gray-600">Requesting deletion of:</p>
            <p className="text-lg font-medium text-gray-900 mt-1">{targetLabel}</p>
            <p className="text-xs text-gray-500 mt-1">
              Table: {targetTable} | ID: {targetId}
            </p>
          </div>

          {/* Impact Analysis */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">Impact Analysis</h3>
            {loadingImpact ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : impact ? (
              <DeletionImpactDisplay impact={impact} />
            ) : (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-red-900">Error</h4>
                    <p className="text-sm text-red-700 mt-1">
                      Failed to load impact analysis. Please try again.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Reason Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Reason Category</label>
            <select
              value={reasonCategory}
              onChange={(e) => setReasonCategory(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            >
              <option value="data_error">Data Error</option>
              <option value="duplicate">Duplicate Record</option>
              <option value="customer_request">Customer Request</option>
              <option value="compliance">Compliance / Legal</option>
              <option value="test_data">Test Data</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason for Deletion{" "}
              {reasonCategory === "other" && <span className="text-red-600">*</span>}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                reasonCategory === "other"
                  ? "Please explain why this record needs to be deleted (minimum 10 characters)..."
                  : "Optional note (required only for 'Other')."
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[100px]"
              required={reasonCategory === "other"}
              minLength={reasonCategory === "other" ? 10 : undefined}
            />
            <p className="text-xs text-gray-500 mt-1">
              {reasonCategory === "other"
                ? `${reason.length} / 10 characters minimum`
                : "Optional. Pick 'Other' to require a detailed note."}
            </p>
          </div>

          {/* Error Display */}
          {submitRequest.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700">{submitRequest.error.message}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              disabled={submitRequest.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                submitRequest.isPending ||
                loadingImpact ||
                (reasonCategory === "other" && reason.trim().length < 10)
              }
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {submitRequest.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <span>Submit Request</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
