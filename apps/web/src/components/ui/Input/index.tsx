import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff, User, Lock } from "lucide-react";
import styles from "./index.module.css";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  prefixIcon?: "user" | "lock";
  showPasswordToggle?: boolean;
  showForgotPassword?: boolean;
  onForgotPassword?: () => void;
};

const PrefixIconComponent = {
  user: User,
  lock: Lock,
};

export function Input({
  label,
  id,
  prefixIcon,
  showPasswordToggle = false,
  showForgotPassword = false,
  onForgotPassword,
  className,
  type,
  ...props
}: InputProps) {
  const [showPassword, setShowPassword] = useState(false);

  const isPassword = type === "password";
  const inputType = isPassword && showPasswordToggle ? (showPassword ? "text" : "password") : type;

  const hasPrefix = !!prefixIcon;
  const hasSuffix = showPasswordToggle && isPassword;

  const inputClasses = [
    styles.input,
    hasPrefix && styles["input--withPrefix"],
    hasSuffix && styles["input--withSuffix"],
    !hasPrefix && styles["input--noPrefix"],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const PrefixIcon = prefixIcon ? PrefixIconComponent[prefixIcon] : null;

  return (
    <div className={styles.container}>
      <div className={styles.labelRow}>
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
        {showForgotPassword && (
          <button type="button" className={styles.forgotPassword} onClick={onForgotPassword}>
            Forgot password?
          </button>
        )}
      </div>
      <div className={styles.inputWrapper}>
        {hasPrefix && PrefixIcon && (
          <span className={styles.prefixIcon}>
            <PrefixIcon size={20} />
          </span>
        )}
        <input id={id} type={inputType} className={inputClasses} {...props} />
        {hasSuffix && (
          <button
            type="button"
            className={styles.suffixButton}
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        )}
      </div>
    </div>
  );
}
