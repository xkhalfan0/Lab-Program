import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  FlaskConical,
  Building2,
  Phone,
  Mail,
  User,
  FileText,
  Download,
  Search,
  Users,
  MapPin,
  Settings,
  Database,
  Printer,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { TestCatalogView } from "@/components/TestCatalogView";
import { useMergedTestCatalog } from "@/hooks/useMergedTestCatalog";
import { openTestCatalogPrint } from "@/lib/testCatalogCategories";

// ─── Test Types (Configuration) ─────────────────────────────────────────────
function TestTypesTab() {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editingPrice, setEditingPrice] = useState<{ testId: number; value: string } | null>(null);

  const { tests: allTestTypes } = useMergedTestCatalog();

  const updatePriceMutation = trpc.testTypes.updatePrice.useMutation({
    onSuccess: () => {
      toast.success(lang === "ar" ? "تم تحديث السعر بنجاح" : "Price updated successfully");
      setEditingPrice(null);
      void utils.testTypes.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleExportCSV = () => {
    const csvData: string[][] = [
      ["#", "Test Name (EN)", "Test Name (AR)", "Code", "Price (AED)", "Unit", "Category", "Standard"],
      ...allTestTypes.map((test, idx) => {
        const price = Number(test.unitPrice ?? 0);
        return [
          (idx + 1).toString(),
          test.nameEn || "",
          test.nameAr || "",
          test.code || "",
          price.toFixed(2),
          test.unit || "",
          test.category || "",
          test.standardRef || "",
        ];
      }),
    ];

    const csvContent = csvData
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `test-types-${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(lang === "ar" ? "تم تصدير الملف بنجاح" : "CSV exported successfully");
  };

  const handleSavePrice = (testId: number, value: string) => {
    const newPrice = parseFloat(value);
    if (Number.isNaN(newPrice) || newPrice <= 0) {
      toast.error(lang === "ar" ? "السعر غير صالح" : "Invalid price");
      return;
    }
    updatePriceMutation.mutate({ testTypeId: testId, newPrice });
  };

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            {lang === "ar" ? "إدارة أنواع الاختبارات" : "Test Types Management"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {lang === "ar"
              ? "قائمة الاختبارات الرسمية مع الأسعار — يمكن طباعتها أو مشاركتها مع المقاولين"
              : "Official test catalog with AED prices — print or share with contractors"}
          </p>
          <div className="flex items-center gap-3 mt-3 text-sm">
            <span>
              <strong className="text-primary text-lg">{allTestTypes.length}</strong>{" "}
              <span className="text-muted-foreground">{lang === "ar" ? "اختبار" : "tests"}</span>
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">5 {lang === "ar" ? "فئات" : "categories"}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => openTestCatalogPrint(categoryFilter)}
          >
            <Printer className="h-3.5 w-3.5" />
            {lang === "ar" ? "طباعة القائمة" : "Print List"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleExportCSV} className="gap-2">
            <Download className="h-3.5 w-3.5" />
            {lang === "ar" ? "تصدير CSV" : "Export CSV"}
          </Button>
        </div>
      </div>

      <TestCatalogView
        tests={allTestTypes}
        lang={lang}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        isAdmin={isAdmin}
        editingPrice={editingPrice}
        onStartEditPrice={(test) =>
          setEditingPrice({ testId: test.id, value: String(test.unitPrice ?? "0") })
        }
        onCancelEditPrice={() => setEditingPrice(null)}
        onSavePrice={handleSavePrice}
        onPriceInputChange={(testId, value) => setEditingPrice({ testId, value })}
        isSavingPrice={updatePriceMutation.isPending}
      />
    </div>
  );
}

// ─── Contractors Tab ───────────────────────────────────────────────────────────
function ContractorsTab() {
  const { lang } = useLanguage();
  const [showDialog, setShowDialog] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ nameEn: "", nameAr: "", contactPerson: "", phone: "", email: "", address: "", contractorCode: "" });

  const { data: list = [], refetch } = trpc.contractors.list.useQuery();
  const createMut = trpc.contractors.create.useMutation({ onSuccess: () => { refetch(); setShowDialog(false); toast.success(lang === "ar" ? "تم إضافة المقاول" : "Contractor added"); } });
  const updateMut = trpc.contractors.update.useMutation({ onSuccess: () => { refetch(); setShowDialog(false); toast.success(lang === "ar" ? "تم تحديث المقاول" : "Contractor updated"); } });
  const deleteMut = trpc.contractors.delete.useMutation({ onSuccess: () => { refetch(); toast.success(lang === "ar" ? "تم حذف المقاول" : "Contractor removed"); } });

  const openCreate = () => {
    setEditItem(null);
    setForm({ nameEn: "", nameAr: "", contactPerson: "", phone: "", email: "", address: "", contractorCode: "" });
    setShowDialog(true);
  };

  const openEdit = (c: any) => {
    setEditItem(c);
    setForm({ nameEn: c.nameEn, nameAr: c.nameAr || "", contactPerson: c.contactPerson || "", phone: c.phone || "", email: c.email || "", address: c.address || "", contractorCode: c.contractorCode || "" });
    setShowDialog(true);
  };

  const handleSave = () => {
    if (!form.nameEn.trim()) { toast.error("Company name (English) is required"); return; }
    if (!form.nameAr.trim()) { toast.error("اسم الشركة بالعربي مطلوب"); return; }
    // Auto-generate contractorCode if empty
    const code = form.contractorCode.trim() || `CONT-${Date.now().toString().slice(-5)}`;
    const payload = { ...form, contractorCode: code };
    if (editItem) updateMut.mutate({ id: editItem.id, ...payload });
    else createMut.mutate(payload);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{list.length} {lang === "ar" ? "مقاول مسجل" : "contractors registered"}</p>
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 me-1" />{lang === "ar" ? "إضافة مقاول" : "Add Contractor"}</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map(c => (
          <Card key={c.id} className="hover:shadow-md transition-shadow">
            <CardContent className="pt-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-semibold">{c.nameEn}</p>
                  {c.nameAr && <p className="text-sm text-muted-foreground" dir="rtl">{c.nameAr}</p>}
                  {c.contractorCode && <Badge variant="outline" className="mt-1 font-mono text-xs">{c.contractorCode}</Badge>}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm(lang === "ar" ? "هل تريد حذف المقاول؟" : "Remove contractor?")) deleteMut.mutate({ id: c.id }); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                {c.contactPerson && <div className="flex items-center gap-2"><User className="w-3.5 h-3.5" />{c.contactPerson}</div>}
                {c.phone && <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" />{c.phone}</div>}
                {c.email && <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5" />{c.email}</div>}
                {c.address && <div className="flex items-center gap-2"><Building2 className="w-3.5 h-3.5" />{c.address}</div>}
              </div>
            </CardContent>
          </Card>
        ))}
        {list.length === 0 && (
          <div className="col-span-3 text-center py-12 text-muted-foreground">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{lang === "ar" ? "لا يوجد مقاولون مسجلون بعد" : "No contractors registered yet"}</p>
          </div>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editItem ? (lang === "ar" ? "تعديل مقاول" : "Edit Contractor") : (lang === "ar" ? "إضافة مقاول جديد" : "Add New Contractor")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{lang === "ar" ? "اسم الشركة (إنجليزي)" : "Company Name (English)"} <span className="text-red-500">*</span></Label>
              <Input value={form.nameEn} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))} placeholder="Al-Rajhi Construction Co." required />
            </div>
            <div>
              <Label>{lang === "ar" ? "اسم الشركة (عربي)" : "Company Name (Arabic)"} <span className="text-red-500">*</span></Label>
              <Input dir="rtl" value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} placeholder="شركة الراجحي للإنشاءات" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{lang === "ar" ? "كود المقاول" : "Contractor Code"} <span className="text-xs text-muted-foreground">{lang === "ar" ? "(تلقائي إذا فارغ)" : "(auto if empty)"}</span></Label>
                <Input value={form.contractorCode} onChange={e => setForm(f => ({ ...f, contractorCode: e.target.value }))} placeholder="CONT-001 (optional)" className="font-mono" />
              </div>
              <div>
                <Label>{lang === "ar" ? "شخص التواصل" : "Contact Person"}</Label>
                <Input value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{lang === "ar" ? "الهاتف" : "Phone"}</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+971 5x xxx xxxx" />
              </div>
              <div>
                <Label>{lang === "ar" ? "البريد الإلكتروني" : "Email"}</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>{lang === "ar" ? "العنوان" : "Address"}</Label>
              <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>{lang === "ar" ? "إلغاء" : "Cancel"}</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>
              {editItem ? (lang === "ar" ? "حفظ التغييرات" : "Save Changes") : (lang === "ar" ? "إضافة مقاول" : "Add Contractor")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Contracts Tab ─────────────────────────────────────────────────────────────
function ContractsTab() {
  const { lang } = useLanguage();
  const [showDialog, setShowDialog] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({
    contractNumber: "",
    contractName: "",
    contractorId: "",
    sectorKey: "",
    startDate: "",
    endDate: "",
    notes: "",
  });

  const { data: contracts = [], refetch } = trpc.contracts.list.useQuery();
  const { data: contractors = [] } = trpc.contractors.list.useQuery();
  const { data: sectors = [] } = trpc.sectors.list.useQuery();
  const createMut = trpc.contracts.create.useMutation({
    onSuccess: () => { refetch(); setShowDialog(false); toast.success(lang === "ar" ? "تم إضافة العقد بنجاح" : "Contract added successfully"); },
    onError: (err) => toast.error(err.message),
  });
  const updateMut = trpc.contracts.update.useMutation({
    onSuccess: () => { refetch(); setShowDialog(false); toast.success(lang === "ar" ? "تم تحديث العقد" : "Contract updated"); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMut = trpc.contracts.delete.useMutation({
    onSuccess: () => { refetch(); toast.success(lang === "ar" ? "تم حذف العقد" : "Contract removed"); },
  });

  const openCreate = () => {
    setEditItem(null);
    setForm({ contractNumber: "", contractName: "", contractorId: "", sectorKey: "", startDate: "", endDate: "", notes: "" });
    setShowDialog(true);
  };

  const openEdit = (c: any) => {
    setEditItem(c);
    setForm({
      contractNumber: c.contractNumber,
      contractName: c.contractName,
      contractorId: String(c.contractorId),
      sectorKey: c.sectorKey || "",
      startDate: c.startDate ? new Date(c.startDate).toISOString().split("T")[0] : "",
      endDate: c.endDate ? new Date(c.endDate).toISOString().split("T")[0] : "",
      notes: c.notes || "",
    });
    setShowDialog(true);
  };

  const handleSave = () => {
    if (!form.contractNumber.trim()) { toast.error(lang === "ar" ? "رقم العقد مطلوب" : "Contract number is required"); return; }
    if (!form.contractName.trim()) { toast.error(lang === "ar" ? "اسم العقد مطلوب" : "Contract name is required"); return; }
    if (!form.contractorId) { toast.error(lang === "ar" ? "يرجى اختيار مقاول" : "Please select a contractor"); return; }
    if (editItem) {
      updateMut.mutate({
        id: editItem.id,
        contractNumber: form.contractNumber,
        contractName: form.contractName,
        contractorId: Number(form.contractorId),
        sectorKey: form.sectorKey || undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        notes: form.notes || undefined,
      });
    } else {
      createMut.mutate({
        contractNumber: form.contractNumber,
        contractName: form.contractName,
        contractorId: Number(form.contractorId),
        sectorKey: form.sectorKey || undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        notes: form.notes || undefined,
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{contracts.length} {lang === "ar" ? "عقد مسجل" : "contracts registered"}</p>
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 me-1" />{lang === "ar" ? "إضافة عقد" : "Add Contract"}</Button>
      </div>

      {contractors.length === 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          {lang === "ar" ? "يجب إضافة مقاولين أولاً قبل إنشاء العقود." : "You need to add contractors first before creating contracts."}
        </div>
      )}

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-start p-3 font-medium">{lang === "ar" ? "رقم العقد" : "Contract No."}</th>
              <th className="text-start p-3 font-medium">{lang === "ar" ? "اسم العقد" : "Contract Name"}</th>
              <th className="text-start p-3 font-medium">{lang === "ar" ? "المقاول" : "Contractor"}</th>
              <th className="text-start p-3 font-medium">{lang === "ar" ? "تاريخ البدء" : "Start Date"}</th>
              <th className="text-start p-3 font-medium">{lang === "ar" ? "تاريخ الانتهاء" : "End Date"}</th>
              <th className="text-start p-3 font-medium">{lang === "ar" ? "ملاحظات" : "Notes"}</th>
              <th className="text-start p-3 font-medium">{lang === "ar" ? "إجراءات" : "Actions"}</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map(c => (
              <tr key={c.id} className="border-t hover:bg-muted/30">
                <td className="p-3">
                  <Badge variant="outline" className="font-mono text-xs">{c.contractNumber}</Badge>
                </td>
                <td className="p-3 font-medium max-w-[250px] truncate">{c.contractName}</td>
                <td className="p-3 text-muted-foreground">{c.contractorNameEn ?? "—"}</td>
                <td className="p-3 text-xs text-muted-foreground">
                  {c.startDate ? new Date(c.startDate).toLocaleDateString() : "—"}
                </td>
                <td className="p-3 text-xs text-muted-foreground">
                  {c.endDate ? new Date(c.endDate).toLocaleDateString() : "—"}
                </td>
                <td className="p-3 text-xs text-muted-foreground max-w-[150px] truncate">{c.notes || "—"}</td>
                <td className="p-3">
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="text-destructive"
                      onClick={() => { if (confirm(lang === "ar" ? "هل تريد حذف هذا العقد؟" : "Remove this contract?")) deleteMut.mutate({ id: c.id }); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {contracts.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>{lang === "ar" ? "لا توجد عقود مسجلة بعد" : "No contracts registered yet"}</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {editItem ? (lang === "ar" ? "تعديل عقد" : "Edit Contract") : (lang === "ar" ? "إضافة عقد جديد" : "Add New Contract")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{lang === "ar" ? "رقم العقد *" : "Contract Number *"}</Label>
                <Input
                  value={form.contractNumber}
                  onChange={e => setForm(f => ({ ...f, contractNumber: e.target.value }))}
                  placeholder="CON-2026-001"
                  className="font-mono"
                />
              </div>
              <div>
                <Label>{lang === "ar" ? "المقاول *" : "Contractor *"}</Label>
                <Select value={form.contractorId} onValueChange={v => setForm(f => ({ ...f, contractorId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder={lang === "ar" ? "اختر مقاولاً..." : "Select contractor..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {contractors.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {lang === "ar" ? (c.nameAr || c.nameEn) : c.nameEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>{lang === "ar" ? "القطاع" : "Sector"}</Label>
              <Select value={form.sectorKey} onValueChange={v => setForm(f => ({ ...f, sectorKey: v === "__none__" ? "" : v }))}>
                <SelectTrigger>
                  <SelectValue placeholder={lang === "ar" ? "اختر القطاع..." : "Select sector..."} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{lang === "ar" ? "— بدون قطاع —" : "— No sector —"}</SelectItem>
                  {sectors.map(s => (
                    <SelectItem key={s.sectorKey} value={s.sectorKey}>
                      {lang === "ar" ? s.nameAr : s.nameEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{lang === "ar" ? "اسم العقد *" : "Contract Name *"}</Label>
              <Input
                value={form.contractName}
                onChange={e => setForm(f => ({ ...f, contractName: e.target.value }))}
                placeholder="Construction of Road No. 5 — Phase 2"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{lang === "ar" ? "تاريخ البدء" : "Start Date"}</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div>
                <Label>{lang === "ar" ? "تاريخ الانتهاء" : "End Date"}</Label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>{lang === "ar" ? "ملاحظات" : "Notes"}</Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes about this contract..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>{lang === "ar" ? "إلغاء" : "Cancel"}</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>
              {editItem ? (lang === "ar" ? "حفظ التغييرات" : "Save Changes") : (lang === "ar" ? "إضافة عقد" : "Add Contract")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sectors Tab ──────────────────────────────────────────────────────────────
function SectorsTab() {
  const { lang } = useLanguage();
  const [showDialog, setShowDialog] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ sectorKey: "", nameAr: "", nameEn: "", description: "" });

  const { data: sectors = [], refetch } = trpc.sectors.list.useQuery();
  const createMut = trpc.sectors.create.useMutation({ onSuccess: () => { refetch(); setShowDialog(false); toast.success(lang === "ar" ? "تم إضافة القطاع" : "Sector added"); } });
  const updateMut = trpc.sectors.update.useMutation({ onSuccess: () => { refetch(); setShowDialog(false); toast.success(lang === "ar" ? "تم تحديث القطاع" : "Sector updated"); } });
  const deleteMut = trpc.sectors.delete.useMutation({ onSuccess: () => { refetch(); toast.success(lang === "ar" ? "تم حذف القطاع" : "Sector removed"); } });

  const openCreate = () => {
    setEditItem(null);
    setForm({ sectorKey: "", nameAr: "", nameEn: "", description: "" });
    setShowDialog(true);
  };

  const openEdit = (s: any) => {
    setEditItem(s);
    setForm({ sectorKey: s.sectorKey, nameAr: s.nameAr || "", nameEn: s.nameEn || "", description: s.description || "" });
    setShowDialog(true);
  };

  const handleSave = () => {
    if (!form.sectorKey.trim()) { toast.error(lang === "ar" ? "مفتاح القطاع مطلوب" : "Sector key is required"); return; }
    if (!form.nameAr.trim() && !form.nameEn.trim()) { toast.error(lang === "ar" ? "اسم القطاع مطلوب" : "Sector name is required"); return; }
    if (editItem) {
      updateMut.mutate({ id: editItem.id, nameAr: form.nameAr, nameEn: form.nameEn, description: form.description });
    } else {
      createMut.mutate({ sectorKey: form.sectorKey, nameAr: form.nameAr, nameEn: form.nameEn, description: form.description });
    }
  };

  const isBuiltIn = (key: string) => ["sector_1", "sector_2", "sector_3", "sector_4", "sector_5"].includes(key);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-muted-foreground">{sectors.length} {lang === "ar" ? "قطاع مسجل" : "registered sectors"}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{lang === "ar" ? "القطاعات الافتراضية لا يمكن حذفها، لكن يمكن تعديل أسمائها" : "Built-in sectors cannot be deleted, but names can be edited"}</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 me-1" />{lang === "ar" ? "إضافة قطاع" : "Add Sector"}</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sectors.map(s => (
          <Card key={s.id} className="border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="font-mono text-xs">{s.sectorKey}</Badge>
                    {isBuiltIn(s.sectorKey) && <Badge variant="secondary" className="text-xs">{lang === "ar" ? "افتراضي" : "Built-in"}</Badge>}
                  </div>
                  <p className="font-semibold text-sm" dir="rtl">{s.nameAr || "—"}</p>
                  <p className="text-xs text-muted-foreground">{s.nameEn || "—"}</p>
                  {s.description && <p className="text-xs text-muted-foreground mt-1 truncate">{s.description}</p>}
                </div>
                <div className="flex gap-1 ms-2">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(s)}><Pencil className="w-3.5 h-3.5" /></Button>
                  {!isBuiltIn(s.sectorKey) && (
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm(lang === "ar" ? "هل تريد حذف هذا القطاع؟" : "Delete this sector?")) deleteMut.mutate({ id: s.id }); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {sectors.length === 0 && (
          <div className="col-span-3 p-8 text-center text-muted-foreground">{lang === "ar" ? "لا توجد قطاعات مسجلة" : "No sectors registered"}</div>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editItem ? (lang === "ar" ? "تعديل القطاع" : "Edit Sector") : (lang === "ar" ? "إضافة قطاع جديد" : "Add New Sector")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editItem && (
              <div>
                <Label>{lang === "ar" ? "مفتاح القطاع (فريد) *" : "Sector Key (unique) *"}</Label>
                <Input value={form.sectorKey} onChange={e => setForm(f => ({ ...f, sectorKey: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }))} placeholder="external_1" className="font-mono" />
                <p className="text-xs text-muted-foreground mt-1">{lang === "ar" ? "أحرف صغيرة وأرقام وشرطة سفلية فقط" : "Lowercase letters, numbers and underscores only"}</p>
              </div>
            )}
            <div>
              <Label>{lang === "ar" ? "الاسم بالعربي *" : "Arabic Name *"}</Label>
              <Input dir="rtl" value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} placeholder="القطاع الأول" />
            </div>
            <div>
              <Label>{lang === "ar" ? "الاسم بالإنجليزي" : "English Name"}</Label>
              <Input value={form.nameEn} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))} placeholder="Sector 1" />
            </div>
            <div>
              <Label>{lang === "ar" ? "الوصف" : "Description"}</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={lang === "ar" ? "وصف اختياري..." : "Optional description..."} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>{lang === "ar" ? "إلغاء" : "Cancel"}</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>
              {editItem ? (lang === "ar" ? "حفظ التغييرات" : "Save Changes") : (lang === "ar" ? "إضافة قطاع" : "Add Sector")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function TestTypesManagement() {
  const { lang } = useLanguage();
  const [businessTab, setBusinessTab] = useState("contracts");

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2 flex-wrap">
            <FlaskConical className="w-5 h-5 text-primary shrink-0" />
            <span className="leading-tight">{lang === "ar" ? "إدارة الاختبارات والمقاولين والعقود" : "Tests, Contractors & Contracts"}</span>
          </h1>
          <p className="text-muted-foreground mt-1">{lang === "ar" ? "إدارة قائمة الاختبارات بأسعار AED والمقاولين المسجلين والعقود" : "Manage test types with AED prices, registered contractors, and contracts"}</p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {lang === "ar" ? "الإعدادات" : "Configuration"}
                </h3>
              </div>
            </CardHeader>
            <Tabs value="test-types" className="w-full">
              <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
                <TabsTrigger
                  value="test-types"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
                >
                  <FlaskConical className="h-4 w-4 me-2" />
                  {lang === "ar" ? "أنواع الاختبارات" : "Test Types"}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="test-types" className="mt-0 p-0">
                <TestTypesTab />
              </TabsContent>
            </Tabs>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {lang === "ar" ? "البيانات التشغيلية" : "Business Data"}
                </h3>
              </div>
            </CardHeader>
            <Tabs value={businessTab} onValueChange={setBusinessTab} className="w-full">
              <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
                <TabsTrigger
                  value="contracts"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
                >
                  <FileText className="h-4 w-4 me-2" />
                  {lang === "ar" ? "العقود" : "Contracts"}
                </TabsTrigger>
                <TabsTrigger
                  value="contractors"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
                >
                  <Users className="h-4 w-4 me-2" />
                  {lang === "ar" ? "المقاولون" : "Contractors"}
                </TabsTrigger>
                <TabsTrigger
                  value="sectors"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
                >
                  <MapPin className="h-4 w-4 me-2" />
                  {lang === "ar" ? "القطاعات" : "Sectors"}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="contracts" className="mt-4 px-6 pb-6">
                <ContractsTab />
              </TabsContent>
              <TabsContent value="contractors" className="mt-4 px-6 pb-6">
                <ContractorsTab />
              </TabsContent>
              <TabsContent value="sectors" className="mt-4 px-6 pb-6">
                <SectorsTab />
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
