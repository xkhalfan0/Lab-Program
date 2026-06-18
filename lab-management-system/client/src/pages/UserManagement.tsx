import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { ListFilterBar } from "@/components/ListFilterBar";
import { matchesListSearch, hasActiveListFilters } from "@/lib/listFilters";
import { effectiveUserRole } from "@/lib/labTypes";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  UserPlus, Pencil, Trash2, ShieldCheck, Eye, EyeOff,
  Users, Key, CheckCircle2, XCircle, AlertCircle,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";

// ─── Permission definitions ───────────────────────────────────────────────────
// Each permission supports: false (no access), "view" (read-only), "edit" (full access)
// viewOnly: true  → the page has no write actions, so "edit" level is not applicable
// viewOnly: false → the page has write actions (add/edit/delete), so both view & edit are meaningful
const PERMISSION_GROUPS_EN = [
  { group: "Overview", permissions: [
    { key: "admin_dashboard",      label: "Main Dashboard (KPIs & Charts)",   viewOnly: true  },
    { key: "supervisor_dashboard", label: "Supervisor View (Monitoring)",      viewOnly: true  },
    { key: "analytics",            label: "Analytics & Reports",               viewOnly: true  },
  ]},
  { group: "Samples", permissions: [
    { key: "samples",      label: "Sample Reception",     viewOnly: false },
  ]},
  { group: "Distribution", permissions: [
    { key: "distribution", label: "Distribution Orders",  viewOnly: false },
  ]},
  { group: "Test Results", permissions: [
    { key: "results",      label: "Test Results (My Assignments)", viewOnly: false },
  ]},
  { group: "Reviews", permissions: [
    { key: "supervisor",   label: "Supervisor Review",    viewOnly: false },
    { key: "qc",           label: "QC Review",            viewOnly: false },
  ]},
  { group: "Certificates", permissions: [
    { key: "certificates",  label: "Clearance Certificate",         viewOnly: false },
    { key: "cert_archive",  label: "Clearance Archive",             viewOnly: true  },
  ]},
  { group: "Administration", permissions: [
    { key: "users",    label: "User Management",   viewOnly: false },
    { key: "settings", label: "Tests & Contractors", viewOnly: false },
  ]},
];

const PERMISSION_GROUPS_AR = [
  { group: "نظرة عامة", permissions: [
    { key: "admin_dashboard",      label: "لوحة التحكم الرئيسية (KPIs والرسوم)", viewOnly: true  },
    { key: "supervisor_dashboard", label: "لوحة المتابعة (مبسطة)",               viewOnly: true  },
    { key: "analytics",            label: "التحليلات والتقارير",                  viewOnly: true  },
  ]},
  { group: "العينات", permissions: [
    { key: "samples",      label: "استلام العينات",           viewOnly: false },
  ]},
  { group: "التوزيع", permissions: [
    { key: "distribution", label: "توزيع العينات",            viewOnly: false },
  ]},
  { group: "نتائج الاختبارات", permissions: [
    { key: "results",      label: "نتائج الاختبارات (مهامي)", viewOnly: false },
  ]},
  { group: "المراجعات", permissions: [
    { key: "supervisor",   label: "مراجعة المشرف",           viewOnly: false },
    { key: "qc",           label: "ضبط الجودة",              viewOnly: false },
  ]},
  { group: "الشهادات", permissions: [
    { key: "certificates",  label: "براءة الذمة",            viewOnly: false },
    { key: "cert_archive",  label: "أرشيف براءة الذمة",      viewOnly: true  },
  ]},
  { group: "الإدارة", permissions: [
    { key: "users",    label: "إدارة المستخدمين",            viewOnly: false },
    { key: "settings", label: "الاختبارات والمقاولون",       viewOnly: false },
  ]},
];

type PermLevel = "view" | "edit" | false;
type PermMap = Record<string, PermLevel>;

