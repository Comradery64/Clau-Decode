"""Reporting and export — JSON and Markdown session reports."""

from __future__ import annotations

from typing import TYPE_CHECKING

from .analytics.cost import SessionCost
from .analytics.pricing import ModelPricing
from .analytics.service import TokenAnalyticsService
from .models import Message, SessionDetail, TextBlock

if TYPE_CHECKING:
    pass


def _text_content(message: Message) -> str:
    """Extract plain text from a message's content blocks."""
    parts: list[str] = []
    for block in message.content_blocks:
        if isinstance(block, TextBlock) and block.text:
            parts.append(block.text)
    return "\n".join(parts)


def _truncate(text: str, max_len: int = 200) -> str:
    if len(text) <= max_len:
        return text
    return text[: max_len - 3] + "..."


def export_json(
    detail: SessionDetail,
    cost: SessionCost | None = None,
    prompts: list[dict] | None = None,
) -> dict:
    """Produce a full structured JSON export of a session.

    Args:
        detail: SessionDetail with messages included.
        cost: Optional SessionCost from the cost engine.
        prompts: Optional list of PromptCost dicts from the analytics service.

    Returns:
        A dict ready for JSON serialization.
    """
    messages_out: list[dict] = []
    for msg in detail.messages:
        entry: dict = {
            "id": msg.id,
            "role": msg.role,
            "timestamp": msg.timestamp.isoformat() if msg.timestamp else None,
            "model": msg.model,
            "text": _text_content(msg),
        }
        if msg.usage:
            entry["usage"] = {
                "input_tokens": msg.usage.input_tokens,
                "output_tokens": msg.usage.output_tokens,
                "cache_creation_input_tokens": msg.usage.cache_creation_input_tokens,
                "cache_read_input_tokens": msg.usage.cache_read_input_tokens,
            }
        messages_out.append(entry)

    result: dict = {
        "session": {
            "id": detail.id,
            "title": detail.title,
            "model": detail.model,
            "started_at": detail.started_at.isoformat() if detail.started_at else None,
            "updated_at": detail.updated_at.isoformat() if detail.updated_at else None,
            "message_count": detail.message_count,
            "cwd": detail.cwd,
            "git_branch": detail.git_branch,
        },
        "messages": messages_out,
    }

    if cost:
        result["cost"] = {
            "model": cost.model,
            "input_usd": float(cost.input_usd),
            "output_usd": float(cost.output_usd),
            "cache_write_usd": float(cost.cache_write_usd),
            "cache_read_usd": float(cost.cache_read_usd),
            "total_usd": float(cost.total_usd),
            "pricing_known": cost.pricing is not None,
        }

    if prompts is not None:
        result["prompts"] = prompts

    return result


