import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { TeamInfo } from "./team.entity";
import { JwtPayload } from "../auth/jwt-payload";
import { DrizzleService } from "../database/drizzle.service";
import { teamMembers, teams } from "../database/schema";

export type DataScope = { kind: "all" } | { kind: "team"; team: TeamInfo } | { kind: "none" };

export type TeamBase = {
  id: string;
  name: string;
  baseLat: number;
  baseLng: number;
  roadName: string;
};

@Injectable()
export class TeamsService {
  constructor(private readonly drizzle: DrizzleService) {}

  async findAllActiveBases(): Promise<TeamBase[]> {
    return this.drizzle.db
      .select({
        id: teams.id,
        name: teams.name,
        baseLat: teams.baseLat,
        baseLng: teams.baseLng,
        roadName: teams.roadName,
      })
      .from(teams)
      .where(eq(teams.active, true));
  }

  async findBaseById(id: string): Promise<TeamBase | null> {
    const [row] = await this.drizzle.db
      .select({
        id: teams.id,
        name: teams.name,
        baseLat: teams.baseLat,
        baseLng: teams.baseLng,
        roadName: teams.roadName,
      })
      .from(teams)
      .where(eq(teams.id, id))
      .limit(1);

    return row ?? null;
  }

  async scopeFor(user: JwtPayload): Promise<DataScope> {
    if (user.role !== "field") return { kind: "all" };

    const team = await this.findByUserId(user.sub);
    return team ? { kind: "team", team } : { kind: "none" };
  }

  async findByUserId(userId: string): Promise<TeamInfo | null> {
    const [row] = await this.drizzle.db
      .select({
        id: teams.id,
        name: teams.name,
        roadName: teams.roadName,
        kmStart: teams.kmStart,
        kmEnd: teams.kmEnd,
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(eq(teamMembers.userId, userId))
      .limit(1);

    return row ? { ...row, kmStart: Number(row.kmStart), kmEnd: Number(row.kmEnd) } : null;
  }
}
