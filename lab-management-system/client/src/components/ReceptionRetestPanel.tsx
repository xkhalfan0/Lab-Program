import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, FlaskConical, Loader2, Lock } from "lucide-react";
import { RETEST_REASONS } from "@shared/retestReasons";
import { ReceptionNominalCubeSizePanel, isValidNominalCubeSize } from "@/components/ReceptionNominalCubeSizePanel";
import {
  TestPriceBadge,
  TestQtyInput,
  TestSelectionCard,
  TestSelectionGrid,
  TestSelectionPanel,
  TestSelectionRow,
} from "@/components/TestDisplay";
import { toast } from "sonner";

type RetestTest = {
  testTypeId: number;
  testTypeCode: string;
  testTypeName: string;
  formTemplate?: string | null;
  testSubType?: string | null;
  quantity: number;
  unitPrice: number;
  isFailed: boolean;
  checked: boolean;
};

type Props = {
  onSuccess: () => void;
  onCancel: () => void;
};

export function ReceptionRetestPanel({ onSuccess, onCancel }: Props) {
  const { lang } = useLanguage();
  const isAr = lang === "ar";

  const [searchQ, setSearchQ] = useState("");
  const [rootId, setRootId] = useState<number | null>(null);
  const [selectedMeta, setSelectedMeta] = useState<{
    id: number;
    sampleCode: string;
    contractorName: string | null;
  } | null>(null);
  const [tests, setTests] = useState<RetestTest[]>([]);
  const [location, setLocation] = useState("");
  const [castingDate, setCastingDate] = useState("");
  const [notes, setNotes] = useState("");
  const [retestReason, setRetestReason] = useState<string>("");
  const [retestReasonNotes, setRetestReasonNotes] = useState("");
  const [nominalCubeSize, setNominalCubeSize] = useState("");

  const isSearching = searchQ.trim().length >= 2;
  const {
    data: eligibleSamples,
    isLoading: loadingEligibleInitial,
    isFetching: fetchingEligible,
    isError: searchError,
    error: searchErrorDetail,
  } = trpc.samples.searchRetestEligible.useQuery(
    {
      query: isSearching ? searchQ.trim() : undefined,
      limit: 20,
    },
    { staleTime: 30_000, retry: 1 }
  );
  const loadingEligible = loadingEligibleInitial || (fetchingEligible && !eligibleSamples);

  const selectedSample =
    selectedMeta ?? eligibleSamples?.find((s) => s.id === rootId) ?? null;

  const {
    data: source,
    isLoading: loadingSourceInitial,
    isFetching: fetchingSource,
    isError: sourceError,
    error: sourceErrorDetail,
  } = trpc.samples.getRetestSource.useQuery(
    { rootSampleId: rootId! },
    { enabled: rootId != null, retry: 1, staleTime: 30_000 }
  );
  const loadingSource =
    !!rootId && !source && !sourceError && (loadingSourceInitial || fetchingSource);

  useEffect(() => {
    if (sourceError && sourceErrorDetail?.message) {
      toast.error(sourceErrorDetail.message);
    }
  }, [sourceError, sourceErrorDetail?.message]);

  const createRetest = trpc.orders.createRetest.useMutation({
    onSuccess: (res) => {
      toast.success(
        isAr
          ? `تم تسجيل إعادة الاختبار ${res.sample.sampleCode}`
          : `Retest ${res.sample.sampleCode} registered`
      );
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const clearSelection = () => {
    setRootId(null);
    setSelectedMeta(null);
    setTests([]);
    setRetestReason("");
    setRetestReasonNotes("");
  };

  const selectRoot = (sample: {
    id: number;
    sampleCode: string;
    contractorName: string | null;
  }) => {
    setRootId(sample.id);
    setSelectedMeta({
      id: sample.id,
      sampleCode: sample.sampleCode,
      contractorName: sample.contractorName,
    });
    setTests([]);
  };

  useEffect(() => {
    if (!source || rootId !== source.rootSampleId) return;
    setLocation(source.header.location ?? "");
    setCastingDate(
      source.header.castingDate
        ? new Date(source.header.castingDate).toISOString().slice(0, 10)
        : ""
    );
    setNominalCubeSize(source.header.nominalCubeSize ?? "");
    setTests(
      source.tests.map((t) => ({
        ...t,
        checked: t.isFailed,
      }))
    );
  }, [source, rootId]);

  const toggleTest = (code: string) => {
    setTests((prev) =>
      prev.map((t) => (t.testTypeCode === code ? { ...t, checked: !t.checked } : t))
    );
  };

  const setQty = (code: string, qty: number) => {
    setTests((prev) =>
      prev.map((t) => (t.testTypeCode === code ? { ...t, quantity: Math.max(1, qty) } : t))
    );
  };

  const handleSubmit = () => {
    if (!rootId || !retestReason) {
      toast.error(isAr ? "اختر العينة والسبب" : "Select sample and reason");
      return;
    }
    const selected = tests.filter((t) => t.checked);
    if (!selected.length) {
      toast.error(isAr ? "اختر اختباراً واحداً على الأقل" : "Select at least one test");
      return;
    }
    const needsCubeSize = selected.some((t) => t.testTypeCode === "CONC_CUBE");
    if (needsCubeSize && !isValidNominalCubeSize(nominalCubeSize)) {
      toast.error(isAr ? "يرجى اختيار الحجم الاسمي للمكعب" : "Please select the nominal cube size");
      return;
    }
    if (!source) return;

    createRetest.mutate({
      rootSampleId: rootId,
      retestReason: retestReason as "failed_spec" | "damaged_sample" | "client_request",
      retestReasonNotes: retestReasonNotes || undefined,
      contractId: source.header.contractId ?? undefined,
      contractNumber: source.header.contractNumber ?? undefined,
      contractName: source.header.contractName ?? undefined,
      contractorName: source.header.contractorName ?? undefined,
      sampleType: source.header.sampleType,
      sector: source.header.sector,
      sectorNameAr: source.header.sectorNameAr ?? undefined,
      sectorNameEn: source.header.sectorNameEn ?? undefined,
      condition: "good",
      notes: notes || undefined,
      location: location || undefined,
      castingDate: castingDate || undefined,
      priority: "normal",
      nominalCubeSize: selected.some((t) => t.testTypeCode === "CONC_CUBE") ? nominalCubeSize : undefined,
      tests: selected.map((t) => ({
        testTypeId: t.testTypeId,
        testTypeCode: t.testTypeCode,
        testTypeName: t.testTypeName,
        formTemplate: t.formTemplate ?? undefined,
        testSubType: t.testSubType ?? undefined,
        quantity: t.quantity,
        unitPrice: t.unitPrice,
      })),
    });
  };

  const locked = source?.header;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 lg:p-7 space-y-6">
        {/* Search */}
        <div className="space-y-2.5">
          <Label className="text-[15px]">{isAr ? "بحث عن العينة الأصلية" : "Search original sample"}</Label>
          <div className="relative">
            <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted-foreground" />
            <Input
              className="ps-10 h-11 text-base"
              placeholder={isAr ? "رمز العينة / العقد / المقاول" : "Sample code / contract / contractor"}
              value={searchQ}
              onChange={(e) => {
                setSearchQ(e.target.value);
                clearSelection();
              }}
            />
          </div>
          {!isSearching && (
            <p className="text-sm text-muted-foreground">
              {isAr
                ? "أحدث العينات ذات النتائج الفاشلة (بعد اعتماد QC)"
                : "Recent failed samples (QC signed off)"}
            </p>
          )}
          {loadingEligible && (
            <p className="text-sm text-muted-foreground">{isAr ? "جاري التحميل..." : "Loading..."}</p>
          )}
          {searchError && (
            <p className="text-xs text-destructive">{searchErrorDetail?.message}</p>
          )}
          {rootId && selectedSample != null && (
            <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-base">
              <div>
                <span className="font-mono font-semibold text-primary">{selectedSample.sampleCode}</span>
                <span className="text-muted-foreground ms-2">{selectedSample.contractorName ?? "—"}</span>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
                {isAr ? "تغيير" : "Change"}
              </Button>
            </div>
          )}
          {eligibleSamples && eligibleSamples.length > 0 && !rootId && (
            <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
              {eligibleSamples.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="w-full text-start px-4 py-3 hover:bg-muted/50 text-base"
                  onClick={() => selectRoot(r)}
                >
                  <span className="font-mono font-semibold text-primary">{r.sampleCode}</span>
                  <span className="text-muted-foreground ms-2">{r.contractorName ?? "—"}</span>
                  <Badge variant="destructive" className="ms-2 text-[10px]">
                    {isAr ? "فاشل" : "Failed"}
                  </Badge>
                  {r.retestCount > 0 && (
                    <Badge variant="outline" className="ms-2 text-[10px]">
                      {r.retestCount} {isAr ? "إعادة سابقة" : "prior retest(s)"}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          )}
          {!loadingEligible && eligibleSamples?.length === 0 && !rootId && (
            <p className="text-sm text-muted-foreground">
              {isSearching
                ? isAr
                  ? "لا توجد عينات مطابقة"
                  : "No matching samples"
                : isAr
                  ? "لا توجد عينات فاشلة جاهزة لإعادة الاختبار"
                  : "No failed samples ready for retest"}
            </p>
          )}
        </div>

        {loadingSource && rootId && !source && (
          <div className="flex items-center gap-2 text-base text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> {isAr ? "تحميل تفاصيل العينة..." : "Loading sample details..."}
          </div>
        )}

        {sourceError && rootId && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-base space-y-2">
            <p className="text-destructive">{sourceErrorDetail?.message}</p>
            <Button type="button" variant="outline" size="sm" onClick={clearSelection}>
              {isAr ? "العودة إلى القائمة" : "Back to list"}
            </Button>
          </div>
        )}

        {source && (
          <>
            <div className="rounded-lg border bg-muted/30 p-4 text-base space-y-1">
              <p className="font-mono font-bold">{source.rootSampleCode}</p>
              <p className="flex items-center gap-1 text-muted-foreground">
                <Lock className="w-3 h-3" />
                {locked?.contractNumber} · {locked?.contractorName} · {locked?.sector}
              </p>
            </div>

            <div>
              <Label className="text-[15px]">{isAr ? "السبب" : "Reason"} *</Label>
              <Select value={retestReason} onValueChange={setRetestReason}>
                <SelectTrigger className="h-10 text-base mt-1.5"><SelectValue placeholder={isAr ? "اختر السبب" : "Select reason"} /></SelectTrigger>
                <SelectContent>
                  {RETEST_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {isAr ? r.ar : r.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[15px]">{isAr ? "ملاحظات إضافية" : "Additional notes"}</Label>
              <Textarea className="mt-1.5 text-base" value={retestReasonNotes} onChange={(e) => setRetestReasonNotes(e.target.value)} rows={2} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[15px]">{isAr ? "الموقع" : "Location"}</Label>
                <Input className="h-10 text-base mt-1.5" value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
              <div>
                <Label className="text-[15px]">{isAr ? "تاريخ الصب" : "Casting date"}</Label>
                <Input type="date" className="h-10 text-base mt-1.5" value={castingDate} onChange={(e) => setCastingDate(e.target.value)} />
              </div>
            </div>

            <div>
              <Label className="text-[15px]">{isAr ? "الاختبارات" : "Tests"}</Label>
              <div className="mt-2">
                <TestSelectionPanel
                  hint={isAr ? "اختر الاختبارات لإعادة الفحص" : "Select tests to retest"}
                  selectedCount={tests.filter((t) => t.checked).length}
                  selectedLabel={isAr ? "محدد" : "selected"}
                >
                  <TestSelectionGrid>
                    {tests.map((t) => (
                      <TestSelectionCard key={t.testTypeCode} selected={t.checked}>
                        <TestSelectionRow
                          id={`retest-${t.testTypeCode}`}
                          checked={t.checked}
                          onCheckedChange={() => toggleTest(t.testTypeCode)}
                          name={t.testTypeName}
                          code={t.testTypeCode}
                          compact
                          trailing={
                            <>
                              <TestQtyInput
                                type="number"
                                min={1}
                                value={t.quantity}
                                disabled={!t.checked}
                                onChange={(e) => setQty(t.testTypeCode, Number(e.target.value))}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <TestPriceBadge lang={lang} amount={t.unitPrice} />
                            </>
                          }
                        />
                        {t.isFailed && (
                          <div className="ms-7 mt-1">
                            <Badge variant="destructive" className="text-[10px]">
                              {isAr ? "فاشل" : "Failed"}
                            </Badge>
                          </div>
                        )}
                      </TestSelectionCard>
                    ))}
                  </TestSelectionGrid>
                </TestSelectionPanel>
              </div>
            </div>

            {tests.some((t) => t.checked && t.testTypeCode === "CONC_CUBE") && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 max-w-md">
                <ReceptionNominalCubeSizePanel
                  lang={lang}
                  variant="compact"
                  value={nominalCubeSize}
                  onChange={setNominalCubeSize}
                />
              </div>
            )}

            <div>
              <Label className="text-[15px]">{isAr ? "ملاحظات الاستقبال" : "Reception notes"}</Label>
              <Textarea className="mt-1.5 text-base" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </>
        )}
      </div>

      <div className="border-t px-6 lg:px-7 py-4 flex justify-end gap-3 bg-background">
        <Button type="button" variant="outline" className="h-10 px-5" onClick={onCancel}>{isAr ? "إلغاء" : "Cancel"}</Button>
        <Button
          type="button"
          disabled={
            !source
            || !retestReason
            || createRetest.isPending
            || !tests.some((t) => t.checked)
            || (tests.some((t) => t.checked && t.testTypeCode === "CONC_CUBE") && !isValidNominalCubeSize(nominalCubeSize))
          }
          onClick={handleSubmit}
          className="gap-2 h-10 px-5 text-base font-semibold"
        >
          {createRetest.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
          {isAr ? "تسجيل إعادة الاختبار" : "Register retest"}
        </Button>
      </div>
    </div>
  );
}
