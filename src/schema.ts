import { z, ZodTypeAny } from 'zod';

type Primitive = string | number | boolean | bigint | null | undefined;
type Flatten<T> = T extends Primitive
  ? T
  : T extends Array<infer U>
    ? Array<Flatten<U>>
    : T extends Set<infer U>
      ? Set<Flatten<U>>
      : T extends Map<infer K, infer V>
        ? Map<Flatten<K>, Flatten<V>>
        : T extends object
          ? { [K in keyof T]: Flatten<T[K]> }
          : T;
type Infer<Schema extends ZodTypeAny> = Flatten<z.infer<Schema>>;

/**
 * Base interface for identifying JSON-RPC messages.
 */
export const JSONRPCMessageIdentifierSchema = z.object({
  /**
   * Request identifier. Can be a string, number.
   * Responses must have the same ID as the request they relate to.
   * Notifications (requests without an expected response) should omit the ID.
   */
  id: z.union([z.string(), z.number()]).optional(),
});
export type JSONRPCMessageIdentifier = Infer<
  typeof JSONRPCMessageIdentifierSchema
>;

/**
 * Base interface for all JSON-RPC messages (Requests and Responses).
 */
export const JSONRPCMessageSchema = JSONRPCMessageIdentifierSchema.extend({
  /**
   * Specifies the JSON-RPC version. Must be "2.0".
   * @default "2.0"
   * @const "2.0"
   */
  jsonrpc: z.literal('2.0').optional(),
});
export type JSONRPCMessage = Infer<typeof JSONRPCMessageSchema>;

/**
 * Represents a JSON-RPC request object base structure.
 * Specific request types should extend this.
 */
export const JSONRPCRequestSchema = JSONRPCMessageSchema.extend({
  /**
   * The name of the method to be invoked.
   */
  method: z.string(),

  /**
   * Parameters for the method. Can be a structured object, an array, or omitted.
   * Specific request interfaces will define the exact type.
   */
  params: z.object({}).passthrough().optional(), // Base type; specific requests will override
});
export type JSONRPCRequest = Infer<typeof JSONRPCRequestSchema>;
export const isJSONRPCRequest = (value: unknown): value is JSONRPCRequest => {
  return JSONRPCRequestSchema.safeParse(value).success;
};

/**
 * Represents a JSON-RPC response object.
 */
export const JSONRPCErrorSchema = z.object({
  /**
   * An error object if an error occurred during the request. Required on failure.
   * Should be undefined or omitted if the request was successful.
   */
  /**
   * The error type that occurred.
   */
  code: z.number().int(),
  /**
   * A short description of the error. The message SHOULD be limited to a concise single sentence.
   */
  message: z.string(),
  /**
   * Additional information about the error. The value of this member is defined by the sender (e.g. detailed error information, nested errors etc.).
   */
  data: z.optional(z.unknown()),
});
export type JSONRPCError = Infer<typeof JSONRPCErrorSchema>;
export const isJSONRPCError = (value: unknown): value is JSONRPCError => {
  return JSONRPCErrorSchema.safeParse(value).success;
};

/**
 * Represents a JSON-RPC response object.
 */
export const JSONRPCResponseSchema = JSONRPCMessageSchema.extend({
  /**
   * The result of the method invocation. Required on success.
   * Should be undefined or omitted if an error occurred.
   */
  result: z.object({}).passthrough().optional(),
  error: JSONRPCErrorSchema.optional(),
});
export type JSONRPCResponse = Infer<typeof JSONRPCResponseSchema>;
export const isJSONRPCResponse = (value: unknown): value is JSONRPCResponse => {
  return JSONRPCResponseSchema.safeParse(value).success;
};

// === Core A2A Data Structures

/**
 * Represents the state of a task within the A2A protocol.
 * @description An enumeration.
 */
export const TaskStateSchema = z.enum([
  'submitted',
  'working',
  'input-required',
  'completed',
  'canceled',
  'failed',
  'unknown',
]);
export type TaskState = Infer<typeof TaskStateSchema>;

/**
 * Defines the authentication schemes and credentials for an agent.
 */
