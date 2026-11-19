export type PasswordStrengthLevel = 'empty' | 'weak' | 'fair' | 'good' | 'strong';

export interface PasswordStrengthChecks {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
}

export interface PasswordStrengthResult {
  checks: PasswordStrengthChecks;
  passedCount: number;
  score: 0 | 1 | 2 | 3 | 4;
  level: PasswordStrengthLevel;
  isValid: boolean;
}

export const MIN_STRONG_PASSWORD_LENGTH = 8;

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const checks: PasswordStrengthChecks = {
    minLength: password.length >= MIN_STRONG_PASSWORD_LENGTH,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9\s]/.test(password),
  };

  if (!password) {
    return {
      checks,
      passedCount: 0,
      score: 0,
      level: 'empty',
      isValid: false,
    };
  }

  const passedCount = Object.values(checks).filter(Boolean).length;
  const isValid = passedCount === 5;

  let score: 0 | 1 | 2 | 3 | 4 = 1;
  let level: PasswordStrengthLevel = 'weak';

  if (passedCount <= 2) {
    score = 1;
    level = 'weak';
  } else if (passedCount === 3) {
    score = 2;
    level = 'fair';
  } else if (passedCount === 4) {
    score = 3;
    level = 'good';
  } else {
    score = 4;
    level = 'strong';
  }

  return {
    checks,
    passedCount,
    score,
    level,
    isValid,
  };
}

export function validateStrongPassword(password: string): string | null {
  const result = evaluatePasswordStrength(password);
  if (result.isValid) return null;

  const missing: string[] = [];
  if (!result.checks.minLength) missing.push(`at least ${MIN_STRONG_PASSWORD_LENGTH} characters`);
  if (!result.checks.hasUppercase) missing.push('an uppercase letter (A-Z)');
  if (!result.checks.hasLowercase) missing.push('a lowercase letter (a-z)');
  if (!result.checks.hasNumber) missing.push('a number (0-9)');
  if (!result.checks.hasSpecial) missing.push('a special character (!@#$%^&*)');

  return `Password must include ${missing.join(', ')}.`;
}
