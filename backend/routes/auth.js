const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Environment variables (should be in .env file)
const CLIENT_ID = process.env.AZURE_CLIENT_ID || '8682d5f9-bab2-45ba-b578-d7f7ab832120';
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET; // You need to set this
const TENANT_ID = process.env.AZURE_TENANT_ID || '7f41171f-7d35-40fc-82ab-0d5052e3d09a';

/**
 * Exchange Teams SSO token for Microsoft Graph token using On-Behalf-Of flow
 */
router.post('/token', async (req, res) => {
  try {
    const { token: ssoToken } = req.body;
    
    if (!ssoToken) {
      return res.status(400).json({ error: 'SSO token is required' });
    }

    if (!CLIENT_SECRET) {
      return res.status(500).json({ error: 'Azure client secret not configured' });
    }

    // Validate the incoming SSO token (optional but recommended)
    try {
      const decoded = jwt.decode(ssoToken, { complete: true });
      console.log('SSO Token info:', {
        audience: decoded.payload.aud,
        scopes: decoded.payload.scp,
        appId: decoded.payload.appid
      });
    } catch (decodeError) {
      console.log('Could not decode token for validation:', decodeError.message);
    }

    // Exchange SSO token for Graph token using OBO flow
    const oboRequest = {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      assertion: ssoToken,
      requested_token_use: 'on_behalf_of',
      scope: 'https://graph.microsoft.com/User.Read https://graph.microsoft.com/User.ReadBasic.All'
    };

    const tokenEndpoint = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
    
    const response = await axios.post(tokenEndpoint, new URLSearchParams(oboRequest), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (response.data.access_token) {
      console.log('✅ Successfully exchanged SSO token for Graph token');
      res.json({
        access_token: response.data.access_token,
        expires_in: response.data.expires_in,
        scope: response.data.scope
      });
    } else {
      console.error('No access token in OBO response:', response.data);
      res.status(500).json({ error: 'Failed to obtain Graph token' });
    }

  } catch (error) {
    console.error('Token exchange error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Token exchange failed',
      details: error.response?.data || error.message
    });
  }
});

/**
 * Get current user using Graph token obtained via OBO flow
 */
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' });
    }

    const ssoToken = authHeader.substring(7);

    // First exchange SSO token for Graph token
    const oboRequest = {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      assertion: ssoToken,
      requested_token_use: 'on_behalf_of',
      scope: 'https://graph.microsoft.com/User.Read'
    };

    const tokenEndpoint = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
    
    const tokenResponse = await axios.post(tokenEndpoint, new URLSearchParams(oboRequest), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (!tokenResponse.data.access_token) {
      throw new Error('Failed to obtain Graph token');
    }

    // Use the Graph token to get user info
    const userResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${tokenResponse.data.access_token}`
      }
    });

    res.json(userResponse.data);

  } catch (error) {
    console.error('Get user error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to get user information',
      details: error.response?.data || error.message
    });
  }
});

/**
 * Search users using Graph token obtained via OBO flow
 */
router.get('/users/search', async (req, res) => {
  try {
    const { q: query } = req.query;
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' });
    }

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const ssoToken = authHeader.substring(7);

    // Exchange SSO token for Graph token
    const oboRequest = {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      assertion: ssoToken,
      requested_token_use: 'on_behalf_of',
      scope: 'https://graph.microsoft.com/User.ReadBasic.All'
    };

    const tokenEndpoint = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
    
    const tokenResponse = await axios.post(tokenEndpoint, new URLSearchParams(oboRequest), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (!tokenResponse.data.access_token) {
      throw new Error('Failed to obtain Graph token');
    }

    // Search users with the Graph token
    const searchQuery = encodeURIComponent(`"${query}"`);
    const searchResponse = await axios.get(
      `https://graph.microsoft.com/v1.0/users?$search=${searchQuery}&$select=id,displayName,mail,userPrincipalName,jobTitle,department&$top=20`,
      {
        headers: {
          'Authorization': `Bearer ${tokenResponse.data.access_token}`,
          'ConsistencyLevel': 'eventual'
        }
      }
    );

    res.json(searchResponse.data);

  } catch (error) {
    console.error('User search error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'User search failed',
      details: error.response?.data || error.message
    });
  }
});

module.exports = router;
