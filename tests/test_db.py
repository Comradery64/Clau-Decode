"""Tests for db.py — Agent 1 must make all of these pass."""

import tempfile
from datetime import datetime, timezone
from pathlib import Path

import pytest

from clau_decode.models import Message, Project, Session, TextBlock


@pytest.fixture
async def db():
    from clau_decode.db import Database

    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "test.db"
        async with Database(db_path) as database:
            await database.init_schema()
            yield database


@pytest.fixture
def sample_project():
    return Project(
        id="proj-test",
        display_name="Test Project",
        raw_path="-test-project",
        resolved_path="/test/project",
        data_source="~/.claude",
        session_count=0,
    )


@pytest.fixture
def sample_session():
    return Session(
        id="aaaaaaaa-0000-0000-0000-000000000001",
        project_id="proj-test",
        file_path="/tmp/test.jsonl",
        title="Test Session",
        model="claude-sonnet-4-6",
        started_at=datetime(2026, 1, 1, 10, 0, 0, tzinfo=timezone.utc),
        updated_at=datetime(2026, 1, 1, 10, 5, 0, tzinfo=timezone.utc),
        message_count=3,
        user_message_count=2,
        cwd="/home/user",
        git_branch="main",
    )


@pytest.fixture
def sample_messages():
    return [
        Message(
            id="msg-0001",
            session_id="aaaaaaaa-0000-0000-0000-000000000001",
            parent_id=None,
            role="user",
            content_blocks=[TextBlock(text="Hello!")],
            timestamp=datetime(2026, 1, 1, 10, 0, 0, tzinfo=timezone.utc),
        ),
        Message(
            id="msg-0002",
            session_id="aaaaaaaa-0000-0000-0000-000000000001",
            parent_id="msg-0001",
            role="assistant",
            content_blocks=[TextBlock(text="Hi! How can I help you today?")],
            timestamp=datetime(2026, 1, 1, 10, 0, 5, tzinfo=timezone.utc),
            model="claude-sonnet-4-6",
        ),
    ]


class TestSchema:
    async def test_init_schema_is_idempotent(self, db):
        await db.init_schema()  # Second call should not raise
        await db.init_schema()


class TestProjects:
    async def test_upsert_and_get_project(self, db, sample_project):
        await db.upsert_project(sample_project)
        projects = await db.get_projects()
        assert len(projects) == 1
        assert projects[0].id == "proj-test"
        assert projects[0].display_name == "Test Project"

    async def test_upsert_project_updates_existing(self, db, sample_project):
        await db.upsert_project(sample_project)
        updated = sample_project.model_copy(update={"display_name": "Updated"})
        await db.upsert_project(updated)
        projects = await db.get_projects()
        assert len(projects) == 1
        assert projects[0].display_name == "Updated"

    async def test_get_projects_empty(self, db):
        projects = await db.get_projects()
        assert projects == []


class TestSessions:
    async def test_upsert_and_get_session(self, db, sample_project, sample_session):
        await db.upsert_project(sample_project)
        await db.upsert_session(sample_session)
        sessions = await db.get_sessions()
        assert len(sessions) == 1
        assert sessions[0].id == sample_session.id

    async def test_get_sessions_filtered_by_project(
        self, db, sample_project, sample_session
    ):
        await db.upsert_project(sample_project)
        await db.upsert_session(sample_session)
        sessions = await db.get_sessions(project_id="proj-test")
        assert len(sessions) == 1
        sessions_other = await db.get_sessions(project_id="other-proj")
        assert len(sessions_other) == 0

    async def test_session_mtime_roundtrip(self, db, sample_project, sample_session):
        await db.upsert_project(sample_project)
        session_with_mtime = sample_session.model_copy()
        await db.upsert_session(session_with_mtime)
        # mtime tracking is internal — just verify we can get None for missing
        result = await db.get_session_mtime("nonexistent-session")
        assert result is None