export const AgentAuthenticationSchema = z.object({
  /**
   * List of supported authentication schemes.
   */
  schemes: z.array(z.string()),

  /**
   * Credentials for authentication. Can be a string (e.g., token) or undefined if not required initially.
   */
  credentials: z.string().optional(),
});
export type AgentAuthentication = Infer<typeof AgentAuthenticationSchema>;
export const isAgentAuthentication = (
  value: unknown,
): value is AgentAuthentication => {
  return AgentAuthenticationSchema.safeParse(value).success;
};

/**
 * Describes the capabilities of an agent.
 */
export const AgentCapabilitiesSchema = z.object({
  /**
   * Indicates if the agent supports streaming responses.
   * @default false
   */
  streaming: z.boolean().optional(),

  /**
   * Indicates if the agent supports push notification mechanisms.
   * @default false
   */
  pushNotifications: z.boolean().optional(),

  /**
   * Indicates if the agent supports providing state transition history.
   * @default false
   */
  stateTransitionHistory: z.boolean().optional(),
});
export type AgentCapabilities = Infer<typeof AgentCapabilitiesSchema>;
export const isAgentCapabilities = (
  value: unknown,
): value is AgentCapabilities => {
  return AgentCapabilitiesSchema.safeParse(value).success;
};

/**
 * Represents the provider or organization behind an agent.
 */
export const AgentProviderSchema = z.object({
  /**
   * The name of the organization providing the agent.
   */
  organization: z.string(),

  /**
   * URL associated with the agent provider.
   */
  url: z.string().optional(),
});
export type AgentProvider = Infer<typeof AgentProviderSchema>;
export const isAgentProvider = (value: unknown): value is AgentProvider => {
  return AgentProviderSchema.safeParse(value).success;
};

/**
 * Defines a specific skill or capability offered by an agent.
 */
export const AgentSkillSchema = z.object({
  /**
   * Unique identifier for the skill.
   */
  id: z.string(),

  /**
   * Human-readable name of the skill.
   */
  name: z.string(),

  /**
   * Optional description of the skill.
   */
  description: z.string().optional(),

  /**
   * Optional list of tags associated with the skill for categorization.
   */
  tags: z.string().array().optional(),

  /**
   * Optional list of example inputs or use cases for the skill.
   */
  examples: z.string().array().optional(),

  /**
   * Optional list of input modes supported by this skill, overriding agent defaults.
   */
  inputModes: z.string().array().optional(),

  /**
   * Optional list of output modes supported by this skill, overriding agent defaults.
   */
  outputModes: z.string().array().optional(),
});
export type AgentSkill = Infer<typeof AgentSkillSchema>;
export const isAgentSkill = (value: unknown): value is AgentSkill => {
  return AgentSkillSchema.safeParse(value).success;
};

/**
 * Represents the metadata card for an agent, describing its properties and capabilities.
 */
export const AgentCardSchema = z.object({
  /**
   * The name of the agent.
   */
  name: z.string(),

  /**
   * An optional description of the agent.
   */
  description: z.string().optional(),

  /**
   * The base URL endpoint for interacting with the agent.
   */
  url: z.string(),

  /**
   * Information about the provider of the agent.
   */
  provider: AgentProviderSchema.optional(),

  /**
   * The version identifier for the agent or its API.
   */
  version: z.string(),

  /**
   * An optional URL pointing to the agent's documentation.
   */
  documentationUrl: z.string().optional(),

  /**
   * The capabilities supported by the agent.
   */
  capabilities: AgentCapabilitiesSchema,

  /**
   * Authentication details required to interact with the agent.
   */
  authentication: AgentAuthenticationSchema.optional(),

  /**
   * Default input modes supported by the agent (e.g., 'text', 'file', 'json').
   * @default ["text"]
   */
  defaultInputModes: z.string().array().optional(),

  /**
   * Default output modes supported by the agent (e.g., 'text', 'file', 'json').
   * @default ["text"]
   */
  defaultOutputModes: z.string().array().optional(),

  /**
   * List of specific skills offered by the agent.
   */
  skills: AgentSkillSchema.array(),
});
export type AgentCard = Infer<typeof AgentCardSchema>;
export const isAgentCard = (value: unknown): value is AgentCard => {
  return AgentCardSchema.safeParse(value).success;
};

