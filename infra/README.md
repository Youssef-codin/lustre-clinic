# Clinic server setup

Everything done to a clinic machine beyond the Debian installer lives here, so a
second clinic is a new inventory entry and one command, not a rebuild from
memory.

## Before the playbook

Done by hand, once per machine:

1. Debian 13 netinstall: no desktop, SSH server and standard utilities only.
2. Install Tailscale and log in to the **clinic's** tailnet (not the operator's).
3. In that tailnet's admin console: disable key expiry for the machine, and
   share it to the operator's personal tailnet.
4. From the operator's machine, `ssh-copy-id` a key and confirm a key login
   works over the Tailscale IP.

## Running it

Needs `ansible-core` 2.15+ on the operator's machine. No collections.

```sh
cd infra/ansible
ansible-playbook site.yml -K --tags tailscale,base,power     # safe, no lockout risk
ansible-playbook site.yml -K --tags ssh                      # passwords off
ansible-playbook site.yml -K --tags firewall                 # LAN locked down
ansible-playbook site.yml -K --tags docker
```

`-K` asks for the sudo password. The first run is split so each risky step can
be checked before the next; after that, `ansible-playbook site.yml -K` runs it
all and changes nothing on a machine that is already set up.

The SSH and firewall steps end by opening a fresh connection. If either fails,
the session that ran the play has already been closed; get back in over the LAN
(`ssh` to the LAN IP from `lan_cidr`) or at the keyboard.

## Deploying the app

Two stacks run on each clinic machine from the same `compose.yaml`, each in its
own directory with its own database, network and passwords:

| Stack | Directory | API | Database | GlitchTip | Migrations |
|---|---|---|---|---|---|
| prod | `/opt/lustre-prod` | `:3000` | `production`, `127.0.0.1:5432` | `:8000` | a deploy step, as `lustre_owner` |
| dev | `/opt/lustre-dev` | `:3001` | `development`, `127.0.0.1:5433` | none | on boot |

Both listen on the Tailscale address only. Build the binary, then run the `app`
tag. The Discord webhook and heartbeat URLs come from the environment so they are
never written into the repo; `read -rs` keeps them out of shell history.

```sh
bun run build:server
read -rs LUSTRE_DISCORD_WEBHOOK_URL && export LUSTRE_DISCORD_WEBHOOK_URL
read -rs LUSTRE_HEARTBEAT_URL && export LUSTRE_HEARTBEAT_URL
cd infra/ansible && ansible-playbook site.yml -K --tags app
```

Each stack's `.env` is generated on the server the first time and never
rewritten: its passwords are the ones the database volume was created with.
Leaving a URL variable unset on a later run keeps the value already there.

Operating a stack from its directory (`COMPOSE_PROJECT_NAME` in `.env` keeps
`docker compose` on the right one):

```sh
cd /opt/lustre-prod
docker compose ps
docker compose logs -f server
docker compose run --rm server backup
```

`lustre seed` refuses the production database, whatever its connection string.

## Google Drive backups

The production stack can push each verified, encrypted dump into a folder in
the doctor's own Google Drive. Authorization is an operator-only setup step;
there is deliberately no app Settings screen.

1. Enable the Google Drive API in a Google Cloud project. Configure the consent
   audience (External for personal Gmail, or Internal for an organization-owned
   Workspace project), add only `drive.file`, and create a Desktop OAuth client.
2. On the operator machine, from the repository, run:

   ```sh
   read -r BACKUP_DRIVE_OAUTH_CLIENT_ID && export BACKUP_DRIVE_OAUTH_CLIENT_ID
   read -rs BACKUP_DRIVE_OAUTH_CLIENT_SECRET && export BACKUP_DRIVE_OAUTH_CLIENT_SECRET
   bun drive:authorize
   ```

   The loopback callback listens only on `127.0.0.1`, verifies OAuth state, and
   uses PKCE. Sign in as the doctor. The command creates **Lustre Clinic
   Backups** itself so `drive.file` is sufficient.
3. Securely copy the four printed values into the production stack. For an
   Ansible deploy, export them before running the `app` tag; the generated
   `/opt/lustre-prod/.env` is mode `0600`, and later deploys preserve values
   already there. Unset the variables and clear the terminal afterwards.
4. Restart the server and run `docker compose run --rm server backup`. Confirm
   an encrypted `.dump.enc` file exists in the folder.

Never put these values in inventory, shell history, or the repository. The
server persists the refresh token, not access tokens. A revoked or expired grant
alerts Discord as `backup.drive_reauthorization_required`; repeat the flow and
replace the refresh token. Supply the existing `BACKUP_DRIVE_FOLDER_ID` to the
flow so reauthorization keeps the same folder. External apps left in Google's
Testing state receive seven-day grants, so a personal-account deployment must
use In production. `drive.file` is non-sensitive; a one-clinic personal-use app
can be unverified, while a Workspace administrator may use an Internal app or
trust the client according to organization policy.

The legacy service-account variables are preserved only for Workspace shared
drives or domain-wide delegation. They cannot write into personal My Drive and
are ignored when a complete OAuth configuration is present.

