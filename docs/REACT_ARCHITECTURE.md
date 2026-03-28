# ReAct Architecture

## Overview

QueryBoard agents now use the **ReAct (Reasoning + Acting) architecture** for explicit state management and workflow orchestration. This provides better observability, debugging, and control over agent decision-making.

## What is ReAct?

ReAct is an agentic pattern where the LLM alternates between two phases:

1. **Reasoning (Think)**: LLM explains its thought process
2. **Acting (Do)**: LLM calls a tool based on its reasoning
3. **Observing**: Tool results are fed back to the LLM
4. **Loop**: Repeat until goal is achieved

## Architecture Components

### 1. **ReAct Orchestrator** (`react-orchestrator.ts`)

The core orchestrator that manages workflow execution:

```typescript
interface ReActState<TResult> {
  input: string                    // User's original query
  intermediateSteps: IntermediateStep[]  // Full audit trail
  conversationHistory: ModelMessage[]    // LLM conversation
  nextAction: string | null        // Next tool to execute
  isComplete: boolean              // Workflow completion flag
  result: TResult | null           // Final result
  metadata: Record<string, unknown>  // Additional context
}

interface IntermediateStep {
  stepNumber: number
  thought: string          // LLM's reasoning
  action: string           // Tool name called
  actionInput: any         // Tool parameters
  observation: any         // Tool result
  timestamp: Date
}
```

### 2. **Workflow Nodes**

Each agent has two main nodes:

#### **Reasoning Node**
- Calls LLM with current state and available tools
- LLM decides which tool to call (or finish)
- Captures the LLM's "thinking" text
- Updates conversation history
- Returns next action to take

#### **Acting Node**
- Executes the tool decided by reasoning node
- Captures tool results as observations
- Creates intermediate step record
- Checks if this is the terminal action (e.g., `create_chart`, `answer_question`)

### 3. **Router**

Conditional routing logic that decides which node to execute next:

```typescript
function router(state: ReActState): string | 'END' {
  if (state.isComplete) return 'END'
  if (state.nextAction === 'create_chart') return 'act'
  // Alternate between reasoning and acting
  return state.intermediateSteps.length % 2 === 0 ? 'reason' : 'act'
}
```

## Agent Implementations

### Chart Agent (`chart-agent.ts`)

**State**: `ChartReActState`
- Includes schema, executor, chart library config
- Tracks token usage, steps, color config

**Workflow**:
1. **reason** → LLM decides: list_tables, get_columns, run_query, or create_chart
2. **act** → Execute the tool
3. **reason** → LLM sees results, decides next action
4. Loop until `create_chart` is called
5. **END** → Return chart result

**Max Steps**: 20

### QA Agent (`qa-agent.ts`)

**State**: `QAReActState`
- Includes schema, executor, conversation history
- Tracks token usage, steps

**Workflow**:
1. **reason** → LLM decides: explore schema, run query, or answer_question
2. **act** → Execute the tool
3. **reason** → LLM sees results, decides next action
4. Loop until `answer_question` is called
5. **END** → Return answer

**Max Steps**: 10

## Benefits Over Previous Implementation

### Before (Implicit Loop)
```typescript
for (let turn = 0; turn < MAX_TURNS; turn++) {
  const result = await generateText({...})
  // State scattered across variables
  // Hard to debug decision flow
  messages.push(...result.response.messages)
}
```

### After (Explicit ReAct)
```typescript
const workflow = new ReActWorkflowBuilder()
  .addNode('reason', reasoningNode)
  .addNode('act', actingNode)
  .setRouter(chartRouter)
  .build()

const orchestrator = new ReActOrchestrator(workflow)
const finalState = await orchestrator.execute(initialState)
```

**Advantages**:
- ✅ **Centralized State**: All context in one `ReActState` object
- ✅ **Full Audit Trail**: Every thought, action, and observation tracked
- ✅ **Better Debugging**: Can inspect state at each step
- ✅ **Explicit Flow**: Clear visualization of agent workflow
- ✅ **Modular Nodes**: Easier to test and modify individual steps
- ✅ **Extensible**: Easy to add new nodes or routing logic