const FileContentBaseSchema = z.object({
  /**
   * Optional name of the file.
   */
  name: z.string().optional(),

  /**
   * Optional MIME type of the file content.
   */
  mimeType: z.string().optional(),
});

export const FileContentBytesSchema = FileContentBaseSchema.extend({
  /**
   * File content encoded as a Base64 string. Use this OR `uri`.
   */
  bytes: z.string(),
});
export type FileContentBytes = Infer<typeof FileContentBytesSchema>;

export const FileContentUriSchema = FileContentBaseSchema.extend({
  /**
   * URI pointing to the file content. Use this OR `bytes`.
   */
  uri: z.string(),
});
export type FileContentUri = Infer<typeof FileContentUriSchema>;

/**
 * Represents the content of a file, either as base64 encoded bytes or a URI.
 * @description Ensures that either 'bytes' or 'uri' is provided, but not both. (Note: This constraint is informational in TypeScript types).
 */
export const FileContentSchema = z.union([
  FileContentBytesSchema,
  FileContentUriSchema,
]);
export type FileContent = Infer<typeof FileContentSchema>;

/**
 * Represents a part of a message containing text content.
 */
export const TextPartSchema = z.object({
  type: z.literal('text').optional(),

  /**
   * The text content.
   */
  text: z.string(),

  /**
   * Optional metadata associated with this text part.
   */
  metadata: z.object({}).passthrough().optional(),
});
export type TextPart = Infer<typeof TextPartSchema>;

/**
 * Represents a part of a message containing file content.
 */
export const FilePartSchema = z.object({
  /**
   * Type identifier for this part.
   */
  type: z.literal('file').optional(),

  /**
   * The file content, provided either inline or via URI.
   */
  file: FileContentSchema,

  /**
   * Optional metadata associated with this file part.
   */
  metadata: z.object({}).passthrough().optional(),
});

export type FilePart = Infer<typeof FilePartSchema>;

/**
 * Represents a part of a message containing structured data (JSON).
 */
export const DataPartSchema = z.object({
  /**
   * Type identifier for this part.
   */
  type: z.literal('data').optional(),

  /**
   * The structured data content as a JSON object.
   */
  data: z.object({}).passthrough(),

  /**
   * Optional metadata associated with this data part.
   */
  metadata: z.object({}).passthrough().optional(),
});

/**
 * Represents a single part of a multi-part message. Can be text, file, or data.
 */
export const PartSchema = z.union([
  TextPartSchema,
  FilePartSchema,
  DataPartSchema,
]);
export type Part = Infer<typeof PartSchema>;

/**
 * Represents an artifact generated or used by a task, potentially composed of multiple parts.
 */
export const ArtifactSchema = z.object({
  /**
   * Optional name for the artifact.
   */
  name: z.string().optional(),

  /**
   * Optional description of the artifact.
   */
  description: z.string().optional(),

  /**
   * The constituent parts of the artifact.
   */
  parts: PartSchema.array(),

  /**
   * Optional index for ordering artifacts, especially relevant in streaming or updates.
   */
  index: z.number().positive().default(0),

  /**
   * Optional flag indicating if this artifact content should append to previous content (for streaming).
   */
  append: z.boolean().optional(),

  /**
   * Optional metadata associated with the artifact.
   */
  metadata: z.object({}).passthrough().optional(),

  /**
   * Optional flag indicating if this is the last chunk of data for this artifact (for streaming).
   */
  lastChunk: z.boolean().optional(),
});
export type Artifact = Infer<typeof ArtifactSchema>;

/**
 * Represents a message exchanged between a user and an agent.
 */
export const MessageSchema = z.object({
  /**
   * The role of the sender (user or agent).
   */
  role: z.enum(['user', 'agent']),
  /**
   * The content of the message, composed of one or more parts.
   */
  parts: PartSchema.array(),

  /**
   * Optional metadata associated with the message.
   */
  metadata: z.object({}).passthrough().optional(),
});
export type Message = Infer<typeof MessageSchema>;

