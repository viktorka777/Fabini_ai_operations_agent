# Změny

## Živé ověření v2.2 (15. 10. 2026)

Finální v2.2 byla nasazena na živý n8n 2.21.7 (execution mode `regular`) s reálným Redis a LLM a prošla end-to-end kontrolami:
diagnostika → approve → ověření, blokace opakovaného schválení (409), denial, approve po deny (409) a souběžná schválení dvou
návrhů stejné akce (200 a 429 podle čítače Redis). Shoda kódu po nasazení: 10/10 Code nodes s `exports/*.json`.
Záznam: `docs/TEST_RESULTS.md` a `docs/LIVE_V22_RESULTS.json`.

## v2.2 final

Základem je dodaný balíček v2.1. Zachovává se jeho ověřování posledních přečtených i aktuálních sync logů, včetně povinného error kódu. Názvy workflow, webhooky, nástroje, credentials reference a jejich propojení se nemění.

### Validace veřejného reportu

- Pending návrh musí pocházet ze skutečné odpovědi odpovídajícího mutation toolu.
- Vyžaduje se `executed: false`, proposal ID odpovídající běhu/akci, správné order ID a číselné `expires_at` v budoucnosti.
- Ticket musí obsahovat neprázdný popis do 2000 znaků.
- LLM musí vrátit JSON objekt s neprázdnými povinnými poli. Doporučení a uložený návrh se musí shodovat; více návrhů v jednom reportu se odmítá.
- Neplatný report vrací `failed` a nezveřejňuje `pending_action`, `approval_endpoint` ani `approval_example`.

### Guardy a regresní testy

Redis guardy vyžadují objekt s jediným přesným klíčem a kladným safe integer číslem. Chyby, nejednoznačný tvar a typové převody nejsou přijetím zámku.

Jedna regresní sada obsahuje 73 kontrol a čte přímo finální JSON exporty. Zahrnuje také průchod schvalovacím grafem: approve, deny, replay, cooldown, expiraci, změněnou verzi objednávky, změnu logů a výpadky Redis. HTTP mock a Redis čítače běží v testu lokálně; síť, TTL a skutečnou souběžnost tento test nesimuluje.

Přibyl `scripts/package.py`, aktualizovaný README a strojový výsledek `docs/REGRESSION_RESULTS.json` s hashi exportů. Zdrojové soubory a jejich vložené kopie jsou synchronizované.

### Důkazy a rozsah ověření

V2.2 prošla 73/73 offline regresními kontrolami, mock testy a 3/3 Python testy. Po těchto finálních změnách byla v2.2 navíc nasazena a ověřena na živém n8n 2.21.7 s reálným Redis a LLM – viz „Živé ověření v2.2 (15. 10. 2026)“ výše.

Všechny soubory `examples/` jsou převzaty beze změny z v2.1. Jejich 15bodová živá sada, starší denial příklady a 32bodový regresní souhrn dokládají předchozí verzi. Původní textový výstup regresí je zachován jako `docs/V2_1_REGRESSION_TEST_OUTPUT.txt`.

## v2.1

Doplněna obousměrná vazba doporučení a pending návrhu: `retry_sync` a `create_ticket` nemohou být doporučeny bez konkrétního uloženého návrhu. Balíček obsahoval 32/32 regresních kontrol a aktualizované příklady deklarovaných živých běhů.

## v2

Zavedena vazba reportu na skutečný nástroj, order scope a proposal ID. Backend ukládá diagnostické odpovědi a před návrhem retry kontroluje jejich obsah i aktuální sync stav. Redis guardy čtou přesný klíč, odmítají pole `error` a vyžadují kladné safe integer číslo.
