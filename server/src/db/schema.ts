import { pgTable, uuid, varchar, text, jsonb, integer, timestamp, index, numeric, unique, customType } from 'drizzle-orm/pg-core'

const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return 'bytea'
  },
})

export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  dbEngine: varchar('db_engine', { length: 50 }).notNull().default('athena'),
  dbConfig: jsonb('db_config').notNull().default({}),
  llmConfig: jsonb('llm_config'),
  chartLibrary: varchar('chart_library', { length: 50 }).default('vega-lite'),
  colorConfig: jsonb('color_config'),
  schemaCache: jsonb('schema_cache'),
  schemaDetectedAt: timestamp('schema_detected_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const dashboards = pgTable(
  'dashboards',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    shareToken: varchar('share_token', { length: 64 }).unique(),
    thumbnail: bytea('thumbnail'),
    refreshCron: varchar('refresh_cron', { length: 50 }),
    lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_dashboards_project_id').on(table.projectId),
    index('idx_dashboards_share_token').on(table.shareToken),
  ],
)

export const charts = pgTable(
  'charts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    dashboardId: uuid('dashboard_id')
      .notNull()
      .references(() => dashboards.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    userQuery: text('user_query'),
    description: text('description'),
    summary: text('summary'),
    query: text('query').notNull(),
    chartType: varchar('chart_type', { length: 50 }).default('auto'),
    chartSpec: jsonb('chart_spec'),
    data: jsonb('data'),
    colorConfig: jsonb('color_config'),
    filters: jsonb('filters'),
    position: integer('position').notNull().default(0),
    createdBy: varchar('created_by', { length: 128 }),
    lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_charts_dashboard_id').on(table.dashboardId)],
)

export const tokenUsage = pgTable(
  'token_usage',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    chartId: uuid('chart_id'),
    vendor: varchar('vendor', { length: 50 }).notNull(),
    model: varchar('model', { length: 100 }).notNull(),
    promptTokens: integer('prompt_tokens').notNull().default(0),
    completionTokens: integer('completion_tokens').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    estimatedCost: numeric('estimated_cost', { precision: 10, scale: 6 }),
    operation: varchar('operation', { length: 50 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_token_usage_project_id').on(table.projectId),
    index('idx_token_usage_created_at').on(table.createdAt),
  ],
)

export const groups = pgTable(
  'groups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_groups_project_id').on(table.projectId)],
)

export const groupMembers = pgTable(
  'group_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 128 }).notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_group_members_group_id').on(table.groupId),
    index('idx_group_members_user_id').on(table.userId),
    unique('uq_group_member').on(table.groupId, table.userId),
  ],
)

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 128 }).notNull(),
    title: varchar('title', { length: 255 }).notNull().default('New conversation'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_conversations_project_id').on(table.projectId),
    index('idx_conversations_user_id').on(table.userId),
  ],
)

export const conversationMessages = pgTable(
  'conversation_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 20 }).notNull(),
    content: text('content').notNull(),
    sql: text('sql'),
    data: jsonb('data'),
    columns: jsonb('columns'),
    steps: jsonb('steps'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_conversation_messages_conversation_id').on(table.conversationId)],
)

export const dashboardPermissions = pgTable(
  'dashboard_permissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    dashboardId: uuid('dashboard_id')
      .notNull()
      .references(() => dashboards.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 128 }),
    groupId: uuid('group_id').references(() => groups.id, { onDelete: 'cascade' }),
    permission: varchar('permission', { length: 20 }).notNull().default('view'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_dashboard_permissions_dashboard_id').on(table.dashboardId),
    index('idx_dashboard_permissions_user_id').on(table.userId),
    index('idx_dashboard_permissions_group_id').on(table.groupId),
  ],
)

export const schemaJobs = pgTable(
  'schema_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    phase: varchar('phase', { length: 30 }),
    message: text('message'),
    current: integer('current'),
    total: integer('total'),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_schema_jobs_project_id').on(table.projectId)],
)

export const conversationPermissions = pgTable(
  'conversation_permissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 128 }),
    groupId: uuid('group_id').references(() => groups.id, { onDelete: 'cascade' }),
    permission: varchar('permission', { length: 20 }).notNull().default('view'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_conversation_permissions_conversation_id').on(table.conversationId),
    index('idx_conversation_permissions_user_id').on(table.userId),
    index('idx_conversation_permissions_group_id').on(table.groupId),
  ],
)

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 128 }),
    action: varchar('action', { length: 50 }).notNull(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: uuid('entity_id'),
    entityName: varchar('entity_name', { length: 255 }),
    details: jsonb('details'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_audit_logs_project_id').on(table.projectId),
    index('idx_audit_logs_user_id').on(table.userId),
    index('idx_audit_logs_action').on(table.action),
    index('idx_audit_logs_entity_type').on(table.entityType),
    index('idx_audit_logs_created_at').on(table.createdAt),
  ],
)

export const refreshHistory = pgTable(
  'refresh_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    chartId: uuid('chart_id')
      .notNull()
      .references(() => charts.id, { onDelete: 'cascade' }),
    dashboardId: uuid('dashboard_id')
      .notNull()
      .references(() => dashboards.id, { onDelete: 'cascade' }),
    triggeredBy: varchar('triggered_by', { length: 128 }),
    triggerType: varchar('trigger_type', { length: 20 }).notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    executionTimeMs: integer('execution_time_ms'),
    rowCount: integer('row_count'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_refresh_history_chart_id').on(table.chartId),
    index('idx_refresh_history_dashboard_id').on(table.dashboardId),
    index('idx_refresh_history_created_at').on(table.createdAt),
  ],
)
