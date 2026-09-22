import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../auth/guards/jwt.guard";
import { RolesGuard } from "../../../auth/guards/roles.guard";
import { Roles } from "../../../auth/roles.decorator";
import { JwtPayload } from "../../../auth/jwt-payload";
import { DrizzleService } from "../../../database/drizzle.service";
import { ManageApiKeys } from "../application/api-keys";
import { DrizzleApiKeys } from "../infrastructure/drizzle-api-keys";
@ApiTags("API keys")
@ApiBearerAuth("jwt")
@Controller("auth/api-keys")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("manager")
export class ApiKeysController {
  private readonly commands: ManageApiKeys;
  constructor(drizzle: DrizzleService) {
    this.commands = new ManageApiKeys(new DrizzleApiKeys(drizzle));
  }
  @Get()
  @ApiOperation({ summary: "List the latest 100 API keys without exposing secrets or hashes" })
  list(@Request() request: { user: JwtPayload }) {
    return this.commands.list(request.user);
  }
  @Post(":id/rotate")
  @ApiOperation({
    summary: "Replace an API key secret; the previous secret stops authorizing new requests",
  })
  rotate(@Param("id", ParseUUIDPipe) id: string, @Request() request: { user: JwtPayload }) {
    return this.commands.rotate(id, request.user);
  }
  @Delete(":id")
  @ApiOperation({ summary: "Revoke an API key; repeated revocation is idempotent" })
  async revoke(@Param("id", ParseUUIDPipe) id: string, @Request() request: { user: JwtPayload }) {
    await this.commands.revoke(id, request.user);
    return { revoked: true };
  }
}
