#!/usr/bin/env python
"""
Il deploy della dashboard, in un comando solo.

    npm run deploy             # push, pull sul server, build, verifica
    npm run deploy -- --secco  # non pusha: usa quello che c'e' gia' su GitHub
    npm run deploy -- --forza  # ricostruisce anche se il server e' gia' aggiornato

⚠️ PERCHE' ESISTE. Il deploy era cinque comandi ricopiati a mano da STATO.md ogni
volta, con in mezzo «vai a prendere la password nel sorgente di un altro
progetto». Il 07/09/2026 e' costato mezz'ora e tre tentativi falliti — non per un
guasto, per la lunghezza del rito. Un procedimento che si ricopia a mano prima o
poi si ricopia sbagliato, e qui sbagliarlo vuol dire ricostruire il container di
produzione con il codice di ieri senza accorgersene.

⚠️ LE CREDENZIALI STANNO NEL .env, MAI QUI DENTRO. Il .env e' in .gitignore; le
variabili sono elencate in .env.esempio. Se ne manca una lo script lo dice e si
ferma subito, invece di provarci e fallire dopo trenta secondi con un errore di
rete che non spiega niente.

⚠️ COSA CONTROLLA, CHE UNA PERSONA DI FRETTA SALTA:
  - che il commit arrivato sul server sia LO STESSO che hai in mano. Se il push
    non e' andato, ricostruire vuol dire compilare il codice di ieri e passare
    il pomeriggio a chiedersi perche' la modifica non si vede;
  - che il container arrivi a `healthy`, non a «Up». Un container acceso con
    l'applicazione morta e' esattamente il verde bugiardo che il blackout di
    luglio ha insegnato a non fidarsi;
  - che risponda `/entra` e NON `/aziende`: quella redirige al login, e un
    controllo che passa da un redirect dice «sano» anche quando l'unica cosa
    che funziona e' la porta aperta.
"""

import os
import subprocess
import sys
import time

REPO = os.path.dirname(os.path.abspath(__file__))
CARTELLA_SERVER = "/opt/wesion"
COMPOSE = "docker-compose.dashboard.yml"
CONTAINER = "wesion-dashboard"
PORTA_LOCALE = 3020
ATTESA_HEALTHY = 180


def esci(messaggio, codice=1):
    print("\n[FERMO] " + messaggio, file=sys.stderr)
    sys.exit(codice)


def leggi_env():
    """Il .env, senza portarsi dietro una libreria per fare uno split."""
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


def git(*args):
    fatto = subprocess.run(
        ["git"] + list(args), cwd=REPO, capture_output=True,
        text=True, encoding="utf-8", errors="replace",
    )
    if fatto.returncode != 0:
        esci("git " + " ".join(args) + " e' fallito:\n" + (fatto.stderr or "").strip())
    return (fatto.stdout or "").strip()


