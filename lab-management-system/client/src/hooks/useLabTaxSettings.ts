import { trpc } from "@/lib/trpc";
import { DEFAULT_VAT_RATE } from "@shared/tax";

export function useLabTaxSettings() {
  const { data, isLoading } = trpc.labSettings.get.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  return {
    vatRate: data?.vatRate ?? DEFAULT_VAT_RATE,
    labTrn: data?.labTrn ?? null,
    isLoading,
  };
}
