#!/usr/bin/env python
"""
I log del server, senza il rito dell'SSH a mano.

    npm run log                 # le ultime 200 righe della dashboard
    npm run log -- 500          # quante righe vuoi
    npm run log -- --cerca 429  # solo le righe che contengono 429
    npm run log -- --router     # il router su Oracle non passa di qui: vedi sotto

⚠️ PERCHE' ESISTE (16/09/2026). «Non è andata, e non si sa perché»: un errore in
dashboard che non dice niente, e l'unico modo di sapere cos'era davvero erano
cinque comandi SSH ricopiati a mano — cioè, in pratica, tirare a indovinare. È
la stessa ragione di `deploy.py`: un procedimento che si ricopia si ricopia
sbagliato, e qui sbagliarlo vuol dire cercare per mezz'ora un guasto nel posto
sbagliato.

Le credenziali stanno nel `.env` (`CONTABO_HOST`, `CONTABO_USER`,
`CONTABO_PASS`), che è in `.gitignore`. Qui dentro non ce ne sono e non ce ne
devono finire.

⚠️ QUESTO LEGGE SOLO LA DASHBOARD. Il router WhatsApp sta su Oracle, è un'altra
macchina e un altro compose: i suoi log non passano da qui.
"""

import os
import sys

# La console di Windows è cp1252 e i log hanno di tutto dentro: se un carattere
# non si sa disegnare si sostituisce, non si esce. (Stessa toppa di deploy.py,
# dove un ▲ di Docker ha ammazzato un deploy a metà build.)
for _flusso in (sys.stdout, sys.stderr):
    try:
        _flusso.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

REPO = os.path.dirname(os.path.abspath(__file__))
CARTELLA_SERVER = "/opt/wesion"
CONTAINER = "wesion-dashboard"


def esci(messaggio, codice=1):
    print("\n[FERMO] " + messaggio, file=sys.stderr)
    sys.exit(codice)


def leggi_env():
    percorso = os.path.join(REPO, ".env")
    if not os.path.exists(percorso):
        esci("manca il file .env: le credenziali del server stanno li'. Vedi .env.esempio.")
    valori = {}
    with open(percorso, encoding="utf-8", errors="replace") as f:
        for riga in f:
            riga = riga.strip()
            if not riga or riga.startswith("#") or "=" not in riga:
                continue
            chiave, valore = riga.split("=", 1)
            valori[chiave.strip()] = valore.strip().strip('"').strip("'")
    return valori


def main():
    argomenti = sys.argv[1:]
    righe = "200"
    cerca = None
    for i, a in enumerate(argomenti):
        if a == "--cerca" and i + 1 < len(argomenti):
            cerca = argomenti[i + 1]
        elif a.isdigit():
            righe = a

    env = leggi_env()
    host = env.get("CONTABO_HOST")
    utente = env.get("CONTABO_USER", "root")
    password = env.get("CONTABO_PASS")
    if not host or not password:
        esci("nel .env servono CONTABO_HOST e CONTABO_PASS (piu' CONTABO_USER se non e' root).")

    try:
        import paramiko
    except ImportError:
        esci("manca paramiko: `pip install paramiko` e riprova.")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(host, port=int(env.get("CONTABO_PORT", 22)), username=utente,
                    password=password, timeout=30)
    except Exception as errore:
        esci("non riesco a collegarmi: " + str(errore))

    # `grep -a`: i log dei container hanno byte che grep prenderebbe per binari,
    # e allora smette di stampare dicendo "Binary file matches" — cioe' niente.
    comando = "cd " + CARTELLA_SERVER + " && docker logs --tail " + righe + " " + CONTAINER + " 2>&1"
    if cerca:
        comando += " | grep -a -i -- " + "'" + cerca.replace("'", "") + "'"

    _, out, _ = ssh.exec_command(comando, timeout=120, get_pty=True)
    for riga in iter(out.readline, ""):
        sys.stdout.write(riga)
        sys.stdout.flush()
    stato = out.channel.recv_exit_status()
    ssh.close()

    # grep senza risultati esce 1: non e' un guasto, e' "non c'e' niente".
    if stato != 0 and cerca:
        print("\n[ok ] nessuna riga con «" + cerca + "» nelle ultime " + righe + ".")


if __name__ == "__main__":
    main()
