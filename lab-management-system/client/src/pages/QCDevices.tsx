import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { sampleTypeFilterLabel } from "@/lib/listFilters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ClipboardCheck,
  Loader2,
} from "lucide-react";

type DeviceCategory = "concrete" | "soil" | "steel" | "asphalt" | "aggregates" | "general";
type DeviceStatus = "in_service" | "due_calibration" | "expired" | "under_maintenance" | "retired";
type FilterKey = "all" | "needs_action" | DeviceCategory;

const CATEGORY_OPTIONS: DeviceCategory[] = [
  "concrete",
  "soil",
  "steel",
  "asphalt",
  "aggregates",
  "general",
];

const EMPTY_DEVICE_FORM = {
  deviceCode: "",
  nameEn: "",
  nameAr: "",
  category: "general" as DeviceCategory,
  department: "",
  manufacturer: "",
  model: "",
  serialNumber: "",
  location: "",
  calibrationIntervalDays: "365",
  lastCalibratedAt: "",
  maintenanceNotes: "",
  requiresDailyCheck: false,
  status: "in_service" as DeviceStatus,
};

function statusLabel(status: string, ar: boolean): string {
  const map: Record<string, { en: string; ar: string }> = {
    in_service: { en: "In service", ar: "في الخدمة" },
    due_calibration: { en: "Due calibration", ar: "تستحق معايرة" },
    expired: { en: "Expired — stopped", ar: "منتهية — موقوفة" },
    under_maintenance: { en: "Under maintenance", ar: "تحت الصيانة" },
    retired: { en: "Retired", ar: "متقاعد" },
  };
  return map[status]?.[ar ? "ar" : "en"] ?? status;
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "expired":
      return "bg-red-100 text-red-800 border-red-200";
    case "due_calibration":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "under_maintenance":
      return "bg-sky-100 text-sky-800 border-sky-200";
    case "retired":
      return "bg-slate-100 text-slate-600 border-slate-200";
    default:
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
  }
}

function dueLabel(daysUntilDue: number | null | undefined, ar: boolean): string {
  if (daysUntilDue == null) return ar ? "—" : "—";
  if (daysUntilDue < 0) {
    const n = Math.abs(daysUntilDue);
    return ar ? `منتهية منذ ${n} يوم` : `Expired ${n} day(s) ago`;
  }
  if (daysUntilDue === 0) return ar ? "مستحقة اليوم" : "Due today";
  return ar ? `خلال ${daysUntilDue} يوم` : `In ${daysUntilDue} day(s)`;
}

