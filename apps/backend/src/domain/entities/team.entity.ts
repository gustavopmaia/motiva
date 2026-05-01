export type Team = {
  id: string;
  name: string;
  baseLat: number;
  baseLng: number;
  roadName: string;
  kmStart: number;
  kmEnd: number;
  capacityPerDay: number;
  active: boolean;
};

export type TeamMemberRole = "leader" | "member";

export type TeamMember = {
  id: string;
  teamId: string;
  userId: string;
  role: TeamMemberRole;
};
