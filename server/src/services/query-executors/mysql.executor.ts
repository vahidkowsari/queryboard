import mysql from 'mysql2/promise'
import type { QueryExecutor, MySQLDbConfig } from '../../types.js'

const MYSQL_RULES = `MYSQL SQL RULES:
- Use backticks for identifier quoting: \`table_name\`.\`column_name\`.
- Use LIMIT for result size restriction.
- CAST syntax: CAST(col AS SIGNED), CAST(col AS DECIMAL(10,2)), CAST(col AS DATE).
- String functions: CONCAT(), SUBSTRING(), LENGTH(), TRIM(), REPLACE().
- Date functions: DATE_FORMAT(), YEAR(), MONTH(), DAY(), NOW(), CURDATE(), DATEDIFF().
- Use GROUP_CONCAT() for string aggregation.
- Use IFNULL() or COALESCE() for null handling.
- MySQL supports window functions (8.0+): ROW_NUMBER(), RANK(), etc.
- Use LIKE for pattern matching (case-insensitive by default with utf8 collations).
- Use EXPLAIN to understand query plans if performance is an issue.`

export function createMySQLExecutor(dbConfig: MySQLDbConfig): QueryExecutor {
  const poolPromise = mysql.createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
    waitForConnections: true,
    connectionLimit: 5,
  })

  return {
    sqlRules: MYSQL_RULES,
    async execute(sql: string) {
      console.log('MySQL: Running query:', sql)
      const [rows, fields] = await poolPromise.query(sql)
      const columns = (fields as mysql.FieldPacket[]).map((f) => f.name)
      const dataRows = (rows as mysql.RowDataPacket[]).map((row) =>
        columns.map((col) => (row[col] != null ? String(row[col]) : '')),
      )
      console.log(`MySQL: Got ${columns.length} columns, ${dataRows.length} rows`)
      return { columns, rows: dataRows }
    },
  }
}
