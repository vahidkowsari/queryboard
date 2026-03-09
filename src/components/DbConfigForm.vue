<template>
  <template v-if="dbEngine === 'athena'">
    <div v-if="layout === 'grid'" class="grid grid-cols-2 gap-3">
      <div>
        <label class="block text-sm font-medium mb-2">Database</label>
        <Input :model-value="athena.database" @update:model-value="update('athena', 'database', $event)" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-2">Workgroup</label>
        <Input :model-value="athena.workgroup" @update:model-value="update('athena', 'workgroup', $event)" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-2">Region</label>
        <Input :model-value="athena.region" @update:model-value="update('athena', 'region', $event)" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-2">Profile</label>
        <Input :model-value="athena.profile" @update:model-value="update('athena', 'profile', $event)" />
      </div>
    </div>
    <template v-else>
      <div>
        <label class="block text-sm font-medium mb-2">Database</label>
        <Input
          :model-value="athena.database"
          @update:model-value="update('athena', 'database', $event)"
          placeholder="my_database"
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-2">Workgroup</label>
        <Input
          :model-value="athena.workgroup"
          @update:model-value="update('athena', 'workgroup', $event)"
          placeholder="primary"
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-2">AWS Region</label>
        <Input
          :model-value="athena.region"
          @update:model-value="update('athena', 'region', $event)"
          placeholder="us-east-1"
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-2">AWS SSO Profile</label>
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
        <label class="block text-sm font-medium mb-2">Host</label>
        <Input
          :model-value="rdbms.host"
          @update:model-value="update('rdbms', 'host', $event)"
          :placeholder="dbEngine === 'redshift' ? 'cluster.region.redshift.amazonaws.com' : 'localhost'"
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-2">Port</label>
        <Input
          :model-value="rdbms.port"
          @update:model-value="update('rdbms', 'port', $event)"
          type="number"
          :placeholder="dbEngine === 'mysql' ? '3306' : '5432'"
        />
      </div>
    </div>
    <div>
      <label class="block text-sm font-medium mb-2">Database</label>
      <Input
        :model-value="rdbms.database"
        @update:model-value="update('rdbms', 'database', $event)"
        placeholder="my_database"
      />
    </div>
    <div>
      <label class="block text-sm font-medium mb-2">User</label>
      <Input :model-value="rdbms.user" @update:model-value="update('rdbms', 'user', $event)" placeholder="username" />
    </div>
    <div>
      <label class="block text-sm font-medium mb-2">Password</label>
      <Input
        :model-value="rdbms.password"
        @update:model-value="update('rdbms', 'password', $event)"
        type="password"
        placeholder="password"
      />
    </div>
  </template>

  <template v-if="dbEngine === 'bigquery'">
    <div>
      <label class="block text-sm font-medium mb-2">GCP Project ID</label>
      <Input
        :model-value="bigquery.projectId"
        @update:model-value="update('bigquery', 'projectId', $event)"
        placeholder="my-gcp-project"
      />
    </div>
    <div>
      <label class="block text-sm font-medium mb-2">Dataset</label>
      <Input
        :model-value="bigquery.dataset"
        @update:model-value="update('bigquery', 'dataset', $event)"
        placeholder="my_dataset"
      />
    </div>
  </template>
</template>

<script setup lang="ts">
import Input from './ui/input.vue'
import type { DbEngine } from '../types'
import type { AthenaFormData, RdbmsFormData, BigQueryFormData } from '../utils/buildDbConfig'

interface Props {
  dbEngine: DbEngine
  athena: AthenaFormData
  rdbms: RdbmsFormData
  bigquery: BigQueryFormData
  layout?: 'grid' | 'stack'
}

const props = withDefaults(defineProps<Props>(), {
  layout: 'stack',
})

const emit = defineEmits<{
  'update:athena': [value: AthenaFormData]
  'update:rdbms': [value: RdbmsFormData]
  'update:bigquery': [value: BigQueryFormData]
}>()

function update(group: 'athena' | 'rdbms' | 'bigquery', key: string, value: string | number) {
  if (group === 'athena') {
    emit('update:athena', { ...props.athena, [key]: value })
  } else if (group === 'rdbms') {
    emit('update:rdbms', { ...props.rdbms, [key]: value })
  } else {
    emit('update:bigquery', { ...props.bigquery, [key]: value })
  }
}
</script>
