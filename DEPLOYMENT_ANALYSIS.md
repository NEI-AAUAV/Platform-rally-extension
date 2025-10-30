# Rally Extension - Deployment Analysis

Comprehensive analysis of Rally's deployment readiness as an independent extension.

---

## ✅ What's Good (Production-Ready)

### 1. **Production Dockerfiles** ✅
**API (Dockerfile.prod):**
- ✅ Multi-stage build (optimized size)
- ✅ Poetry export to requirements.txt
- ✅ Uses Gunicorn with Uvicorn workers
- ✅ Non-root user (tiangolo base image)
- ✅ Health check ready

**Web (Dockerfile.prod):**
- ✅ Multi-stage build
- ✅ Build-time OpenAPI generation
- ✅ Artifact-only final stage (scratch)
- ✅ Production-optimized (no source maps)

### 2. **Production Compose File** ✅
```yaml
compose.override.prod.yml:
- ✅ Uses GHCR images (ghcr.io/nei-aauav/api-rally)
- ✅ Proper environment variables
- ✅ Volume mounts for secrets (/deploy/keys/jwt.key.pub)
- ✅ restart: always policy
- ✅ Health checks on dependencies
```

### 3. **Platform Integration** ✅
```yaml
Platform/.github/workflows/deploy.yaml:
- ✅ Recognizes Rally as an extension
- ✅ Builds and pushes images to GHCR
- ✅ Calls manage-extensions.sh (syncs nginx)
- ✅ Handles submodule updates
```

### 4. **Manifest Completeness** ✅
- ✅ Required fields: name, version, api.port, web.port
- ✅ Scopes defined
- ✅ Navigation entries
- ✅ Dynamic visibility configuration

---

## 🚨 What's Missing (Critical for Independence)

### 1. **No Dedicated Deployment Workflow** ❌
**Problem:** Rally doesn't publish its own Docker images

**Current:** Platform's deploy.yaml builds Rally images
**Issue:** Rally can't be deployed independently of Platform

**What's needed:**
```yaml
# .github/workflows/publish-images.yml
name: Publish Docker Images

on:
  push:
    branches: [main]
    tags: ['v*']
  workflow_dispatch:

jobs:
  publish-api:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/nei-aauav/api-rally
          tags: |
            type=ref,event=branch
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=sha,prefix={{branch}}-
      
      - name: Build and push API
        uses: docker/build-push-action@v5
        with:
          context: ./api-rally
          file: ./api-rally/Dockerfile.prod
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
  
  publish-web:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    
    steps:
      # Similar to API, publishing web-rally image
      ...
```

**Why critical:** Currently Rally depends entirely on Platform for image publishing

---

### 2. **No Release Management** ❌
**Problem:** No versioning strategy or release workflow

**Missing:**
- Release workflow
- Changelog generation
- Semantic versioning tags
- GitHub releases

**What's needed:**
```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags: ['v*']

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          generate_release_notes: true
          files: |
            manifest.json
```

---

### 3. **No Environment-Specific Configs** ⚠️
**Problem:** No .env templates or deployment docs

**Missing:**
- `.env.production.example`
- Deployment runbook
- Rollback procedure
- Disaster recovery plan

**What's needed:**
```bash
# .env.production.example
ENV=production
POSTGRES_SERVER=db_pg
POSTGRES_PASSWORD=${SECURE_PASSWORD}
SECRET_KEY=${SECURE_SECRET}
JWT_PUBLIC_KEY_PATH=/jwt.key.pub

# Rally-specific
VOMIT_PENALTY=-10
DRINK_PENALTY_PER_PERSON=-2
EXTRA_SHOT_BONUS=1
```

---

### 4. **No Database Migration Strategy** ❌
**Problem:** No documented migration process for production

**Missing:**
- Alembic configuration
- Migration workflow
- Rollback strategy
- Schema versioning

**Current state:** Alembic in dependencies but not configured

**What's needed:**
```bash
# Database migration documentation
1. Generate migration: alembic revision --autogenerate -m "description"
2. Review migration file
3. Test on staging
4. Apply to production: alembic upgrade head
5. Rollback if needed: alembic downgrade -1
```

---

### 5. **No Production Deployment Documentation** ⚠️
**Problem:** No clear deployment instructions

**Missing:**
- How to deploy Rally standalone
- How to deploy with Platform
- Environment setup guide
- Troubleshooting guide

---

## ⚠️ Deployment Concerns

### 1. **Hardcoded Line in compose.override.prod.yml**
```yaml
web_nei:
  environment:
    ENABLE_GALA: 'True'  # ❌ Wrong! Should be ENABLE_RALLY
```
**This is a bug** - Rally's prod compose sets ENABLE_GALA instead of ENABLE_RALLY

