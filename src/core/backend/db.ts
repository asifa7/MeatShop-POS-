import { databaseProvider } from '../database/database_provider';
import Database from 'better-sqlite3';

export const dbManager = databaseProvider;
export const db: Database.Database = new Proxy({} as Database.Database, {
  get(_target, prop, receiver) {
    const raw = databaseProvider.getRawConnection();
    const value = Reflect.get(raw, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(raw);
    }
    return value;
  },
  set(_target, prop, value, receiver) {
    const raw = databaseProvider.getRawConnection();
    return Reflect.set(raw, prop, value, receiver);
  }
});
export type DatabaseConnection = Database.Database;

