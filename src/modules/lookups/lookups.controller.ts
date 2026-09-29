import {
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type CurrentUserData,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import { QueryLookupDto } from './dto/query-lookup.dto';
import { LookupKind } from './lookup-kind.enum';
import { LookupsService } from './lookups.service';

@ApiTags('Lookups')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('lookups')
export class LookupsController {
  constructor(private readonly lookups: LookupsService) {}

  @Get(':kind')
  findOptions(
    @CurrentUser() user: CurrentUserData,
    @Param('kind', new ParseEnumPipe(LookupKind)) kind: LookupKind,
    @Query() query: QueryLookupDto,
  ) {
    return this.lookups.findOptions(user, kind, query);
  }
}
