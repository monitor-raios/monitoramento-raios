import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { BackfillLightningDto } from './dto/backfill-lightning.dto';
import { QueryLightningDto } from './dto/query-lightning.dto';
import { LightningService } from './lightning.service';

@Controller('lightning')
export class LightningController {
  constructor(private readonly lightningService: LightningService) { }

  @Post('fetch')
  @HttpCode(HttpStatus.OK)
  async fetch() {
    const result = await this.lightningService.fetchAndStore();
    return {
      message: 'Coleta concluída',
      pontosConsultados: result.fetched,
      eventosArmazenados: result.stored,
    };
  }

  @Post('backfill')
  @HttpCode(HttpStatus.OK)
  async backfill(@Body() dto: BackfillLightningDto) {
    const result = await this.lightningService.backfill(dto);
    return {
      message: 'Backfill concluído',
      horasProcessadas: result.processed,
      eventosArmazenados: result.stored,
    };
  }

  @Get('analytics/summary')
  getSummary() {
    return this.lightningService.getSummaryMetrics();
  }

  @Get('analytics/ranking')
  getRanking(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 15;
    return this.lightningService.getLocationRanking(parsedLimit);
  }

  @Get('analytics/peak-hours')
  getPeakHours() {
    return this.lightningService.getPeakHours();
  }

  @Get()
  async findAll(@Query() query: QueryLightningDto) {
    return this.lightningService.findAll(query);
  }
}