const ROLE_DEFAULT_PERMISSIONS: Record<string, PermMap> = {
  admin: {
    admin_dashboard: "edit", supervisor_dashboard: "edit", analytics: "edit",
    samples: "edit", distribution: "edit", results: "edit",
    supervisor: "edit", qc: "edit", certificates: "edit", cert_archive: "view",
    users: "edit", settings: "edit",
  },
  reception: {
    admin_dashboard: false, supervisor_dashboard: false, analytics: false,
    samples: "edit", distribution: false, results: false,
    supervisor: false, qc: false, certificates: false, cert_archive: false,
    users: false, settings: false,
  },
  lab_manager: {
    admin_dashboard: false, supervisor_dashboard: false, analytics: "view",
    samples: false, distribution: "edit", results: false,
    supervisor: "edit", qc: false, certificates: false, cert_archive: false,
    users: false, settings: false,
  },
  technician: {
    admin_dashboard: false, supervisor_dashboard: false, analytics: false,
    samples: false, distribution: false, results: "edit",
    supervisor: false, qc: false, certificates: false, cert_archive: false,
    users: false, settings: false,
  },
  qc_inspector: {
    admin_dashboard: false, supervisor_dashboard: false, analytics: false,
    samples: false, distribution: false, results: false,
    supervisor: false, qc: "edit", certificates: false, cert_archive: false,
    users: false, settings: false,
  },
  accountant: {
    admin_dashboard: false, supervisor_dashboard: false, analytics: false,
    samples: false, distribution: false, results: false,
    supervisor: false, qc: false, certificates: "edit", cert_archive: "view",
    users: false, settings: false,
  },
  user: {
    admin_dashboard: false, supervisor_dashboard: false, analytics: false,
    samples: false, distribution: false, results: false,
    supervisor: false, qc: false, certificates: false, cert_archive: false,
    users: false, settings: false,
  },
};

const ROLE_LABELS_EN: Record<string, string> = {
  admin: "Admin", reception: "Reception", lab_manager: "Supervisor",
  technician: "Technician",
  qc_inspector: "QC Inspector", accountant: "Accountant", user: "User",
};

const ROLE_LABELS_AR: Record<string, string> = {
  admin: "مدير النظام", reception: "استقبال", lab_manager: "مشرف",
  technician: "فني",
  qc_inspector: "مفتش جودة", accountant: "محاسب", user: "مستخدم",
};

const ASSIGNABLE_ROLES = [
  "admin", "reception", "lab_manager", "technician", "qc_inspector", "accountant", "user",
] as const;

function roleDisplayLabel(role: string, labels: Record<string, string>): string {
  return labels[effectiveUserRole(role)] ?? role;
}

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-700", reception: "bg-blue-100 text-blue-700",
  lab_manager: "bg-purple-100 text-purple-700", technician: "bg-green-100 text-green-700",
  qc_inspector: "bg-teal-100 text-teal-700",
  accountant: "bg-cyan-100 text-cyan-700", user: "bg-slate-100 text-slate-700",
};

type UserFormData = {
  name: string; username: string; password: string; confirmPassword: string;
  role: string; specialty: string; permissions: PermMap; isActive: boolean;
};

const EMPTY_FORM: UserFormData = {
  name: "", username: "", password: "", confirmPassword: "",
  role: "user", specialty: "", permissions: { ...ROLE_DEFAULT_PERMISSIONS["user"] }, isActive: true,
};

/** Normalize permission values before API calls (handles stray string booleans from controls or JSON). */
function sanitizePermissions(perms: PermMap): PermMap {
  const out: PermMap = {};
  for (const [key, v] of Object.entries(perms)) {
    const raw = v as unknown;
    if (raw === true || raw === "true") out[key] = "edit";
    else if (raw === false || raw === "false") out[key] = false;
    else if (raw === "view" || raw === "edit") out[key] = raw;
    else out[key] = false;
  }
  return out;
}

