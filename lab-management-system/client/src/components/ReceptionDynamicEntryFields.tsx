import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getReceptionFieldGroupsForTests,
  type ReceptionFieldDef,
} from "@shared/receptionEntryFields";

type Props = {
  lang: string;
  tests: Array<{ testTypeCode: string; testTypeName: string }>;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
};

function FieldInput({
  field,
  value,
  onChange,
  lang,
}: {
  field: ReceptionFieldDef;
  value: string;
  onChange: (value: string) => void;
  lang: string;
}) {
  const isAr = lang === "ar";
  const label = isAr ? field.labelAr : field.labelEn;
  const optional = isAr ? "(اختياري)" : "(optional)";

  return (
    <div className="space-y-2">
      <Label className="text-[15px]">
        {label}
        <span className="text-muted-foreground text-xs font-normal ms-1">{optional}</span>
      </Label>
      <Input
        type={field.type === "date" ? "date" : "text"}
        className="h-10 text-base text-start"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={optional}
      />
    </div>
  );
}

export function ReceptionDynamicEntryFields({ lang, tests, values, onChange }: Props) {
  const groups = getReceptionFieldGroupsForTests(tests);
  const isAr = lang === "ar";

  if (groups.length === 0) return null;

  return (
    <div className="sm:col-span-2 space-y-5 border-t pt-5">
      <div>
        <p className="text-sm font-semibold text-foreground">
          {isAr ? "بيانات إضافية حسب الاختبار" : "Additional test-specific data"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isAr
            ? "جميع الحقول اختيارية — تظهر في وصل الاستلام والتقرير النهائي"
            : "All fields are optional — shown on the receipt and final report"}
        </p>
      </div>

      {groups.map((group) => (
        <div
          key={group.testCode}
          className="rounded-lg border border-border/80 bg-muted/20 p-4 space-y-4"
        >
          <p className="text-sm font-semibold text-foreground leading-snug">{group.testName}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {group.fields.map((field) => (
              <FieldInput
                key={field.key}
                field={field}
                value={values[field.key] ?? ""}
                onChange={(v) => onChange(field.key, v)}
                lang={lang}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