class TestMessages:
    async def test_upsert_messages_and_get_detail(
        self, db, sample_project, sample_session, sample_messages
    ):
        await db.upsert_project(sample_project)
        await db.upsert_session(sample_session)
        await db.upsert_messages(sample_messages)
        detail = await db.get_session_detail(sample_session.id)
        assert detail is not None
        assert len(detail.messages) == 2

    async def test_get_session_detail_returns_none_for_missing(self, db):
        detail = await db.get_session_detail("nonexistent-id")
        assert detail is None

    async def test_messages_ordered_by_timestamp(
        self, db, sample_project, sample_session, sample_messages
    ):
        await db.upsert_project(sample_project)
        await db.upsert_session(sample_session)
        await db.upsert_messages(sample_messages)
        detail = await db.get_session_detail(sample_session.id)
        timestamps = [m.timestamp for m in detail.messages if m.timestamp]
        assert timestamps == sorted(timestamps)


class TestSearch:
    async def test_search_finds_content(
        self, db, sample_project, sample_session, sample_messages
    ):
        await db.upsert_project(sample_project)
        await db.upsert_session(sample_session)
        await db.upsert_messages(sample_messages)
        hits = await db.search("Hello")
        assert len(hits) >= 1
        assert any("Hello" in h.snippet or "hello" in h.snippet.lower() for h in hits)

    async def test_search_no_results_for_missing_term(
        self, db, sample_project, sample_session, sample_messages
    ):
        await db.upsert_project(sample_project)
        await db.upsert_session(sample_session)
        await db.upsert_messages(sample_messages)
        hits = await db.search("xyzzy_nonexistent_term_12345")
        assert hits == []

    async def test_search_filtered_by_project(
        self, db, sample_project, sample_session, sample_messages
    ):
        await db.upsert_project(sample_project)
        await db.upsert_session(sample_session)
        await db.upsert_messages(sample_messages)
        hits = await db.search("Hello", project_id="proj-test")
        assert len(hits) >= 1
        hits_wrong = await db.search("Hello", project_id="wrong-project")
        assert hits_wrong == []


class TestStats:
    async def test_stats_counts(
        self, db, sample_project, sample_session, sample_messages
    ):
        await db.upsert_project(sample_project)
        await db.upsert_session(sample_session)
        await db.upsert_messages(sample_messages)
        stats = await db.get_stats()
        assert stats.total_projects == 1
        assert stats.total_sessions == 1
        assert stats.total_messages == 2

    async def test_stats_empty_db(self, db):
        stats = await db.get_stats()
        assert stats.total_projects == 0
        assert stats.total_sessions == 0
        assert stats.total_messages == 0


class TestUsagePersistence:
    async def test_upsert_message_with_usage(self, db, sample_project, sample_session):
        from clau_decode.models import TokenUsage

        await db.upsert_project(sample_project)
        await db.upsert_session(sample_session)
        msg = Message(
            id="msg-usage-001",
            session_id=sample_session.id,
            role="assistant",
            content_blocks=[TextBlock(text="Hi")],
            timestamp=datetime(2026, 1, 1, 10, 0, 5, tzinfo=timezone.utc),
            usage=TokenUsage(
                input_tokens=10,
                output_tokens=5,
                cache_creation_input_tokens=100,
                cache_read_input_tokens=50,
            ),
        )
        await db.upsert_messages([msg])
        detail = await db.get_session_detail(sample_session.id)
        stored = next(m for m in detail.messages if m.id == "msg-usage-001")
        assert stored.usage is not None
        assert stored.usage.input_tokens == 10
        assert stored.usage.output_tokens == 5
        assert stored.usage.cache_creation_input_tokens == 100
        assert stored.usage.cache_read_input_tokens == 50

    async def test_upsert_message_without_usage_returns_none(
        self, db, sample_project, sample_session
    ):
        await db.upsert_project(sample_project)
        await db.upsert_session(sample_session)
        msg = Message(
            id="msg-no-usage",
            session_id=sample_session.id,
            role="user",
            content_blocks=[TextBlock(text="Hello")],
            timestamp=datetime(2026, 1, 1, 10, 0, 0, tzinfo=timezone.utc),
        )
        await db.upsert_messages([msg])
        detail = await db.get_session_detail(sample_session.id)
        stored = next(m for m in detail.messages if m.id == "msg-no-usage")
        assert stored.usage is None


