export type UserRole = "manager" | "field";

export class User {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly name: string,
    public readonly password: string,
    public readonly role: UserRole,
    public readonly createdAt: Date = new Date(),
    public readonly updatedAt: Date = new Date(),
  ) {
    if (!email.includes("@")) throw new Error("Invalid email");
  }
}

/*

You have full access to the backend codebase. Read every relevant file before touching anything.

## What to implement

Work through this list in order. Do not move to the next item until the current one compiles and makes sense.

**Must fix first:**

1. Add closedAt timestamp to alerts table and entity. Filter by closedAt IS NULL in findOpenBySegmentAndLevel. Call alertRepository.close() inside CompleteWorkOrderUseCase after resetting the score. Create the Drizzle migration.

2. In AlertsProcessor, change the early return logic so that if the alert already exists, it still enqueues the work order. The save becomes const alert = existing ?? await [alertRepository.save](http://alertRepository.save)(...) — always enqueue after, never return early.

3. Recreate a minimal seed script at apps/backend/src/seed.ts, runnable via npm run seed. Needs: one manager user, three API keys (one per source), five road segments with real LineString geometries on Brazilian highways. Add a read-only GET /road-segments endpoint in a new RoadSegmentsController.

4. Create a RegisterResponseDto with only id: string. Use it in both the controller decorator and the return value of RegisterUserUseCase.

**Should fix next:**

5. In AlertsProcessor, after creating the work order, update the alert record with osId = [workOrder.id](http://workOrder.id). If the decision is to drop the field instead, remove os_id from schema, entity, and create a migration dropping the column — pick one, don't leave it null.

6. Replace the console.log in ForgotPasswordUseCase with new Logger('ForgotPasswordUseCase').log(...).

7. Wrap the two repository calls in CompleteWorkOrderUseCase in a Drizzle transaction. Inject DrizzleService directly into the use case — acceptable tradeoff for this context.

8. Create apps/backend/.env.example with all required variables and placeholder values: DATABASE_URL, JWT_SECRET, REDIS_URL, MQTT_URL, MQTT_USERNAME, MQTT_PASSWORD, PORT, SEED_MANAGER_EMAIL, SEED_MANAGER_PASSWORD.

**Then simplify:**

9. Remove ValidationPipe from main.ts entirely — it has no effect without class-validator DTOs and is misleading.

10. Add two lines of comment above the satellite formula explaining the NDVI range and the linear scale. This is the only comment addition allowed.

11. Replace extends AuthGuard('jwt') with a manual CanActivate guard of ~15 lines using jwtService.verify() directly. Remove JwtStrategy, @nestjs/passport, passport, and passport-jwt from the project.

12. Add @Injectable() to all use cases and switch module providers from useFactory to useClass.

## Rules

- Do not rewrite files that aren't being touched
- No new abstractions, no new patterns, no new files beyond what's listed above
- Run npm run build and test after all changes and fix any type errors before finishing
- At the end, list every file modified and every file created



*/
