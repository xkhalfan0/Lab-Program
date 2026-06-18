import DashboardLayout from "@/components/DashboardLayout";
import { DeletionRequestButton } from "@/components/DeletionRequestButton";
import { RetestBadge } from "@/components/RetestBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDeletionStatus } from "@/hooks/useDeletionStatus";
import {
  AlertCircle,
  Clock,
  Eye,
  UserCheck,
  FlaskConical,
  CheckCircle2,
  Pencil,
  Printer,
} from "lucide-react";
import { ListFilterBar } from "@/components/ListFilterBar";
import { applyOrderFilters, hasActiveListFilters } from "@/lib/listFilters";
import { useMemo, useState, type ReactElement } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const toText = (val: any) => {
  if (val == null || val === undefined) return "—";
  if (typeof val === "object") {
    if (val instanceof Date) return val.toLocaleDateString();
    if (Array.isArray(val)) return val.join(", ");
    if (val.name) return String(val.name);
    if (val.label) return String(val.label);
    return JSON.stringify(val);
  }
  return String(val);
};

const normalizeOrder = (order: any) => {
  if (!order) return null;
  return {
    ...order,
    orderCode: String(order.orderCode || ""),
    contractorName: String(order.contractorName || ""),
    sampleType: String(order.sampleType || ""),
    items: (order.items || []).map((item: any) => ({
        ...item,
        testName: String(item?.testName || ""),
        quantity: Number(item?.quantity) || 0,
      })),
  };
};

function typeLabel(type: string, lang: string) {
  const map: Record<string, Record<string, string>> = {
    concrete: { en: "Concrete", ar: "خرسانة" },
    soil: { en: "Soil", ar: "تربة" },
    steel: { en: "Steel", ar: "حديد" },
    asphalt: { en: "Asphalt", ar: "أسفلت" },
    metal: { en: "Metal", ar: "معادن" },
    water: { en: "Water", ar: "مياه" },
    aggregates: { en: "Aggregates", ar: "ركام" },
  };
  return map[type]?.[lang] ?? type;
}

function TypeCell({ order, lang }: { order: any; lang: string }) {
  const base = typeLabel(order.sampleType ?? "", lang);
  const sub = order.sampleSubType;
  return (
    <div className="flex flex-col gap-0.5">
      <span>{base}</span>
      {sub && (
        <span className="text-[10px] text-muted-foreground font-medium bg-slate-100 px-1.5 py-0.5 rounded w-fit">
          {sub}
        </span>
      )}
    </div>
  );
}

function orderStatusColor(status: string) {
  const map: Record<string, string> = {
    pending: "#f59e0b",
    distributed: "#3b82f6",
    in_progress: "#8b5cf6",
    completed: "#10b981",
    reviewed: "#0ea5e9",
    qc_passed: "#22c55e",
    rejected: "#ef4444",
  };
  return map[status] ?? "#94a3b8";
}

