import styles from "./index.module.css";

type ButtonVariant = "primary" | "secondary";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export default function Button({
  children,
  variant = "primary",
  className,
  ...props
}: ButtonProps) {
  const variantClass = styles[`button--${variant}`];

  return (
    <button className={`${styles.button} ${variantClass} ${className || ""}`} {...props}>
      {children}
    </button>
  );
}
