import { Client } from '@microsoft/microsoft-graph-client';
import { AuthenticationProvider } from '@microsoft/microsoft-graph-client';
import { AccountInfo, SilentRequest } from '@azure/msal-browser';
import { msalInstance, loginRequest, silentRequest, ensureMsalInitialized } from '../config/auth';
import * as microsoftTeams from '@microsoft/teams-js';

export interface User {
  id: string;
  displayName: string;
  mail: string;
  userPrincipalName: string;
  givenName?: string;
  surname?: string;
  jobTitle?: string;
  department?: string;
  officeLocation?: string;
  businessPhones?: string[];
  mobilePhone?: string;
}

export interface Team {
  id: string;
  displayName: string;
  description?: string;
  webUrl?: string;
}

export interface Channel {
  id: string;
  displayName: string;
  membershipType?: string;
}

export interface PlannerPlan {
  id: string;
  title: string;
  owner?: string; // groupId
}

export interface PlannerBucket {
  id: string;
  name: string;
  planId: string;
}

class MsalAuthProvider implements AuthenticationProvider {
  private account: AccountInfo | null = null;

  constructor(account: AccountInfo | null) {
    this.account = account;
  }

  async getAccessToken(): Promise<string> {
    try {
      if (!this.account) {
        throw new Error('No account available');
      }

      const request: SilentRequest = {
        ...silentRequest,
        account: this.account,
      };

      const response = await msalInstance.acquireTokenSilent(request);
      return response.accessToken;
    } catch (error) {
      console.error('Error acquiring token silently:', error);
      throw error;
    }
  }
}

class GraphOboAuthProvider implements AuthenticationProvider {
  constructor(private getToken: () => Promise<string>) {}

  async getAccessToken(): Promise<string> {
    return await this.getToken();
  }
}

export class TeamsAuthService {
  private graphClient: Client | null = null;
  private account: AccountInfo | null = null;
  private isTeamsContext: boolean = false;

  constructor() {
    this.initializeTeams();
  }

  // Encode external reference URL as Planner expects for the references key
  private encodePlannerExternalReferenceUrl(url: string): string {
    return url.replace(/:/g, '%3A').replace(/\./g, '%2E').replace(/ /g, '%20');
  }

  private async initializeTeams() {
    try {
      await microsoftTeams.app.initialize();
      this.isTeamsContext = true;
      console.log('Teams context initialized');
    } catch (error) {
      console.log('Not running in Teams context:', error);
      this.isTeamsContext = false;
    }
  }