## Observability

### Intermediate Steps

Each step captures:
```typescript
{
  stepNumber: 3,
  thought: "I need to check the orders table structure",
  action: "get_columns",
  actionInput: { table_name: "orders" },
  observation: "columns: [id, customer_id, total, created_at]",
  timestamp: "2026-03-27T20:45:00Z"
}
```

### Callbacks

The orchestrator supports callbacks for real-time monitoring:

```typescript
const orchestrator = new ReActOrchestrator(workflow, {
  onStep: (step) => {
    console.log(`Step ${step.stepNumber}: ${step.action}`)
    // Stream to UI
  },
  onStateChange: (state) => {
    // Track state evolution
  }
})
```

## Future Enhancements

### Checkpointing
Save state at each step to resume interrupted workflows:
```typescript
const orchestrator = new ReActOrchestrator(workflow, {
  checkpointer: new DatabaseCheckpointer()
})
```

### Human-in-the-Loop
Pause for approval on critical actions:
```typescript
function router(state: ReActState): string | 'END' {
  if (state.nextAction === 'delete_data') {
    return 'human_approval'
  }
  return 'act'
}
```

### Multi-Agent Routing
Route between specialized agents:
```typescript
function router(state: ReActState): string | 'END' {
  if (state.input.includes('chart')) return 'chart_agent'
  if (state.input.includes('question')) return 'qa_agent'
  return 'general_agent'
}
```

## Comparison to LangGraph

| Feature | QueryBoard ReAct | LangGraph |
|---------|------------------|-----------|
| Language | TypeScript | Python/TypeScript |
| State Management | ✅ Explicit | ✅ Explicit |
| Workflow Nodes | ✅ Custom | ✅ Custom |
| Conditional Routing | ✅ Yes | ✅ Yes |
| Checkpointing | ⚠️ Future | ✅ Built-in |
| Visual Debugging | ❌ No | ✅ LangGraph Studio |
| Complexity | Low | Medium |
| Integration | Native | External |

## Code Examples

### Creating a Custom Workflow

```typescript
import { ReActWorkflowBuilder, ReActOrchestrator } from './react-orchestrator'

// Define your state
interface MyAgentState extends ReActState<MyResult> {
  customField: string
}

// Define nodes
async function myReasonNode(state: MyAgentState) {
  // Your reasoning logic
  return { nextAction: 'my_tool' }
}

async function myActNode(state: MyAgentState) {
  // Your action logic
  return { isComplete: true, result: {...} }
}

// Build workflow
const workflow = new ReActWorkflowBuilder<MyAgentState>()
  .addNode('reason', myReasonNode)
  .addNode('act', myActNode)
  .setRouter((state) => state.isComplete ? 'END' : 'reason')
  .setMaxSteps(15)
  .build()

// Execute
const orchestrator = new ReActOrchestrator(workflow)
const result = await orchestrator.execute(initialState)
```

## Debugging Tips

### View Intermediate Steps
```typescript
const finalState = await orchestrator.execute(initialState)
console.log('Agent Steps:')
finalState.intermediateSteps.forEach(step => {
  console.log(`${step.stepNumber}. [${step.action}]`)
  console.log(`   Thought: ${step.thought}`)
  console.log(`   Result: ${JSON.stringify(step.observation)}`)
})
```

### Track Token Usage
```typescript
console.log('Token Usage:', finalState.tokenUsage)
// { promptTokens: 1234, completionTokens: 567, totalTokens: 1801 }
```

### Inspect Conversation History
```typescript
finalState.conversationHistory.forEach(msg => {
  console.log(`${msg.role}: ${msg.content}`)
})
```

## Migration Notes

The ReAct architecture is **fully backward compatible**. The `runChartAgent` and `runQAAgent` functions maintain the same signatures and return types. No changes needed in:

- ✅ Routes (`agents.ts`)
- ✅ Frontend components
- ✅ API contracts
- ✅ Streaming SSE events

The only difference is internal implementation - agents now use explicit state management and workflow orchestration.
