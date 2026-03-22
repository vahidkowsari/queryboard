<template>
  <div :class="layout === 'grid' ? 'space-y-3' : 'space-y-3'">
    <template v-if="dbEngine === 'athena'">
      <div v-if="layout === 'grid'" class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-sm font-medium mb-1.5">Database</label>
          <Input :model-value="athena.database" @update:model-value="update('athena', 'database', $event)" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1.5">Workgroup</label>
          <Input :model-value="athena.workgroup" @update:model-value="update('athena', 'workgroup', $event)" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1.5">Region</label>
          <Input :model-value="athena.region" @update:model-value="update('athena', 'region', $event)" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1.5">Profile</label>
          <Input :model-value="athena.profile" @update:model-value="update('athena', 'profile', $event)" />
        </div>
      </div>
      <template v-else>
      <div>
        <label class="block text-sm font-medium mb-1.5">Database</label>
        <Input
          :model-value="athena.database"
          @update:model-value="update('athena', 'database', $event)"
          placeholder="my_database"
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Workgroup</label>
        <Input
          :model-value="athena.workgroup"
          @update:model-value="update('athena', 'workgroup', $event)"
          placeholder="primary"
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">AWS Region</label>
        <Input
          :model-value="athena.region"
          @update:model-value="update('athena', 'region', $event)"
          placeholder="us-east-1"
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">AWS SSO Profile</label>
        <Input
          :model-value="athena.profile"
          @update:model-value="update('athena', 'profile', $event)"
          placeholder="default"
        />
      </div>
    </template>
  </template>

  <template v-if="dbEngine === 'postgres' || dbEngine === 'mysql' || dbEngine === 'redshift'">
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="block text-sm font-medium mb-1.5">Host</label>
        <Input
          :model-value="rdbms.host"
          @update:model-value="update('rdbms', 'host', $event)"
          :placeholder="dbEngine === 'redshift' ? 'cluster.region.redshift.amazonaws.com' : 'localhost'"
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Port</label>
        <Input
          :model-value="rdbms.port"
          @update:model-value="update('rdbms', 'port', $event)"
          type="number"
          :placeholder="dbEngine === 'mysql' ? '3306' : '5432'"
        />
      </div>
    </div>
    <div>
      <label class="block text-sm font-medium mb-1.5">Database</label>
      <Input
        :model-value="rdbms.database"
        @update:model-value="update('rdbms', 'database', $event)"
        placeholder="my_database"
      />
    </div>
    <div>
      <label class="block text-sm font-medium mb-1.5">User</label>
      <Input :model-value="rdbms.user" @update:model-value="update('rdbms', 'user', $event)" placeholder="username" />
    </div>
    <div>
      <label class="block text-sm font-medium mb-1.5">Password</label>
      <Input
        :model-value="rdbms.password"
        @update:model-value="update('rdbms', 'password', $event)"
        type="password"
        placeholder="password"
      />
    </div>
    <div class="flex items-center gap-2">
      <input
        type="checkbox"
        :checked="rdbms.ssl"
        @change="update('rdbms', 'ssl', ($event.target as HTMLInputElement).checked)"
        id="ssl-enabled"
        class="w-4 h-4 rounded border-gray-300"
      />
      <label for="ssl-enabled" class="text-sm font-medium cursor-pointer">Enable SSL/TLS</label>
    </div>
    <div v-if="rdbms.ssl" class="flex items-center gap-2 ml-6">
      <input
        type="checkbox"
        :checked="rdbms.rejectUnauthorized !== false"
        @change="update('rdbms', 'rejectUnauthorized', !($event.target as HTMLInputElement).checked ? false : true)"
        id="ssl-verify"
        class="w-4 h-4 rounded border-gray-300"
      />
      <label for="ssl-verify" class="text-sm cursor-pointer">Verify SSL certificate (uncheck for self-signed certificates)</label>
    </div>
  </template>

  <template v-if="dbEngine === 'bigquery'">
    <div>
      <label class="block text-sm font-medium mb-1.5">GCP Project ID</label>
      <Input
        :model-value="bigquery.projectId"
        @update:model-value="update('bigquery', 'projectId', $event)"
        placeholder="my-gcp-project"
      />
    </div>
    <div>
      <label class="block text-sm font-medium mb-1.5">Dataset</label>
      <Input
        :model-value="bigquery.dataset"
        @update:model-value="update('bigquery', 'dataset', $event)"
        placeholder="my_dataset"
      />
    </div>
  </template>

  <template v-if="dbEngine === 'snowflake'">
    <div>
      <label class="block text-sm font-medium mb-1.5">Account</label>
      <Input
        :model-value="snowflake.account"
        @update:model-value="update('snowflake', 'account', $event)"
        placeholder="orgname-accountname"
      />
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="block text-sm font-medium mb-1.5">Username</label>
        <Input
          :model-value="snowflake.username"
          @update:model-value="update('snowflake', 'username', $event)"
          placeholder="username"
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Password</label>
        <Input
          :model-value="snowflake.password"
          @update:model-value="update('snowflake', 'password', $event)"
          type="password"
          placeholder="password"
        />
      </div>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="block text-sm font-medium mb-1.5">Database</label>
        <Input
          :model-value="snowflake.database"
          @update:model-value="update('snowflake', 'database', $event)"
          placeholder="my_database"
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Schema</label>
        <Input
          :model-value="snowflake.schema"
          @update:model-value="update('snowflake', 'schema', $event)"
          placeholder="public"
        />
      </div>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="block text-sm font-medium mb-1.5">Warehouse</label>
        <Input
          :model-value="snowflake.warehouse"
          @update:model-value="update('snowflake', 'warehouse', $event)"
          placeholder="compute_wh"
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Role (optional)</label>
        <Input
          :model-value="snowflake.role"
          @update:model-value="update('snowflake', 'role', $event)"
          placeholder="accountadmin"
        />
      </div>
    </div>
  </template>

  <template v-if="dbEngine === 'databricks'">
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="block text-sm font-medium mb-1.5">Host</label>
        <Input
          :model-value="databricks.host"
          @update:model-value="update('databricks', 'host', $event)"
          placeholder="dbc-xxxxx.cloud.databricks.com"
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Port</label>
        <Input
          :model-value="databricks.port"
          @update:model-value="update('databricks', 'port', $event)"
          type="number"
          placeholder="443"
        />
      </div>
    </div>
    <div>
      <label class="block text-sm font-medium mb-1.5">HTTP Path</label>
      <Input
        :model-value="databricks.httpPath"
        @update:model-value="update('databricks', 'httpPath', $event)"
        placeholder="/sql/1.0/warehouses/xxxxx"
      />
    </div>
    <div>
      <label class="block text-sm font-medium mb-1.5">Access Token</label>
      <Input
        :model-value="databricks.token"
        @update:model-value="update('databricks', 'token', $event)"
        type="password"
        placeholder="dapi..."
      />
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="block text-sm font-medium mb-1.5">Catalog</label>
        <Input
          :model-value="databricks.catalog"
          @update:model-value="update('databricks', 'catalog', $event)"
          placeholder="samples"
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Schema</label>
        <Input
          :model-value="databricks.schema"
          @update:model-value="update('databricks', 'schema', $event)"
          placeholder="nyctaxi"
        />
      </div>
    </div>
  </template>

  <!-- Test Connection Button -->
  <div v-if="showTestButton" class="pt-4 border-t">
    <Button 
      @click="testConnection" 
      :disabled="testing"
      variant="outline"
      class="w-full"
    >
      <Loader2 v-if="testing" :size="16" class="animate-spin mr-2" />
      {{ testing ? 'Testing Connection...' : 'Test Connection' }}
    </Button>
    
    <div 
      v-if="testResult" 
      :class="[
        'mt-3 px-3 py-2 rounded-md text-sm flex items-start gap-2',
        testResult.success ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-red-500/10 text-red-700 dark:text-red-400'
      ]"
    >
      <CheckCircle2 v-if="testResult.success" :size="16" class="shrink-0 mt-0.5" />
      <XCircle v-else :size="16" class="shrink-0 mt-0.5" />
      <span>{{ testResult.message }}</span>
    </div>
  </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Input from './ui/input.vue'
