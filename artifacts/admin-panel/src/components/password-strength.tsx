import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

interface Props {
  password: string;
}

interface Score {
  level: 0 | 1 | 2 | 3 | 4;
  label: string;
  hint: string;
}

function score(pw: string, t: TFunction): Score {
  if (!pw) return { level: 0, label: "—", hint: t("Şifre giriniz") };
  let pts = 0;
  if (pw.length >= 12) pts++;
  if (pw.length >= 16) pts++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) pts++;
  if (/\d/.test(pw)) pts++;
  if (/[^A-Za-z0-9]/.test(pw)) pts++;
  if (pw.length < 12) pts = Math.min(pts, 1);
  const level = Math.min(4, pts) as Score["level"];
  const labels = [
    t("Çok zayıf"),
    t("Zayıf"),
    t("Orta"),
    t("Güçlü"),
    t("Çok güçlü"),
  ];
  const hints = [
    t("En az 12 karakter; büyük/küçük, rakam, özel karakter"),
    t("Daha uzun veya daha çeşitli karakterler kullanın"),
    t("Bir rakam veya özel karakter ekleyin"),
    t("İyi — daha da uzun yapabilirsiniz"),
    t("Mükemmel"),
  ];
  return { level, label: labels[level], hint: hints[level] };
}

export function PasswordStrength({ password }: Props) {
  const { t } = useTranslation();
  const s = score(password, t);
  const colors = [
    "bg-muted",
    "bg-destructive",
    "bg-amber-500",
    "bg-yellow-500",
    "bg-emerald-500",
  ];
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full ${i <= s.level ? colors[s.level] : "bg-muted"}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[11px]">
        <span className="font-mono">{s.label}</span>
        <span className="text-muted-foreground">{s.hint}</span>
      </div>
    </div>
  );
}
