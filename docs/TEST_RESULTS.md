# Výsledky ověření

## Finální verze v2.2

| Kontrola | Výsledek | Rozsah |
|---|---|---|
| `node test_mock.js` | PASS | Mock nástroje, order scope, návrh bez změny, approval, replay, denial, ticket, chyby a expirace |
| `node test_regressions.js --report docs/REGRESSION_RESULTS.json` | 73/73 PASS | Kód z exportů a schvalovací graf s lokálním mock HTTP a simulovanými Redis čítači |
| `python3 test_workflows.py` | 3/3 PASS | Struktura a credentials reference, šest tool propojení, shoda čtyř hlavních JS modulů s exporty |
| `python3 demo.py --help` | PASS | Dostupnost CLI a jeho příkazů |

Strojový výsledek `REGRESSION_RESULTS.json` obsahuje každý test, režim ověření a SHA-256 kontrolovaných exportů. Regresní sada kontroluje zejména:

- soulad doporučení, skutečného tool callu, proposal ID, akce a objednávky;
- platnou expiraci, `executed: false`, ticket argumenty a povinná pole reportu;
- potvrzenou chybu synchronizace s error kódem v přečtených i aktuálních datech;
- blokování retry po změně logů a před skutečným efektem;
- přesné Redis klíče, číselné typy, chyby a nejednoznačné odpovědi;
- schválené provedení a ověření retry/ticketu, denial, replay, cooldown, expiraci a změnu stavu.

Průchod grafem používá skutečná propojení, IF podmínky a výrazy z `03_approval.json`. Lokální runner nenahrazuje engine n8n: neověřuje autentizaci webhooků, import, síťové chyby, Redis TTL ani chování LLM. Finální podoba v2.2 byla po těchto offline kontrolách **spuštěna i živě** – viz část „Živé ověření v2.2 (15. 10. 2026)“ níže. Pro opakování živé demonstrace slouží `DEMO.md`.

## Živé ověření v2.2 (15. 10. 2026)

Finální podoba v2.2 byla nasazena do čtyř existujících workflow (`00 Admin demo reset`, `01 Mock systems`, `02 Operations agent`,
`03 Approval and execution`) na živém n8n **2.21.7**, execution mode `regular`, s reálným Redis a reálným LLM.
Vyměněn byl vždy jen `jsCode` čtyř dotčených Code nodes; názvy, webhook cesty, connections, credentials ani settings se neměnily.

Po nasazení je shoda **10/10 Code nodes** s `exports/*.json` (byte-exact, 0 rozporů).

| Kontrola | HTTP | Výsledek |
|---|---|---|
| reset vlastních demo dat | 200 | `reset` |
| požadavek bez hlavičky | 403 | `Authorization data is wrong!` |
| prázdný požadavek | 422 | `invalid_request` |
| diagnostika 100245 (reálné LLM, 11,6 s) | 200 | `approval_required`, `root_cause_code=sync_failure`, návrh `VK-3316-retry_sync` |
| approve návrhu | 200 | `completed`, `verification.verified=true`, `action_result.status=synchronized`, `shipped=false` |
| opakované approve téhož návrhu | 409 | `proposal_already_consumed` (state `completed`) |
| diagnostika 100247 → deny | 200 | `denied`, `actions_performed=[]` |
| approve po deny | 409 | `proposal_already_consumed` (state `denied`) |
| dva návrhy na 100248, souběžné approve | 200 a 429 | jeden vykonán a ověřen, druhý zablokován `action_limit_reached` |

Čítače Redis přečtené z živých executions:

| Execution | Čas (UTC) | Node | Odpověď Redis | Rozhodnutí guardu |
|---|---|---|---|---|
| #3322 | 18:14:24 | Claim approval | `{"fabini:vk:claim:VK-3316-retry_sync": 1}` | `lock_ok=true, error=null` |
| #3322 | 18:14:24 | Action cooldown | `{"fabini:vk:cooldown:100245:retry_sync": 1}` | `window_ok=true` |
| #3333 | 18:14:40 | Claim approval | `{"fabini:vk:claim:VK-3327-create_ticket": 1}` | `lock_ok=true` |
| #3348 | 18:15:53 | Action cooldown | `{"fabini:vk:cooldown:100248:create_ticket": 1}` | akce vykonána |
| #3349 | 18:15:53 | Action cooldown | `{"fabini:vk:cooldown:100248:create_ticket": 2}` | **429 `action_limit_reached`** |

Hodnota `2` dokládá, že čítač přežil mezi dvěma běhy a že přísné čtení přesného klíče (kladné safe integer, žádné `error`)
nezpůsobuje falešné `503`. Strojový záznam: `LIVE_V22_RESULTS.json`.

Po testech byl demo stav obnoven (`00 Admin demo reset`, HTTP 200). Výpadek Redis, vypršení TTL a chování při
síťových chybách nebyly na živém systému simulovány – zůstávají pokryté pouze offline sadou.

## Převzaté živé výsledky v2.1

`examples/` je zachováno beze změny z dodaného v2.1. Dokumentace tohoto balíčku uvádí n8n 2.21.7 a model přes OpenRouter. `examples/verification.json` obsahuje 15 úspěšných kontrol z v2.1; živé ověření finálních změn v2.2 je doloženo v části „Živé ověření v2.2 (15. 10. 2026)“ výše a v `LIVE_V22_RESULTS.json`.

| Kontrola | Uložený HTTP výsledek |
|---|---|
| Sync diagnostika a návrh ke schválení | 200 |
| Pending platba bez změny | 200 |
| Neexistující objednávka | 502 |
| Odmítnutí bez autentizace | 403 |
| Prázdný vstup | 422 |
| Nejednoznačné dvě objednávky | 422 |
| Neplatné rozhodnutí | 422 |
| Neexistující návrh | 404 |
| Další návrh před změnou stavu | 200 |
| Schválený retry s ověřením | 200 |
| Opakované schválení | 409 |
| Zastaralý návrh | 409 |
| Výpadek logů WMS a návrh incidentu | 200 |
| Schválený incident a ověření ticketu | 200 |
| Souběžná schválení různých návrhů stejné akce | 200 a 429 |

### Dva úspěšné a jeden chybový scénář

1. `sync.json` a `approved_sync.json`: diagnostika → návrh retry → approve → ověřený fulfillment `ready_to_ship`, `shipped: false`.
2. `payment.json`: úspěšná diagnostika čekající platby bez mutation návrhu; ve vzorovém běhu byly použity dva nástroje.
3. `error.json`: `get_order` vrací 404, agent report končí řízeně `failed` s HTTP 502, bez změny.

`wms_outage.json` a `approved_ticket.json` navíc ukazují HTTP 503 u logů a schválené vytvoření incidentu. `denied_ticket.json` a `deny_replay_blocked.json` jsou starší doplňkové běhy převzaté v balíčku v2.1.

Historická proposal ID jsou spotřebovaná nebo expirovaná. Při vlastním spuštění vytvořte nové návrhy. Počet LLM kroků může být odlišný.

## Historické lokální regrese v2.1

`examples/regression_verification.json` obsahuje původní souhrn 32/32 PASS. Jeho původní textový výstup je v `V2_1_REGRESSION_TEST_OUTPUT.txt`. Aktuální výsledek v2.2 je v `REGRESSION_RESULTS.json`.
