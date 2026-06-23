import DashboardLayout from "@/components/DashboardLayout";
import { DeletionRequestButton } from "@/components/DeletionRequestButton";
import { ReceptionContractorFormUpload } from "@/components/ReceptionContractorFormUpload";
import { ContractorFormViewButton } from "@/components/ContractorFormViewButton";
import { readFileAsBase64 } from "@/lib/sampleFileUpload";
import { ReceptionRetestPanel } from "@/components/ReceptionRetestPanel";
import {
  ReceptionNominalCubeSizePanel,
  isValidNominalCubeSize,
} from "@/components/ReceptionNominalCubeSizePanel";
import { RetestBadge } from "@/components/RetestBadge";
import {
  TestDetailIndent,
  TestGroupHeading,
  TestListEmpty,
  TestNameBlock,
  TestNestedRow,
  TestOrderItemList,
  TestOrderQtyRow,
  TestPriceBadge,
  TestQtyInput,
  TestSectionLabel,
  TestSelectionCard,
  TestSelectionGrid,
  TestSelectionPanel,
  TestSelectionRow,
  mapOrderItemsToTestList,
} from "@/components/TestDisplay";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Printer, Pencil, X, Trash2, CheckSquare, Package, CalendarIcon, AlertTriangle, ClipboardList, PackagePlus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useMemo, useEffect, useRef, type ReactElement, type ReactNode } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { useDeletionStatus } from "@/hooks/useDeletionStatus";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  getRequiredTestsForCode,
  selectedTestsIncludeCode,
  normalizeTestCode,
} from "@/lib/testDependencies";
import {
  getOfficialTestByCode,
  getSteelDeferredSubtypeOrderHint,
} from "../../../server/data/official-test-catalog";
import { resolveOfficialTestLabel } from "@/lib/officialTestCatalog";
import {
  serializeConcCubePlan,
  buildConcCubePlanFromNominalSize,
  validateConcCubeReceptionPlan,
  MIN_CONC_CUBE_COUNT,
  MAX_CONC_CUBE_COUNT,
} from "@shared/concreteCubeReception";
import { openTestCatalogPrint } from "@/lib/testCatalogCategories";
import {
  getCbrDependencyHint,
  getCbrUnitPrice,
  getProctorSubtypeLabel,
  requiredProctorSubtypeForCbr,
  SOIL_PROCTOR_UNIT_PRICE,
  syncCbrFromProctor,
  validateSoilTestOrder,
} from "@/lib/soilTestReception";

// ─── Sub-type options per test CODE ─────────────────────────────────────────
const SUBTYPES_BY_CODE: Record<string, { value: string; labelAr: string; labelEn: string }[]> = {
  CONC_FOAM: [
    { value: "7_days", labelAr: "7 أيام", labelEn: "7 Days" },
    { value: "14_days", labelAr: "14 يوم", labelEn: "14 Days" },
    { value: "28_days", labelAr: "28 يوم", labelEn: "28 Days" },
  ],
  CONC_BLOCK: [
    { value: "solid_block", labelAr: "بلوك صلب", labelEn: "Solid Block" },
    { value: "hollow_block", labelAr: "بلوك مجوف", labelEn: "Hollow Block" },
    { value: "thermal_block", labelAr: "بلوك حراري", labelEn: "Thermal Block" },
  ],
  STEEL_BEND: [
    { value: "rebar_T8", labelAr: "T8 - قطر 8مم", labelEn: "T8 - 8mm" },
    { value: "rebar_T10", labelAr: "T10 - قطر 10مم", labelEn: "T10 - 10mm" },
    { value: "rebar_T12", labelAr: "T12 - قطر 12مم", labelEn: "T12 - 12mm" },
    { value: "rebar_T16", labelAr: "T16 - قطر 16مم", labelEn: "T16 - 16mm" },
    { value: "rebar_T20", labelAr: "T20 - قطر 20مم", labelEn: "T20 - 20mm" },
    { value: "rebar_T25", labelAr: "T25 - قطر 25مم", labelEn: "T25 - 25mm" },
    { value: "rebar_T32", labelAr: "T32 - قطر 32مم", labelEn: "T32 - 32mm" },
  ],
  AGG_SIEVE: [
    { value: "agg_32mm", labelAr: "ركام 32مم", labelEn: "32mm Aggregate" },
    { value: "agg_20mm", labelAr: "ركام 20مم", labelEn: "20mm Aggregate" },
    { value: "agg_10mm", labelAr: "ركام 10مم", labelEn: "10mm Aggregate" },
    { value: "agg_0_5mm", labelAr: "ركام 0-5مم", labelEn: "0-5mm Aggregate" },
    { value: "dune_sand", labelAr: "رمل كثبان", labelEn: "Dune Sand" },
    { value: "others", labelAr: "أخرى", labelEn: "Others" },
  ],
  SOIL_PROCTOR: [
    { value: "BS_HEAVY", labelAr: "BS 1377 دمك ثقيل", labelEn: "BS 1377 Heavy Compaction" },
    { value: "BS_LIGHT", labelAr: "BS 1377 دمك خفيف", labelEn: "BS 1377 Light Compaction" },
    { value: "MODIFIED_PROCTOR", labelAr: "بروكتور معدّل (ASTM D1557)", labelEn: "Modified Proctor (ASTM D1557)" },
  ],
  SOIL_CBR: [
    { value: "BS_1377_4", labelAr: "BS 1377-4 (عينة واحدة)", labelEn: "BS 1377-4 (1 sample)" },
    { value: "ASTM_D1883", labelAr: "ASTM D1883 (3 عينات — 10/30/65 ضربة)", labelEn: "ASTM D1883 (3 samples — 10/30/65 blows)" },
  ],
  SOIL_SIEVE: [
    { value: "formation_level", labelAr: "مادة مستوى التأسيس", labelEn: "Formation Level Material" },
    { value: "general_backfill", labelAr: "ردم عام", labelEn: "General Backfill" },
    { value: "structural_fill", labelAr: "ردم إنشائي", labelEn: "Structural Fill" },
    { value: "granular_fill", labelAr: "ردم حبيبي", labelEn: "Granular Fill" },
    { value: "embankment_fill", labelAr: "ردم جسر", labelEn: "Embankment Fill" },
    { value: "road_sub_grade", labelAr: "طبقة التربة الطبيعية للطريق", labelEn: "Road Sub Grade" },
    { value: "agg_sub_base", labelAr: "ركام الطبقة التحتية", labelEn: "Agg. Sub Base" },
    { value: "agg_base_course", labelAr: "ركام طبقة الأساس (قاعدة الطريق)", labelEn: "Agg. Base Course (Road Base)" },
    { value: "others", labelAr: "أخرى", labelEn: "Others" },
  ],
  ASPH_MARSHALL: [
    { value: "wearing_course", labelAr: "طبقة رابطة (ويرنج)", labelEn: "Wearing Course" },
    { value: "base_course", labelAr: "طبقة قاعدة", labelEn: "Base Course" },
  ],
  ASPH_MARSHALL_DENSITY: [
    { value: "wearing_course", labelAr: "طبقة رابطة (ويرنج)", labelEn: "Wearing Course" },
    { value: "base_course", labelAr: "طبقة قاعدة", labelEn: "Base Course" },
  ],
  ASPH_CORE: [
    { value: "wearing_course", labelAr: "طبقة رابطة (ويرنج)", labelEn: "Wearing Course" },
    { value: "base_course", labelAr: "طبقة قاعدة", labelEn: "Base Course" },
  ],
  ASPH_HOTBIN: [
    { value: "wearing_course", labelAr: "طبقة رابطة (ويرنج)", labelEn: "Wearing Course" },
    { value: "base_course", labelAr: "طبقة قاعدة", labelEn: "Base Course" },
  ],
  ASPH_EXTRACTED_SIEVE: [
    { value: "wearing_course", labelAr: "طبقة رابطة (ويرنج)", labelEn: "Wearing Course" },
    { value: "base_course", labelAr: "طبقة قاعدة", labelEn: "Base Course" },
  ],
  CONC_MORTAR_SAND: [
    { value: "plaster_sand", labelAr: "رمل لياسة", labelEn: "Plaster Sand" },
    { value: "masonry_sand", labelAr: "رمل بناء", labelEn: "Masonry Sand" },
  ],
};

const MIN_CONC_BLOCK_COUNT = 10;

const CATEGORIES = [
  { value: "concrete", labelAr: "خرسانة", labelEn: "Concrete" },
  { value: "soil", labelAr: "تربة", labelEn: "Soil" },
  { value: "steel", labelAr: "حديد", labelEn: "Steel" },
  { value: "asphalt", labelAr: "أسفلت", labelEn: "Asphalt" },
  { value: "aggregates", labelAr: "ركام", labelEn: "Aggregates" },
];

// Tests that use casting date
const CASTING_DATE_TESTS = ["CONC_CUBE", "CONC_FOAM", "CONC_BEAM"];

// ─── Selected test item ───────────────────────────────────────────────────────
interface SelectedTest {
  testTypeId: number;
  testTypeCode: string;
  testTypeName: string;
  formTemplate?: string;
  testSubType?: string;
  quantity: number;
  unitPrice: number;
}

// Tests that support multi-subtype selection (each subtype = separate order item)
const MULTI_SUBTYPE_TESTS = [
  "CONC_BLOCK", "CONC_MORTAR_SAND",
  "SOIL_SIEVE",
  "STEEL_BEND",
  "AGG_SIEVE",
];

// Multi-subtype selection state: { [testTypeId]: { [subtypeValue]: quantity } }
type MultiSubtypeState = Record<number, Record<string, number>>;

const ASPHALT_MIX_TEST_CODES = ["ASPH_BITUMEN_EXTRACT", "ASPH_EXTRACTED_SIEVE", "ASPH_MARSHALL_DENSITY", "ASPH_MARSHALL"];

const ASPHALT_TEST_GROUPS = [
  {
    id: "hot_bin",
    label: { en: "Hot Bin Aggregates (Pre-production)", ar: "ركام صندوق ساخن (ما قبل الإنتاج)" },
    color: "blue",
    tests: ["ASPH_HOTBIN"],
  },
  {
    id: "mix",
    label: { en: "Asphalt Mix - Trial/Fresh (Production QC)", ar: "خلطة أسفلتية (مراقبة الإنتاج)" },
    color: "green",
    tests: ASPHALT_MIX_TEST_CODES,
  },
  {
    id: "core",
    label: { en: "Asphalt Core (Field Testing)", ar: "لب أسفلتي (اختبار ميداني)" },
    color: "orange",
    tests: ["ASPH_CORE"],
  },
] as const;

const emptyForm = () => ({
  contractId: "",
  contractNumber: "",
  contractName: "",
  contractorName: "",
  sectorKey: "",
  sectorNameAr: "",
  sectorNameEn: "",
  sampleType: "" as string,
  condition: "good" as "good" | "damaged" | "partial",
  notes: "",
  location: "",
  referenceNo: "",
  castingDate: undefined as Date | undefined,
  priority: "normal" as "low" | "normal" | "high" | "urgent",
});

