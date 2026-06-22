/**
 * Direct Neo4j write/read test — bypasses all NestJS service abstractions.
 * Run: node test-neo4j.mjs
 */
import neo4j from 'neo4j-driver';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

// Load root .env
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../../.env');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf-8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim()))
    .map(([k, ...v]) => [k, v.join('=').replace(/^"|"$/g, '')])
);

const URI      = env.NEO4J_URI;
const USER     = env.NEO4J_USERNAME;
const PASSWORD = env.NEO4J_PASSWORD;
const DATABASE = env.NEO4J_DATABASE;

console.log('🔌 Connecting to:', URI);
console.log('👤 Username:', USER);
console.log('🗄️  Database:', DATABASE);

const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));

async function run() {
  try {
    await driver.verifyConnectivity({ database: DATABASE });
    console.log('✅ Connected!\n');

    // ─── TEST 1: count existing nodes ──────────────────────────────
    console.log('1️⃣  Count existing Concept nodes...');
    const session1 = driver.session({ database: DATABASE, defaultAccessMode: neo4j.session.READ });
    const r1 = await session1.run('MATCH (c:Concept) RETURN count(c) AS n');
    console.log('   Result:', r1.records[0]?.get('n')?.toNumber?.() ?? r1.records[0]?.get('n'));
    await session1.close();

    // ─── TEST 2: write one node with session.run() ──────────────────
    console.log('\n2️⃣  Write test node via session.run()...');
    const session2 = driver.session({ database: DATABASE, defaultAccessMode: neo4j.session.WRITE });
    const r2 = await session2.run(
      'MERGE (n:__DiagTest {id: "diag-1"}) SET n.ts = $ts RETURN n.id AS id',
      { ts: Date.now() }
    );
    console.log('   Wrote:', r2.records[0]?.get('id'));
    await session2.close();

    // ─── TEST 3: read it back immediately ───────────────────────────
    console.log('\n3️⃣  Read back via session.run()...');
    const session3 = driver.session({ database: DATABASE, defaultAccessMode: neo4j.session.READ });
    const r3 = await session3.run('MATCH (n:__DiagTest {id: "diag-1"}) RETURN n.id AS id, n.ts AS ts');
    if (r3.records.length > 0) {
      console.log('   ✅ Node found! id:', r3.records[0].get('id'), 'ts:', r3.records[0].get('ts')?.toNumber?.());
    } else {
      console.log('   ❌ Node NOT found — writes are not persisting!');
    }
    await session3.close();

    // ─── TEST 4: write with session.executeWrite() ───────────────────
    console.log('\n4️⃣  Write test node via session.executeWrite()...');
    const session4 = driver.session({ database: DATABASE, defaultAccessMode: neo4j.session.WRITE });
    const r4 = await session4.executeWrite(tx =>
      tx.run('MERGE (n:__DiagTest {id: "diag-2"}) SET n.ts = $ts RETURN n.id AS id', { ts: Date.now() })
    );
    console.log('   Wrote:', r4.records[0]?.get('id'));
    await session4.close();

    // ─── TEST 5: read both ────────────────────────────────────────────
    console.log('\n5️⃣  Read all __DiagTest nodes...');
    const session5 = driver.session({ database: DATABASE, defaultAccessMode: neo4j.session.READ });
    const r5 = await session5.executeRead(tx =>
      tx.run('MATCH (n:__DiagTest) RETURN n.id AS id ORDER BY id')
    );
    console.log('   Found:', r5.records.map(r => r.get('id')));
    await session5.close();

    // ─── Cleanup ──────────────────────────────────────────────────────
    console.log('\n🧹 Cleanup...');
    const session6 = driver.session({ database: DATABASE, defaultAccessMode: neo4j.session.WRITE });
    await session6.executeWrite(tx => tx.run('MATCH (n:__DiagTest) DETACH DELETE n'));
    await session6.close();
    console.log('   Done.\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await driver.close();
  }
}

run();