import Button from './ui/button.vue'
import { Loader2, CheckCircle2, XCircle } from 'lucide-vue-next'
import { API_BASE_URL } from '../services/api'
import { buildDbConfig } from '../utils/buildDbConfig'
import type { DbEngine } from '../types'
import type { AthenaFormData, RdbmsFormData, BigQueryFormData, SnowflakeFormData, DatabricksFormData } from '../utils/buildDbConfig'

interface Props {
  dbEngine: DbEngine
  athena: AthenaFormData
  rdbms: RdbmsFormData
  bigquery: BigQueryFormData
  snowflake: SnowflakeFormData
  databricks?: DatabricksFormData
  layout?: 'grid' | 'stack'
  showTestButton?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  layout: 'stack',
  showTestButton: true,
  databricks: () => ({ host: '', port: '443', httpPath: '', token: '', catalog: '', schema: '' }),
})

const emit = defineEmits<{
  'update:athena': [value: AthenaFormData]
  'update:rdbms': [value: RdbmsFormData]
  'update:bigquery': [value: BigQueryFormData]
  'update:snowflake': [value: SnowflakeFormData]
  'update:databricks': [value: DatabricksFormData]
}>()

const testing = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)

function update(group: 'athena' | 'rdbms' | 'bigquery' | 'snowflake' | 'databricks', key: string, value: string | number | boolean) {
  if (group === 'athena') {
    emit('update:athena', { ...props.athena, [key]: value })
  } else if (group === 'rdbms') {
    emit('update:rdbms', { ...props.rdbms, [key]: value })
  } else if (group === 'bigquery') {
    emit('update:bigquery', { ...props.bigquery, [key]: value })
  } else if (group === 'snowflake') {
    emit('update:snowflake', { ...props.snowflake, [key]: value })
  } else {
    emit('update:databricks', { ...props.databricks!, [key]: value })
  }
  testResult.value = null
}

async function testConnection() {
  testing.value = true
  testResult.value = null

  try {
    const dbConfig = buildDbConfig(props.dbEngine, props.athena, props.rdbms, props.bigquery, props.snowflake, props.databricks)
    
    const response = await fetch(`${API_BASE_URL}/api/projects/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ dbEngine: props.dbEngine, dbConfig }),
    })

    const data = await response.json()

    if (response.ok && data.success) {
      testResult.value = { success: true, message: data.message || 'Connection successful!' }
    } else {
      testResult.value = { success: false, message: data.error || 'Connection failed' }
    }
  } catch (err) {
    testResult.value = { 
      success: false, 
      message: err instanceof Error ? err.message : 'Failed to test connection' 
    }
  } finally {
    testing.value = false
  }
}
</script>
