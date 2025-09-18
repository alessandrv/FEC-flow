"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { AccountInfo } from '@azure/msal-browser';
import { teamsAuthService, User } from '../../services/teams-auth';
import type { Team, Channel, PlannerPlan, PlannerBucket } from '../../services/teams-auth';

interface TeamsAuthContextType {
  account: AccountInfo | null;
  currentUser: User | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  searchUsers: (query: string) => Promise<User[]>;
  getAllUsers: () => Promise<User[]>;
  sendNotification: (userId: string, message: string) => Promise<void>;
  sendAdaptiveCardMessage: (userId: string, message: string, title?: string, flowId?: string, itemId?: string) => Promise<void>;
  // New: teams/groups and channels
  getUserTeams: () => Promise<Team[]>;
  searchTeams: (query: string) => Promise<Team[]>;
  getTeamChannels: (teamId: string) => Promise<Channel[]>;
  sendChannelMessage: (teamId: string, channelId: string, message: string, title?: string, flowId?: string, itemId?: string, nodeId?: string) => Promise<void>;
  sendChannelAdaptiveCard: (teamId: string, channelId: string, message: string, title?: string) => Promise<void>;
  sendTeamNotification: (teamId: string, message: string) => Promise<void>;
  // New: send Flow-step deep link Adaptive Card
  sendFlowStepAdaptiveCard: (userId: string, message: string, flowId: string, itemId: string, nodeId?: string, title?: string) => Promise<void>;
  // Planner helpers
  getPlannerPlansForGroup: (groupId: string) => Promise<PlannerPlan[]>;
  getPlannerPlansForChannel: (teamId: string, channelId: string) => Promise<PlannerPlan[]>;
  createPlannerPlan: (groupId: string, title: string) => Promise<PlannerPlan>;
  getPlannerBuckets: (planId: string) => Promise<PlannerBucket[]>;
  createPlannerBucket: (planId: string, name: string) => Promise<PlannerBucket>;
  createPlannerTask: (planId: string, bucketId: string, title: string, assigneeUserIds: string[], dueDateTime?: string, details?: { description?: string; openUrl?: string; openUrlAlias?: string }, startDateTime?: string) => Promise<any>;
  completePlannerTask: (taskId: string) => Promise<any>;
}

const TeamsAuthContext = createContext<TeamsAuthContextType | undefined>(undefined);

interface TeamsAuthProviderProps {
  children: ReactNode;
}

