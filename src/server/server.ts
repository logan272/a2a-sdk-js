import { ServerResponse } from 'http';
import * as schema from '../schema.js';
import { TaskStore, InMemoryTaskStore } from './store.js';
import {
  TaskHandler,
  TaskYieldUpdate,
  TaskContext as _TaskContext,
  isArtifactUpdate,
  isTaskStatusUpdate,
} from './handler.js';
import { A2AError } from './error.js';
import { getCurrentTimestamp } from './utils.js';

/**
 * Options for configuring the A2AServer.
 */
export interface A2AServerOptions {
  /** Task storage implementation. Defaults to InMemoryTaskStore. */
  taskStore?: TaskStore;
  /** Base path for the A2A endpoint. Defaults to '/'. */
  basePath?: string;
  /** Agent Card for the agent being served. */
  card?: schema.AgentCard;
  httpServerResponse: ServerResponse;
}

// Define new TaskContext without the store, based on the original from handler.ts
export interface TaskContext extends Omit<_TaskContext, 'taskStore'> {}

/**
 * Implements an A2A specification compliant server using Express.
 */
export class A2AServer {
  private taskHandler: TaskHandler;
  private taskStore: TaskStore;
  private basePath: string;
  private httpServerResponse: ServerResponse;
  // Track active cancellations
  private activeCancellations: Set<string> = new Set();
  public card?: schema.AgentCard;

  constructor(handler: TaskHandler, options: A2AServerOptions) {
    this.taskHandler = handler;
    this.taskStore = options.taskStore ?? new InMemoryTaskStore();
    this.basePath = options.basePath ?? '/';
    this.httpServerResponse = options.httpServerResponse;
    if (options.card) this.card = options.card;
    // Ensure base path starts and ends with a slash if it's not just "/"
    if (this.basePath !== '/') {
      this.basePath = `/${this.basePath.replace(/^\/|\/$/g, '')}/`;
    }
  }

  // Helper to apply updates (status or artifact) immutably
  private applyUpdateToTask(
    current: schema.Task,
    update: TaskYieldUpdate,
  ): schema.Task {
    const { history, ...newTask } = current;
    let newHistory = history?.slice() ?? []; // Shallow copy history

    if (isTaskStatusUpdate(update)) {
      // Merge status update
      newTask.status = {
        ...newTask.status, // Keep existing properties if not overwritten
        ...update, // Apply updates
        timestamp: getCurrentTimestamp(), // Always update timestamp
      };
      // If the update includes an agent message, add it to history
      if (update.message?.role === 'agent') {
        newHistory.push(update.message);
      }
    } else if (isArtifactUpdate(update)) {
      // Handle artifact update
      if (!newTask.artifacts) {
        newTask.artifacts = [];
      } else {
        // Ensure we're working with a copy of the artifacts array
        newTask.artifacts = [...newTask.artifacts];
      }

      const existingIndex = update.index ?? -1; // Use index if provided
      let replaced = false;

      if (existingIndex >= 0 && existingIndex < newTask.artifacts.length) {
        const existingArtifact = newTask.artifacts[existingIndex];
        if (update.append) {
          // Create a deep copy for modification to avoid mutating original
          const appendedArtifact = JSON.parse(JSON.stringify(existingArtifact));
          appendedArtifact.parts.push(...update.parts);
          if (update.metadata) {
            appendedArtifact.metadata = {
              ...(appendedArtifact.metadata || {}),
              ...update.metadata,
            };
          }
          if (update.lastChunk !== undefined)
            appendedArtifact.lastChunk = update.lastChunk;
          if (update.description)
            appendedArtifact.description = update.description;
          newTask.artifacts[existingIndex] = appendedArtifact; // Replace with appended version
          replaced = true;
        } else {
          // Overwrite artifact at index (with a copy of the update)
          newTask.artifacts[existingIndex] = { ...update };
          replaced = true;
        }
      } else if (update.name) {
        const namedIndex = newTask.artifacts.findIndex(
          (a) => a.name === update.name,
        );
        if (namedIndex >= 0) {
          newTask.artifacts[namedIndex] = { ...update }; // Replace by name (with copy)
          replaced = true;
        }
      }

      if (!replaced) {
        newTask.artifacts.push({ ...update }); // Add as a new artifact (copy)
        // Sort if indices are present
        if (newTask.artifacts.some((a) => a.index !== undefined)) {
          newTask.artifacts.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
        }
      }
    } else {
      throw A2AError.invalidRequest('Invalid task update request');
    }

    return { ...newTask, history: newHistory };
  }

