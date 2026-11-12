import json
import os
import pathlib
import re
import unittest

try:
    import yaml  # type: ignore
except ImportError:
    yaml = None

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
ADDON_DIR = REPO_ROOT / "antigravity-terminal"


def load_yaml_simple(text: str) -> dict:
    """
    Loads YAML using PyYAML if installed, or falls back to a lightweight
    indentation-aware parser for the repository's simple manifest YAML files.
    """
    if yaml is not None:
        return yaml.safe_load(text)

    root: dict = {}
    stack: list[tuple[int, object]] = [(-1, root)]

    for raw_line in text.splitlines():
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(raw_line) - len(raw_line.lstrip(" "))

        while len(stack) > 1 and indent <= stack[-1][0]:
            stack.pop()

        parent = stack[-1][1]

        if stripped.startswith("- "):
            val = stripped[2:].strip().strip("\"'")
            if isinstance(parent, list):
                parent.append(val)
            continue

        if ":" in stripped:
            key, rest = stripped.split(":", 1)
            key = key.strip()
            rest = rest.strip()
            if not rest:
                # Look ahead handled dynamically: default to dict, convert to list if needed
                child: dict = {}
                if isinstance(parent, dict):
                    parent[key] = child
                stack.append((indent, child))
            else:
                val_str = rest.strip("\"'")
                if val_str == "true":
                    val: object = True
                elif val_str == "false":
                    val = False
                elif val_str.isdigit():
                    val = int(val_str)
                else:
                    val = val_str
                if isinstance(parent, dict):
                    parent[key] = val

    # Convert empty dict values followed by list items in raw text (such as `arch:` or `map:`)
    for list_key in ("arch", "map"):
        m = re.search(rf"^{list_key}:\s*\n((?:  - .+\n?)+)", text, re.MULTILINE)
        if m:
            items = [
                line.strip()[2:].strip().strip("\"'")
                for line in m.group(1).strip().splitlines()
            ]
            root[list_key] = items

    return root


class TestAddonManifests(unittest.TestCase):
    def test_repository_yaml(self):
        repo_yaml = REPO_ROOT / "repository.yaml"
        self.assertTrue(repo_yaml.is_file(), "repository.yaml must exist")
        data = load_yaml_simple(repo_yaml.read_text(encoding="utf-8"))
        self.assertIn("name", data)
        self.assertIn("url", data)
        self.assertIn("maintainer", data)

    def test_config_yaml_and_translations_sync(self):
        config_path = ADDON_DIR / "config.yaml"
        trans_path = ADDON_DIR / "translations" / "en.yaml"
        self.assertTrue(config_path.is_file())
        self.assertTrue(trans_path.is_file())

        cfg = load_yaml_simple(config_path.read_text(encoding="utf-8"))
        trans = load_yaml_simple(trans_path.read_text(encoding="utf-8"))

        self.assertEqual(cfg.get("slug"), "antigravity_terminal")
        self.assertTrue(cfg.get("ingress"))
        self.assertEqual(cfg.get("ingress_port"), 7681)
        self.assertTrue(cfg.get("homeassistant_api"))
        self.assertTrue(cfg.get("hassio_api"))

        options_keys = set(cfg.get("options", {}).keys())
        schema_keys = set(cfg.get("schema", {}).keys())
        trans_keys = set(trans.get("configuration", {}).keys())

        self.assertEqual(
            options_keys,
            schema_keys,
            "config.yaml options and schema keys must match exactly",
        )
        self.assertEqual(
            options_keys,
            trans_keys,
            "translations/en.yaml configuration keys must match config.yaml options",
        )

    def test_build_yaml_matches_config_arch(self):
        cfg = load_yaml_simple((ADDON_DIR / "config.yaml").read_text(encoding="utf-8"))
        build = load_yaml_simple((ADDON_DIR / "build.yaml").read_text(encoding="utf-8"))
        self.assertEqual(
            set(cfg.get("arch", [])),
            set(build.get("build_from", {}).keys()),
            "build.yaml architectures must match config.yaml arch list",
        )

    def test_dockerfile_requirements(self):
        dockerfile = (ADDON_DIR / "Dockerfile").read_text(encoding="utf-8")
        self.assertIn("BROWSER=/usr/local/bin/xdg-open", dockerfile)
        self.assertIn("/usr/local/bin/xdg-open", dockerfile)
        self.assertIn("/usr/local/bin/prepare-ttyd-ui", dockerfile)
        self.assertIn("/usr/local/bin/agy-entrypoint", dockerfile)
        self.assertIn("/usr/local/bin/ha-api", dockerfile)

    def test_hooks_json_and_scripts_exist(self):
        hooks_json_path = ADDON_DIR / "harness" / "hooks.json"
        self.assertTrue(hooks_json_path.is_file())
        hooks_data = json.loads(hooks_json_path.read_text(encoding="utf-8"))

        self.assertIn("ha-session-context", hooks_data)
        self.assertIn("ha-pre-edit-safety", hooks_data)
        self.assertIn("ha-post-edit-validate", hooks_data)

        for script_name in ("session_start.sh", "pre_edit_backup.sh", "post_edit_check.sh"):
            script_path = ADDON_DIR / "harness" / "hooks" / script_name
            self.assertTrue(script_path.is_file(), f"Missing hook script: {script_name}")
            self.assertTrue(
                os.access(script_path, os.X_OK),
                f"Hook script must be executable: {script_name}",
            )

    def test_harness_skills_frontmatter(self):
        skills_dir = ADDON_DIR / "harness" / "skills"
        expected_skills = {"ha-automations", "ha-dashboards", "ha-diagnostics"}
        found_skills = set()

        for skill_md in skills_dir.glob("*/SKILL.md"):
            content = skill_md.read_text(encoding="utf-8")
            self.assertTrue(content.startswith("---\n"), f"{skill_md} missing YAML frontmatter")
            parts = content.split("---", 2)
            meta = load_yaml_simple(parts[1])
            self.assertIn("name", meta)
            self.assertIn("description", meta)
            found_skills.add(meta["name"])

        self.assertEqual(found_skills, expected_skills)


if __name__ == "__main__":
    unittest.main()
