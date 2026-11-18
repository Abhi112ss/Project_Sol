import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/roles.decorator.js';
import {
  NO_SHOW_REASONS,
  PASSENGER_STATUSES,
  TRIP_DIRECTIONS,
  TRIP_STATUSES,
  USER_ROLES,
} from '../shared/enums.js';

@ApiTags('Meta')
@Public()
@Controller('meta')
export class MetaController {
  @Get('enums')
  @ApiOperation({ summary: 'Shared canonical state enums and roles across Web and Flutter clients' })
  getEnums() {
    return {
      roles: USER_ROLES,
      tripStatuses: TRIP_STATUSES,
      passengerStatuses: PASSENGER_STATUSES,
      noShowReasons: NO_SHOW_REASONS,
      tripDirections: TRIP_DIRECTIONS,
    };
  }
}

