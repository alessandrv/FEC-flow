# HTTPS Configuration for Next.js App

This document explains how to run the Next.js frontend with HTTPS using the SSL certificates.

## Prerequisites

Ensure you have the SSL certificates in the `certificates/` directory:
- `server.crt` - SSL certificate
- `server.key` - Private key

## Running with HTTPS

### Development Mode
```bash
npm run dev
```
This will start the app on `https://localhost:3000` using the custom HTTPS server.

### HTTP Mode (fallback)
If you need to run without HTTPS:
```bash
npm run dev:http
```

### Production Mode with HTTPS
```bash
npm run build
npm run start:https
```

## Environment Variables

The frontend is now configured to use HTTPS by default for the backend API.

If you need to override the API URL, create a `.env.local` file in the flow directory:

```bash
# Default (Network HTTPS backend)
NEXT_PUBLIC_API_URL=https://172.16.16.27:3001/api

# For local HTTPS backend
NEXT_PUBLIC_API_URL=https://localhost:3001/api

# For HTTP backend (if needed)
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

## Files Modified

1. **server.js** - Custom HTTPS server for Next.js
2. **package.json** - Updated scripts for HTTPS support
3. **next.config.js** - Fixed configuration structure

## Browser Security

When accessing `https://localhost:3000`, your browser may show a security warning because of the self-signed certificate. You can:
1. Click "Advanced" and then "Proceed to localhost (unsafe)"
2. Or add the certificate to your browser's trusted certificates

## Backend HTTPS

The backend is now configured to use HTTPS by default:

### Running Backend with HTTPS
```bash
cd backend
npm run dev
```
This will start the backend API on:
- Network access: `https://172.16.16.27:3001`
- Local access: `https://localhost:3001`

The backend now listens on all network interfaces (0.0.0.0), allowing access from other devices on the network.

### Backend Files Modified
1. **backend/server.js** - Now uses HTTPS with SSL certificates
2. **backend/package.json** - Added HTTPS scripts
3. **backend/certificates/** - Contains copied SSL certificates

## Network Configuration

### Backend Network Access
The backend is configured to:
- Listen on all network interfaces (`0.0.0.0:3001`)
- Accept CORS requests from both `localhost` and `172.16.16.27`
- Provide network access via `https://172.16.16.27:3001`

### Frontend Network Access
- Frontend connects to backend via `https://172.16.16.27:3001/api`
- Can be accessed by other devices on the network

## Troubleshooting

- **Certificate not found**: Ensure `server.crt` and `server.key` exist in the `certificates/` directory
- **Port conflicts**: Change the port in the server.js file if needed
- **CORS issues**: Update backend CORS configuration to allow HTTPS origin
- **Network access issues**: Ensure firewall allows connections on port 3001
- **IP address changes**: Update the IP address in `api.ts` and CORS configuration if your machine IP changes
