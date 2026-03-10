# Testing Guide

## Setup

### Test Database

Create a test database for running integration tests:

```bash
createdb queryboard_test
```

Or set a custom test database URL:

```bash
export TEST_DATABASE_URL="postgresql://localhost:5432/queryboard_test"
```

### Run Migrations

Apply migrations to the test database:

```bash
DATABASE_URL=$TEST_DATABASE_URL npm run migrate
```

## Running Tests

### Using Makefile (Recommended)

```bash
# One-time setup: Create and migrate test database
make test-setup

# Run all tests
make test

# Run tests in watch mode
make test-watch
```

### Using npm directly

```bash
# Run all tests
TEST_DATABASE_URL=postgresql://charting:charting_dev@localhost:5432/queryboard_test npm test

# Run tests in watch mode
TEST_DATABASE_URL=postgresql://charting:charting_dev@localhost:5432/queryboard_test npm run test:watch

# Run specific test file
TEST_DATABASE_URL=postgresql://charting:charting_dev@localhost:5432/queryboard_test npx vitest run src/__tests__/services/conversation.service.test.ts
```

## Test Structure

- `__tests__/helpers/` - Test utilities and fixtures
  - `test-db.ts` - Database setup and cleanup
  - `test-fixtures.ts` - Factory functions for creating test data

- `__tests__/services/` - Service layer unit tests
  - Tests business logic in isolation

- `__tests__/routes/` - API endpoint integration tests (TODO)
  - Tests HTTP endpoints with supertest

## Writing Tests

### Service Tests

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { setupTestDb, cleanupTestDb, clearAllTables } from '../helpers/test-db.js'

describe('MyService', () => {
  let db: Db

  beforeEach(async () => {
    db = await setupTestDb()
    await clearAllTables(db)
  })

  afterAll(async () => {
    await cleanupTestDb()
  })

  it('should do something', async () => {
    // Test implementation
  })
})
```

### Endpoint Tests (TODO)

```typescript
import request from 'supertest'
import { app } from '../../index.js'

describe('GET /api/projects', () => {
  it('should list projects', async () => {
    const response = await request(app)
      .get('/api/projects')
      .expect(200)
    
    expect(response.body).toBeInstanceOf(Array)
  })
})
```

## Current Coverage

- ✅ ConversationService - Full coverage of CRUD operations and authorization
- ⏳ Other services - TODO
- ⏳ API endpoints - TODO