// Cycle through: false → "view" → "edit" → false
// For viewOnly pages: false → "view" → false (skip "edit")
function cyclePermission(current: PermLevel, viewOnly = false): PermLevel {
  if (current === false) return "view";
  if (current === "view") return viewOnly ? false : "edit";
  return false;
}

function PermissionToggle({
  value, onChange, disabled, viewOnly = false,
}: {
  value: PermLevel; onChange: (v: PermLevel) => void; disabled?: boolean; viewOnly?: boolean;
}) {
  const colors = {
    false: "bg-slate-100 text-slate-400 border-slate-200",
    view:  "bg-blue-50 text-blue-700 border-blue-200",
    edit:  "bg-green-50 text-green-700 border-green-200",
  };
  const labels = {
    false: "—",
    view:  "عرض",
    edit:  "تعديل",
  };
  const key = value === false ? "false" : value;
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(cyclePermission(value, viewOnly))}
        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all select-none ${colors[key]} ${
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:opacity-80"
        }`}
      >
        {labels[key]}
      </button>
      {viewOnly && (
        <span className="text-[10px] text-slate-400 italic">{"(عرض فقط)"}</span>
      )}
    </div>
  );
}

export default function UserManagement() {
  const { lang } = useLanguage();
  const ROLE_LABELS = lang === "ar" ? ROLE_LABELS_AR : ROLE_LABELS_EN;
  const PERMISSION_GROUPS = lang === "ar" ? PERMISSION_GROUPS_AR : PERMISSION_GROUPS_EN;
  const { user: currentUser } = useAuth();
  const utils = trpc.useUtils();

  const { data: users = [], isLoading } = trpc.users.list.useQuery();

  const createUser = trpc.users.create.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      toast.success(lang === "ar" ? "تم إنشاء المستخدم بنجاح" : "User created successfully");
      setDialogOpen(false); setForm(EMPTY_FORM);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateUser = trpc.users.update.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      toast.success(lang === "ar" ? "تم تحديث المستخدم بنجاح" : "User updated successfully");
      setDialogOpen(false); setEditingUser(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateRole = trpc.users.updateRole.useMutation({
    onSuccess: () => utils.users.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const updatePermissions = trpc.users.updatePermissions.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      toast.success(lang === "ar" ? "تم تحديث المستخدم بنجاح" : "User updated successfully");
      setDialogOpen(false); setEditingUser(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteUserMutation = trpc.users.delete.useMutation({
    onSuccess: () => { utils.users.list.invalidate(); toast.success(lang === "ar" ? "تم حذف المستخدم" : "User deleted"); },
    onError: (err) => toast.error(err.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<(typeof users)[0] | null>(null);
  const [form, setForm] = useState<UserFormData>(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState("info");
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [listSearch, setListSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== "all" && effectiveUserRole(u.role) !== roleFilter) return false;
      if (statusFilter === "active" && !u.isActive) return false;
      if (statusFilter === "inactive" && u.isActive) return false;
      return matchesListSearch(listSearch, [u.name, (u as { username?: string }).username, u.role]);
    });
  }, [users, listSearch, roleFilter, statusFilter]);

  const openCreate = () => {
    setEditingUser(null);
    setForm({ ...EMPTY_FORM, permissions: { ...ROLE_DEFAULT_PERMISSIONS["user"] } });
    setActiveTab("info"); setDialogOpen(true);
  };

  const openEdit = (u: (typeof users)[0]) => {
    setEditingUser(u);
    const rawPerms = (u as any).permissions as PermMap | null;
    setForm({
      name: u.name ?? "", username: (u as any).username ?? "",
      password: "", confirmPassword: "",
      role: effectiveUserRole(u.role),
      specialty: (u as any).specialty ?? "",
      permissions: rawPerms ?? { ...ROLE_DEFAULT_PERMISSIONS[effectiveUserRole(u.role)] },
      isActive: u.isActive,
    });
    setActiveTab("info"); setDialogOpen(true);
  };

  const handleRoleChange = (role: string) => {
    setForm(f => ({ ...f, role, permissions: { ...ROLE_DEFAULT_PERMISSIONS[role] } }));
  };

  const handlePermChange = (key: string, val: PermLevel) => {
    setForm(f => ({ ...f, permissions: { ...f.permissions, [key]: val } }));
  };

  const isBusy = createUser.isPending || updateUser.isPending || updateRole.isPending || updatePermissions.isPending;

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error(lang === "ar" ? "الاسم مطلوب" : "Name is required"); return; }
    if (!form.username.trim()) { toast.error(lang === "ar" ? "اسم المستخدم مطلوب" : "Username is required"); return; }
    if (!editingUser && !form.password) { toast.error(lang === "ar" ? "كلمة المرور مطلوبة" : "Password is required"); return; }
    if (form.password && form.password !== form.confirmPassword) { toast.error(lang === "ar" ? "كلمتا المرور غير متطابقتين" : "Passwords do not match"); return; }
    if (form.password && form.password.length < 6) { toast.error(lang === "ar" ? "كلمة المرور يجب أن تكون 6 أحرف على الأقل" : "Password must be at least 6 characters"); return; }

    if (editingUser) {
      // Update basic info — only send username if it changed
      const usernameChanged = form.username !== editingUser.username;
      if (usernameChanged && form.username.length < 3) {
        toast.error(lang === "ar" ? "اسم المستخدم يجب أن يكون 3 أحرف على الأقل" : "Username must be at least 3 characters");
        return;
      }
      await updateUser.mutateAsync({
        userId: editingUser.id,
        name: form.name,
        ...(usernameChanged ? { username: form.username } : {}),
        ...(form.password ? { password: form.password } : {}),
        isActive: form.isActive,
      });
      // Update role if changed
      if (form.role !== editingUser.role || form.specialty !== ((editingUser as any).specialty ?? "")) {
        await updateRole.mutateAsync({
          userId: editingUser.id,
          role: form.role as any,
          specialty: form.specialty || undefined,
        });
      }
      // Update permissions
      await updatePermissions.mutateAsync({
        userId: editingUser.id,
        permissions: sanitizePermissions(form.permissions),
      });
    } else {
      createUser.mutate({
        name: form.name, username: form.username, password: form.password,
        role: form.role as any, specialty: form.specialty || undefined,
        permissions: sanitizePermissions(form.permissions),
      });
    }
  };

  const permCount = (u: (typeof users)[0]) => {
    const perms = ((u as any).permissions as PermMap) ?? ROLE_DEFAULT_PERMISSIONS[u.role] ?? {};
    return Object.values(perms).filter(v => v !== false).length;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{lang === "ar" ? "إدارة المستخدمين" : "User Management"}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{lang === "ar" ? "إدارة مستخدمي النظام والأدوار والصلاحيات" : "Manage system users, roles, and permissions"}</p>
          </div>
          <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700">
            <UserPlus className="w-4 h-4 me-2" /> {lang === "ar" ? "إضافة مستخدم" : "Add User"}
          </Button>
        </div>

        {/* Stats — dynamic: one card per role that has at least one user */}
        {(() => {
          const ROLE_ORDER = ["admin", "lab_manager", "qc_inspector", "technician", "reception", "accountant", "user"];
          const roleCounts = users.reduce((acc, u) => {
            const role = effectiveUserRole(u.role);
            acc[role] = (acc[role] ?? 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          const roleEntries = Object.entries(roleCounts).sort(
            (a, b) => (ROLE_ORDER.indexOf(a[0]) === -1 ? 99 : ROLE_ORDER.indexOf(a[0])) -
                      (ROLE_ORDER.indexOf(b[0]) === -1 ? 99 : ROLE_ORDER.indexOf(b[0]))
          );
          const colClass = roleEntries.length <= 4
            ? `grid grid-cols-2 md:grid-cols-${roleEntries.length} gap-3`
            : "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3";
          return (
            <div className={colClass}>
              {roleEntries.map(([role, count]) => (
                <Card key={role} className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500 truncate">{roleDisplayLabel(role, ROLE_LABELS)}</p>
                        <p className="text-2xl font-bold text-slate-900">{count}</p>
                      </div>
                      <Users className="w-8 h-8 text-slate-200 shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          );
        })()}

        {/* Users Table */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{lang === "ar" ? `جميع المستخدمين (${filteredUsers.length})` : `All Users (${filteredUsers.length})`}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-6 pb-4">
              <ListFilterBar
                lang={lang}
                search={listSearch}
                onSearchChange={setListSearch}
                searchPlaceholder={
                  lang === "ar" ? "بحث بالاسم أو اسم المستخدم..." : "Search by name or username..."
                }
                selectFilters={[
                  {
                    id: "role",
                    value: roleFilter,
                    onChange: setRoleFilter,
                    placeholder: lang === "ar" ? "الدور" : "Role",
                    options: [
                      { value: "all", label: lang === "ar" ? "جميع الأدوار" : "All roles" },
                      ...Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label })),
                    ],
                  },
                  {
                    id: "status",
                    value: statusFilter,
                    onChange: setStatusFilter,
                    placeholder: lang === "ar" ? "الحالة" : "Status",
                    options: [
                      { value: "all", label: lang === "ar" ? "الكل" : "All" },
                      { value: "active", label: lang === "ar" ? "نشط" : "Active" },
                      { value: "inactive", label: lang === "ar" ? "معطل" : "Disabled" },
                    ],
                  },
                ]}
                showClear={
                  Boolean(listSearch.trim()) || roleFilter !== "all" || statusFilter !== "all"
                }
                onClear={() => {
                  setListSearch("");
                  setRoleFilter("all");
                  setStatusFilter("all");
                }}
                resultCount={filteredUsers.length}
              />
            </div>
            {isLoading ? (
              <div className="p-8 text-center text-slate-400">{lang === "ar" ? "جاري التحميل..." : "Loading..."}</div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">{lang === "ar" ? "لا توجد نتائج" : "No users match your filters"}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b">
                      <th className="text-start px-6 py-3 text-xs font-medium text-slate-500">{lang === "ar" ? "الاسم" : "Name"}</th>
                      <th className="text-start px-4 py-3 text-xs font-medium text-slate-500">{lang === "ar" ? "اسم المستخدم" : "Username"}</th>
                      <th className="text-start px-4 py-3 text-xs font-medium text-slate-500">{lang === "ar" ? "الدور" : "Role"}</th>
                      <th className="text-start px-4 py-3 text-xs font-medium text-slate-500">{lang === "ar" ? "الصلاحيات" : "Permissions"}</th>
                      <th className="text-start px-4 py-3 text-xs font-medium text-slate-500">{lang === "ar" ? "الحالة" : "Status"}</th>
                      <th className="text-start px-4 py-3 text-xs font-medium text-slate-500">{lang === "ar" ? "آخر دخول" : "Last Sign In"}</th>
                      <th className="text-end px-6 py-3 text-xs font-medium text-slate-500">{lang === "ar" ? "إجراءات" : "Actions"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(u => (
                      <tr key={u.id} className="border-b last:border-0 hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-3 font-medium text-slate-900">{u.name ?? "—"}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{(u as any).username ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[effectiveUserRole(u.role)] ?? ROLE_COLORS.user}`}>
                            {roleDisplayLabel(u.role, ROLE_LABELS)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-xs text-slate-600">{permCount(u)} {lang === "ar" ? "صلاحية" : "active"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {u.isActive ? (
                            <span className="flex items-center gap-1 text-xs text-green-700">
                              <CheckCircle2 className="w-3.5 h-3.5" /> {lang === "ar" ? "نشط" : "Active"}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-red-600">
                              <XCircle className="w-3.5 h-3.5" /> {lang === "ar" ? "معطل" : "Disabled"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">
                          {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleDateString() : (lang === "ar" ? "لم يدخل" : "Never")}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(u)} className="h-7 w-7 p-0">
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            {u.id !== currentUser?.id && (
                              <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(u.id)}
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) setEditingUser(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingUser ? <Pencil className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              {editingUser
                ? (lang === "ar" ? `تعديل مستخدم: ${editingUser.name}` : `Edit User: ${editingUser.name}`)
                : (lang === "ar" ? "إنشاء مستخدم جديد" : "Create New User")}
            </DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-3 w-full h-auto">
              <TabsTrigger value="info" className="text-xs sm:text-sm py-2">{lang === "ar" ? "بيانات الحساب" : "Account Info"}</TabsTrigger>
              <TabsTrigger value="password" className="flex items-center justify-center gap-1 text-xs sm:text-sm py-2">
                <Key className="w-3 h-3 shrink-0" />
                <span>{lang === "ar" ? "كلمة المرور" : "Password"}</span>
              </TabsTrigger>
              <TabsTrigger value="permissions" className="flex items-center justify-center gap-1 text-xs sm:text-sm py-2">
                <ShieldCheck className="w-3 h-3 shrink-0" />
                <span>{lang === "ar" ? "الصلاحيات" : "Permissions"}</span>
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Account Info */}
            <TabsContent value="info" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{lang === "ar" ? "الاسم الكامل *" : "Full Name *"}</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder={lang === "ar" ? "مثال: أحمد الرشيدي" : "e.g. Ahmed Al-Rashidi"} />
                </div>
                <div className="space-y-1.5">
                  <Label>{lang === "ar" ? "اسم المستخدم *" : "Username *"}</Label>
                  <Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase() }))}
                    placeholder={lang === "ar" ? "مثال: ahmed.rashidi" : "e.g. ahmed.rashidi"} className="font-mono" />
                  <p className="text-xs text-slate-400">{lang === "ar" ? "حروف وأرقام ونقاط فقط" : "Letters, numbers, dots, underscores only"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{lang === "ar" ? "الدور *" : "Role *"}</Label>
                  <Select value={form.role} onValueChange={handleRoleChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ASSIGNABLE_ROLES.map((value) => (
                        <SelectItem key={value} value={value}>{ROLE_LABELS[value]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{lang === "ar" ? "التخصص" : "Specialty"}</Label>
                  <Input value={form.specialty} onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))}
                    placeholder={lang === "ar" ? "مثال: اختبار الخرسانة" : "e.g. Concrete Testing"} />
                  <p className="text-xs text-slate-400">{lang === "ar" ? "مطلوب للفنيين" : "Required for technicians"}</p>
                </div>
              </div>
              {editingUser && (
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">{lang === "ar" ? "حالة الحساب" : "Account Status"}</p>
                    <p className="text-xs text-slate-500">{lang === "ar" ? "تعطيل الحساب دون حذفه" : "Disable to prevent login without deleting"}</p>
                  </div>
                  <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
                </div>
              )}
              <div className="p-3 bg-blue-50 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-700">
                  {lang === "ar"
                    ? "اختيار الدور يملأ الصلاحيات تلقائياً. يمكن تخصيصها من تبويب الصلاحيات."
                    : "Selecting a role will auto-fill default permissions. Customize them in the Permissions tab."}
                </p>
              </div>
            </TabsContent>

            {/* Tab 2: Password */}
            <TabsContent value="password" className="space-y-4 mt-4">
              {editingUser && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700">
                    {lang === "ar" ? "اترك حقلي كلمة المرور فارغين للإبقاء على كلمة المرور الحالية." : "Leave password fields empty to keep the current password unchanged."}
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{editingUser ? (lang === "ar" ? "كلمة المرور الجديدة" : "New Password") : (lang === "ar" ? "كلمة المرور *" : "Password *")}</Label>
                <div className="relative">
                  <Input type={showPassword ? "text" : "password"} value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Minimum 6 characters" />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{editingUser ? (lang === "ar" ? "تأكيد كلمة المرور الجديدة" : "Confirm New Password") : (lang === "ar" ? "تأكيد كلمة المرور *" : "Confirm Password *")}</Label>
                <Input type={showPassword ? "text" : "password"} value={form.confirmPassword}
                  onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))} placeholder="Re-enter password" />
              </div>
              {form.password && form.confirmPassword && form.password !== form.confirmPassword && (
                <p className="text-xs text-red-600 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> {lang === "ar" ? "كلمتا المرور غير متطابقتين" : "Passwords do not match"}</p>
              )}
              {form.password && form.confirmPassword && form.password === form.confirmPassword && (
                <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {lang === "ar" ? "كلمتا المرور متطابقتان" : "Passwords match"}</p>
              )}
            </TabsContent>

            {/* Tab 3: Permissions — view/edit levels */}
            <TabsContent value="permissions" className="mt-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-medium">{lang === "ar" ? "مستوى الصلاحيات" : "Permission Levels"}</p>
                  <p className="text-xs text-slate-500">
                    {lang === "ar"
                      ? "اضغط على الزر لتغيير المستوى: — (لا وصول) ← عرض ← تعديل"
                      : "Click to cycle: — (no access) → View → Edit"}
                  </p>
                </div>
                <Button variant="outline" size="sm"
                  onClick={() => setForm(f => ({ ...f, permissions: { ...ROLE_DEFAULT_PERMISSIONS[f.role] } }))}
                  className="text-xs">
                  {lang === "ar" ? "إعادة للافتراضيات" : "Reset to Defaults"}
                </Button>
              </div>
              <div className="space-y-2">
                {PERMISSION_GROUPS.map(group => (
                  <div key={group.group} className="border rounded-lg overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2 border-b">
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{group.group}</p>
                    </div>
                    <div className="divide-y">
                      {group.permissions.map(perm => (
                        <div key={perm.key} className="flex items-center justify-between px-4 py-2.5">
                          <p className="text-sm text-slate-700">{perm.label}</p>
                          <PermissionToggle
                            value={form.permissions[perm.key] ?? false}
                            onChange={(v) => handlePermChange(perm.key, v)}
                            viewOnly={(perm as any).viewOnly === true}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700">
                  {lang === "ar"
                    ? "تغيير الصلاحيات يسري فوراً عند الحفظ. المستخدم لن يحتاج لإعادة تسجيل الدخول."
                    : "Permission changes take effect immediately upon saving. The user does not need to log out."}
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{lang === "ar" ? "إلغاء" : "Cancel"}</Button>
            <Button onClick={handleSubmit} disabled={isBusy} className="bg-blue-600 hover:bg-blue-700">
              {isBusy
                ? (lang === "ar" ? "جاري الحفظ..." : "Saving...")
                : editingUser
                  ? (lang === "ar" ? "حفظ التغييرات" : "Save Changes")
                  : (lang === "ar" ? "إنشاء مستخدم" : "Create User")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Trash2 className="w-4 h-4" /> {lang === "ar" ? "حذف مستخدم" : "Delete User"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            {lang === "ar" ? "هل أنت متأكد من حذف هذا المستخدم؟ لا يمكن التراجع عن هذا الإجراء." : "Are you sure you want to delete this user? This action cannot be undone."}
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>{lang === "ar" ? "إلغاء" : "Cancel"}</Button>
            <Button variant="destructive" onClick={() => {
              if (deleteConfirm) { deleteUserMutation.mutate({ userId: deleteConfirm }); setDeleteConfirm(null); }
            }}>
              {lang === "ar" ? "حذف" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
