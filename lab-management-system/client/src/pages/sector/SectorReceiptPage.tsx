import { useEffect } from "react";
import { useParams } from "wouter";
import PrintReceipt from "@/pages/PrintReceipt";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSectorLang } from "./SectorLayout";

export default function SectorReceiptPage() {
  const { sampleId } = useParams<{ sampleId: string }>();
  const id = parseInt(sampleId ?? "0", 10);
  const { lang } = useSectorLang();
  const { setLang } = useLanguage();

  useEffect(() => {
    setLang(lang);
  }, [lang, setLang]);

  if (!id) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Invalid receipt link
      </div>
    );
  }

  return <PrintReceipt sectorSampleId={id} />;
}
