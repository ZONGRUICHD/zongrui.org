from __future__ import annotations

import html
import json
import math
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

import bleach


ALLOWED_NODES = {
    "doc",
    "paragraph",
    "text",
    "heading",
    "blockquote",
    "bulletList",
    "orderedList",
    "listItem",
    "hardBreak",
    "horizontalRule",
    "codeBlock",
    "image",
    "figureImage",
}
ALLOWED_MARKS = {"bold", "italic", "underline", "strike", "code", "link"}
ALLOWED_TAGS = {
    "p",
    "h2",
    "h3",
    "blockquote",
    "ul",
    "ol",
    "li",
    "br",
    "hr",
    "pre",
    "code",
    "strong",
    "em",
    "u",
    "s",
    "a",
    "figure",
    "img",
    "figcaption",
}
ALLOWED_ATTRIBUTES = {
    "a": ["href", "title", "rel", "target"],
    "img": ["src", "alt", "title", "width", "height", "loading", "decoding"],
}


class ContentValidationError(ValueError):
    pass


@dataclass(frozen=True)
class RenderedContent:
    document: dict[str, Any]
    html: str
    text: str
    reading_minutes: int


def _safe_link(value: str) -> str:
    value = value.strip()
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https", "mailto"}:
        raise ContentValidationError("links must use http, https, or mailto")
    return value


def _safe_image(value: str, media_public_base_url: str) -> str:
    value = value.strip()
    expected = urlparse(media_public_base_url)
    parsed = urlparse(value)
    if parsed.scheme != "https" or parsed.netloc != expected.netloc:
        raise ContentValidationError("images must come from the configured media host")
    if not parsed.path or ".." in parsed.path.split("/"):
        raise ContentValidationError("invalid image path")
    expected_prefix = expected.path.rstrip("/") + "/"
    if expected.path and not parsed.path.startswith(expected_prefix):
        raise ContentValidationError("image path is outside the configured media prefix")
    return value


def validate_document(document: dict[str, Any], media_public_base_url: str) -> dict[str, Any]:
    if not isinstance(document, dict) or document.get("type") != "doc":
        raise ContentValidationError("contentJson must be a TipTap doc")
    nodes_seen = 0

    def walk(node: Any, depth: int = 0) -> dict[str, Any]:
        nonlocal nodes_seen
        nodes_seen += 1
        if nodes_seen > 20_000 or depth > 50:
            raise ContentValidationError("document is too large or deeply nested")
        if not isinstance(node, dict):
            raise ContentValidationError("every content node must be an object")
        node_type = node.get("type")
        if node_type not in ALLOWED_NODES:
            raise ContentValidationError(f"unsupported content node: {node_type!r}")

        clean: dict[str, Any] = {"type": node_type}
        attrs = node.get("attrs") or {}
        if not isinstance(attrs, dict):
            raise ContentValidationError("node attrs must be an object")

        if node_type == "heading":
            level = attrs.get("level")
            if level not in {2, 3}:
                raise ContentValidationError("article body headings must be level 2 or 3")
            clean["attrs"] = {"level": level}
        elif node_type == "orderedList":
            start = attrs.get("start", 1)
            if not isinstance(start, int) or not 1 <= start <= 10_000:
                raise ContentValidationError("ordered list start is invalid")
            clean["attrs"] = {"start": start}
        elif node_type == "codeBlock":
            language = attrs.get("language")
            if language is not None:
                if not isinstance(language, str) or not re.fullmatch(r"[A-Za-z0-9_+.#-]{1,32}", language):
                    raise ContentValidationError("code language is invalid")
                clean["attrs"] = {"language": language}
        elif node_type in {"image", "figureImage"}:
            src = attrs.get("src")
            if not isinstance(src, str):
                raise ContentValidationError("image src is required")
            image_attrs: dict[str, Any] = {"src": _safe_image(src, media_public_base_url)}
            for key in ("alt", "title", "caption"):
                value = attrs.get(key)
                if value is not None:
                    if not isinstance(value, str) or len(value) > 500:
                        raise ContentValidationError(f"image {key} is invalid")
                    image_attrs[key] = value
            clean["attrs"] = image_attrs
        elif attrs:
            raise ContentValidationError(f"attrs are not supported on {node_type}")

        if node_type == "text":
            text = node.get("text")
            if not isinstance(text, str) or len(text) > 100_000:
                raise ContentValidationError("text node is invalid")
            clean["text"] = text
            marks = node.get("marks") or []
            if not isinstance(marks, list):
                raise ContentValidationError("marks must be an array")
            clean_marks: list[dict[str, Any]] = []
            for mark in marks:
                if not isinstance(mark, dict) or mark.get("type") not in ALLOWED_MARKS:
                    raise ContentValidationError("unsupported text mark")
                clean_mark: dict[str, Any] = {"type": mark["type"]}
                mark_attrs = mark.get("attrs") or {}
                if mark["type"] == "link":
                    href = mark_attrs.get("href")
                    if not isinstance(href, str):
                        raise ContentValidationError("link href is required")
                    clean_mark["attrs"] = {
                        "href": _safe_link(href),
                        "title": str(mark_attrs.get("title", ""))[:200],
                    }
                elif mark_attrs:
                    raise ContentValidationError("mark attrs are unsupported")
                clean_marks.append(clean_mark)
            if clean_marks:
                clean["marks"] = clean_marks
        else:
            if "text" in node:
                raise ContentValidationError("only text nodes may contain text")
            content = node.get("content") or []
            if not isinstance(content, list):
                raise ContentValidationError("node content must be an array")
            if content:
                clean["content"] = [walk(child, depth + 1) for child in content]
        return clean

    cleaned = walk(document)
    encoded = json.dumps(cleaned, ensure_ascii=False, separators=(",", ":"))
    if len(encoded.encode("utf-8")) > 1_000_000:
        raise ContentValidationError("document exceeds the 1 MiB limit")
    return cleaned


