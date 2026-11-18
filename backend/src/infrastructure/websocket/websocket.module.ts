import { Global, Module } from '@nestjs/common';
import { TransportGateway } from './transport.gateway.js';

@Global()
@Module({
  providers: [TransportGateway],
  exports: [TransportGateway],
})
export class WebsocketModule {}

