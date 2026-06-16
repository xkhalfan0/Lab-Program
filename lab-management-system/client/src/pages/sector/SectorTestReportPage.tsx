import { useEffect } from "react";
import { useParams } from "wouter";
import SpecializedTestReport from "@/pages/tests/SpecializedTestReport";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSectorLang } from "./SectorLayout";

export default function SectorTestReportPage() {
  const { resultId } = useParams<{ resultId: string }>();
  const id = parseInt(resultId ?? "0", 10);
  const { lang } = useSectorLang();
  const { setLang } = useLanguage();

  useEffect(() => {
    setLang(lang);
  }, [lang, setLang]);

  if (!id) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Invalid report link
      </div>
    );
  }

  return <SpecializedTestReport sectorResultId={id} />;
}