  async login(): Promise<AccountInfo> {
    try {
      if (this.isTeamsContext) {
        // Use Teams SSO
        return await this.loginWithTeamsSSO();
      } else {
        // Use popup login for web
        return await this.loginWithPopup();
      }
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  private async ssoExchange(options?: { silent?: boolean }): Promise<{ accessToken: string; account: AccountInfo | null }> {
    const silent = options?.silent ?? false;
    // Use Teams authentication with the correct Application ID URI as resource (scope is implied as access_as_user)
    const resource = `api://172.16.16.107:3005/${process.env.NEXT_PUBLIC_AZURE_CLIENT_ID}`;
    const authToken = await microsoftTeams.authentication.getAuthToken({
      resources: [resource],
      silent,
    });

    const response = await fetch('/api/auth/exchange-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: authToken }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Token exchange failed:', text);
      throw new Error('Token exchange failed');
    }

    const data = await response.json();
    return { accessToken: data.access_token, account: (data.account as AccountInfo) ?? null };
  }

  private initializeGraphClientWithObo(tokenGetter: () => Promise<string>) {
    this.graphClient = Client.initWithMiddleware({ authProvider: new GraphOboAuthProvider(tokenGetter) });
  }

  private async loginWithTeamsSSO(): Promise<AccountInfo> {
    try {
      // Ensure MSAL is initialized
      await ensureMsalInitialized();

      // Get Teams context
      await microsoftTeams.app.getContext();

      // In Teams, skip MSAL silent token to avoid AADSTS50058; use SSO OBO instead
      const { accessToken, account } = await this.ssoExchange({ silent: false });
      this.account = account;
      // Provide a token getter that refreshes via SSO OBO when needed
      this.initializeGraphClientWithObo(async () => {
        const { accessToken } = await this.ssoExchange({ silent: true });
        return accessToken;
      });
      return this.account as AccountInfo;
    } catch (error) {
      console.error('Teams SSO failed:', error);
      throw error;
    }
  }

  private async loginWithPopup(): Promise<AccountInfo> {
    try {
      const response = await msalInstance.loginPopup(loginRequest);
      this.account = response.account;
      this.initializeGraphClient();
      return this.account;
    } catch (error) {
      console.error('Popup login failed:', error);
      throw error;
    }
  }

  private initializeGraphClient() {
    if (this.account) {
      const authProvider = new MsalAuthProvider(this.account);
      this.graphClient = Client.initWithMiddleware({ authProvider });
    }
  }

  async logout(): Promise<void> {
    try {
      if (this.isTeamsContext) {
        // For Teams, just clear the local state
        this.account = null;
        this.graphClient = null;
      } else {
        await msalInstance.logoutPopup();
        this.account = null;
        this.graphClient = null;
      }
    } catch (error) {
      console.error('Logout failed:', error);
      throw error;
    }
  }

  getAccount(): AccountInfo | null {
    return this.account;
  }

  isLoggedIn(): boolean {
    return this.account !== null;
  }

  // New: indicate whether Graph client is ready (authenticated via MSAL or Teams SSO)
  isAuthenticated(): boolean {
    return this.graphClient !== null;
  }

  async autoLogin(): Promise<AccountInfo | null> {
    try {
      await ensureMsalInitialized();

      // Try to confirm Teams context on demand
      try {
        await microsoftTeams.app.initialize();
        await microsoftTeams.app.getContext();
        this.isTeamsContext = true;
      } catch {
        // not in Teams
        this.isTeamsContext = false;
      }

      if (this.isTeamsContext) {
        // Attempt silent Teams SSO without UI
        try {
          const { account } = await this.ssoExchange({ silent: true });
          this.account = account;
          this.initializeGraphClientWithObo(async () => {
            const { accessToken } = await this.ssoExchange({ silent: true });
            return accessToken;
          });
          return this.account;
        } catch (e) {
          console.log('Silent Teams SSO not available yet (consent or login required).');
          return null;
        }
      } else {
        // Browser (outside Teams): use cached MSAL account if present
        const accounts = msalInstance.getAllAccounts();
        if (accounts && accounts.length > 0) {
          this.account = accounts[0];
          this.initializeGraphClient();
          try {
            const req: SilentRequest = { ...silentRequest, account: this.account } as SilentRequest;
            await msalInstance.acquireTokenSilent(req);
          } catch (e) {
            console.log('Silent token acquisition failed; user interaction may be required.');
          }
          return this.account;
        }
        return null;
      }
    } catch (e) {
      console.error('Auto login failed:', e);
      return null;
    }
  }

  // Search for users in the organization
  async searchUsers(query: string, top: number = 25): Promise<User[]> {
    if (!this.graphClient) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await this.graphClient
        .api('/users')
        .header('ConsistencyLevel', 'eventual')
        .search(`"displayName:${query}" OR "mail:${query}" OR "userPrincipalName:${query}"`)
        .select('id,displayName,mail,userPrincipalName,givenName,surname,jobTitle,department,officeLocation,businessPhones,mobilePhone')
        .top(top)
        .get();

      return response.value;
    } catch (error) {
      console.error('Error searching users:', error);
      // Fallback to filter if search is not available
      try {
        const response = await this.graphClient
          .api('/users')
          .filter(`startswith(displayName,'${query}') or startswith(mail,'${query}') or startswith(userPrincipalName,'${query}')`)
          .select('id,displayName,mail,userPrincipalName,givenName,surname,jobTitle,department,officeLocation,businessPhones,mobilePhone')
          .top(top)
          .get();

        return response.value;
      } catch (filterError) {
        console.error('Error filtering users:', filterError);
        throw filterError;
      }
    }
  }

