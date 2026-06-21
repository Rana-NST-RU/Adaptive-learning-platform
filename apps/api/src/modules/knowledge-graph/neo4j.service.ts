// ─────────────────────────────────────────────────────────────────────────────
// Neo4j Driver Service
// Manages a singleton connection to Neo4j AuraDB.
// ─────────────────────────────────────────────────────────────────────────────

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import neo4j, { Driver, Session, QueryResult, Record as Neo4jRecord } from 'neo4j-driver';

@Injectable()
export class Neo4jService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(Neo4jService.name);
  private driver: Driver;
  private database: string;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const uri = this.config.get<string>('NEO4J_URI')!;
    const username = this.config.get<string>('NEO4J_USERNAME')!;
    const password = this.config.get<string>('NEO4J_PASSWORD')!;
    this.database = this.config.get<string>('NEO4J_DATABASE') ?? 'neo4j';

    this.driver = neo4j.driver(
      uri,
      neo4j.auth.basic(username, password),
      {
        maxConnectionPoolSize: 10,
        connectionAcquisitionTimeout: 10_000,
      },
    );

    try {
      await this.driver.verifyConnectivity({ database: this.database });
      this.logger.log(`✅ Neo4j AuraDB connected — ${uri} (db: ${this.database})`);
    } catch (err) {
      this.logger.error('❌ Neo4j connection failed', err);
      throw err;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.driver.close();
    this.logger.log('Neo4j driver closed');
  }

  // ─── Public Helpers ───────────────────────────────────────────────────────

  /**
   * Run a read-only Cypher query and return mapped records.
   * @param cypher   Cypher query string
   * @param params   Named parameters
   */
  async runQuery<T = Record<string, any>>(
    cypher: string,
    params: Record<string, any> = {},
  ): Promise<T[]> {
    const session: Session = this.driver.session({
      defaultAccessMode: neo4j.session.READ,
      database: this.database,
    });
    try {
      const result: QueryResult = await session.run(cypher, params);
      return result.records.map((record: Neo4jRecord) => this.recordToObject<T>(record));
    } finally {
      await session.close();
    }
  }

  /**
   * Run a write Cypher query (CREATE / MERGE / SET / DELETE).
   */
  async runWrite<T = Record<string, any>>(
    cypher: string,
    params: Record<string, any> = {},
  ): Promise<T[]> {
    const session: Session = this.driver.session({
      defaultAccessMode: neo4j.session.WRITE,
      database: this.database,
    });
    try {
      const result: QueryResult = await session.run(cypher, params);
      return result.records.map((record: Neo4jRecord) => this.recordToObject<T>(record));
    } finally {
      await session.close();
    }
  }

  // ─── Private Utilities ────────────────────────────────────────────────────

  /**
   * Recursively converts a Neo4j record (which may contain Integer, Node,
   * Relationship, etc.) into a plain JavaScript object.
   */
  private recordToObject<T>(record: Neo4jRecord): T {
    const obj: Record<string, any> = {};
    for (const key of record.keys) {
      obj[key as string] = this.toPlain(record.get(key as string));
    }
    return obj as T;
  }

  private toPlain(value: any): any {
    if (value === null || value === undefined) return value;
    // Neo4j Integer → JS number
    if (neo4j.isInt(value)) return value.toNumber();
    // Neo4j Node → plain properties object
    if (value && value.labels && value.properties) {
      return this.toPlain(value.properties);
    }
    // Neo4j Relationship → plain object
    if (value && value.type && value.properties) {
      return { ...this.toPlain(value.properties), _type: value.type };
    }
    // Arrays
    if (Array.isArray(value)) return value.map((v) => this.toPlain(v));
    // Plain objects
    if (typeof value === 'object') {
      const result: Record<string, any> = {};
      for (const k of Object.keys(value)) {
        result[k] = this.toPlain(value[k]);
      }
      return result;
    }
    return value;
  }
}
