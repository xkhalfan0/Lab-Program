/** Lab identity for printable reports (override via Vite env). */
export const LAB_PRINT_BRANDING = {
  nameEn:
    (import.meta.env.VITE_LAB_NAME as string | undefined)?.trim() ||
    "Construction Materials & Engineering Laboratory",
  nameAr:
    (import.meta.env.VITE_LAB_NAME_AR as string | undefined)?.trim() ||
    "مختبر الإنشاءات والمواد الهندسية",
  address: (import.meta.env.VITE_LAB_ADDRESS as string | undefined)?.trim() || "",
  phone: (import.meta.env.VITE_LAB_PHONE as string | undefined)?.trim() || "",
  email: (import.meta.env.VITE_LAB_EMAIL as string | undefined)?.trim() || "",
  accreditation: (import.meta.env.VITE_LAB_ACCREDITATION as string | undefined)?.trim() || "",
  logoUrl: (import.meta.env.VITE_LAB_LOGO_URL as string | undefined)?.trim() || "/logo.png",
};
