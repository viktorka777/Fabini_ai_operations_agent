# Scénář krátké demonstrace

## Úvod

„Pro case study jsem zvolila n8n. LLM vybírá potřebné nástroje, zatímco workflow kontroluje oprávnění, chyby a limity. Obchodní systémy jsou simulované, ale volání modelu i nástrojů jsou skutečná. Rizikové změny jsou oddělené od diagnostiky.“

Neuvádět, že jde o produkční integraci nebo že API je napojené na skutečná data FABINI.

## Příprava

Finální úpravy v2.2 jsou ověřeny offline. Níže uvedený živý smoke test zopakujte na své instanci; uložené příklady pocházejí z v2.1.

- Zkontrolovat přiřazení credentials a aktivaci workflow.
- Připravit terminál s `demo.py` a nastavenými environment variables.
- Provést `python3 demo.py reset` pomocí interního klíče, bez souběžných běhů.
- Otevřít workflow 02 a záložku executions.
- Klíče a credential obrazovky nesdílet při prezentaci.

## 1. Synchronizační problém a schválená oprava

```bash
python3 demo.py request "Zjisti, proč objednávka 100245 nebyla expedována, a pokud je problém v synchronizaci, navrhni další postup."
```

Ukázat `steps` a `pending_action`: objednávka existuje, platba paid, fulfillment not_received, v logu WMS_TIMEOUT. Agent připravil návrh retry. `actions_performed` je prázdné.

„Návrh ještě není provedení. Teď jako operátor schválím tuto konkrétní akci.“

```bash
python3 demo.py approve "<proposal_id z aktuální odpovědi>"
```

Ukázat `verification.verified`, fulfillment ready_to_ship a shipped=false.

„Systém ověřil přijetí do skladu. Netvrdí, že zásilka už byla odeslána.“

Znovu poslat stejný approve: očekávat blokování, žádný druhý retry.

## 2. Problém není v synchronizaci

```bash
python3 demo.py request "Zjisti, proč objednávka 100246 nebyla expedována."
```

Ukázat pending platbu a bez změny. Ve skutečném uloženém běhu agent použil dva nástroje, ne všech šest. Počet kroků při jiném běhu může být odlišný.

„Agent nemá pevně danou sérii všech kontrol. Když zná důvod, zbytečné nástroje nevolá.“

## 3. Chybový scénář

```bash
python3 demo.py request "Zjisti, proč objednávka 999999 nebyla expedována."
```

Ukázat chybu get_order, failed status a ukončení bez dalších akcí. Klient skončí nenulovým exit code, protože API vrátilo chybový status; to je očekávaný výsledek scénáře, ne pád bez vysvětlení.

Volitelný výpadek WMS:

```bash
python3 demo.py request "Nejprve ověř objednávku 100247. Zjisti proč nebyla expedována, ověř synchronizační logy a při výpadku připrav ke schválení incident pomocí create_ticket."
```

Ukázat HTTP 503 u logů. Agent nesmí domýšlet jejich obsah. Pokud připraví incident, approve skutečně vytvoří mock ticket a ověří jeho ID.

## Závěr

„V prototypu je odděleno rozhodování modelu od kontrolovaného provedení. Pro produkci bych změnila úložiště na transakční DB, přidala identitu a role schvalovatele, HTTPS a monitoring. Redis nyní poskytuje atomické guardy, ale static data nejsou plnohodnotná produkční databáze.“

## Odevzdání

Poslat jeden ZIP: README, čtyři exporty, JS zdroje, klient, testy a skutečné výsledky. Není nutné předávat přístup k osobnímu n8n, síťové adresy, hesla či vlastní OpenRouter klíč. README vysvětluje spuštění na jiné instanci.
