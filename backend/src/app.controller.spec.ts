import { Test, type TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('should return Central Transport Core metadata', () => {
    const result = appController.getRoot();
    expect(result.service).toBe('Project Sol — Central Transport Core');
    expect(result.apiPrefix).toBe('/api/v1');
    expect(result.docsPath).toBe('/api/docs');
  });
});
