import { Configuration, PublicClientApplication } from '@azure/msal-browser';

// Azure AD configuration for Teams SSO
export const msalConfig: Configuration = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_AZURE_CLIENT_ID!,
    authority: `https://login.microsoftonline.com/${process.env.NEXT_PUBLIC_AZURE_TENANT_ID}`,
    redirectUri: typeof window !== 'undefined' ? window.location.origin : 'https://172.16.16.107:3000',
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: true, // Set to true for IE11
  },
};

// Scopes for Microsoft Graph API
const rawScopes = process.env.NEXT_PUBLIC_GRAPH_SCOPES?.split(',') || [
  'https://graph.microsoft.com/User.Read',
  'https://graph.microsoft.com/User.ReadBasic.All',
  'https://graph.microsoft.com/People.Read',
  'https://graph.microsoft.com/Team.ReadBasic.All',
  'https://graph.microsoft.com/TeamsActivity.Send',
  'https://graph.microsoft.com/Chat.ReadWrite',
  'https://graph.microsoft.com/ChatMessage.Send',
  'https://graph.microsoft.com/TeamsAppInstallation.ReadWriteForUser',
  'https://graph.microsoft.com/Directory.Read.All',
  'https://graph.microsoft.com/ChannelMessage.Send',
];

// Clean scopes - remove https://graph.microsoft.com/ prefix for MSAL
const cleanedScopes = rawScopes.map(scope => 
  scope.trim().replace('https://graph.microsoft.com/', '')
);

export const loginRequest = {
  scopes: cleanedScopes,
};

// Silent request configuration
export const silentRequest = {
  scopes: loginRequest.scopes,
  account: null as any,
};

// Initialize MSAL instance
export const msalInstance = new PublicClientApplication(msalConfig);

// Ensure MSAL is initialized before any API calls
let msalInitPromise: Promise<void> | null = null;
export async function ensureMsalInitialized(): Promise<void> {
  if (!msalInitPromise) {
    msalInitPromise = msalInstance.initialize();
  }
  return msalInitPromise;
}

// Graph API base URL
export const GRAPH_API_ENDPOINT = 'https://graph.microsoft.com/v1.0';
