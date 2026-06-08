import AggAcvAivForm from "./AggAcvAivForm";
import { AIV_CONFIG } from "@/lib/aggAcvAiv";

export default function AivTest() {
  return (
    <AggAcvAivForm
      config={AIV_CONFIG}
      titleEn="Aggregate Impact Value (AIV)"
      titleAr="قيمة تأثير الركام (AIV)"
    />
  );
}
