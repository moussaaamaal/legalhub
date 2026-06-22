# LegalHub Backend — Rapport Complet du Projet

> **Projet :** PFE (Projet de Fin d'Études)  
> **Plateforme :** SaaS de gestion de cabinet juridique multi-tenant  
> **Date :** Mai 2026  
> **Stack :** FastAPI · Supabase (PostgreSQL + Storage) · JWT Custom · OpenAI GPT-4o · Stripe · Sadad · React Native / Expo SDK 54

---

## TABLE DES MATIÈRES

1. [Vue d'ensemble du projet](#1-vue-densemble-du-projet)
2. [Architecture & Structure des fichiers](#2-architecture--structure-des-fichiers)
3. [Fichiers Core](#3-fichiers-core)
4. [Tous les Endpoints API (par router)](#4-tous-les-endpoints-api-par-router)
   - 4.1 Authentication (+ OAuth Social Login)
   - 4.2 Cases (Dossiers)
   - 4.3 Clients
   - 4.4 Billing (Facturation)
   - 4.5 Documents
   - 4.6 Calendar (Agenda)
   - 4.7 Tasks & Notes
   - 4.8 Firm (Cabinet)
   - 4.9 Payments (Paiements)
   - 4.10 Dashboard
   - 4.11 AI
   - 4.12 Client Portal
   - 4.13 Notifications
   - 4.14 Health
5. [Base de données Supabase — Setup complet](#5-base-de-données-supabase--setup-complet)
6. [Scheduler — Rappels automatiques](#6-scheduler--rappels-automatiques-par-email)
7. [Application Mobile — React Native / Expo](#7-application-mobile--react-native--expo)
8. [Corrections de bugs effectuées](#8-corrections-de-bugs-effectuées)
9. [Configuration & Lancement](#9-configuration--lancement)

---

## 1. Vue d'ensemble du projet

LegalHub est une plateforme SaaS complète pour la gestion de cabinets d'avocats. Elle supporte :

- **Multi-tenancy** : chaque cabinet est isolé par `firm_id` — aucune donnée d'un cabinet n'est accessible à un autre
- **RBAC (Role-Based Access Control)** : 3 rôles — `FIRM_ADMIN`, `LAWYER`, `CLIENT`
- **JWT custom** : authentification via access token (15 min) + refresh token (7 jours)
- **OAuth Social Login** : Google, Microsoft (Azure), Apple — via Supabase Auth comme intermédiaire OAuth + native Apple Sign In
- **IA intégrée** : GPT-4o pour résumés de documents, rédaction de contrats, suggestions d'actions légales ; Whisper pour transcription vocale
- **Paiements** : Stripe (international) + Sadad (marché du Golfe)
- **Frontend cible** : Application Mobile React Native / Expo (testée sur iPhone via Expo Go)

---

## 2. Architecture & Structure des fichiers

```
legalhub-backend/
│
├── .env                          # Variables d'environnement (ne pas commit sur Git)
├── requirements.txt              # Dépendances Python
│
└── app/
    ├── main.py                   # Point d'entrée — enregistrement des 13 routers + CORS
    │
    ├── core/
    │   ├── config.py             # Settings Pydantic — lit le fichier .env
    │   ├── database.py           # 2 clients Supabase (anon + service role admin)
    │   ├── security.py           # JWT (create/decode token) + bcrypt (hash/verify password)
    │   └── dependencies.py       # Guards RBAC : get_current_user, get_lawyer, get_firm_admin
    │
    ├── models/
    │   └── enums.py              # Tous les enums Python du domaine métier
    │
    └── routers/
        ├── auth.py               # Auth email/password + OAuth (Google, Microsoft, Apple) + 2FA + invitations
        ├── cases.py              # Gestion des dossiers juridiques
        ├── clients.py            # Gestion des clients
        ├── documents.py          # Upload, partage, transcription, résumé IA, demandes de documents
        ├── billing.py            # Facturation, analytics financières
        ├── calendar.py           # Agenda, audiences, deadlines
        ├── tasks.py              # Tâches et notes
        ├── firm.py               # Paramètres du cabinet
        ├── payments.py           # Stripe + Sadad
        ├── dashboard.py          # KPIs tableau de bord
        ├── ai.py                 # Sessions IA — résumé, contrat, assistant
        ├── notifications.py      # Notifications utilisateur
        └── client_portal.py      # Portail client (rôle CLIENT uniquement)
```

---

## 3. Fichiers Core

### 3.1 `app/core/config.py` — Configuration

Lit les variables depuis le fichier `.env` via Pydantic Settings.

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `SUPABASE_URL` | Oui | URL du projet Supabase |
| `SUPABASE_ANON_KEY` | Oui | Clé publique Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Oui | Clé admin Supabase (bypass RLS) |
| `SECRET_KEY` | Oui | Clé secrète pour signer les JWT |
| `ALGORITHM` | Oui | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Oui | Durée access token (défaut: 15 min) |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Oui | Durée refresh token (défaut: 7 jours) |
| `OPENAI_API_KEY` | Non | Pour les fonctionnalités IA |
| `STRIPE_SECRET_KEY` | Non | Pour les paiements Stripe |
| `STRIPE_WEBHOOK_SECRET` | Non | Pour valider les webhooks Stripe |
| `SENDGRID_API_KEY` | Non | Pour l'envoi d'emails |
| `TWILIO_ACCOUNT_SID` | Non | Pour l'envoi de SMS |
| `FRONTEND_URL` | Non | URL du frontend (CORS) |

### 3.2 `app/core/database.py` — Clients Supabase

Deux clients Supabase sont créés au démarrage :

```python
# Client standard (anon key) — utilisé dans la majorité des routers
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)

# Client admin (service role) — utilisé pour les opérations privilégiées (invitations, avatars)
supabase_admin: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
```

> **Note :** RLS étant désactivé, les deux clients ont les mêmes permissions en pratique. L'autorisation est gérée dans le code Python (guards RBAC).

### 3.3 `app/core/dependencies.py` — Guards RBAC

```python
get_current_user   # Tout utilisateur authentifié (FIRM_ADMIN, LAWYER, CLIENT)
get_lawyer         # LAWYER + FIRM_ADMIN + SUPER_ADMIN
get_firm_admin     # FIRM_ADMIN + SUPER_ADMIN uniquement
```

Fonctionnement : extrait le JWT du header `Authorization: Bearer <token>`, décode, récupère l'utilisateur dans `app_user`, vérifie `is_active`.

### 3.4 `app/models/enums.py` — Enums Python

```python
UserRole:        SUPER_ADMIN | FIRM_ADMIN | LAWYER | CLIENT
CaseStatus:      NEW | INVESTIGATION | PRE_TRIAL | TRIAL | APPEAL | SETTLED | CLOSED
CasePriority:    URGENT | HIGH | MEDIUM | NORMAL | LOW
CaseType:        CRIMINAL | CIVIL | CORPORATE | FAMILY | REAL_ESTATE | IMMIGRATION
                 PERSONAL_INJURY | IP | LABOR | TAX
BillingType:     HOURLY | FLAT_FEE | CONTINGENCY | RETAINER
InvoiceStatus:   DRAFT | PENDING | PAID | OVERDUE | CANCELLED
DocumentCategory: CONTRACT | COURT_DOC | EVIDENCE | FINANCIAL | CLIENT_DOC
                  VOICE_TRANSCRIPT | OTHER
DocumentStatus:  PENDING_REVIEW | APPROVED | REJECTED
EventType:       HEARING | MEETING | DEADLINE | CONSULTATION | COURT_DATE
PaymentGateway:  STRIPE | MASTERCARD | SADAD
ClientTag:       ACTIVE | PENDING | PREMIUM | VIP
```

---

## 4. Tous les Endpoints API (par router)

### 4.1 Authentication — `POST/GET /api/auth/...`

| Méthode | Endpoint | Rôle requis | Description |
|---------|----------|-------------|-------------|
| `POST` | `/api/auth/register-firm` | Public | Crée un nouveau cabinet + compte FIRM_ADMIN + abonnement Free. Retourne `firm_id` et `office_code` |
| `POST` | `/api/auth/login` | Public | Login email+password. Retourne `access_token`, `refresh_token`, profil utilisateur |
| `POST` | `/api/auth/oauth/token` | Public | **Social login OAuth** — vérifie le token du provider et retourne des JWT LegalHub |
| `POST` | `/api/auth/refresh` | Public | Renouvelle l'access token via refresh token |
| `POST` | `/api/auth/logout` | Authentifié | Déconnexion (stateless) |
| `GET` | `/api/auth/me` | Authentifié | Retourne le profil complet de l'utilisateur connecté |
| `POST` | `/api/auth/2fa/setup` | Authentifié | Génère secret TOTP + QR code URL pour Google Authenticator |
| `POST` | `/api/auth/2fa/verify` | Authentifié | Vérifie le code TOTP et active la 2FA |
| `POST` | `/api/auth/2fa/login` | Public | Valide le code TOTP après login (utilise le `temp_token`) |
| `POST` | `/api/auth/forgot-password` | Public | Génère un token de reset (1h expiry) |
| `POST` | `/api/auth/reset-password` | Public | Valide le token, change le mot de passe |
| `POST` | `/api/auth/invite/lawyer` | FIRM_ADMIN | Crée un compte LAWYER inactif + envoie invitation |
| `POST` | `/api/auth/invite/client` | LAWYER | Crée un client lié au cabinet + génère `invite_token` |
| `POST` | `/api/auth/office-code/validate` | Public | Crée un compte LAWYER via code bureau du cabinet (mobile) |
| `POST` | `/api/auth/accept-invite` | Public | Finalise l'inscription d'un utilisateur invité |
| `PUT` | `/api/auth/me` | Authentifié | Met à jour le profil (`full_name`, `phone`) |
| `POST` | `/api/auth/avatar` | Authentifié | Upload avatar → Supabase Storage bucket `avatars` |
| `PUT` | `/api/auth/change-password` | Authentifié | Change le mot de passe |
| `GET` | `/api/auth/login-history` | Authentifié | 10 dernières connexions de l'utilisateur |
| `GET` | `/api/auth/notification-preferences` | Authentifié | Préférences de notification |
| `PUT` | `/api/auth/notification-preferences` | Authentifié | Met à jour les préférences de notification |

#### OAuth Social Login — `POST /api/auth/oauth/token`

Endpoint unifié qui supporte 4 providers. Le mobile envoie le token obtenu via le provider, le backend le vérifie auprès du provider puis retourne des JWT LegalHub.

**Schema request :**
```json
{
  "provider": "supabase | google | microsoft | apple",
  "token": "le_token_du_provider",
  "token_type": "id_token | access_token"
}
```

**Vérification par provider :**

| Provider | `token_type` | Méthode de vérification |
|----------|-------------|------------------------|
| `supabase` | `access_token` | `GET {SUPABASE_URL}/auth/v1/user` avec Bearer + apikey header |
| `google` | `access_token` | `GET https://www.googleapis.com/oauth2/v3/userinfo` |
| `google` | `id_token` | `GET https://oauth2.googleapis.com/tokeninfo?id_token=...` |
| `microsoft` | `access_token` | `GET https://graph.microsoft.com/v1.0/me` |
| `apple` | `id_token` | Décodage JWT RS256 sans vérification de signature (claims email + sub) |

**Comportement :** Cherche l'email dans `app_user`. Si trouvé et actif → retourne JWT LegalHub. Si non trouvé → HTTP 404 (l'utilisateur doit s'inscrire d'abord via email ou office code).

**Schémas request importants :**
```json
POST /register-firm : { "firm_name", "legal_entity_type", "email", "password", "full_name", "phone?" }
POST /login         : { "email", "password" }
POST /oauth/token   : { "provider", "token", "token_type" }
POST /invite/lawyer : { "email", "full_name" }
POST /invite/client : { "email", "full_name", "phone?" }
POST /reset-password      : { "token", "new_password" }
POST /accept-invite       : { "invite_token", "email", "password", "full_name", "phone?" }
POST /2fa/login           : { "temp_token", "code" }
PUT  /me                  : { "full_name?", "phone?" }
PUT  /change-password     : { "current_password", "new_password" }
PUT  /notification-preferences : { "push_notifications?", "hearing_reminders?", "hearing_reminder_offset?",
                                   "task_reminders?", "document_updates?", "client_messages?",
                                   "payment_notifications?", "email_notifications?", "whatsapp_updates?" }
```

---

### 4.2 Cases (Dossiers) — `/api/cases/...`

| Méthode | Endpoint | Rôle requis | Description |
|---------|----------|-------------|-------------|
| `GET` | `/api/cases` | LAWYER | Liste tous les dossiers du cabinet. Filtres : `status`, `priority`, `case_type` |
| `POST` | `/api/cases` | LAWYER | Crée un dossier. Ajoute une entrée dans `case_timeline` |
| `GET` | `/api/cases/client/{client_id}` | Authentifié | Dossiers d'un client spécifique *(déclaré AVANT `/{case_id}`)* |
| `GET` | `/api/cases/{case_id}` | Authentifié | Détail d'un dossier avec join client |
| `PUT` | `/api/cases/{case_id}` | LAWYER | Mise à jour partielle (tous champs optionnels) + timeline |
| `PATCH` | `/api/cases/{case_id}/status` | LAWYER | Change le statut du dossier + timeline |
| `PATCH` | `/api/cases/{case_id}/restore` | LAWYER | Restaure un dossier archivé |
| `DELETE` | `/api/cases/{case_id}` | LAWYER | Archive le dossier (status → CLOSED) + timeline |
| `GET` | `/api/cases/{case_id}/timeline` | Authentifié | Historique chronologique du dossier |
| `GET` | `/api/cases/{case_id}/team` | LAWYER | Membres de l'équipe du dossier avec profils |
| `POST` | `/api/cases/{case_id}/team` | LAWYER | Ajoute un membre à l'équipe (body JSON: `{"user_id": "..."}`) |
| `DELETE` | `/api/cases/{case_id}/team/{user_id}` | LAWYER | Retire un membre de l'équipe |

**Schéma CreateCase :**
```json
{
  "title": "string",
  "case_number": "string",
  "case_type": "CRIMINAL|CIVIL|CORPORATE|...",
  "priority": "URGENT|HIGH|MEDIUM|NORMAL|LOW",
  "client_id?": "uuid",
  "description?": "string",
  "opposing_party?": "string",
  "court_name?": "string",
  "billing_type?": "HOURLY|FLAT_FEE|...",
  "filing_date?": "YYYY-MM-DD"
}
```

---

### 4.3 Clients — `/api/clients/...`

| Méthode | Endpoint | Rôle requis | Description |
|---------|----------|-------------|-------------|
| `GET` | `/api/clients` | LAWYER | Liste clients du cabinet. Filtres : `tag`, `search` (nom/email) |
| `POST` | `/api/clients` | LAWYER | Crée un client. Résout automatiquement `lawyer_id` via la table `lawyer` |
| `GET` | `/api/clients/{client_id}` | LAWYER | Détail d'un client |
| `PUT` | `/api/clients/{client_id}` | LAWYER | Mise à jour partielle |
| `DELETE` | `/api/clients/{client_id}` | LAWYER | Désactive le client (tag → PENDING) |
| `POST` | `/api/clients/{client_id}/invite` | LAWYER | Génère un `invite_token` et envoie invitation |
| `GET` | `/api/clients/{client_id}/cases` | Authentifié | Tous les dossiers d'un client |
| `GET` | `/api/clients/{client_id}/invoices` | LAWYER | Toutes les factures d'un client |

---

### 4.4 Billing (Facturation) — `/api/invoices/...`

> **Règle critique :** `/analytics/summary` est déclaré EN PREMIER avant `/{invoice_id}` pour éviter que FastAPI interprète "analytics" comme un ID de facture.

| Méthode | Endpoint | Rôle requis | Description |
|---------|----------|-------------|-------------|
| `GET` | `/api/invoices/analytics/summary` | LAWYER | KPIs financiers : `total_revenue`, `outstanding`, `overdue`, `collection_rate` |
| `GET` | `/api/invoices` | Authentifié | Liste factures. Filtres : `status`, `client_id`. Les clients ne voient que leurs factures |
| `POST` | `/api/invoices` | LAWYER | Crée une facture avec calcul automatique `subtotal`, `tax_amount`, `total` |
| `GET` | `/api/invoices/{invoice_id}` | Authentifié | Détail facture + lignes + client |
| `PUT` | `/api/invoices/{invoice_id}` | LAWYER | Mise à jour. Interdit si status = PAID. Remplace les lignes atomiquement |
| `DELETE` | `/api/invoices/{invoice_id}` | LAWYER | Suppression d'une facture |
| `POST` | `/api/invoices/{invoice_id}/send` | LAWYER | Marque la facture PENDING (envoi au client) |
| `POST` | `/api/invoices/{invoice_id}/reminder` | LAWYER | Envoie une relance de paiement |

**Schéma CreateInvoice :**
```json
{
  "client_id": "uuid",
  "case_id?": "uuid",
  "due_date": "YYYY-MM-DD",
  "currency": "USD",
  "tax_rate": 0,
  "notes?": "string",
  "items": [
    { "description": "string", "quantity": 1.0, "unit_price": 500.0 }
  ]
}
```

---

### 4.5 Documents — `/api/documents/...`

| Méthode | Endpoint | Rôle requis | Description |
|---------|----------|-------------|-------------|
| `GET` | `/api/documents` | LAWYER | Liste documents. Filtres : `case_id`, `category`, `status` |
| `POST` | `/api/documents/upload` | LAWYER | Upload fichier → Supabase Storage → enregistrement DB + timeline |
| `POST` | `/api/documents/voice-note` | LAWYER | Upload audio → Storage → Whisper STT → sauvegarde comme note |
| `POST` | `/api/documents/voice-note-ai` | LAWYER | Upload audio → Whisper + GPT-4o → analyse IA enrichie |
| `POST` | `/api/documents/voice-note-ai/confirm` | LAWYER | Confirme et sauvegarde la note IA en base |
| `POST` | `/api/documents/request` | LAWYER | Crée une demande de document à un client |
| `GET` | `/api/documents/requests` | LAWYER | Liste les demandes de documents. Filtre : `case_id` |
| `DELETE` | `/api/documents/requests/{request_id}` | LAWYER | Annule une demande de document |
| `GET` | `/api/documents/{doc_id}` | Authentifié | Détail d'un document |
| `DELETE` | `/api/documents/{doc_id}` | LAWYER | Suppression |
| `PATCH` | `/api/documents/{doc_id}/status` | LAWYER | Change statut : `PENDING_REVIEW | APPROVED | REJECTED` |
| `POST` | `/api/documents/{doc_id}/share` | LAWYER | Partage le document avec le client (`is_shared_with_client = true`) |
| `POST` | `/api/documents/{doc_id}/ai-summarize` | LAWYER | GPT-4o génère un résumé structuré → table `ai_summary` |

**Upload :** `multipart/form-data` avec champs `file` (binaire) + `case_id` (string)

**Voice Note AI Flow :**
```
Audio file → OpenAI Whisper API (transcription)
           → GPT-4o (analyse enrichie : titre, catégorie, entités, actions)
           → Retourne JSON structuré pour confirmation mobile
           → POST /voice-note-ai/confirm → sauvegarde en DB
```

---

### 4.6 Calendar (Agenda) — `/api/calendar/...`

| Méthode | Endpoint | Rôle requis | Description |
|---------|----------|-------------|-------------|
| `GET` | `/api/calendar/events` | Authentifié | Liste tous les événements du cabinet. Filtre : `event_type` |
| `POST` | `/api/calendar/events` | LAWYER | Crée un événement. Ajoute timeline si lié à un dossier |
| `PUT` | `/api/calendar/events/{event_id}` | LAWYER | Mise à jour d'un événement |
| `DELETE` | `/api/calendar/events/{event_id}` | LAWYER | Suppression |
| `POST` | `/api/calendar/test-reminder` | LAWYER | Déclenche manuellement un test de rappel email |

**Types d'événements :** `HEARING | MEETING | DEADLINE | CONSULTATION | COURT_DATE`

---

### 4.7 Tasks & Notes — `/api/tasks/...` et `/api/notes/...`

**Tâches :**

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/tasks` | Liste tâches. Filtres : `case_id`, `status` |
| `POST` | `/api/tasks` | Crée une tâche. Auto-assign à l'utilisateur connecté si `assigned_to` absent |
| `PATCH` | `/api/tasks/{task_id}/status` | Change le statut : `PENDING | IN_PROGRESS | COMPLETED | CANCELLED` |
| `PUT` | `/api/tasks/{task_id}` | Mise à jour partielle |
| `DELETE` | `/api/tasks/{task_id}` | Suppression |

**Notes :**

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/notes` | Liste notes. Filtre : `case_id` |
| `POST` | `/api/notes` | Crée une note + entrée timeline |
| `PUT` | `/api/notes/{note_id}` | Mise à jour du contenu |
| `DELETE` | `/api/notes/{note_id}` | Suppression |

---

### 4.8 Firm (Cabinet) — `/api/firm/...`

| Méthode | Endpoint | Rôle requis | Description |
|---------|----------|-------------|-------------|
| `GET` | `/api/firm/profile` | LAWYER | Profil complet du cabinet |
| `PUT` | `/api/firm/profile` | FIRM_ADMIN | Mise à jour : nom, email, adresse, domaines de pratique... |
| `GET` | `/api/firm/team` | FIRM_ADMIN | Liste de tous les membres (non-clients) |
| `PUT` | `/api/firm/team/{user_id}/role` | FIRM_ADMIN | Change rôle : `LAWYER ↔ FIRM_ADMIN` |
| `DELETE` | `/api/firm/team/{user_id}` | FIRM_ADMIN | Désactive un membre (soft delete, `is_active = false`) |
| `GET` | `/api/firm/subscription` | FIRM_ADMIN | Plan d'abonnement actuel |
| `GET` | `/api/firm/branding` | LAWYER | Logo, couleurs, nom d'affichage |
| `PUT` | `/api/firm/branding` | FIRM_ADMIN | Upsert branding (crée si absent, met à jour si existant) |
| `GET` | `/api/firm/office-code` | FIRM_ADMIN | Code bureau pour invitations de nouveaux avocats |

---

### 4.9 Payments (Paiements) — `/api/payments/...`

| Méthode | Endpoint | Rôle requis | Description |
|---------|----------|-------------|-------------|
| `POST` | `/api/payments/stripe/create` | Authentifié | Crée un Stripe PaymentIntent. Retourne `client_secret` pour le frontend |
| `POST` | `/api/payments/stripe/confirm` | Authentifié | Confirme le paiement. Met à jour facture → PAID + crée enregistrement `payment` |
| `POST` | `/api/payments/sadad/initiate` | Authentifié | Retourne la référence SADAD pour paiement via banque |
| `POST` | `/api/payments/webhook` | Public | Webhook Stripe (signature vérifiée) + Sadad. Marque factures payées automatiquement |

**Flow Stripe :**
```
Frontend → POST /stripe/create → client_secret
        → Stripe.js confirme le paiement
        → POST /stripe/confirm OU webhook automatique
        → invoice.status = PAID + table payment créée
```

---

### 4.10 Dashboard — `/api/dashboard/...`

| Méthode | Endpoint | Description | Données retournées |
|---------|----------|-------------|-------------------|
| `GET` | `/api/dashboard/stats` | KPIs accueil | `active_cases`, `closed_cases`, `upcoming_hearings`, `pending_payments`, `active_reminders` |
| `GET` | `/api/dashboard/today` | Agenda du jour | Tous les événements aujourd'hui triés par heure avec join `case_file` |
| `GET` | `/api/dashboard/recent-cases` | Derniers dossiers | 5 dossiers actifs les plus récemment modifiés avec nom du client |
| `GET` | `/api/dashboard/recent-activity` | Activité récente | Activité des N derniers jours (défaut: 3). Paramètre: `?days=N` |

---

### 4.11 AI — `/api/ai/...`

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `POST` | `/api/ai/summarize` | Résumé GPT-4o d'un document (clauses, parties, dates, obligations) |
| `POST` | `/api/ai/draft-contract` | Rédaction d'un contrat légal selon type + paramètres |
| `POST` | `/api/ai/suggest-actions` | 5 prochaines étapes recommandées pour un dossier |
| `POST` | `/api/ai/case-assistant` | Q&A sur un dossier (assistant conversationnel) |
| `GET` | `/api/ai/history` | Historique des 50 dernières sessions IA du lawyer |

---

### 4.12 Client Portal — `/api/client/...`

> Routes réservées au rôle `CLIENT`. Chaque requête vérifie que l'utilisateur est un CLIENT et récupère son enregistrement `client` lié via `client.user_id = app_user.id`.

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/client/dashboard` | Stats du tableau de bord client : dossiers actifs, factures en attente, documents partagés, prochains RDV |
| `GET` | `/api/client/cases` | Tous les dossiers du client connecté |
| `GET` | `/api/client/cases/{case_id}` | Détail d'un dossier + avocat principal + 10 dernières entrées timeline |
| `GET` | `/api/client/invoices` | Toutes les factures avec leurs lignes. Filtre optionnel `?status=` |
| `GET` | `/api/client/invoices/{invoice_id}` | Détail d'une facture spécifique |
| `POST` | `/api/client/invoices/{invoice_id}/pay` | Paiement d'une facture depuis le portail client |
| `GET` | `/api/client/documents` | Documents partagés (`is_shared_with_client = true`) |
| `POST` | `/api/client/documents/upload` | Upload d'un document par le client |
| `GET` | `/api/client/document-requests` | Demandes de documents envoyées par l'avocat |
| `POST` | `/api/client/document-requests/{id}/fulfill` | Le client répond à une demande en uploadant un fichier |
| `GET` | `/api/client/appointments` | Rendez-vous à venir. Filtre: `?case_id=` |
| `POST` | `/api/client/appointments/request` | Le client demande un rendez-vous |
| `GET` | `/api/client/profile` | Profil complet du client + infos cabinet |
| `GET` | `/api/client/activity` | 20 dernières actions sur les dossiers du client (timeline) |

**Sécurité :** La dépendance `_require_client` vérifie à la fois le rôle `CLIENT` ET que l'enregistrement `client` existe. Les données sont filtrées par `client_id` ET `firm_id`.

---

### 4.13 Notifications — `/api/notifications/...`

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/api/notifications` | 50 dernières notifications de l'utilisateur |
| `GET` | `/api/notifications/unread-count` | Nombre de notifications non lues |
| `PATCH` | `/api/notifications/read-all` | Marque toutes les notifications comme lues |
| `PATCH` | `/api/notifications/{id}/read` | Marque une notification spécifique comme lue |
| `POST` | `/api/notifications/test` | Crée une notification de test |

---

### 4.14 Health — `/`

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/` | Status de l'API |
| `GET` | `/health` | Health check |
| `GET` | `/docs` | Swagger UI (documentation interactive) |
| `GET` | `/redoc` | ReDoc (documentation alternative) |

---

## 5. Base de données Supabase — Setup complet

### Étape 1 — Ouvrir l'éditeur SQL

Supabase Dashboard → **SQL Editor** → **New Query**

---

### Étape 2 — Créer les 22 types ENUM

```sql
-- Rôles utilisateurs
CREATE TYPE user_role AS ENUM ('SUPER_ADMIN', 'FIRM_ADMIN', 'LAWYER', 'CLIENT');

-- Statuts des dossiers
CREATE TYPE case_status AS ENUM (
    'NEW', 'INVESTIGATION', 'PRE_TRIAL', 'TRIAL', 'APPEAL', 'SETTLED', 'CLOSED'
);

-- Priorités
CREATE TYPE case_priority AS ENUM ('URGENT', 'HIGH', 'MEDIUM', 'NORMAL', 'LOW');

-- Types de dossier
CREATE TYPE case_type AS ENUM (
    'CRIMINAL', 'CIVIL', 'CORPORATE', 'FAMILY', 'REAL_ESTATE',
    'IMMIGRATION', 'PERSONAL_INJURY', 'IP', 'LABOR', 'TAX'
);

-- Types de facturation
CREATE TYPE billing_type AS ENUM ('HOURLY', 'FLAT_FEE', 'CONTINGENCY', 'RETAINER');

-- Statuts des factures
CREATE TYPE invoice_status AS ENUM ('DRAFT', 'PENDING', 'PAID', 'OVERDUE', 'CANCELLED');

-- Catégories de documents
CREATE TYPE document_category AS ENUM (
    'CONTRACT', 'COURT_DOC', 'EVIDENCE', 'FINANCIAL',
    'CLIENT_DOC', 'VOICE_TRANSCRIPT', 'OTHER'
);

-- Statuts des documents
CREATE TYPE document_status AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- Types d'événements calendrier
CREATE TYPE event_type AS ENUM ('HEARING', 'MEETING', 'DEADLINE', 'CONSULTATION', 'COURT_DATE');

-- Passerelles de paiement
CREATE TYPE payment_gateway AS ENUM ('STRIPE', 'MASTERCARD', 'SADAD');

-- Tags clients
CREATE TYPE client_tag AS ENUM ('ACTIVE', 'PENDING', 'PREMIUM', 'VIP');

-- Statuts des tâches
CREATE TYPE task_status AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- Priorités des tâches
CREATE TYPE task_priority AS ENUM ('URGENT', 'HIGH', 'MEDIUM', 'NORMAL', 'LOW');

-- Types de notifications
CREATE TYPE notification_type AS ENUM (
    'CASE_UPDATE', 'INVOICE_DUE', 'HEARING_REMINDER',
    'DOCUMENT_SHARED', 'TASK_ASSIGNED', 'GENERAL'
);

-- Plans d'abonnement
CREATE TYPE subscription_plan AS ENUM ('FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE');

-- Statuts des abonnements
CREATE TYPE subscription_status AS ENUM ('ACTIVE', 'INACTIVE', 'TRIAL', 'CANCELLED');

-- Statuts des paiements
CREATE TYPE payment_status AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');

-- Types de sessions IA
CREATE TYPE ai_session_type AS ENUM (
    'DOCUMENT_SUMMARY', 'CONTRACT_DRAFT', 'CASE_ANALYSIS',
    'LEGAL_RESEARCH', 'VOICE_TRANSCRIPTION'
);

-- Spécialisations avocat
CREATE TYPE lawyer_specialization AS ENUM (
    'CRIMINAL_LAW', 'CIVIL_LAW', 'CORPORATE_LAW', 'FAMILY_LAW',
    'REAL_ESTATE_LAW', 'IMMIGRATION_LAW', 'LABOR_LAW', 'TAX_LAW'
);

-- Types de tribunal
CREATE TYPE court_type AS ENUM (
    'SUPREME_COURT', 'COURT_OF_APPEALS', 'DISTRICT_COURT',
    'FAMILY_COURT', 'CRIMINAL_COURT', 'ADMINISTRATIVE_COURT'
);

-- Préférences de langue
CREATE TYPE language_preference AS ENUM ('AR', 'FR', 'EN');

-- Thèmes interface
CREATE TYPE theme_preference AS ENUM ('LIGHT', 'DARK', 'SYSTEM');
```

---

### Étape 3 — Créer les 19 tables (dans l'ordre des dépendances)

```sql
-- ─────────────────────────────────────────────────────
-- TABLE 1 : firm (cabinet juridique)
-- ─────────────────────────────────────────────────────
CREATE TABLE firm (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    legal_entity_type   TEXT,
    registration_number TEXT,
    tax_id              TEXT,
    email               TEXT,
    phone               TEXT,
    address             TEXT,
    city                TEXT,
    country             TEXT DEFAULT 'DZ',
    practice_areas      TEXT[],
    description         TEXT,
    office_code         TEXT UNIQUE,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────
-- TABLE 2 : subscription (abonnement du cabinet)
-- ─────────────────────────────────────────────────────
CREATE TABLE subscription (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id            UUID NOT NULL REFERENCES firm(id) ON DELETE CASCADE,
    plan_name          TEXT NOT NULL DEFAULT 'Free',
    status             subscription_status DEFAULT 'ACTIVE',
    ai_credits_used    INT DEFAULT 0,
    ai_credits_limit   INT DEFAULT 100,
    max_lawyers        INT DEFAULT 3,
    max_storage_gb     INT DEFAULT 10,
    start_date         DATE,
    end_date           DATE,
    stripe_customer_id TEXT,
    created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────
-- TABLE 3 : app_user (tous les utilisateurs de la plateforme)
-- ─────────────────────────────────────────────────────
CREATE TABLE app_user (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id                   UUID REFERENCES firm(id) ON DELETE SET NULL,
    email                     TEXT UNIQUE NOT NULL,
    password_hash             TEXT NOT NULL,
    role                      user_role NOT NULL DEFAULT 'LAWYER',
    full_name                 TEXT NOT NULL,
    phone                     TEXT,
    avatar_url                TEXT,
    is_active                 BOOLEAN DEFAULT TRUE,
    two_fa_enabled            BOOLEAN DEFAULT FALSE,
    two_fa_secret             TEXT,
    biometric_token           TEXT,
    password_reset_token      TEXT,
    password_reset_expires_at TIMESTAMPTZ,
    language_pref             language_preference DEFAULT 'FR',
    theme_pref                theme_preference DEFAULT 'SYSTEM',
    last_login_at             TIMESTAMPTZ,
    created_at                TIMESTAMPTZ DEFAULT NOW(),
    updated_at                TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────
-- TABLE 4 : firm_branding (personnalisation visuelle)
-- ─────────────────────────────────────────────────────
CREATE TABLE firm_branding (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id       UUID NOT NULL UNIQUE REFERENCES firm(id) ON DELETE CASCADE,
    logo_url      TEXT,
    primary_color TEXT DEFAULT '#1A56DB',
    display_name  TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────
-- TABLE 5 : lawyer (profil étendu de l'avocat)
-- ─────────────────────────────────────────────────────
CREATE TABLE lawyer (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL UNIQUE REFERENCES app_user(id) ON DELETE CASCADE,
    firm_id          UUID NOT NULL REFERENCES firm(id) ON DELETE CASCADE,
    bar_number       TEXT,
    specializations  lawyer_specialization[],
    years_experience INT,
    bio              TEXT,
    hourly_rate      NUMERIC(10,2),
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────
-- TABLE 6 : client (client du cabinet)
-- ─────────────────────────────────────────────────────
CREATE TABLE client (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id            UUID NOT NULL REFERENCES firm(id) ON DELETE CASCADE,
    user_id            UUID REFERENCES app_user(id),
    assigned_lawyer_id UUID REFERENCES lawyer(id),
    first_name         TEXT NOT NULL,
    last_name          TEXT NOT NULL,
    email              TEXT,
    phone              TEXT,
    whatsapp_number    TEXT,
    date_of_birth      DATE,
    gender             TEXT,
    national_id        TEXT,
    nationality        TEXT,
    occupation         TEXT,
    company_name       TEXT,
    address            TEXT,
    client_type        TEXT DEFAULT 'INDIVIDUAL',
    tag                client_tag DEFAULT 'ACTIVE',
    notes              TEXT,
    invite_token       TEXT,
    invite_status      TEXT DEFAULT 'PENDING',
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────
-- TABLE 7 : case_file (dossier juridique)
-- ─────────────────────────────────────────────────────
CREATE TABLE case_file (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id               UUID NOT NULL REFERENCES firm(id) ON DELETE CASCADE,
    lawyer_id             UUID REFERENCES app_user(id),
    client_id             UUID REFERENCES client(id),
    case_number           TEXT NOT NULL,
    title                 TEXT NOT NULL,
    case_type             case_type NOT NULL,
    practice_area         TEXT,
    status                case_status NOT NULL DEFAULT 'NEW',
    priority              case_priority NOT NULL DEFAULT 'NORMAL',
    description           TEXT,
    opposing_party        TEXT,
    opposing_counsel      TEXT,
    court_name            TEXT,
    court_location        TEXT,
    judge_name            TEXT,
    prosecutor_name       TEXT,
    billing_type          billing_type,
    estimated_value       NUMERIC(15,2),
    progress_percent      INT DEFAULT 0,
    filing_date           DATE,
    first_hearing_date    DATE,
    statute_of_limitations DATE,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────
-- TABLE 8 : case_team (équipe sur un dossier)
-- ─────────────────────────────────────────────────────
CREATE TABLE case_team (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id    UUID NOT NULL REFERENCES case_file(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    firm_id    UUID NOT NULL REFERENCES firm(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(case_id, user_id)
);

-- ─────────────────────────────────────────────────────
-- TABLE 9 : case_timeline (historique des actions)
-- ─────────────────────────────────────────────────────
CREATE TABLE case_timeline (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id      UUID NOT NULL REFERENCES case_file(id) ON DELETE CASCADE,
    firm_id      UUID NOT NULL REFERENCES firm(id) ON DELETE CASCADE,
    action       TEXT NOT NULL,
    performed_by UUID REFERENCES app_user(id),
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────
-- TABLE 10 : document (pièces jointes et documents)
-- ─────────────────────────────────────────────────────
CREATE TABLE document (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id               UUID NOT NULL REFERENCES firm(id) ON DELETE CASCADE,
    case_id               UUID REFERENCES case_file(id) ON DELETE SET NULL,
    uploaded_by           UUID REFERENCES app_user(id),
    file_name             TEXT NOT NULL,
    file_type             TEXT NOT NULL,
    file_size_mb          NUMERIC(10,4),
    storage_url           TEXT,
    category              document_category DEFAULT 'OTHER',
    status                document_status DEFAULT 'PENDING_REVIEW',
    is_shared_with_client BOOLEAN DEFAULT FALSE,
    ai_categorized        BOOLEAN DEFAULT FALSE,
    reviewed_by           UUID REFERENCES app_user(id),
    reviewed_at           TIMESTAMPTZ,
    created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────
-- TABLE 11 : note (notes et voice notes)
-- ─────────────────────────────────────────────────────
CREATE TABLE note (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id      UUID NOT NULL REFERENCES firm(id) ON DELETE CASCADE,
    case_id      UUID REFERENCES case_file(id) ON DELETE CASCADE,
    lawyer_id    UUID REFERENCES app_user(id),
    document_id  UUID REFERENCES document(id),
    content      TEXT NOT NULL,
    is_voice_note BOOLEAN DEFAULT FALSE,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────
-- TABLE 12 : task (tâches et rappels)
-- ─────────────────────────────────────────────────────
CREATE TABLE task (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id     UUID NOT NULL REFERENCES firm(id) ON DELETE CASCADE,
    case_id     UUID REFERENCES case_file(id) ON DELETE SET NULL,
    created_by  UUID REFERENCES app_user(id),
    assigned_to UUID REFERENCES app_user(id),
    title       TEXT NOT NULL,
    description TEXT,
    category    TEXT,
    priority    task_priority DEFAULT 'NORMAL',
    status      task_status DEFAULT 'PENDING',
    due_date    DATE,
    reminder_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────
-- TABLE 13 : calendar_event (événements agenda)
-- ─────────────────────────────────────────────────────
CREATE TABLE calendar_event (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id          UUID NOT NULL REFERENCES firm(id) ON DELETE CASCADE,
    case_id          UUID REFERENCES case_file(id) ON DELETE SET NULL,
    created_by       UUID REFERENCES app_user(id),
    title            TEXT NOT NULL,
    event_type       event_type NOT NULL,
    start_datetime   TIMESTAMPTZ NOT NULL,
    end_datetime     TIMESTAMPTZ,
    location         TEXT,
    is_video_call    BOOLEAN DEFAULT FALSE,
    video_call_url   TEXT,
    reminder_minutes INT[],
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────
-- TABLE 14 : invoice (factures)
-- ─────────────────────────────────────────────────────
CREATE TABLE invoice (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id        UUID NOT NULL REFERENCES firm(id) ON DELETE CASCADE,
    lawyer_id      UUID REFERENCES app_user(id),
    client_id      UUID REFERENCES client(id),
    case_id        UUID REFERENCES case_file(id),
    invoice_number TEXT NOT NULL UNIQUE,
    status         invoice_status DEFAULT 'DRAFT',
    subtotal       NUMERIC(15,2) DEFAULT 0,
    tax_rate       NUMERIC(5,2) DEFAULT 0,
    tax_amount     NUMERIC(15,2) DEFAULT 0,
    total_amount   NUMERIC(15,2) DEFAULT 0,
    currency       TEXT DEFAULT 'USD',
    issue_date     DATE,
    due_date       DATE,
    paid_at        TIMESTAMPTZ,
    notes          TEXT,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────
-- TABLE 15 : invoice_item (lignes de facture)
-- ─────────────────────────────────────────────────────
CREATE TABLE invoice_item (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id  UUID NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity    NUMERIC(10,2) NOT NULL,
    unit_price  NUMERIC(15,2) NOT NULL,
    total       NUMERIC(15,2) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────
-- TABLE 16 : payment (enregistrements de paiement)
-- ─────────────────────────────────────────────────────
CREATE TABLE payment (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id            UUID REFERENCES invoice(id),
    client_id             UUID REFERENCES client(id),
    amount                NUMERIC(15,2) NOT NULL,
    currency              TEXT DEFAULT 'USD',
    gateway               payment_gateway NOT NULL,
    gateway_transaction_id TEXT,
    status                payment_status DEFAULT 'COMPLETED',
    paid_at               TIMESTAMPTZ DEFAULT NOW(),
    created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────
-- TABLE 17 : notification (notifications in-app)
-- ─────────────────────────────────────────────────────
CREATE TABLE notification (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    firm_id     UUID REFERENCES firm(id),
    type        notification_type DEFAULT 'GENERAL',
    title       TEXT NOT NULL,
    message     TEXT,
    link        TEXT,
    is_read     BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────
-- TABLE 18 : ai_session (historique sessions IA)
-- ─────────────────────────────────────────────────────
CREATE TABLE ai_session (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lawyer_id    UUID REFERENCES app_user(id),
    firm_id      UUID REFERENCES firm(id),
    case_id      UUID REFERENCES case_file(id),
    session_type TEXT,
    prompt       TEXT,
    output       TEXT,
    tokens_used  INT DEFAULT 0,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────
-- TABLE 19 : ai_summary (résumés IA de documents)
-- ─────────────────────────────────────────────────────
CREATE TABLE ai_summary (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES document(id) ON DELETE CASCADE,
    lawyer_id   UUID REFERENCES app_user(id),
    summary     TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

### Étape 4 — Tables supplémentaires (migrations)

```sql
-- Table historique de connexions
CREATE TABLE login_history (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    logged_in_at TIMESTAMPTZ DEFAULT NOW(),
    login_method TEXT DEFAULT 'email'
);

-- Table préférences de notifications (upsert par user)
CREATE TABLE notification_preferences (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID UNIQUE NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    push_notifications      BOOLEAN DEFAULT TRUE,
    hearing_reminders       BOOLEAN DEFAULT TRUE,
    hearing_reminder_offset TEXT DEFAULT '1 hour before',
    task_reminders          BOOLEAN DEFAULT TRUE,
    document_updates        BOOLEAN DEFAULT TRUE,
    client_messages         BOOLEAN DEFAULT TRUE,
    payment_notifications   BOOLEAN DEFAULT TRUE,
    email_notifications     BOOLEAN DEFAULT FALSE,
    whatsapp_updates        BOOLEAN DEFAULT TRUE
);

-- Colonnes reset de mot de passe dans app_user (si pas déjà créées)
ALTER TABLE app_user
    ADD COLUMN IF NOT EXISTS password_reset_token TEXT,
    ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ;

-- Colonne user_id dans client (lien vers le compte app_user du client)
ALTER TABLE client
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_user(id);
```

---

### Étape 5 — Créer les Index de performance

```sql
-- firm_id (recherches multi-tenant sur toutes les tables)
CREATE INDEX idx_app_user_firm        ON app_user(firm_id);
CREATE INDEX idx_lawyer_firm          ON lawyer(firm_id);
CREATE INDEX idx_client_firm          ON client(firm_id);
CREATE INDEX idx_case_file_firm       ON case_file(firm_id);
CREATE INDEX idx_document_firm        ON document(firm_id);
CREATE INDEX idx_task_firm            ON task(firm_id);
CREATE INDEX idx_calendar_firm        ON calendar_event(firm_id);
CREATE INDEX idx_invoice_firm         ON invoice(firm_id);
CREATE INDEX idx_notification_firm    ON notification(firm_id);
CREATE INDEX idx_ai_session_firm      ON ai_session(firm_id);

-- Statuts (filtres fréquents)
CREATE INDEX idx_case_status          ON case_file(status);
CREATE INDEX idx_invoice_status       ON invoice(status);
CREATE INDEX idx_task_status          ON task(status);
CREATE INDEX idx_document_status      ON document(status);
CREATE INDEX idx_notification_read    ON notification(is_read);

-- Relations
CREATE INDEX idx_case_client          ON case_file(client_id);
CREATE INDEX idx_case_lawyer          ON case_file(lawyer_id);
CREATE INDEX idx_task_assigned        ON task(assigned_to);
CREATE INDEX idx_task_case            ON task(case_id);
CREATE INDEX idx_invoice_client       ON invoice(client_id);
CREATE INDEX idx_payment_invoice      ON payment(invoice_id);
CREATE INDEX idx_notification_user    ON notification(user_id);

-- Dates (tri et filtres temporels)
CREATE INDEX idx_calendar_start       ON calendar_event(start_datetime);
CREATE INDEX idx_task_due_date        ON task(due_date);
CREATE INDEX idx_case_created         ON case_file(created_at DESC);
CREATE INDEX idx_invoice_due          ON invoice(due_date);
```

---

### Étape 6 — Désactiver RLS sur toutes les tables

> **Pourquoi ?** Le backend utilise un JWT custom (pas Supabase Auth). La fonction `auth.uid()` de Supabase ne reconnaît pas nos tokens. L'autorisation est entièrement gérée dans le code Python via les guards RBAC.

```sql
ALTER TABLE firm                    DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscription            DISABLE ROW LEVEL SECURITY;
ALTER TABLE app_user                DISABLE ROW LEVEL SECURITY;
ALTER TABLE firm_branding           DISABLE ROW LEVEL SECURITY;
ALTER TABLE lawyer                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE client                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE case_file               DISABLE ROW LEVEL SECURITY;
ALTER TABLE case_team               DISABLE ROW LEVEL SECURITY;
ALTER TABLE case_timeline           DISABLE ROW LEVEL SECURITY;
ALTER TABLE document                DISABLE ROW LEVEL SECURITY;
ALTER TABLE note                    DISABLE ROW LEVEL SECURITY;
ALTER TABLE task                    DISABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_event          DISABLE ROW LEVEL SECURITY;
ALTER TABLE invoice                 DISABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_item            DISABLE ROW LEVEL SECURITY;
ALTER TABLE payment                 DISABLE ROW LEVEL SECURITY;
ALTER TABLE notification            DISABLE ROW LEVEL SECURITY;
ALTER TABLE ai_session              DISABLE ROW LEVEL SECURITY;
ALTER TABLE ai_summary              DISABLE ROW LEVEL SECURITY;
ALTER TABLE login_history           DISABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences DISABLE ROW LEVEL SECURITY;
```

---

### Étape 7 — Créer les buckets Storage

**Bucket `documents` (upload avocat/client) :**

1. Supabase Dashboard → **Storage** → **New Bucket** → nom : `documents` → Public ✓

**Bucket `avatars` (photos de profil) :**

1. Supabase Dashboard → **Storage** → **New Bucket** → nom : `avatars` → Public ✓

```sql
-- Autoriser le service role à tout faire dans les deux buckets
CREATE POLICY "service_role_full_access_documents"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'documents');

CREATE POLICY "service_role_full_access_avatars"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'avatars');

-- Lecture publique
CREATE POLICY "public_read_documents"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'documents');

CREATE POLICY "public_read_avatars"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'avatars');
```

---

## 6. Scheduler — Rappels automatiques par email

### Fichier `app/core/scheduler.py`

Le scheduler tourne en arrière-plan grâce à **APScheduler** (démarré via `lifespan` dans `main.py`). Il vérifie chaque minute les événements calendrier qui approchent et envoie un email de rappel à l'avocat créateur.

**Fenêtres de rappel :**

| Offset | Déclenchement |
|--------|--------------|
| 30 min | 30 minutes avant le début de l'événement |
| 60 min | 1 heure avant |
| 1440 min | 1 jour avant |

**Mécanisme anti-doublon :**  
Un `set` en mémoire `_sent: set[tuple(event_id, offset)]` empêche d'envoyer deux fois le même rappel. Ce set se réinitialise au redémarrage du serveur.

**Flow :**
```
Chaque minute :
  pour chaque offset (30, 60, 1440 min) :
    → Calcule la fenêtre ±1 min autour de (now + offset)
    → Requête calendar_event dans cette fenêtre
    → Pour chaque event non encore envoyé :
        → Récupère l'email et le nom du created_by (app_user)
        → Appelle send_event_reminder_email()
        → Marque (event_id, offset) comme envoyé
```

**Dépendance :** `apscheduler` (`pip install apscheduler`)

---

## 7. Application Mobile — React Native / Expo

### 7.1 Stack technique

| Composant | Technologie |
|-----------|-------------|
| Framework | React Native (Expo SDK 54) |
| Navigation | Navigation par état (useState) — single-file architecture |
| Icônes | `@expo/vector-icons` (FontAwesome5, FontAwesome, Ionicons) |
| HTTP | `fetch()` natif avec token JWT Bearer + auto-refresh sur 401 |
| Auth | JWT stocké via `SecureStore` (`expo-secure-store`) |
| OAuth | `expo-web-browser` + Supabase Auth (implicit flow) + `expo-apple-authentication` |
| SafeArea | `react-native-safe-area-context` |
| Calendrier | Composant custom `CalendarStrip` (bande de 7 jours) |
| Upload | `FormData` multipart pour documents et photos |
| Biométrie | `expo-local-authentication` (Face ID / Touch ID) |
| Date picker | `@react-native-community/datetimepicker` |

### 7.2 Authentification OAuth — Architecture

Le login social (Google, Microsoft, Apple) fonctionne en 3 étapes :

```
1. Mobile → supabase.auth.signInWithOAuth({ provider, redirectTo, skipBrowserRedirect: true })
   → Reçoit l'URL d'autorisation Supabase OAuth

2. Mobile → WebBrowser.openAuthSessionAsync(oauthUrl, redirectTo)
   → Ouvre le browser système (ASWebAuthenticationSession sur iOS)
   → L'utilisateur choisit son compte sur la page Google/Microsoft
   → Supabase redirige vers exp://... avec #access_token=... (implicit flow)
   → WebBrowser intercepte la redirection et retourne result.url

3. Mobile → Parse result.url pour extraire params.access_token
   → authAPI.oauthLogin('supabase', supabaseToken, 'access_token')
   → Backend vérifie le token auprès de Supabase /auth/v1/user
   → Retourne JWT LegalHub → signIn()
```

**Pourquoi Supabase comme intermédiaire ?**  
Expo Go utilise le bundle ID `host.exp.Exponent` (pas `com.legalhub.mobile`). Les credentials OAuth natifs (iOS/Android) ne fonctionnent pas. Supabase OAuth avec redirection `exp://` contourne cette limitation.

**Pourquoi implicit flow (pas PKCE) ?**  
Le `code_verifier` PKCE est stocké dans SecureStore async. Lors du retour du browser, le contexte JS est suspendu et le verifier est perdu → erreur "both auth code and code verifier should be non-empty". L'implicit flow retourne l'`access_token` directement dans le hash de l'URL sans besoin de verifier.

**Apple Sign In :**  
Utilise `expo-apple-authentication` (natif iOS uniquement). Le `identityToken` JWT est envoyé directement au backend (`/api/auth/oauth/token` avec `provider: "apple"`).

### 7.3 Fichier `supabase/supabase.js`

```javascript
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const ExpoSecureStoreAdapter = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'implicit',   // évite la perte du code_verifier PKCE en Expo Go
    },
  }
);
```

### 7.4 Structure des écrans

```
legalhub-mobile/
├── supabase/
│   └── supabase.js              # Client Supabase (implicit flow, SecureStore)
│
├── context/
│   ├── AuthContext.js           # JWT storage, refresh automatique, getStoredToken
│   └── AppPrefsContext.js       # Préférences utilisateur (thème, langue)
│
├── services/
│   └── api.js                   # Toutes les fonctions API — 14 namespaces
│
└── screens/
    ├── AuthScreen.js            # Login / Inscription / Reset password / 2FA / OAuth Social
    ├── HomeScreen.js            # Dashboard principal (stats + QuickAdd + navigation)
    ├── QuickAddScreen.js        # Écran de création rapide (4 formulaires)
    │
    ├── Cases/
    │   ├── AddCaseScreen.js     # Création dossier (autocomplete client + avocat, calendar strip)
    │   ├── CaseDetailsScreen.js # Détail dossier (onglets : Overview, Documents, Timeline, Team)
    │   ├── CaseManagement.js    # Gestion des dossiers
    │   └── AllCasesScreen.js    # Liste complète des dossiers
    │
    ├── Clients/
    │   ├── AddClientScreen.js            # Formulaire ajout client
    │   ├── ClientDetailsScreen.js        # Détail d'un client
    │   └── ClientsManagementScreen.js    # Liste et gestion des clients
    │
    ├── Documents/
    │   ├── DocumentsScreen.js       # Documents liés à un dossier
    │   ├── UploadDocumentScreen.js  # Upload de document (multipart)
    │   └── AllDocumentsScreen.js    # Liste complète des documents
    │
    ├── TasksNotes/
    │   ├── AddTaskScreen.js              # Création tâche (calendrier, membres réels, enum catégorie)
    │   ├── AddNoteScreen.js              # Création note (autocomplete dossier, formatage inline)
    │   ├── TasksNotesManagementScreen.js # Gestion tâches & notes
    │   ├── AllTasksScreen.js             # Liste complète des tâches
    │   └── VoiceNoteScreen.js            # Enregistrement note vocale (Whisper STT + GPT-4o)
    │
    ├── Schedule/
    │   ├── ScheduleScreen.js     # Agenda avec CalendarStrip + liste événements
    │   ├── AllScheduleScreen.js  # Vue complète de l'agenda
    │   └── EventDetailsScreen.js # Détail d'un événement
    │
    ├── AI/
    │   └── AIAssistantScreen.js  # Assistant IA conversationnel (GPT-4o)
    │
    ├── Invoices/
    │   ├── InvoiceScreen.js             # Création/édition facture
    │   ├── InvoiceDetailsScreen.js      # Détail d'une facture
    │   └── InvoicesManagementScreen.js  # Gestion des factures
    │
    ├── Notifications/
    │   └── NotificationsScreen.js  # Notifications in-app
    │
    ├── Profile/
    │   └── ProfileScreen.js  # Profil utilisateur, préférences, 2FA, biométrie
    │
    ├── Calender/
    │   └── CalendarScreen.js  # Vue calendrier mensuelle
    │
    └── Client/                  # Écrans réservés au rôle CLIENT
        ├── ClientDashboard.js
        ├── ClientCasesScreen.js
        ├── ClientCaseDetailScreen.js
        ├── ClientInvoicesScreen.js
        ├── ClientInvoiceDetailScreen.js
        ├── ClientDocumentsScreen.js
        ├── ClientAppointmentsScreen.js
        ├── ClientActivityScreen.js
        ├── ClientNotificationsScreen.js
        ├── ClientSettingsScreen.js
        └── ClientProfileScreen.js
```

### 7.5 Fichier `services/api.js` — Namespaces

| Namespace | Méthodes principales |
|-----------|---------------------|
| `authAPI` | login, **oauthLogin**, registerFirm, refresh, logout, me, forgotPassword, resetPassword, validateOfficeCode, inviteLawyer, inviteClient, acceptInvite, setup2FA, verify2FA, login2FA, updateMe, uploadAvatar, changePassword, loginHistory, getNotifPreferences, updateNotifPreferences |
| `dashboardAPI` | stats, today, recentCases, **recentActivity** |
| `casesAPI` | list, create, getById, update, updateStatus, **restore**, archive, getTimeline, getTeam, addTeamMember, removeTeamMember, getByClient |
| `clientsAPI` | list, create, getById, update, delete, invite, getCases, getInvoices |
| `documentsAPI` | list, getById, delete, updateStatus, share, summarize, upload (multipart), uploadVoice (multipart), **voiceNoteAI**, **voiceNoteConfirm**, **createRequest**, **listRequests**, **cancelRequest** |
| `billingAPI` | listInvoices, createInvoice, getInvoice, updateInvoice, **deleteInvoice**, sendInvoice, sendReminder, getAnalytics |
| `calendarAPI` | listEvents, createEvent, updateEvent, deleteEvent, testReminder |
| `tasksAPI` | list, create, update, updateStatus, delete |
| `notesAPI` | list, create, update, delete |
| `firmAPI` | getProfile, updateProfile, getTeam, updateMemberRole, removeMember, getSubscription, getBranding, updateBranding, getOfficeCode |
| `paymentsAPI` | stripeCreate, stripeConfirm, sadadInitiate |
| `aiAPI` | summarize, draftContract, suggestActions, caseAssistant, getHistory |
| `notificationsAPI` | list, **unreadCount**, markAllRead, **markOneRead**, **createTest** |
| `clientPortalAPI` | dashboard, cases, caseDetail, invoices, invoiceDetail, **payInvoice**, documents, **uploadDocument**, **documentRequests**, **fulfillRequest**, appointments, **requestMeeting**, profile, activity |

> **En gras** = méthodes ajoutées depuis la version précédente du rapport.

### 7.6 Pattern authentification — `AuthContext.js`

```
Login :
  POST /api/auth/login
  → access_token (15 min) + refresh_token (7 jours)
  → Stockés dans SecureStore

Chaque requête :
  → getStoredToken() → header "Authorization: Bearer <token>"

Sur 401 :
  → tryRefresh() : POST /api/auth/refresh
  → Si succès → storeTokens() + retry de la requête originale
  → Si échec → l'utilisateur est redirigé vers le login
```

### 7.7 Composants réutilisables

| Composant | Description | Utilisé dans |
|-----------|-------------|-------------|
| `CalendarStrip` | Bande de 7 jours horizontale (amber), navigation semaine précédente/suivante | AddCaseScreen, AddTaskScreen, ScheduleScreen |
| `AutocompleteField` | Champ texte avec dropdown, recherche debounced (300ms) via API | AddCaseScreen (client/avocat), AddTaskScreen (dossier), AddNoteScreen |
| `ToggleRow` | Ligne avec icône + titre + sous-titre + toggle switch | AddTaskScreen, AddNoteScreen |
| `RichText` | Rendu markdown inline (`**gras**`, `*italique*`, `__souligné__`) dans la preview | AddNoteScreen |

### 7.8 Variables d'environnement mobile (`.env`)

```env
EXPO_PUBLIC_SUPABASE_URL=https://ydzbgkblqnznbujzaple.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=...

# Google OAuth (console.cloud.google.com → Credentials)
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...      # iOS credential (bundle: host.exp.Exponent pour Expo Go)
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...      # Web Application credential (requis pour Supabase OAuth proxy)

# Microsoft OAuth (portal.azure.com → App registrations)
EXPO_PUBLIC_MICROSOFT_CLIENT_ID=...
```

**Configuration Supabase Dashboard requise :**
- Authentication → URL Configuration → Redirect URLs → ajouter `exp://**`
- Authentication → Providers → Google → coller les credentials Web Application
- Authentication → Providers → Azure → coller le client ID Microsoft

---

## 8. Corrections de bugs effectuées

### Bug 1 — Fuite de credentials Supabase dans les logs
**Fichier :** `app/core/database.py`  
**Problème :** 3 instructions `print()` affichaient les clés Supabase en clair dans la console.  
**Fix :** Remplacé par `logger.info()` sans valeurs sensibles.

---

### Bug 2 — Utilisation incorrecte de `biometric_token` pour reset password
**Fichier :** `app/routers/auth.py` — `forgot_password()`  
**Problème :** Le token de réinitialisation de mot de passe était stocké dans la colonne `biometric_token` destinée à l'authentification biométrique mobile.  
**Fix :** Utilisation de colonnes dédiées `password_reset_token` + `password_reset_expires_at` avec expiry de 1 heure. Vérification de l'expiry dans `reset_password()`.

---

### Bug 3 — Conflit de routes dans billing.py (FastAPI route ordering)
**Fichier :** `app/routers/billing.py`  
**Problème :** `GET /api/invoices/analytics/summary` était déclaré **après** `GET /api/invoices/{invoice_id}`. FastAPI interprétait "analytics" comme un `invoice_id`, retournant 404.  
**Fix :** Route `/analytics/summary` déplacée en premier, avant toute route paramétrique.  
**Règle appliquée partout :** Les routes statiques doivent toujours être déclarées AVANT les routes avec paramètres `/{id}`.

---

### Bug 4 — `user_id` en query param au lieu de body JSON
**Fichier :** `app/routers/cases.py` — `add_team_member()`  
**Problème :** `user_id` était un query param (`?user_id=...`), incompatible avec les requêtes POST depuis le frontend.  
**Fix :** Ajout du modèle Pydantic `AddTeamMemberRequest(user_id: str)` pour recevoir un body JSON.

---

### Bug 5 — Mauvais ID dans `invite_client` (app_user.id vs lawyer.id)
**Fichier :** `app/routers/auth.py` — `invite_client()`  
**Problème :** `assigned_lawyer_id` recevait `current_user["id"]` (= `app_user.id`) mais la colonne référence `lawyer.id` (table séparée).  
**Fix :**
```python
lawyer_result = supabase.table("lawyer").select("id").eq("user_id", current_user["id"]).execute()
lawyer_id = lawyer_result.data[0]["id"]
```
**Règle générale :** `app_user.id ≠ lawyer.id`. Toujours résoudre via `lawyer.user_id = app_user.id`.

---

### Bug 6 — Timestamps invalides avec `"now()"`
**Fichier :** Plusieurs routers  
**Problème :** Certains endroits utilisaient la string `"now()"` pour les timestamps, qui n'est pas interprétée par Supabase Python client.  
**Fix :** Remplacé partout par `datetime.now(timezone.utc).isoformat()`.

---

### Bug 7 — Valeur enum `task_category` rejetée par PostgreSQL
**Contexte :** Mobile — `AddTaskScreen.js`  
**Problème :** Le frontend envoyait le label d'affichage `"Research"` au lieu de la valeur enum PostgreSQL `"RESEARCH"`. PostgreSQL rejetait avec HTTP 500.  
**Fix :** Conversion des catégories en objets `{ label, key }` :
```js
const CATEGORIES = [
  { label: 'Research',        key: 'RESEARCH'     },
  { label: 'Court Filing',    key: 'COURT_FILING'  },
  { label: 'Document Review', key: 'DOC_REVIEW'    },
];
```
**Règle générale :** Les labels UI ne doivent jamais être envoyés directement à un endpoint attendant une valeur enum PostgreSQL.

---

### Bug 8 — OAuth Google : erreur 400 "invalid_request" (mauvais type de credential)
**Contexte :** Mobile OAuth Google sur iPhone via Expo Go  
**Problème :** Un credential de type "Web Application" ou "iOS" standard ne fonctionne pas dans Expo Go car le bundle ID est `host.exp.Exponent` (pas `com.legalhub.mobile`).  
**Fix :** Remplacement de l'approche native (`expo-auth-session` avec Google credentials directs) par Supabase OAuth comme intermédiaire. Le mobile ouvre l'URL Supabase OAuth → Supabase gère le flow Google → retourne l'`access_token` Supabase dans l'URL de redirection.

---

### Bug 9 — "Safari ne peut pas ouvrir la page" (mauvais scheme de redirection)
**Contexte :** Mobile OAuth — redirection après authentification Google  
**Problème :** `makeRedirectUri({ scheme: 'legalhub' })` et `makeRedirectUri()` retournaient `legalhub://` (depuis `app.json`), scheme non enregistré dans Expo Go. iOS ouvrait Safari qui ne pouvait pas résoudre l'URL.  
**Fix :** Utilisation de `Linking.createURL('auth/callback')` qui retourne `exp://192.168.x.x/...` en Expo Go (scheme `exp://` reconnu par l'app Expo Go). Ce scheme doit aussi être déclaré dans Supabase Dashboard → Redirect URLs.

---

### Bug 10 — PKCE : "both auth code and code verifier should be non-empty"
**Contexte :** Mobile OAuth — échange du code PKCE contre une session  
**Problème :** Le `code_verifier` PKCE est stocké par `@supabase/supabase-js` dans SecureStore (async). Lors du retour depuis le browser, le contexte JS reprend mais le `code_verifier` est introuvable → Supabase rejette l'échange.  
**Fix :** Passage en `flowType: 'implicit'` dans le client Supabase. En implicit flow, Supabase retourne l'`access_token` directement dans le fragment `#` de l'URL de redirection, sans besoin d'échange de code :
```javascript
// Extraction du token depuis le fragment URL
const fragment = result.url.includes('#') ? result.url.split('#')[1] : '';
const params = Object.fromEntries(
  fragment.split('&').filter(Boolean).map(p => {
    const [k, ...v] = p.split('=');
    return [decodeURIComponent(k), decodeURIComponent(v.join('='))];
  })
);
const supabaseToken = params.access_token;
```

---

## 9. Configuration & Lancement

### Fichier `.env` backend

```env
# ── Supabase (récupérer dans Dashboard → Project Settings → API) ──
SUPABASE_URL=https://XXXXXXXXXXXXXXXX.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ── JWT ──────────────────────────────────────────────────────────
SECRET_KEY=ton-secret-jwt-minimum-32-caracteres-aleatoires-ici
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
REFRESH_TOKEN_EXPIRE_DAYS=7

# ── App ──────────────────────────────────────────────────────────
FRONTEND_URL=http://localhost:3000
APP_NAME=LegalHub

# ── OpenAI (pour IA + Whisper) ───────────────────────────────────
OPENAI_API_KEY=sk-...

# ── Stripe (paiements internationaux) ───────────────────────────
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# ── Email (optionnel) ────────────────────────────────────────────
SENDGRID_API_KEY=SG...
FROM_EMAIL=noreply@legalhub.com

# ── SMS (optionnel) ──────────────────────────────────────────────
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
```

### Installation des dépendances

```bash
pip install fastapi uvicorn supabase python-jose[cryptography] bcrypt \
            pydantic[email] pydantic-settings python-multipart \
            openai stripe pyotp python-dotenv httpx apscheduler
```

### Lancement du serveur

```bash
# Développement (avec rechargement automatique)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Production
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

### Accès à la documentation interactive

| URL | Description |
|-----|-------------|
| `http://localhost:8000/docs` | Swagger UI — tester tous les endpoints |
| `http://localhost:8000/redoc` | ReDoc — documentation lisible |
| `http://localhost:8000/health` | Health check |

---

## Récapitulatif global

### Backend (FastAPI)

| Catégorie | Détails |
|-----------|---------|
| **Routers** | 13 au total (auth, cases, clients, documents, billing, calendar, tasks, firm, payments, dashboard, ai, notifications, client_portal) |
| **Endpoints API** | ~80 endpoints couvrant tous les domaines métier |
| **OAuth Social Login** | Google + Microsoft (via Supabase Auth intermédiaire) + Apple (natif iOS) |
| **Tables DB** | 19 tables principales + 2 tables de migration (login_history, notification_preferences) |
| **Types ENUM PostgreSQL** | 22 enums pour toutes les valeurs métier |
| **Index DB** | ~25 index pour les requêtes fréquentes |
| **Bugs corrigés** | 10 bugs (sécurité, routing, données, enum mobile, OAuth) |
| **Scheduler** | APScheduler — rappels email 30 min / 1h / 1 jour avant événement |
| **Intégrations IA** | GPT-4o (résumé doc, rédaction contrat, assistant dossier, suggestions, analyse voice note) + Whisper (transcription vocale) |
| **Paiements** | Stripe PaymentIntent + Sadad (Gulf) + webhooks automatiques |
| **Multi-tenancy** | Isolation complète par `firm_id` sur toutes les tables |
| **Sécurité** | JWT custom HS256 (access 15 min + refresh 7 jours) + RBAC 3 niveaux + bcrypt |

### Application Mobile (React Native / Expo SDK 54)

| Catégorie | Détails |
|-----------|---------|
| **Écrans** | 39 écrans couvrant tous les modules |
| **Rôles supportés** | LAWYER / FIRM_ADMIN (écrans principaux) + CLIENT (portail dédié 11 écrans) |
| **OAuth** | Google + Microsoft via Supabase OAuth (implicit flow) + Apple natif (expo-apple-authentication) |
| **Namespaces API** | 14 namespaces dans `services/api.js` (100% des endpoints backend couverts) |
| **Auto-refresh JWT** | Transparent côté mobile — retry automatique sur 401 |
| **Formatage notes** | Éditeur markdown inline avec toggle gras/italique/souligné + détection de contexte |
| **Composants réutilisables** | CalendarStrip, AutocompleteField (debounce 300ms), ToggleRow, RichText |
| **Upload** | Documents PDF + notes vocales (multipart/form-data) + upload client depuis portail |
| **Biométrie** | Face ID / Touch ID via expo-local-authentication |

---

*Document mis à jour le 12/05/2026 — LegalHub v2.1 (Backend FastAPI + Mobile React Native/Expo SDK 54)*