function FormSection({
  title,
  step,
  subtitle,
  children,
  className,
}: {
  title?: string;
  step?: number;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4 text-start", className)}>
      {title ? (
        <div className="space-y-1 text-start">
          <h3 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2.5 rtl:flex-row-reverse">
            {step != null && (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                {step}
              </span>
            )}
            {title}
          </h3>
          {subtitle ? <p className="text-xs text-muted-foreground ms-9 text-start">{subtitle}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function ReceptionOrderActionsCell({
  order,
  lang,
  canEditSample,
  handleEditOrder,
  onDeletionSuccess,
}: {
  order: any;
  lang: string;
  canEditSample: boolean;
  handleEditOrder: (order: any) => void;
  onDeletionSuccess: () => void;
}) {
  const sampleId = typeof order.sampleId === "number" ? order.sampleId : Number(order.sampleId) || 0;
  const { hasPendingDeletion, PendingDeletionBadge, DisabledWarning } = useDeletionStatus("samples", sampleId);

  const wrapDisabledAction = (node: ReactElement) =>
    hasPendingDeletion ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-not-allowed">{node}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {DisabledWarning}
        </TooltipContent>
      </Tooltip>
    ) : (
      node
    );

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {PendingDeletionBadge}
      {wrapDisabledAction(
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          title={lang === "ar" ? "طباعة وصل الاستلام" : "Print Receipt"}
          disabled={hasPendingDeletion}
          onClick={() => window.open(`/print-receipt/${order.sampleId}?lang=${lang}`, "_blank")}
        >
          <Printer className="w-3.5 h-3.5" />
        </Button>
      )}
      {wrapDisabledAction(
        <ContractorFormViewButton
          sampleId={sampleId}
          lang={lang}
          disabled={hasPendingDeletion}
        />,
      )}
      {canEditSample &&
        order.status === "pending" &&
        wrapDisabledAction(
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-blue-600 hover:text-blue-700"
            title={lang === "ar" ? "تعديل" : "Edit"}
            disabled={hasPendingDeletion}
            onClick={() => handleEditOrder(order)}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
        )}
      {hasPendingDeletion ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-not-allowed opacity-60">
              <span className="pointer-events-none inline-flex">
                <DeletionRequestButton
                  targetTable="lab_orders"
                  targetId={order.id}
                  targetLabel={`Sample ${order.sampleCode || order.orderCode}`}
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
          targetLabel={`Sample ${order.sampleCode || order.orderCode}`}
          variant="icon"
          onSuccess={onDeletionSuccess}
        />
      )}
    </div>
  );
}

export default function Reception() {
  const { t, lang, dir } = useLanguage();
  const [receptionMode, setReceptionMode] = useState<"new" | "retest">("new");
  const { user } = useAuth();
  const canEditSample = ["admin", "lab_manager", "reception"].includes(user?.role ?? "");
  const [search, setSearch] = useState("");
  const [refSearch, setRefSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [sampleTypeFilter, setSampleTypeFilter] = useState<string>("all");
  const [form, setForm] = useState(emptyForm());
  const [selectedTests, setSelectedTests] = useState<SelectedTest[]>([]);
  // For subtype selection per test
  const [subtypeFor, setSubtypeFor] = useState<number | null>(null); // testTypeId being configured
  // For multi-subtype tests (CONC_BLOCK, CONC_MORTAR_SAND, …): { testTypeId: { subtypeValue: quantity } }
  const [multiSubtypes, setMultiSubtypes] = useState<MultiSubtypeState>({});
  // Asphalt sample kind: 'hot_bin' = Hot Bin Aggregates, 'mix' = Trial Mix / Fresh Sample
  const [asphaltKind, setAsphaltKind] = useState<"hot_bin" | "mix" | "">("")
  // Hot Bin optional add-on tests: { AGG_SG: true/false, AGG_FLAKINESS_ELONGATION: true/false }
  const [hotBinAddons, setHotBinAddons] = useState<Record<string, boolean>>({});
  // Asphalt Mix course type (global for all mix tests)
  const [asphaltMixCourse, setAsphaltMixCourse] = useState<string>("");
  /** Asphalt mix: standard 4-test batch vs pick tests individually */
  const [asphaltMixSelectionMode, setAsphaltMixSelectionMode] = useState<"batch" | "individual">("batch");
  /** Foamed concrete (CONC_FOAM): age in days from casting to testing, saved on order item metadata → DB as JSON in testSubType */
  const [foamConcreteAge, setFoamConcreteAge] = useState("");
  /** Reception: CONC_CUBE nominal face size (stored on sample) — required when cube test selected */
  const [nominalCubeSize, setNominalCubeSize] = useState("");
  const [supplier, setSupplier] = useState("");
  const [curingDate, setCuringDate] = useState<Date | undefined>(undefined);
  const [aggregateType, setAggregateType] = useState("");
  const [contractorFormFile, setContractorFormFile] = useState<File | null>(null);
  const concCubePanelRef = useRef<HTMLDivElement>(null);

  const minQtyForTest = (code: string) => (code === "CONC_CUBE" ? MIN_CONC_CUBE_COUNT : 1);
  const maxQtyForTest = (code: string) => (code === "CONC_CUBE" ? MAX_CONC_CUBE_COUNT : 999);
  // Edit order state
  const [editOpen, setEditOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<{
    id: number; orderCode: string; contractNumber: string; contractorName: string; location: string;
    notes: string; castingDate: Date | undefined;
    items: { id: number; testTypeName: string; testTypeCode: string; testSubType?: string | null; quantity: number }[];
  } | null>(null);

  const { data: orders, refetch } = trpc.orders.list.useQuery();
  const { data: contracts = [] } = trpc.contracts.list.useQuery();
  const { data: allTests = [] } = trpc.testTypes.list.useQuery();
  const { data: sectors = [] } = trpc.sectors.list.useQuery();

  // Codes for Hot Bin Aggregates tests only (ASPH_HOTBIN = required, AGG_SG + AGG_FLAKINESS_ELONGATION = optional add-ons)
  const HOT_BIN_REQUIRED_CODE = "ASPH_HOTBIN";
  const HOT_BIN_OPTIONAL_CODES = ["AGG_SG", "AGG_FLAKINESS_ELONGATION"];
  const HOT_BIN_CODES = [HOT_BIN_REQUIRED_CODE, ...HOT_BIN_OPTIONAL_CODES];
  // Codes for Asphalt Mix (Trial/Fresh) tests only
  const ASPH_MIX_CODES = ["ASPH_MARSHALL", "ASPH_MARSHALL_DENSITY", "ASPH_CORE", "ASPH_EXTRACTED_SIEVE", "ASPH_ACWC", "ASPH_ACBC", "ASPH_DBM"];
  const ASPH_BATCH_TEST_CODES = ["ASPH_BITUMEN_EXTRACT", "ASPH_EXTRACTED_SIEVE", "ASPH_MARSHALL_DENSITY", "ASPH_MARSHALL"] as const;

  const batchTests = useMemo(
    () =>
      allTests.filter(t =>
        ["ASPH_BITUMEN_EXTRACT", "ASPH_EXTRACTED_SIEVE", "ASPH_MARSHALL_DENSITY", "ASPH_MARSHALL"].includes(t.code ?? ""),
      ),
    [allTests],
  );

  /**
   * Catalog link: rows in `test_types` use `category` (concrete | soil | steel | asphalt | aggregates).
   * Reception sets `form.sampleType` to the same value when the user picks a category chip.
   * Filter: show only tests where `test_types.category === form.sampleType`.
   * Sub-types (diameter, course, sand type, …) are not in the DB; they come from SUBTYPES_BY_CODE[code].
   * Technician routing uses `distribution.testType` (code) + TestRouter; reports use `formTemplate`.
   */
  /** Foamed concrete: one reception line (CONC_FOAM); strength vs density is chosen on the technical form. */
  const RECEPTION_HIDDEN_TEST_CODES = ["CONC_FOAM_DENSITY", "CONC_FOAM_CUBE"];

  const filteredTests = useMemo(() => {
    const active = allTests.filter(tt => tt.isActive);
    if (!form.sampleType) return active.filter(tt => !RECEPTION_HIDDEN_TEST_CODES.includes(tt.code ?? ""));
    const base = active
      .filter(tt => tt.category === form.sampleType)
      .filter(tt => !RECEPTION_HIDDEN_TEST_CODES.includes(tt.code ?? ""));
    if (form.sampleType === "asphalt") {
      const groupedCodes = new Set(ASPHALT_TEST_GROUPS.flatMap(group => group.tests));
      return base.filter(tt => groupedCodes.has(tt.code ?? ""));
    }
    return base;
  }, [allTests, form.sampleType]);

  useEffect(() => {
    if (asphaltMixCourse && selectedTests.length > 0) {
      setSelectedTests(prev => prev.map(t =>
        ASPHALT_MIX_TEST_CODES.includes(t.testTypeCode) ? { ...t, testSubType: asphaltMixCourse } : t,
      ));
    }
  }, [asphaltMixCourse, selectedTests.length]);

  const sectorLabel = (key: string) => {
    const s = sectors.find(x => x.sectorKey === key);
    if (s) return lang === "ar" ? s.nameAr : s.nameEn;
    return key;
  };

  const resetRegistrationForm = () => {
    setForm(emptyForm());
    setSelectedTests([]);
    setSubtypeFor(null);
    setMultiSubtypes({});
    setAsphaltKind("");
    setHotBinAddons({});
    setAsphaltMixCourse("");
    setAsphaltMixSelectionMode("batch");
    setNominalCubeSize("");
    setSupplier("");
    setCuringDate(undefined);
    setAggregateType("");
    setFoamConcreteAge("");
    setContractorFormFile(null);
  };

  const uploadAttachment = trpc.attachments.upload.useMutation();

  const createOrder = trpc.orders.create.useMutation({
    onSuccess: async (result) => {
      if (contractorFormFile) {
        try {
          const { base64, mimeType } = await readFileAsBase64(contractorFormFile);
          await uploadAttachment.mutateAsync({
            sampleId: result.sample.id,
            fileName: contractorFormFile.name,
            fileData: base64,
            mimeType,
            fileSize: contractorFormFile.size,
            attachmentType: "contractor_form",
          });
        } catch (err) {
          toast.error(
            lang === "ar"
              ? "تم تسجيل العينة، لكن فشل حفظ نموذج المقاول."
              : "Sample registered, but contractor form upload failed.",
          );
          console.error(err);
        }
      }
      toast.success(lang === "ar"
        ? `تم تسجيل العينة ${result.sample.sampleCode} (${result.items.length} اختبار)`
        : `Sample ${result.sample.sampleCode} registered (${result.items.length} test(s))`);
      resetRegistrationForm();
      refetch();
      window.open(`/print-receipt/${result.sample.id}?lang=${lang}`, "_blank");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateItemQty = trpc.orders.updateItemQty.useMutation();

  const updateOrder = trpc.orders.update.useMutation({
    onSuccess: () => {
      toast.success(lang === "ar" ? "تم تحديث الأوردر بنجاح" : "Order updated successfully");
      setEditOpen(false);
      setEditingOrder(null);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleEditOrder = (order: any) => {
    setEditingOrder({
      id: order.id,
      orderCode: order.orderCode,
      contractNumber: order.contractNumber ?? "",
      contractorName: order.contractorName ?? "",
      location: order.location ?? "",
      notes: order.notes ?? "",
      castingDate: order.castingDate ? new Date(order.castingDate) : undefined,
      items: (order.items ?? []).map((item: any) => ({
        id: item.id,
        testTypeName: item.testName ?? item.testTypeName ?? "",
        testTypeCode: item.testTypeCode ?? "",
        testSubType: item.testSubType ?? null,
        quantity: item.quantity ?? 1,
      })),
    });
    setEditOpen(true);
  };

  const handleContractChange = (contractId: string) => {
    const contract = contracts.find(c => String(c.id) === contractId);
    if (contract) {
      const sectorKey = (contract as any).sectorKey ?? "";
      const sectorNameAr = (contract as any).sectorNameAr ?? "";
      const sectorNameEn = (contract as any).sectorNameEn ?? "";
      setForm(f => ({
        ...f,
        contractId,
        contractNumber: contract.contractNumber,
        contractName: contract.contractName,
        contractorName: (contract as any).contractorNameEn ?? "",
        sectorKey: sectorKey || f.sectorKey,
        sectorNameAr: sectorNameAr || f.sectorNameAr,
        sectorNameEn: sectorNameEn || f.sectorNameEn,
      }));
    }
  };

  const handleSectorChange = (key: string) => {
    const s = sectors.find(x => x.sectorKey === key);
    setForm(f => ({
      ...f,
      sectorKey: key,
      sectorNameAr: s?.nameAr ?? "",
      sectorNameEn: s?.nameEn ?? "",
    }));
  };

  const findTestTypeByCode = (code: string) => {
    const norm = normalizeTestCode(code) ?? code;
    return allTests.find((t) => {
      if (!t.isActive) return false;
      const c = normalizeTestCode(t.code) ?? t.code ?? "";
      return c === norm;
    });
  };

  const catalogLang = lang === "ar" ? "ar" : "en";
  const testDisplayName = (
    code: string | null | undefined,
    nameEn?: string | null,
    nameAr?: string | null,
  ) => resolveOfficialTestLabel(code, catalogLang, { nameEn, nameAr });

  const getRequiredTestDisplayNames = (codes: readonly string[]) =>
    codes
      .map((code) => {
        const reqTest = findTestTypeByCode(code) ?? getOfficialTestByCode(code);
        return testDisplayName(
          code,
          (reqTest as { nameEn?: string })?.nameEn,
          (reqTest as { nameAr?: string })?.nameAr,
        );
      })
      .join(", ");

  const makeSelectedTestFromType = (tt: { id: number; code?: string | null; nameAr?: string | null; nameEn: string; formTemplate?: string | null; unitPrice?: string | null }): SelectedTest => {
    const testTypeCode = tt.code ?? "";
    const isMixTest = ASPHALT_MIX_TEST_CODES.includes(testTypeCode);
    return {
      testTypeId: tt.id,
      testTypeCode,
      testTypeName: testDisplayName(tt.code, tt.nameEn, tt.nameAr),
      formTemplate: tt.formTemplate ?? undefined,
      testSubType:
        form.sampleType === "asphalt" && isMixTest && asphaltMixCourse
          ? asphaltMixCourse
          : undefined,
      quantity: 0,
      unitPrice: parseFloat(tt.unitPrice ?? "0"),
    };
  };

  const makeProctorDependency = (
    reqTt: { id: number; code?: string | null; nameAr?: string | null; nameEn: string; formTemplate?: string | null; unitPrice?: string | null },
    proctorSubtype?: string,
  ): SelectedTest => ({
    ...makeSelectedTestFromType(reqTt),
    testSubType: proctorSubtype,
    unitPrice: SOIL_PROCTOR_UNIT_PRICE,
  });

  /** Returns prerequisite tests to add, [] if none, null if user cancelled or prerequisite missing. */
  const confirmAndResolveMissingDependencies = (
    tt: { code?: string | null },
    cbrSubtype?: string | null,
  ): SelectedTest[] | null => {
    const required = getRequiredTestsForCode(tt.code);
    const missing = required.filter((reqCode) => !selectedTestsIncludeCode(selectedTests, reqCode));
    if (missing.length === 0) return [];

    const cbrReq = tt.code === "SOIL_CBR" ? requiredProctorSubtypeForCbr(cbrSubtype) : null;
    const requiredLabel = cbrReq === "MODIFIED_PROCTOR"
      ? (lang === "ar" ? "بروكتور معدّل (ASTM D1557)" : "Modified Proctor (ASTM D1557)")
      : cbrReq === "BS_LIGHT_OR_HEAVY"
        ? (lang === "ar" ? "بروكتور BS 1377 (خفيف أو ثقيل)" : "BS 1377 Proctor (Light or Heavy)")
        : getRequiredTestDisplayNames(missing);

    const confirmed = window.confirm(
      lang === "ar"
        ? `هذا الاختبار يتطلب: ${requiredLabel}\nسيتم إضافتها تلقائياً. هل تريد المتابعة؟`
        : `This test requires: ${requiredLabel}\nThey will be added automatically. Continue?`,
    );
    if (!confirmed) return null;

    const toAdd: SelectedTest[] = [];
    for (const code of missing) {
      const reqTt = findTestTypeByCode(code);
      if (!reqTt) {
        toast.error(
          lang === "ar"
            ? `الاختبار المطلوب غير متوفر في النظام: ${code}`
            : `Required test is not available in the system: ${code}`,
        );
        return null;
      }
      if (code === "SOIL_PROCTOR" && cbrReq === "MODIFIED_PROCTOR") {
        toAdd.push(makeProctorDependency(reqTt, "MODIFIED_PROCTOR"));
      } else if (code === "SOIL_PROCTOR") {
        toAdd.push(makeProctorDependency(reqTt));
      } else {
        toAdd.push(makeSelectedTestFromType(reqTt));
      }
    }
    return toAdd;
  };

  const renderTestDependencyHint = (testCode: string | null | undefined, selectedItem?: SelectedTest) => {
    if (testCode === "SOIL_CBR") {
      return (
        <p className="text-xs text-amber-700 mt-0.5">
          {getCbrDependencyHint(selectedItem?.testSubType, lang)}
        </p>
      );
    }
    const required = getRequiredTestsForCode(testCode);
    if (required.length === 0) return null;
    return (
      <p className="text-xs text-amber-700 mt-0.5">
        {lang === "ar" ? "يتطلب: " : "Requires: "}
        {getRequiredTestDisplayNames(required)}
      </p>
    );
  };

  const toggleTest = (tt: any) => {
    const isMulti = MULTI_SUBTYPE_TESTS.includes(tt.code);
    if (isMulti) {
      // Toggle the whole test on/off; subtypes managed separately
      const exists = selectedTests.some(s => s.testTypeId === tt.id);
      if (exists) {
        setSelectedTests(prev => prev.filter(s => s.testTypeId !== tt.id));
        setMultiSubtypes(prev => { const n = { ...prev }; delete n[tt.id]; return n; });
      } else {
        const deps = confirmAndResolveMissingDependencies(tt);
        if (deps === null) return;
        const placeholder: SelectedTest = {
          testTypeId: tt.id,
          testTypeCode: tt.code,
          testTypeName: testDisplayName(tt.code, tt.nameEn, tt.nameAr),
          formTemplate: tt.formTemplate ?? undefined,
          testSubType: "__multi__",
          quantity: 0,
          unitPrice: parseFloat(tt.unitPrice ?? "0"),
        };
        setSelectedTests(prev => {
          const ids = new Set(prev.map(s => s.testTypeId));
          const additions = [...deps, placeholder].filter(t => !ids.has(t.testTypeId));
          return [...prev, ...additions];
        });
        if (deps.length > 0) {
          toast.info(
            lang === "ar"
              ? `تم إضافة الاختبارات المطلوبة: ${getRequiredTestDisplayNames(deps.map(d => d.testTypeCode))}`
              : `Added required tests: ${getRequiredTestDisplayNames(deps.map(d => d.testTypeCode))}`,
          );
        }
        setMultiSubtypes(prev => ({ ...prev, [tt.id]: {} }));
      }
      return;
    }
    const exists = selectedTests.find(s => s.testTypeId === tt.id);
    if (exists) {
      setSelectedTests(prev => prev.filter(s => s.testTypeId !== tt.id));
      if (subtypeFor === tt.id) setSubtypeFor(null);
      return;
    }

    const deps = confirmAndResolveMissingDependencies(tt);
    if (deps === null) return;

    const newTest = makeSelectedTestFromType(tt);
    if (form.sampleType === "asphalt" && asphaltKind === "mix" && asphaltMixCourse) {
      newTest.testSubType = asphaltMixCourse;
    }
    if (newTest.testTypeCode === "CONC_CUBE") {
      newTest.quantity = MIN_CONC_CUBE_COUNT;
    }

    const ids = new Set(selectedTests.map(s => s.testTypeId));
    const additions = [...deps, newTest].filter(t => !ids.has(t.testTypeId));
    const nextTests = syncCbrFromProctor([...selectedTests, ...additions]);
    setSelectedTests(nextTests);
    if (deps.length > 0) {
      toast.info(
        lang === "ar"
          ? `تم إضافة الاختبارات المطلوبة: ${getRequiredTestDisplayNames(deps.map(d => d.testTypeCode))}`
          : `Added required tests: ${getRequiredTestDisplayNames(deps.map(d => d.testTypeCode))}`,
      );
    }

    const subTypes = SUBTYPES_BY_CODE[tt.code] ?? [];
    const isCasting = CASTING_DATE_TESTS.includes(tt.code);
    const addedItem = nextTests.find(s => s.testTypeId === tt.id);
    if (subTypes.length > 0 && !isCasting && !addedItem?.testSubType) {
      setSubtypeFor(tt.id);
    }
  };

  const toggleBlockSubtype = (testTypeId: number, subtypeValue: string, testTypeName: string, testTypeCode: string, formTemplate: string | undefined, unitPrice: number) => {
    const defaultQty = testTypeCode === "CONC_BLOCK" ? MIN_CONC_BLOCK_COUNT : 0;
    setMultiSubtypes(prev => {
      const current = prev[testTypeId] ?? {};
      if (current[subtypeValue] !== undefined) {
        const updated = { ...current };
        delete updated[subtypeValue];
        return { ...prev, [testTypeId]: updated };
      } else {
        return { ...prev, [testTypeId]: { ...current, [subtypeValue]: defaultQty } };
      }
    });
  };

  const setBlockSubtypeQty = (testTypeId: number, subtypeValue: string, qty: number) => {
    setMultiSubtypes(prev => ({
      ...prev,
      [testTypeId]: { ...(prev[testTypeId] ?? {}), [subtypeValue]: Math.max(0, qty) },
    }));
  };

  const setTestSubtype = (testTypeId: number, subType: string) => {
    setSelectedTests(prev => {
      const target = prev.find(s => s.testTypeId === testTypeId);
      if (!target) return prev;

      let next = prev.map(s => {
        if (s.testTypeId !== testTypeId) return s;
        if (s.testTypeCode === "SOIL_CBR") {
          return { ...s, testSubType: subType, unitPrice: getCbrUnitPrice(subType) };
        }
        return { ...s, testSubType: subType };
      });

      if (target.testTypeCode === "SOIL_CBR" && subType === "ASTM_D1883") {
        const proctorTt = findTestTypeByCode("SOIL_PROCTOR");
        const proctorIdx = next.findIndex(s => s.testTypeCode === "SOIL_PROCTOR");
        if (proctorTt) {
          if (proctorIdx >= 0) {
            next = next.map((s, i) => i === proctorIdx
              ? { ...s, testSubType: "MODIFIED_PROCTOR", unitPrice: SOIL_PROCTOR_UNIT_PRICE }
              : s);
          } else {
            next = [...next, makeProctorDependency(proctorTt, "MODIFIED_PROCTOR")];
          }
        }
      }

      return syncCbrFromProctor(next);
    });
    setSubtypeFor(null);
  };

  const setTestQuantity = (testTypeId: number, qty: number) => {
    setSelectedTests(prev => prev.map(s =>
      s.testTypeId === testTypeId ? { ...s, quantity: qty } : s
    ));
  };

  const renderTestSelectionCard = (tt: any) => {
    const isSelected = selectedTests.some(s => s.testTypeId === tt.id);
    const selectedItem = selectedTests.find(s => s.testTypeId === tt.id);
    const subTypes = SUBTYPES_BY_CODE[tt.code] ?? [];
    const isCasting = CASTING_DATE_TESTS.includes(tt.code);
    const catalogLang = lang === "ar" ? "ar" : "en";
    const hasHotBinAddons =
      isSelected &&
      tt.code === HOT_BIN_REQUIRED_CODE &&
      allTests.some(
        (at: any) => HOT_BIN_OPTIONAL_CODES.includes(at.code ?? "") && at.isActive,
      );
    const fullWidth =
      isSelected &&
      (MULTI_SUBTYPE_TESTS.includes(tt.code) ||
        (subTypes.length > 0 && !isCasting && !MULTI_SUBTYPE_TESTS.includes(tt.code)) ||
        hasHotBinAddons ||
        !!getSteelDeferredSubtypeOrderHint(tt.code, lang));

    return (
      <TestSelectionCard key={tt.id} selected={isSelected} fullWidth={fullWidth}>
        <TestSelectionRow
          id={`test-${tt.id}`}
          checked={isSelected}
          onCheckedChange={() => toggleTest(tt)}
          name={testDisplayName(tt.code, tt.nameEn, tt.nameAr)}
          code={tt.code}
          compact={!fullWidth}
          trailing={
            <>
              {isSelected && !MULTI_SUBTYPE_TESTS.includes(tt.code) && (
                <div className="flex items-center gap-1">
                  {(selectedItem?.quantity ?? 0) < minQtyForTest(tt.code) && (
                    <span className="inline-flex items-center gap-0.5 rounded border border-amber-200 bg-amber-50 px-1 py-0.5 text-[10px] text-amber-700 whitespace-nowrap">
                      <AlertTriangle className="h-3 w-3" />
                      {lang === "ar"
                        ? `الحد الأدنى ${minQtyForTest(tt.code)}`
                        : `Min ${minQtyForTest(tt.code)}`}
                    </span>
                  )}
                  <TestQtyInput
                    type="number"
                    min={minQtyForTest(tt.code)}
                    max={maxQtyForTest(tt.code)}
                    value={selectedItem?.quantity ? selectedItem.quantity : ""}
                    placeholder="—"
                    warning={(selectedItem?.quantity ?? 0) < minQtyForTest(tt.code)}
                    onFocus={e => e.currentTarget.select()}
                    onChange={e => setTestQuantity(tt.id, parseInt(e.target.value, 10) || 0)}
                    onClick={e => e.stopPropagation()}
                  />
                </div>
              )}
              <TestPriceBadge
                lang={catalogLang}
                amount={isSelected && selectedItem ? selectedItem.unitPrice : tt.unitPrice}
              />
            </>
          }
        />
        <TestDetailIndent>{renderTestDependencyHint(tt.code, selectedItem)}</TestDetailIndent>
        {isSelected && getSteelDeferredSubtypeOrderHint(tt.code, lang) && (
          <p className="mt-1.5 ms-7 text-xs text-muted-foreground">
            {getSteelDeferredSubtypeOrderHint(tt.code, lang)}
          </p>
        )}
        {isSelected && MULTI_SUBTYPE_TESTS.includes(tt.code) && (
          <div className="mt-1.5 ms-7 space-y-1">
            <p className="text-xs text-muted-foreground font-medium">
              {tt.code === "CONC_BLOCK"
                ? (lang === "ar" ? "حدد أنواع البلوكات والكميات:" : "Select block types and quantities:")
                : (lang === "ar" ? "حدد الأنواع والكميات:" : "Select types and quantities:")}
            </p>
            {(SUBTYPES_BY_CODE[tt.code] ?? []).map(st => {
              const isSubSelected = (multiSubtypes[tt.id] ?? {})[st.value] !== undefined;
              const qty = (multiSubtypes[tt.id] ?? {})[st.value] ?? 0;
              return (
                <TestNestedRow key={st.value} selected={isSubSelected}>
                  <Checkbox
                    id={`block-${tt.id}-${st.value}`}
                    checked={isSubSelected}
                    onCheckedChange={() => toggleBlockSubtype(tt.id, st.value, tt.testTypeName, tt.code, tt.formTemplate, parseFloat(tt.unitPrice ?? "0"))}
                  />
                  <label htmlFor={`block-${tt.id}-${st.value}`} className="flex-1 text-xs font-medium cursor-pointer">
                    {lang === "ar" ? st.labelAr : st.labelEn}
                  </label>
                  {isSubSelected && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">{lang === "ar" ? "عدد:" : "Qty:"}</span>
                      <TestQtyInput
                        type="number" min={0} max={999}
                        value={qty ? qty : ""}
                        placeholder="—"
                        warning={
                          tt.code === "CONC_BLOCK"
                            ? !qty || qty < MIN_CONC_BLOCK_COUNT
                            : qty === 0
                        }
                        onFocus={e => e.currentTarget.select()}
                        onChange={e => setBlockSubtypeQty(tt.id, st.value, parseInt(e.target.value) || 0)}
                        className="h-6 w-16"
                      />
                      {tt.code === "CONC_BLOCK" && isSubSelected && (!qty || qty < MIN_CONC_BLOCK_COUNT) && (
                        <span className="text-xs text-red-500 font-medium">
                          {lang === "ar" ? `الحد الأدنى ${MIN_CONC_BLOCK_COUNT}` : `Min. ${MIN_CONC_BLOCK_COUNT}`}
                        </span>
                      )}
                    </div>
                  )}
                </TestNestedRow>
              );
            })}
          </div>
        )}
        {isSelected && subTypes.length > 0 && !isCasting && !MULTI_SUBTYPE_TESTS.includes(tt.code) && (
          <div className="mt-1.5 ms-7">
            {subtypeFor === tt.id ? (
              <div className="flex flex-wrap gap-1.5">
                {subTypes.map(st => (
                  <button key={st.value} type="button"
                    onClick={() => setTestSubtype(tt.id, st.value)}
                    className="px-2.5 py-1 text-xs rounded-md border bg-background hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors">
                    {lang === "ar" ? st.labelAr : st.labelEn}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {selectedItem?.testSubType
                    ? (subTypes.find(s => s.value === selectedItem.testSubType)?.[lang === "ar" ? "labelAr" : "labelEn"] ?? selectedItem.testSubType)
                    : (lang === "ar" ? "لم يُحدد النوع الفرعي" : "No subtype selected")}
                </span>
                <button type="button" onClick={() => setSubtypeFor(tt.id)}
                  className="text-xs text-primary underline">
                  {lang === "ar" ? "تغيير" : "Change"}
                </button>
              </div>
            )}
          </div>
        )}
        {isSelected && tt.code === HOT_BIN_REQUIRED_CODE && (() => {
          const addonTests = allTests.filter(at => HOT_BIN_OPTIONAL_CODES.includes(at.code ?? "") && at.isActive);
          if (addonTests.length === 0) return null;
          return (
            <div className="mt-1.5 ms-7 space-y-1">
              <p className="text-xs text-muted-foreground font-medium">
                {lang === "ar" ? "اختبارات إضافية (اختيارية)" : "Optional Add-on Tests"}
              </p>
              {addonTests.map((at: any) => {
                const isAddonSelected = !!hotBinAddons[at.code];
                const addonQty = selectedTests.find(s => s.testTypeId === at.id)?.quantity ?? 0;
                return (
                  <TestNestedRow key={at.id} selected={isAddonSelected}>
                    <Checkbox
                      id={`addon-${at.id}`}
                      checked={isAddonSelected}
                      onCheckedChange={(checked) => {
                        const enabled = !!checked;
                        setHotBinAddons(prev => ({ ...prev, [at.code]: enabled }));
                        if (enabled) {
                          const addonTest: SelectedTest = {
                            testTypeId: at.id,
                            testTypeCode: at.code,
                            testTypeName: testDisplayName(at.code, at.nameEn, at.nameAr),
                            formTemplate: at.formTemplate ?? undefined,
                            testSubType: undefined,
                            quantity: 0,
                            unitPrice: parseFloat(at.unitPrice ?? "0"),
                          };
                          setSelectedTests(prev => [...prev.filter(s => s.testTypeId !== at.id), addonTest]);
                        } else {
                          setSelectedTests(prev => prev.filter(s => s.testTypeId !== at.id));
                        }
                      }}
                    />
                    <label htmlFor={`addon-${at.id}`} className="flex-1 min-w-0 cursor-pointer">
                      <TestNameBlock
                        name={testDisplayName(at.code, at.nameEn, at.nameAr)}
                        code={at.code}
                        nameClassName="text-xs"
                      />
                    </label>
                    {isAddonSelected && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="w-6 h-6 rounded border border-border flex items-center justify-center text-sm hover:bg-muted"
                          onClick={() => {
                            const newQty = Math.max(0, addonQty - 1);
                            setSelectedTests(prev => prev.map(s => s.testTypeId === at.id ? { ...s, quantity: newQty } : s));
                          }}
                        >−</button>
                        <span className={`w-6 text-center text-xs font-mono tabular-nums ${addonQty === 0 ? "text-amber-600 font-bold" : ""}`}>{addonQty}</span>
                        <button
                          type="button"
                          className="w-6 h-6 rounded border border-border flex items-center justify-center text-sm hover:bg-muted"
                          onClick={() => {
                            setSelectedTests(prev => prev.map(s => s.testTypeId === at.id ? { ...s, quantity: addonQty + 1 } : s));
                          }}
                        >+</button>
                      </div>
                    )}
                    <TestPriceBadge lang={catalogLang} amount={at.unitPrice} />
                  </TestNestedRow>
                );
              })}
            </div>
          );
        })()}
      </TestSelectionCard>
    );
  };

  const isCastingRequired = selectedTests.some(t => CASTING_DATE_TESTS.includes(t.testTypeCode));
  const isConcCore = selectedTests.some(t => t.testTypeCode === "CONC_CORE");
  const contractSelected = !!form.contractId;
  const hasSelectedTests = selectedTests.length > 0;
  const getSelectedGroups = () => {
    const groups = new Set<string>();
    selectedTests.forEach(t => {
      if (["ASPH_HOTBIN"].includes(t.testTypeCode)) groups.add("hot_bin");
      if (ASPHALT_MIX_TEST_CODES.includes(t.testTypeCode)) groups.add("mix");
      if (["ASPH_CORE"].includes(t.testTypeCode)) groups.add("core");
    });
    return groups;
  };
  const selectedGroups = getSelectedGroups();
  const hasMultipleGroups = selectedGroups.size > 1;
  const hasMixTests = selectedTests.some(t => ASPHALT_MIX_TEST_CODES.includes(t.testTypeCode));

  /** Multi-subtype: at least one subtype qty > 0 (blocks: min 10 each); others: qty >= min (3 for cubes, 1 otherwise). */
  const hasInvalidQtyTests = selectedTests.some(t => {
    if (MULTI_SUBTYPE_TESTS.includes(t.testTypeCode) && t.testSubType === "__multi__") {
      const map = multiSubtypes[t.testTypeId] ?? {};
      const vals = Object.values(map);
      if (vals.length === 0) return true;
      if (t.testTypeCode === "CONC_BLOCK") {
        return vals.some(q => !q || q < MIN_CONC_BLOCK_COUNT);
      }
      return vals.some(q => !q);
    }
    return (t.quantity ?? 0) < minQtyForTest(t.testTypeCode);
  });

  const hasConcCubeTest = useMemo(
    () => selectedTests.some((t) => t.testTypeCode === "CONC_CUBE"),
    [selectedTests],
  );
  const missingConcCubeSize = hasConcCubeTest && !isValidNominalCubeSize(nominalCubeSize);

  useEffect(() => {
    if (!hasConcCubeTest) {
      setNominalCubeSize("");
      return;
    }
    concCubePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [hasConcCubeTest]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.contractId) {
      toast.error(lang === "ar" ? "يرجى اختيار عقد" : "Please select a contract");
      return;
    }
    if (!form.sectorKey) {
      toast.error(lang === "ar" ? "يرجى اختيار القطاع" : "Please select a sector");
      return;
    }
    if (!form.sampleType) {
      toast.error(lang === "ar" ? "يرجى اختيار فئة الاختبار" : "Please select a test category");
      return;
    }
    if (selectedTests.length === 0) {
      toast.error(lang === "ar" ? "يرجى اختيار اختبار واحد على الأقل" : "Please select at least one test");
      return;
    }
    if (hasInvalidQtyTests) {
      toast.error(
        lang === "ar"
          ? `يجب أن تكون كمية كل اختبار صالحة (بلوكات: ${MIN_CONC_BLOCK_COUNT} على الأقل، مكعبات: ${MIN_CONC_CUBE_COUNT} على الأقل، غير ذلك: 1 على الأقل)`
          : `Each selected test needs a valid quantity (blocks: min ${MIN_CONC_BLOCK_COUNT}, cubes: min ${MIN_CONC_CUBE_COUNT}, others: min 1)`,
      );
      return;
    }
    if (missingConcCubeSize) {
      toast.error(
        lang === "ar" ? "يرجى اختيار الحجم الاسمي للمكعب" : "Please select the nominal cube size",
      );
      concCubePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (hasMultipleGroups) {
      const confirmed = window.confirm(
        lang === "ar"
          ? "لقد اخترت اختبارات من مجموعات مختلفة. هل أنت متأكد من المتابعة؟"
          : "You've selected tests from different groups. Are you sure you want to continue?",
      );
      if (!confirmed) return;
    }
    // Validate asphalt mix course selection
    if (form.sampleType === "asphalt" && hasMixTests && !asphaltMixCourse) {
      toast.error(lang === "ar" ? "يرجى اختيار نوع طبقة الأسفلت (Wearing / Binder / Base Course)" : "Please select the Asphalt Mix Course (Wearing / Binder / Base Course)");
      return;
    }
    if (isCastingRequired && !form.castingDate) {
      toast.error(lang === "ar" ? "يرجى إدخال تاريخ الصب" : "Please enter casting date");
      return;
    }
    const hasFoamOrder = selectedTests.some(t => t.testTypeCode === "CONC_FOAM");
    if (hasFoamOrder) {
      const ageN = parseInt(foamConcreteAge, 10);
      if (!foamConcreteAge.trim() || !Number.isFinite(ageN) || ageN < 1 || ageN > 999) {
        toast.error(
          lang === "ar" ? "أدخل عمر الخرسانة بالأيام (1–999) لاختبار الرغوة" : "Enter concrete age in days (1–999) for foamed concrete",
        );
        return;
      }
    }
    const cubeItem = selectedTests.find(t => t.testTypeCode === "CONC_CUBE");
    const hasCubeOrder = !!cubeItem;
    const cubePlan = hasCubeOrder
      ? buildConcCubePlanFromNominalSize(nominalCubeSize, cubeItem.quantity)
      : null;
    if (hasCubeOrder) {
      const cubeErr = validateConcCubeReceptionPlan(cubePlan, lang);
      if (cubeErr) {
        toast.error(cubeErr);
        return;
      }
    }
    const soilErr = validateSoilTestOrder(selectedTests, lang);
    if (soilErr) {
      toast.error(soilErr);
      return;
    }
    // Convert castingDate (Date object) to ISO string yyyy-mm-dd
    let castingDateISO: string | undefined = undefined;
    if (form.castingDate) {
      if (form.castingDate > new Date()) {
        toast.error(lang === "ar" ? "تاريخ الصب لا يمكن أن يكون في المستقبل" : "Casting date cannot be in the future");
        return;
      }
      castingDateISO = format(form.castingDate, "yyyy-MM-dd");
    }

    // Build final tests array: expand multi-subtype tests into separate items
    const finalTests: SelectedTest[] = [];
    for (const t of selectedTests) {
      if (MULTI_SUBTYPE_TESTS.includes(t.testTypeCode) && t.testSubType === "__multi__") {
        const subtypeMap = multiSubtypes[t.testTypeId] ?? {};
        const entries = Object.entries(subtypeMap).filter(([, qty]) => qty > 0);
        if (entries.length === 0) {
          // Build a descriptive error message specific to the test type
          const testLabel = t.testTypeName;
          toast.error(
            lang === "ar"
              ? `يرجى تحديد نوع فرعي واحد على الأقل لـ: ${testLabel}`
              : `Please select at least one sub-type for: ${testLabel}`
          );
          return;
        }
        for (const [subtypeValue, qty] of entries) {
          if (t.testTypeCode === "CONC_BLOCK" && qty < MIN_CONC_BLOCK_COUNT) {
            toast.error(
              lang === "ar"
                ? `الحد الأدنى ${MIN_CONC_BLOCK_COUNT} بلوكات لكل نوع`
                : `Minimum ${MIN_CONC_BLOCK_COUNT} blocks required per block type`,
            );
            return;
          }
          const subLabel = SUBTYPES_BY_CODE[t.testTypeCode]?.find(s => s.value === subtypeValue);
          finalTests.push({
            ...t,
            testSubType: subtypeValue,
            testTypeName: subLabel ? (lang === "ar" ? `${t.testTypeName} - ${subLabel.labelAr}` : `${t.testTypeName} - ${subLabel.labelEn}`) : t.testTypeName,
            quantity: qty,
          });
        }
      } else {
        finalTests.push(t);
      }
    }

    createOrder.mutate({
      contractId: form.contractId ? Number(form.contractId) : undefined,
      contractNumber: form.contractNumber || undefined,
      contractName: form.contractName || undefined,
      contractorName: form.contractorName || undefined,
      sampleType: form.sampleType,
      sector: form.sectorKey,
      sectorNameAr: form.sectorNameAr || undefined,
      sectorNameEn: form.sectorNameEn || undefined,
      condition: form.condition,
      notes: [
        supplier ? `__SUPPLIER__:${supplier.trim()}` : "",
        curingDate ? `__CURING_DATE__:${format(curingDate, "yyyy-MM-dd")}` : "",
        aggregateType.trim() ? `__AGGREGATE_TYPE__:${aggregateType.trim()}` : "",
        form.notes || "",
      ].filter(Boolean).join("\n") || undefined,
      location: form.location || undefined,
      referenceNo: form.referenceNo?.trim() || undefined,
      castingDate: castingDateISO || undefined,
      priority: form.priority,
      nominalCubeSize: finalTests.some(t => t.testTypeCode === "CONC_CUBE") ? nominalCubeSize : undefined,
      tests: finalTests.map(t => {
        if (t.testTypeCode === "CONC_CUBE" && cubePlan) {
          return {
            testTypeId: t.testTypeId,
            testTypeCode: t.testTypeCode,
            testTypeName: t.testTypeName,
            formTemplate: t.formTemplate,
            testSubType: serializeConcCubePlan(cubePlan),
            quantity: cubePlan.cubeCount,
            unitPrice: t.unitPrice,
          };
        }
        return {
          testTypeId: t.testTypeId,
          testTypeCode: t.testTypeCode,
          testTypeName: t.testTypeName,
          formTemplate: t.formTemplate,
          testSubType: t.testSubType,
          quantity: t.quantity,
          unitPrice: t.unitPrice,
          ...(t.testTypeCode === "CONC_FOAM" ? { metadata: { concreteAge: foamConcreteAge.trim() } } : {}),
        };
      }),
    });
  };

  const filteredOrders = orders?.filter((o: any) => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (o.orderCode ?? "").toLowerCase().includes(q) ||
      (o.sampleCode ?? "").toLowerCase().includes(q) ||
      (o.contractorName ?? "").toLowerCase().includes(q) ||
      (o.contractNumber ?? "").toLowerCase().includes(q) ||
      (o.referenceNo ?? "").toLowerCase().includes(q);
    const rq = refSearch.trim().toLowerCase();
    const matchRef = !rq || (o.referenceNo ?? "").toLowerCase().includes(rq);
    const matchSector = sectorFilter === "all" || (o as any).sector === sectorFilter;
    const matchType = sampleTypeFilter === "all" || o.sampleType === sampleTypeFilter;
    return matchSearch && matchRef && matchSector && matchType;
  }) ?? [];

  const typeLabel = (type: string) => {
    const cat = CATEGORIES.find(c => c.value === type);
    if (cat) return lang === "ar" ? cat.labelAr : cat.labelEn;
    return type;
  };

  const totalPrice = selectedTests.reduce((sum, t) => {
    if (MULTI_SUBTYPE_TESTS.includes(t.testTypeCode) && t.testSubType === "__multi__") {
      const subtypeMap = multiSubtypes[t.testTypeId] ?? {};
      const subtypeTotal = Object.values(subtypeMap).reduce((s, qty) => s + (qty > 0 ? t.unitPrice * qty : 0), 0);
      return sum + subtypeTotal;
    }
    return sum + t.unitPrice * t.quantity;
  }, 0);

  const sampleLookupResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !orders?.length) return [];
    const seen = new Set<number>();
    return orders
      .filter((o: any) =>
        o.sampleId &&
        (
          (o.sampleCode ?? "").toLowerCase().includes(q) ||
          (o.contractorName ?? "").toLowerCase().includes(q) ||
          (o.contractNumber ?? "").toLowerCase().includes(q) ||
          (o.orderCode ?? "").toLowerCase().includes(q)
        )
      )
      .filter((o: any) => {
        if (seen.has(o.sampleId)) return false;
        seen.add(o.sampleId);
        return true;
      })
      .slice(0, 5);
  }, [orders, search]);

  const receptionTabTriggerClass =
    "group flex-1 min-w-0 rounded-lg border border-transparent px-4 py-3 text-sm font-semibold transition-all " +
    "text-muted-foreground hover:text-foreground hover:bg-white/60 " +
    "data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm " +
    "data-[state=active]:border-slate-200 data-[state=active]:ring-1 data-[state=active]:ring-primary/20 " +
    "data-[state=active]:[&_svg]:text-primary";

  return (
    <DashboardLayout>
      <div className="space-y-5" dir={dir}>
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("reception.title")}</h1>
            <p className="text-base text-muted-foreground mt-0.5">{t("reception.subtitle")}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => openTestCatalogPrint()}
            className="h-11 gap-2.5 rounded-xl border-2 border-blue-200 bg-blue-50 px-5 text-blue-900 shadow-sm hover:border-blue-300 hover:bg-blue-100"
          >
            <ClipboardList className="h-5 w-5 shrink-0 text-blue-700" />
            <span className="text-sm font-semibold sm:text-base">
              {lang === "ar" ? "قائمة أسعار الاختبارات" : "Tests price list"}
            </span>
            <Printer className="h-4 w-4 shrink-0 text-blue-600/80" />
          </Button>
        </div>

        <Tabs defaultValue="register" className="w-full">
          <TabsList className="w-full h-auto p-1.5 bg-slate-100 border border-slate-200 rounded-xl flex gap-1">
            <TabsTrigger value="register" className={receptionTabTriggerClass}>
              <CheckSquare className="w-4 h-4 me-2 shrink-0" />
              <span className="truncate">{lang === "ar" ? "تسجيل عينة" : "Register sample"}</span>
            </TabsTrigger>
            <TabsTrigger value="history" className={receptionTabTriggerClass}>
              <ClipboardList className="w-4 h-4 me-2 shrink-0" />
              <span className="truncate">{lang === "ar" ? "سجل الأوردرات" : "Order history"}</span>
              <span className="ms-2 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 px-1.5 text-[10px] font-bold text-slate-700 group-data-[state=active]:bg-primary/15 group-data-[state=active]:text-primary">
                {orders?.length ?? 0}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="register" className="mt-4 space-y-5">
            {/* Registration mode — first decision on this tab */}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">
                {lang === "ar" ? "نوع التسجيل" : "Registration type"}
                <span className="text-red-500 ms-1">*</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {lang === "ar"
                  ? "اختر ما إذا كنت تسجّل عينة جديدة لأول مرة، أو طلب إعادة اختبار مرتبط بعينة سابقة."
                  : "Choose whether this is a brand-new sample or a retest linked to a previous sample."}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([
                  {
                    id: "new" as const,
                    icon: PackagePlus,
                    titleAr: "عينة جديدة",
                    titleEn: "New sample",
                    descAr: "تسجيل عينة لأول مرة — اختر المادة والاختبارات كالمعتاد.",
                    descEn: "First-time registration — pick material, tests, and print the receipt.",
                  },
                  {
                    id: "retest" as const,
                    icon: RotateCcw,
                    titleAr: "إعادة اختبار",
                    titleEn: "Retest",
                    descAr: "عينة جديدة مرتبطة بعينة سابقة (فشل، شك، أو طلب المقاول).",
                    descEn: "New order tied to a prior sample (failed result, doubt, or contractor request).",
                  },
                ]).map(({ id, icon: Icon, titleAr, titleEn, descAr, descEn }) => {
                  const active = receptionMode === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setReceptionMode(id)}
                      aria-pressed={active}
                      className={cn(
                        "relative flex items-start gap-3 rounded-xl border-2 p-4 text-start transition-all",
                        active
                          ? "border-primary bg-primary/5 shadow-sm ring-2 ring-primary/20"
                          : "border-slate-200 bg-white hover:border-primary/40 hover:bg-slate-50/80"
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                          active ? "bg-primary text-primary-foreground" : "bg-slate-100 text-slate-600"
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-[15px]">{lang === "ar" ? titleAr : titleEn}</span>
                          {active && (
                            <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px] px-1.5 py-0">
                              {lang === "ar" ? "محدّد" : "Selected"}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {lang === "ar" ? descAr : descEn}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Search — sample lookup (new registration only) */}
            {receptionMode === "new" && (
            <>
            <div className="relative">
              <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted-foreground" />
              <Input
                placeholder={t("reception.searchPlaceholder")}
                className="ps-10 h-11 text-base"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {search.trim() && sampleLookupResults.length > 0 && (
              <div className="rounded-lg border bg-muted/20 divide-y text-sm">
                {sampleLookupResults.map((order: any) => (
                  <div key={order.sampleId} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <span className="font-mono font-semibold text-primary">{order.sampleCode}</span>
                      <span className="text-muted-foreground text-xs ms-2">{order.contractorName}</span>
                      <RetestBadge
                        retestNumber={order.retestNumber}
                        originalSampleId={order.originalSampleId}
                        originalSampleCode={order.originalSampleCode}
                        retestReason={order.retestReason}
                        compact
                      />
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => window.open(`/print-receipt/${order.sampleId}?lang=${lang}`, "_blank")}>
                        <Printer className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </>
            )}

        {receptionMode === "retest" ? (
          <Card className="border-amber-200/80 bg-gradient-to-br from-amber-50/40 to-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-amber-700" />
                {lang === "ar" ? "تسجيل إعادة اختبار" : "Register a retest"}
              </CardTitle>
              <p className="text-xs text-muted-foreground font-normal">
                {lang === "ar"
                  ? "ابحث عن العينة الأصلية، اختر الاختبارات المراد إعادتها، ثم سجّل الطلب."
                  : "Find the original sample, pick which tests to repeat, then register the new order."}
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              <ReceptionRetestPanel
                onSuccess={() => { setReceptionMode("new"); refetch(); }}
                onCancel={() => setReceptionMode("new")}
              />
            </CardContent>
          </Card>
        ) : (
          <form onSubmit={handleSubmit}>
            <Card>
              <CardContent className="p-0">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] divide-y lg:divide-y-0 lg:divide-x min-h-0">
                  <div className="p-6 lg:p-7 space-y-7 min-w-0">
                    {/* Step 1 — Contract */}
                    <FormSection
                      step={1}
                      title={lang === "ar" ? "العقد" : "Contract"}
                      subtitle={
                        lang === "ar"
                          ? "اختر رقم العقد — يُعبّأ المقاول تلقائياً"
                          : "Select the contract — contractor fills in automatically"
                      }
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2 sm:col-span-2">
                          <Label className="text-[15px]">{t("tests.contractNumber")} <span className="text-red-500">*</span></Label>
                          {contracts.length > 0 ? (
                            <Select value={form.contractId} onValueChange={handleContractChange}>
                              <SelectTrigger className="h-10 text-base">
                                <SelectValue placeholder={lang === "ar" ? "اختر العقد..." : "Select contract..."} />
                              </SelectTrigger>
                              <SelectContent className="max-h-60">
                                {contracts.map((c: any) => (
                                  <SelectItem key={c.id} value={String(c.id)}>
                                    <span className="font-mono text-sm font-semibold">{c.contractNumber}</span>
                                    <span className="text-muted-foreground text-sm ms-2 truncate">{c.contractName}</span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <p className="text-sm text-amber-700">{lang === "ar" ? "لا توجد عقود." : "No contracts."}</p>
                          )}
                        </div>
                        {form.contractId && (
                          <>
                            <div className="space-y-2">
                              <Label className="text-[15px]">{t("reception.contractorName")}</Label>
                              <Input readOnly value={form.contractorName || "—"} className="bg-muted/30 h-10 text-base" />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[15px]">{t("reception.contractName")}</Label>
                              <Input readOnly value={form.contractName || "—"} className="bg-muted/30 h-10 text-base" />
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                              <Label className="text-[15px]">{lang === "ar" ? "القطاع" : "Sector"} <span className="text-red-500">*</span></Label>
                              <Select value={form.sectorKey} onValueChange={handleSectorChange}>
                                <SelectTrigger className="h-10 text-base"><SelectValue placeholder={lang === "ar" ? "اختر..." : "Select..."} /></SelectTrigger>
                                <SelectContent>
                                  {sectors.filter((s: any) => s.isActive).map((s: any) => (
                                    <SelectItem key={s.sectorKey} value={s.sectorKey}>{lang === "ar" ? s.nameAr : s.nameEn}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </>
                        )}
                      </div>
                    </FormSection>

                    {/* Step 2 — Contractor form scan */}
                    <FormSection
                      step={2}
                      title={lang === "ar" ? "نموذج المقاول" : "Contractor form"}
                      subtitle={
                        lang === "ar"
                          ? "ارفع مسح نموذج المقاول (اختياري)"
                          : "Upload the contractor form scan (optional)"
                      }
                      className="border-t pt-6"
                    >
                      {!contractSelected ? (
                        <p className="text-sm text-muted-foreground rounded-lg border border-dashed px-4 py-3">
                          {lang === "ar" ? "اختر العقد أولاً" : "Select a contract first"}
                        </p>
                      ) : (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label className="text-[15px]">
                              {t("reception.referenceNo")}
                              <span className="text-muted-foreground text-xs font-normal ms-1">
                                ({lang === "ar" ? "اختياري" : "optional"})
                              </span>
                            </Label>
                            <Input
                              className="h-10 text-base"
                              placeholder={lang === "ar" ? "مرجع المقاول / RFQ / MTS..." : "Contractor ref., RFQ, MTS..."}
                              value={form.referenceNo}
                              onChange={(e) => setForm({ ...form, referenceNo: e.target.value.replace(/\s/g, "") })}
                            />
                          </div>
                          <ReceptionContractorFormUpload
                            file={contractorFormFile}
                            onFileChange={setContractorFormFile}
                            lang={lang}
                            disabled={createOrder.isPending || uploadAttachment.isPending}
                          />
                        </div>
                      )}
                    </FormSection>

                    {/* Step 3 — Choose tests */}
                    <FormSection
                      step={3}
                      title={lang === "ar" ? "اختيار الاختبار" : "Choose test"}
                      subtitle={
                        lang === "ar"
                          ? "اختر نوع المادة ثم الاختبار/الاختبارات المطلوبة"
                          : "Pick material type, then select the required test(s)"
                      }
                      className="border-t pt-6"
                    >
                      {!contractSelected ? (
                        <p className="text-sm text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center">
                          {lang === "ar" ? "اختر العقد أولاً لعرض الاختبارات" : "Select a contract first to choose tests"}
                        </p>
                      ) : (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-[15px]">{lang === "ar" ? "نوع المادة" : "Material"} <span className="text-red-500">*</span></Label>
                          <div className="flex flex-wrap gap-2">
                            {CATEGORIES.map(cat => (
                              <button
                                key={cat.value}
                                type="button"
                                onClick={() => {
                                  setForm(f => ({ ...f, sampleType: cat.value }));
                                  setSelectedTests([]);
                                  setSubtypeFor(null);
                                  setAsphaltKind("");
                                }}
                                className={cn(
                                  "px-4 py-2 rounded-lg text-sm font-medium border transition-colors",
                                  form.sampleType === cat.value
                                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                    : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                                )}
                              >
                                {lang === "ar" ? cat.labelAr : cat.labelEn}
                              </button>
                            ))}
                          </div>
                        </div>

                {form.sampleType && (
                  <TestSelectionPanel
                    hint={lang === "ar" ? "مرّر القائمة لاختيار الاختبارات" : "Scroll the list to choose tests"}
                    selectedCount={selectedTests.length}
                    selectedLabel={lang === "ar" ? "محدد" : "selected"}
                  >
                {form.sampleType === "asphalt" && (
                  <div className="space-y-4">
                    <TestSectionLabel
                      icon={<CheckSquare className="w-4 h-4 text-primary" />}
                      required
                    >
                      {lang === "ar" ? "اختبارات الأسفلت المطلوبة" : "Required Asphalt Tests"}
                    </TestSectionLabel>

                    {ASPHALT_TEST_GROUPS.map(group => {
                      const groupTests = allTests.filter((test: any) => test.isActive && (group.tests as readonly string[]).includes(test.code ?? ""));

                      return (
                        <div key={group.id} className="space-y-2">
                          <TestGroupHeading label={lang === "ar" ? group.label.ar : group.label.en} />
                          {groupTests.length === 0 ? (
                            <TestListEmpty>
                              {lang === "ar" ? "لا توجد اختبارات نشطة في هذه المجموعة." : "No active tests in this group."}
                            </TestListEmpty>
                          ) : (
                            <TestSelectionGrid>
                              {groupTests.map((test: any) => renderTestSelectionCard(test))}
                            </TestSelectionGrid>
                          )}
                        </div>
                      );
                    })}

                    {hasMultipleGroups && (
                      <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="font-semibold text-amber-900 mb-2">
                              {lang === "ar" ? "⚠️ تحذير: اختبارات غير متوافقة" : "⚠️ Warning: Incompatible Tests Selected"}
                            </p>
                            <p className="text-sm text-amber-800 mb-3">
                              {lang === "ar"
                                ? "اخترت اختبارات من مجموعات مختلفة. هذه الاختبارات تتطلب عينات مختلفة:"
                                : "You've selected tests from different groups. These tests require different sample types:"}
                            </p>
                            <ul className="text-xs text-amber-700 space-y-1 mb-3">
                              {selectedGroups.has("hot_bin") && <li>• {lang === "ar" ? "صندوق ساخن = ركام غير مرتبط" : "Hot Bin = Loose aggregates"}</li>}
                              {selectedGroups.has("mix") && <li>• {lang === "ar" ? "خلطة = أسفلت ساخن مخلوط" : "Mix = Fresh hot mix asphalt"}</li>}
                              {selectedGroups.has("core") && <li>• {lang === "ar" ? "لب = رصيف متصلب" : "Core = Hardened pavement"}</li>}
                            </ul>
                            <p className="text-xs text-amber-600 font-semibold">
                              {lang === "ar"
                                ? "💡 يُنصح بإنشاء طلبات منفصلة لكل نوع عينة."
                                : "💡 Recommended: Create separate orders for each sample type."}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {form.sampleType &&
                  form.sampleType !== "asphalt" &&
                  (
                  <div className="space-y-2">
                    <TestSectionLabel
                      icon={<CheckSquare className="w-4 h-4 text-primary" />}
                      required
                    >
                      {lang === "ar" ? "الاختبارات المطلوبة" : "Required Tests"}
                    </TestSectionLabel>
                    <TestSelectionGrid>
                      {filteredTests.length === 0 ? (
                        <TestListEmpty className="col-span-full">
                          <p>
                            {allTests.filter(t => t.isActive).length === 0
                              ? (lang === "ar"
                                  ? "لا توجد أنواع اختبارات في قاعدة البيانات. أضف الأنواع من صفحة إدارة أنواع الاختبارات (مسؤول)."
                                  : "No test types in the database. Ask an admin to add them under Test Types management.")
                              : (lang === "ar"
                                  ? "لا توجد اختبارات مطابقة لهذا التصنيف أو المرشحات الحالية."
                                  : "No tests match this category or current filters.")}
                          </p>
                        </TestListEmpty>
                      ) : filteredTests.map((tt: any) => renderTestSelectionCard(tt))}
                    </TestSelectionGrid>
                  </div>
                )}

                  </TestSelectionPanel>
                )}

                    {!form.sampleType && (
                      <p className="text-base text-muted-foreground text-center py-6">
                        {lang === "ar" ? "اختر نوع المادة لعرض الاختبارات" : "Select a material type to see available tests"}
                      </p>
                    )}
                      </div>
                      )}
                    </FormSection>

                    {/* Step 4 — Reception entry data (test-specific fields) */}
                    <FormSection
                      step={4}
                      title={lang === "ar" ? "بيانات الإدخال" : "Entry data"}
                      subtitle={
                        lang === "ar"
                          ? "أدخل تفاصيل العينة حسب الاختبار/الاختبارات المختارة"
                          : "Enter sample details required for the selected test(s)"
                      }
                      className="border-t pt-6"
                    >
                      {!hasSelectedTests ? (
                        <p className="text-sm text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center">
                          {lang === "ar" ? "اختر اختباراً واحداً على الأقل لإدخال البيانات" : "Select at least one test to enter sample details"}
                        </p>
                      ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2 sm:col-span-2">
                          <Label className="text-[15px]">{lang === "ar" ? "الموقع" : "Location"}</Label>
                          <Input className="h-10 text-base" placeholder={lang === "ar" ? "اختياري" : "Optional"} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label className="text-[15px]">
                            {lang === "ar" ? "المورد / المصدر" : "Source / Supplier"}
                            <span className="text-muted-foreground text-xs font-normal ms-1">({lang === "ar" ? "اختياري" : "optional"})</span>
                          </Label>
                          <Input
                            className="h-10 text-base"
                            placeholder={lang === "ar" ? "مثال: خليج ريدي ميكس" : "e.g. Gulf Readymix"}
                            value={supplier}
                            onChange={(e) => setSupplier(e.target.value)}
                          />
                        </div>
                        {isCastingRequired && (
                          <div className="space-y-2 sm:col-span-2">
                            <Label className="text-[15px]">{lang === "ar" ? "تاريخ الصب" : "Casting date"} <span className="text-red-500">*</span></Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" className={cn("w-full h-10 justify-start font-normal text-base text-start", !form.castingDate && "text-muted-foreground")}>
                                  <CalendarIcon className="me-2 h-4 w-4" />
                                  {form.castingDate ? format(form.castingDate, "dd MMM yyyy") : (lang === "ar" ? "اختر..." : "Pick date")}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar mode="single" selected={form.castingDate} onSelect={(d) => setForm(f => ({ ...f, castingDate: d }))} disabled={(date) => date > new Date()} captionLayout="dropdown" />
                              </PopoverContent>
                            </Popover>
                          </div>
                        )}
                        {isConcCore && (
                          <>
                            <div className="space-y-2 sm:col-span-2">
                              <Label className="text-[15px]">
                                {lang === "ar" ? "تاريخ المعالجة (الكيورينج)" : "Date of Curing"}
                                <span className="text-muted-foreground text-xs font-normal ms-1">({lang === "ar" ? "اختياري" : "optional"})</span>
                              </Label>
                              <div className="flex items-center gap-2">
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button variant="outline" className={cn("flex-1 h-10 justify-start font-normal text-base text-start", !curingDate && "text-muted-foreground")}>
                                      <CalendarIcon className="me-2 h-4 w-4" />
                                      {curingDate ? format(curingDate, "dd MMM yyyy") : (lang === "ar" ? "اختر..." : "Pick date")}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar mode="single" selected={curingDate} onSelect={setCuringDate} captionLayout="dropdown" />
                                  </PopoverContent>
                                </Popover>
                                {curingDate && (
                                  <Button variant="ghost" size="sm" className="h-10 px-2 text-muted-foreground" onClick={() => setCuringDate(undefined)}>
                                    {lang === "ar" ? "مسح" : "Clear"}
                                  </Button>
                                )}
                              </div>
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                              <Label className="text-[15px]">
                                {lang === "ar" ? "نوع الركام" : "Type of Aggregate"}
                                <span className="text-muted-foreground text-xs font-normal ms-1">({lang === "ar" ? "اختياري" : "optional"})</span>
                              </Label>
                              <Input
                                className="h-10 text-base"
                                placeholder={lang === "ar" ? "مثال: حجر جيري، جرانيت..." : "e.g. Limestone, Granite..."}
                                value={aggregateType}
                                onChange={(e) => setAggregateType(e.target.value)}
                              />
                            </div>
                          </>
                        )}
                        {selectedTests.some(t => t.testTypeCode === "CONC_FOAM") && (
                          <div className="space-y-2 sm:col-span-2">
                            <Label className="flex items-center gap-1 text-[15px]">
                              {lang === "ar" ? "عمر الخرسانة (أيام)" : "Age of Concrete (days)"}
                              <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              type="number"
                              min={1}
                              max={999}
                              inputMode="numeric"
                              className="h-10 text-base"
                              value={foamConcreteAge}
                              onChange={(e) => setFoamConcreteAge(e.target.value)}
                              placeholder={lang === "ar" ? "مثال: 28" : "e.g., 28"}
                              required
                            />
                            <p className="text-xs text-muted-foreground">
                              {lang === "ar" ? "المدة من الصب حتى الاختبار" : "Time from casting to testing"}
                            </p>
                          </div>
                        )}
                        {hasMixTests && (
                          <div className="space-y-2 sm:col-span-2">
                            <Label className="text-[15px]">
                              {lang === "ar" ? "نوع طبقة الأسفلت" : "Asphalt Mix Course"} <span className="text-red-500">*</span>
                            </Label>
                            <div className="flex gap-2">
                              {[
                                { value: "wearing_course", labelEn: "Wearing Course", labelAr: "طبقة رابطة" },
                                { value: "base_course", labelEn: "Base Course", labelAr: "طبقة قاعدة" },
                              ].map(course => (
                                <button
                                  key={course.value}
                                  type="button"
                                  onClick={() => {
                                    setAsphaltMixCourse(course.value);
                                    setSelectedTests(prev => prev.map(t =>
                                      ASPHALT_MIX_TEST_CODES.includes(t.testTypeCode)
                                        ? { ...t, testSubType: course.value }
                                        : t,
                                    ));
                                  }}
                                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                                    asphaltMixCourse === course.value
                                      ? "bg-blue-600 text-white border-blue-600"
                                      : "bg-white text-slate-700 border-slate-300 hover:border-blue-400"
                                  }`}
                                >
                                  {lang === "ar" ? course.labelAr : course.labelEn}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {hasConcCubeTest && (
                          <div
                            ref={concCubePanelRef}
                            className={cn(
                              "sm:col-span-2 rounded-lg border p-4",
                              missingConcCubeSize
                                ? "border-amber-400 bg-amber-50/80"
                                : "border-border bg-muted/30",
                            )}
                          >
                            <ReceptionNominalCubeSizePanel
                              lang={lang}
                              variant="default"
                              value={nominalCubeSize}
                              onChange={setNominalCubeSize}
                            />
                          </div>
                        )}
                      </div>
                      )}
                    </FormSection>
                  </div>

                  <aside className="p-6 lg:p-7 bg-muted/20 space-y-5 lg:sticky lg:top-6 lg:z-10 lg:self-start lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">{lang === "ar" ? "رمز العينة" : "Sample code"}</p>
                      <p className="font-mono text-base text-muted-foreground">{lang === "ar" ? "يُولَّد تلقائياً" : "Auto on save"}</p>
                    </div>
                    <div className="space-y-3 text-base border-t pt-4">
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">{lang === "ar" ? "المادة" : "Material"}</span>
                        <span className="font-medium">{form.sampleType ? typeLabel(form.sampleType) : "—"}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">{lang === "ar" ? "الاختبارات" : "Tests"}</span>
                        <span className="font-medium">{selectedTests.length || "—"}</span>
                      </div>
                      <div className="flex justify-between gap-2 pt-3 border-t text-lg font-semibold">
                        <span>{lang === "ar" ? "الإجمالي" : "Total"}</span>
                        <span className="text-primary">{totalPrice > 0 ? `${totalPrice.toFixed(0)} AED` : "—"}</span>
                      </div>
                    </div>
                    {hasInvalidQtyTests && selectedTests.length > 0 && (
                      <p className="text-sm text-amber-700">{lang === "ar" ? "أصلح الكميات أولاً" : "Fix quantities first"}</p>
                    )}
                    {missingConcCubeSize && (
                      <p className="text-sm text-amber-800 font-medium">
                        {lang === "ar"
                          ? "اختر الحجم الاسمي للمكعب في خطوة بيانات الإدخال"
                          : "Select nominal cube size in the entry data step"}
                      </p>
                    )}
                    <Button
                      type="submit"
                      size="lg"
                      className="w-full h-11 text-base font-semibold"
                      disabled={createOrder.isPending || selectedTests.length === 0 || hasInvalidQtyTests || missingConcCubeSize}
                    >
                      {createOrder.isPending
                        ? (lang === "ar" ? "جاري..." : "Saving...")
                        : (lang === "ar" ? "تسجيل وطباعة" : "Register & print")}
                    </Button>
                    <button type="button" className="w-full text-sm text-muted-foreground hover:text-foreground py-1" onClick={resetRegistrationForm}>
                      {lang === "ar" ? "مسح" : "Clear"}
                    </button>
                  </aside>
                </div>
              </CardContent>
            </Card>
          </form>
        )}
          </TabsContent>

          <TabsContent value="history" className="mt-4 space-y-4">
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted-foreground" />
                <Input
                  placeholder={
                    lang === "ar"
                      ? "بحث برقم العينة، العقد، المقاول، أو الأوردر..."
                      : "Search by sample ID, contract, contractor, or order..."
                  }
                  className="ps-10 h-11 text-base"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute end-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="relative w-52 shrink-0">
                <Input
                  placeholder={lang === "ar" ? "رقم المرجع (Ref No.)..." : "Ref No. filter..."}
                  className="h-11 text-base pe-8"
                  value={refSearch}
                  onChange={(e) => setRefSearch(e.target.value.replace(/\s/g, ""))}
                />
                {refSearch && (
                  <button
                    type="button"
                    onClick={() => setRefSearch("")}
                    className="absolute end-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            {refSearch.trim() && (
              <p className="text-xs text-blue-600 -mt-2 ms-1">
                {lang === "ar"
                  ? `تصفية بالمرجع "${refSearch.trim()}" — يمكنك تضييق النتائج بإضافة رقم العقد في خانة البحث الرئيسية`
                  : `Filtering by ref "${refSearch.trim()}" — narrow results further by adding a contract number in the main search`}
              </p>
            )}

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-muted-foreground">{lang === "ar" ? "القطاع:" : "Sector:"}</span>
              <button
                onClick={() => setSectorFilter("all")}
                className={`px-2.5 py-0.5 rounded-full text-xs border ${sectorFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
                {lang === "ar" ? "الكل" : "All"}
              </button>
              {sectors.filter((s: any) => s.isActive).map((sec: any) => (
                <button key={sec.sectorKey}
                  onClick={() => setSectorFilter(sec.sectorKey)}
                  className={`px-2.5 py-0.5 rounded-full text-xs border ${sectorFilter === sec.sectorKey ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
                  {lang === "ar" ? sec.nameAr : sec.nameEn}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-muted-foreground">{lang === "ar" ? "النوع:" : "Type:"}</span>
              <button
                onClick={() => setSampleTypeFilter("all")}
                className={`px-2.5 py-0.5 rounded-full text-xs border ${sampleTypeFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
                {lang === "ar" ? "الكل" : "All"}
              </button>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setSampleTypeFilter(cat.value)}
                  className={`px-2.5 py-0.5 rounded-full text-xs border ${sampleTypeFilter === cat.value ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
                  {lang === "ar" ? cat.labelAr : cat.labelEn}
                </button>
              ))}
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">
                  {lang === "ar" ? "الأوردرات" : "Orders"} ({filteredOrders.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {filteredOrders.length === 0 ? (
                  <div className="p-10 text-center">
                    <Package className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
                    <p className="text-sm text-muted-foreground">
                      {lang === "ar" ? "لا توجد أوردرات" : "No orders found"}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-start px-4 py-2.5 text-xs font-medium text-muted-foreground">{lang === "ar" ? "رمز العينة" : "Sample Code"}</th>
                          <th className="text-start px-4 py-2.5 text-xs font-medium text-muted-foreground">{t("table.contractNo")}</th>
                          <th className="text-start px-4 py-2.5 text-xs font-medium text-muted-foreground">{t("table.contractor")}</th>
                          <th className="text-start px-4 py-2.5 text-xs font-medium text-muted-foreground">{lang === "ar" ? "رقم المرجع" : "Ref No."}</th>
                          <th className="text-start px-4 py-2.5 text-xs font-medium text-muted-foreground">{lang === "ar" ? "نوع العينة" : "Type"}</th>
                          <th className="text-start px-4 py-2.5 text-xs font-medium text-muted-foreground min-w-[12rem]">{lang === "ar" ? "الاختبارات" : "Tests"}</th>
                          <th className="text-start px-4 py-2.5 text-xs font-medium text-muted-foreground">{t("table.receivedAt")}</th>
                          <th className="text-start px-4 py-2.5 text-xs font-medium text-muted-foreground">{t("table.actions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOrders.map((order: any) => (
                          <tr key={order.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-2.5">
                              <div className="font-mono text-sm font-bold text-primary">{order.sampleCode ?? "—"}</div>
                              <RetestBadge
                                retestNumber={order.retestNumber}
                                originalSampleId={order.originalSampleId}
                                originalSampleCode={order.originalSampleCode}
                                retestReason={order.retestReason}
                                compact
                              />
                            </td>
                            <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{order.contractNumber ?? "—"}</td>
                            <td className="px-4 py-2.5 text-xs">{order.contractorName ?? "—"}</td>
                            <td className="px-4 py-2.5 text-xs">
                              {order.referenceNo ? (
                                <span className={`font-mono ${refSearch.trim() && (order.referenceNo ?? "").toLowerCase().includes(refSearch.trim().toLowerCase()) ? "bg-yellow-100 text-yellow-800 px-1 rounded" : "text-muted-foreground"}`}>
                                  {order.referenceNo}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/40">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-xs">{typeLabel(order.sampleType ?? "")}</td>
                            <td className="px-4 py-2.5 text-xs min-w-[12rem]">
                              <TestOrderItemList
                                items={mapOrderItemsToTestList(order.items ?? [])}
                                emptyLabel={lang === "ar" ? "لا توجد" : "None"}
                              />
                            </td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">
                              {new Date(order.createdAt).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-AE")}
                            </td>
                            <td className="px-4 py-2.5">
                              <ReceptionOrderActionsCell
                                order={order}
                                lang={lang}
                                canEditSample={canEditSample}
                                handleEditOrder={handleEditOrder}
                                onDeletionSuccess={() => refetch()}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

      {/* ─── Edit Order Dialog ─────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) setEditingOrder(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{lang === "ar" ? `تعديل العينة ${editingOrder?.sampleCode ?? ""}` : `Edit Sample ${editingOrder?.sampleCode ?? ""}`}</DialogTitle>
          </DialogHeader>
          {editingOrder && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>{lang === "ar" ? "رقم العقد" : "Contract No."}</Label>
                <Input value={editingOrder.contractNumber} readOnly className="bg-muted text-muted-foreground cursor-default" />
              </div>
              <div className="space-y-1.5">
                <Label>{lang === "ar" ? "اسم المقاول" : "Contractor Name"}</Label>
                <Input value={editingOrder.contractorName} onChange={e => setEditingOrder(o => o ? { ...o, contractorName: e.target.value } : o)} />
              </div>
              <div className="space-y-1.5">
                <Label>{lang === "ar" ? "الموقع" : "Location"}</Label>
                <Input value={editingOrder.location} onChange={e => setEditingOrder(o => o ? { ...o, location: e.target.value } : o)} />
              </div>
              <div className="space-y-1.5">
                <Label>{lang === "ar" ? "تاريخ الصب" : "Casting Date"}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={`w-full justify-start text-start font-normal ${!editingOrder.castingDate && "text-muted-foreground"}`}>
                      <CalendarIcon className="me-2 h-4 w-4" />
                      {editingOrder.castingDate ? format(editingOrder.castingDate, "dd/MM/yyyy") : (lang === "ar" ? "اختر تاريخ" : "Select date")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={editingOrder.castingDate}
                      onSelect={(d) => setEditingOrder(o => o ? { ...o, castingDate: d } : o)}
                      disabled={(date) => date > new Date()}
                      captionLayout="dropdown"
                    />
                    {editingOrder.castingDate && (
                      <div className="p-2 border-t">
                        <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setEditingOrder(o => o ? { ...o, castingDate: undefined } : o)}>
                          {lang === "ar" ? "مسح التاريخ" : "Clear date"}
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label>{lang === "ar" ? "ملاحظات" : "Notes"}</Label>
                <Textarea value={editingOrder.notes} onChange={e => setEditingOrder(o => o ? { ...o, notes: e.target.value } : o)} rows={3} />
              </div>
              {/* QTY per test */}
              {editingOrder.items.length > 0 && (
                <div className="space-y-1.5">
                  <Label>{lang === "ar" ? "كمية كل اختبار" : "Test Quantities (QTY)"}</Label>
                  <div className="rounded-lg border divide-y">
                    {editingOrder.items.map((item) => (
                      <TestOrderQtyRow
                        key={item.id}
                        name={item.testTypeName}
                        subLabel={item.testSubType}
                        quantity={item.quantity}
                        onDecrement={() => {
                          const newQty = Math.max(1, item.quantity - 1);
                          setEditingOrder(o => o ? { ...o, items: o.items.map(i => i.id === item.id ? { ...i, quantity: newQty } : i) } : o);
                          updateItemQty.mutate({ itemId: item.id, quantity: newQty });
                        }}
                        onIncrement={() => {
                          const newQty = item.quantity + 1;
                          setEditingOrder(o => o ? { ...o, items: o.items.map(i => i.id === item.id ? { ...i, quantity: newQty } : i) } : o);
                          updateItemQty.mutate({ itemId: item.id, quantity: newQty });
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button className="flex-1" disabled={updateOrder.isPending}
                  onClick={() => updateOrder.mutate({
                    orderId: editingOrder.id,
                    contractorName: editingOrder.contractorName,
                    location: editingOrder.location,
                    notes: editingOrder.notes,
                    castingDate: editingOrder.castingDate ? format(editingOrder.castingDate, "yyyy-MM-dd") : null,
                  })}>
                  {updateOrder.isPending ? (lang === "ar" ? "جاري الحفظ..." : "Saving...") : (lang === "ar" ? "حفظ التعديلات" : "Save Changes")}
                </Button>
                <Button variant="outline" onClick={() => { setEditOpen(false); setEditingOrder(null); }}>
                  {lang === "ar" ? "إلغاء" : "Cancel"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </DashboardLayout>
  );
}