  /**
   * Returns an Express RequestHandler function to handle A2A requests.
   */
  requestHandler = async (request: schema.A2ARequest) => {
    if (!schema.isA2ARequest(request)) {
      throw A2AError.invalidRequest('Invalid A2A request structure.');
    }

    switch (request.method) {
      case 'tasks/send':
        await this.handleTaskSend(request);
        break;
      case 'tasks/sendSubscribe':
        await this.handleTaskSendSubscribe(request);
        break;
      case 'tasks/get':
        await this.handleTaskGet(request);
        break;
      case 'tasks/cancel':
        await this.handleTaskCancel(request);
        break;
      default:
        throw A2AError.methodNotFound(request.method);
    }
  };

  // --- Request Handlers ---

  private async handleTaskSend(req: schema.SendTaskRequest): Promise<void> {
    const { id: taskId, message, sessionId, metadata } = req.params;

    // Load or create task AND history
    let task = await this.loadOrCreateTask(
      taskId,
      message,
      sessionId,
      metadata,
    );
    // Use the new TaskContext definition, passing history
    const context = this.createTaskContext(task, message);
    const generator = this.taskHandler(context);

    // Process generator yields
    try {
      for await (const yieldValue of generator) {
        // Apply update immutably
        task = this.applyUpdateToTask(task, yieldValue);
        // Save the updated state
        await this.taskStore.save(task);
        // Update context snapshot for next iteration
        context.task = task;
      }
    } catch (handlerError) {
      // If handler throws, apply 'failed' status, save, and rethrow
      const failureStatusUpdate: Omit<schema.TaskStatus, 'timestamp'> = {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: `Handler failed: ${
                handlerError instanceof Error
                  ? handlerError.message
                  : String(handlerError)
              }`,
            },
          ],
        },
      };
      task = this.applyUpdateToTask(task, failureStatusUpdate);
      try {
        await this.taskStore.save(task);
      } catch (saveError) {
        console.error(
          `Failed to save task ${taskId} after handler error:`,
          saveError,
        );
        // Still throw the original handler error
      }
      throw this.normalizeError(handlerError, req.id, taskId); // Rethrow original error
    }

    // The loop finished, send the final task state
    this.sendJsonResponse(req.id, task);
  }

  private async handleTaskSendSubscribe(
    req: schema.SendTaskStreamingRequest,
  ): Promise<void> {
    const { id: taskId, message, sessionId, metadata } = req.params;

    // Load or create task AND history
    let task = await this.loadOrCreateTask(
      taskId,
      message,
      sessionId,
      metadata,
    );

    // Use the new TaskContext definition, passing history
    const context = this.createTaskContext(task, message);
    const generator = this.taskHandler(context);

    // --- Setup SSE ---
    this.httpServerResponse.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      // Optional: "Access-Control-Allow-Origin": "*" // Handled by cors middleware usually
    });
    // Function to send SSE data
    const sendEvent = (eventData: schema.JSONRPCResponse) => {
      this.httpServerResponse.write(`data: ${JSON.stringify(eventData)}\n\n`);
    };

    let lastEventWasFinal = false; // Track if the last sent event was marked final

    try {
      // Optionally send initial state?
      // sendEvent(this.createSuccessResponse(req.id, this.createTaskStatusEvent(taskId, currentData.task.status, false)));

      // Process generator yields
      for await (const yieldValue of generator) {
        // Apply update immutably
        task = this.applyUpdateToTask(task, yieldValue);
        // Save the updated state
        await this.taskStore.save(task);
        // Update context snapshot
        context.task = task;

        let event:
          | schema.TaskStatusUpdateEvent
          | schema.TaskArtifactUpdateEvent;
        let isFinal = false;

        // Determine event type and check for final state based on the *updated* task
        if (isTaskStatusUpdate(yieldValue)) {
          const terminalStates: schema.TaskState[] = [
            'completed',
            'failed',
            'canceled',
            'input-required', // Treat input-required as potentially final for streaming?
          ];
          isFinal = terminalStates.includes(task.status.state);
          event = this.createTaskStatusEvent(taskId, task.status, isFinal);
          if (isFinal) {
            console.log(
              `[SSE ${taskId}] Yielded terminal state ${task.status.state}, marking event as final.`,
            );
          }
        } else if (isArtifactUpdate(yieldValue)) {
          // Find the updated artifact in the new task object
          const updatedArtifact =
            task.artifacts?.find(
              (a) =>
                (a.index !== undefined && a.index === yieldValue.index) ||
                (a.name && a.name === yieldValue.name),
            ) ?? yieldValue; // Fallback
          event = this.createTaskArtifactEvent(taskId, updatedArtifact, false);
          // Note: Artifact updates themselves don't usually mark the task as final.
        } else {
          console.warn('[SSE] Handler yielded unknown value:', yieldValue);
          continue; // Skip sending an event for unknown yields
        }

        sendEvent(this.createSuccessResponse(req.id, event));
        lastEventWasFinal = isFinal;

        // If the status update resulted in a final state, stop processing
        if (isFinal) break;
      }

      // Loop finished. Check if a final event was already sent.
      if (!lastEventWasFinal) {
        console.log(
          `[SSE ${taskId}] Handler finished without yielding terminal state. Sending final state: ${task.status.state}`,
        );
        // Ensure the task is actually in a recognized final state before sending.
        const finalStates: schema.TaskState[] = [
          'completed',
          'failed',
          'canceled',
          'input-required', // Consider input-required final for SSE end?
        ];
        if (!finalStates.includes(task.status.state)) {
          console.warn(
            `[SSE ${taskId}] Task ended non-terminally (${task.status.state}). Forcing 'completed'.`,
          );
          // Apply 'completed' state update
          task = this.applyUpdateToTask(task, {
            state: 'completed',
          });
          // Save the forced final state
          await this.taskStore.save(task);
        }
        // Send the final status event
        const finalEvent = this.createTaskStatusEvent(
          taskId,
          task.status,
          true, // Mark as final
        );
        sendEvent(this.createSuccessResponse(req.id, finalEvent));
      }
    } catch (handlerError) {
      // Handler threw an error
      console.error(
        `[SSE ${taskId}] Handler error during streaming:`,
        handlerError,
      );
      // Apply 'failed' status update
      const failureUpdate: Omit<schema.TaskStatus, 'timestamp'> = {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: `Handler failed: ${
                handlerError instanceof Error
                  ? handlerError.message
                  : String(handlerError)
              }`,
            },
          ],
        },
      };
      task = this.applyUpdateToTask(task, failureUpdate);

      try {
        // Save the failed state
        await this.taskStore.save(task);
      } catch (saveError) {
        console.error(
          `[SSE ${taskId}] Failed to save task after handler error:`,
          saveError,
        );
      }

      // Send final error status event via SSE
      const errorEvent = this.createTaskStatusEvent(
        taskId,
        task.status, // Use the updated status
        true, // Mark as final
      );
      sendEvent(this.createSuccessResponse(req.id, errorEvent));

      // Note: We don't send a JSON-RPC error response here, the error is signaled via the event stream.
    } finally {
      // End the SSE stream if it hasn't already been closed by sending a final event
      this.httpServerResponse.end();
    }
  }

  private async handleTaskGet(req: schema.GetTaskRequest): Promise<void> {
    const { id: taskId } = req.params;
    if (!taskId) throw A2AError.invalidParams('Missing task ID.');

    // Load both task and history
    const task = await this.taskStore.load(taskId);
    if (!task) {
      throw A2AError.taskNotFound(taskId);
    }

    // Return only the task object as per spec
    this.sendJsonResponse(req.id, task);
  }

  private async handleTaskCancel(
    request: schema.CancelTaskRequest,
  ): Promise<void> {
    const { id: taskId } = request.params;

    let task = await this.taskStore.load(taskId);
    if (!task) {
      throw A2AError.taskNotFound(taskId);
    }
    // Check if cancelable (not already in a final state)
    const finalStates: schema.TaskState[] = ['completed', 'failed', 'canceled'];
    if (finalStates.includes(task.status.state)) {
      console.log(
        `Task ${taskId} already in final state ${task.status.state}, cannot cancel.`,
      );
      this.sendJsonResponse(request.id, task);
    }

    // Signal cancellation
    this.activeCancellations.add(taskId);

    // Apply 'canceled' state update
    const cancelUpdate: Omit<schema.TaskStatus, 'timestamp'> = {
      state: 'canceled',
      message: {
        role: 'agent',
        parts: [{ type: 'text', text: 'Task cancelled by request.' }],
      },
    };
    task = this.applyUpdateToTask(task, cancelUpdate);
    // Save the updated state
    await this.taskStore.save(task);
    // Remove from active cancellations *after* saving
    this.activeCancellations.delete(taskId);
    this.sendJsonResponse(request.id, task);
  }

  // --- Helper Methods ---

  // Renamed and updated to handle both task and history
  private async loadOrCreateTask(
    taskId: string,
    initialMessage: schema.Message,
    sessionId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<schema.Task> {
    let task = await this.taskStore.load(taskId);
    let needsSave = false;

    if (!task) {
      const initialHistory: schema.Message[] = [initialMessage]; // History starts with user message
      // Create new task and history
      task = {
        id: taskId,
        sessionId,
        status: {
          state: 'submitted', // Start as submitted
          timestamp: getCurrentTimestamp(),
        },
        history: initialHistory,
        artifacts: [],
        metadata,
      };
      needsSave = true; // Mark for saving
      console.log(`[Task ${taskId}] Created new task and history.`);
    } else {
      console.log(`[Task ${taskId}] Loaded existing task and history.`);
      // Add current user message to history
      // Make a copy before potentially modifying
      task = { ...task, history: [...(task.history ?? []), initialMessage] };
      needsSave = true; // History updated, mark for saving

      // Handle state transitions for existing tasks
      const finalStates: schema.TaskState[] = [
        'completed',
        'failed',
        'canceled',
      ];

      if (finalStates.includes(task.status.state)) {
        // Task already in a final state, the task is considered finalized, should not receive any more messages.
        throw A2AError.invalidRequest(
          `Task ${taskId} is already in a final state.`,
        );
      } else if (task.status.state === 'input-required') {
        console.log(
          `[Task ${taskId}] Received message while 'input-required', changing state to 'working'.`,
        );
        // If it was waiting for input, update state to 'working'
        const workingUpdate: Omit<schema.TaskStatus, 'timestamp'> = {
          state: 'working',
        };
        task = this.applyUpdateToTask(task, workingUpdate);
        // needsSave is already true
      } else if (task.status.state === 'working') {
        // If already working, maybe warn but allow? Or force back to submitted?
        console.warn(
          `[Task ${taskId}] Received message while already 'working'. Proceeding.`,
        );
        // No state change needed, but history was updated, so needsSave is true.
      }
      // If 'submitted', receiving another message might be odd, but proceed.
    }

    // Save if created or modified before returning
    if (needsSave) {
      await this.taskStore.save(task);
    }

    // Return copies to prevent mutation by caller before handler runs
    return { ...task, history: task.history?.slice() };
  }

  // Update context creator to accept and include history
  private createTaskContext(
    task: schema.Task,
    userMessage: schema.Message,
  ): TaskContext {
    return {
      task: { ...task }, // Pass a copy
      userMessage: userMessage,
      isCancelled: () => this.activeCancellations.has(task.id),
    };
  }

  // --- Response Formatting ---

  private createSuccessResponse(
    id: number | string | undefined,
    result: Record<string, unknown>,
  ): schema.JSONRPCResponse {
    if (id === undefined) {
      // This shouldn't happen for methods that expect a response, but safeguard
      throw A2AError.internalError(
        'Cannot create success response for null ID.',
      );
    }
    return {
      jsonrpc: '2.0',
      id: id,
      result,
    };
  }

  private createErrorResponse(
    id: number | string | undefined,
    error: schema.JSONRPCError,
  ): schema.JSONRPCResponse {
    // For errors, ID should be the same as request ID, or null if that couldn't be determined
    return {
      jsonrpc: '2.0',
      id: id, // Can be null if request ID was invalid/missing
      error,
    };
  }

  /** Normalizes various error types into a JSONRPCResponse containing an error */
  private normalizeError(
    error: unknown,
    reqId: number | string | undefined,
    taskId?: string,
  ): schema.JSONRPCResponse {
    let a2aError: A2AError;
    if (error instanceof A2AError) {
      a2aError = error;
    } else if (error instanceof Error) {
      // Generic JS error
      a2aError = A2AError.internalError(error.message, { stack: error.stack });
    } else {
      // Unknown error type
      a2aError = A2AError.internalError('An unknown error occurred.', error);
    }

    // Ensure Task ID context is present if possible
    if (taskId && !a2aError.taskId) {
      a2aError.taskId = taskId;
    }

    console.error(
      `Error processing request (Task: ${a2aError.taskId ?? 'N/A'}, ReqID: ${
        reqId ?? 'N/A'
      }):`,
      a2aError,
    );

    return this.createErrorResponse(reqId, a2aError.toJSONRPCError());
  }

  /** Creates a TaskStatusUpdateEvent object */
  private createTaskStatusEvent(
    taskId: string,
    status: schema.TaskStatus,
    final: boolean,
  ): schema.TaskStatusUpdateEvent {
    return {
      id: taskId,
      status: status, // Assumes status already has timestamp from applyUpdate
      final: final,
    };
  }

  /** Creates a TaskArtifactUpdateEvent object */
  private createTaskArtifactEvent(
    taskId: string,
    artifact: schema.Artifact,
    final: boolean,
  ): schema.TaskArtifactUpdateEvent {
    return {
      id: taskId,
      artifact: artifact,
      final: final, // Usually false unless it's the very last thing
    };
  }

  /** Sends a standard JSON success response */
  private sendJsonResponse(
    reqId: number | string | undefined,
    result: Record<string, unknown>,
  ): void {
    if (reqId === null) {
      console.warn(
        'Attempted to send JSON response for a request with null ID.',
      );
      // Should this be an error? Or just log and ignore?
      // For 'tasks/send' etc., ID should always be present.
      return;
    }
    this.httpServerResponse.writeHead(200, {
      'content-type': 'application/json',
    });
    const response = this.createSuccessResponse(reqId, result);
    this.httpServerResponse.end(JSON.stringify(response));
  }
}
