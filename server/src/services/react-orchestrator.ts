import type { ModelMessage } from 'ai'

/**
 * ReAct Agent State - Tracks the complete state of an agent workflow
 */
export interface ReActState<TResult = unknown> {
  input: string
  intermediateSteps: IntermediateStep[]
  conversationHistory: ModelMessage[]
  nextAction: string | null
  isComplete: boolean
  result: TResult | null
  metadata: Record<string, unknown>
}

/**
 * Intermediate step in the ReAct loop - captures thought, action, and observation
 */
export interface IntermediateStep {
  stepNumber: number
  thought: string
  action: string
  actionInput: Record<string, unknown>
  observation: unknown
  timestamp: Date
}

/**
 * Node function in the ReAct workflow
 */
export type ReActNode<TState extends ReActState> = (state: TState) => Promise<Partial<TState>>

/**
 * Conditional router function - decides which node to execute next
 */
export type ReActRouter<TState extends ReActState> = (state: TState) => string | 'END'

/**
 * ReAct workflow configuration
 */
export interface ReActWorkflow<TState extends ReActState> {
  nodes: Map<string, ReActNode<TState>>
  router: ReActRouter<TState>
  entryPoint: string
  maxSteps: number
  reasoningNodeName?: string // Optional: name of the reasoning node to track cycles
}

/**
 * ReAct Orchestrator - Manages the execution of ReAct workflows
 */
export class ReActOrchestrator<TState extends ReActState> {
  private workflow: ReActWorkflow<TState>
  private onStepCallback?: (step: IntermediateStep) => void
  private onStateChangeCallback?: (state: TState) => void

  constructor(
    workflow: ReActWorkflow<TState>,
    callbacks?: {
      onStep?: (step: IntermediateStep) => void
      onStateChange?: (state: TState) => void
    }
  ) {
    this.workflow = workflow
    this.onStepCallback = callbacks?.onStep
    this.onStateChangeCallback = callbacks?.onStateChange
  }

  /**
   * Execute the ReAct workflow from initial state
   */
  async execute(initialState: TState): Promise<TState> {
    let currentState = { ...initialState }
    let currentNode = this.workflow.entryPoint
    let totalSteps = 0
    let reasoningCycles = 0
    const reasoningNodeName = this.workflow.reasoningNodeName || 'reason'

    while (currentNode !== 'END' && totalSteps < this.workflow.maxSteps * 10) { // Safety: 10x buffer
      totalSteps++

      // Track reasoning cycles for more intuitive limits
      if (currentNode === reasoningNodeName) {
        reasoningCycles++
        if (reasoningCycles > this.workflow.maxSteps) {
          throw new Error(`ReAct workflow exceeded maximum reasoning cycles (${this.workflow.maxSteps})`)
        }
      }

      const nodeFunction = this.workflow.nodes.get(currentNode)
      if (!nodeFunction) {
        throw new Error(`Node "${currentNode}" not found in workflow`)
      }

      // Execute node and merge state updates
      const stateUpdate = await nodeFunction(currentState)
      currentState = { ...currentState, ...stateUpdate }

      // Notify state change
      this.onStateChangeCallback?.(currentState)

      // Check if workflow is complete
      if (currentState.isComplete) {
        break
      }

      // Route to next node
      currentNode = this.workflow.router(currentState)
    }

    if (totalSteps >= this.workflow.maxSteps * 10) {
      throw new Error(`ReAct workflow exceeded maximum total steps (${this.workflow.maxSteps * 10}) - possible infinite loop`)
    }

    return currentState
  }

  /**
   * Helper to add an intermediate step to state
   */
  static addStep<TState extends ReActState>(
    state: TState,
    thought: string,
    action: string,
    actionInput: Record<string, unknown>,
    observation: unknown
  ): IntermediateStep {
    const step: IntermediateStep = {
      stepNumber: state.intermediateSteps.length + 1,
      thought,
      action,
      actionInput,
      observation,
      timestamp: new Date(),
    }
    return step
  }
}

/**
 * Builder for creating ReAct workflows
 */
export class ReActWorkflowBuilder<TState extends ReActState> {
  private nodes = new Map<string, ReActNode<TState>>()
  private router?: ReActRouter<TState>
  private entryPoint = 'start'
  private maxSteps = 20
  private reasoningNodeName?: string

  addNode(name: string, nodeFunction: ReActNode<TState>): this {
    this.nodes.set(name, nodeFunction)
    return this
  }

  setRouter(router: ReActRouter<TState>): this {
    this.router = router
    return this
  }

  setEntryPoint(entryPoint: string): this {
    this.entryPoint = entryPoint
    return this
  }

  setMaxSteps(maxSteps: number): this {
    this.maxSteps = maxSteps
    return this
  }

  setReasoningNodeName(name: string): this {
    this.reasoningNodeName = name
    return this
  }

  build(): ReActWorkflow<TState> {
    if (!this.router) {
      throw new Error('Router must be set before building workflow')
    }
    if (this.nodes.size === 0) {
      throw new Error('At least one node must be added before building workflow')
    }
    if (!this.nodes.has(this.entryPoint)) {
      throw new Error(`Entry point "${this.entryPoint}" not found in nodes`)
    }

    return {
      nodes: this.nodes,
      router: this.router,
      entryPoint: this.entryPoint,
      maxSteps: this.maxSteps,
      reasoningNodeName: this.reasoningNodeName,
    }
  }
}
