import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, FlaskConical, Loader2, Lock } from "lucide-react";
import { RETEST_REASONS } from "@shared/retestReasons";
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
  const [tests, setTests] = useState<RetestTest[]>([]);
  const [location, setLocation] = useState("");
  const [castingDate, setCastingDate] = useState("");
  const [condition, setCondition] = useState<"good" | "damaged" | "partial">("good");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [notes, setNotes] = useState("");
  const [retestReason, setRetestReason] = useState<string>("");
  const [retestReasonNotes, setRetestReasonNotes] = useState("");
  const [nominalCubeSize, setNominalCubeSize] = useState("150mm");

  const { data: searchResults, isFetching: searching } = trpc.samples.searchRetestEligible.useQuery(
    { query: searchQ },
    { enabled: searchQ.trim().length >= 2 }
  );

  const { data: source, isLoading: loadingSource } = trpc.samples.getRetestSource.useQuery(
    { rootSampleId: rootId! },
    { enabled: rootId != null }
  );

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

  const selectRoot = (id: number) => {
    setRootId(id);
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
    setPriority((source.defaultPriority as typeof priority) ?? "normal");
    setNominalCubeSize(source.header.nominalCubeSize ?? "150mm");
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
      condition,
      notes: notes || undefined,
      location: location || undefined,
      castingDate: castingDate || undefined,
      priority,
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
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Search */}
        <div className="space-y-2">
          <Label>{isAr ? "بحث عن العينة الأصلية" : "Search original sample"}</Label>
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="ps-9"
              placeholder={isAr ? "رمز العينة / العقد / المقاول" : "Sample code / contract / contractor"}
              value={searchQ}
              onChange={(e) => { setSearchQ(e.target.value); setRootId(null); setTests([]); }}
            />
          </div>
          {searching && <p className="text-xs text-muted-foreground">{isAr ? "جاري البحث..." : "Searching..."}</p>}
          {searchResults && searchResults.length > 0 && !rootId && (
            <div className="border rounded-lg divide-y max-h-40 overflow-y-auto">
              {searchResults.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="w-full text-start px-3 py-2 hover:bg-muted/50 text-sm"
                  onClick={() => selectRoot(r.id)}
                >
                  <span className="font-mono font-semibold text-primary">{r.sampleCode}</span>
                  <span className="text-muted-foreground ms-2">{r.contractorName ?? "—"}</span>
                  {r.retestCount > 0 && (
                    <Badge variant="outline" className="ms-2 text-[10px]">
                      {r.retestCount} {isAr ? "إعادة سابقة" : "prior retest(s)"}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          )}
          {searchQ.length >= 2 && searchResults?.length === 0 && !searching && (
            <p className="text-xs text-muted-foreground">{isAr ? "لا توجد عينات مؤهلة" : "No eligible samples"}</p>
          )}
        </div>

        {loadingSource && rootId && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> {isAr ? "تحميل..." : "Loading..."}
          </div>
        )}

        {source && (
          <>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
              <p className="font-mono font-bold">{source.rootSampleCode}</p>
              <p className="flex items-center gap-1 text-muted-foreground">
                <Lock className="w-3 h-3" />
                {locked?.contractNumber} · {locked?.contractorName} · {locked?.sector}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{isAr ? "السبب" : "Reason"} *</Label>
                <Select value={retestReason} onValueChange={setRetestReason}>
                  <SelectTrigger><SelectValue placeholder={isAr ? "اختر السبب" : "Select reason"} /></SelectTrigger>
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
                <Label>{isAr ? "الأولوية" : "Priority"}</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["low", "normal", "high", "urgent"].map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>{isAr ? "ملاحظات إضافية" : "Additional notes"}</Label>
              <Textarea value={retestReasonNotes} onChange={(e) => setRetestReasonNotes(e.target.value)} rows={2} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{isAr ? "الموقع" : "Location"}</Label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
              <div>
                <Label>{isAr ? "تاريخ الصب" : "Casting date"}</Label>
                <Input type="date" value={castingDate} onChange={(e) => setCastingDate(e.target.value)} />
              </div>
            </div>

            <div>
              <Label>{isAr ? "الاختبارات" : "Tests"}</Label>
              <div className="border rounded-lg divide-y mt-1">
                {tests.map((t) => (
                  <div key={t.testTypeCode} className="flex items-center gap-3 px-3 py-2">
                    <Checkbox checked={t.checked} onCheckedChange={() => toggleTest(t.testTypeCode)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.testTypeName}</p>
                      {t.isFailed && (
                        <Badge variant="destructive" className="text-[10px] mt-0.5">
                          {isAr ? "فاشل" : "Failed"}
                        </Badge>
                      )}
                    </div>
                    <Input
                      type="number"
                      min={1}
                      className="w-16 h-8 text-xs"
                      value={t.quantity}
                      onChange={(e) => setQty(t.testTypeCode, Number(e.target.value))}
                      disabled={!t.checked}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label>{isAr ? "ملاحظات الاستقبال" : "Reception notes"}</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </>
        )}
      </div>

      <div className="border-t px-6 py-3 flex justify-end gap-2 bg-background">
        <Button type="button" variant="outline" onClick={onCancel}>{isAr ? "إلغاء" : "Cancel"}</Button>
        <Button
          type="button"
          disabled={!source || !retestReason || createRetest.isPending || !tests.some((t) => t.checked)}
          onClick={handleSubmit}
          className="gap-2"
        >
          {createRetest.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
          {isAr ? "تسجيل إعادة الاختبار" : "Register retest"}
        </Button>
      </div>
    </div>
  );
}
