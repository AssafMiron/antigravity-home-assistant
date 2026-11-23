import math
import pathlib
import re
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
HELPER_JS_PATH = (
    REPO_ROOT
    / "antigravity-terminal/rootfs/usr/share/ttyd/agy-ttyd-helper.js"
)
SIDEBAR_ICON_JS_PATH = (
    REPO_ROOT
    / "antigravity-terminal/rootfs/usr/share/ttyd/agy-ha-sidebar-icon.js"
)


class TestAgyTtydHelper(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.js_source = HELPER_JS_PATH.read_text(encoding="utf-8")
        cls.sidebar_js_source = SIDEBAR_ICON_JS_PATH.read_text(encoding="utf-8")

    def test_helper_js_exists_and_contains_core_components_without_auto_open_or_auto_copy(self):
        self.assertTrue(HELPER_JS_PATH.is_file())
        self.assertTrue(SIDEBAR_ICON_JS_PATH.is_file())
        required_identifiers = [
            "unwrapIfMultilineUrl",
            "copyWithExecCommand",
            "copyToClipboard",
            "decodeOsc52",
            "scanBufferForWrappedUrls",
            "resolveFullUrl",
            "openUrlSafely",
            "registerOscHandler",
            "registerLinkProvider",
            "ANTIGRAVITY_SVG_PATH",
            "applyIconToHaSidebar",
            "customIconsets",
        ]
        for ident in required_identifiers:
            self.assertIn(ident, self.js_source, f"Missing identifier in agy-ttyd-helper.js: {ident}")

        for ident in ("ANTIGRAVITY_SVG_PATH", "applyIconToHaSidebar", "customIconsets", "agy:antigravity"):
            self.assertIn(ident, self.sidebar_js_source, f"Missing identifier in agy-ha-sidebar-icon.js: {ident}")

        # Ensure removed problematic behaviors (auto-copy on select, floating banner, OSC 777, Window Proxy) are absent
        forbidden_identifiers = [
            "onSelectionChange",
            "ensureOAuthBanner",
            "agy-oauth-banner",
            "agy-url-b64;",
            "new Proxy",
        ]
        for forbidden in forbidden_identifiers:
            self.assertNotIn(
                forbidden,
                self.js_source,
                f"Forbidden identifier found in agy-ttyd-helper.js: {forbidden}",
            )

    def test_multiline_oauth_url_reconstruction_algorithm(self):
        """
        Verifies the multi-line wrapped URL reconstruction logic used in
        scanBufferForWrappedUrls() against the 6-line wrapped Google OAuth URL
        from the Antigravity Terminal TUI (both plain and inside box borders).
        """
        full_expected_url = (
            "https://accounts.google.com/o/oauth2/auth?access_type=offline"
            "&client_id=1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com"
            "&code_challenge=2G9239uYWzCIiDcRbvOJ9Vc5Zlk_9wxrvGU2j7s3MmA"
            "&code_challenge_method=S256"
            "&redirect_uri=https%3A%2F%2Fantigravity.google%2Foauth-callback"
            "&response_type=code"
            "&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcloud-platform"
            "+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email"
            "+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.profile"
            "+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcclog"
            "+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fexperimentsandconfigs"
            "+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Faicode+openid"
            "&state=Y-7u894R2Ov8_vpvBud0jw"
        )

        # Simulate Ink TUI hard-wrapping the URL at 95 columns inside a bordered box
        wrapped_chunks = [
            f"│ {full_expected_url[i : i + 95]} │"
            for i in range(0, len(full_expected_url), 95)
        ]
        self.assertGreaterEqual(len(wrapped_chunks), 6)

        terminal_rows = [
            "│ Please visit the following URL to authorize: │",
            "│                                              │",
            *wrapped_chunks,
            "│                                              │",
            "│ Enter the authorization code:                │",
        ]

        # Extract the exact URL_CONT_REGEX pattern from agy-ttyd-helper.js
        m = re.search(r"const URL_CONT_REGEX = /\^(\[.+\])\+\$/;", self.js_source)
        self.assertIsNotNone(m, "URL_CONT_REGEX must be defined in agy-ttyd-helper.js")
        url_cont_pattern = re.compile(r"^" + m.group(1) + r"+$")

        def clean_row(s: str) -> str:
            return re.sub(
                r"[\s│┃║|╭╮╯╰┌┐└┘├┤┬┴┼─━]+$",
                "",
                re.sub(r"^[\s│┃║|╭╮╯╰┌┐└┘├┤┬┴┼─━]+", "", s),
            )

        reconstructed = []
        r = 0
        while r < len(terminal_rows):
            cleaned = clean_row(terminal_rows[r])
            match = re.search(r"https?://[^\s\"'<>│┃║|]+", cleaned, re.IGNORECASE)
            if not match:
                r += 1
                continue
            url_start = match.group(0)
            parts = [url_start]
            end_row = r
            if cleaned.endswith(url_start) and len(url_start) >= 30:
                for next_r in range(r + 1, min(len(terminal_rows), r + 15)):
                    next_clean = clean_row(terminal_rows[next_r])
                    if (
                        len(next_clean) > 0
                        and not re.search(r"\s", next_clean)
                        and url_cont_pattern.match(next_clean)
                        and not re.match(r"^https?://", next_clean, re.IGNORECASE)
                    ):
                        parts.append(next_clean)
                        end_row = next_r
                        if len(next_clean) < 30:
                            break
                    else:
                        break
            reconstructed.append(
                {
                    "fullUrl": "".join(parts),
                    "firstLineUrl": url_start,
                    "startRow": r,
                    "endRow": end_row,
                }
            )
            r = end_row + 1

        self.assertEqual(len(reconstructed), 1)
        self.assertEqual(reconstructed[0]["fullUrl"], full_expected_url)
        self.assertEqual(reconstructed[0]["startRow"], 2)
        self.assertEqual(reconstructed[0]["endRow"], 2 + len(wrapped_chunks) - 1)

    def test_unwrap_if_multiline_url_behavior(self):
        """
        Verifies that unwrapIfMultilineUrl() unwraps multi-line URLs (including
        TUI box borders) while leaving normal multi-line YAML/prose untouched.
        """
        def unwrap_if_multiline_url(text: str) -> str:
            if not text:
                return text
            trimmed = text.strip()
            if not re.match(r"^https?://", trimmed, re.IGNORECASE):
                return text
            lines = [
                re.sub(
                    r"[\s│┃║|╭╮╯╰┌┐└┘├┤┬┴┼─━]+$",
                    "",
                    re.sub(r"^[\s│┃║|╭╮╯╰┌┐└┘├┤┬┴┼─━]+", "", l),
                )
                for l in re.split(r"\r?\n", trimmed)
            ]
            if len(lines) > 1 and all(len(l) > 0 and not re.search(r"\s", l) for l in lines):
                return "".join(lines)
            return text

        # 1. Wrapped OAuth URL with TUI box borders -> unwraps cleanly
        boxed_url = (
            "https://accounts.google.com/o/oauth2/auth?client_id=107100\n"
            "│ 6060591-tmhssin.apps.googleusercontent.com&state=abc123 │\n"
            "│ &redirect_uri=https%3A%2F%2Fantigravity.google%2Fcb     │"
        )
        self.assertEqual(
            unwrap_if_multiline_url(boxed_url),
            "https://accounts.google.com/o/oauth2/auth?client_id=1071006060591-tmhssin.apps.googleusercontent.com&state=abc123&redirect_uri=https%3A%2F%2Fantigravity.google%2Fcb",
        )

        # 2. Normal multi-line YAML or command output -> preserves newlines
        yaml_snippet = "triggers:\n  - trigger: state\n    entity_id: light.kitchen"
        self.assertEqual(unwrap_if_multiline_url(yaml_snippet), yaml_snippet)

        # 3. URL followed by prose with spaces -> preserves newlines
        url_with_prose = "https://example.com/path\nSome explanation text with spaces"
        self.assertEqual(unwrap_if_multiline_url(url_with_prose), url_with_prose)

    def test_mobile_scroll_zoom_and_toolbar_primitives_present(self):
        required_tokens = [
            "injectHelperStyles",
            "sendTermInput",
            "isTmuxMouseActive",
            "clampWheelCoords",
            "dispatchTermWheel",
            "scrollTerminalByLines",
            "scrollTerminalPage",
            "scrollTerminalToBottom",
            "attachTouchScroll",
            "attachUrlClickFallback",
            "applyInitialFontSize",
            "setTermFontSize",
            "adjustFontSize",
            "ensureFloatingToolbar",
            "'role', 'toolbar'",
            "'focusgroup', 'toolbar wrap'",
            "scrollbar-color",
            "overscroll-behavior",
            "safe-area-inset",
            "\\x1b[998~",
            "\\x1b[997~",
            "\\x1b[999~",
            "\\x0f",
        ]
        for token in required_tokens:
            self.assertIn(token, self.js_source, f"Missing mobile/scroll token in agy-ttyd-helper.js: {token}")

        # Must never contain literal closing script tag since prepare-ttyd-ui embeds JS inline
        self.assertNotIn("</script>", self.js_source.lower())

    def test_wheel_coord_clamping_stays_above_tmux_status_bar(self):
        def clamp_wheel_coords(rect, rows, client_x, client_y):
            left, top, width, height = rect["left"], rect["top"], rect["width"], rect["height"]
            right, bottom = left + width, top + height
            safe_rows = max(1, rows or 24)
            cell_h = height / safe_rows
            min_x = left + min(4, width * 0.25)
            max_x = max(min_x, right - min(4, width * 0.25))
            min_y = top + cell_h * 0.5
            max_y = max(min_y, bottom - cell_h * 1.5)
            raw_x = client_x if client_x is not None else (left + right) / 2
            raw_y = client_y if client_y is not None else (min_y + max_y) / 2
            return {
                "x": min(max_x, max(min_x, raw_x)),
                "y": min(max_y, max(min_y, raw_y)),
            }

        rect = {"left": 0, "top": 0, "width": 400, "height": 800}
        rows = 40  # cell_h = 20px; bottom status bar row is y in [780, 800]
        bottom_bar_click = clamp_wheel_coords(rect, rows, 399, 795)
        self.assertLessEqual(bottom_bar_click["y"], 770.0)
        self.assertGreaterEqual(bottom_bar_click["y"], 10.0)
        self.assertEqual(bottom_bar_click["x"], 396.0)

        top_edge_click = clamp_wheel_coords(rect, rows, -10, -5)
        self.assertEqual(top_edge_click, {"x": 4.0, "y": 10.0})

        default_coords = clamp_wheel_coords(rect, rows, None, None)
        self.assertEqual(default_coords["x"], 200.0)
        self.assertEqual(default_coords["y"], 390.0)

    def test_natural_touch_scroll_step_and_font_clamping(self):
        def compute_scroll_step(accum_px, line_height_px, tmux_mode):
            safe_line_h = max(10, line_height_px or 16)
            if tmux_mode:
                step_px = max(12, safe_line_h * 1.5)
                ticks = math.trunc(accum_px / step_px)
                return {"lines": ticks * 3, "consumed": ticks * step_px}
            lines = math.trunc(accum_px / safe_line_h)
            return {"lines": lines, "consumed": lines * safe_line_h}

        # Dragging finger down (currentY > lastY -> stepY < 0) scrolls UP (negative lines)
        up_tmux = compute_scroll_step(-50, 16, True)  # step_px = 24 -> -2 ticks -> -6 lines
        self.assertEqual(up_tmux["lines"], -6)
        self.assertEqual(up_tmux["consumed"], -48)

        # Dragging finger up (stepY > 0) scrolls DOWN (positive lines)
        down_normal = compute_scroll_step(35, 16, False)
        self.assertEqual(down_normal["lines"], 2)
        self.assertEqual(down_normal["consumed"], 32)

        def clamp_font_size(size):
            return min(24, max(8, round(size)))

        def default_font_size(viewport_width):
            return 11 if viewport_width < 600 else 14

        self.assertEqual(clamp_font_size(5), 8)
        self.assertEqual(clamp_font_size(30), 24)
        self.assertEqual(clamp_font_size(12.6), 13)
        self.assertEqual(default_font_size(390), 11)
        self.assertEqual(default_font_size(1280), 14)

    def test_url_click_hit_testing_single_and_multiline(self):
        def clean_row(s):
            return re.sub(
                r"[\s│┃║|╭╮╯╰┌┐└┘├┤┬┴┼─━]+$",
                "",
                re.sub(r"^[\s│┃║|╭╮╯╰┌┐└┘├┤┬┴┼─━]+", "", s),
            )

        rows = [
            "│ Open https://example.com/status to view │",
            "│ https://accounts.google.com/o/oauth2/auth?client_id=1234567890 │",
            "│ &redirect_uri=https%3A%2F%2Fantigravity.google%2Foauth         │",
        ]
        items = [
            {
                "fullUrl": "https://example.com/status",
                "firstLineUrl": "https://example.com/status",
                "startRow": 0,
                "endRow": 0,
            },
            {
                "fullUrl": "https://accounts.google.com/o/oauth2/auth?client_id=1234567890&redirect_uri=https%3A%2F%2Fantigravity.google%2Foauth",
                "firstLineUrl": "https://accounts.google.com/o/oauth2/auth?client_id=1234567890",
                "startRow": 1,
                "endRow": 2,
            },
        ]

        def find_url_at_cell(row_idx, col_one_based):
            line_str = rows[row_idx]
            cleaned = clean_row(line_str)
            for item in items:
                if item["startRow"] <= row_idx <= item["endRow"]:
                    fragment = item["firstLineUrl"] if row_idx == item["startRow"] else cleaned
                    idx = line_str.find(fragment)
                    if idx == -1:
                        continue
                    start_col = idx + 1
                    end_col = start_col + len(fragment) - 1
                    if start_col <= col_one_based <= end_col:
                        return item["fullUrl"]
            return None

        # Click inside single-line URL on row 0 ("https://..." starts at col 8)
        self.assertEqual(find_url_at_cell(0, 12), "https://example.com/status")
        # Click on prose before URL on row 0 ("Open") -> None
        self.assertIsNone(find_url_at_cell(0, 4))
        # Click on continuation line (row 2) of multi-line URL -> returns full unwrapped URL
        self.assertEqual(find_url_at_cell(2, 10), items[1]["fullUrl"])

    def test_helper_js_delimiter_balance_sanity(self):
        """Ensures braces, parentheses, and brackets in agy-ttyd-helper.js are balanced."""
        src = self.js_source
        stack = []
        pairs = {")": "(", "}": "{", "]": "["}
        i = 0
        n = len(src)
        state = "code"
        quote = ""
        in_char_class = False

        while i < n:
            ch = src[i]
            nxt = src[i + 1] if i + 1 < n else ""

            if state == "line_comment":
                if ch == "\n":
                    state = "code"
                i += 1
                continue
            if state == "block_comment":
                if ch == "*" and nxt == "/":
                    state = "code"
                    i += 2
                    continue
                i += 1
                continue
            if state == "string":
                if ch == "\\":
                    i += 2
                    continue
                if ch == quote:
                    state = "code"
                i += 1
                continue
            if state == "regex":
                if ch == "\\":
                    i += 2
                    continue
                if ch == "[":
                    in_char_class = True
                elif ch == "]" and in_char_class:
                    in_char_class = False
                elif ch == "/" and not in_char_class:
                    state = "code"
                i += 1
                continue

            # state == "code"
            if ch == "/" and nxt == "/":
                state = "line_comment"
                i += 2
                continue
            if ch == "/" and nxt == "*":
                state = "block_comment"
                i += 2
                continue
            if ch in ("'", '"', "`"):
                state = "string"
                quote = ch
                i += 1
                continue
            if ch == "/":
                # Heuristic: regex literal if preceded by operator/delimiter/keyword
                prev = src[:i].rstrip()
                if not prev or prev[-1] in "(=[,;:!&|?{}\n":
                    state = "regex"
                    in_char_class = False
                    i += 1
                    continue
            if ch in "({[":
                stack.append(ch)
            elif ch in ")}]":
                self.assertTrue(stack, f"Unexpected closing {ch} at index {i}")
                self.assertEqual(stack.pop(), pairs[ch], f"Mismatched {ch} at index {i}")
            i += 1

        self.assertEqual(state, "code", f"Unterminated state: {state}")
        self.assertEqual(stack, [], f"Unclosed delimiters: {stack}")


if __name__ == "__main__":
    unittest.main()
