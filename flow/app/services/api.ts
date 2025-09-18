const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://172.16.16.27:3006/api'

export interface Flow {
  id: string;
  name: string;
  description: string;
  columns: string[];
  nodes: any[];
  edges: any[];
  items: any[];
  createdAt: string;
  updatedAt: string;
  plannerTeamId?: string | null;
  plannerChannelId?: string | null;
  plannerPlanId?: string | null;
  plannerBucketId?: string | null;
  // Allow either a universal deadline or per-column numeric deadlines
  deadlines?: { [key: string]: number } | null;
  deadlineInputField?: string | null;
}

export interface Group {
  id: string;
  name: string;
  color: string;
  team_id?: string | null;
  accept_any?: boolean;
  members: Array<{ name: string; email: string; id?: string }>;
}

class ApiService {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // Flow endpoints
  async getFlows(): Promise<Flow[]> {
    return this.request<Flow[]>('/flows');
  }

  async getFlow(id: string): Promise<Flow> {
    return this.request<Flow>(`/flows/${id}`);
  }

  async createFlow(flow: Omit<Flow, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ id: string; message: string }> {
    return this.request<{ id: string; message: string }>('/flows', {
      method: 'POST',
      body: JSON.stringify(flow),
    });
  }

  async updateFlow(id: string, flow: Omit<Flow, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/flows/${id}`, {
      method: 'PUT',
      body: JSON.stringify(flow),
    });
  }

  async deleteFlow(id: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/flows/${id}`, {
      method: 'DELETE',
    });
  }

  // Group endpoints
  async getGroups(): Promise<Group[]> {
    return this.request<Group[]>('/groups');
  }

  async getGroup(id: string): Promise<Group> {
    return this.request<Group>(`/groups/${id}`);
  }

  async createGroup(group: Omit<Group, 'id'>): Promise<{ id: string; message: string }> {
    return this.request<{ id: string; message: string }>('/groups', {
      method: 'POST',
      body: JSON.stringify(group),
    });
  }

  async updateGroup(id: string, group: Omit<Group, 'id'>): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(group),
    });
  }

  async deleteGroup(id: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/groups/${id}`, {
      method: 'DELETE',
    });
  }
}

export const apiService = new ApiService();