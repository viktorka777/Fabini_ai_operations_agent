# Pokrytí zadání

| Požadavek | Realizace | Důkaz / místo |
|---|---|---|
| Přijmout přirozený požadavek | `request` v POST webhooku, libovolný text v rozsahu prototypu | workflow 02; examples/sync.json |
| Rozhodnout potřebné informace | LLM AI Agent volí relevantní nástroje | odlišné steps v sync a payment scénáři |
| Skutečné tool calling | šest HTTP tools připojených přes `ai_tool` | exports/02_agent.json; skutečné intermediate steps |
| Více navazujících kroků | výsledek nástroje se vrací modelu; následná volba nástroje | sync: order → payment → fulfillment → logs → návrh |
| Vyhodnotit a provést další kroky | LLM interpretuje data, execution větev ověří provedení | approved_sync.json, approved_ticket.json |
| Povolená akce / schválení | čtení automaticky, mutation návrhy pozastaveny do approve | workflow 03, actions_performed v diagnostice prázdné |
| Strukturovaný výsledek | validovaný JSON, skutečné kroky, chyby, odpovídající a dosud neprovedený návrh s platnou expirací | finalize.js; test_regressions.js |
| get_order / get_payment / get_fulfillment / get_sync_logs | mock čtecí nástroje | mock_api.js |
| retry_sync / create_ticket | dvoufázové nástroje: návrh → schválené provedení | mock_api.js + workflow 03 |
| Chyby a neúspěšná volání | HTTP 404/503, vstupní validace, schema errors | error.json, wms_outage.json, invalid_request.json |
| Omezení smyček a opakování | 8 iterací, 10 backend pokusů, timeout, duplicate guard a Redis gate | workflow 02/03, test_mock.js |
| Rizikové operace vyžadují approval | samostatný autentizovaný endpoint; stored proposal, TTL, state version | workflow 03 |
| Historie rozhodnutí a tools | skutečné steps, n8n executions a audit událostí | examples/, mock_api.js, n8n executions #3322–#3349 |
| Funkční implementace | čtyři importovatelné workflow | exports/ |
| Zdroj nebo export | obojí: JSON + JS | exports/, mock_api.js, finalize.js |
| Návod spuštění | credentials, import, endpoints a klient | README.md |
| Architektura a technologie | popis rolí LLM, kontroleru, mock systému, Redis | docs/ARCHITECTURE.md |
| Dva úspěšné a jeden chybový scénář | sync/approved_sync, payment, error | examples/ a docs/TEST_RESULTS.md |

## Záměrný rozsah

Jedna objednávka na běh, testovací obchodní systémy, žádný frontend navíc. RAG, multi-agent topologie ani reálná Shopify/ERP integrace nejsou pro tento use case nutné. Admin reset je pouze pomocný prostředek pro opakovatelné demo.

## Rozsah důkazů

V2.2 má 73/73 offline regresních kontrol, mock testy a 3/3 strukturální Python testy. Offline schvalovací runner čte exporty, ale nespouští n8n, skutečný Redis ani LLM. Ukázky alespoň dvou úspěšných a jednoho chybového scénáře jsou převzaty beze změny z v2.1. Finální úpravy v2.2 byly navíc ověřeny **živě** 15. 10. 2026 na n8n 2.21.7 s reálným Redis a LLM (diagnostika → approve → ověření, 409 při opakovaném schválení, denial, souběžná schválení 200 a 429) – viz `TEST_RESULTS.md` a `LIVE_V22_RESULTS.json`. Živě nebyly simulovány výpadek Redis, vypršení TTL ani síťové chyby.