def _render_marks(text: str, marks: list[dict[str, Any]]) -> str:
    result = html.escape(text)
    wrappers = {
        "bold": ("<strong>", "</strong>"),
        "italic": ("<em>", "</em>"),
        "underline": ("<u>", "</u>"),
        "strike": ("<s>", "</s>"),
        "code": ("<code>", "</code>"),
    }
    for mark in marks:
        mark_type = mark["type"]
        if mark_type == "link":
            attrs = mark.get("attrs", {})
            href = html.escape(attrs["href"], quote=True)
            title = html.escape(attrs.get("title", ""), quote=True)
            title_attr = f' title="{title}"' if title else ""
            result = f'<a href="{href}"{title_attr} rel="noopener noreferrer">{result}</a>'
        else:
            start, end = wrappers[mark_type]
            result = start + result + end
    return result


def _render_node(node: dict[str, Any]) -> str:
    node_type = node["type"]
    children = "".join(_render_node(child) for child in node.get("content", []))
    if node_type == "doc":
        return children
    if node_type == "text":
        return _render_marks(node["text"], node.get("marks", []))
    if node_type == "paragraph":
        return f"<p>{children}</p>"
    if node_type == "heading":
        level = node["attrs"]["level"]
        return f"<h{level}>{children}</h{level}>"
    if node_type == "blockquote":
        return f"<blockquote>{children}</blockquote>"
    if node_type == "bulletList":
        return f"<ul>{children}</ul>"
    if node_type == "orderedList":
        start = node.get("attrs", {}).get("start", 1)
        return f'<ol start="{start}">{children}</ol>' if start != 1 else f"<ol>{children}</ol>"
    if node_type == "listItem":
        return f"<li>{children}</li>"
    if node_type == "hardBreak":
        return "<br>"
    if node_type == "horizontalRule":
        return "<hr>"
    if node_type == "codeBlock":
        return f"<pre><code>{children}</code></pre>"
    if node_type in {"image", "figureImage"}:
        attrs = node["attrs"]
        src = html.escape(attrs["src"], quote=True)
        alt = html.escape(attrs.get("alt", ""), quote=True)
        title = html.escape(attrs.get("title", ""), quote=True)
        title_attr = f' title="{title}"' if title else ""
        caption = attrs.get("caption", "")
        rendered = f'<img src="{src}" alt="{alt}"{title_attr} loading="lazy" decoding="async">'
        if caption:
            return f"<figure>{rendered}<figcaption>{html.escape(caption)}</figcaption></figure>"
        return f"<figure>{rendered}</figure>"
    raise AssertionError(f"unhandled node type {node_type}")


def _plain_text(node: dict[str, Any]) -> str:
    if node["type"] == "text":
        return node["text"]
    separator = "\n" if node["type"] in {"paragraph", "heading", "blockquote", "listItem", "codeBlock"} else ""
    return "".join(_plain_text(child) for child in node.get("content", [])) + separator


def render_document(document: dict[str, Any], media_public_base_url: str) -> RenderedContent:
    cleaned = validate_document(document, media_public_base_url)
    rendered = _render_node(cleaned)
    sanitised = bleach.clean(
        rendered,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        protocols={"http", "https", "mailto"},
        strip=True,
    )
    text = re.sub(r"\n{3,}", "\n\n", _plain_text(cleaned)).strip()
    latin_words = len(re.findall(r"[A-Za-z0-9_]+", text))
    cjk_chars = len(re.findall(r"[\u3400-\u9fff]", text))
    reading_minutes = max(1, math.ceil(latin_words / 220 + cjk_chars / 400))
    return RenderedContent(cleaned, sanitised, text, reading_minutes)


def empty_document() -> dict[str, Any]:
    return {"type": "doc", "content": [{"type": "paragraph"}]}