## Releases

The phones get new code two ways (SPEC §15), both from the clinic server over
Tailscale, with nothing hosted anywhere else:

- **A JavaScript update (OTA)** covers any change that is only JavaScript. A
  release build asks the server on every launch, downloads in the background,
  and runs the update on the next cold start. It never reloads mid-screen and
  never waits on the network at launch, so a power cut starts the app on the
  last bundle it had.
- **A new APK** is needed for anything native: a new native dependency, an
  `app.json` change, a config plugin change. Settings shows a banner when the
  server has a higher build than the phone; tapping it downloads the APK in the
  browser and Android's installer takes over.

Both are numbered and staged into `dist/releases` on the operator's machine and copied to
`/opt/lustre-<stack>/releases` by the `releases` tag, which the `app` tag also
runs. The server reads them on each request; nothing restarts.

### Versions

Every release is `MAJOR.MINOR.PATCH`, and the release scripts pick the number;
nothing is bumped by hand.

| Part | Means | Set by |
|---|---|---|
| MINOR | a new APK; PATCH goes back to 0 | `bun release:apk` |
| PATCH | an OTA update on that APK: 1.4.1, 1.4.2, … | `bun release:update` |
| MAJOR | a change the server and the app must ship together | `bun release:apk --major` |

The next number is one above the higher of the `vX.Y.Z` git tags and what is
already staged in `dist/releases`, so a lost tag or a wiped staging directory
cannot make a number repeat (`packages/app/scripts/releaseVersion.ts`). An
update is numbered on the staged APK with its runtime version, and is refused
when there is none, because no phone would take it.

Both scripts refuse uncommitted changes and tag the commit they built from.
They create the tag locally; push it yourself with the command they print.

Settings → App shows the release the phone runs (the update's number, `1.4.2`)
with the APK under it (`1.4.0 · build …`). GlitchTip files crashes under the same
number, `lustre@1.4.2`.

The runtime version is a fingerprint of native code only.
`packages/app/fingerprint.config.js` keeps the version number out of it, or
every release would get a runtime of its own and no update would reach a phone.

### Release signing

Two keys, both on the operator's machine only, never in the repo and never on
the clinic server:

| What | File | Gradle property |
|---|---|---|
| APK keystore (PKCS12, alias `lustre-clinic`) | `~/.local/share/lustre/signing/lustre-clinic-release.jks` | `LUSTRE_RELEASE_STORE_FILE`, `LUSTRE_RELEASE_KEY_ALIAS`, `LUSTRE_RELEASE_STORE_PASSWORD`, `LUSTRE_RELEASE_KEY_PASSWORD` |
| OTA update signing key (RSA) | `~/.local/share/lustre/signing/updates/private-key.pem` | `LUSTRE_UPDATES_PRIVATE_KEY` |

The paths and passwords live in `~/.gradle/gradle.properties` (or the same names
in the environment). The keystore's SHA-256 certificate fingerprint is
`A1:FE:DF:AA:3E:BC:51:7C:82:9C:68:0A:41:41:96:69:07:9B:F6:D5:B6:A3:40:33:4E:FC:8D:FE:57:24:5E:CC`.
The update key's public certificate is committed at
`packages/app/certs/certificate.pem`.

**Back up both files and the passwords**: a password manager, plus one off-site
copy. Losing the keystore means every phone has to uninstall before it can take
another APK, and an uninstall wipes the saved server address, the role and the
cached schedule. Losing the update key means no more OTA updates until a new
APK carrying a new certificate is installed on every phone.

On another build machine, copy both files and add the properties, with absolute
paths:

```properties
LUSTRE_RELEASE_STORE_FILE=/home/<you>/.local/share/lustre/signing/lustre-clinic-release.jks
LUSTRE_RELEASE_KEY_ALIAS=lustre-clinic
LUSTRE_RELEASE_STORE_PASSWORD=<from the password manager>
LUSTRE_RELEASE_KEY_PASSWORD=<same as the store password>
LUSTRE_UPDATES_PRIVATE_KEY=/home/<you>/.local/share/lustre/signing/updates/private-key.pem
```

A release build without them fails and names what is missing. It never falls
back to the debug key. Debug builds do not need them.

### Shipping a new APK

```sh
LUSTRE_UPDATES_URL=http://<clinic MagicDNS name>:3000 bun release:apk
git push origin v<the version it printed>
cd infra/ansible && ansible-playbook site.yml -K --tags releases
```

`LUSTRE_UPDATES_URL` is the prod stack's address, the one `health.check`
reports. It is baked into the APK as the place to ask for OTA updates, so use
the same value every time. The build is arm64 only; `LUSTRE_APK_ABIS=arm64-v8a,x86_64`
adds the emulator's ABI. Every release build gets a higher `versionCode` (tens
of seconds since 2026-01-01 UTC, see `plugins/withReleaseVersionCode.js`), and
`release:apk` refuses to stage a build that is not higher than the one already
staged, or one signed with any certificate but the release keystore's.

