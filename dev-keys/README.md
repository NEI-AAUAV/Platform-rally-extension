This directory contains the **development** private and public keys used to sign and verify JWTs for the Rally extension.

> ⚠️ Do not use in production!

## Files:
- `jwt.key` - **PRIVATE KEY** (not tracked in git for security)
- `jwt.key.pub` - **PUBLIC KEY** (safe to share, tracked in git)

## Key Generation:
1. Generate a private key:
```bash
openssl ecparam -genkey -name secp521r1 -noout -out jwt.key
```

2. Extract the public key from the private key:
```bash
openssl ec -in jwt.key -pubout -out jwt.key.pub
```

## Security Note:
The private key (`jwt.key`) is excluded from version control via `.gitignore` to prevent accidental exposure. Only the public key (`jwt.key.pub`) is tracked in git as it's safe to share publicly.