function printDistributionSlip(order: any, lang: string) {
  const isAr = lang === "ar";
  const dir = isAr ? "rtl" : "ltr";
  const today = new Date().toLocaleDateString(
    isAr ? "ar-AE" : "en-AE",
    { year: "numeric", month: "long", day: "numeric" }
  );
  const dueDate = order.expectedCompletionDate
    ? new Date(order.expectedCompletionDate)
    : new Date(new Date(order.createdAt).getTime() + 7 * 24 * 60 * 60 * 1000);
  const dueDateText = dueDate.toLocaleDateString(isAr ? "ar-AE" : "en-AE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const distDateText = new Date(order.createdAt).toLocaleDateString(isAr ? "ar-AE" : "en-AE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const testsHtml = ((order.items ?? []) as any[])
    .map((item: any) => {
      const name = item.testName && item.testName !== "__multi__" ? item.testName : item.testTypeCode;
      const qty = Number(item.quantity) > 1 ? ` ×${item.quantity}` : "";
      return `<li>${name}${qty}</li>`;
    })
    .join("");
  const priority = order.priority ?? "normal";
  const priorityColor =
    priority === "urgent"
      ? "#dc2626"
      : priority === "high"
      ? "#ea580c"
      : "#2563eb";
  const priorityLabel = isAr
    ? (priority === "urgent" ? "عاجلة" : priority === "high" ? "عالية" : priority === "low" ? "منخفضة" : "عادية")
    : priority;

  const popup = window.open("", "_blank", "width=900,height=700");
  if (!popup) return;
  popup.document.write(`
    <html>
      <head>
        <title>${isAr ? "بطاقة توزيع" : "Distribution Slip"} - ${order.orderCode}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 18px; direction: ${dir}; color: #111; background: #fff; }
          .sheet { width: 100%; max-width: 190mm; margin: 0 auto; }
          .slip { border: 2px solid #111; padding: 14px; min-height: 120mm; max-height: 130mm; box-sizing: border-box; }
          .lab-name { font-size: 13px; font-weight: 700; text-align: center; margin-bottom: 4px; }
          .title { text-align: center; font-size: 18px; font-weight: 700; margin: 4px 0 10px; }
          .order-code { text-align: center; font-size: 28px; font-family: monospace; font-weight: 800; margin: 8px 0 12px; letter-spacing: 1px; }
          .row { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; margin-bottom: 6px; }
          .label { color: #444; }
          .value { font-weight: 600; text-align: ${isAr ? "left" : "right"}; }
          .tests { margin: 6px 0 8px; padding-${isAr ? "right" : "left"}: 18px; font-size: 14px; }
          .priority { display: inline-block; padding: 3px 10px; border-radius: 999px; color: #fff; font-weight: 700; background: ${priorityColor}; }
          .sig-box { margin-top: 14px; border: 1.5px solid #333; padding: 10px; height: 42px; display: flex; align-items: end; }
          .sig-line { width: 100%; border-bottom: 1px solid #333; }
          .footer { text-align: center; font-size: 11px; margin-top: 10px; color: #333; }
          @media print {
            @page { size: A4 portrait; margin: 10mm; }
            body { padding: 0; }
            .sheet { width: 100%; }
            .slip { page-break-inside: avoid; margin-bottom: 10mm; }
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="slip">
            <div class="lab-name">
              ${isAr ? "مختبر مواد البناء والهندسة" : "Construction Materials & Engineering Laboratory"}
            </div>
            <div class="title">${isAr ? "بطاقة توزيع / Distribution Slip" : "Distribution Slip / بطاقة توزيع"}</div>
            <div class="order-code">${order.orderCode ?? "—"}</div>
            <div class="row"><span class="label">${isAr ? "رمز العينة" : "Sample Code"}</span><span class="value">${order.sampleCode ?? "—"}</span></div>
            <div class="row"><span class="label">${isAr ? "المقاول" : "Contractor"}</span><span class="value">${order.contractorName ?? "—"}</span></div>
            <div class="row"><span class="label">${isAr ? "الفني المعين" : "Assigned Technician"}</span><span class="value">${order.assignedTechnicianName ?? "—"}</span></div>
            <div class="row"><span class="label">${isAr ? "الأولوية" : "Priority"}</span><span class="value"><span class="priority">${priorityLabel}</span></span></div>
            <div class="row"><span class="label">${isAr ? "تاريخ الاستحقاق" : "Due Date"}</span><span class="value">${dueDateText}</span></div>
            <div class="row"><span class="label">${isAr ? "تاريخ التوزيع" : "Distribution Date"}</span><span class="value">${distDateText}</span></div>
            <div class="row"><span class="label">${isAr ? "تاريخ الطباعة" : "Printed Date"}</span><span class="value">${today}</span></div>
            <div class="row" style="display:block;">
              <span class="label">${isAr ? "الاختبارات" : "Tests"}</span>
              <ul class="tests">${testsHtml || "<li>—</li>"}</ul>
            </div>
            <div class="row" style="display:block; margin-top: 8px;">
              <span class="label">${isAr ? "توقيع الفني / Technician Signature" : "Technician Signature / توقيع الفني"}</span>
              <div class="sig-box"><div class="sig-line"></div></div>
            </div>
            <div class="footer">Construction Materials & Engineering Laboratory</div>
          </div>
        </div>
      </body>
    </html>
  `);
  popup.document.close();
  setTimeout(() => {
    popup.focus();
    popup.print();
  }, 300);
}

/** Pending deletion on `lab_orders` for this row or any linked `distributions` line items. */
function useDistributionRowDeletionStatus(order: any) {
  const distributionIds = useMemo((): number[] => {
    const raw = (order.items ?? [])
      .map((item: any) => {
        const n = Number(item.distributionId);
        return Number.isFinite(n) && n > 0 ? n : 0;
      })
      .filter((id: number) => id > 0);
    return Array.from(new Set<number>(raw));
  }, [order]);

  const firstDistId: number = distributionIds[0] ?? 0;
  const orderId =
    typeof order?.id === "number" && Number.isFinite(order.id)
      ? order.id
      : Number(order?.id) || 0;

  const distDeletion = useDeletionStatus("distributions", firstDistId);
  const orderDeletion = useDeletionStatus("lab_orders", orderId);

  const restDistIds = distributionIds.slice(1);
  const extraQueries = trpc.useQueries((t) =>
    restDistIds.map((targetId) =>
      t.deletion.getPendingForTarget({ targetTable: "distributions", targetId })
    )
  );

  const extraHasPending = extraQueries.some((q) => q.data?.pending);

  const hasPendingDeletion =
    distDeletion.hasPendingDeletion ||
    orderDeletion.hasPendingDeletion ||
    extraHasPending;

  const PendingDeletionBadge = hasPendingDeletion
    ? distDeletion.PendingDeletionBadge ||
      orderDeletion.PendingDeletionBadge || (
        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300 gap-1">
          <Clock className="h-3 w-3" />
          Deletion Pending
        </Badge>
      )
    : null;

  const DisabledWarning = hasPendingDeletion
    ? distDeletion.DisabledWarning ||
      orderDeletion.DisabledWarning || (
        <span className="inline-flex items-center gap-1 text-xs text-orange-700">
          <AlertCircle className="h-3 w-3 shrink-0" />
          A deletion request is pending for this record.
        </span>
      )
    : null;

  return {
    hasPendingDeletion,
    PendingDeletionBadge,
    DisabledWarning,
  };
}

function DistributionAllOrdersStatusCell({ order, lang }: { order: any; lang: string }) {
  const deletionStatus = useDistributionRowDeletionStatus(order);
  const completedTests = (order.items ?? []).filter((item: any) => item.status === "completed").length;
  const totalTests = (order.items ?? []).length;
  const sampleStatus = order.sampleStatus ?? order.sample?.status ?? order.status;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge status={sampleStatus} />
        {deletionStatus.PendingDeletionBadge}
      </div>
      {sampleStatus === "testing_in_progress" && totalTests > 0 && (
        <span className="text-xs text-muted-foreground">
          {completedTests}/{totalTests} {lang === "ar" ? "اختبارات مكتملة" : "tests completed"}
        </span>
      )}
      {sampleStatus === "awaiting_review" && (
        <span className="text-xs font-semibold text-orange-700">
          {lang === "ar" ? "جاهز للمراجعة" : "Ready for review"}
        </span>
      )}
    </div>
  );
}

