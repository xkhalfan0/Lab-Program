import AggAcvAivForm from "./AggAcvAivForm";
import { ACV_CONFIG } from "@/lib/aggAcvAiv";

export default function AcvTest() {
  return (
    <AggAcvAivForm
      config={ACV_CONFIG}
      titleEn="Aggregate Crushing Value (ACV)"
      titleAr="قيمة سحق الركام (ACV)"
    />
  );
}
