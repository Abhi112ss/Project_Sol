import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';
import { Public } from './infrastructure/common/roles.decorator.js';

@ApiTags('System')
@Public()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Central Transport Core service metadata' })
  getRoot() {
    return this.appService.getServiceInfo();
  }
}