function DistributionAllOrdersActionsCell({
  order,
  lang,
  handleOpenDialog,
  setLocation,
  handleOpenEditDialog,
  printDistributionSlip,
  onDeletionSuccess,
}: {
  order: any;
  lang: string;
  handleOpenDialog: (order: any) => void;
  setLocation: (path: string) => void;
  handleOpenEditDialog: (order: any) => void;
  printDistributionSlip: (order: any, lang: string) => void;
  onDeletionSuccess: () => void;
}) {
  const hasSubmittedItems = (order.items ?? []).some(
    (item: any) => item.status === "completed" || item.status === "submitted"
  );
  const canDistribute = order.status === "pending";
  const canEditDistribution =
    (order.status === "distributed" || order.status === "in_progress") && !hasSubmittedItems;
  const canPrintSlip = order.status === "distributed" || order.status === "in_progress";

  const deletionStatus = useDistributionRowDeletionStatus(order);
  const { hasPendingDeletion, DisabledWarning, PendingDeletionBadge } = deletionStatus;

  const wrapDisabledAction = (node: ReactElement, disabled: boolean) => {
    if (!disabled) return node;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-not-allowed">{node}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {DisabledWarning}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="flex items-center gap-1">
      {PendingDeletionBadge}
      {wrapDisabledAction(
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          disabled={hasPendingDeletion}
          onClick={() => setLocation(`/order/${order.id}`)}
        >
          <Eye className="w-3.5 h-3.5" />
        </Button>,
        hasPendingDeletion
      )}
      {canDistribute &&
        wrapDisabledAction(
          <Button
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={hasPendingDeletion}
            onClick={() => handleOpenDialog(order)}
          >
            <UserCheck className="w-3.5 h-3.5" />
            {lang === "ar" ? "توزيع" : "Distribute"}
          </Button>,
          hasPendingDeletion
        )}
      {canEditDistribution &&
        wrapDisabledAction(
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-amber-600 hover:text-amber-700"
            title={lang === "ar" ? "تعديل التوزيع" : "Edit Distribution"}
            disabled={hasPendingDeletion}
            onClick={() => handleOpenEditDialog(order)}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>,
          hasPendingDeletion
        )}
      {canPrintSlip &&
        wrapDisabledAction(
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-blue-600 hover:text-blue-700"
            title={lang === "ar" ? "طباعة بطاقة التوزيع" : "Print Distribution Slip"}
            disabled={hasPendingDeletion}
            onClick={() => printDistributionSlip(order, lang)}
          >
            <Printer className="w-3.5 h-3.5" />
          </Button>,
          hasPendingDeletion
        )}
      {hasPendingDeletion ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-not-allowed opacity-60">
              <span className="pointer-events-none inline-flex">
                <DeletionRequestButton
                  targetTable="lab_orders"
                  targetId={order.id}
                  targetLabel={`Order ${order.orderCode}`}
                  variant="icon"
                  onSuccess={onDeletionSuccess}
                />
              </span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            {DisabledWarning}
          </TooltipContent>
        </Tooltip>
      ) : (
        <DeletionRequestButton
          targetTable="lab_orders"
          targetId={order.id}
          targetLabel={`Order ${order.orderCode}`}
          variant="icon"
          onSuccess={onDeletionSuccess}
        />
      )}
    </div>
  );
}