/**
 * Represents the status of a task at a specific point in time.
 */
export const TaskStatusSchema = z.object({
  /**
   * The current state of the task.
   */
  state: TaskStateSchema,

  /**
   * An optional message associated with the current status (e.g., progress update, final response).
   */
  message: MessageSchema.optional(),

  /**
   * The timestamp when this status was recorded (ISO 8601 format).
   * @format date-time
   */
  timestamp: z.string().optional(),
});
export type TaskStatus = Infer<typeof TaskStatusSchema>;

/**
 * Represents a task being processed by an agent.
 */
export const TaskSchema = z.object({
  /**
   * Unique identifier for the task.
   */
  id: z.string(),

  /**
   * Optional identifier for the session this task belongs to.
   */
  sessionId: z.string().optional(),

  /**
   * The current status of the task.
   */
  status: TaskStatusSchema,

  /**
   * Represents the history of messages exchanged within a task's session.
   */
  history: MessageSchema.array().optional(),

  /**
   * Optional list of artifacts associated with the task (e.g., outputs, intermediate files).
   */
  artifacts: ArtifactSchema.array().optional(),

  /**
   * Optional metadata associated with the task.
   */
  metadata: z.object({}).passthrough().optional(),
});
export type Task = Infer<typeof TaskSchema>;

/**
 * Represents a status update event for a task, typically used in streaming scenarios.
 */
export const TaskStatusUpdateEventSchema = z.object({
  /**
   * The ID of the task being updated.
   */
  id: z.string(),

  /**
   * The new status of the task.
   */
  status: TaskStatusSchema,

  /**
   * Flag indicating if this is the final update for the task.
   * @default false
   */
  final: z.boolean().optional(),

  /**
   * Optional metadata associated with this update event.
   */
  metadata: z.object({}).passthrough().optional(),
});
export type TaskStatusUpdateEvent = Infer<typeof TaskStatusUpdateEventSchema>;

/**
 * Represents an artifact update event for a task, typically used in streaming scenarios.
 */
export const TaskArtifactUpdateEventSchema = z.object({
  /**
   * The ID of the task being updated.
   */
  id: z.string(),

  /**
   * The new or updated artifact for the task.
   */
  artifact: ArtifactSchema,

  /**
   * Flag indicating if this is the final update for the task.
   * @default false
   */
  final: z.boolean().optional(),

  /**
   * Optional metadata associated with this update event.
   */
  metadata: z.object({}).passthrough().optional(),
});
export type TaskArtifactUpdateEvent = z.infer<
  typeof TaskArtifactUpdateEventSchema
>;

// Alias for backward compatibility
export type TaskUpdateEvent = TaskStatusUpdateEvent;

// === Error Types (Standard and A2A)

/** Error code for JSON Parse Error (-32700). Invalid JSON was received by the server. */
export const ErrorCodeParseError = -32700;
/** Error code for Invalid Request (-32600). The JSON sent is not a valid Request object. */
export const ErrorCodeInvalidRequest = -32600;
/** Error code for Method Not Found (-32601). The method does not exist / is not available. */
export const ErrorCodeMethodNotFound = -32601;
/** Error code for Invalid Params (-32602). Invalid method parameter(s). */
export const ErrorCodeInvalidParams = -32602;
/** Error code for Internal Error (-32603). Internal JSON-RPC error. */
export const ErrorCodeInternalError = -32603;
/** Error code for Task Not Found (-32001). The specified task was not found. */
export const ErrorCodeTaskNotFound = -32001;
/** Error code for Task Not Cancelable (-32002). The specified task cannot be canceled. */
export const ErrorCodeTaskNotCancelable = -32002;
/** Error code for Push Notification Not Supported (-32003). Push Notifications are not supported for this operation or agent. */
export const ErrorCodePushNotificationNotSupported = -32003;
/** Error code for Unsupported Operation (-32004). The requested operation is not supported by the agent. */
export const ErrorCodeUnsupportedOperation = -32004;

