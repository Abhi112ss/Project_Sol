import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getServiceInfo() {
    return {
      service: 'Project Sol — Central Transport Core',
      version: '0.1.0',
      apiPrefix: '/api/v1',
      docsPath: '/api/docs',
    };
  }
}