export default function Distribution() {
  const { lang } = useLanguage();
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({
    technicianId: "",
    priority: "normal" as "low" | "normal" | "high" | "urgent",
    notes: "",
  });
  const [taskFilter, setTaskFilter] = useState<"all" | "active" | "awaiting_review" | "done">("all");
  const [listSearch, setListSearch] = useState("");
  const [sampleTypeFilter, setSampleTypeFilter] = useState("all");
  const [technicianFilter, setTechnicianFilter] = useState("all");
  const [, setLocation] = useLocation();

  // ─── Data ──────────────────────────────────────────────────────────────────
  const { data: rawOrders = [], refetch } = trpc.orders.list.useQuery();
  const normalizedOrders = (rawOrders as any[]).map(normalizeOrder).filter((o: any) => !!o);
  const orders = normalizedOrders.map((o: any) => ({
    ...o,
    priority: o.priority != null ? String(o.priority) : "normal",
    testNames: Array.isArray(o.testNames) ? o.testNames.map((n: any) => (typeof n === "string" ? n : String(n ?? "—"))) : [],
  }));
  const { data: rawTechnicians = [] } = trpc.users.technicians.useQuery();
  const technicians = (rawTechnicians as any[]).map((tech: any) => ({
    ...tech,
    id: tech.id,
    name: toText(tech.name),
    specialty: tech.specialty != null ? String(tech.specialty) : "",
  }));

  // ─── Mutations ─────────────────────────────────────────────────────────────
  const distributeOrder = trpc.orders.distribute.useMutation({
    onSuccess: () => {
      toast.success(lang === "ar"
        ? `تم توزيع الأوردر بنجاح`
        : `Order distributed successfully`);
      setSelectedOrder(null);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const editDistribution = trpc.orders.reassign.useMutation({
    onSuccess: () => {
      toast.success(lang === "ar" ? "تم تعديل التوزيع بنجاح" : "Distribution updated successfully");
      setSelectedOrder(null);
      setIsEditing(false);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  // ─── Filters ───────────────────────────────────────────────────────────────
  const getSampleStatus = (order: any) => order.sampleStatus ?? order.sample?.status ?? order.status;

  const listFilters = useMemo(
    () => ({ search: listSearch, sampleType: sampleTypeFilter, technicianId: technicianFilter }),
    [listSearch, sampleTypeFilter, technicianFilter],
  );

  const filteredOrders = useMemo(() => {
    const byTask = orders.filter((o: any) => {
      const sampleStatus = getSampleStatus(o);
      if (taskFilter === "active") {
        return sampleStatus === "distributed" || sampleStatus === "testing_in_progress";
      }
      if (taskFilter === "awaiting_review") {
        return sampleStatus === "awaiting_review";
      }
      if (taskFilter === "done") {
        return sampleStatus === "approved" || sampleStatus === "qc_passed" || o.status === "completed";
      }
      return true;
    });
    return applyOrderFilters(byTask, listFilters);
  }, [orders, taskFilter, listFilters]);

  const activeOrders = orders.filter((o: any) => {
    const sampleStatus = getSampleStatus(o);
    return sampleStatus === "distributed" || sampleStatus === "testing_in_progress";
  });
  const awaitingReviewOrders = orders.filter((o: any) => getSampleStatus(o) === "awaiting_review");
  const doneOrders = orders.filter((o: any) => {
    const sampleStatus = getSampleStatus(o);
    return sampleStatus === "approved" || sampleStatus === "qc_passed" || o.status === "completed";
  });

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleOpenDialog = (order: any) => {
    setSelectedOrder(normalizeOrder(order));
    setIsEditing(false);
    setForm({ technicianId: "", priority: "normal", notes: "" });
  };
  const handleOpenEditDialog = (order: any) => {
    setSelectedOrder(normalizeOrder(order));
    setIsEditing(true);
    setForm({
      technicianId: String(order.assignedTechnicianId ?? ""),
      priority: order.priority ?? "normal",
      notes: order.notes ?? "",
    });
  };

  const handleDistribute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.technicianId) {
      toast.error(lang === "ar" ? "يرجى اختيار فني" : "Please select a technician");
      return;
    }
    if (isEditing) {
      editDistribution.mutate({
        orderId: selectedOrder.id,
        technicianId: parseInt(form.technicianId),
        priority: form.priority,
        notes: form.notes || undefined,
      });
    } else {
      distributeOrder.mutate({
        orderId: selectedOrder.id,
        technicianId: parseInt(form.technicianId),
        priority: form.priority,
        notes: form.notes || undefined,
      });
    }
  };

  // ─── Filter Buttons ────────────────────────────────────────────────────────
  const filterBtns = [
    { key: "all", label: lang === "ar" ? "الكل" : "All", count: orders.length, color: "#3b82f6" },
    { key: "active", label: lang === "ar" ? "نشطة" : "Active", count: activeOrders.length, color: "#f59e0b" },
    { key: "awaiting_review", label: lang === "ar" ? "في انتظار المراجعة" : "Awaiting Review", count: awaitingReviewOrders.length, color: "#f97316" },
    { key: "done", label: lang === "ar" ? "مُنجزة" : "Done", count: doneOrders.length, color: "#10b981" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold">{lang === "ar" ? "توزيع الأوردرات" : "Order Distribution"}</h1>
          <p className="text-sm text-muted-foreground">
            {lang === "ar" ? "توزيع أوامر الاختبار على الفنيين" : "Assign test orders to technicians"}
          </p>
        </div>

        {/* Filter Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {filterBtns.map((btn) => {
            const active = taskFilter === btn.key;
            return (
              <button
                key={btn.key}
                onClick={() => setTaskFilter(btn.key as any)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: active ? btn.color : "#fff",
                  border: `1.5px solid ${active ? btn.color : "#e2e8f0"}`,
                  color: active ? "#fff" : btn.color,
                  boxShadow: active ? `0 2px 8px ${btn.color}30` : "none",
                }}
              >
                {btn.label}
                <span
                  className="px-1.5 py-0.5 rounded-full text-xs font-bold"
                  style={{
                    background: active ? "rgba(255,255,255,0.25)" : `${btn.color}15`,
                    color: active ? "#fff" : btn.color,
                  }}
                >
                  {btn.count}
                </span>
              </button>
            );
          })}
        </div>

        <ListFilterBar
          lang={lang}
          search={listSearch}
          onSearchChange={setListSearch}
          searchPlaceholder={
            lang === "ar"
              ? "بحث برقم الأوردر، العينة، العقد، أو المقاول..."
              : "Search by order, sample, contract, or contractor..."
          }
          sampleType={sampleTypeFilter}
          onSampleTypeChange={setSampleTypeFilter}
          selectFilters={[
            {
              id: "technician",
              value: technicianFilter,
              onChange: setTechnicianFilter,
              placeholder: lang === "ar" ? "الفني" : "Technician",
              options: [
                { value: "all", label: lang === "ar" ? "جميع الفنيين" : "All technicians" },
                ...technicians.map((tech: any) => ({
                  value: String(tech.id),
                  label: tech.name,
                })),
              ],
            },
          ]}
          showClear={hasActiveListFilters(listFilters)}
          onClear={() => {
            setListSearch("");
            setSampleTypeFilter("all");
            setTechnicianFilter("all");
          }}
          resultCount={filteredOrders.length}
        />

        {/* All Orders */}
        {(taskFilter === "all" || taskFilter === "active" || taskFilter === "awaiting_review" || taskFilter === "done") && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                {lang === "ar" ? "جميع الأوردرات" : "All Orders"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-start px-4 py-2.5 text-xs font-medium text-muted-foreground">{lang === "ar" ? "رقم الأوردر" : "Order #"}</th>
                      <th className="text-start px-4 py-2.5 text-xs font-medium text-muted-foreground">{lang === "ar" ? "المقاول" : "Contractor"}</th>
                      <th className="text-start px-4 py-2.5 text-xs font-medium text-muted-foreground">{lang === "ar" ? "النوع" : "Type"}</th>
                      <th className="text-start px-4 py-2.5 text-xs font-medium text-muted-foreground">{lang === "ar" ? "الاختبارات" : "Tests"}</th>
                      <th className="text-start px-4 py-2.5 text-xs font-medium text-muted-foreground">{lang === "ar" ? "الفني" : "Technician"}</th>
                      <th className="text-start px-4 py-2.5 text-xs font-medium text-muted-foreground">{lang === "ar" ? "الحالة" : "Status"}</th>
                      <th className="text-start px-4 py-2.5 text-xs font-medium text-muted-foreground">{lang === "ar" ? "الإجراء" : "Action"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order: any) => (
                        <tr key={order.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2.5">
                            <div className="font-mono text-xs font-semibold text-primary">{toText(order.orderCode)}</div>
                            <RetestBadge
                              retestNumber={order.retestNumber}
                              originalSampleId={order.originalSampleId}
                              originalSampleCode={order.originalSampleCode}
                              compact
                            />
                          </td>
                          <td className="px-4 py-2.5 text-xs">{toText(order.contractorName)}</td>
                          <td className="px-4 py-2.5 text-xs"><TypeCell order={{ ...order, sampleType: String(order.sampleType ?? ""), sampleSubType: toText(order.sampleSubType) }} lang={lang} /></td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {(order.items ?? []).length === 0 ? (
                                <span className="text-xs text-muted-foreground italic">{lang === "ar" ? "لا توجد" : "None"}</span>
                              ) : (order.items ?? []).filter((item: any) => item && typeof item === "object").map((item: any, idx: number) => (
                                <span
                                  key={`all-${order.id}-${item.id || item._id || idx}`}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
                                  style={{
                                    background: item.status === "completed" ? "#f0fdf4" : "#f8fafc",
                                    borderColor: item.status === "completed" ? "#86efac" : "#e2e8f0",
                                    color: item.status === "completed" ? "#15803d" : "#475569",
                                  }}
                                >
                                  {item.status === "completed" ? <CheckCircle2 className="w-3 h-3" /> : <FlaskConical className="w-3 h-3" />}
                                  {item.testName && item.testName !== "__multi__" ? String(item.testName) : String(item.testTypeCode ?? "—")}
                                  {Number(item.quantity) > 1 ? ` ×${item.quantity}` : ""}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">
                            {toText(order.assignedTechnicianName)}
                          </td>
                          <td className="px-4 py-2.5">
                            <DistributionAllOrdersStatusCell order={order} lang={lang} />
                          </td>
                          <td className="px-4 py-2.5">
                            <DistributionAllOrdersActionsCell
                              order={order}
                              lang={lang}
                              handleOpenDialog={handleOpenDialog}
                              setLocation={setLocation}
                              handleOpenEditDialog={handleOpenEditDialog}
                              printDistributionSlip={printDistributionSlip}
                              onDeletionSuccess={() => refetch()}
                            />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Distribute Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={(o) => { if (!o) { setSelectedOrder(null); setIsEditing(false); } }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              {isEditing
                ? (lang === "ar"
                  ? `تعديل التوزيع — ${toText(selectedOrder?.orderCode)}`
                  : `Edit Distribution — ${toText(selectedOrder?.orderCode)}`)
                : (lang === "ar"
                  ? `توزيع الأوردر — ${toText(selectedOrder?.orderCode)}`
                  : `Distribute Order — ${toText(selectedOrder?.orderCode)}`)}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleDistribute} className="space-y-4 mt-2">
            {/* Order Summary */}
            <div className="bg-muted/40 rounded-lg p-3 text-xs space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{lang === "ar" ? "المقاول:" : "Contractor:"}</span>
                <span className="font-medium">{toText(selectedOrder?.contractorName)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{lang === "ar" ? "النوع:" : "Type:"}</span>
                <span className="font-medium">{toText(typeLabel(String(selectedOrder?.sampleType ?? ""), lang))}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{lang === "ar" ? "الاختبارات:" : "Tests:"}</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(selectedOrder?.items ?? []).filter((item: any) => item && typeof item === "object").map((item: any, idx: number) => (
                    <span key={`dialog-${selectedOrder?.id}-${item.id || item._id || idx}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                      <FlaskConical className="w-3 h-3" />
                      {item.testName && item.testName !== "__multi__" ? String(item.testName) : String(item.testTypeCode ?? "—")}
                      {Number(item.quantity) > 1 ? ` ×${toText(item.quantity)}` : ""}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Technician */}
            <div className="space-y-1.5">
              <Label>{lang === "ar" ? "الفني المسؤول" : "Assigned Technician"} <span className="text-red-500">*</span></Label>
              <Select value={form.technicianId} onValueChange={(v) => setForm({ ...form, technicianId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={lang === "ar" ? "اختر الفني..." : "Select technician..."} />
                </SelectTrigger>
                <SelectContent>
                  {technicians.map((tech: any) => (
                    <SelectItem key={tech.id} value={String(tech.id)}>
                      {toText(tech.name)} {tech.specialty ? `(${toText(tech.specialty)})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <Label>{lang === "ar" ? "الأولوية" : "Priority"}</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as any })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{lang === "ar" ? "منخفضة" : "Low"}</SelectItem>
                  <SelectItem value="normal">{lang === "ar" ? "عادية" : "Normal"}</SelectItem>
                  <SelectItem value="high">{lang === "ar" ? "عالية" : "High"}</SelectItem>
                  <SelectItem value="urgent">{lang === "ar" ? "عاجلة" : "Urgent"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>{lang === "ar" ? "ملاحظات" : "Notes"}</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder={lang === "ar" ? "ملاحظات إضافية..." : "Additional notes..."}
                rows={2}
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => { setSelectedOrder(null); setIsEditing(false); }}>
                {lang === "ar" ? "إلغاء" : "Cancel"}
              </Button>
              <Button type="submit" disabled={distributeOrder.isPending || editDistribution.isPending}>
                {isEditing ? <Pencil className="w-4 h-4 mr-1" /> : <UserCheck className="w-4 h-4 mr-1" />}
                {isEditing
                  ? (editDistribution.isPending
                    ? (lang === "ar" ? "جاري الحفظ..." : "Saving...")
                    : (lang === "ar" ? "حفظ التعديلات" : "Save Changes"))
                  : (distributeOrder.isPending
                    ? (lang === "ar" ? "جاري التوزيع..." : "Distributing...")
                    : (lang === "ar" ? "توزيع الأوردر" : "Distribute Order"))}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
