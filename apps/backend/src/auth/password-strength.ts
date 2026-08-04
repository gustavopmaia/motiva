import { InvalidOperationError } from "../common/errors";

export function validatePasswordStrength(password: string): void {
  if (password.length < 8)
    throw new InvalidOperationError("Password must be at least 8 characters");
  if (!/[a-zA-Z]/.test(password))
    throw new InvalidOperationError("Password must contain at least one letter");
  if (!/[0-9]/.test(password))
    throw new InvalidOperationError("Password must contain at least one digit");
}
