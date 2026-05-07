// Centralized password policy. Returns a Türkçe error message when the
// password fails policy, or null when it's acceptable.
export function validatePassword(pw: string): string | null {
  if (pw.length < 12) return "Şifre en az 12 karakter olmalıdır.";
  if (!/[A-Z]/.test(pw)) return "Şifre en az bir büyük harf içermelidir.";
  if (!/[a-z]/.test(pw)) return "Şifre en az bir küçük harf içermelidir.";
  if (!/[0-9]/.test(pw)) return "Şifre en az bir rakam içermelidir.";
  if (!/[^A-Za-z0-9]/.test(pw))
    return "Şifre en az bir özel karakter içermelidir (örn: !@#$).";
  return null;
}

// Used by the UI strength meter via /auth/password-policy endpoint.
export const passwordPolicyDescription = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSymbol: true,
};
