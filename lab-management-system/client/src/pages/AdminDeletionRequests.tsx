import React, { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { DeletionImpactDisplay } from "@/components/DeletionImpactDisplay";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Trash2,
  Clock,
  User,
  Calendar,
  MessageSquare,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLocation } from "wouter";

type DeletionRequest = {
  id: number;
  requestedBy: number;
  targetTable: string;
  targetId: number;
  reason: string;
  reasonCategory: 'data_error' | 'duplicate' | 'customer_request' | 'compliance' | 'test_data' | 'other';
  impactAnalysis: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: number | null;
  reviewedAt: Date | null;
  reviewComment: string | null;
  createdAt: Date;
  updatedAt: Date;
  requester?: { name: string; email: string };
  reviewer?: { name: string; email: string };
};

type ImpactAnalysis = {
  affectedTables: Record<string, number>;
  totalRecords: number;
  canDelete: boolean;
  warnings: string[];
};

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

export default function AdminDeletionRequests() {
  const [, setLocation] = useLocation();
  const { lang } = useLanguage();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<number | null>(null);
  const [rejectComment, setRejectComment] = useState('');

  // Queries
  const { data: requests, isLoading, error, refetch } = trpc.deletion.getPendingRequests.useQuery();

  // Mutations
  const approveMutation = trpc.deletion.approveDeletion.useMutation({
    onSuccess: () => {
      refetch();
      toast.success(lang === "ar" ? "تمت الموافقة على طلب الحذف" : "Deletion request approved");
    },
    onError: (err) => {
      toast.error(err.message || (lang === "ar" ? "فشلت الموافقة" : "Approval failed"));
    },
  });

  const rejectMutation = trpc.deletion.rejectDeletion.useMutation({
    onSuccess: () => {
      refetch();
      closeRejectModal();
      toast.success(lang === "ar" ? "تم رفض طلب الحذف" : "Deletion request rejected");
    },
    onError: (err) => {
      toast.error(err.message || (lang === "ar" ? "فشل الرفض" : "Rejection failed"));
    },
  });

  // Filter requests
  const filteredRequests = React.useMemo(() => {
    if (!requests) return [];
    if (statusFilter === 'all') return requests;
    return requests.filter((req) => req.status === statusFilter);
  }, [requests, statusFilter]);

  // Toggle row expansion
  const toggleRow = (id: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  // Handle approve
  const handleApprove = async (requestId: number) => {
    if (window.confirm(lang === "ar" ? "هل أنت متأكد من الموافقة على هذا الطلب؟ سيتم حذف السجل بشكل نهائي." : "Are you sure you want to approve this deletion request? This will soft-delete the record.")) {
      approveMutation.mutate({ requestId });
    }
  };

  // Handle reject - open modal
  const openRejectModal = (requestId: number) => {
    setSelectedRequest(requestId);
    setRejectComment('');
    setRejectModalOpen(true);
  };

  // Close reject modal
  const closeRejectModal = () => {
    setRejectModalOpen(false);
    setSelectedRequest(null);
    setRejectComment('');
  };

  // Submit rejection
  const handleRejectSubmit = async () => {
    if (rejectComment.trim().length < 10) {
      toast.error(lang === "ar" ? "التعليق يجب أن يكون 10 أحرف على الأقل" : "Comment must be at least 10 characters");
      return;
    }

    if (selectedRequest === null) return;

    rejectMutation.mutate({
      requestId: selectedRequest,
      comment: rejectComment.trim(),
    });
  };

  // Parse impact analysis
  const parseImpact = (impactJson: string): ImpactAnalysis => {
    try {
      return JSON.parse(impactJson);
    } catch {
      return { affectedTables: {}, totalRecords: 0, canDelete: false, warnings: [] };
    }
  };

  // Format date
  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Format table name
  const formatTableName = (table: string) => {
    return table
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Get status badge - matching app patterns from Distribution page
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
            <Clock className="w-3 h-3 me-1" />
            {lang === "ar" ? "قيد الانتظار" : "Pending"}
          </Badge>
        );
      case 'approved':
        return (
          <Badge className="bg-green-100 text-green-700 border-green-200">
            <CheckCircle2 className="w-3 h-3 me-1" />
            {lang === "ar" ? "موافق عليه" : "Approved"}
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="destructive" className="bg-red-100 text-red-700 border-red-200">
            <XCircle className="w-3 h-3 me-1" />
            {lang === "ar" ? "مرفوض" : "Rejected"}
          </Badge>
        );
      default:
        return null;
    }
  };

  // Get reason category badge
  const getReasonBadge = (category: string) => {
    const configs: Record<string, { label: string; labelAr: string; className: string }> = {
      data_error: { 
        label: "Data Error", 
        labelAr: "خطأ في البيانات",
        className: "bg-red-50 text-red-700 border-red-200" 
      },
      duplicate: { 
        label: "Duplicate", 
        labelAr: "مكرر",
        className: "bg-orange-50 text-orange-700 border-orange-200" 
      },
      customer_request: { 
        label: "Customer Request", 
        labelAr: "طلب العميل",
        className: "bg-blue-50 text-blue-700 border-blue-200" 
      },
      compliance: { 
        label: "Compliance", 
        labelAr: "الامتثال",
        className: "bg-purple-50 text-purple-700 border-purple-200" 
      },
      test_data: { 
        label: "Test Data", 
        labelAr: "بيانات تجريبية",
        className: "bg-slate-50 text-slate-700 border-slate-200" 
      },
      other: { 
        label: "Other", 
        labelAr: "أخرى",
        className: "bg-slate-50 text-slate-700 border-slate-200" 
      },
    };

    const config = configs[category] || configs.other;
    return (
      <Badge variant="outline" className={config.className}>
        {lang === "ar" ? config.labelAr : config.label}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
            <p className="text-sm text-slate-500">{lang === "ar" ? "جاري التحميل..." : "Loading..."}</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              {lang === "ar" ? "فشل تحميل الطلبات" : "Failed to load deletion requests"}
            </h3>
            <p className="text-slate-600">{error.message}</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              {lang === "ar" ? "طلبات الحذف" : "Deletion Requests"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {lang === "ar" ? "مراجعة وإدارة طلبات الحذف المقدمة من المستخدمين" : "Review and manage deletion requests submitted by users"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setLocation("/admin/deletion-log")}>
            {lang === "ar" ? "سجل الحذف" : "Deletion log"}
          </Button>
        </div>

        {/* Filters - matching Reception page style */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              statusFilter === 'all'
                ? 'bg-primary text-primary-foreground shadow'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {lang === "ar" ? "الكل" : "All"} {requests?.length || 0}
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              statusFilter === 'pending'
                ? 'bg-primary text-primary-foreground shadow'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {lang === "ar" ? "قيد الانتظار" : "Pending"} {requests?.filter((r) => r.status === 'pending').length || 0}
          </button>
          <button
            onClick={() => setStatusFilter('approved')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              statusFilter === 'approved'
                ? 'bg-primary text-primary-foreground shadow'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {lang === "ar" ? "موافق عليه" : "Approved"} {requests?.filter((r) => r.status === 'approved').length || 0}
          </button>
          <button
            onClick={() => setStatusFilter('rejected')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              statusFilter === 'rejected'
                ? 'bg-primary text-primary-foreground shadow'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {lang === "ar" ? "مرفوض" : "Rejected"} {requests?.filter((r) => r.status === 'rejected').length || 0}
          </button>
        </div>

        {/* Table */}
        {filteredRequests.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-12 text-center">
              <Trash2 className="w-16 h-16 text-slate-400 mx-auto mb-4 opacity-30" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                {lang === "ar" ? "لا توجد طلبات حذف" : "No deletion requests found"}
              </h3>
              <p className="text-slate-600">
                {statusFilter === 'all'
                  ? (lang === "ar" ? "لم يتم تقديم أي طلبات حذف بعد." : "No deletion requests have been submitted yet.")
                  : (lang === "ar" ? `لا توجد طلبات ${statusFilter === 'pending' ? 'قيد الانتظار' : statusFilter === 'approved' ? 'موافق عليها' : 'مرفوضة'} في الوقت الحالي.` : `No ${statusFilter} deletion requests at this time.`)}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-0">
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="w-12 p-3"></th>
                      <th className="text-start p-3 font-medium text-xs text-slate-500">
                        {lang === "ar" ? "رقم الطلب" : "Request ID"}
                      </th>
                      <th className="text-start p-3 font-medium text-xs text-slate-500">
                        {lang === "ar" ? "طلبه" : "Requested By"}
                      </th>
                      <th className="text-start p-3 font-medium text-xs text-slate-500">
                        {lang === "ar" ? "الهدف" : "Target"}
                      </th>
                      <th className="text-start p-3 font-medium text-xs text-slate-500">
                        {lang === "ar" ? "السبب" : "Reason"}
                      </th>
                      <th className="text-start p-3 font-medium text-xs text-slate-500">
                        {lang === "ar" ? "التاريخ" : "Created"}
                      </th>
                      <th className="text-start p-3 font-medium text-xs text-slate-500">
                        {lang === "ar" ? "الحالة" : "Status"}
                      </th>
                      <th className="text-start p-3 font-medium text-xs text-slate-500">
                        {lang === "ar" ? "إجراءات" : "Actions"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRequests.map((request) => {
                      const isExpanded = expandedRows.has(request.id);
                      const impact = parseImpact(request.impactAnalysis);

                      return (
                        <React.Fragment key={request.id}>
                          {/* Main Row */}
                          <tr className="border-t hover:bg-muted/30 transition-colors">
                            <td className="p-3">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => toggleRow(request.id)}
                                className="h-7 w-7 p-0"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )}
                              </Button>
                            </td>
                            <td className="p-3">
                              <Badge variant="outline" className="font-mono text-xs">
                                #{request.id}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <User className="w-3.5 h-3.5 text-slate-400" />
                                <div className="text-xs">
                                  <div className="font-medium text-slate-900">
                                    {(request as any).requester?.name || `User ${request.requestedBy}`}
                                  </div>
                                  {(request as any).requester?.email && (
                                    <div className="text-slate-500">{(request as any).requester.email}</div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="text-xs">
                                <div className="font-medium text-slate-900">{formatTableName(request.targetTable)}</div>
                                <div className="text-slate-500">ID: {request.targetId}</div>
                              </div>
                            </td>
                            <td className="p-3">{getReasonBadge(request.reasonCategory)}</td>
                            <td className="p-3">
                              <div className="flex items-center gap-1 text-xs text-slate-500">
                                <Calendar className="w-3.5 h-3.5" />
                                {formatDate(request.createdAt)}
                              </div>
                            </td>
                            <td className="p-3">{getStatusBadge(request.status)}</td>
                            <td className="p-3">
                              {request.status === 'pending' && (
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    onClick={() => handleApprove(request.id)}
                                    disabled={approveMutation.isPending}
                                    className="h-7 bg-green-600 hover:bg-green-700 text-white"
                                  >
                                    {approveMutation.isPending ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <>
                                        <CheckCircle2 className="w-3.5 h-3.5 me-1" />
                                        {lang === "ar" ? "موافقة" : "Approve"}
                                      </>
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => openRejectModal(request.id)}
                                    disabled={rejectMutation.isPending}
                                    className="h-7"
                                  >
                                    {rejectMutation.isPending ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <>
                                        <XCircle className="w-3.5 h-3.5 me-1" />
                                        {lang === "ar" ? "رفض" : "Reject"}
                                      </>
                                    )}
                                  </Button>
                                </div>
                              )}
                              {request.status !== 'pending' && (
                                <div className="text-xs text-slate-500">
                                  <div className="font-medium">
                                    {(request as any).reviewer?.name || `User ${request.reviewedBy}`}
                                  </div>
                                  {request.reviewedAt && (
                                    <div className="text-slate-400">{formatDate(request.reviewedAt)}</div>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>

                          {/* Expanded Row */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={8} className="p-0">
                                <div className="bg-muted/30 p-6 border-t space-y-4">
                                  {/* Reason */}
                                  <div>
                                    <h4 className="text-sm font-semibold text-slate-900 mb-2">
                                      {lang === "ar" ? "سبب الحذف:" : "Reason for Deletion:"}
                                    </h4>
                                    <div className="bg-white p-3 rounded-lg border text-sm text-slate-700">
                                      {request.reason}
                                    </div>
                                  </div>

                                  {/* Impact Analysis */}
                                  <div>
                                    <h4 className="text-sm font-semibold text-slate-900 mb-2">
                                      {lang === "ar" ? "تحليل التأثير:" : "Impact Analysis:"}
                                    </h4>
                                    <DeletionImpactDisplay
                                      affectedTables={impact.affectedTables}
                                      totalRecords={impact.totalRecords}
                                      warnings={impact.warnings}
                                    />
                                  </div>

                                  {/* Review Comment (if rejected) */}
                                  {request.status === 'rejected' && request.reviewComment && (
                                    <div>
                                      <h4 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
                                        <MessageSquare className="w-4 h-4" />
                                        {lang === "ar" ? "تعليق الرفض:" : "Rejection Comment:"}
                                      </h4>
                                      <div className="bg-red-50 p-3 rounded-lg border border-red-200 text-sm text-red-700">
                                        {request.reviewComment}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Reject Modal */}
        <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-red-600 flex items-center gap-2">
                <XCircle className="w-4 h-4" />
                {lang === "ar" ? "رفض طلب الحذف" : "Reject Deletion Request"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                {lang === "ar" 
                  ? "يرجى تقديم سبب لرفض طلب الحذف هذا. سيكون هذا مرئيًا لمقدم الطلب."
                  : "Please provide a reason for rejecting this deletion request. This will be visible to the requester."}
              </p>

              <div>
                <Label htmlFor="rejectComment">
                  {lang === "ar" ? "التعليق" : "Comment"} <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="rejectComment"
                  value={rejectComment}
                  onChange={(e) => setRejectComment(e.target.value)}
                  placeholder={lang === "ar" ? "اشرح لماذا يتم رفض هذا الطلب..." : "Explain why this request is being rejected..."}
                  rows={4}
                  className="mt-1.5"
                />
                <p className="text-xs text-slate-500 mt-1">
                  {lang === "ar" ? "الحد الأدنى 10 أحرف مطلوبة" : "Minimum 10 characters required"}
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={closeRejectModal}
                disabled={rejectMutation.isPending}
              >
                {lang === "ar" ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                variant="destructive"
                onClick={handleRejectSubmit}
                disabled={rejectMutation.isPending}
              >
                {rejectMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin me-2" />
                    {lang === "ar" ? "جاري الرفض..." : "Rejecting..."}
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 me-2" />
                    {lang === "ar" ? "رفض الطلب" : "Reject Request"}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}