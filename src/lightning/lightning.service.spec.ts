import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { LightningService } from './lightning.service';
import { LightningStrike } from './entities/lightning-strike.entity';
import { ClassifyLightningRisk, RiskLevel } from './lightning-risk.util';

describe('LightningService - Suíte de Testes Unitários (PI2)', () => {
  let service: LightningService;

  const mockRepo = {
    createQueryBuilder: jest.fn(),
    find: jest.fn(),
    query: jest.fn(),
  };

  const mockHttpService = {
    get: jest.fn(),
  };

  const mockConfigService = {
    getOrThrow: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LightningService,
        {
          provide: getRepositoryToken(LightningStrike),
          useValue: mockRepo,
        },
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<LightningService>(LightningService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Regra: Classificação de Risco por Faixas de kA', () => {
    it('deve classificar descarga < 20 kA (ou sem medição) como BAIXO', () => {
      expect(ClassifyLightningRisk(10)).toBe(RiskLevel.BAIXO);
      expect(ClassifyLightningRisk(19.9)).toBe(RiskLevel.BAIXO);
      expect(ClassifyLightningRisk(null)).toBe(RiskLevel.BAIXO);
    });

    it('deve classificar descarga entre 20 e 40 kA como MEDIO', () => {
      expect(ClassifyLightningRisk(20)).toBe(RiskLevel.MEDIO);
      expect(ClassifyLightningRisk(30)).toBe(RiskLevel.MEDIO);
      expect(ClassifyLightningRisk(40)).toBe(RiskLevel.MEDIO);
    });

    it('deve classificar descarga > 40 kA como ALTO', () => {
      expect(ClassifyLightningRisk(40.1)).toBe(RiskLevel.ALTO);
      expect(ClassifyLightningRisk(85)).toBe(RiskLevel.ALTO);
    });
  });

  describe('Consultas Analíticas: getSummaryMetrics', () => {
    it('deve calcular médias e distribuir as contagens de risco corretamente', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalEvents: '3',
          averageIntensityKa: '30.00',
          maxIntensityKa: '55.0',
          minIntensityKa: '10.0',
        }),
      };

      mockRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockRepo.find.mockResolvedValue([
        { id: 1, intensity: 15.0 },
        { id: 2, intensity: 30.0 },
        { id: 3, intensity: 55.0 },
      ]);

      const result = await service.getSummaryMetrics();

      expect(result.totalEvents).toBe(3);
      expect(result.averageIntensityKa).toBe(30);
      expect(result.riskDistribution[RiskLevel.BAIXO]).toBe(1);
      expect(result.riskDistribution[RiskLevel.MEDIO]).toBe(1);
      expect(result.riskDistribution[RiskLevel.ALTO]).toBe(1);
    });
  });
});