import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { getOfficialTestCatalog } from "@/lib/officialTestCatalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Users,
  MapPin,
  Wrench,
  Mountain,
  Truck,
  Box,
  Settings,
  Database,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/_core/hooks/useAuth";
import type { LucideIcon } from "lucide-react";

function dbCategoryFromConfigKey(key: string): string {
  return key === "aggregate" ? "aggregates" : key;
}

const categoryConfig: Array<{
  key: string;
  icon: LucideIcon;
  nameEn: string;
  nameAr: string;
  bgColor: string;
  textColor: string;
}> = [
  {
    key: "concrete",
    icon: Building2,
    nameEn: "Concrete Tests",
    nameAr: "اختبارات الخرسانة",
    bgColor: "bg-blue-100",
    textColor: "text-blue-600",
  },
  {
    key: "steel",
    icon: Wrench,
    nameEn: "Steel Tests",
    nameAr: "اختبارات الحديد",
    bgColor: "bg-gray-100",
    textColor: "text-gray-600",
  },
  {
    key: "soil",
    icon: Mountain,
    nameEn: "Soil Tests",
    nameAr: "اختبارات التربة",
    bgColor: "bg-amber-100",
    textColor: "text-amber-600",
  },
  {
    key: "asphalt",
    icon: Truck,
    nameEn: "Asphalt Tests",
    nameAr: "اختبارات الإسفلت",
    bgColor: "bg-slate-100",
    textColor: "text-slate-600",
  },
  {
    key: "aggregate",
    icon: Box,
    nameEn: "Aggregate Tests",
    nameAr: "اختبارات الركام",
    bgColor: "bg-stone-100",
    textColor: "text-stone-600",
  },
];

