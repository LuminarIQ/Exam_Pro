import { Module } from '@nestjs/common';
import { AttemptsController } from './attempts.controller';
import { AttemptsService } from './attempts.service';
import { EloModule } from '../elo/elo.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [EloModule, AiModule],
  controllers: [AttemptsController],
  providers: [AttemptsService],
})
export class AttemptsModule {}
