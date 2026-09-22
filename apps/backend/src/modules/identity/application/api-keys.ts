import { AuthorizationError } from "../../../common/errors";
export type KeyActor = { sub: string; role: string };
export type KeySummary = { id: string; name: string; source: string; createdAt: Date };
export interface ApiKeyAdministration {
  list(): Promise<KeySummary[]>;
  rotate(id: string, actorId: string): Promise<KeySummary & { key: string }>;
  revoke(id: string, actorId: string): Promise<void>;
}
export class ManageApiKeys {
  constructor(private readonly repository: ApiKeyAdministration) {}
  private authorize(actor: KeyActor): void {
    if (actor.role !== "manager")
      throw new AuthorizationError("Only managers can administer API keys");
  }
  async list(actor: KeyActor): Promise<KeySummary[]> {
    this.authorize(actor);
    return this.repository.list();
  }
  async rotate(id: string, actor: KeyActor): Promise<KeySummary & { key: string }> {
    this.authorize(actor);
    return this.repository.rotate(id, actor.sub);
  }
  async revoke(id: string, actor: KeyActor): Promise<void> {
    this.authorize(actor);
    return this.repository.revoke(id, actor.sub);
  }
}
