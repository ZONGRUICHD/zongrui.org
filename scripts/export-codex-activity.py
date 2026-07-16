#!/usr/bin/env python3
"""Export a privacy-safe Codex activity calendar.

Only session metadata, top-level ``user_message`` timestamps, and cumulative
token counters are derived from Codex JSONL files. Message text is neither
decoded nor emitted.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator


CHINA_TIME = timezone(timedelta(hours=8), name="UTC+08:00")
DAYS = 365
USER_MESSAGE_EVENT = re.compile(
    br'^\s*\{\s*"timestamp"\s*:\s*"(?P<timestamp>[^"\\]+)"\s*,'
    br'\s*"type"\s*:\s*"event_msg"\s*,\s*"payload"\s*:\s*\{'
    br'\s*"type"\s*:\s*"user_message"(?:\s*[,}])'
)
SESSION_META_RECORD = re.compile(br'"type"\s*:\s*"session_meta"')
TOKEN_COUNT_RECORD = re.compile(br'"type"\s*:\s*"token_count"')


@dataclass(slots=True)
class FileScan:
    turns: list[tuple[str, date]]
    session_id: str | None
    token_snapshots: list[tuple[datetime, int]]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export the last 365 days of Codex turns and tokens as safe JSON."
    )
    parser.add_argument(
        "--codex-home",
        type=Path,
        default=Path(os.environ.get("CODEX_HOME", "~/.codex")).expanduser(),
        help="Codex data directory (default: CODEX_HOME or ~/.codex)",
    )
    parser.add_argument(
        "--today",
        type=date.fromisoformat,
        help="Override today's UTC+8 date for reproducible runs (YYYY-MM-DD)",
    )
    return parser.parse_args()


def iter_jsonl_files(codex_home: Path) -> Iterator[Path]:
    for name in ("sessions", "archived_sessions"):
        root = codex_home / name
        if not root.is_dir():
            continue
        for current, directories, filenames in os.walk(root):
            directories.sort()
            for filename in sorted(filenames):
                if filename.endswith(".jsonl"):
                    yield Path(current) / filename


def is_subagent_source(source: Any) -> bool:
    if source == "subagent":
        return True
    if isinstance(source, dict):
        if "subagent" in source:
            return True
        return any(
            source.get(key) == "subagent" for key in ("type", "kind", "name")
        )
    return False


def session_metadata(raw_line: bytes) -> tuple[str | None, bool | None] | None:
    try:
        record = json.loads(raw_line)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(record, dict) or record.get("type") != "session_meta":
        return None
    payload = record.get("payload")
    if not isinstance(payload, dict):
        return None
    raw_session_id = payload.get("id")
    session_id = (
        raw_session_id
        if isinstance(raw_session_id, str) and 0 < len(raw_session_id) <= 128
        else None
    )
    source_is_subagent = (
        is_subagent_source(payload["source"]) if "source" in payload else None
    )
    return session_id, source_is_subagent


def token_snapshot(raw_line: bytes) -> tuple[datetime, int] | None:
    try:
        record = json.loads(raw_line)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(record, dict) or record.get("type") != "event_msg":
        return None
    payload = record.get("payload")
    if not isinstance(payload, dict) or payload.get("type") != "token_count":
        return None
    info = payload.get("info")
    if not isinstance(info, dict):
        return None
    usage = info.get("total_token_usage")
    if not isinstance(usage, dict):
        return None
    total = usage.get("total_tokens")
    timestamp_text = record.get("timestamp")
    if isinstance(total, bool) or not isinstance(total, int) or total < 0:
        return None
    if not isinstance(timestamp_text, str):
        return None
    timestamp = parse_timestamp(timestamp_text)
    if timestamp is None:
        return None
    return timestamp, total


def parse_timestamp(value: str) -> datetime | None:
    candidate = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def scan_file(path: Path, first_day: date, last_day: date) -> tuple[FileScan | None, bool]:
    """Return safe aggregate inputs and whether the file could be read."""
    candidates: list[tuple[str, date]] = []
    current_source_is_subagent: bool | None = None
    root_metadata_seen = False
    root_source_is_subagent: bool | None = None
    root_session_id: str | None = None
    snapshots: list[tuple[datetime, int]] = []
    try:
        with path.open("rb") as handle:
            for raw_line in handle:
                # session_meta is normally the first line. It contains the source
                # needed to exclude spawned agents; no conversation text is used.
                if SESSION_META_RECORD.search(raw_line[:512]) is not None:
                    metadata = session_metadata(raw_line)
                    if metadata is not None:
                        session_id, source_state = metadata
                        if not root_metadata_seen:
                            root_metadata_seen = True
                            root_session_id = session_id
                            root_source_is_subagent = source_state
                        if source_state is not None:
                            current_source_is_subagent = source_state
                    continue

                # A subagent file contains a replay of its parent's metadata and
                # cumulative counters. The first session_meta is authoritative;
                # skipping the whole file prevents that replay from inflating the
                # public total.
                if (
                    root_source_is_subagent is False
                    and root_session_id is not None
                    and TOKEN_COUNT_RECORD.search(raw_line[:512]) is not None
                ):
                    snapshot = token_snapshot(raw_line)
                    if snapshot is not None:
                        snapshots.append(snapshot)

                match = USER_MESSAGE_EVENT.match(raw_line)
                if match is None or current_source_is_subagent is not False:
                    continue
                try:
                    raw_timestamp = match.group("timestamp").decode("ascii")
                except UnicodeDecodeError:
                    continue
                timestamp = parse_timestamp(raw_timestamp)
                if timestamp is None:
                    continue
                local_day = timestamp.astimezone(CHINA_TIME).date()
                if first_day <= local_day <= last_day:
                    candidates.append((raw_timestamp, local_day))
    except OSError:
        return None, False
    return FileScan(candidates, root_session_id, snapshots), True


def aggregate_tokens(
    sessions: dict[str, dict[int, datetime]], first_day: date, last_day: date
) -> Counter[date]:
    """Convert per-session cumulative snapshots into UTC+8 daily increments."""
    counts: Counter[date] = Counter()
    for snapshots_by_total in sessions.values():
        running_max = 0
        for total, timestamp in sorted(
            snapshots_by_total.items(), key=lambda item: (item[1], item[0])
        ):
            delta = max(0, total - running_max)
            running_max = max(running_max, total)
            local_day = timestamp.astimezone(CHINA_TIME).date()
            if first_day <= local_day <= last_day:
                counts[local_day] += delta
    return counts


def quartile_thresholds(counts: Counter[date]) -> tuple[int, int, int]:
    values = sorted(value for value in counts.values() if value > 0)
    if not values:
        return (0, 0, 0)

    def nearest_rank(fraction: float) -> int:
        return values[max(0, math.ceil(len(values) * fraction) - 1)]

    return (nearest_rank(0.25), nearest_rank(0.5), nearest_rank(0.75))


def level_for(count: int, thresholds: tuple[int, int, int]) -> int:
    if count == 0:
        return 0
    first, second, third = thresholds
    if count <= first:
        return 1
    if count <= second:
        return 2
    if count <= third:
        return 3
    return 4


def build_export(codex_home: Path, today: date) -> tuple[dict[str, Any], int, int]:
    first_day = today - timedelta(days=DAYS - 1)
    unique_timestamps: set[str] = set()
    counts: Counter[date] = Counter()
    token_sessions: dict[str, dict[int, datetime]] = {}
    scanned = 0
    unreadable = 0

    for path in iter_jsonl_files(codex_home):
        file_scan, was_read = scan_file(path, first_day, today)
        if not was_read:
            unreadable += 1
            continue
        scanned += 1
        if file_scan is None:
            continue
        for timestamp, local_day in file_scan.turns:
            if timestamp in unique_timestamps:
                continue
            unique_timestamps.add(timestamp)
            counts[local_day] += 1
        if file_scan.session_id is not None and file_scan.token_snapshots:
            session = token_sessions.setdefault(file_scan.session_id, {})
            for timestamp, total in file_scan.token_snapshots:
                previous = session.get(total)
                if previous is None or timestamp < previous:
                    session[total] = timestamp

    token_counts = aggregate_tokens(token_sessions, first_day, today)

    thresholds = quartile_thresholds(counts)
    days = []
    for offset in range(DAYS):
        current = first_day + timedelta(days=offset)
        count = counts[current]
        days.append(
            {
                "date": current.isoformat(),
                "count": count,
                "level": level_for(count, thresholds),
                "tokens": token_counts[current],
            }
        )

    payload = {
        "schemaVersion": 1,
        "kind": "codex",
        "totalTurns": sum(counts.values()),
        "totalTokens": sum(token_counts.values()),
        "activeDays": sum(count > 0 for count in counts.values()),
        "startedAt": first_day.isoformat(),
        "endedAt": today.isoformat(),
        "days": days,
        "updatedAt": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
    }
    return payload, scanned, unreadable


def main() -> int:
    args = parse_args()
    today = args.today or datetime.now(CHINA_TIME).date()
    payload, scanned, unreadable = build_export(args.codex_home.expanduser(), today)
    json.dump(payload, sys.stdout, ensure_ascii=False, separators=(",", ":"))
    sys.stdout.write("\n")
    sys.stderr.write(
        f"codex-activity: scanned={scanned} unreadable={unreadable} "
        f"turns={payload['totalTurns']} tokens={payload['totalTokens']}\n"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except BrokenPipeError:
        raise SystemExit(0) from None
