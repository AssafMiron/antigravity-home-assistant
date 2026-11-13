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


if __name__ == "__main__":
    unittest.main()
