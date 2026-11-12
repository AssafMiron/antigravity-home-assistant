# Home Assistant YAML & Architecture Rules

## File Inclusion Patterns
Always inspect `/config/configuration.yaml` first to see how the user organizes their setup:
- `!include filename.yaml`: Inserts the contents of `filename.yaml` directly at that key.
- `!include_dir_list dir/`: Each file in `dir/` is a single list item (e.g., a single automation per file).
- `!include_dir_merge_list dir/`: Each file in `dir/` contains a list of items that are merged into one list.
- `!include_dir_named dir/`: Each filename (without `.yaml`) becomes the dictionary key mapping to the file's content.
- `!include_dir_merge_named dir/`: Dictionary keys from all files in `dir/` are merged into a single dictionary (frequently used for `packages:`).

Match the structure required by the inclusion tag! For example, a file loaded via `!include_dir_merge_list` **must** have a top-level YAML list (`- id: ...`), whereas a file loaded via `!include_dir_list` **must** be a single YAML mapping (`id: ...`).

## Jinja2 Templating Standards
- **Safe State Access**:
  - ✅ `states('sensor.temperature')`
  - ✅ `is_state('binary_sensor.motion', 'on')`
  - ✅ `state_attr('climate.thermostat', 'current_temperature')`
  - ❌ `states.sensor.temperature.state` (causes errors during startup or when unavailable)
- **Type Conversions with Defaults**:
  - Always supply a default value to `float`, `int`, `as_datetime`, etc.:
  - ✅ `{{ states('sensor.power') | float(0) > 100 }}`
  - ❌ `{{ states('sensor.power') | float > 100 }}` (fails if state is `unavailable` or `unknown`)
- **Live Testing**:
  - Always test non-trivial Jinja2 templates using `ha-api template '<template>'` before saving them into YAML.
