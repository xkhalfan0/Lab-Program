import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  EMPTY_CONCRETE_SPECIMEN_PREP,
  PREP_FIELD_LABELS,
  PREP_FIELDS_BY_VARIANT,
  type ConcreteSpecimenPrepValues,
  type ConcreteSpecimenPrepVariant,
} from "@shared/concreteSpecimenPrepFields";

export { EMPTY_CONCRETE_SPECIMEN_PREP, type ConcreteSpecimenPrepValues };

const selectClass =
  "w-full h-9 text-sm border rounded px-2 bg-white mt-0.5 disabled:opacity-60 disabled:cursor-not-allowed";

type Props = {
  variant: ConcreteSpecimenPrepVariant;
  lang: string;
  values: ConcreteSpecimenPrepValues;
  onChange: (patch: Partial<ConcreteSpecimenPrepValues>) => void;
  disabled?: boolean;
  className?: string;
};

export function ConcreteSpecimenPrepFields({
  variant,
  lang,
  values,
  onChange,
  disabled,
  className,
}: Props) {
  const ar = lang === "ar";
  const opt = ar ? "(اختياري)" : "(optional)";
  const fields = PREP_FIELDS_BY_VARIANT[variant];
  const label = (key: keyof ConcreteSpecimenPrepValues) =>
    ar ? PREP_FIELD_LABELS[key].ar : PREP_FIELD_LABELS[key].en;

  const show = (key: keyof ConcreteSpecimenPrepValues) => fields.includes(key);

  return (
    <div className={cn("rounded-lg border border-slate-200 bg-slate-50/80 p-4", className)}>
      <p className="text-xs font-semibold text-slate-700 mb-1">
        {ar ? "تفاصيل العينة والتحضير" : "Sample Preparation Details"}
      </p>
      <p className="text-[11px] text-muted-foreground mb-3">
        {ar
          ? "جميع الحقول اختيارية — تظهر في التقرير النهائي عند تعبئتها."
          : "All fields are optional — shown on the final report when filled."}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {show("nominalSizeOfCube") && (
          <div>
            <Label className="text-xs">
              {label("nominalSizeOfCube")} <span className="text-muted-foreground font-normal">{opt}</span>
            </Label>
            <Input
              value={values.nominalSizeOfCube}
              onChange={e => onChange({ nominalSizeOfCube: e.target.value })}
              className="h-9 text-sm mt-0.5"
              placeholder={ar ? "مثال: 150 mm" : "e.g. 150 mm"}
              disabled={disabled}
            />
          </div>
        )}

        {show("appearanceWhenReceived") && (
          <div className="sm:col-span-2">
            <Label className="text-xs">
              {label("appearanceWhenReceived")} <span className="text-muted-foreground font-normal">{opt}</span>
            </Label>
            <Input
              value={values.appearanceWhenReceived}
              onChange={e => onChange({ appearanceWhenReceived: e.target.value })}
              className="h-9 text-sm mt-0.5"
              disabled={disabled}
            />
          </div>
        )}

        {show("moistureConditionAtTesting") && (
          <div>
            <Label className="text-xs">
              {label("moistureConditionAtTesting")} <span className="text-muted-foreground font-normal">{opt}</span>
            </Label>
            <select
              className={selectClass}
              value={values.moistureConditionAtTesting}
              disabled={disabled}
              onChange={e => onChange({ moistureConditionAtTesting: e.target.value })}
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
        )}

        {show("removalOfFins") && (
          <div>
            <Label className="text-xs">
              {label("removalOfFins")} <span className="text-muted-foreground font-normal">{opt}</span>
            </Label>
            <Input
              value={values.removalOfFins}
              onChange={e => onChange({ removalOfFins: e.target.value })}
              className="h-9 text-sm mt-0.5"
              disabled={disabled}
            />
          </div>
        )}

        {show("volumeDetermination") && (
          <div>
            <Label className="text-xs">
              {label("volumeDetermination")} <span className="text-muted-foreground font-normal">{opt}</span>
            </Label>
            <Input
              value={values.volumeDetermination}
              onChange={e => onChange({ volumeDetermination: e.target.value })}
              className="h-9 text-sm mt-0.5"
              disabled={disabled}
            />
          </div>
        )}

        {show("methodOfCompaction") && (
          <div>
            <Label className="text-xs">
              {label("methodOfCompaction")} <span className="text-muted-foreground font-normal">{opt}</span>
            </Label>
            <Input
              value={values.methodOfCompaction}
              onChange={e => onChange({ methodOfCompaction: e.target.value })}
              className="h-9 text-sm mt-0.5"
              disabled={disabled}
            />
          </div>
        )}

        {show("sampledBy") && (
          <div>
            <Label className="text-xs">
              {label("sampledBy")} <span className="text-muted-foreground font-normal">{opt}</span>
            </Label>
            <Input
              value={values.sampledBy}
              onChange={e => onChange({ sampledBy: e.target.value })}
              className="h-9 text-sm mt-0.5"
              disabled={disabled}
            />
          </div>
        )}

        {show("curingMethod") && (
          <div>
            <Label className="text-xs">
              {label("curingMethod")} <span className="text-muted-foreground font-normal">{opt}</span>
            </Label>
            <Input
              value={values.curingMethod}
              onChange={e => onChange({ curingMethod: e.target.value })}
              className="h-9 text-sm mt-0.5"
              disabled={disabled}
            />
          </div>
        )}

        {show("dateTimeSampled") && (
          <div>
            <Label className="text-xs">
              {label("dateTimeSampled")} <span className="text-muted-foreground font-normal">{opt}</span>
            </Label>
            <Input
              type="datetime-local"
              value={values.dateTimeSampled}
              onChange={e => onChange({ dateTimeSampled: e.target.value })}
              className="h-9 text-sm mt-0.5"
              disabled={disabled}
            />
          </div>
        )}
      </div>
    </div>
  );
}
