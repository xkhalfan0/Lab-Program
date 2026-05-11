import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { Loader2, ScrollText } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export default function DeletionLog() {
  const { lang } = useLanguage();
  const [, setLocation] = useLocation();
  const { data: rows, isLoading, error } = trpc.samples.deletionAuditLog.useQuery();

  const formatDt = (d: Date | string | null | undefined) =>
    d ? new Date(d).toLocaleString(lang === "ar" ? "ar-AE" : "en-AE") : "—";

  const deleterName = (r: { deletedByUserName: string | null; deletedByUsername: string | null }) =>
    r.deletedByUserName?.trim() || r.deletedByUsername?.trim() || "—";

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm">{lang === "ar" ? "جاري التحميل…" : "Loading…"}</span>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="p-6 text-sm text-destructive">{error.message}</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-primary" />
              {lang === "ar" ? "سجل حذف العينات" : "Sample deletion log"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {lang === "ar"
                ? "العينات التي تمت إزالتها من العمل النشط بواسطة المسؤولين (حذف ناعم)."
                : "Samples removed from active workflow by administrators (soft delete)."}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setLocation("/admin/deletion-requests")}>
            {lang === "ar" ? "طلبات الحذف" : "Deletion requests"}
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{lang === "ar" ? "السجلات" : "Records"}</CardTitle>
            <CardDescription>
              {lang === "ar" ? `${rows?.length ?? 0} عينة` : `${rows?.length ?? 0} sample(s)`}
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {!rows?.length ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                {lang === "ar" ? "لا توجد عينات محذوفة مسجلة." : "No deleted samples in the audit log."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">{lang === "ar" ? "العينة" : "Sample"}</TableHead>
                    <TableHead className="whitespace-nowrap">{lang === "ar" ? "المشروع" : "Project"}</TableHead>
                    <TableHead className="whitespace-nowrap">{lang === "ar" ? "حُذف بواسطة" : "Deleted by"}</TableHead>
                    <TableHead className="whitespace-nowrap">{lang === "ar" ? "التاريخ" : "Date"}</TableHead>
                    <TableHead className="whitespace-nowrap">{lang === "ar" ? "الفئة" : "Category"}</TableHead>
                    <TableHead>{lang === "ar" ? "السبب" : "Reason"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((sample) => (
                    <TableRow
                      key={sample.id}
                      className="cursor-pointer"
                      onClick={() => setLocation(`/sample/${sample.id}`)}
                    >
                      <TableCell className="font-mono text-xs font-medium">{sample.sampleCode}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate" title={sample.contractName ?? ""}>
                        {sample.contractName ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">{deleterName(sample)}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{formatDt(sample.deletedAt)}</TableCell>
                      <TableCell className="text-xs">
                        {sample.deletionCategory ? (
                          <Badge variant="outline" className="font-normal">
                            {sample.deletionCategory}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-xs max-w-xs truncate" title={sample.deletionReason ?? ""}>
                        {sample.deletionReason ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
