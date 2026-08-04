export const USER_ROLES = ["manager", "field"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export type User = {
  id: string;
  email: string;
  name: string;
  password: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
};
