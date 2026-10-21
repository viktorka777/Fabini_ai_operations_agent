# Mapa zdrojových kódů

JSON exporty jsou spustitelná definice workflow. `sources/` obsahuje čitelnou kopii každého Code node a system promptu. Po změně exportu je obnovte příkazem `python3 scripts/extract_sources.py`. Úprava těchto kopií sama workflow nezmění. Pro čtyři hlavní JS moduly lze použít `scripts/sync_sources.py`.

| Export | Node | Kopie zdroje |
|---|---|---|
| 00_reset.json | Reset report | `sources/00_reset__reset_report.js` |
| 01_mock.json | Mock state and guarded tools | `sources/01_mock__mock_state_and_guarded_tools.js` |
| 02_agent.json | Validate request | `sources/02_agent__validate_request.js` |
| 02_agent.json | Grounded report | `sources/02_agent__grounded_report.js` |
| 03_approval.json | Validate approval | `sources/03_approval__validate_approval.js` |
| 03_approval.json | Validate proposal | `sources/03_approval__validate_proposal.js` |
| 03_approval.json | Check approval lock | `sources/03_approval__check_approval_lock.js` |
| 03_approval.json | Is approval? | `sources/03_approval__is_approval.js` |
| 03_approval.json | Check cooldown | `sources/03_approval__check_cooldown.js` |
| 03_approval.json | Action report | `sources/03_approval__action_report.js` |
