import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentIdentity,
  type RequestIdentity,
} from '../../infrastructure/common/current-user.decorator.js';
import { Idempotent } from '../../infrastructure/common/idempotency.interceptor.js';
import { Roles } from '../../infrastructure/common/roles.decorator.js';
import { AuditLogsModule } from '../audit-logs/audit-logs.module.js';
import {
  type BillingSummaryQuery,
  billingSummaryQuerySchema,
  type GenerateInvoiceDto,
  generateInvoiceSchema,
  type ListInvoicesQuery,
  listInvoicesQuerySchema,
  type PreviewInvoiceQuery,
  previewInvoiceQuerySchema,
  type UpdateInvoiceStatusDto,
  updateInvoiceStatusSchema,
  uuidParamSchema,
} from './billing.schemas.js';
import { BillingService } from './billing.service.js';

@ApiTags('Admin - Billing & Invoices')
@ApiHeader({ name: 'X-Dev-User-Id', required: true })
@ApiHeader({ name: 'X-Dev-Org-Id', required: true })
@Controller('admin/billing')
export class BillingController {
  constructor(private readonly service: BillingService) {}

  @Get('summary')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'VENDOR_SUPERVISOR', 'AUDITOR')
  @ApiOperation({ summary: 'Get tenant invoice reconciliation & unbilled trips summary' })
  summary(
    @CurrentIdentity() identity: RequestIdentity,
    @Query({ schema: billingSummaryQuerySchema }) query: BillingSummaryQuery,
  ) {
    return this.service.getBillingSummary(identity.organizationId, query);
  }

  @Get('invoices/preview')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'VENDOR_SUPERVISOR', 'AUDITOR')
  @ApiOperation({ summary: 'Preview itemized billable trips & GST math for a vendor billing window' })
  preview(
    @CurrentIdentity() identity: RequestIdentity,
    @Query({ schema: previewInvoiceQuerySchema }) query: PreviewInvoiceQuery,
  ) {
    return this.service.previewInvoice(identity.organizationId, query);
  }

  @Get('invoices')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'VENDOR_SUPERVISOR', 'AUDITOR')
  @ApiOperation({ summary: 'List vendor invoices for active organization' })
  listInvoices(
    @CurrentIdentity() identity: RequestIdentity,
    @Query({ schema: listInvoicesQuerySchema }) query: ListInvoicesQuery,
  ) {
    return this.service.listInvoices(identity.organizationId, query);
  }

  @Post('invoices/generate')
  @Idempotent()
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER')
  @ApiOperation({ summary: 'Generate auditable vendor invoice from completed trips in period' })
  generate(
    @CurrentIdentity() identity: RequestIdentity,
    @Body({ schema: generateInvoiceSchema }) dto: GenerateInvoiceDto,
  ) {
    return this.service.generateInvoice(identity, dto);
  }

  @Get('invoices/:invoiceId')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'VENDOR_SUPERVISOR', 'AUDITOR')
  @ApiOperation({ summary: 'Get itemized invoice detail, vendor rate snapshot, and audit history' })
  detail(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('invoiceId', { schema: uuidParamSchema }) invoiceId: string,
  ) {
    return this.service.getInvoiceDetail(identity.organizationId, invoiceId);
  }

  @Patch('invoices/:invoiceId/status')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'VENDOR_SUPERVISOR')
  @ApiOperation({ summary: 'Transition invoice status (ISSUED / RECONCILED / DISPUTED)' })
  updateStatus(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('invoiceId', { schema: uuidParamSchema }) invoiceId: string,
    @Body({ schema: updateInvoiceStatusSchema }) dto: UpdateInvoiceStatusDto,
  ) {
    return this.service.updateInvoiceStatus(identity, invoiceId, dto);
  }

  @Get('invoices/:invoiceId/export')
  @Roles('ORG_ADMIN', 'TRANSPORT_MANAGER', 'VENDOR_SUPERVISOR', 'AUDITOR')
  @ApiOperation({ summary: 'Export itemized vendor invoice statement as CSV' })
  async exportCsv(
    @CurrentIdentity() identity: RequestIdentity,
    @Param('invoiceId', { schema: uuidParamSchema }) invoiceId: string,
  ) {
    const { filename, csv } = await this.service.exportInvoiceCsv(
      identity.organizationId,
      invoiceId,
    );
    return new StreamableFile(Buffer.from(csv, 'utf-8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}

@Module({
  imports: [AuditLogsModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