def main():
    secco = "--secco" in sys.argv
    forza = "--forza" in sys.argv

    env = leggi_env()
    host = env.get("CONTABO_HOST")
    utente = env.get("CONTABO_USER", "root")
    password = env.get("CONTABO_PASS")
    if not host or not password:
        esci(
            "nel .env servono CONTABO_HOST e CONTABO_PASS (piu' CONTABO_USER se non e' root).\n"
            "        Sono le stesse credenziali del deploy a mano descritto in STATO.md."
        )

    try:
        import paramiko
    except ImportError:
        esci("manca paramiko: `pip install paramiko` e riprova.")

    # ── 1. Il codice qui ─────────────────────────────────────────────────────
    sporco = git("status", "--porcelain")
    if sporco:
        print("[!] Modifiche non committate:\n" + sporco)
        print("    Il deploy manda su GitHub, non il tuo disco: queste NON partono.")
        if input("    Vado avanti lo stesso? [s/N] ").strip().lower() not in ("s", "si"):
            esci("annullato da te.", 0)

    locale = git("rev-parse", "--short", "HEAD")
    ramo = git("rev-parse", "--abbrev-ref", "HEAD")
    print("[git] ramo " + ramo + ", commit locale " + locale)

    if not secco:
        # ⚠️ `HEAD:main` e non `main`: se il ramo locale si chiamasse `master`
        # (capita, vedi lo storico) un push semplice creerebbe su GitHub un
        # branch che il server non legge mai, e il deploy sembrerebbe riuscito.
        print("[git] push " + ramo + " -> origin/main")
        git("push", "origin", "HEAD:main")

    # ── 2. Il server ─────────────────────────────────────────────────────────
    print("[ssh] " + utente + "@" + host)
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(host, port=int(env.get("CONTABO_PORT", 22)), username=utente,
                    password=password, timeout=30)
    except Exception as errore:
        esci("non riesco a collegarmi: " + str(errore))

    def sul_server(comando, timeout=900, mostra=True):
        _, out, _ = ssh.exec_command(comando, timeout=timeout, get_pty=True)
        testo = ""
        for riga in iter(out.readline, ""):
            testo += riga
            if mostra:
                sys.stdout.write("      " + riga)
                sys.stdout.flush()
        return out.channel.recv_exit_status(), testo

    _, prima = sul_server("cd " + CARTELLA_SERVER + " && git rev-parse --short HEAD", mostra=False)
    prima = prima.strip()
    print("[srv] il server sta a " + prima)

    print("[srv] git pull")
    stato, _ = sul_server("cd " + CARTELLA_SERVER + " && git pull --ff-only")
    if stato != 0:
        esci("il git pull sul server e' fallito. Di solito e' una modifica fatta a mano\n"
             "        sul server che blocca il fast-forward: guarda l'output qui sopra.")

    _, dopo = sul_server("cd " + CARTELLA_SERVER + " && git rev-parse --short HEAD", mostra=False)
    dopo = dopo.strip()

    # ⚠️ IL CONTROLLO CHE VALE PIU' DI TUTTI GLI ALTRI.
    if dopo != locale and not secco:
        esci("il server sta a " + dopo + ", il tuo commit e' " + locale + ".\n"
             "        Non ricostruisco: sarebbe un build del codice sbagliato.")

    if dopo == prima and not forza:
        print("[ok ] il server era gia' a " + dopo + ": niente da ricostruire.")
        print("      (--forza per ricostruire lo stesso, es. dopo aver cambiato il .env del server)")
        ssh.close()
        return

    # ── 3. Build e riavvio, SOLO la dashboard ────────────────────────────────
    print("[srv] build e riavvio (" + prima + " -> " + dopo + ") — un paio di minuti")
    inizio = time.time()
    stato, _ = sul_server("cd " + CARTELLA_SERVER + " && docker compose -f " + COMPOSE + " up -d --build")
    if stato != 0:
        esci("il build e' fallito. Il container VECCHIO sta ancora girando:\n"
             "        il sito e' su, con il codice di prima. Non hai rotto niente.")
    print("[srv] build finito in " + str(int(time.time() - inizio)) + "s")

    # ── 4. Sano davvero, non solo acceso ─────────────────────────────────────
    print("[srv] aspetto che diventi healthy", end="", flush=True)
    scadenza = time.time() + ATTESA_HEALTHY
    salute = ""
    while time.time() < scadenza:
        _, salute = sul_server(
            'docker ps --filter name=' + CONTAINER + ' --format "{{.Status}}"', mostra=False)
        salute = salute.strip()
        if "(healthy)" in salute or "(unhealthy)" in salute:
            break
        print(".", end="", flush=True)
        time.sleep(5)
    print()

    if "(healthy)" not in salute:
        _, log = sul_server("docker logs --tail 30 " + CONTAINER + " 2>&1", mostra=False)
        print(log)
        esci("il container dice «" + salute + "» invece di healthy.\n"
             "        Se risponde 200 ma resta unhealthy, guarda ENV HOSTNAME=0.0.0.0 nel\n"
             "        Dockerfile prima di cercare altrove (STATO.md).")

    _, risposta = sul_server(
        "wget -qO- -S http://127.0.0.1:" + str(PORTA_LOCALE) + "/entra 2>&1 | head -1", mostra=False)
    if "200" not in risposta:
        esci("il container e' healthy ma /entra risponde: " + risposta.strip())

    ssh.close()
    print("\n[FATTO] " + prima + " -> " + dopo + " · " + CONTAINER + " healthy · /entra 200")
    print("        Ricarica la dashboard: il browser tiene in cache le pagine vecchie.")


if __name__ == "__main__":
    main()
