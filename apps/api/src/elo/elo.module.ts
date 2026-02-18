import { Module } from '@nestjs/common';
import { EloService } from './elo.service';
import { NextBestActionEngine } from './next-best-action.engine';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [EloService, NextBestActionEngine],
  exports: [EloService, NextBestActionEngine],
})
export class EloModule {}
