import { Module } from '@nestjs/common';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { LlmModule } from '../llm/llm.module';
import { TrackerModule } from '../learning-tracker/tracker.module';

@Module({
  imports: [LlmModule, TrackerModule],
  controllers: [QuestionsController],
  providers: [QuestionsService],
  exports: [QuestionsService],
})
export class QuestionsModule {}