/**
 * Union of all well-known A2A and standard JSON-RPC error codes defined in this schema.
 * Use this type for checking against specific error codes. A server might theoretically
 * use other codes within the valid JSON-RPC ranges.
 */
export const KnownErrorCodeSchema = z.union([
  z.literal(ErrorCodeParseError),
  z.literal(ErrorCodeInvalidRequest),
  z.literal(ErrorCodeMethodNotFound),
  z.literal(ErrorCodeInvalidParams),
  z.literal(ErrorCodeInternalError),
  z.literal(ErrorCodeTaskNotFound),
  z.literal(ErrorCodeTaskNotCancelable),
  z.literal(ErrorCodePushNotificationNotSupported),
  z.literal(ErrorCodeUnsupportedOperation),
]);
export type KnownErrorCode = Infer<typeof KnownErrorCodeSchema>;

// === Push Notifications and Authentication Info

/**
 * Authentication information, potentially including additional properties beyond the standard ones.
 * (Note: Schema allows additional properties).
 */
export const AuthenticationInfoSchema = AgentAuthenticationSchema.merge(
  z
    .object({
      /** Allow any other properties */
    })
    .passthrough(),
);
export type AuthenticationInfo = Infer<typeof AuthenticationInfoSchema>;

/**
 * Information required for setting up push notifications.
 */
export const PushNotificationConfigSchema = z.object({
  /**
   * The URL endpoint where the agent should send notifications.
   */
  url: z.string(),

  /**
   * A token to be included in push notification requests for verification/authentication.
   */
  token: z.string().optional(),

  /**
   * Optional authentication details needed by the agent to call the notification URL.
   */
  authentication: AuthenticationInfoSchema.optional(),
});
export type PushNotificationConfig = Infer<typeof PushNotificationConfigSchema>;

/**
 * Represents the push notification information associated with a specific task ID.
 * Used as parameters for `tasks/pushNotification/set` and as a result type.
 */
export const TaskPushNotificationConfigSchema = z.object({
  /**
   * The ID of the task the notification config is associated with.
   */
  id: z.string(),
  /**
   * The push notification configuration details.
   */
  pushNotificationConfig: PushNotificationConfigSchema,
});
export type TaskPushNotificationConfig = Infer<
  typeof TaskPushNotificationConfigSchema
>;

// === A2A Request Interfaces

/**
 * Parameters for the `tasks/send` method.
 */
export const TaskSendParamsSchema = z.object({
  /**
   * Unique identifier for the task being initiated or continued.
   */
  id: z.string(),

  /**
   * Optional identifier for the session this task belongs to. If not provided, a new session might be implicitly created depending on the agent.
   */
  sessionId: z.string().optional(),

  /**
   * The message content to send to the agent for processing.
   */
  message: MessageSchema,

  /**
   * Optional pushNotification information for receiving notifications about this task. Requires agent capability.
   */
  pushNotification: PushNotificationConfigSchema.optional(),

  /**
   * Optional parameter to specify how much message history to include in the response.
   */
  historyLength: z.number().positive().optional(),

  /**
   * Optional metadata associated with sending this message.
   */
  metadata: z.object({}).passthrough().optional(),
});
export type TaskSendParams = Infer<typeof TaskSendParamsSchema>;

/**
 * Basic parameters used for task ID operations.
 * Used by: `tasks/cancel`, `tasks/pushNotification/get`.
 */
export const TaskIdParamsSchema = z.object({
  /**
   * The unique identifier of the task.
   */
  id: z.string(),

  /**
   * Optional metadata to include with the operation.
   */
  metadata: z.object({}).passthrough().optional(),
});
export type TaskIdParams = Infer<typeof TaskIdParamsSchema>;

/**
 * Parameters used for querying task-related information by ID.
 * Used by: `tasks/get`, `tasks/getHistory`, `tasks/subscribe`, `tasks/resubscribe`.
 */
export const TaskQueryParamsSchema = TaskIdParamsSchema.extend({
  /**
   * Optional history length to retrieve for the task.
   */
  historyLength: z.number().optional(),
});
export type TaskQueryParams = Infer<typeof TaskQueryParamsSchema>;