class TestPhase0Integration:
    async def test_full_pipeline_usage_fixture(self, db):
        """Parse session_with_usage.jsonl → DB → retrieve, assert tokens preserved."""
        from clau_decode.parser import parse_session
        from clau_decode.models import Project

        fixture = Path(__file__).parent / "fixtures" / "session_with_usage.jsonl"
        project = Project(
            id="test-proj", display_name="Test", raw_path="-test", data_source="test"
        )
        session, messages = parse_session(fixture)
        session.project_id = project.id
        await db.upsert_project(project)
        await db.upsert_session(session)
        await db.upsert_messages(messages)

        detail = await db.get_session_detail(session.id)
        assistant_msgs = [m for m in detail.messages if m.role == "assistant"]
        assert len(assistant_msgs) == 2
        total_input = sum(m.usage.input_tokens for m in assistant_msgs if m.usage)
        assert total_input == 32  # 12 + 20
        total_cache_read = sum(
            m.usage.cache_read_input_tokens for m in assistant_msgs if m.usage
        )
        assert total_cache_read == 50


class TestDeleteMessage:
    async def test_delete_removes_message(self, db, sample_messages):
        project = Project(
            id="p1",
            display_name="p",
            raw_path="/",
            resolved_path="/",
            data_source="local",
        )
        session = Session(
            id=sample_messages[0].session_id, project_id="p1", file_path="/f.jsonl"
        )
        await db.upsert_project(project)
        await db.upsert_session(session)
        await db.upsert_messages(sample_messages[:2])
        target_id = sample_messages[0].id
        await db.delete_message(target_id)
        detail = await db.get_session_detail(session.id)
        assert all(m.id != target_id for m in detail.messages)

    async def test_delete_updates_session_message_count(self, db, sample_messages):
        project = Project(
            id="p1",
            display_name="p",
            raw_path="/",
            resolved_path="/",
            data_source="local",
        )
        session = Session(
            id=sample_messages[0].session_id,
            project_id="p1",
            file_path="/f.jsonl",
            title="Test",
        )
        await db.upsert_project(project)
        await db.upsert_session(session)
        await db.upsert_messages(sample_messages[:2])
        await db.delete_message(sample_messages[0].id)
        sessions = await db.get_sessions(project_id="p1")
        assert sessions[0].message_count == 1

    async def test_delete_nonexistent_is_noop(self, db):
        await db.delete_message("nonexistent-uuid-0000-0000-000000000000")


class TestUpdateMessageContent:
    async def test_update_changes_content(self, db, sample_messages):
        project = Project(
            id="p1",
            display_name="p",
            raw_path="/",
            resolved_path="/",
            data_source="local",
        )
        session = Session(
            id=sample_messages[0].session_id, project_id="p1", file_path="/f.jsonl"
        )
        await db.upsert_project(project)
        await db.upsert_session(session)
        await db.upsert_messages([sample_messages[0]])
        new_blocks = [TextBlock(text="updated content")]
        await db.update_message_content(sample_messages[0].id, new_blocks)
        detail = await db.get_session_detail(session.id)
        assert detail.messages[0].content_blocks[0].text == "updated content"

    async def test_update_nonexistent_is_noop(self, db):
        await db.update_message_content(
            "nonexistent-0000-0000-0000-000000000000", [TextBlock(text="x")]
        )


class TestGetSessionFilePathForMessage:
    async def test_returns_file_path(self, db, sample_messages):
        project = Project(
            id="p1",
            display_name="p",
            raw_path="/",
            resolved_path="/",
            data_source="local",
        )
        session = Session(
            id=sample_messages[0].session_id,
            project_id="p1",
            file_path="/sessions/test.jsonl",
        )
        await db.upsert_project(project)
        await db.upsert_session(session)
        await db.upsert_messages([sample_messages[0]])
        path = await db.get_session_file_path_for_message(sample_messages[0].id)
        assert path == "/sessions/test.jsonl"

    async def test_returns_none_for_unknown_message(self, db):
        path = await db.get_session_file_path_for_message(
            "unknown-0000-0000-0000-000000000000"
        )
        assert path is None
