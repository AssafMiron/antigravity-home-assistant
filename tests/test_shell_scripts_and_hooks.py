import base64
import gzip
import json
import os
import pathlib
import stat
import subprocess
import tempfile
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
ADDON_DIR = REPO_ROOT / "antigravity-terminal"


class TestShellScriptsAndHooks(unittest.TestCase):
    def test_all_shell_scripts_syntax_and_executable(self):
        scripts = [
            ADDON_DIR / "rootfs/etc/cont-init.d/00-setup-antigravity.sh",
            ADDON_DIR / "rootfs/etc/services.d/ttyd/run",
            ADDON_DIR / "rootfs/etc/services.d/ttyd/finish",
            ADDON_DIR / "rootfs/usr/local/bin/agy-entrypoint",
            ADDON_DIR / "rootfs/usr/local/bin/agy-login-url",
            ADDON_DIR / "rootfs/usr/local/bin/ha-api",
            ADDON_DIR / "rootfs/usr/local/bin/login-url-watcher",
            ADDON_DIR / "rootfs/usr/local/bin/prepare-ttyd-ui",
            ADDON_DIR / "harness/hooks/session_start.sh",
            ADDON_DIR / "harness/hooks/pre_edit_backup.sh",
            ADDON_DIR / "harness/hooks/post_edit_check.sh",
            ADDON_DIR / "harness/skills/ha-diagnostics/scripts/ha_health_report.sh",
        ]
        for script in scripts:
            self.assertTrue(script.is_file(), f"Missing script: {script}")
            self.assertTrue(os.access(script, os.X_OK), f"Not executable: {script}")
            res = subprocess.run(
                ["bash", "-n", str(script)],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(
                res.returncode,
                0,
                f"Syntax error in {script}: {res.stderr}",
            )

    def test_pre_edit_backup_hook_decisions_and_backup_creation(self):
        hook = ADDON_DIR / "harness/hooks/pre_edit_backup.sh"

        # 1. Empty payload -> allow
        res = subprocess.run(
            [str(hook)],
            input="{}",
            capture_output=True,
            text=True,
            check=True,
        )
        self.assertEqual(json.loads(res.stdout), {"decision": "allow"})

        # 2. Core entity_registry -> force_ask
        payload_registry = json.dumps(
            {"toolCall": {"args": {"Path": "/config/.storage/core.entity_registry"}}}
        )
        res = subprocess.run(
            [str(hook)],
            input=payload_registry,
            capture_output=True,
            text=True,
            check=True,
        )
        out = json.loads(res.stdout)
        self.assertEqual(out["decision"], "force_ask")
        self.assertIn("core.entity_registry", out["reason"])

        # 3. secrets.yaml -> ask
        payload_secrets = json.dumps(
            {"toolCall": {"args": {"TargetFile": "/config/secrets.yaml"}}}
        )
        res = subprocess.run(
            [str(hook)],
            input=payload_secrets,
            capture_output=True,
            text=True,
            check=True,
        )
        out = json.loads(res.stdout)
        self.assertEqual(out["decision"], "ask")

        # 4. Normal YAML file -> creates timestamped backup when HA_AUTO_BACKUP=true
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = pathlib.Path(tmpdir)
            target_file = tmp_path / "automations.yaml"
            target_file.write_text("- id: test_auto\n", encoding="utf-8")
            backup_root = tmp_path / "backups"

            env = os.environ.copy()
            env["HA_AUTO_BACKUP"] = "true"
            env["HA_BACKUP_ROOT"] = str(backup_root)

            payload_auto = json.dumps({"toolCall": {"args": {"Path": str(target_file)}}})
            res = subprocess.run(
                [str(hook)],
                input=payload_auto,
                env=env,
                capture_output=True,
                text=True,
                check=True,
            )
            self.assertEqual(json.loads(res.stdout), {"decision": "allow"})
            bak_files = list(backup_root.glob("*/*.bak"))
            self.assertEqual(len(bak_files), 1)
            self.assertEqual(bak_files[0].read_text(encoding="utf-8"), "- id: test_auto\n")

            # 5. HA_AUTO_BACKUP=false -> skips backup creation
            backup_root_disabled = tmp_path / "backups_disabled"
            env["HA_AUTO_BACKUP"] = "false"
            env["HA_BACKUP_ROOT"] = str(backup_root_disabled)
            subprocess.run(
                [str(hook)],
                input=payload_auto,
                env=env,
                capture_output=True,
                text=True,
                check=True,
            )
            self.assertFalse(backup_root_disabled.exists())

    def test_post_edit_check_hook(self):
        hook = ADDON_DIR / "harness/hooks/post_edit_check.sh"
        res = subprocess.run(
            [str(hook)],
            input='{"toolCall":{"args":{"Path":"/config/automations.yaml"}}}',
            capture_output=True,
            text=True,
            check=True,
        )
        self.assertEqual(json.loads(res.stdout), {})

    def test_session_start_hook_with_mock_curl(self):
        hook = ADDON_DIR / "harness/hooks/session_start.sh"
        with tempfile.TemporaryDirectory() as tmpdir:
            bin_dir = pathlib.Path(tmpdir)
            mock_curl = bin_dir / "curl"
            mock_curl.write_text(
                '#!/usr/bin/env bash\n'
                'for arg in "$@"; do\n'
                '  case "$arg" in\n'
                '    */config) echo \'{"version":"2026.11.1"}\'; exit 0 ;;\n'
                '    */states) echo \'[{"entity_id":"light.a"},{"entity_id":"sensor.b"}]\'; exit 0 ;;\n'
                '  esac\n'
                'done\n',
                encoding="utf-8",
            )
            mock_curl.chmod(mock_curl.stat().st_mode | stat.S_IEXEC)

            env = os.environ.copy()
            env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"
            env["SUPERVISOR_TOKEN"] = "test-token-123"

            res = subprocess.run(
                [str(hook)],
                input="{}",
                env=env,
                capture_output=True,
                text=True,
                check=True,
            )
            out = json.loads(res.stdout)
            msg = out["injectSteps"][0]["systemMessage"]["systemMessage"]
            self.assertIn("2026.11.1", msg)
            self.assertIn("Total Entities: 2", msg)

    def test_ha_api_commands_with_mock_curl(self):
        ha_api = ADDON_DIR / "rootfs/usr/local/bin/ha-api"

        # 1. Missing SUPERVISOR_TOKEN -> exits non-zero
        env_no_token = {k: v for k, v in os.environ.items() if k != "SUPERVISOR_TOKEN"}
        res_no_tok = subprocess.run(
            [str(ha_api), "states"],
            env=env_no_token,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertNotEqual(res_no_tok.returncode, 0)
        self.assertIn("SUPERVISOR_TOKEN is not set", res_no_tok.stderr)

        # 2. Mock curl for all ha-api commands
        with tempfile.TemporaryDirectory() as tmpdir:
            bin_dir = pathlib.Path(tmpdir)
            mock_curl = bin_dir / "curl"
            mock_curl.write_text(
                '#!/usr/bin/env bash\n'
                'LAST="${!#}"\n'
                'case "$LAST" in\n'
                '  */states/light.kitchen)\n'
                '    echo \'{"entity_id":"light.kitchen","state":"on","attributes":{"friendly_name":"Kitchen Light"}}\'\n'
                '    ;;\n'
                '  */states)\n'
                '    echo \'[{"entity_id":"light.kitchen","state":"on","attributes":{"friendly_name":"Kitchen Light"}},{"entity_id":"sensor.temp","state":"22.5","attributes":{"friendly_name":"Temperature"}}]\'\n'
                '    ;;\n'
                '  */services/light/turn_on)\n'
                '    echo \'[{"entity_id":"light.kitchen","state":"on"}]\'\n'
                '    ;;\n'
                '  */services/automation/reload)\n'
                '    echo \'[]\'\n'
                '    ;;\n'
                '  */services)\n'
                '    echo \'[{"domain":"light","services":{"turn_on":{},"turn_off":{}}}]\'\n'
                '    ;;\n'
                '  */template)\n'
                '    echo "22.5"\n'
                '    ;;\n'
                '  */config/core/check_config)\n'
                '    echo \'{"result":"valid","errors":null}\'\n'
                '    ;;\n'
                '  */error_log)\n'
                '    echo "2026-11-12 ERROR [homeassistant.components] Sample error"\n'
                '    ;;\n'
                '  *)\n'
                '    echo \'{}\'\n'
                '    ;;\n'
                'esac\n',
                encoding="utf-8",
            )
            mock_curl.chmod(mock_curl.stat().st_mode | stat.S_IEXEC)

            env = os.environ.copy()
            env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"
            env["SUPERVISOR_TOKEN"] = "mock-token"

            # entities
            res = subprocess.run([str(ha_api), "entities"], env=env, capture_output=True, text=True, check=True)
            self.assertEqual(res.stdout.strip().splitlines(), ["light.kitchen", "sensor.temp"])

            # entities filtered by domain
            res = subprocess.run([str(ha_api), "entities", "light"], env=env, capture_output=True, text=True, check=True)
            self.assertEqual(res.stdout.strip().splitlines(), ["light.kitchen"])

            # states filtered
            res = subprocess.run([str(ha_api), "states", "light"], env=env, capture_output=True, text=True, check=True)
            self.assertIn("light.kitchen", res.stdout)
            self.assertNotIn("sensor.temp", res.stdout)

            # single entity state
            res = subprocess.run([str(ha_api), "state", "light.kitchen"], env=env, capture_output=True, text=True, check=True)
            self.assertEqual(json.loads(res.stdout)["entity_id"], "light.kitchen")

            # services
            res = subprocess.run([str(ha_api), "services"], env=env, capture_output=True, text=True, check=True)
            self.assertIn("light: turn_off, turn_on", res.stdout)

            # call service
            res = subprocess.run(
                [str(ha_api), "call", "light.turn_on", '{"entity_id":"light.kitchen"}'],
                env=env,
                capture_output=True,
                text=True,
                check=True,
            )
            self.assertEqual(json.loads(res.stdout)[0]["entity_id"], "light.kitchen")

            # template
            res = subprocess.run(
                [str(ha_api), "template", '{{ states("sensor.temp") }}'],
                env=env,
                capture_output=True,
                text=True,
                check=True,
            )
            self.assertEqual(res.stdout.strip(), "22.5")

            # check
            res = subprocess.run([str(ha_api), "check"], env=env, capture_output=True, text=True, check=True)
            self.assertEqual(json.loads(res.stdout)["result"], "valid")

            # reload automations, scripts, scenes, groups, themes, all & invalid target
            for target in ("automations", "scripts", "scenes", "groups", "themes", "all"):
                res = subprocess.run([str(ha_api), "reload", target], env=env, capture_output=True, text=True, check=True)
                self.assertTrue(res.stdout.strip())

            res_bad = subprocess.run([str(ha_api), "reload", "invalid_target"], env=env, capture_output=True, text=True, check=False)
            self.assertNotEqual(res_bad.returncode, 0)

            # raw endpoint & help
            res = subprocess.run([str(ha_api), "raw", "GET", "/config"], env=env, capture_output=True, text=True, check=True)
            self.assertEqual(json.loads(res.stdout), {})

            res_help = subprocess.run([str(ha_api), "--help"], env=env, capture_output=True, text=True, check=True)
            self.assertIn("Usage: ha-api", res_help.stdout)

            # error-log
            res = subprocess.run([str(ha_api), "error-log"], env=env, capture_output=True, text=True, check=True)
            self.assertIn("ERROR", res.stdout)

    def test_ha_health_report_script_with_mock_ha_api(self):
        report_script = ADDON_DIR / "harness/skills/ha-diagnostics/scripts/ha_health_report.sh"
        with tempfile.TemporaryDirectory() as tmpdir:
            bin_dir = pathlib.Path(tmpdir)
            mock_ha_api = bin_dir / "ha-api"
            mock_ha_api.write_text(
                '#!/usr/bin/env bash\n'
                'case "$1" in\n'
                '  check) echo \'{"result":"valid"}\' ;;\n'
                '  entities) printf "light.kitchen\\nsensor.broken\\nsensor.mystery\\n" ;;\n'
                '  states) printf "light.kitchen  on  Kitchen\\nsensor.broken  unavailable  Broken\\nsensor.mystery  unknown  Mystery\\n" ;;\n'
                '  error-log) echo "2026-11-12 ERROR [homeassistant] Test error line" ;;\n'
                'esac\n',
                encoding="utf-8",
            )
            mock_ha_api.chmod(mock_ha_api.stat().st_mode | stat.S_IEXEC)

            env = os.environ.copy()
            env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"

            res = subprocess.run(
                [str(report_script)],
                env=env,
                capture_output=True,
                text=True,
                check=True,
            )
            self.assertIn("Total Entities:       3", res.stdout)
            self.assertIn("Unavailable Entities: 1", res.stdout)
            self.assertIn("Unknown Entities:     1", res.stdout)
            self.assertIn("Test error line", res.stdout)

    def test_agy_login_url_reassembles_hard_wrapped_and_bordered_oauth_url(self):
        agy_login_url = ADDON_DIR / "rootfs/usr/local/bin/agy-login-url"
        oauth_url = (
            "https://accounts.google.com/o/oauth2/auth?access_type=offline"
            "&client_id=1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com"
            "&code_challenge=2G9239uYWzCIiDcRbvOJ9Vc5Zlk_9wxrvGU2j7s3MmA"
            "&code_challenge_method=S256&redirect_uri=https%3A%2F%2Fantigravity.google%2Foauth-callback"
            "&response_type=code&state=Y-7u894R2Ov8_vpvBud0jw"
        )

        # Simulate Ink TUI hard-wrapping the URL across 4 bordered lines followed by prompt text
        chunks = [oauth_url[i : i + 75] for i in range(0, len(oauth_url), 75)]
        pane_lines = [
            "╭───────────────────────────────────────────────────────────────────────────────╮",
            "│ Please visit the following URL to authorize Antigravity:                      │",
            "│                                                                               │",
            *[f"│ {chunk:<77} │" for chunk in chunks],
            "│                                                                               │",
            "│ Enter the authorization code:                                                 │",
            "╰───────────────────────────────────────────────────────────────────────────────╯",
        ]

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = pathlib.Path(tmpdir)
            pane_file = tmp_path / "pane.txt"
            out_file = tmp_path / "agy-login-url.txt"
            pane_file.write_text("\n".join(pane_lines) + "\n", encoding="utf-8")

            env = os.environ.copy()
            env["AGY_PANE_CAPTURE_FILE"] = str(pane_file)

            # 1. --print-only mode
            res_print = subprocess.run(
                [str(agy_login_url), "--print-only"],
                env=env,
                capture_output=True,
                text=True,
                check=True,
            )
            self.assertEqual(res_print.stdout.strip(), oauth_url)

            # 2. Default file-save mode
            res_save = subprocess.run(
                [str(agy_login_url), str(out_file)],
                env=env,
                capture_output=True,
                text=True,
                check=True,
            )
            self.assertEqual(out_file.read_text(encoding="utf-8").strip(), oauth_url)
            self.assertIn("Login URL saved to:", res_save.stdout)

    def test_login_url_watcher_posts_and_dismisses_ha_notification(self):
        watcher = ADDON_DIR / "rootfs/usr/local/bin/login-url-watcher"
        agy_login_url = ADDON_DIR / "rootfs/usr/local/bin/agy-login-url"
        oauth_url = (
            "https://accounts.google.com/o/oauth2/auth?access_type=offline"
            "&client_id=1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com"
            "&code_challenge=2G9239uYWzCIiDcRbvOJ9Vc5Zlk_9wxrvGU2j7s3MmA"
            "&code_challenge_method=S256&redirect_uri=https%3A%2F%2Fantigravity.google%2Foauth-callback"
            "&response_type=code&state=Y-7u894R2Ov8_vpvBud0jw"
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = pathlib.Path(tmpdir)
            pane_file = tmp_path / "pane.txt"
            curl_log = tmp_path / "curl_calls.jsonl"
            mock_curl = tmp_path / "curl"

            mock_curl.write_text(
                '#!/usr/bin/env bash\n'
                'URL="${!#}"\n'
                'PAYLOAD=""\n'
                'for ((i=1; i<=$#; i++)); do\n'
                '  if [ "${!i}" = "-d" ]; then\n'
                '    next=$((i+1))\n'
                '    PAYLOAD="${!next}"\n'
                '  fi\n'
                'done\n'
                f'printf "%s\\t%s\\n" "$URL" "$PAYLOAD" >> "{curl_log}"\n',
                encoding="utf-8",
            )
            mock_curl.chmod(mock_curl.stat().st_mode | stat.S_IEXEC)

            chunks = [oauth_url[i : i + 70] for i in range(0, len(oauth_url), 70)]
            pane_file.write_text("\n".join(chunks) + "\n", encoding="utf-8")

            env = os.environ.copy()
            env["PATH"] = f"{tmp_path}:{env.get('PATH', '')}"
            env["SUPERVISOR_TOKEN"] = "test-supervisor-token"
            env["AGY_PANE_CAPTURE_FILE"] = str(pane_file)
            env["AGY_LOGIN_URL_BIN"] = str(agy_login_url)
            env["AGY_WATCHER_ONCE"] = "true"

            subprocess.run([str(watcher)], env=env, check=True)

            calls = curl_log.read_text(encoding="utf-8").strip().splitlines()
            # First call: startup stale notification dismiss; second call: create notification with full URL
            self.assertEqual(len(calls), 2)
            self.assertIn("/services/persistent_notification/dismiss", calls[0])
            self.assertIn("/services/persistent_notification/create", calls[1])
            create_payload = json.loads(calls[1].split("\t", 1)[1])
            self.assertEqual(create_payload["notification_id"], "agy_login_url")
            self.assertEqual(create_payload["title"], "Antigravity login")
            self.assertIn(f"[Click here to authorize Antigravity]({oauth_url})", create_payload["message"])

    def test_prepare_ttyd_ui_decompresses_and_injects_helper(self):
        prepare_script = ADDON_DIR / "rootfs/usr/local/bin/prepare-ttyd-ui"
        helper_js = ADDON_DIR / "rootfs/usr/share/ttyd/agy-ttyd-helper.js"

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = pathlib.Path(tmpdir)
            out_html = tmp_path / "index.html"
            raw_gz_file = tmp_path / "ttyd-response.gz"

            html_bytes = (
                b'<!DOCTYPE html><html><head><title>ttyd</title></head>'
                b'<body><div id="terminal"></div></body></html>'
            )
            raw_gz_file.write_bytes(gzip.compress(html_bytes))

            env = os.environ.copy()
            env["TTYD_RAW_RESPONSE_FILE"] = str(raw_gz_file)
            env["TTYD_HELPER_JS"] = str(helper_js)
            env["TTYD_OUT_HTML"] = str(out_html)

            subprocess.run([str(prepare_script)], env=env, check=True)

            self.assertTrue(out_html.is_file())
            patched = out_html.read_text(encoding="utf-8")
            self.assertIn('<div id="terminal"></div>', patched)
            self.assertIn("scanBufferForWrappedUrls", patched)
            self.assertNotIn("agy-oauth-banner", patched)

    def test_ttyd_run_and_tmux_configuration(self):
        ttyd_run = (ADDON_DIR / "rootfs/etc/services.d/ttyd/run").read_text(encoding="utf-8")
        setup_script = (ADDON_DIR / "rootfs/etc/cont-init.d/00-setup-antigravity.sh").read_text(encoding="utf-8")

        # Verify fontFamily has no nested single quotes that break Canvas ctx.font parsing
        self.assertIn(
            '-t fontFamily="Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace"',
            ttyd_run,
        )
        self.assertNotIn("'JetBrains Mono'", ttyd_run)
        self.assertIn("--index /usr/share/ttyd/index.html", ttyd_run)
        self.assertIn("/usr/local/bin/login-url-watcher", ttyd_run)

        # Verify tmux mouse hijacking is disabled and BROWSER / xdg-open is NOT exported
        self.assertIn("set -g mouse off", setup_script)
        self.assertNotIn("BROWSER", setup_script)
        self.assertNotIn("xdg-open", setup_script)
        self.assertFalse((ADDON_DIR / "rootfs/usr/local/bin/xdg-open").exists())


if __name__ == "__main__":
    unittest.main()
