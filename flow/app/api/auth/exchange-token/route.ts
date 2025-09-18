import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token) {
      console.error('❌ No token provided in request');
      return NextResponse.json({ error: 'No token provided' }, { status: 400 });
    }

    console.log('🔄 Token exchange request received, token length:', token.length);
    
    // Debug: Decode the Teams token to see its claims
    try {
      const tokenParts = token.split('.');
      if (tokenParts.length === 3) {
        const payload = JSON.parse(atob(tokenParts[1]));
        console.log('🔍 Teams token payload:', {
          aud: payload.aud,
          iss: payload.iss,
          tid: payload.tid,
          appid: payload.appid,
          scp: payload.scp,
          exp: new Date(payload.exp * 1000).toISOString()
        });
        
        // Check if token is for our app
        const expectedAudience = `api://172.16.16.107:3000/${process.env.NEXT_PUBLIC_AZURE_CLIENT_ID}`;
        if (payload.aud !== expectedAudience) {
          console.log('⚠️ Token audience mismatch:', {
            expected: expectedAudience,
            actual: payload.aud
          });
        }
      }
    } catch (error) {
      console.log('❌ Could not decode Teams token:', error);
    }

    // Validate environment variables
    const clientId = process.env.NEXT_PUBLIC_AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;
    const tenantId = process.env.NEXT_PUBLIC_AZURE_TENANT_ID;
    const scopes = process.env.NEXT_PUBLIC_GRAPH_SCOPES;

    if (!clientId || !clientSecret || !tenantId) {
      console.error('❌ Missing environment variables:', {
        clientId: !!clientId,
        clientSecret: !!clientSecret,
        tenantId: !!tenantId,
        scopesPresent: !!scopes
      });
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Use On-Behalf-Of flow as per Microsoft documentation
    const tokenExchangeUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

    // IMPORTANT: Use Graph .default to leverage pre-consented delegated permissions
    const graphDefaultScope = 'https://graph.microsoft.com/.default';

    console.log('🔗 Making OBO token exchange request to:', tokenExchangeUrl);
    console.log('📋 Scopes requested:', graphDefaultScope);
    
    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    params.append('assertion', token);
    params.append('requested_token_use', 'on_behalf_of');
    params.append('scope', graphDefaultScope);

    console.log('📤 Request parameters:', {
      client_id: clientId,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      requested_token_use: 'on_behalf_of',
      scope: graphDefaultScope,
      assertion_length: token.length
    });

    const response = await fetch(tokenExchangeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    const responseText = await response.text();
    console.log('Token exchange response status:', response.status);
    console.log('Token exchange response:', responseText);

    if (!response.ok) {
      console.error('Token exchange failed with status:', response.status);
      console.error('Error response:', responseText);
      
      let errorDetails;
      try {
        errorDetails = JSON.parse(responseText);
      } catch {
        errorDetails = { error: responseText };
      }
      
      return NextResponse.json({ 
        error: 'Token exchange failed',
        details: errorDetails,
        status: response.status
      }, { status: 400 });
    }

    let tokenData;
    try {
      tokenData = JSON.parse(responseText);
    } catch (error) {
      console.error('Failed to parse token response:', error);
      return NextResponse.json({ error: 'Invalid token response' }, { status: 500 });
    }

    console.log('Token exchange successful, access token length:', tokenData.access_token?.length);

    // Decode the ID token to get user claims if available
    let userClaims = null;
    if (tokenData.id_token) {
      try {
        const idTokenPayload = JSON.parse(atob(tokenData.id_token.split('.')[1]));
        userClaims = idTokenPayload;
        console.log('User claims from ID token:', userClaims);
      } catch (error) {
        console.warn('Failed to decode ID token:', error);
      }
    }

    // Create account info for MSAL compatibility
    const accountInfo = {
      homeAccountId: userClaims?.oid ? `${userClaims.oid}.${tenantId}` : `unknown.${tenantId}`,
      environment: 'login.microsoftonline.com',
      tenantId: tenantId,
      username: userClaims?.preferred_username || userClaims?.upn || 'unknown',
      localAccountId: userClaims?.oid || 'unknown',
      name: userClaims?.name || 'Unknown User',
    };

    return NextResponse.json({
      access_token: tokenData.access_token,
      account: accountInfo,
    });
  } catch (error) {
    console.error('Error in token exchange:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