export const TeamsAuthProvider: React.FC<TeamsAuthProviderProps> = ({ children }) => {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initializeAuth = async () => {
      setIsLoading(true);
      try {
        // Try transparent auto-login (Teams silent SSO or cached MSAL account)
        const auto = await teamsAuthService.autoLogin();
        if (auto) {
          setAccount(auto);
          try {
            const user = await teamsAuthService.getCurrentUser();
            setCurrentUser(user);
          } catch (error) {
            console.error('Error getting current user after auto login:', error);
          }
          return; // we're done
        }

        // Fallback: previous behavior (check existing account instance state)
        const existingAccount = teamsAuthService.getAccount();
        if (existingAccount) {
          setAccount(existingAccount);
          try {
            const user = await teamsAuthService.getCurrentUser();
            setCurrentUser(user);
          } catch (error) {
            console.error('Error getting current user:', error);
          }
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // Expose deep-link helper for non-hook code paths (e.g., Planner attachment creation)
  useEffect(() => {
    (window as any).teamsAuthService = teamsAuthService;
  }, [])

  const login = async (): Promise<void> => {
    try {
      setIsLoading(true);
      const account = await teamsAuthService.login();
      setAccount(account);
      try {
        const user = await teamsAuthService.getCurrentUser();
        setCurrentUser(user);
      } catch (error) {
        console.error('Error getting current user after login:', error);
      }
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await teamsAuthService.logout();
      setAccount(null);
      setCurrentUser(null);
    } catch (error) {
      console.error('Logout failed:', error);
      throw error;
    }
  };

  const searchUsers = async (query: string): Promise<User[]> => {
    return await teamsAuthService.searchUsers(query);
  };

  const getAllUsers = async (): Promise<User[]> => {
    return await teamsAuthService.getAllUsers();
  };

  const sendNotification = async (userId: string, message: string): Promise<void> => {
    return await teamsAuthService.sendTeamsNotification(userId, message);
  };

  const sendAdaptiveCardMessage = async (userId: string, message: string, title?: string, flowId?: string, itemId?: string): Promise<void> => {
    return await teamsAuthService.sendAdaptiveCardMessage(userId, message, title, flowId, itemId);
  };

  // New: teams and channels
  const getUserTeams = async (): Promise<Team[]> => {
    return await teamsAuthService.getUserTeams();
  };

  const searchTeams = async (query: string): Promise<Team[]> => {
    return await teamsAuthService.searchTeams(query);
  };

  const getTeamChannels = async (teamId: string): Promise<Channel[]> => {
    return await teamsAuthService.getTeamChannels(teamId);
  };

  const sendChannelMessage = async (teamId: string, channelId: string, message: string, title?: string, flowId?: string, itemId?: string, nodeId?: string): Promise<void> => {
    return await teamsAuthService.sendChannelMessage(teamId, channelId, message, title, flowId, itemId, nodeId);
  };

  const sendChannelAdaptiveCard = async (teamId: string, channelId: string, message: string, title?: string): Promise<void> => {
    return await teamsAuthService.sendChannelAdaptiveCard(teamId, channelId, message, title);
  };

  const sendTeamNotification = async (teamId: string, message: string): Promise<void> => {
    return await teamsAuthService.sendTeamNotification(teamId, message);
  };

  const sendFlowStepAdaptiveCard = async (userId: string, message: string, flowId: string, itemId: string, nodeId?: string, title?: string): Promise<void> => {
    return await teamsAuthService.sendFlowStepAdaptiveCard(userId, message, flowId, itemId, nodeId, title);
  };

  // Planner helpers
  const getPlannerPlansForGroup = async (groupId: string): Promise<PlannerPlan[]> => teamsAuthService.getPlannerPlansForGroup(groupId);
  const getPlannerPlansForChannel = async (teamId: string, channelId: string): Promise<PlannerPlan[]> => teamsAuthService.getPlannerPlansForChannel(teamId, channelId);
  const createPlannerPlan = async (groupId: string, title: string): Promise<PlannerPlan> => teamsAuthService.createPlannerPlan(groupId, title);
  const getPlannerBuckets = async (planId: string): Promise<PlannerBucket[]> => teamsAuthService.getPlannerBuckets(planId);
  const createPlannerBucket = async (planId: string, name: string): Promise<PlannerBucket> => teamsAuthService.createPlannerBucket(planId, name);
  const createPlannerTask = async (
    planId: string,
    bucketId: string,
    title: string,
    assigneeUserIds: string[],
    dueDateTime?: string,
    details?: { description?: string; openUrl?: string; openUrlAlias?: string },
    startDateTime?: string,
  ) => teamsAuthService.createPlannerTask(planId, bucketId, title, assigneeUserIds, dueDateTime, details, startDateTime);
  const completePlannerTask = async (taskId: string) => teamsAuthService.completePlannerTask(taskId);

  const contextValue: TeamsAuthContextType = {
    account,
    currentUser,
    isLoggedIn: teamsAuthService.isAuthenticated(),
    isLoading,
    login,
    logout,
    searchUsers,
    getAllUsers,
    sendNotification,
    sendAdaptiveCardMessage,
    getUserTeams,
    searchTeams,
    getTeamChannels,
    sendChannelMessage,
    sendChannelAdaptiveCard,
    sendTeamNotification,
    sendFlowStepAdaptiveCard,
  getPlannerPlansForGroup,
  getPlannerPlansForChannel,
  createPlannerPlan,
  getPlannerBuckets,
  createPlannerBucket,
  createPlannerTask,
  completePlannerTask,
  };

  return (
    <TeamsAuthContext.Provider value={contextValue}>
      {children}
    </TeamsAuthContext.Provider>
  );
};

export const useTeamsAuth = (): TeamsAuthContextType => {
  const context = useContext(TeamsAuthContext);
  if (!context) {
    throw new Error('useTeamsAuth must be used within a TeamsAuthProvider');
  }
  return context;
};
