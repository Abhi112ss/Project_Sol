import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentIdentity,
  type RequestIdentity,
} from '../../infrastructure/common/current-user.decorator.js';
import { Roles } from '../../infrastructure/common/roles.decorator.js';
import { AuditLogsModule } from '../audit-logs/audit-logs.module.js';
import {
  type AssistantQueryDto,
  assistantQuerySchema,
  type ReportsFilterQuery,
  reportsFilterQuerySchema,
  type ReportType,
  reportTypeParamSchema,
} from './reports.schemas.js';
import { ReportsService } from './reports.service.js';

@ApiTags('Admin - Reports & Operational Intelligence')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('admin/reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('summary')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'VENDOR_SUPERVISOR', 'AUDITOR')
  @ApiOperation({
    summary:
      'Get comprehensive transport analytics, decomposed delay metrics, vendor/driver scorecards & delay risk advisories',
  })
  summary(
    @CurrentIdentity() identity: RequestIdentity,
    @Query({ schema: reportsFilterQuerySchema }) query: ReportsFilterQuery,
  ) {
    return this.service.getSummary(identity.organizationId, query);
  }

  @Post('assistant/query')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'AUDITOR')
  @ApiOperation({
    summary:
      'Ask read-only operational intelligence questions against tenant transport telemetry (strictly blocks mutations)',
  })
  queryAssistant(
    @CurrentIdentity() identity: RequestIdentity,
    @Body({ schema: assistantQuerySchema }) dto: AssistantQueryDto,
  ) {
    return this.service.queryAssistant(identity, dto);
  }

  @Get(':reportType')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'DUTY_APPROVER', 'VENDOR_SUPERVISOR', 'AUDITOR')
  @ApiOperation({ summary: 'Generate typed operational report in JSON or CSV (?format=csv)' })
  async getReport(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('reportType', { schema: reportTypeParamSchema }) reportType: ReportType,
    @Query({ schema: reportsFilterQuerySchema }) query: ReportsFilterQuery,
  ) {
    const result = await this.service.getTypedReport(identity.organizationId, reportType, query);
    if (query.format === 'csv') {
      return new StreamableFile(Buffer.from(result.csv, 'utf-8'), {
        type: 'text/csv; charset=utf-8',
        disposition: `attachment; filename="soltransit-${reportType}-${result.periodStart}_to_${result.periodEnd}.csv"`,
      });
    }
    return result;
  }
}

@Module({
  imports: [AuditLogsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