Check the server has it: `curl http://<clinic>:3000/trpc/release.latestApk`.

**Once per phone, at handover**: allow the browser to install apps (Android
Settings → Apps → Chrome → Install unknown apps). The first install is over the
cable with `adb install`; after that, Settings → Download, then Install. The
role and saved address survive because the APK is signed with the same key.

### Publishing a JavaScript update

```sh
LUSTRE_UPDATES_URL=http://<clinic MagicDNS name>:3000 bun release:update
git push origin v<the version it printed>
cd infra/ansible && ansible-playbook site.yml -K --tags releases
```

Publish with the same `LUSTRE_UPDATES_URL` the APK was built with. An update is
only offered to APKs with the same runtime version, a fingerprint of everything
native. The script refuses when the staged APK's runtime differs: something
native changed, and it needs `release:apk` instead.

Phones pick it up on launch and run it on the next cold start: swipe the app
away and open it twice. Settings → App → Version shows the new number, and
Update shows the update's short id.

- **An update that crashes before its first screen draws** rolls itself back:
  expo-updates marks it failed and relaunches on the previous bundle. That
  relaunch can come up blank; closing and reopening the app clears it. A crash
  after the first screen has drawn, such as one behind a button, is not caught
  and does not roll back: fix forward by publishing a corrected update.
- **An update with a bug that does not crash**: check out the last good
  release's tag (`git checkout v1.4.1`) and run `release:update` again. It is
  published as the next number, `1.4.3`, and becomes the latest.
- **Which update a crash came from**: GlitchTip's release is the number the
  phone ran, `lustre@1.4.2`. Every report also carries an `update` tag (the id,
  or `embedded` for the APK's own bundle) and a `runtime` tag.
- Dev builds load Metro and demo builds have updates switched off, so neither
  ever takes a production update.

The manifest is signed on this machine when it is published; the server only
serves the signed bytes. To see what a phone would get:

```sh
curl -i http://<clinic>:3000/updates/manifest \
  -H 'expo-protocol-version: 1' -H 'expo-platform: android' \
  -H 'expo-channel-name: production' -H 'expo-runtime-version: <runtime>'
```

A `204` means nothing is published for that runtime.

## Optional backup copies on the operator's machine

In addition to Google Drive, the operator machine can pull another encrypted
copy over Tailscale. The server still restore-verifies and prunes its own dumps
(SPEC §16).

```sh
sudo pacman -S age
infra/operator/install.sh smilemakers
```

`install.sh` asks for the backup public key, or creates a new key and prints the
private half once. That goes in a password manager and on paper; this machine
keeps only the public half, which can encrypt but not decrypt.

It then enables `lustre-backup-pull@<clinic>.timer`, which runs hourly (and at
login if a run was missed): copies new dumps, encrypting each as it arrives and
checking it against the server's checksum, keeps 14 daily and 12 monthly, and
alerts Discord if nothing newer than 72 hours has arrived. Logs:
`journalctl --user -u 'lustre-*'`.

No restore check runs here: the server restores every dump before it can be
pulled. To restore from a copy here:

```sh
age -d -i key.txt lustre-<stamp>.dump.age > lustre.dump
```

## Adding a clinic

Add a host under `clinics` in `ansible/inventory.yml` with its Tailscale IP and
the clinic's LAN range, then run the playbook with `--limit <host>`.

## What it sets up

| Tag | Result |
|---|---|
| `tailscale` | Asserts the node is logged in, prints tailnet, IPs, MagicDNS name and key expiry. Turns off Tailscale DNS so it stops fighting dhcpcd, and Tailscale SSH so tailnet logins go through sshd's key-only rules instead of bypassing them. |
| `base` | Timezone, unattended security upgrades, never suspends (lid shut, sleep targets masked), boots to text mode. |
| `power` | Survives power cuts unattended: boot-time fsck repairs without asking, upower starts on text-mode boots and powers the machine off cleanly at 35% on a long cut (the first laptop's worn battery reads 35% and then 3% a minute later), and Tailscale and SSH start on boot. `lustre-power-alert` tells Discord when mains is lost, when the battery reaches 40%, and when mains or the machine comes back; alerts wait on disk while the network is down with the power, and it uses the prod stack's webhook (`journalctl -u lustre-power-alert`). |
| `network` | Wired ports follow the cable (systemd-networkd, preferred over Wi-Fi, no boot wait without one); Wi-Fi stays as the fallback. The host uses fixed DNS servers instead of whatever DHCP last wrote. |
| `ssh` | Key-only, no root, only the admin user. |
| `firewall` | nftables, own table only. Inbound: everything over `tailscale0`, SSH from the LAN, Tailscale's direct-connection port. Nothing else. The allow-list is enforced in prerouting as well as input, because Docker's published ports bypass input: a container published on `0.0.0.0` or the LAN IP is still unreachable from the LAN. |
| `docker` | Docker CE and the compose plugin from Docker's apt repo, log rotation, admin user in the `docker` group, and no port-bind race with Tailscale at boot. |
