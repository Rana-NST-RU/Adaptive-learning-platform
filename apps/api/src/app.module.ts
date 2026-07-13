import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { KnowledgeGraphModule } from './modules/knowledge-graph/graph.module';
import { QuestionsModule } from './modules/questions/questions.module';
import { TrackerModule } from './modules/learning-tracker/tracker.module';
import { AdminModule } from './modules/admin/admin.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AppController } from './app.controller';

@Module({
  controllers: [AppController],
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

    // Cron jobs
    ScheduleModule.forRoot(),

    // Global infrastructure (available everywhere via @Global())
    PrismaModule,
    RedisModule,

    // Feature modules
    AuthModule,
    UsersModule,
    KnowledgeGraphModule,
    QuestionsModule,
    TrackerModule,
    AdminModule,
    NotificationsModule,
  ],
})
export class AppModule {}

