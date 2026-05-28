import Database from 'better-sqlite3';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const dbPath = process.env.DB_PATH || './data/radio.db';
// 相对于 server/ 目录解析
const absoluteDbPath = path.resolve(__dirname, '../../', dbPath);

const db = new Database(absoluteDbPath);

// 启用 WAL 模式，提升并发读写性能
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export default db;