  // Get all users in the organization
  async getAllUsers(top: number = 100): Promise<User[]> {
    if (!this.graphClient) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await this.graphClient
        .api('/users')
        .select('id,displayName,mail,userPrincipalName,givenName,surname,jobTitle,department,officeLocation,businessPhones,mobilePhone')
        .top(top)
        .get();

      return response.value;
    } catch (error) {
      console.error('Error getting all users:', error);
      throw error;
    }
  }

  // Get user by ID
  async getUserById(userId: string): Promise<User> {
    if (!this.graphClient) {
      throw new Error('Not authenticated');
    }

    try {
      const user = await this.graphClient
        .api(`/users/${userId}`)
        .select('id,displayName,mail,userPrincipalName,givenName,surname,jobTitle,department,officeLocation,businessPhones,mobilePhone')
        .get();

      return user;
    } catch (error) {
      console.error('Error getting user by ID:', error);
      throw error;
    }
  }

  // Get current user
  async getCurrentUser(): Promise<User> {
    if (!this.graphClient) {
      throw new Error('Not authenticated');
    }

    try {
      const user = await this.graphClient
        .api('/me')
        .select('id,displayName,mail,userPrincipalName,givenName,surname,jobTitle,department,officeLocation,businessPhones,mobilePhone')
        .get();

      return user;
    } catch (error) {
      console.error('Error getting current user:', error);
      throw error;
    }
  }

  // Get user's teams
  async getUserTeams(): Promise<Team[]> {
    if (!this.graphClient) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await this.graphClient
        .api('/me/joinedTeams')
        .select('id,displayName,description,webUrl')
        .get();

      return response.value;
    } catch (error) {
      console.error('Error getting user teams:', error);
      throw error;
    }
  }

  // Search teams the user is a member of (client-side filter over joinedTeams)
  async searchTeams(query: string, top: number = 25): Promise<Team[]> {
    if (!this.graphClient) throw new Error('Not authenticated');
    try {
      const teams = await this.getUserTeams();
      const q = query.toLowerCase();
      const filtered = teams.filter(t => (t.displayName || '').toLowerCase().includes(q));
      return filtered.slice(0, top);
    } catch (error) {
      console.error('Error searching teams:', error);
      throw error;
    }
  }

  // Get channels for a team
  async getTeamChannels(teamId: string): Promise<Channel[]> {
    if (!this.graphClient) throw new Error('Not authenticated');
    try {
      const response = await this.graphClient
        .api(`/teams/${teamId}/channels`)
        .select('id,displayName,membershipType')
        .get();
      return response.value;
    } catch (error) {
      console.error('Error getting team channels:', error);
      throw error;
    }
  }

  // List Planner plans for a Group (Team)
  async getPlannerPlansForGroup(groupId: string): Promise<PlannerPlan[]> {
    if (!this.graphClient) throw new Error('Not authenticated');
    try {
      const response = await this.graphClient
        .api(`/groups/${groupId}/planner/plans`)
        .select('id,title,owner')
        .get();
      return response.value;
    } catch (error) {
      console.error('Error getting planner plans for group:', error);
      throw error;
    }
  }

  // Get Planner plans for a channel (currently shows team-level plans since Planner is team-scoped)
  async getPlannerPlansForChannel(teamId: string, channelId: string): Promise<PlannerPlan[]> {
    if (!this.graphClient) throw new Error('Not authenticated');
    try {
      // For now, just return team-level plans since Planner plans are team-scoped in Microsoft Graph
      // In the future, we could implement channel-specific filtering based on:
      // - Plans mentioned in channel conversations
      // - Plans pinned to channel
      // - Custom metadata/tags
      
      const teamPlans = await this.getPlannerPlansForGroup(teamId);
      
      // TODO: Add channel-specific filtering logic here when requirements are clearer
      return teamPlans;
      
    } catch (error) {
      console.error('Error getting planner plans for channel:', error);
      // Fallback to team-level plans
      return this.getPlannerPlansForGroup(teamId);
    }
  }

  // Create a Planner plan under a Group
  async createPlannerPlan(groupId: string, title: string): Promise<PlannerPlan> {
    if (!this.graphClient) throw new Error('Not authenticated');
    try {
      const plan = await this.graphClient
        .api('/planner/plans')
        .post({ owner: groupId, title });
      return plan;
    } catch (error) {
      console.error('Error creating planner plan:', error);
      throw error;
    }
  }

  // List buckets for a plan
  async getPlannerBuckets(planId: string): Promise<PlannerBucket[]> {
    if (!this.graphClient) throw new Error('Not authenticated');
    try {
      const response = await this.graphClient
        .api(`/planner/plans/${planId}/buckets`)
        .select('id,name,planId')
        .get();
      return response.value;
    } catch (error) {
      console.error('Error getting planner buckets:', error);
      throw error;
    }
  }

  // Create a bucket in a plan
  async createPlannerBucket(planId: string, name: string): Promise<PlannerBucket> {
    if (!this.graphClient) throw new Error('Not authenticated');
    try {
      const bucket = await this.graphClient
        .api('/planner/buckets')
        .post({ name, planId, orderHint: ' !' });
      return bucket;
    } catch (error) {
      console.error('Error creating planner bucket:', error);
      throw error;
    }
  }

  // Create a task in Planner
  async createPlannerTask(
    planId: string,
    bucketId: string,
    title: string,
    assigneeUserIds: string[],
    dueDateTime?: string,
    details?: { description?: string; openUrl?: string; openUrlAlias?: string },
    startDateTime?: string,
  ): Promise<any> {
    if (!this.graphClient) throw new Error('Not authenticated');
    try {
      const assignments = assigneeUserIds.reduce((acc: any, uid) => {
        // orderHint is required for each assignment entry; minimal valid payload
        acc[uid] = { '@odata.type': 'microsoft.graph.plannerAssignment', orderHint: ' !' };
        return acc;
      }, {} as Record<string, any>);

      const payload: any = {
        planId,
        bucketId,
        title,
      };
      if (assigneeUserIds && assigneeUserIds.length > 0) {
        payload.assignments = assignments;
      }
      if (dueDateTime) {
        try {
          const d = new Date(dueDateTime);
          if (!isNaN(d.getTime())) {
            // Normalize to end of day 23:59:59.000Z for clearer Planner UI
            d.setUTCHours(23, 59, 59, 0);
            payload.dueDateTime = d.toISOString();
          } else {
            payload.dueDateTime = dueDateTime;
          }
        } catch {
          payload.dueDateTime = dueDateTime;
        }
      }
      if (startDateTime) payload.startDateTime = startDateTime;

      if (process && process.env.NODE_ENV !== 'production') {
        console.log('[Planner] createPlannerTask payload', JSON.stringify(payload, null, 2));
      }

      const task = await this.graphClient
        .api('/planner/tasks')
        .post(payload);

      // Optionally update task details (description and a clickable reference link)
      if (details && (details.description || details.openUrl)) {
        try {
          // Fetch details to get ETag required for updates
          const currentDetails = await this.graphClient.api(`/planner/tasks/${task.id}/details`).get();
          // Fix up the weak ETag for If-Match header (use plain quoted value)
          const rawTag = currentDetails['@odata.etag'] || currentDetails['@odata.metadataEtag'] || currentDetails.etag || '*';
          const etag = String(rawTag).replace('W/"', '"').replace('\\"', '');
          const body: any = {};
          if (details.description) body.description = details.description;
          if (details.openUrl) {
            const encoded = this.encodePlannerExternalReferenceUrl(details.openUrl);
            body.references = {
              [encoded]: {
                '@odata.type': '#microsoft.graph.plannerExternalReference',
                alias: details.openUrlAlias || 'Open in Flow Creator',
                type: 'Other',
              },
            };
            // Ensure the task card preview uses the reference (visible on the board card)
            body.previewType = 'reference';
          }
          await this.graphClient
            .api(`/planner/tasks/${task.id}/details`)
            .header('If-Match', etag)
            .header('Prefer', 'return=representation')
            .patch(body);
        } catch (e) {
          console.warn('Failed to update task details:', e);
          try {
            // Fallback: append the URL in the description so it's still clickable in task
            if (details.openUrl) {
              const currentDetails = await this.graphClient.api(`/planner/tasks/${task.id}/details`).get();
              const rawTag2 = currentDetails['@odata.etag'] || currentDetails['@odata.metadataEtag'] || currentDetails.etag || '*';
              const etag2 = String(rawTag2).replace('W/"', '"').replace('\\"', '');
              const desc = (currentDetails.description || '') + `\n${details.openUrlAlias || 'Open in Flow Creator'}: ${details.openUrl}`;
              await this.graphClient
                .api(`/planner/tasks/${task.id}/details`)
                .header('If-Match', etag2)
                .header('Prefer', 'return=representation')
                .patch({ description: desc });
            }
          } catch (e2) {
            console.warn('Failed to set description fallback link:', e2);
          }
        }
      }

      return task;
    } catch (error) {
      console.error('Error creating planner task:', error);
      throw error;
    }
  }

  // Mark an existing Planner task as completed (percentComplete = 100)
  async completePlannerTask(taskId: string): Promise<any> {
    if (!this.graphClient) throw new Error('Not authenticated');
    try {
      // Get task to retrieve the ETag for concurrency control
      const getTaskAndEtag = async () => {
        const t = await this.graphClient!.api(`/planner/tasks/${taskId}`).get();
        const raw = t['@odata.etag'] || t['@odata.metadataEtag'] || t.etag || '*';
        const tag = String(raw).replace('W/"', '"').replace('\\"', '');
        return { t, tag };
      };

      const attemptPatch = async (match: string) => {
        return await this.graphClient!
          .api(`/planner/tasks/${taskId}`)
          .header('If-Match', match)
          .header('Prefer', 'return=representation')
          .patch({ percentComplete: 100 });
      };

      const { tag } = await getTaskAndEtag();
      try {
        return await attemptPatch(tag);
      } catch (e1) {
        console.warn('First attempt to complete Planner task failed, retrying with fresh ETag...', e1);
        const { tag: tag2 } = await getTaskAndEtag();
        return await attemptPatch(tag2);
      }
    } catch (error) {
      console.error('Error completing planner task:', error);
      throw error;
    }
  }

  private buildTeamsDeepLink(): string {
  const fallbackAppId = '8682d5f9-bab2-45ba-b578-d7f7ab832120'; // Teams App ID from manifest
  const appId = process.env.NEXT_PUBLIC_TEAMS_APP_ID || fallbackAppId;
  const entityId = 'flowcreator'; // Matches manifest staticTabs.entityId; channel tab uses contentUrl directly
    const contentUrl = typeof window !== 'undefined' ? window.location.origin : 'https://172.16.16.107:3005';
    const label = 'Flow Creator';
    return `https://teams.microsoft.com/l/entity/${appId}/${encodeURIComponent(entityId)}?webUrl=${encodeURIComponent(contentUrl)}&label=${encodeURIComponent(label)}`;
  }

  // Get current Teams context (team and channel IDs)
  private async getCurrentTeamsContext(): Promise<{ teamId?: string; channelId?: string }> {
    try {
      if (this.isTeamsContext) {
        const context = await microsoftTeams.app.getContext();
        return {
          teamId: context.team?.groupId || context.team?.internalId,
          channelId: context.channel?.id
        };
      }
    } catch (error) {
      console.warn('Failed to get Teams context:', error);
    }
    return {};
  }

  // New: Build deep link including flow/item/node to open the app at a specific step
  private async buildFlowDeepLink(flowId: string, itemId: string, nodeId?: string, teamId?: string, channelId?: string): Promise<string> {
    const appId = process.env.NEXT_PUBLIC_TEAMS_APP_ID || process.env.NEXT_PUBLIC_AZURE_CLIENT_ID || '';
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://172.16.16.107:3005';
    const label = 'Flow Creator';
    const query = `flowId=${encodeURIComponent(flowId)}&itemId=${encodeURIComponent(itemId)}${nodeId ? `&nodeId=${encodeURIComponent(nodeId)}` : ''}`;
    
    // If teamId or channelId are missing, try to get them from current Teams context
    let finalTeamId = teamId;
    let finalChannelId = channelId;
    
    if (!finalTeamId || !finalChannelId) {
      const teamsContext = await this.getCurrentTeamsContext();
      finalTeamId = finalTeamId || teamsContext.teamId;
      finalChannelId = finalChannelId || teamsContext.channelId;
      console.log('[DeepLink] Resolved from Teams context:', { 
        originalTeamId: teamId, 
        originalChannelId: channelId,
        resolvedTeamId: finalTeamId, 
        resolvedChannelId: finalChannelId 
      });
    }
    
    // Debug logging
    console.log('[DeepLink] Building with params:', { flowId, itemId, nodeId, teamId: finalTeamId, channelId: finalChannelId });
    
    // When we have team context, use flowcreator-channel; otherwise use flowcreator
    if (finalTeamId && finalChannelId) {
      console.log('[DeepLink] Using TEAM context format');
      // Team context - use the working format from your example
      const entityId = 'flowcreator-channel';
      const url = `${origin}/`; // Clean URL for team context
      
      // Build context object with ALL required properties
      const ctxObj = {
        subEntityId: query,
        entityId: entityId,
        teamId: finalTeamId,
        channelId: finalChannelId
      };
      
      const context = encodeURIComponent(JSON.stringify(ctxObj));
      
      // Add the required top-level parameters
      const extraParams = `&groupId=${encodeURIComponent(finalTeamId)}&channelId=${encodeURIComponent(finalChannelId)}`;
      
      const finalUrl = `https://teams.microsoft.com/l/entity/${appId}/${encodeURIComponent(entityId)}?webUrl=${encodeURIComponent(url)}&label=${encodeURIComponent(label)}&context=${context}${extraParams}`;
      console.log('[DeepLink] Generated TEAM URL:', finalUrl);
      return finalUrl;
    } else {
      console.log('[DeepLink] Using PERSONAL context format (missing teamId or channelId)');
      // Personal context - use the old working format
      const entityId = 'flowcreator';
      const url = `${origin}/?${query}`;
      const context = encodeURIComponent(JSON.stringify({ subEntityId: query }));
      const finalUrl = `https://teams.microsoft.com/l/entity/${appId}/${encodeURIComponent(entityId)}?webUrl=${encodeURIComponent(url)}&label=${encodeURIComponent(label)}&context=${context}`;
      console.log('[DeepLink] Generated PERSONAL URL:', finalUrl);
      return finalUrl;
    }
  }

  // Public helper to get the Teams deep link for a flow/item/node
  public async getFlowDeepLink(flowId: string, itemId: string, nodeId?: string, teamId?: string, channelId?: string): Promise<string> {
    return await this.buildFlowDeepLink(flowId, itemId, nodeId, teamId, channelId);
  }

  // Build a status URL that the app can check on open (optional)
  private buildStatusUrl(flowId: string, itemId: string, nodeId?: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://172.16.16.107:3005';
    const url = `${origin}/api/flow-status?flowId=${encodeURIComponent(flowId)}&itemId=${encodeURIComponent(itemId)}${nodeId ? `&nodeId=${encodeURIComponent(nodeId)}` : ''}`;
    return url;
  }

  // Try to find an existing one-on-one chat with the recipient; otherwise create one
  private async getOrCreateOneOnOneChat(recipientUserId: string): Promise<string> {
    if (!this.graphClient) throw new Error('Not authenticated');

    try {
      // Find existing one-on-one chat by inspecting members
      try {
        const list = await this.graphClient
          .api(`/me/chats`)
          .filter("chatType eq 'oneOnOne'")
          .top(50)
          .get();

        if (Array.isArray(list.value)) {
          for (const chat of list.value) {
            try {
              const membersResp = await this.graphClient
                .api(`/chats/${chat.id}/members`)
                .get();
              const members = membersResp?.value || [];
              const hasRecipient = members.some((m: any) => {
                // aadUserConversationMember typically has 'userId'
                if (m.userId) return m.userId === recipientUserId;
                // In some payloads, the user object is nested
                if (m.user?.id) return m.user.id === recipientUserId;
                return false;
              });
               if (hasRecipient) {
                 return chat.id as string;
               }
            } catch (mErr) {
              // If members retrieval fails, skip this chat
              console.warn('Failed to fetch chat members; skipping chat', chat.id, mErr);
            }
          }
        }
      } catch (err) {
        console.warn('Falling back to creating chat; failed to list chats:', err);
      }

      // Get my user id
      const me = await this.graphClient.api('/me').select('id').get();
      const myId = me.id as string;

      if (recipientUserId === myId) {
        throw new Error('Cannot create a 1:1 chat with yourself.');
      }

      const chatCreateBody = {
        chatType: 'oneOnOne',
        members: [
          {
            '@odata.type': '#microsoft.graph.aadUserConversationMember',
            roles: ['owner'],
            'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${recipientUserId}')`,
          },
          {
            '@odata.type': '#microsoft.graph.aadUserConversationMember',
            roles: ['owner'],
            'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${myId}')`,
          },
        ],
      } as any;

      const created = await this.graphClient.api('/chats').post(chatCreateBody);
      return created.id as string;
    } catch (error: any) {
      console.error('Error ensuring one-on-one chat:', error?.body || error);
      throw error;
    }
  }

  // Send an Adaptive Card in a 1:1 chat with the recipient (delegated as current user)
  async sendAdaptiveCardMessage(recipientUserId: string, message: string, title = 'Flow Creator', flowId?: string, itemId?: string): Promise<void> {
    if (!this.graphClient) throw new Error('Not authenticated');

    try {
      const chatId = await this.getOrCreateOneOnOneChat(recipientUserId);
      // Use specific flow deep link if provided, otherwise use generic app deep link
      const deepLink = (flowId && itemId) ? this.buildFlowDeepLink(flowId, itemId) : this.buildTeamsDeepLink();
      const adaptiveCard = {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        body: [
          { type: 'TextBlock', text: title, weight: 'Bolder', size: 'Large' },
          { type: 'TextBlock', text: message, wrap: true },
        ],
        actions: [
          { type: 'Action.OpenUrl', title: 'Apri il flusso', url: deepLink },
        ],
      } as any;

      const created = await this.graphClient
        .api(`/chats/${chatId}/messages`)
        .post({
          importance: 'normal',
          body: {
            contentType: 'html',
            content: '<attachment id="1"></attachment>',
          },
          attachments: [
            {
              id: '1',
              contentType: 'application/vnd.microsoft.card.adaptive',
              contentUrl: null,
              content: JSON.stringify(adaptiveCard),
              name: title,
            },
          ],
        });
      try { console.log('Adaptive card sent', { chatId, messageId: created?.id }); } catch {}
    } catch (error: any) {
      console.error('Error sending adaptive card message:', error?.body || error);
      throw error;
    }
  }

  // New: Send a Flow-step specific Adaptive Card with deep link targeting a specific item/node
  async sendFlowStepAdaptiveCard(recipientUserId: string, message: string, flowId: string, itemId: string, nodeId?: string, title = 'Flow Creator'): Promise<void> {
    if (!this.graphClient) throw new Error('Not authenticated');

    try {
      const chatId = await this.getOrCreateOneOnOneChat(recipientUserId);
      const deepLink = this.buildFlowDeepLink(flowId, itemId, nodeId);

      const adaptiveCard = {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        body: [
          { type: 'TextBlock', text: title, weight: 'Bolder', size: 'Large' },
          { type: 'TextBlock', text: message, wrap: true },
        ],
        actions: [
          { type: 'Action.OpenUrl', title: 'Apri il flusso', url: deepLink },
        ],
      } as any;

      const created = await this.graphClient
        .api(`/chats/${chatId}/messages`)
        .post({
          importance: 'normal',
          body: { contentType: 'html', content: '<attachment id="1"></attachment>' },
          attachments: [
            {
              id: '1',
              contentType: 'application/vnd.microsoft.card.adaptive',
              contentUrl: null,
              content: JSON.stringify(adaptiveCard),
              name: title,
            },
          ],
        });
      try { console.log('Flow-step adaptive card sent', { chatId, messageId: created?.id, flowId, itemId, nodeId }); } catch {}
    } catch (error) {
      console.error('Error sending flow step adaptive card:', error);
      throw error;
    }
  }

  // Send a simple HTML message in a team channel
  async sendChannelMessage(teamId: string, channelId: string, message: string, title = 'Flow Creator', flowId?: string, itemId?: string, nodeId?: string): Promise<void> {
    if (!this.graphClient) throw new Error('Not authenticated');
    try {
      const deepLink = (flowId && itemId) ? this.buildFlowDeepLink(flowId, itemId, nodeId, teamId, channelId) : this.buildTeamsDeepLink();
      const html = `${message} <br/><a href="${deepLink}">Apri il flusso</a>`;
      await this.graphClient
        .api(`/teams/${teamId}/channels/${channelId}/messages`)
        .post({
          body: { contentType: 'html', content: html },
        });
    } catch (error) {
      console.error('Error sending channel message:', error);
      throw error;
    }
  }

  // Send an Adaptive Card in a team channel
  async sendChannelAdaptiveCard(teamId: string, channelId: string, message: string, title = 'Flow Creator'): Promise<void> {
    if (!this.graphClient) throw new Error('Not authenticated');
    try {
      const deepLink = this.buildTeamsDeepLink();
      const adaptiveCard = {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        body: [
          { type: 'TextBlock', text: title, weight: 'Bolder', size: 'Large' },
          { type: 'TextBlock', text: message, wrap: true },
        ],
        actions: [
          { type: 'Action.OpenUrl', title: 'Open Flow', url: deepLink },
        ],
      };

      await this.graphClient
        .api(`/teams/${teamId}/channels/${channelId}/messages`)
        .post({
          body: { contentType: 'html', content: '<attachment id="1"></attachment>' },
          attachments: [
            {
              id: '1',
              contentType: 'application/vnd.microsoft.card.adaptive',
              contentUrl: null,
              content: JSON.stringify(adaptiveCard),
              name: title,
            },
          ],
        });
    } catch (error) {
      console.error('Error sending channel adaptive card:', error);
      throw error;
    }
  }

  // Send notification to user via Teams
  async sendTeamsNotification(userId: string, message: string): Promise<void> {
    if (!this.graphClient) {
      throw new Error('Not authenticated');
    }

    try {
      const deepLink = this.buildTeamsDeepLink();
      await this.graphClient
        .api(`/users/${userId}/teamwork/sendActivityNotification`)
        .post({
          topic: {
            source: 'text',
            value: 'Flow Creator Notification',
            webUrl: deepLink, // Teams deep link required when source is 'text'
          },
          activityType: 'taskAssigned',
          previewText: {
            content: message,
          },
          templateParameters: [
            {
              name: 'assignedTask',
              value: message,
            },
          ],
        });
    } catch (error) {
      console.error('Error sending Teams notification:', error);
      throw error;
    }
  }

  // Send notification to a team
  async sendTeamNotification(teamId: string, message: string): Promise<void> {
    if (!this.graphClient) throw new Error('Not authenticated');
    try {
      const deepLink = this.buildTeamsDeepLink();
      await this.graphClient
        .api(`/teams/${teamId}/sendActivityNotification`)
        .post({
          topic: {
            source: 'entityUrl',
            value: `https://graph.microsoft.com/v1.0/teams/${teamId}`,
            webUrl: deepLink,
          },
          activityType: 'taskAssigned',
          previewText: { content: message },
          templateParameters: [
            { name: 'assignedTask', value: message },
          ],
        });
    } catch (error) {
      console.error('Error sending team notification:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const teamsAuthService = new TeamsAuthService();
