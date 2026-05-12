# Lab Management System — get it running (step by step)

This guide is for anyone who needs to run the app on their computer, even if you are not a developer. Follow the steps **in order**. If a step fails, stop and fix that step before continuing.

---

## What you need installed first

Install these on your PC (Windows or Mac). Use the official websites if you are unsure.

1. **Node.js** (version 20 or 22 — the “LTS” download is fine)  
   - Website: [https://nodejs.org](https://nodejs.org)  
   - After installing, **close and reopen** your terminal (Command Prompt, PowerShell, or Terminal).

2. **pnpm** (a package manager — installs after Node.js)  
   - Open a terminal and run **exactly** this, then press Enter:
   ```bash
   npm install -g pnpm
   ```

3. **MySQL** — pick **one** way:

   - **Recommended: Docker** (easiest — no MySQL installer, no Windows services to manage).  
     Install **[Docker Desktop](https://www.docker.com/products/docker-desktop/)**, start it, and leave it running (whale icon in the taskbar). Then follow **“Start MySQL with Docker”** below.

   - **Alternative:** Install MySQL on the PC ([MySQL Community Server](https://dev.mysql.com/downloads/mysql/), or **XAMPP** / **WAMP**). Create a database named `lab_management` and remember the user/password you use in **Step 1**.

---

## Where to run commands (very important)

All commands below must be run from **this folder**:

- The folder is named **`lab-management-system`**
- It **must** contain a file named **`package.json`** (if you do not see `package.json`, you are in the wrong folder)

**Full path example (your PC will differ):**

```text
C:\Users\YourName\...\lab_management_system\lab-management-system
```

**How to open a terminal in that folder on Windows:**

1. Open File Explorer and go into the `lab-management-system` folder until you see `package.json`.
2. Click the address bar, type `cmd`, press Enter — a black window opens **already in that folder**.  
   - Or: Shift + right‑click empty space → “Open in Terminal” / “Open PowerShell window here”.

**Check you are in the right place** — run:

```bash
dir package.json
```

(on Mac/Linux use `ls package.json` instead of `dir`)

If it says the file was not found, you are in the wrong folder. Use `cd` to move into `lab-management-system` first.

---

## Start MySQL with Docker (recommended)

Do this **before** Step 1 if you chose Docker for MySQL.

1. Install and open **Docker Desktop**. Wait until it says it is running.
2. Open a terminal **in the `lab-management-system` folder** (the one with `package.json` and `docker-compose.yml`).
3. Run:

```bash
docker compose up -d
```

4. Wait about **15–30 seconds** the first time (Docker downloads MySQL once).

**Check that it is running:**

```bash
docker ps
```

You should see a container named `lab-management-mysql`.

**Default login (matches `docker-compose.yml` in this folder):**

| Setting | Value |
|--------|--------|
| Host | `localhost` |
| Port | `3306` |
| User | `root` |
| Password | `labroot123` |
| Database | `lab_management` (created automatically) |

**Stop MySQL later (optional):**

```bash
docker compose down
```

**Start it again after a reboot:**

```bash
docker compose up -d
```

**If port 3306 is already used** (another MySQL on your PC): edit `docker-compose.yml`, change the ports line to `"3307:3306"`, then use `localhost:3307` in `DATABASE_URL` in Step 1.

---

## Step 1 — Tell the app how to connect to MySQL

1. Inside **`lab-management-system`**, find or create a file named **`.env`** (same folder as `package.json`).
2. Open `.env` in Notepad or any text editor.

**If you use Docker MySQL** (password `labroot123` from above), use:

```env
DATABASE_URL=mysql://root:labroot123@localhost:3306/lab_management
JWT_SECRET=change-this-to-a-long-random-sentence-at-least-32-characters
VITE_APP_ID=lab-management-local
```

**If you installed MySQL yourself**, use your own user, password, and database name:

```env
DATABASE_URL=mysql://root:YOUR_PASSWORD@localhost:3306/lab_management
JWT_SECRET=change-this-to-a-long-random-sentence-at-least-32-characters
VITE_APP_ID=lab-management-local
```

**Rules:**

- Replace `YOUR_PASSWORD` (non-Docker path) with your real MySQL password.  
- Replace `lab_management` only if your database has another name.  
- Replace `root` only if you use another MySQL username.  
- If your password has special characters like `@` or `#`, ask someone technical to help you put the password in the URL correctly, or use a simpler password.  
- `JWT_SECRET` can be any long random text; do not share it publicly.

Save the file.

---

## Step 2 — Install project dependencies

**Folder:** `lab-management-system` (where `package.json` is)

Run:

```bash
pnpm install
```

Wait until it finishes without errors.

---

## Step 3 — Create the tables in the database

**Folder:** still `lab-management-system`

Run:

```bash
pnpm run db:migrate
```

This creates all tables. It needs a correct `DATABASE_URL` in `.env`.

---

## Step 4 — (Recommended) Load test types and prices

Still in the same folder:

```bash
pnpm run db:seed:test-types
```

This fills the list of tests and prices used on the Reception screen.

---

## Step 5 — (Optional) Load contracts / sectors sample data

Only if you have the SQL file and want catalog data:

```bash
pnpm run db:import:contracts-sql
```

(This uses `server\data\contracts_catalog.sql` if present.)

---

## Step 6 — Run the app (development — easiest for daily use)

**Folder:** `lab-management-system`

```bash
pnpm run dev
```

When it starts, the terminal will show an address such as:

```text
http://localhost:3000/
```

(or another port if 3000 is busy). Open that address in **Chrome**, **Edge**, or **Firefox**.

To stop the app, go to the terminal window and press **Ctrl + C**.

---

## Run the app in “production” mode (after you change code)

Use this when you want a build like a real server (slower to start, but closer to deployment).

**Folder:** `lab-management-system`

```bash
pnpm run build
pnpm start
```

Then open the URL shown in the terminal (usually `http://localhost:3000/`).

---

## Quick copy-paste checklist (fresh setup)

**If you use Docker for MySQL**, run from **`lab-management-system`**:

```bash
docker compose up -d
```

Wait until MySQL is up, then create `.env` (Step 1). Then:

```bash
pnpm install
pnpm run db:migrate
pnpm run db:seed:test-types
pnpm run dev
```

**If MySQL is not Docker**, skip `docker compose` and use your own `DATABASE_URL` in `.env`, then run the same `pnpm` lines.

---

## If something goes wrong

| Problem | What to try |
|--------|-------------|
| `pnpm` is not recognized | Install Node.js, then run `npm install -g pnpm` again. Close and reopen the terminal. |
| `docker` is not recognized | Install Docker Desktop and start it. On Windows, you may need to restart the PC after install. |
| Database connection error | **Docker:** run `docker ps` — is `lab-management-mysql` running? Run `docker compose up -d` from `lab-management-system`. **Not Docker:** check MySQL service is started and `DATABASE_URL` matches user/password/database. |
| Port 3306 already in use | Another MySQL is using the port — stop it, or change `docker-compose.yml` to map `3307:3306` and put `localhost:3307` in `DATABASE_URL`. |
| Port 3000 already in use (app) | Close other programs using port 3000, or set `PORT=3001` in `.env` and restart. |
| Blank page | Look at the terminal for red error text; confirm you used `pnpm run dev` from the folder that contains `package.json`. |

---

## More technical details

For servers, reverse proxies, full database backups, and advanced options, see **`DEPLOYMENT.md`** in this same folder.
# Rebuild Tue, May 12, 2026  9:28:47 AM