def export_markdown(
    detail: SessionDetail,
    cost: SessionCost | None = None,
    prompts: list[dict] | None = None,
    pricing: ModelPricing | None = None,
    all_models_usage: list[dict] | None = None,
) -> str:
    """Produce a Markdown report with executive summary.

    Args:
        detail: SessionDetail with messages included.
        cost: Optional SessionCost from the cost engine.
        prompts: Optional list of PromptCost dicts.
        pricing: Optional ModelPricing for the model used.
        all_models_usage: Optional list of model usage dicts.

    Returns:
        A Markdown string.
    """
    lines: list[str] = []
    title = detail.title or "Untitled Session"
    lines.append(f"# {title}")
    lines.append("")

    # Executive summary
    lines.append("## Executive Summary")
    lines.append("")

    summary_items: list[str] = []
    summary_items.append(f"- **Session ID:** `{detail.id}`")
    if detail.model:
        summary_items.append(f"- **Model:** {detail.model}")
    if detail.started_at:
        summary_items.append(
            f"- **Started:** {detail.started_at.strftime('%Y-%m-%d %H:%M UTC')}"
        )
    if detail.updated_at:
        summary_items.append(
            f"- **Last activity:** {detail.updated_at.strftime('%Y-%m-%d %H:%M UTC')}"
        )
    summary_items.append(f"- **Messages:** {detail.message_count}")
    if detail.cwd:
        summary_items.append(f"- **Working directory:** `{detail.cwd}`")
    if detail.git_branch:
        summary_items.append(f"- **Git branch:** `{detail.git_branch}`")

    # Token totals
    analytics = TokenAnalyticsService()
    totals = analytics.session_totals(detail.messages)
    summary_items.append(f"- **Total tokens:** {totals.total:,}")
    summary_items.append(f"  - Input: {totals.input_tokens:,}")
    summary_items.append(f"  - Output: {totals.output_tokens:,}")
    summary_items.append(f"  - Cache creation: {totals.cache_creation_tokens:,}")
    summary_items.append(f"  - Cache read: {totals.cache_read_tokens:,}")

    if cost:
        summary_items.append(f"- **Estimated cost:** ${float(cost.total_usd):.4f}")
        if cost.pricing is not None:
            summary_items.append(f"  - Input: ${float(cost.input_usd):.4f}")
            summary_items.append(f"  - Output: ${float(cost.output_usd):.4f}")
            summary_items.append(f"  - Cache write: ${float(cost.cache_write_usd):.4f}")
            summary_items.append(f"  - Cache read: ${float(cost.cache_read_usd):.4f}")

    lines.extend(summary_items)
    lines.append("")

    # Per-million-token pricing table
    if pricing:
        lines.append("## Pricing Table (per 1M tokens)")
        lines.append("")
        lines.append("| Category | USD / 1M tokens |")
        lines.append("|---|---|")
        lines.append(f"| Input | ${float(pricing.input_per_mtok):.2f} |")
        lines.append(f"| Output | ${float(pricing.output_per_mtok):.2f} |")
        lines.append(f"| Cache write | ${float(pricing.cache_write_per_mtok):.2f} |")
        lines.append(f"| Cache read | ${float(pricing.cache_read_per_mtok):.2f} |")
        lines.append("")

    # Model usage breakdown
    if all_models_usage:
        lines.append("## Model Usage")
        lines.append("")
        lines.append(
            "| Model | Messages | Input tokens | Output tokens | Total tokens |"
        )
        lines.append("|---|---|---|---|---|")
        for entry in all_models_usage:
            model = entry.get("model", "unknown")
            lines.append(
                f"| {model} | {entry.get('message_count', 0):,} "
                f"| {entry.get('input_tokens', 0):,} "
                f"| {entry.get('output_tokens', 0):,} "
                f"| {entry.get('total_tokens', 0):,} |"
            )
        lines.append("")

    # Per-prompt cost table
    if prompts:
        lines.append("## Prompt Breakdown")
        lines.append("")
        lines.append("| # | Input | Output | Cache create | Cache read | Total |")
        lines.append("|---|---|---|---|---|---|")
        for i, p in enumerate(prompts, 1):
            bd = p.get("breakdown", p)
            lines.append(
                f"| {i} "
                f"| {bd.get('input_tokens', 0):,} "
                f"| {bd.get('output_tokens', 0):,} "
                f"| {bd.get('cache_creation_tokens', 0):,} "
                f"| {bd.get('cache_read_tokens', 0):,} "
                f"| {bd.get('total', 0):,} |"
            )
        lines.append("")

    # Conversation log
    lines.append("## Conversation")
    lines.append("")
    for msg in detail.messages:
        if msg.is_meta:
            continue
        role_label = "**User**" if msg.role == "user" else "**Assistant**"
        ts = msg.timestamp.strftime("%H:%M:%S") if msg.timestamp else ""
        lines.append(f"### {role_label} {f'({ts})' if ts else ''}".strip())
        lines.append("")
        text = _text_content(msg)
        if text:
            lines.append(_truncate(text, 500))
            lines.append("")

    return "\n".join(lines)