// === A2A Request Interfaces

/**
 * Request to send a message/initiate a task.
 */
export const SendTaskParamsSchema = z.object({
  /**
   * The unique identifier of the task.
   */
  id: z.string(),

  /**
   * Optional metadata to include with the operation.
   */
  metadata: z.object({}).passthrough().optional(),
});
export type SendTaskParams = Infer<typeof SendTaskParamsSchema>;

/**
 * Request to send a message/initiate a task.
 */
export const SendTaskRequestSchema = JSONRPCRequestSchema.extend({
  /**
   * Method name for sending a task message.
   */
  method: z.literal('tasks/send'),
  /**
   * Parameters for the send task method.
   */
  params: TaskSendParamsSchema,
});
export type SendTaskRequest = Infer<typeof SendTaskRequestSchema>;

/**
 * Request to retrieve the current state of a task.
 */
export const GetTaskRequestSchema = JSONRPCRequestSchema.extend({
  /**
   * Method name for getting task status.
   */
  method: z.literal('tasks/get'),
  /**
   * Parameters for the get task method.
   */
  params: TaskQueryParamsSchema,
});
export type GetTaskRequest = Infer<typeof GetTaskRequestSchema>;

/**
 * Request to cancel a currently running task.
 */
export const CancelTaskRequestSchema = JSONRPCRequestSchema.extend({
  /**
   * Method name for canceling a task.
   */
  method: z.literal('tasks/cancel'),
  /**
   * Parameters for the cancel task method.
   */
  params: TaskIdParamsSchema,
});
export type CancelTaskRequest = Infer<typeof CancelTaskRequestSchema>;

/**
 * Request to set or update the push notification config for a task.
 */
export const SetTaskPushNotificationRequestSchema = JSONRPCRequestSchema.extend(
  {
    /**
     * Method name for setting a task notifications.
     */
    method: z.literal('tasks/pushNotification/set'),
    /**
     * Parameters for the set task push notification method.
     */
    params: TaskPushNotificationConfigSchema, // Uses TaskPushNotificationConfig directly as params
  },
);
export type SetTaskPushNotificationRequest = Infer<
  typeof SetTaskPushNotificationRequestSchema
>;

/**
 * Request to retrieve the currently configured push notification configuration for a task.
 */
export const GetTaskPushNotificationRequestSchema = JSONRPCRequestSchema.extend(
  {
    /**
     * Method name for getting task notification configuration.
     */
    method: z.literal('tasks/pushNotification/get'),
    /**
     * Parameters for the get task push notification config method.
     */
    params: TaskIdParamsSchema,
  },
);
export type GetTaskPushNotificationRequest = Infer<
  typeof GetTaskPushNotificationRequestSchema
>;

/**
 * Request to resubscribe to updates for a task after a connection interruption.
 */
export const TaskResubscriptionRequestSchema = JSONRPCRequestSchema.extend({
  /**
   * Method name for resubscribing to task updates.
   */
  method: z.literal('tasks/resubscribe'),
  /**
   * Parameters for the task resubscription method.
   */
  params: TaskQueryParamsSchema,
});
export type TaskResubscriptionRequest = Infer<
  typeof TaskResubscriptionRequestSchema
>;

/**
 * Request to send a message/initiate a task and subscribe to streaming updates.
 */
export const SendTaskStreamingRequestSchema = JSONRPCRequestSchema.extend({
  /**
   * Method name for sending a task message and subscribing to updates.
   */
  method: z.literal('tasks/sendSubscribe'),
  /**
   * Parameters for the streaming task send method.
   */
  params: TaskSendParamsSchema,
});
export type SendTaskStreamingRequest = Infer<
  typeof SendTaskStreamingRequestSchema
>;

// === A2A Response Interfaces

/**
 * Response to a `tasks/send` request.
 * Contains the Task object or an error.
 */
export const SendTaskResponseSchema = JSONRPCResponseSchema.extend({
  result: TaskSchema,
});
export type SendTaskResponse = Infer<typeof SendTaskResponseSchema>;

