import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeMoistureKey } from "@/lib/concreteCubeTestConditions";
import { cn } from "@/lib/utils";

export type ConcreteCubeTestConditionsValues = {
  moistureCondition: string;
  labCuringTemperature: string;
  labCuringRh: string;
  loadingRate: string;
  surfaceConditionAtTest: string;
  cappingMethod: string;
};

export const EMPTY_CUBE_TEST_CONDITIONS: ConcreteCubeTestConditionsValues = {
  moistureCondition: "",
  labCuringTemperature: "",
  labCuringRh: "",
  loadingRate: "",
  surfaceConditionAtTest: "",
  cappingMethod: "",
};

export function cubeTestConditionsFromGroup(group: {
  moistureCondition?: string | null;
  labCuringTemperature?: string | null;
  labCuringRh?: string | null;
  loadingRate?: string | null;
  surfaceConditionAtTest?: string | null;
  appearance?: string | null;
  cappingMethod?: string | null;
}): ConcreteCubeTestConditionsValues {
  const rawMoisture = group.moistureCondition?.trim() ?? "";
  return {
    moistureCondition: rawMoisture ? normalizeMoistureKey(rawMoisture) : "",
    labCuringTemperature: group.labCuringTemperature?.trim() ?? "",
    labCuringRh: group.labCuringRh?.trim() ?? "",
    loadingRate: group.loadingRate?.trim() ?? "",
    surfaceConditionAtTest: (group.surfaceConditionAtTest ?? group.appearance)?.trim() ?? "",
    cappingMethod: group.cappingMethod?.trim() ?? "",
  };
}

export function cubeTestConditionsPayload(values: ConcreteCubeTestConditionsValues) {
  return {
    moistureCondition: values.moistureCondition.trim() || undefined,
    labCuringTemperature: values.labCuringTemperature.trim() || undefined,
    labCuringRh: values.labCuringRh.trim() || undefined,
    loadingRate: values.loadingRate.trim() || undefined,
    surfaceConditionAtTest: values.surfaceConditionAtTest.trim() || undefined,
    cappingMethod: values.cappingMethod.trim() || undefined,
  };
}

const selectClass =
  "w-full h-8 text-sm border rounded px-2 bg-white mt-0.5 disabled:opacity-60 disabled:cursor-not-allowed";

type Props = {
  lang: string;
  values: ConcreteCubeTestConditionsValues;
  onChange: (patch: Partial<ConcreteCubeTestConditionsValues>) => void;
  disabled?: boolean;
  onBlur?: () => void;
  className?: string;
  compact?: boolean;
};

