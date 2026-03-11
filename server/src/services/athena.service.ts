import {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
} from '@aws-sdk/client-athena'
import { fromSSO } from '@aws-sdk/credential-provider-sso'
import type { AthenaQueryResult, AthenaDbConfig } from '../types.js'

/**
 * Creates an AWS Athena client with optional SSO profile authentication
 */
export function createAthenaClient(dbConfig: AthenaDbConfig): AthenaClient {
  return new AthenaClient({
    region: dbConfig.region,
    ...(dbConfig.profile ? { credentials: fromSSO({ profile: dbConfig.profile }) } : {}),
  })
}

/**
 * Executes a SQL query on AWS Athena and polls for results
 * Waits up to 120 seconds for query completion
 */
export async function executeAthenaQuery(
  client: AthenaClient,
  dbConfig: AthenaDbConfig,
  query: string,
): Promise<AthenaQueryResult> {
  console.log('Athena: Starting query:', query)

  const startResponse = await client.send(
    new StartQueryExecutionCommand({
      QueryString: query,
      QueryExecutionContext: { Database: dbConfig.database },
      WorkGroup: dbConfig.workgroup,
    }),
  )
  const executionId = startResponse.QueryExecutionId!
  console.log('Athena: Execution ID:', executionId)

  const maxWait = 120_000
  const startTime = Date.now()
  let lastState = ''

  while (Date.now() - startTime < maxWait) {
    const statusResponse = await client.send(new GetQueryExecutionCommand({ QueryExecutionId: executionId }))
    const state = statusResponse.QueryExecution?.Status?.State || ''

    if (state !== lastState) {
      console.log(`Athena: State = ${state} (${Math.round((Date.now() - startTime) / 1000)}s)`)
      lastState = state
    }

    if (state === 'SUCCEEDED') break
    if (state === 'FAILED' || state === 'CANCELLED') {
      const reason = statusResponse.QueryExecution?.Status?.StateChangeReason
      throw new Error(`Query ${state}: ${reason}`)
    }

    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  if (lastState !== 'SUCCEEDED') {
    throw new Error('Query timed out after 120s. Try a simpler query.')
  }

  console.log('Athena: Fetching results...')
  const resultsResponse = await client.send(new GetQueryResultsCommand({ QueryExecutionId: executionId }))

  const columns = resultsResponse.ResultSet?.ResultSetMetadata?.ColumnInfo?.map((col) => col.Name || '') || []
  const rows =
    resultsResponse.ResultSet?.Rows?.slice(1).map((row) => row.Data?.map((cell) => cell.VarCharValue || '') || []) || []

  console.log(`Athena: Got ${columns.length} columns, ${rows.length} rows`)
  return { columns, rows, executionId }
}
