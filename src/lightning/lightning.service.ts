import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { Between, FindManyOptions, Repository } from 'typeorm';
import { BackfillLightningDto } from './dto/backfill-lightning.dto';
import { QueryLightningDto } from './dto/query-lightning.dto';
import { LightningStrike } from './entities/lightning-strike.entity';
import { ClassifyLightningRisk, RiskLevel } from './lightning-risk.util';

const BRAZIL_MONITORING_POINTS = [
  { name: 'São Paulo', lat: -23.5505, lon: -46.6333 },
  { name: 'Rio de Janeiro', lat: -22.9068, lon: -43.1729 },
  { name: 'Belo Horizonte', lat: -19.9167, lon: -43.9345 },
  { name: 'Brasília', lat: -15.7801, lon: -47.9292 },
  { name: 'Salvador', lat: -12.9714, lon: -38.5014 },
  { name: 'Curitiba', lat: -25.4284, lon: -49.2733 },
  { name: 'Manaus', lat: -3.119, lon: -60.0217 },
  { name: 'Belém', lat: -1.4558, lon: -48.4902 },
  { name: 'Goiânia', lat: -16.6869, lon: -49.2648 },
  { name: 'Campo Grande', lat: -20.4697, lon: -54.6201 },
  { name: 'Cuiabá', lat: -15.601, lon: -56.0974 },
  { name: 'Porto Alegre', lat: -30.0346, lon: -51.2177 },
  { name: 'Recife', lat: -8.0539, lon: -34.8811 },
  { name: 'Fortaleza', lat: -3.7172, lon: -38.5433 },
  { name: 'Palmas', lat: -10.2491, lon: -48.3243 },
];

// Intensity in kA for OpenWeatherMap thunderstorm codes
const OWM_INTENSITY_MAP: Record<number, number> = {
  200: 15, 201: 25, 202: 40,
  210: 10, 211: 30, 212: 60, 221: 45,
  230: 12, 231: 20, 232: 35,
};

// Intensity in kA for Open-Meteo WMO thunderstorm codes
const METEO_INTENSITY_MAP: Record<number, number> = {
  80: 15, 81: 28, 82: 45, 
  63: 22, 65: 42, 95: 30, 
  96: 45, 99: 65,
};

interface OpenWeatherResponse {
  coord: { lat: number; lon: number };
  weather: Array<{ id: number; main: string; description: string }>;
  dt: number;
  name: string;
}

interface OpenMeteoResponse {
  hourly: {
    time: string[];
    weather_code?: number[];
    weathercode?: number[];
  };
}

@Injectable()
export class LightningService {
  private readonly logger = new Logger(LightningService.name);

  constructor(
    @InjectRepository(LightningStrike)
    private readonly repo: Repository<LightningStrike>,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async fetchAndStore(): Promise<{ fetched: number; stored: number }> {
    const apiKey = this.configService.getOrThrow<string>('OPENWEATHER_API_KEY');

    const results = await Promise.allSettled(
      BRAZIL_MONITORING_POINTS.map((point) => this.fetchPointData(point, apiKey)),
    );

    const strikes: Partial<LightningStrike>[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        strikes.push(result.value);
      }
    }

    if (strikes.length > 0) {
      const placeholders = strikes.map(() => '(?,?,?,?,?,?,?)').join(',');
      const params = strikes.flatMap((r) => [
        r.latitude,
        r.longitude,
        r.occurrenceDate,
        r.weatherCode,
        r.intensity,
        r.source,
        r.description,
      ]);
      await this.repo.query(
        `INSERT IGNORE INTO lightning_strikes (latitude, longitude, occurrenceDate, weatherCode, intensity, source, description) VALUES ${placeholders}`,
        params,
      );
    }

    this.logger.log(`Fetch concluído: ${strikes.length}/${BRAZIL_MONITORING_POINTS.length} pontos salvos.`);
    return { fetched: BRAZIL_MONITORING_POINTS.length, stored: strikes.length };
  }

