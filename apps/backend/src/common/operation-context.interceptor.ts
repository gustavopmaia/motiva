import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Observable } from "rxjs";
import { operationContext } from "../platform/context/operation-context";
@Injectable()
export class OperationContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();
    const request = context.switchToHttp().getRequest<{ id?: string }>();
    return new Observable((subscriber) =>
      operationContext.run({ correlationId: request.id ?? randomUUID() }, () =>
        next.handle().subscribe(subscriber),
      ),
    );
  }
}