// ─── Test Types (Configuration) ─────────────────────────────────────────────
function TestTypesTab() {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();

  const [expandedCategories, setExpandedCategories] = useState<string[]>(["concrete"]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editingPrice, setEditingPrice] = useState<{ testId: number; value: string } | null>(null);

  // DB rows used only for numeric ids and stored prices; catalog is the test list source of truth.
  const { data: dbTestTypes = [] } = trpc.testTypes.list.useQuery();

  const allTestTypes = useMemo(() => {
    const dbByCode = new Map(dbTestTypes.map((t) => [t.code ?? "", t]));
    return getOfficialTestCatalog().map((test) => {
      const db = dbByCode.get(test.code);
      return {
        id: db?.id ?? 0,
        code: test.code,
        nameEn: test.nameEn,
        nameAr: test.nameAr,
        category: test.category,
        unitPrice: db?.unitPrice ?? test.unitPrice,
        unit: test.unit,
        standardRef: test.standardRef ?? "",
      };
    });
  }, [dbTestTypes]);

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

  const filteredTests = useMemo(() => {
    return allTestTypes.filter((test) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        searchQuery === "" ||
        (test.nameEn?.toLowerCase().includes(q) ?? false) ||
        (test.nameAr?.includes(searchQuery) ?? false) ||
        (test.code?.toLowerCase().includes(q) ?? false);

      const cat = test.category?.toLowerCase() ?? "";
      const matchesCategory =
        categoryFilter === "all" ||
        (categoryFilter === "aggregate" ? cat === "aggregates" : cat === categoryFilter.toLowerCase());

      return matchesSearch && matchesCategory;
    });
  }, [allTestTypes, searchQuery, categoryFilter]);

  const groupedTests = useMemo(() => {
    return categoryConfig
      .map((cat) => ({
        ...cat,
        tests: filteredTests.filter(
          (t) => (t.category?.toLowerCase() ?? "") === dbCategoryFromConfigKey(cat.key).toLowerCase()
        ),
      }))
      .filter((cat) => cat.tests.length > 0);
  }, [filteredTests]);

  const toggleCategory = (key: string) => {
    setExpandedCategories((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

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

  const renderPriceCell = (test: (typeof allTestTypes)[number]) => {
    const priceNum = Number(test.unitPrice ?? 0);
    const isEditing = editingPrice?.testId === test.id;

    if (!isAdmin) {
      return (
        <span className="font-mono font-semibold">
          {priceNum.toFixed(2)} AED
        </span>
      );
    }

    if (isEditing && editingPrice) {
      return (
        <div className="flex items-center justify-end gap-2">
          <Input
            type="number"
            step="0.01"
            min="0"
            value={editingPrice.value}
            onChange={(e) => setEditingPrice({ testId: test.id, value: e.target.value })}
            className="w-28 h-8 text-right font-mono"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const newPrice = parseFloat(editingPrice.value);
                if (!Number.isNaN(newPrice) && newPrice > 0) {
                  updatePriceMutation.mutate({ testTypeId: test.id, newPrice });
                }
              }
              if (e.key === "Escape") {
                setEditingPrice(null);
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="default"
            className="h-8 w-8 p-0"
            onClick={() => {
              const newPrice = parseFloat(editingPrice.value);
              if (!Number.isNaN(newPrice) && newPrice > 0) {
                updatePriceMutation.mutate({ testTypeId: test.id, newPrice });
              } else {
                toast.error(lang === "ar" ? "السعر غير صالح" : "Invalid price");
              }
            }}
            disabled={updatePriceMutation.isPending}
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditingPrice(null)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 justify-end">
        <span className="font-mono font-semibold">
          {priceNum.toFixed(2)} AED
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            setEditingPrice({ testId: test.id, value: String(test.unitPrice ?? "0") });
          }}
        >
          <Pencil className="h-3 w-3" />
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <FlaskConical className="h-5 w-5" />
            {lang === "ar" ? "إدارة أنواع الاختبارات" : "Test Types Management"}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {lang === "ar"
              ? "إدارة أنواع الاختبارات والأسعار (المسؤول فقط)"
              : "Manage test types and pricing (Admin only)"}
          </p>
        </div>

        <Button type="button" variant="outline" size="sm" onClick={handleExportCSV} className="gap-2 shrink-0">
          <Download className="h-3.5 w-3.5" />
          {lang === "ar" ? "تصدير CSV" : "Export CSV"}
        </Button>
      </div>

      <div className="flex items-center gap-6 text-sm mb-4">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-primary">{filteredTests.length}</span>
          <span className="text-muted-foreground">{lang === "ar" ? "اختبار" : "tests"}</span>
        </div>
        <div className="text-muted-foreground">•</div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-primary">5</span>
          <span className="text-muted-foreground">{lang === "ar" ? "فئات" : "categories"}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3 mb-4 sm:flex-row">
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={lang === "ar" ? "البحث عن الاختبارات..." : "Search tests..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ps-8 h-9"
            />
          </div>
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full h-9 sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === "ar" ? "جميع الفئات" : "All Categories"}</SelectItem>
            <SelectItem value="concrete">{lang === "ar" ? "الخرسانة" : "Concrete"}</SelectItem>
            <SelectItem value="steel">{lang === "ar" ? "الحديد" : "Steel"}</SelectItem>
            <SelectItem value="soil">{lang === "ar" ? "التربة" : "Soil"}</SelectItem>
            <SelectItem value="asphalt">{lang === "ar" ? "الإسفلت" : "Asphalt"}</SelectItem>
            <SelectItem value="aggregate">{lang === "ar" ? "الركام" : "Aggregate"}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {groupedTests.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            {lang === "ar" ? "لا توجد اختبارات تطابق البحث أو الفلتر" : "No tests match your search or filter"}
          </p>
        ) : (
          groupedTests.map((category) => {
            const isExpanded = expandedCategories.includes(category.key);
            const Icon = category.icon;

            return (
              <Card key={category.key} className="overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors border-b text-start"
                  onClick={() => toggleCategory(category.key)}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`p-1.5 rounded-lg shrink-0 ${category.bgColor}`}>
                      <Icon className={`h-4 w-4 ${category.textColor}`} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-base truncate">
                        {lang === "ar" ? category.nameAr : category.nameEn}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {category.tests.length} {lang === "ar" ? "اختبار" : "tests"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ms-2">
                    <Badge variant="secondary" className="font-mono text-xs">
                      {category.tests.length}
                    </Badge>
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="h-10">
                          <TableHead className="w-10">#</TableHead>
                          <TableHead>{lang === "ar" ? "اسم الاختبار" : "Test Name"}</TableHead>
                          <TableHead>{lang === "ar" ? "الرمز" : "Code"}</TableHead>
                          <TableHead className="text-right">{lang === "ar" ? "السعر" : "Price"}</TableHead>
                          <TableHead>{lang === "ar" ? "الوحدة" : "Unit"}</TableHead>
                          <TableHead>{lang === "ar" ? "المعيار" : "Standard"}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {category.tests.map((test, idx) => (
                          <TableRow key={test.id} className="group h-12">
                            <TableCell className="font-medium text-muted-foreground py-2">{idx + 1}</TableCell>
                            <TableCell className="py-2">
                              <div className="space-y-0.5">
                                <div className="font-medium text-sm">{test.nameEn}</div>
                                <div className="text-xs text-muted-foreground" dir="rtl">
                                  {test.nameAr || "—"}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="py-2">
                              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                                {test.code || "—"}
                              </code>
                            </TableCell>
                            <TableCell className="text-right py-2">{renderPriceCell(test)}</TableCell>
                            <TableCell className="text-xs py-2">{test.unit || "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground py-2">
                              {test.standardRef || "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
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
