# Product Requirements Document (PRD)
## Project CalBridge: Lightweight Self-Hosted CalDAV Server & Web Client
### 1. Executive Summary & Goals
CalBridge is a self-hosted, single-container solution designed to act as both a CalDAV server and a modern web calendar client. It fills the gap between overly complex enterprise suites (Nextcloud) and bare-bones, backend-only servers (Baïkal, Radicale).
Core Objectives:
Privacy-First: Total isolation from third-party ecosystems (Apple/Google).
Lightweight Footprint: Single Docker container running an embedded SQLite database.
Modern UX: A polished, React-based web interface for managing users, administrative configurations, and interacting with calendars.
Seamless Integration: Fully compliant CalDAV server for syncing with E-ink devices (like the Boox Palma 2) and third-party calendar clients.
### 2. Architecture & Tech Stack (High-Level)
To ensure ease of deployment and a highly responsive, modern interface, the application will use a decoupled architecture wrapped in a single container:
Frontend: React (Vite), Tailwind CSS, and a premium calendar UI library (such as @fullcalendar/react or @shadcn/ui calendar primitives).
Backend: Go or Node.js/TypeScript (Fastify/Express). Go is highly recommended here for its minimal memory footprint and fast binary execution within Docker.
CalDAV Engine: A built-in, compliant CalDAV server layer handling standard discovery endpoints (/.well-known/caldav).
Database: SQLite (managed via an ORM like Prisma or Ent for easy schema migrations).
Deployment: Docker (Multi-arch amd64/arm64) with environment variables tailored for reverse proxies and Cloudflare Tunnels (tunnel-auth headers support).
### 3. Functional Requirements
#### 3.1. User Management & Authentication (Admin Dashboard)
First-Run Setup: If no database exists, the web interface prompts the user to create a global Admin account.
Admin Panel:
Create, update, and delete users.
Set storage/calendar limits per user (optional, but good for guardrails).
Reset user passwords.
User Authentication: Secure JWT-based session management for the React web interface.
CalDAV Authentication: Support for HTTP Basic Authentication over HTTPS (essential for Cloudflare Tunnel compatibility and client sync).
#### 3.2. Calendar Engine & Core Features
Multi-Calendar Support: Each user can create multiple independent calendars (e.g., "Work", "Personal", "Fitness").
Color Customization: Assign custom HEX colors to individual calendars, reflecting across both the web UI and supportive CalDAV clients.
Event Management: Full CRUD operations via the web UI (Title, Description, Location, Start/End Time, All-Day toggle, Recurrence rules).
#### 3.3. Data Ingestion & Sources
The app must support three distinct types of calendar feeds:
Native Local Calendars: Created directly inside CalBridge; fully interactive (read/write via Web and CalDAV).
Local .ics Import: One-time file upload to seed a native local calendar.
Remote .ics Subscriptions (HTTPS): * Ability to paste a read-only URL (e.g., holiday calendars, sports schedules).
Background Worker: A lightweight cron-like routine inside the backend that fetches and syncs these remote feeds every $X$ hours.
Exposed via CalDAV to downstream devices as a read-only calendar collection.
#### 3.4. The Web Client Interface
The Canvas: A sleek, minimal layout heavily inspired by Apple Calendar. Clean typography, spacious grids, and subtle borders.
Views: Month, Week, Day, and Agenda/List views.
Sidebar: Toggle visibility of multiple calendars using checkboxes, accompanied by their respective color indicators.
Responsive Layout: Optimized for desktop and tablet viewports, with a clean collapsible sidebar for mobile browsers.
#### 3.5. CalDAV Server Protocol Support
Proper handling of PROPFIND, REPORT, PUT, DELETE, and OPTIONS verbs.
Auto-discovery support via standard paths:
https://your-domain.com/.well-known/caldav redirecting to the principal URL.
Tested compatibility with standard Android/E-ink sync adapters (DAVx⁵, built-in Onyx OS Calendar sync).
### 4. Non-Functional & Infrastructure Requirements
#### 4.1. Security & Networking (Cloudflare Tunnel Optimization)
Because the app sits behind a Cloudflare Tunnel, the backend must correctly parse and respect X-Forwarded-For and X-Forwarded-Proto headers.
The application must allow disabling native HTTPS/TLS termination within the container itself, leaving it to Cloudflare to handle edge encryption.
#### 4.2. Storage & Backup
All state (app configuration, users, events) resides in a single chronos.db SQLite file.
Docker Volume: The SQLite file and any potential log directories must live in a predictable directory exposed as a volume (e.g., /app/data). This makes daily backups as simple as copying a single file.
### 5. UI/UX Design Directions
Design Theme: Liquid Glass / Clean Minimalist
Backgrounds: Pure whites (#FFFFFF) or ultra-light grays (#FAFAFA) for light mode; deep obsidian dark mode.
Surfaces: Translucent card borders, highly structured layouts, drop shadows minimalized to give an organic, native-app feel.
Typography: Clean sans-serif stacks (Inter, SF Pro text tokens).
### 6. Technical Milestones & Implementation Order
- Phase 1 (Backend & DB): Set up the Go/Node project, initialize SQLite schema via ORM, implement User/Auth REST endpoints.
- Phase 2 (CalDAV Engine): Implement core CalDAV protocol compliance. Test connectivity early using DAVx⁵ or a desktop client against a dummy endpoint.
- Phase 3 (Frontend Admin & View): Build the React dashboard shell, user administration tables, and integrate the core Month/Week calendar UI using mock data.
- Phase 4 (Integration & Synchronization): Hook the React frontend to the backend REST API. Implement the background worker for remote .ics fetching.
- Phase 5 (Containerization): Write the multi-stage Dockerfile, optimize image size, and verify setup end-to-end behind a Cloudflare Tunnel proxy.