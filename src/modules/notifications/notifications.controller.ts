import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard';
import {
  NotificationCountDto,
  NotificationDto,
  NotificationPageDto,
  QueryNotificationsDto,
} from './notifications.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List my notifications' })
  @ApiOkResponse({ type: NotificationPageDto })
  list(
    @CurrentUser('id') accountId: string,
    @Query() query: QueryNotificationsDto,
  ) {
    return this.notifications.list(accountId, query);
  }

  @Get('unread-count')
  @ApiOkResponse({ type: NotificationCountDto })
  unreadCount(@CurrentUser('id') accountId: string) {
    return this.notifications.unreadCount(accountId);
  }

  @Patch('read-all')
  @ApiOkResponse({ type: NotificationCountDto })
  readAll(@CurrentUser('id') accountId: string) {
    return this.notifications.readAll(accountId, new Date());
  }

  @Patch(':id/read')
  @ApiOkResponse({ type: NotificationDto })
  read(
    @CurrentUser('id') accountId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.notifications.read(accountId, id);
  }
}
