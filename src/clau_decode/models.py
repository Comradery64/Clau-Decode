"""Shared domain models — the single source of truth for data shapes across the app."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional, Union

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Content blocks — mirrors Claude API content block types
# ---------------------------------------------------------------------------

class TextBlock(BaseModel):
    type: Literal["text"] = "text"
    text: str


class ToolUseBlock(BaseModel):
    type: Literal["tool_use"] = "tool_use"
    id: str
    name: str
    input: dict[str, Any] = Field(default_factory=dict)


class ToolResultBlock(BaseModel):
    type: Literal["tool_result"] = "tool_result"
    tool_use_id: str
    content: Union[str, list[dict[str, Any]], None] = None
    is_error: bool = False


class ThinkingBlock(BaseModel):
    type: Literal["thinking"] = "thinking"
    thinking: str
    signature: Optional[str] = None


class ImageBlock(BaseModel):
    type: Literal["image"] = "image"
    source: dict[str, Any] = Field(default_factory=dict)


ContentBlock = Union[TextBlock, ToolUseBlock, ToolResultBlock, ThinkingBlock, ImageBlock]


# ---------------------------------------------------------------------------
# Token usage — from Claude API assistant messages
# ---------------------------------------------------------------------------

class TokenUsage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    cache_creation_input_tokens: int = 0
    cache_read_input_tokens: int = 0


# ---------------------------------------------------------------------------
# Message — one turn in the conversation
# ---------------------------------------------------------------------------

class Message(BaseModel):
    id: str
    session_id: str
    parent_id: Optional[str] = None
    role: Literal["user", "assistant", "system"]
    content_blocks: list[ContentBlock] = Field(default_factory=list)
    timestamp: Optional[datetime] = None
    model: Optional[str] = None
    is_sidechain: bool = False
    is_meta: bool = False
    cwd: Optional[str] = None
    git_branch: Optional[str] = None
    request_id: Optional[str] = None
    # Links sub-agent messages to the tool_use that spawned them
    source_tool_assistant_uuid: Optional[str] = None
    usage: Optional[TokenUsage] = None


class MessageTree(BaseModel):
    """A message with its direct children attached (for sidechain branches)."""
    message: Message
    children: list["MessageTree"] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Session — one JSONL file
# ---------------------------------------------------------------------------

class Session(BaseModel):
    id: str
    project_id: str
    file_path: str
    title: Optional[str] = None
    model: Optional[str] = None
    started_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    message_count: int = 0
    user_message_count: int = 0
    cwd: Optional[str] = None
    git_branch: Optional[str] = None
    is_worktree: bool = False
    permission_mode: Optional[str] = None
    last_message_role: Optional[Literal["user", "assistant", "system"]] = None


class SessionDetail(Session):
    """Session with its full conversation included."""
    messages: list[Message] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Project — one project directory (may contain many sessions)
# ---------------------------------------------------------------------------

class Project(BaseModel):
    id: str                          # slug derived from directory path
    display_name: str                # human-readable name
    raw_path: str                    # the mangled path string from directory name
    resolved_path: Optional[str] = None  # actual filesystem path if it exists
    data_source: str = ""            # which configured root path this came from
    session_count: int = 0
    last_activity_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

class SearchHit(BaseModel):
    session_id: str
    session_title: Optional[str]
    project_id: str
    message_id: str
    role: str
    snippet: str                     # FTS5 highlighted excerpt
    timestamp: Optional[datetime]


# ---------------------------------------------------------------------------
# Config — user-facing settings
# ---------------------------------------------------------------------------

class AppConfig(BaseModel):
    data_paths: list[str] = Field(
        default_factory=lambda: ["~/.claude"],
        description="Root directories to scan for Claude Code JSONL files",
    )
    theme: Literal["light", "dark", "system"] = "system"
    auto_open_browser: bool = True
    port: int = 4242
    edit_enabled: bool = False


# ---------------------------------------------------------------------------
# API response envelopes
# ---------------------------------------------------------------------------

class StatsResponse(BaseModel):
    total_projects: int
    total_sessions: int
    total_messages: int
    data_paths: list[str]
