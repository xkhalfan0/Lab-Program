import { AlertTriangle, Info } from "lucide-react";

interface DeletionImpactDisplayProps {
  impact: {
    affectedTables: Record<string, number>;
    totalRecords: number;
    canDelete: boolean;
    warnings: string[];
  };
}

export function DeletionImpactDisplay({ impact }: DeletionImpactDisplayProps) {
  if (impact.totalRecords === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-medium text-green-900">No Dependencies</h4>
            <p className="text-sm text-green-700 mt-1">
              This record has no related data and can be safely deleted.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="font-medium text-yellow-900">Impact Summary</h4>
            <p className="text-sm text-yellow-700 mt-1">
              This deletion will affect <strong>{impact.totalRecords} record(s)</strong> across{" "}
              <strong>{Object.keys(impact.affectedTables).length} table(s)</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Affected Tables */}
      <div>
        <h4 className="text-sm font-medium text-gray-900 mb-3">Affected Records:</h4>
        <div className="space-y-2">
          {Object.entries(impact.affectedTables).map(([table, count]) => (
            <div
              key={table}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
            >
              <span className="text-sm font-medium text-gray-700 capitalize">
                {table.replace(/_/g, " ")}
              </span>
              <span className="text-sm text-gray-600">
                {count} record{count !== 1 ? "s" : ""}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Warnings */}
      {impact.warnings.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-900 mb-3">Details:</h4>
          <div className="space-y-2">
            {impact.warnings.map((warning, index) => {
              const isCascade = warning.includes("CASCADE");
              return (
                <div
                  key={index}
                  className={`flex items-start gap-2 p-3 rounded-lg border ${
                    isCascade ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-200"
                  }`}
                >
                  {isCascade ? (
                    <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                  ) : (
                    <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  )}
                  <span className={`text-sm ${isCascade ? "text-red-700" : "text-blue-700"}`}>
                    {warning}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-600 space-y-1">
        <p className="flex items-center gap-2">
          <AlertTriangle className="h-3 w-3 text-red-600" />
          <span>
            <strong>CASCADE:</strong> Related records will also be deleted
          </span>
        </p>
        <p className="flex items-center gap-2">
          <Info className="h-3 w-3 text-blue-600" />
          <span>
            <strong>SET NULL:</strong> Related records will be kept, reference will be cleared
          </span>
        </p>
      </div>
    </div>
  );
}