export default function QCDevices() {
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const utils = trpc.useUtils();

  const [filter, setFilter] = useState<FilterKey>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [showCalibrate, setShowCalibrate] = useState<number | null>(null);
  const [showDetail, setShowDetail] = useState<number | null>(null);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [form, setForm] = useState(EMPTY_DEVICE_FORM);
  const [calForm, setCalForm] = useState({
    calibratedAt: new Date().toISOString().slice(0, 10),
    certificateRef: "",
    performedBy: "",
    notes: "",
  });
  const [followUpForm, setFollowUpForm] = useState({
    title: "",
    assigneeName: "",
    dueDate: "",
    deviceId: "",
  });

  const listInput = useMemo(() => {
    if (filter === "all") return undefined;
    if (filter === "needs_action") return { needsAction: true };
    return { category: filter };
  }, [filter]);

  const { data: devices = [], isLoading } = trpc.devices.list.useQuery(listInput);
  const { data: stats } = trpc.devices.stats.useQuery();
  const { data: followUps = [] } = trpc.devices.listFollowUps.useQuery();
  const { data: dailySummary } = trpc.devices.dailyCheckSummary.useQuery();
  const { data: detail, isLoading: detailLoading } = trpc.devices.getById.useQuery(
    { id: showDetail ?? 0 },
    { enabled: showDetail != null },
  );

  const createDevice = trpc.devices.create.useMutation({
    onSuccess: async () => {
      toast.success(ar ? "تمت إضافة الجهاز" : "Device added");
      setShowAdd(false);
      setForm(EMPTY_DEVICE_FORM);
      await utils.devices.list.invalidate();
      await utils.devices.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const recordCalibration = trpc.devices.recordCalibration.useMutation({
    onSuccess: async () => {
      toast.success(ar ? "تم تسجيل المعايرة" : "Calibration recorded");
      setShowCalibrate(null);
      await utils.devices.list.invalidate();
      await utils.devices.stats.invalidate();
      if (showDetail) await utils.devices.getById.invalidate({ id: showDetail });
    },
    onError: (e) => toast.error(e.message),
  });

  const createFollowUp = trpc.devices.createFollowUp.useMutation({
    onSuccess: async () => {
      toast.success(ar ? "تمت إضافة المتابعة" : "Follow-up added");
      setShowFollowUp(false);
      setFollowUpForm({ title: "", assigneeName: "", dueDate: "", deviceId: "" });
      await utils.devices.listFollowUps.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateFollowUp = trpc.devices.updateFollowUpStatus.useMutation({
    onSuccess: () => utils.devices.listFollowUps.invalidate(),
  });

  const updateDeviceStatus = trpc.devices.update.useMutation({
    onSuccess: async () => {
      toast.success(ar ? "تم تحديث الحالة" : "Status updated");
      await utils.devices.list.invalidate();
      await utils.devices.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const recordDailyCheck = trpc.devices.recordDailyCheck.useMutation({
    onSuccess: async () => {
      toast.success(ar ? "تم تسجيل التحقق اليومي" : "Daily check recorded");
      await utils.devices.dailyCheckSummary.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const filterButtons: Array<{ key: FilterKey; label: string }> = [
    { key: "all", label: ar ? "الكل" : "All" },
    { key: "needs_action", label: ar ? "تحتاج إجراء" : "Need action" },
    { key: "concrete", label: sampleTypeFilterLabel("concrete", lang) },
    { key: "soil", label: sampleTypeFilterLabel("soil", lang) },
    { key: "steel", label: sampleTypeFilterLabel("steel", lang) },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Wrench className="h-4 w-4" />
              {ar ? "ضبط الجودة" : "Quality Control"}
            </div>
            <h1 className="text-2xl font-bold">{ar ? "الأجهزة والمعايرة" : "Devices & Calibration"}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {ar
                ? "إدارة أجهزة المختبر ومتابعة المعايرة والصيانة"
                : "Manage lab devices, calibration due dates, and maintenance status"}
            </p>
          </div>
          <Button onClick={() => setShowAdd(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            {ar ? "إضافة جهاز" : "Add Device"}
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-red-200 bg-red-50/40">
            <CardContent className="pt-5">
              <div className="text-sm font-medium text-red-700">{ar ? "منتهية — موقوفة" : "Expired — stopped"}</div>
              <div className="text-3xl font-bold text-red-800 mt-1">{stats?.expired ?? 0}</div>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50/40">
            <CardContent className="pt-5">
              <div className="text-sm font-medium text-amber-800">{ar ? "تستحق معايرة (30 يوم)" : "Due within 30 days"}</div>
              <div className="text-3xl font-bold text-amber-900 mt-1">{stats?.dueSoon ?? 0}</div>
            </CardContent>
          </Card>
          <Card className="border-emerald-200 bg-emerald-50/40">
            <CardContent className="pt-5">
              <div className="text-sm font-medium text-emerald-800">{ar ? "في الخدمة" : "In service"}</div>
              <div className="text-3xl font-bold text-emerald-900 mt-1">
                {stats?.inService ?? 0}
                <span className="text-base font-normal text-emerald-700 ms-2">
                  {ar ? `من ${stats?.total ?? 0}` : `of ${stats?.total ?? 0}`}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {filterButtons.map((btn) => (
                <Button
                  key={btn.key}
                  type="button"
                  size="sm"
                  variant={filter === btn.key ? "default" : "outline"}
                  onClick={() => setFilter(btn.key)}
                >
                  {btn.label}
                </Button>
              ))}
            </div>

            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex min-h-[240px] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                  </div>
                ) : devices.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    {ar ? "لا توجد أجهزة مسجلة بعد" : "No devices registered yet"}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-start font-semibold">{ar ? "الجهاز" : "Device"}</th>
                          <th className="px-4 py-3 text-start font-semibold">{ar ? "المعايرة القادمة" : "Next calibration"}</th>
                          <th className="px-4 py-3 text-start font-semibold">{ar ? "الحالة" : "Status"}</th>
                          <th className="px-4 py-3 text-start font-semibold">{ar ? "إجراءات" : "Actions"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {devices.map((d) => {
                          const name = ar ? (d.nameAr || d.nameEn) : d.nameEn;
                          return (
                            <tr key={d.id} className="border-b hover:bg-slate-50/80">
                              <td className="px-4 py-3">
                                <div className="font-mono font-semibold text-blue-700">{d.deviceCode}</div>
                                <div className="font-medium">{name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {sampleTypeFilterLabel(d.category, lang)}
                                  {d.department ? ` · ${d.department}` : ""}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div>
                                  {d.nextCalibrationDueAt
                                    ? new Date(d.nextCalibrationDueAt).toLocaleDateString(ar ? "ar-AE" : "en-GB")
                                    : "—"}
                                </div>
                                <div className={`text-xs ${d.effectiveStatus === "expired" ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>
                                  {dueLabel(d.daysUntilDue, ar)}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant="outline" className={statusBadgeClass(d.effectiveStatus)}>
                                  {statusLabel(d.effectiveStatus, ar)}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-2">
                                  {(d.effectiveStatus === "expired" || d.effectiveStatus === "due_calibration") && (
                                    <Button size="sm" variant="outline" onClick={() => setShowCalibrate(d.id)}>
                                      {ar ? "طلب معايرة" : "Calibrate"}
                                    </Button>
                                  )}
                                  {d.effectiveStatus === "under_maintenance" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => updateDeviceStatus.mutate({ id: d.id, status: "in_service" })}
                                    >
                                      {ar ? "إرجاع للخدمة" : "Return to service"}
                                    </Button>
                                  )}
                                  <Button size="sm" variant="ghost" onClick={() => setShowDetail(d.id)}>
                                    {ar ? "التفاصيل" : "Details"}
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="border-t px-4 py-3 text-xs text-muted-foreground">
                  {ar
                    ? `عرض ${devices.length} من ${stats?.total ?? devices.length} — الجهاز المنتهي لا يُستخدم لإدخال النتائج`
                    : `Showing ${devices.length} of ${stats?.total ?? devices.length} — expired devices must not be used for test entry`}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base">{ar ? "المتابعات" : "Follow-ups"}</CardTitle>
                <Button size="sm" variant="outline" onClick={() => setShowFollowUp(true)}>
                  <Plus className="h-3.5 w-3.5 me-1" />
                  {ar ? "إضافة" : "Add"}
                </Button>
              </CardHeader>
              <CardContent className="space-y-3 max-h-[360px] overflow-y-auto">
                {followUps.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{ar ? "لا توجد متابعات" : "No follow-ups yet"}</p>
                ) : (
                  followUps.map((f) => (
                    <div key={f.id} className="rounded-lg border p-3 space-y-2">
                      <div className="text-sm font-medium">{f.title}</div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
                        {f.assigneeName && <span>{f.assigneeName}</span>}
                        {f.dueDate && (
                          <span>{new Date(f.dueDate).toLocaleDateString(ar ? "ar-AE" : "en-GB")}</span>
                        )}
                      </div>
                      {f.status === "open" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => updateFollowUp.mutate({ id: f.id, status: "done" })}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 me-1" />
                          {ar ? "تم" : "Done"}
                        </Button>
                      ) : (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700">
                          {ar ? "مكتمل" : "Done"}
                        </Badge>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4" />
                  {ar ? "التحقق اليومي" : "Daily verification"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {ar
                    ? `${dailySummary?.checkedCount ?? 0} من ${dailySummary?.requiredCount ?? 0} أجهزة تم فحصها اليوم`
                    : `${dailySummary?.checkedCount ?? 0} of ${dailySummary?.requiredCount ?? 0} devices checked today`}
                </p>
                {devices
                  .filter((d) => d.requiresDailyCheck)
                  .slice(0, 5)
                  .map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-mono">{d.deviceCode}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        onClick={() => recordDailyCheck.mutate({ deviceId: d.id })}
                      >
                        {ar ? "تسجيل" : "Check"}
                      </Button>
                    </div>
                  ))}
              </CardContent>
            </Card>

            {(stats?.expired ?? 0) > 0 && (
              <Card className="border-red-200 bg-red-50/30">
                <CardContent className="pt-4 flex gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="text-sm text-red-800">
                    {ar
                      ? `${stats?.expired} جهاز/أجهزة انتهت معايرتها — تم إرسال تنبيه لفريق الجودة`
                      : `${stats?.expired} device(s) have expired calibration — QC team has been notified`}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Add device dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{ar ? "إضافة جهاز" : "Add Device"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{ar ? "رمز الجهاز" : "Device code"}</Label>
                <Input value={form.deviceCode} onChange={(e) => setForm({ ...form, deviceCode: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{ar ? "الفئة" : "Category"}</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as DeviceCategory })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>{sampleTypeFilterLabel(c, lang)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{ar ? "الاسم (EN)" : "Name (EN)"}</Label>
              <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{ar ? "الاسم (AR)" : "Name (AR)"}</Label>
              <Input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{ar ? "القسم" : "Department"}</Label>
                <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{ar ? "الموقع" : "Location"}</Label>
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{ar ? "فترة المعايرة (يوم)" : "Calibration interval (days)"}</Label>
                <Input
                  type="number"
                  value={form.calibrationIntervalDays}
                  onChange={(e) => setForm({ ...form, calibrationIntervalDays: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{ar ? "آخر معايرة" : "Last calibrated"}</Label>
                <Input
                  type="date"
                  value={form.lastCalibratedAt}
                  onChange={(e) => setForm({ ...form, lastCalibratedAt: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{ar ? "ملاحظات" : "Notes"}</Label>
              <Textarea value={form.maintenanceNotes} onChange={(e) => setForm({ ...form, maintenanceNotes: e.target.value })} rows={2} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.requiresDailyCheck}
                onChange={(e) => setForm({ ...form, requiresDailyCheck: e.target.checked })}
              />
              {ar ? "يتطلب تحقق يومي" : "Requires daily check"}
            </label>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (!form.deviceCode.trim() || !form.nameEn.trim()) {
                  toast.error(ar ? "رمز الجهاز والاسم مطلوبان" : "Device code and name are required");
                  return;
                }
                createDevice.mutate({
                  deviceCode: form.deviceCode,
                  nameEn: form.nameEn,
                  nameAr: form.nameAr || undefined,
                  category: form.category,
                  department: form.department || undefined,
                  location: form.location || undefined,
                  calibrationIntervalDays: parseInt(form.calibrationIntervalDays, 10) || 365,
                  lastCalibratedAt: form.lastCalibratedAt || undefined,
                  maintenanceNotes: form.maintenanceNotes || undefined,
                  requiresDailyCheck: form.requiresDailyCheck,
                });
              }}
              disabled={createDevice.isPending}
            >
              {ar ? "حفظ" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record calibration dialog */}
      <Dialog open={showCalibrate != null} onOpenChange={(open) => !open && setShowCalibrate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ar ? "تسجيل معايرة" : "Record Calibration"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>{ar ? "تاريخ المعايرة" : "Calibration date"}</Label>
              <Input type="date" value={calForm.calibratedAt} onChange={(e) => setCalForm({ ...calForm, calibratedAt: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{ar ? "رقم الشهادة" : "Certificate ref."}</Label>
              <Input value={calForm.certificateRef} onChange={(e) => setCalForm({ ...calForm, certificateRef: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{ar ? "أُجريت بواسطة" : "Performed by"}</Label>
              <Input value={calForm.performedBy} onChange={(e) => setCalForm({ ...calForm, performedBy: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{ar ? "ملاحظات" : "Notes"}</Label>
              <Textarea value={calForm.notes} onChange={(e) => setCalForm({ ...calForm, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (!showCalibrate) return;
                recordCalibration.mutate({
                  deviceId: showCalibrate,
                  calibratedAt: calForm.calibratedAt,
                  certificateRef: calForm.certificateRef || undefined,
                  performedBy: calForm.performedBy || undefined,
                  notes: calForm.notes || undefined,
                });
              }}
              disabled={recordCalibration.isPending}
            >
              {ar ? "حفظ المعايرة" : "Save calibration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Device detail dialog */}
      <Dialog open={showDetail != null} onOpenChange={(open) => !open && setShowDetail(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{ar ? "تفاصيل الجهاز" : "Device Details"}</DialogTitle>
          </DialogHeader>
          {detailLoading || !detail ? (
            <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <div className="space-y-4 text-sm">
              <div>
                <div className="font-mono text-lg font-bold text-blue-700">{detail.device.deviceCode}</div>
                <div className="font-medium">{ar ? (detail.device.nameAr || detail.device.nameEn) : detail.device.nameEn}</div>
                <Badge variant="outline" className={`mt-2 ${statusBadgeClass(detail.device.effectiveStatus)}`}>
                  {statusLabel(detail.device.effectiveStatus, ar)}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                <div>{ar ? "الفئة:" : "Category:"} {sampleTypeFilterLabel(detail.device.category, lang)}</div>
                <div>{ar ? "القسم:" : "Dept:"} {detail.device.department ?? "—"}</div>
                <div>{ar ? "آخر معايرة:" : "Last cal.:"} {detail.device.lastCalibratedAt ? new Date(detail.device.lastCalibratedAt).toLocaleDateString(ar ? "ar-AE" : "en-GB") : "—"}</div>
                <div>{ar ? "القادمة:" : "Next due:"} {detail.device.nextCalibrationDueAt ? new Date(detail.device.nextCalibrationDueAt).toLocaleDateString(ar ? "ar-AE" : "en-GB") : "—"}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => updateDeviceStatus.mutate({ id: detail.device.id, status: "under_maintenance" })}>
                  {ar ? "تحت الصيانة" : "Under maintenance"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setShowCalibrate(detail.device.id); setShowDetail(null); }}>
                  {ar ? "تسجيل معايرة" : "Record calibration"}
                </Button>
              </div>
              {detail.calibrations.length > 0 && (
                <div>
                  <div className="font-semibold mb-2">{ar ? "سجل المعايرة" : "Calibration history"}</div>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {detail.calibrations.map((c) => (
                      <div key={c.id} className="rounded border p-2 text-xs">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(c.calibratedAt).toLocaleDateString(ar ? "ar-AE" : "en-GB")}
                          {" → "}
                          {new Date(c.dueAt).toLocaleDateString(ar ? "ar-AE" : "en-GB")}
                        </div>
                        {c.certificateRef && <div>{c.certificateRef}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Follow-up dialog */}
      <Dialog open={showFollowUp} onOpenChange={setShowFollowUp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ar ? "إضافة متابعة" : "Add Follow-up"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>{ar ? "الوصف" : "Description"}</Label>
              <Textarea value={followUpForm.title} onChange={(e) => setFollowUpForm({ ...followUpForm, title: e.target.value })} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>{ar ? "المسؤول" : "Assignee"}</Label>
              <Input value={followUpForm.assigneeName} onChange={(e) => setFollowUpForm({ ...followUpForm, assigneeName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{ar ? "تاريخ الاستحقاق" : "Due date"}</Label>
              <Input type="date" value={followUpForm.dueDate} onChange={(e) => setFollowUpForm({ ...followUpForm, dueDate: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (!followUpForm.title.trim()) {
                  toast.error(ar ? "الوصف مطلوب" : "Description is required");
                  return;
                }
                createFollowUp.mutate({
                  title: followUpForm.title,
                  assigneeName: followUpForm.assigneeName || undefined,
                  dueDate: followUpForm.dueDate || undefined,
                  deviceId: followUpForm.deviceId ? parseInt(followUpForm.deviceId, 10) : undefined,
                });
              }}
            >
              {ar ? "حفظ" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