  async backfill(dto: BackfillLightningDto): Promise<{ processed: number; stored: number }> {
    let processed = 0;
    let stored = 0;

    for (const point of BRAZIL_MONITORING_POINTS) {
      try {
        const result = await this.backfillPoint(point, dto.startDate, dto.endDate);
        processed += result.processed;
        stored += result.stored;
        this.logger.log(`${point.name}: ${result.stored} registros salvos.`);
      } catch (err) {
        this.logger.warn(`Backfill falhou para ${point.name}: ${err}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    this.logger.log(`Backfill concluído: ${processed} horas processadas, ${stored} registros salvos.`);
    return { processed, stored };
  }

  private async backfillPoint(
    point: { name: string; lat: number; lon: number },
    startDate: string,
    endDate: string,
  ): Promise<{ processed: number; stored: number }> {
    const url =
      `https://archive-api.open-meteo.com/v1/archive` +
      `?latitude=${point.lat}&longitude=${point.lon}` +
      `&start_date=${startDate}&end_date=${endDate}` +
      `&hourly=weather_code&timezone=America%2FSao_Paulo`;

    const response = await firstValueFrom(
      this.httpService.get<OpenMeteoResponse>(url),
    );

    const { time } = response.data.hourly;
    const codes = response.data.hourly.weather_code ?? response.data.hourly.weathercode ?? [];

    const records = time.map((t, i) => ({
      latitude: point.lat,
      longitude: point.lon,
      occurrenceDate: new Date(t),
      weatherCode: codes[i] ?? 0,
      intensity: METEO_INTENSITY_MAP[codes[i]] ?? null,
      source: 'Open-Meteo',
      description: point.name,
    }));

    const CHUNK_SIZE = 500;
    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => '(?,?,?,?,?,?,?)').join(',');
      const params = chunk.flatMap((r) => [
        r.latitude,
        r.longitude,
        r.occurrenceDate,
        r.weatherCode,
        r.intensity,
        r.source,
        r.description,
      ]);
      await this.repo.query(
        `INSERT IGNORE INTO lightning_strikes (latitude, longitude, occurrenceDate, weatherCode, intensity, source, description) VALUES ${placeholders}`,
        params,
      );
    }

    return { processed: time.length, stored: records.length };
  }

  private async fetchPointData(
    point: { name: string; lat: number; lon: number },
    apiKey: string,
  ): Promise<Partial<LightningStrike> | null> {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${point.lat}&lon=${point.lon}&appid=${apiKey}&lang=pt_br`;

    const response = await firstValueFrom(
      this.httpService.get<OpenWeatherResponse>(url),
    );

    const data = response.data;
    const condition = data.weather?.[0];

    if (!condition) return null;

    return {
      latitude: data.coord.lat,
      longitude: data.coord.lon,
      occurrenceDate: new Date(data.dt * 1000),
      weatherCode: condition.id,
      intensity: OWM_INTENSITY_MAP[condition.id] ?? null,
      source: 'OpenWeatherMap',
      description: `${point.name}: ${condition.description}`,
    };
  }

  async findAll(query: QueryLightningDto): Promise<LightningStrike[]> {
    const options: FindManyOptions<LightningStrike> = {
      order: { occurrenceDate: 'DESC' },
      take: 1000,
    };

    const where: FindManyOptions<LightningStrike>['where'] = {};

    if (query.startDate && query.endDate) {
      where.occurrenceDate = Between(
        new Date(query.startDate),
        new Date(query.endDate),
      );
    }

    options.where = where;

    let strikes = await this.repo.find(options);

    if (
      query.minLat !== undefined &&
      query.maxLat !== undefined &&
      query.minLon !== undefined &&
      query.maxLon !== undefined
    ) {
      strikes = strikes.filter(
        (s) =>
          Number(s.latitude) >= Number(query.minLat) &&
          Number(s.latitude) <= Number(query.maxLat) &&
          Number(s.longitude) >= Number(query.minLon) &&
          Number(s.longitude) <= Number(query.maxLon),
      );
    }

    return strikes;
  }
  async getSummaryMetrics() {
    const rawStats = await this.repo
      .createQueryBuilder('strike')
      .select('COUNT(strike.id)', 'totalEvents')
      .addSelect('AVG(strike.intensity)', 'averageIntensityKa')
      .addSelect('MAX(strike.intensity)', 'maxIntensityKa')
      .addSelect('MIN(strike.intensity)', 'minIntensityKa')
      .getRawOne();

    const strikes = await this.repo.find({
      select: ['id', 'intensity'],
    });

    const riskDistribution = {
      [RiskLevel.BAIXO]: 0,
      [RiskLevel.MEDIO]: 0,
      [RiskLevel.ALTO]: 0,
    };

    strikes.forEach((item) => {
      const level = ClassifyLightningRisk(
        item.intensity !== null ? Number(item.intensity) : null,
      );
      riskDistribution[level]++;
    });

    return {
      totalEvents: Number(rawStats?.totalEvents || 0),
      averageIntensityKa: Number(
        Number(rawStats?.averageIntensityKa || 0).toFixed(2),
      ),
      maxIntensityKa: Number(rawStats?.maxIntensityKa || 0),
      minIntensityKa: Number(rawStats?.minIntensityKa || 0),
      riskDistribution,
    };
  }

  private identifyCity(lat: number, lon: number): string {
    const latNum = Number(lat);
    const lonNum = Number(lon);

    if (Math.abs(latNum - -25.4284) < 0.1) return 'Curitiba';
    if (Math.abs(latNum - -12.9714) < 0.1) return 'Salvador';
    if (Math.abs(latNum - -19.9167) < 0.1) return 'Belo Horizonte';
    if (Math.abs(latNum - -22.9068) < 0.1) return 'Rio de Janeiro';
    if (Math.abs(latNum - -3.7172) < 0.1) return 'Fortaleza';
    if (Math.abs(latNum - -23.5505) < 0.1) return 'São Paulo';
    if (Math.abs(latNum - -30.0346) < 0.1) return 'Porto Alegre';
    if (Math.abs(latNum - -15.7975) < 0.1) return 'Brasília';
    if (Math.abs(latNum - -16.6869) < 0.1) return 'Goiânia';
    if (Math.abs(latNum - -3.119) < 0.1) return 'Manaus';
    if (Math.abs(latNum - -1.4558) < 0.1) return 'Belém';
    if (Math.abs(latNum - -8.0476) < 0.1) return 'Recife';
    if (Math.abs(latNum - -15.6014) < 0.1) return 'Cuiabá';
    if (Math.abs(latNum - -20.4697) < 0.1) return 'Campo Grande';
    if (Math.abs(latNum - -27.5954) < 0.1) return 'Florianópolis';

    return `Coord (${latNum.toFixed(2)}, ${lonNum.toFixed(2)})`;
  }

  async getLocationRanking(limit = 15) {
    const rawData = await this.repo
      .createQueryBuilder('strike')
      .select('strike.latitude', 'latitude')
      .addSelect('strike.longitude', 'longitude')
      .addSelect('COUNT(strike.id)', 'count')
      .addSelect('ROUND(AVG(strike.intensity), 2)', 'avgIntensityKa')
      .where('strike.intensity IS NOT NULL')
      .groupBy('strike.latitude, strike.longitude')
      .orderBy('count', 'DESC')
      .limit(limit)
      .getRawMany();

    return rawData.map((item) => ({
      city: this.identifyCity(item.latitude, item.longitude),
      latitude: item.latitude,
      longitude: item.longitude,
      count: Number(item.count),
      avgIntensityKa: Number(item.avgIntensityKa || 0),
    }));
  }

  async getPeakHours() {
    const hoursData = await this.repo
      .createQueryBuilder('strike')
      .select('HOUR(strike.occurrenceDate)', 'hour')
      .addSelect('COUNT(strike.id)', 'count')
      .where('strike.intensity IS NOT NULL')
      .groupBy('HOUR(strike.occurrenceDate)')
      .orderBy('hour', 'ASC')
      .getRawMany();

    return hoursData.map((item) => ({
      hour: Number(item.hour),
      formattedHour: `${String(item.hour).padStart(2, '0')}:00`,
      count: Number(item.count),
    }));
  }
}