### 2. **No Health Checks in Production Images**
```yaml
# Missing from compose.override.prod.yml:
api_rally:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8003/health"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 40s
```

### 3. **No Resource Limits**
```yaml
# Missing from compose.override.prod.yml:
api_rally:
  deploy:
    resources:
      limits:
        cpus: '1.0'
        memory: 512M
      reservations:
        cpus: '0.5'
        memory: 256M
```

### 4. **No Logging Configuration**
```yaml
# Missing from compose.override.prod.yml:
api_rally:
  logging:
    driver: "json-file"
    options:
      max-size: "10m"
      max-file: "3"
```

### 5. **No Secrets Management**
**Current:** Secrets passed as env vars
**Better:** Docker secrets or external secret management

```yaml
api_rally:
  secrets:
    - postgres_password
    - jwt_key
  environment:
    POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password

secrets:
  postgres_password:
    external: true
  jwt_key:
    external: true
```

---

## 📊 Deployment Readiness Score

| Aspect | Status | Score | Notes |
|--------|--------|-------|-------|
| **Docker Images** | ✅ Good | 9/10 | Production-optimized, multi-stage |
| **Compose Config** | ⚠️ Issues | 6/10 | Works but missing health/resources/logging |
| **Platform Integration** | ✅ Good | 9/10 | Fully integrated with Platform deploy |
| **Independent Deployment** | ❌ Missing | 2/10 | Can't deploy without Platform |
| **CI/CD** | ⚠️ Partial | 5/10 | Testing good, no image publishing |
| **Documentation** | ⚠️ Minimal | 4/10 | No deployment docs |
| **Database Migrations** | ❌ Missing | 1/10 | Alembic not configured |
| **Monitoring** | ❌ Missing | 1/10 | No health checks, metrics |
| **Secrets Management** | ⚠️ Basic | 5/10 | Env vars work but not secure |

**Overall Score: 5/10** - Works with Platform, but not production-ready as standalone extension

---

## 🎯 Recommendations by Priority

### 🚨 **Critical (Fix Before Next Deploy)**

1. **Fix compose.override.prod.yml bug**
   ```yaml
   web_nei:
     environment:
       ENABLE_RALLY: 'True'  # Fix: was ENABLE_GALA
   ```

2. **Add health checks**
   ```python
   # api-rally/app/main.py
   @app.get("/health")
   async def health(): 
       return {"status": "healthy"}
   ```

3. **Add resource limits to prod compose**
   - Prevent memory leaks from taking down server
   - Essential for production stability

### ⚡ **High Priority (This Sprint)**

4. **Create deployment workflow**
   - Publish Docker images to GHCR
   - Tag releases properly
   - Enable independent deployments

5. **Add deployment documentation**
   - DEPLOYMENT.md with step-by-step guide
   - Rollback procedures
   - Troubleshooting

6. **Configure Alembic migrations**
   - Initialize Alembic
   - Create initial migration
   - Document migration workflow

### 📚 **Medium Priority (Next Sprint)**

7. **Add monitoring & logging**
   - Structured logging
   - Log rotation
   - Metrics endpoints (Prometheus)

8. **Improve secrets management**
   - Docker secrets
   - Or integrate with Vault/AWS Secrets Manager

9. **Add staging environment**
   - Test deployments before production
   - Catch issues early

---

## 🚀 Quick Fix Script

```bash
#!/bin/bash
# quick-deployment-fixes.sh

echo "Applying critical deployment fixes..."

# 1. Fix compose bug
sed -i 's/ENABLE_GALA/ENABLE_RALLY/' compose.override.prod.yml

# 2. Add health check endpoint
cat >> api-rally/app/main.py << 'EOF'

@app.get("/health", tags=["health"])
async def health_check():
    return {"status": "healthy", "service": "rally-api"}
EOF

# 3. Add resource limits
cat >> compose.override.prod.yml << 'EOF'

# Resource limits
  api_rally:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
  
  web_rally:
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
        reservations:
          cpus: '0.25'
          memory: 128M
EOF

echo "✅ Critical fixes applied!"
echo "Next: Review changes and commit"
```

---

## 📝 Conclusion

**Rally's deployment as an extension:**

✅ **Good:** 
- Works within Platform ecosystem
- Production Dockerfiles are solid
- Integrated with Platform's deploy workflow

❌ **Critical Issues:**
- Can't deploy independently
- Missing health checks
- No database migrations
- Missing deployment documentation
- Bug in prod compose (ENABLE_GALA vs ENABLE_RALLY)

**Verdict:** Rally is **70% ready** for Platform deployments but **only 30% ready** as an independent extension.

**Recommended Action:** Fix the 3 critical issues first (compose bug, health checks, resource limits), then work on independence (deployment workflow, migrations, docs).

