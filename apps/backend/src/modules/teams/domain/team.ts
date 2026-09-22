import { Territory } from "../../../shared/territory";

export type TeamInfo = Territory & {
  id: string;
  name: string;
};

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
