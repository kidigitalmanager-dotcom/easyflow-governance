# UseEasy API Layer

Serverless API (Lambda + API Gateway) for UseEasy email governance.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/ai/ask` | AI email analysis via Bedrock Claude Sonnet |
| GET | `/limits` | Plan entitlements & usage counters |
| POST | `/drafts/gmail` | Create Gmail draft (via Google API) |
| POST | `/drafts/outlook` | Create Outlook draft (via Microsoft Graph) |

## Architecture

- **Runtime**: Node.js 20, arm64 Lambda
- **Region**: eu-central-1 (Frankfurt) – GDPR compliant
- **AI**: Amazon Bedrock (Anthropic Claude Sonnet)
- **Auth**: Shared API key (X-Api-Key header)
- **PII**: Email/phone/IBAN pseudonymization before LLM

## Local Development

```bash
cd api
cp .env.example .env  # edit API_KEY
npm install
npm run typecheck
npm run build
```

## Deploy

```bash
# First time
sam build && sam deploy --guided

# Subsequent
sam build && sam deploy
```

## Configuration

See `samconfig.toml` for deployment defaults.
Set `ApiKeyParam` to your actual API key before deploying.

## Auth Headers

All requests require:
- `X-Api-Key`: shared API key
- `X-Tenant-Id`: tenant domain (e.g., `useeasy.ai`)
- `X-User-Id`: user email
- `X-Plan`: `starter` | `team` | `scale` | `pro`
