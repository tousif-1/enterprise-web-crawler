import { DatabaseConnection } from '../connection';

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}

export interface WhereClause {
  [key: string]: any;
}

export abstract class BaseRepository<T> {
  protected tableName: string;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  /**
   * Find a record by ID
   */
  async findById(id: string): Promise<T | null> {
    const query = `SELECT * FROM ${this.tableName} WHERE id = $1`;
    const result = await DatabaseConnection.query(query, [id]);
    
    return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
  }

  /**
   * Find all records with optional filtering and pagination
   */
  async findAll(where?: WhereClause, options?: QueryOptions): Promise<T[]> {
    let query = `SELECT * FROM ${this.tableName}`;
    const params: any[] = [];
    let paramIndex = 1;

    // Add WHERE clause
    if (where && Object.keys(where).length > 0) {
      const whereConditions = Object.keys(where).map(key => {
        params.push(where[key]);
        return `${key} = $${paramIndex++}`;
      });
      query += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    // Add ORDER BY
    if (options?.orderBy) {
      const direction = options.orderDirection || 'ASC';
      query += ` ORDER BY ${options.orderBy} ${direction}`;
    }

    // Add LIMIT and OFFSET
    if (options?.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ` OFFSET $${paramIndex++}`;
      params.push(options.offset);
    }

    const result = await DatabaseConnection.query(query, params);
    return result.rows.map(row => this.mapRowToEntity(row));
  }

  /**
   * Find one record matching criteria
   */
  async findOne(where: WhereClause): Promise<T | null> {
    const results = await this.findAll(where, { limit: 1 });
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Create a new record
   */
  async create(data: Partial<T>): Promise<T> {
    const columns = Object.keys(data).join(', ');
    const placeholders = Object.keys(data).map((_, index) => `$${index + 1}`).join(', ');
    const values = Object.values(data) as (string | number | boolean | Date | null | undefined)[];

    const query = `
      INSERT INTO ${this.tableName} (${columns})
      VALUES (${placeholders})
      RETURNING *
    `;

    const result = await DatabaseConnection.query(query, values);
    return this.mapRowToEntity(result.rows[0]);
  }

  /**
   * Update a record by ID
   */
  async update(id: string, data: Partial<T>): Promise<T | null> {
    const columns = Object.keys(data);
    const setClause = columns.map((col, index) => `${col} = $${index + 2}`).join(', ');
    const values = [id, ...Object.values(data)] as (string | number | boolean | Date | null | undefined)[];

    const query = `
      UPDATE ${this.tableName}
      SET ${setClause}
      WHERE id = $1
      RETURNING *
    `;

    const result = await DatabaseConnection.query(query, values);
    return result.rows.length > 0 ? this.mapRowToEntity(result.rows[0]) : null;
  }

  /**
   * Delete a record by ID
   */
  async delete(id: string): Promise<boolean> {
    const query = `DELETE FROM ${this.tableName} WHERE id = $1`;
    const result = await DatabaseConnection.query(query, [id]);
    return (result.rowCount || 0) > 0;
  }

  /**
   * Count records matching criteria
   */
  async count(where?: WhereClause): Promise<number> {
    let query = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    const params: any[] = [];
    let paramIndex = 1;

    if (where && Object.keys(where).length > 0) {
      const whereConditions = Object.keys(where).map(key => {
        params.push(where[key]);
        return `${key} = $${paramIndex++}`;
      });
      query += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    const result = await DatabaseConnection.query(query, params);
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Execute a custom query
   */
  protected async executeQuery(query: string, params?: (string | number | boolean | Date | null | undefined)[]): Promise<any> {
    return await DatabaseConnection.query(query, params);
  }

  /**
   * Execute multiple operations in a transaction
   */
  protected async transaction<R>(callback: (client: any) => Promise<R>): Promise<R> {
    return await DatabaseConnection.transaction(callback);
  }

  /**
   * Map database row to entity - must be implemented by subclasses
   */
  protected abstract mapRowToEntity(row: any): T;

  /**
   * Convert camelCase to snake_case for database columns
   */
  protected toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  /**
   * Convert snake_case to camelCase for entity properties
   */
  protected toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * Convert entity object to database row format
   */
  protected entityToRow(entity: Partial<T>): any {
    const row: any = {};
    for (const [key, value] of Object.entries(entity)) {
      row[this.toSnakeCase(key)] = value;
    }
    return row;
  }

  /**
   * Convert database row to entity format
   */
  protected rowToEntity(row: any): any {
    const entity: any = {};
    for (const [key, value] of Object.entries(row)) {
      entity[this.toCamelCase(key)] = value;
    }
    return entity;
  }
}