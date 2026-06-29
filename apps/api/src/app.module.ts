import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { KnowledgeGraphModule } from './modules/knowledge-graph/graph.module';
import { QuestionsModule } from './modules/questions/questions.module';
import { TrackerModule } from './modules/learning-tracker/tracker.module';

@Module({
  imports: [
    // Global config — loads .env automatically
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),

    // Rate limiting: 100 req / 60s per IP
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (_config: ConfigService) => [
        {
          ttl: 60000,
          limit: 100,
        },
      ],
    }),

    // Global infrastructure (available everywhere via @Global())
    PrismaModule,
    RedisModule,

    // Feature modules
    AuthModule,
    UsersModule,
    KnowledgeGraphModule,
    QuestionsModule,
    TrackerModule,
  ],
})
export class AppModule {}

