/**
 * API response types — mirrors the Python Pydantic models exactly.
 * This is the contract between frontend and backend.
 * Both Agent 3 and Agent 4 build against these types.
 */

// ---------------------------------------------------------------------------
// Content blocks
// ---------------------------------------------------------------------------

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | Array<{ type: string; text?: string }> | null;
  is_error: boolean;
}

export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
  signature?: string;
}

export interface ImageBlock {
  type: "image";
  source: Record<string, unknown>;
}

export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ThinkingBlock
  | ImageBlock;

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export interface Message {
  id: string;
  session_id: string;
  parent_id: string | null;
  role: "user" | "assistant" | "system";
  content_blocks: ContentBlock[];
  timestamp: string | null; // ISO 8601
  model: string | null;
  is_sidechain: boolean;
  is_meta: boolean;
  cwd: string | null;
  git_branch: string | null;
  source_tool_assistant_uuid: string | null;
  usage: TokenUsage | null;
}

export interface MessageTree {
  message: Message;
  children: MessageTree[];
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface Session {
  id: string;
  project_id: string;
  file_path: string;
  title: string | null;
  model: string | null;
  started_at: string | null;
  updated_at: string | null;
  message_count: number;
  user_message_count: number;
  cwd: string | null;
  git_branch: string | null;
  is_worktree: boolean;
  is_fork: boolean;
  permission_mode: string | null;
  last_message_role: "user" | "assistant" | "system" | null;
}

export interface SessionDetail extends Session {
  messages: Message[];
  total_message_count?: number;
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export interface Project {
  id: string;
  display_name: string;
  raw_path: string;
  resolved_path: string | null;
  data_source: string;
  session_count: number;
  last_activity_at: string | null;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchHit {
  session_id: string;
  session_title: string | null;
  project_id: string;
  message_id: string;
  role: string;
  snippet: string;
  timestamp: string | null;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface Profile {
  id: string;
  name: string;
  data_paths: string[];
  color: string;
}

export type PermissionMode =
  | "dontAsk"
  | "acceptEdits"
  | "bypassPermissions"
  | "auto"
  | "plan"
  | "default";

export interface AppConfig {
  data_paths: string[];
  profiles: Profile[];
  active_profile_id: string | null;
  theme: "light" | "dark" | "system";
  auto_open_browser: boolean;
  port: number;
  host: string;
  edit_enabled: boolean;
  claude_default_permission_mode: PermissionMode;
  claude_auto_stop_quiet_default_turns: boolean;
  claude_recap_enabled: boolean;
  claude_recap_idle_minutes: number;
}

export interface HostInfo {
  // True when the request did NOT originate from a loopback address.
  // Used to gate UI actions that run on the SERVER's host (osascript,
  // Finder/Terminal launches, etc.).
  is_remote_client: boolean;
  // Server's platform — informs whether host-side actions are even supported.
  platform: "darwin" | "linux" | "win32" | string;
  client_host: string | null;
}

// ---------------------------------------------------------------------------
// Recap
// ---------------------------------------------------------------------------

export interface Recap {
  id: number;
  session_id: string;
  text: string;
  created_at: string;
  covers_until_message_uuid: string | null;
  dismissed: boolean;
}

export interface ProfilesResponse {
  profiles: Profile[];
  active_profile_id: string | null;
}

// ---------------------------------------------------------------------------
// Runner status — mirrors ClaudeCodeRunner.status_snapshot
// ---------------------------------------------------------------------------

export interface RunnerStatus {
  busy: boolean;
  last_error: string | null;
  permission_mode: PermissionMode | null;
  quiet_age_seconds: number | null;
  quiet_warning: boolean;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface StatsResponse {
  total_projects: number;
  total_sessions: number;
  total_messages: number;
  data_paths: string[];
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface TokenBreakdown {
  session_id?: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  total: number;
}

export interface PromptCostEntry {
  user_message_id: string;
  assistant_message_id: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  total: number;
}

export interface DailyBucket {
  day: string; // ISO date
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  total: number;
  prompt_count: number;
  session_count: number;
}

// ---------------------------------------------------------------------------
// Cost
// ---------------------------------------------------------------------------

export interface ModelCostEntry {
  model: string;
  input_usd: number;
  output_usd: number;
  cache_write_usd: number;
  cache_read_usd: number;
  total_usd: number;
  pricing_known: boolean;
}

export interface SessionCostResponse {
  session_id: string;
  models: ModelCostEntry[];
  total_usd: number;
  pricing_known: boolean;
  pricing_source: "live" | "hardcoded";
}

export interface ModelPricingEntry {
  model: string;
  input_per_mtok: number;
  output_per_mtok: number;
  cache_write_per_mtok: number;
  cache_read_per_mtok: number;
}

export interface PricingTableResponse {
  source: "live" | "hardcoded";
  models: ModelPricingEntry[];
}

// ---------------------------------------------------------------------------
// Phase 4 stats
// ---------------------------------------------------------------------------

export interface TokenDistribution {
  count: number;
  mean: number;
  median: number;
  p95: number;
  min: number;
  max: number;
}

export interface PromptStatsResponse {
  prompt_count: number;
  input_tokens: TokenDistribution | null;
  output_tokens: TokenDistribution | null;
  total_tokens: TokenDistribution | null;
}

export interface ModelUsageEntry {
  model: string;
  message_count: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export interface ToolUsageEntry {
  tool: string;
  count: number;
}

export interface FileTouchEntry {
  file: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Phase 5 tips
// ---------------------------------------------------------------------------

export interface TipEntry {
  rule_id: string;
  severity: "info" | "warning" | "error";
  title: string;
  detail: string;
  evidence: string[];
}

// ---------------------------------------------------------------------------
// Phase 6 editing
// ---------------------------------------------------------------------------

export interface MessageContentPatch {
  content_blocks: ContentBlock[];
}

export interface MutationResult {
  ok: boolean;
  session_id?: string;
}

// ---------------------------------------------------------------------------
// File system browser
// ---------------------------------------------------------------------------

export interface DirEntry {
  name: string;
  type: "file" | "dir";
  size: number | null;
  modified: number;
}

export interface DirListing {
  path: string;
  entries: DirEntry[];
}

export interface FileContent {
  path: string;
  name: string;
  content: string;
  size: number;
  language: string | null;
}

// ---------------------------------------------------------------------------
// Phase 7 export
// ---------------------------------------------------------------------------

export type ExportFormat = "json" | "md";

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardSession {
  id: string;
  title: string | null;
  project_id: string;
  models: string[];
  message_count: number;
  total_usd: number;
  updated_at: string | null;
  last_message_role: "user" | "assistant" | "system" | null;
}

export interface DashboardProject {
  id: string;
  display_name: string;
  session_count: number;
  last_activity_at: string | null;
}

export interface DashboardTip {
  rule_id: string;
  severity: "info" | "warning" | "error";
  title: string;
  detail: string;
}

export interface DashboardData {
  recent_sessions: DashboardSession[];
  projects: DashboardProject[];
  model_usage: ModelUsageEntry[];
  total_cost_usd: number;
  total_sessions: number;
  total_messages: number;
  tips: DashboardTip[];
}

