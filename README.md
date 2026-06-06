# CalBridge

CalBridge is a lightweight, self-hosted calendar server and web workspace. It provides a beautiful web interface styled like Apple Calendar, alongside a fully compliant CalDAV sync engine that bridges your calendars, remote subscriptions, and external clients (such as Apple Calendar, Thunderbird, and E-ink devices like Onyx Boox Palma 2).

Everything runs cleanly inside **Docker** containers. There is **zero local installation** required on your host system.

---

## Quick Start (Run Locally)

Make sure you have [Docker](https://www.docker.com/) installed and running on your machine.

### 1. Configure Environment
Copy the example environment file:
```bash
cp .env.example .env
```
*(Optional: Open `.env` to change settings like your admin dashboard JWT secret).*

### 2. Start the Application
Run this command in the project root:
```bash
docker compose up -d
```

### 3. Access the Services
*   **Web Client (Calendar UI & Admin Dashboard)**: Open [http://localhost:3000](http://localhost:3000)
*   **CalDAV Sync Engine**: Exposed at [http://localhost:5001/caldav/](http://localhost:5001/caldav/)
*   **Database**: SQLite file stored locally at `./data/chronos.db` for easy backups.

---

## Connecting External Sync Clients

You can sync your calendars with native desktop and mobile calendar apps:

### 1. Apple Calendar (macOS / iOS)
In local development, CalBridge uses a bypass key to let Apple Calendar connect without SSL or complex passwords.

1.  Open **Calendar** -> **Settings** -> **Accounts** -> **+** -> **Other CalDAV Account...**.
2.  Choose Account Type: **Advanced**.
3.  Fill in the details:
    *   **Username**: Your local account username (e.g., `bogdan`)
    *   **Password**: Anything (bypassed in dev mode)
    *   **Server Address**: `127.0.0.1` (or `localhost`)
    *   **Server Path**: `/caldav/users/bogdan` (replace `bogdan` with your username)
    *   **Port**: `5001`
    *   **Use SSL**: Unchecked (Disabled)
4.  Click **Sign In**.

### 2. Thunderbird (Desktop)
1.  Go to the Calendar view in Thunderbird and click **+** (New Calendar).
2.  Select **On the Network**.
3.  Fill in the details:
    *   **Username**: `bogdan`
    *   **Location**: `http://localhost:5001/caldav/users/bogdan` (replace `bogdan` with your username)
4.  Click **Find Calendars** and check the calendars you want to import.
5.  When prompted, enter your account password to authorize the connection.

### 3. Android (DAVx⁵ / E-ink Devices)
1.  Open **DAVx⁵** and add a new account.
2.  Choose **Login with URL and user name**.
3.  Enter the URL `http://<your-lan-ip>:5001/caldav/` along with your credentials.

---

## Production Deployment (Cloudflare Tunnel)

For production, the frontend and backend compile into a single optimized container serving all traffic on port `5000`. This is designed to sit cleanly behind a **Cloudflare Tunnel**:

1.  Set up your Cloudflare Tunnel to point to the backend container:
    *   **Service Type**: `HTTP`
    *   **URL**: `http://localhost:5000` (or the container name `http://backend:5000` if on a docker network)
2.  Map it to your public domain (e.g., `https://calendar.mydomain.com`).
3.  Configure your sync clients to point to your secure HTTPS domain (e.g., Server Address `calendar.mydomain.com`, Port `443`, **Use SSL** checked). Under HTTPS, client passwords are encrypted and securely authenticated against the database.

---

## 🛠 Technology Stack

CalBridge is built using the following core technologies:

*   **Frontend**: React, TypeScript, Vite, Tailwind CSS v4
*   **Backend**: Node.js, Express, TypeScript, custom CalDAV parser
*   **Database**: SQLite managed with Prisma ORM
*   **Containerization**: Docker, Docker Compose

[![React](https://img.shields.io/badge/React-18.3-blue?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.0-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vite.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-v4.0-38B2AC?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Express](https://img.shields.io/badge/Express-4.19-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-5.14-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Docker](https://img.shields.io/badge/Docker-Supported-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