export function ConcreteCubeTestConditionsFields({
  lang,
  values,
  onChange,
  disabled,
  onBlur,
  className,
  compact,
}: Props) {
  const ar = lang === "ar";
  const opt = ar ? "(اختياري)" : "(optional)";

  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200 bg-slate-50/80",
        compact ? "p-3" : "p-4 mb-4",
        className,
      )}
    >
      <p className="text-xs font-semibold text-slate-700 mb-1">
        {ar ? "ظروف الاختبار والتحضير" : "Test Conditions & Preparation"}
      </p>
      <p className="text-[11px] text-muted-foreground mb-3">
        {ar
          ? "يملأها الفني — جميع الحقول اختيارية. ما بين قوسين = خيارات أو وحدة القياس."
          : "Filled by technician — all fields optional. Text in brackets = choices or unit."}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="sm:col-span-2 lg:col-span-1">
          <Label className="text-xs leading-snug">
            {ar ? "حالة الرطوبة عند الاختبار" : "Moisture condition at test"}
            <span className="text-muted-foreground font-normal ms-1">
              {ar ? "(مشبع سطحياً جاف / جاف هوائياً / جاف فرنياً / مبلل)" : "(Saturated Surface Dry / Air Dry / Oven Dry / Wet)"}
            </span>
            <span className="text-muted-foreground font-normal ms-1">{opt}</span>
          </Label>
          <select
            className={selectClass}
            value={values.moistureCondition}
            disabled={disabled}
            onChange={e => onChange({ moistureCondition: e.target.value })}
            onBlur={onBlur}
          >
            <option value="">{ar ? "— اختر —" : "— select —"}</option>
            <option value="saturated_surface_dry">
              {ar ? "مشبع سطحياً جاف (SSD)" : "Saturated Surface Dry (SSD)"}
            </option>
            <option value="air_dry">{ar ? "جاف هوائياً" : "Air Dry"}</option>
            <option value="oven_dry">{ar ? "جاف فرنياً" : "Oven Dry"}</option>
            <option value="wet">{ar ? "مبلل" : "Wet"}</option>
          </select>
        </div>

        <div>
          <Label className="text-xs leading-snug">
            {ar ? "درجة حرارة المعالجة بالمختبر" : "Lab curing temperature"}
            <span className="text-muted-foreground font-normal ms-1">(°C)</span>
            <span className="text-muted-foreground font-normal ms-1">{opt}</span>
          </Label>
          <Input
            value={values.labCuringTemperature}
            onChange={e => onChange({ labCuringTemperature: e.target.value })}
            onBlur={onBlur}
            className="h-8 text-sm mt-0.5"
            placeholder={ar ? "مثال: 20 ± 2" : "e.g. 20 ± 2"}
            disabled={disabled}
          />
        </div>

        <div>
          <Label className="text-xs leading-snug">
            {ar ? "الرطوبة النسبية للمعالجة بالمختبر" : "Lab curing RH"}
            <span className="text-muted-foreground font-normal ms-1">(%)</span>
            <span className="text-muted-foreground font-normal ms-1">{opt}</span>
          </Label>
          <Input
            value={values.labCuringRh}
            onChange={e => onChange({ labCuringRh: e.target.value })}
            onBlur={onBlur}
            className="h-8 text-sm mt-0.5"
            placeholder={ar ? "مثال: ≥ 95" : "e.g. ≥ 95"}
            disabled={disabled}
          />
        </div>

        <div>
          <Label className="text-xs leading-snug">
            {ar ? "معدل التحميل المطبّق" : "Loading rate applied"}
            <span className="text-muted-foreground font-normal ms-1">(N/mm²/s)</span>
            <span className="text-muted-foreground font-normal ms-1">{opt}</span>
          </Label>
          <Input
            type="text"
            inputMode="decimal"
            value={values.loadingRate}
            onChange={e => onChange({ loadingRate: e.target.value })}
            onBlur={onBlur}
            className="h-8 text-sm mt-0.5"
            placeholder={ar ? "مثال: 0.6" : "e.g. 0.6"}
            disabled={disabled}
          />
        </div>

        <div>
          <Label className="text-xs leading-snug">
            {ar ? "حالة سطح العينة وقت الاختبار" : "Surface condition of specimen at time of test"}
            <span className="text-muted-foreground font-normal ms-1">{opt}</span>
          </Label>
          <select
            className={selectClass}
            value={values.surfaceConditionAtTest}
            disabled={disabled}
            onChange={e => onChange({ surfaceConditionAtTest: e.target.value })}
            onBlur={onBlur}
          >
            <option value="">{ar ? "— اختر —" : "— select —"}</option>
            <option value="as_cast">{ar ? "كما صُبّ (سطح طبيعي)" : "As cast (natural surface)"}</option>
            <option value="smooth">{ar ? "ناعم" : "Smooth"}</option>
            <option value="rough">{ar ? "خشن" : "Rough"}</option>
            <option value="ground">{ar ? "مطحون / مُجهّز" : "Ground / prepared"}</option>
          </select>
        </div>

        <div className="sm:col-span-2 lg:col-span-1">
          <Label className="text-xs leading-snug">
            {ar ? "تفاصيل التكييف / الطحن" : "Capping / grinding details"}
            <span className="text-muted-foreground font-normal ms-1">
              {ar
                ? "(إن وُجد تحضير للأوجه: مسطح / تسوية كبريتية / خشب / مطاط / مطحون)"
                : "(if end preparation done: Flat / Sulfur cap / Plywood / Rubber / Ground)"}
            </span>
            <span className="text-muted-foreground font-normal ms-1">{opt}</span>
          </Label>
          <select
            className={selectClass}
            value={values.cappingMethod}
            disabled={disabled}
            onChange={e => onChange({ cappingMethod: e.target.value })}
            onBlur={onBlur}
          >
            <option value="">{ar ? "— اختر —" : "— select —"}</option>
            <option value="flat_bedded">{ar ? "سطح مسطح (كما استلم)" : "Flat bedded (as received)"}</option>
            <option value="capped_sulfur">{ar ? "تسوية — ملاط كبريتي" : "Capped — Sulfur Mortar"}</option>
            <option value="capped_plywood">{ar ? "تسوية — خشب رقائقي" : "Capped — Plywood"}</option>
            <option value="capped_rubber">{ar ? "تسوية — وسادة مطاطية" : "Capped — Rubber Pad"}</option>
            <option value="ground">{ar ? "مطحون" : "Ground"}</option>
          </select>
        </div>
      </div>
    </div>
  );
}
