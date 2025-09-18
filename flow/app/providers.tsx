"use client";

import type { ThemeProviderProps } from "next-themes";

import * as React from "react";
import { HeroUIProvider } from "@heroui/system";
import { useRouter } from "next/navigation";
import { ThemeProvider as NextThemesProvider } from "next-themes";

import { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { apiService, type Group } from "./services/api"
import { TeamsAuthProvider } from "./providers/teams-auth"

// Groups Context
interface GroupsContextType {
  groups: Group[]
  loading: boolean
  error: string | null
  refreshGroups: () => Promise<void>
}

const GroupsContext = createContext<GroupsContextType | undefined>(undefined)

export function GroupsProvider({ children }: { children: ReactNode }) {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadGroups = async () => {
    try {
      setLoading(true)
      setError(null)
      const groupsData = await apiService.getGroups()
      setGroups(groupsData)
    } catch (err) {
      setError('Failed to load groups')
      console.error('Error loading groups:', err)
    } finally {
      setLoading(false)
    }
  }

  const refreshGroups = async () => {
    await loadGroups()
  }

  useEffect(() => {
    loadGroups()
  }, [])

  return (
    <GroupsContext.Provider value={{ groups, loading, error, refreshGroups }}>
      {children}
    </GroupsContext.Provider>
  )
}

export function useGroups() {
  const context = useContext(GroupsContext)
  if (context === undefined) {
    throw new Error('useGroups must be used within a GroupsProvider')
  }
  return context
}

export interface ProvidersProps {
  children: React.ReactNode;
  themeProps?: ThemeProviderProps;
}

declare module "@react-types/shared" {
  interface RouterConfig {
    routerOptions: NonNullable<
      Parameters<ReturnType<typeof useRouter>["push"]>[1]
    >;
  }
}

export function Providers({ children, themeProps }: ProvidersProps) {
  const router = useRouter();

  return (
    <HeroUIProvider navigate={router.push}>
      <NextThemesProvider {...themeProps}>
        <TeamsAuthProvider>
          <GroupsProvider>
            {children}
          </GroupsProvider>
        </TeamsAuthProvider>
      </NextThemesProvider>
    </HeroUIProvider>
  );
}