/**
 * Response to a streaming task operation, either through `tasks/sendSubscribe` or a subscription.
 * Contains a TaskStatusUpdateEvent, TaskArtifactUpdateEvent, or an error.
 */
export const SendTaskStreamingResponseSchema = JSONRPCResponseSchema.extend({
  result: z
    .union([TaskStatusUpdateEventSchema, TaskArtifactUpdateEventSchema])
    .optional(),
});
export type SendTaskStreamingResponse = Infer<
  typeof SendTaskStreamingResponseSchema
>;

/**
 * Response to a `tasks/get` request. Contains the Task object or an error.
 */
export const GetTaskResponseSchema = JSONRPCResponseSchema.extend({
  result: TaskSchema.optional(),
});
export type GetTaskResponse = Infer<typeof GetTaskResponseSchema>;

/**
 * Response to a `tasks/cancel` request. Contains the updated Task object (usually with 'canceled' state) or an error.
 */
export const CancelTaskResponseSchema = JSONRPCResponseSchema.extend({
  result: TaskSchema.optional(),
});
export type CancelTaskResponse = Infer<typeof CancelTaskResponseSchema>;

/**
 * Response to a `tasks/getHistory` request. Contains the TaskHistory object or an error.
 */
export const GetTaskHistoryResponseSchema = JSONRPCResponseSchema.extend({
  result: TaskSchema.shape.history,
});
export type GetTaskHistoryResponse = Infer<typeof GetTaskHistoryResponseSchema>;

/**
 * Response to a `tasks/pushNotification/set` request. Contains the confirmed TaskPushNotificationConfig or an error.
 */
export const SetTaskPushNotificationResponseSchema =
  JSONRPCResponseSchema.extend({
    result: TaskPushNotificationConfigSchema.optional(),
  });
export type SetTaskPushNotificationResponse = Infer<
  typeof SetTaskPushNotificationResponseSchema
>;

/**
 * Response to a `tasks/pushNotification/get` request. Contains the TaskPushNotificationConfig or an error.
 */
export const GetTaskPushNotificationResponseSchema =
  JSONRPCResponseSchema.extend({
    result: TaskPushNotificationConfigSchema.optional(),
  });
export type GetTaskPushNotificationResponse = Infer<
  typeof GetTaskPushNotificationResponseSchema
>;

// Note: The response to TaskSubscriptionRequest is typically handled by the underlying protocol
// (like WebSocket messages containing TaskUpdateEvent) rather than a single JSON-RPC response object.
// The schema doesn't define a specific JSON-RPC response type for `tasks/subscribe`.

// === Union Types for A2A Requests/Responses

/**
 * Represents any valid request defined in the A2A protocol.
 */
export const A2ARequestSchema = z.union([
  SendTaskRequestSchema,
  GetTaskRequestSchema,
  CancelTaskRequestSchema,
  SetTaskPushNotificationRequestSchema,
  GetTaskPushNotificationRequestSchema,
  TaskResubscriptionRequestSchema,
  SendTaskStreamingRequestSchema,
]);
export type A2ARequest = Infer<typeof A2ARequestSchema>;
export const isA2ARequest = (value: unknown): value is A2ARequest =>
  A2ARequestSchema.safeParse(value).success;

/**
 * Represents any valid JSON-RPC response defined in the A2A protocol.
 * (This is a helper type, not explicitly defined with `oneOf` in the schema like A2ARequest, but useful).
 */
export const A2AResponseSchema = z.union([
  SendTaskResponseSchema,
  GetTaskResponseSchema,
  CancelTaskResponseSchema,
  GetTaskHistoryResponseSchema,
  SetTaskPushNotificationResponseSchema,
  GetTaskPushNotificationResponseSchema,
]);
export type A2AResponse = Infer<typeof A2AResponseSchema>;
export const isA2AResponse = (value: unknown): value is A2AResponse =>
  A2AResponseSchema.safeParse(value).success;

// Subscription responses are typically event streams (TaskUpdateEvent) sent over the transport,
// not direct JSON-RPC responses to the subscribe request itself.
