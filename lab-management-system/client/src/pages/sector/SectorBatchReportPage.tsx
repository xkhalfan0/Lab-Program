import { useEffect } from "react";
import BatchReport from "@/pages/BatchReport";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSectorLang } from "./SectorLayout";

export default function SectorBatchReportPage() {
  const { lang } = useSectorLang();
  const { setLang } = useLanguage();

  useEffect(() => {
    setLang(lang);
  }, [lang, setLang]);

  return <BatchReport sectorMode />;
}
