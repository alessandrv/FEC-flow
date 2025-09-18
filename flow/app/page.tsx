"use client"

import { useState, useEffect, Suspense } from "react"
import { Plus, Users, Trash2 } from "lucide-react"
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Input,
  Textarea,
  Chip,
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@heroui/react"
import FlowTable from "./components/flow-table"
import FlowEditor from "./components/flow-editor"
import GroupManagement from "./components/group-management"
import LanguageSwitcher from "./components/language-switcher"
import { TeamsLogin } from "./components/teams-login"
import TeamsMessageTester from "./components/teams-message-tester"
import TeamChannelTester from "./components/team-channel-tester"
import { apiService, type Flow, type Group } from "./services/api"
import { useTranslation } from "./hooks/useTranslation"
import { useTeamsAuth } from "./providers/teams-auth"
import GroupBroadcastTester from "./components/group-broadcast-tester"
import { useRouter, useSearchParams } from "next/navigation"
import * as microsoftTeams from "@microsoft/teams-js"

function DashboardInner() {
  const { t } = useTranslation()
  const { isLoggedIn, isLoading } = useTeamsAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      try {
        await microsoftTeams.app.initialize()
        const ctx = await microsoftTeams.app.getContext()
        const sub = (ctx as any)?.subEntityId || (ctx as any)?.page?.subEntityId
        if (sub && !cancelled) {
          // sub is like "flowId=...&itemId=...&nodeId=..."
          const params = new URLSearchParams(String(sub))
          const flowId = params.get('flowId')
          const itemId = params.get('itemId')
          const nodeId = params.get('nodeId') || undefined
          if (flowId && itemId) {
            const url = `/?flowId=${encodeURIComponent(flowId)}&itemId=${encodeURIComponent(itemId)}${nodeId ? `&nodeId=${encodeURIComponent(nodeId)}` : ''}`
            window.history.replaceState(null, '', url)
          }
        }
      } catch {}
    }
    init()
    return () => { cancelled = true }
  }, [])
  const [flows, setFlows] = useState<Flow[]>([])
  const [selectedFlow, setSelectedFlow] = useState<Flow | null>(null)
  const [draftFlow, setDraftFlow] = useState<Flow | null>(null) // For unsaved flows
  const [view, setView] = useState<"dashboard" | "table" | "editor">("dashboard")
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [newFlowName, setNewFlowName] = useState("")
  const [newFlowDescription, setNewFlowDescription] = useState("")
  const [isGroupManagementOpen, setIsGroupManagementOpen] = useState(false)
  const [deleteConfirmFlowId, setDeleteConfirmFlowId] = useState<string | null>(null)

  const [openItemId, setOpenItemId] = useState<string | undefined>(undefined)
  const [openNodeId, setOpenNodeId] = useState<string | undefined>(undefined)

  // Create a combined array of flows that includes draft flows
  const allFlows = draftFlow ? [...flows, draftFlow] : flows

  useEffect(() => {
    const loadData = async () => {
      try {
        const flowsData = await apiService.getFlows()
        setFlows(flowsData)
      } catch (error) {
        console.error('Failed to load data:', error)
        setFlows([])
      }
    }
    loadData()
  }, [])

  // Apply deep link after flows are loaded via URL params
  useEffect(() => {
    if (!allFlows || allFlows.length === 0) return
    if (!searchParams) return

    const flowId = searchParams.get('flowId') || undefined
    const itemId = searchParams.get('itemId') || undefined
    const nodeId = searchParams.get('nodeId') || undefined
    const edit = searchParams.get('edit') === 'true'

    if (flowId) {
      const f = allFlows.find(fl => fl.id === flowId)
      if (f) {
        setSelectedFlow(f)
        // If edit parameter is true or this is a draft flow, go to editor, otherwise go to table
        if (edit || flowId.startsWith('draft-')) {
          setView('editor')
        } else {
          setView('table')
        }
        setOpenItemId(itemId)
        setOpenNodeId(nodeId)
      }
    }
  }, [allFlows, searchParams])

    // Fallback for Teams deep links: read subEntityId from Teams context if URL params aren't present
  useEffect(() => {
    if (!allFlows || allFlows.length === 0) return
    if (selectedFlow) return

    (async () => {
      try {
        await microsoftTeams.app.initialize()
        const ctx: any = await microsoftTeams.app.getContext()
        const sub = ctx?.subEntityId || ctx?.page?.subEntityId || ctx?.page?.subPageId
        if (sub && typeof sub === 'string') {
          const params = new URLSearchParams(sub)
          const flowId = params.get('flowId') || undefined
          const itemId = params.get('itemId') || undefined
          const nodeId = params.get('nodeId') || undefined
          if (flowId) {
            const f = allFlows.find(fl => fl.id === flowId)
            if (f) {
              setSelectedFlow(f)
              setView('table')
              setOpenItemId(itemId)
              setOpenNodeId(nodeId)
            }
          }
        }
      } catch (error) {
        console.error('Teams context not available:', error)
      }
    })()
  }, [allFlows, selectedFlow])

  const saveFlows = async (updatedFlows: Flow[]) => {
    setFlows(updatedFlows)
  }

  const createFlow = async () => {
    if (!newFlowName.trim()) return

    // Create a draft flow in memory (not saved to database yet)
    const draftFlowData: Flow = {
      id: `draft-${Date.now()}`, // Temporary ID
      name: newFlowName,
      description: newFlowDescription,
      columns: [],
      nodes: [
        {
          id: "initial",
          type: "initial",
          position: { x: 250, y: 50 },
          data: { label: "Start", inputs: [] },
        },
      ],
      edges: [],
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    // Set the draft flow and go directly to the editor
    setDraftFlow(draftFlowData)
    setSelectedFlow(draftFlowData)
    setView("editor")
    
    // Update URL to reflect the new flow with edit flag
    const newUrl = new URL(window.location.href)
    newUrl.searchParams.set('flowId', draftFlowData.id)
    newUrl.searchParams.set('edit', 'true')
    window.history.pushState({}, '', newUrl.toString())
    
    setNewFlowName("")
    setNewFlowDescription("")
    setIsCreateDialogOpen(false)
  }

  const saveDraftFlow = async (flowData: Flow): Promise<Flow> => {
    try {
      // Save the draft flow to the database for the first time
      const { id, createdAt, updatedAt, ...flowToSave } = flowData
      const result = await apiService.createFlow(flowToSave)
      
      // Reload flows to get the updated list
      const updatedFlows = await apiService.getFlows()
      setFlows(updatedFlows)
      
      // Find the newly created flow
      const savedFlow = updatedFlows.find(f => f.id === result.id)
      if (savedFlow) {
        // Clear draft and update selected flow
        setDraftFlow(null)
        setSelectedFlow(savedFlow)
        
        // Update URL to reflect the saved flow with edit flag to stay in editor
        const params = new URLSearchParams()
        params.set('flowId', savedFlow.id)
        params.set('edit', 'true')
        router.push(`/?${params.toString()}`)
        
        return savedFlow
      }
      throw new Error('Saved flow not found')
    } catch (error) {
      console.error('Failed to save draft flow:', error)
      throw error
    }
  }

  const updateFlow = async (updatedFlow: Flow): Promise<void> => {
    // Check if this is a draft flow (starts with 'draft-')
    if (updatedFlow.id.startsWith('draft-')) {
      // This is a draft flow being saved for the first time
      try {
        await saveDraftFlow(updatedFlow)
        return
      } catch (error) {
        console.error('Failed to save draft flow:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
        alert(`Failed to save flow: ${errorMessage}\n\nPlease try again.`)
        throw error
      }
    }

    // This is an existing flow being updated
    const originalFlow = selectedFlow
    
    try {
      const { id, createdAt, updatedAt, ...flowData } = updatedFlow
      await apiService.updateFlow(id, flowData)
      
      // Only update state if the API call succeeds
      const updatedFlows = await apiService.getFlows()
      setFlows(updatedFlows)
      setSelectedFlow(updatedFlow)
      
      // Show success message
      console.log('Flow updated successfully')
    } catch (error) {
      console.error('Failed to update flow:', error)
      
      // CRITICAL: Restore the original flow state to prevent data loss
      if (originalFlow) {
        setSelectedFlow(originalFlow)
        // Also restore the flows array to the previous state
        const restoredFlows = flows.map(f => f.id === originalFlow.id ? originalFlow : f)
        setFlows(restoredFlows)
      }
      
      // Show detailed error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      alert(`Failed to update flow: ${errorMessage}\n\nYour changes have been preserved. Please try again.`)
      throw error
    }
  }

  const deleteFlow = async (flowId: string) => {
    try {
      // Check if this is a draft flow (starts with 'draft-')
      if (flowId.startsWith('draft-')) {
        // For draft flows, just remove from local state - no API call needed
        setFlows(flows.filter(f => f.id !== flowId))
        if (selectedFlow?.id === flowId) {
          setSelectedFlow(null)
        }
        // Also remove draft flow state if it matches
        if (draftFlow?.id === flowId) {
          setDraftFlow(null)
        }
        return
      }

      // For existing flows, delete from database
      await apiService.deleteFlow(flowId)
      // Reload flows to get the updated list
      const updatedFlows = await apiService.getFlows()
      setFlows(updatedFlows)
    } catch (error) {
      console.error('Failed to delete flow:', error)
      alert('Failed to delete flow. Please try again.')
    }
  }

  // Fullscreen loading while Teams auth initializes
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 border-4 border-default-200 border-t-primary rounded-full animate-spin" />
          <div className="text-default-600">Caricamento…</div>
        </div>
      </div>
    )
  }

  if (view === "table" && selectedFlow) {
    return (
      <FlowTable
        flow={selectedFlow}
        onBack={() => {
          setView("dashboard")
          setOpenItemId(undefined)
          setOpenNodeId(undefined)
        }}
        onEditFlow={() => {
          // Clear any pending deep-link targets and strip item/node from URL before entering editor
          setOpenItemId(undefined)
          setOpenNodeId(undefined)
          setView("editor")
          const params = new URLSearchParams()
          params.set('flowId', selectedFlow.id)
          params.set('edit', 'true')
          router.push(`/?${params.toString()}`)
        }}
        onUpdateFlow={updateFlow}
        openItemId={openItemId}
        openNodeId={openNodeId}
      />
    )
  }

  if (view === "editor" && selectedFlow) {
    return (
      <FlowEditor
        flow={selectedFlow}
        onBack={() => {
          // Ensure we return to table view without any pending deep-linked item/node
          setOpenItemId(undefined)
          setOpenNodeId(undefined)
          setView("table")
          const params = new URLSearchParams()
          params.set('flowId', selectedFlow.id)
          router.push(`/?${params.toString()}`)
        }}
        onUpdateFlow={updateFlow}
        onDeleteFlow={deleteFlow}
      />
    )
  }

  return (
    <div className="min-h-screen bg-background p-3 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{t('flows.title')}</h1>
            <p className="text-default-600 mt-2">{t('flows.description')}</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <LanguageSwitcher />
            <Button
              variant="bordered"
              onPress={() => setIsGroupManagementOpen(true)}
              startContent={<Users className="w-4 h-4" />}
              className="w-full sm:w-auto"
            >
              {t('groups.title')}
            </Button>

            <Button
              color="primary"
              onPress={() => setIsCreateDialogOpen(true)}
              startContent={<Plus className="w-4 h-4" />}
              className="w-full sm:w-auto"
            >
              {t('flows.createFlow')}
            </Button>
          </div>
        </div>

        

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {flows.map((flow) => (
      <Card
              key={flow.id}
              isPressable
              onPress={() => {
                setSelectedFlow(flow)
                setView("table")
        // Clear any previously deep-linked item/node targets when opening from dashboard
        setOpenItemId(undefined)
        setOpenNodeId(undefined)
                // Update URL so link is shareable
                const params = new URLSearchParams()
                params.set('flowId', flow.id)
                router.push(`/?${params.toString()}`)
              }}
              className="hover:shadow-lg transition-shadow"
            >
              <CardHeader className="flex justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">{flow.name}</h3>
                  <p className="text-sm text-default-500">{flow.description}</p>
                </div>
                <Popover
                  placement="bottom-end"
                  backdrop="opaque"
                  isOpen={deleteConfirmFlowId === flow.id}
                  onOpenChange={(open) => setDeleteConfirmFlowId(open ? flow.id : null)}
                >
                  <PopoverTrigger>
                    <Button
                      isIconOnly
                      variant="light"
                      color="danger"
                      size="sm"
                      aria-label="Delete flow"
                      onClick={(e) => e.stopPropagation()}
                      onPress={() => setDeleteConfirmFlowId(flow.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-3 max-w-xs" onClick={(e) => e.stopPropagation()}>
                    <div className="text-sm text-default-700">{t('items.deleteConfirm', { id: flow.id })}</div>
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" variant="light" className="flex-1" onPress={() => setDeleteConfirmFlowId(null)}>
                        {t('items.cancel')}
                      </Button>
                      <Button
                        size="sm"
                        color="danger"
                        className="flex-1"
                        onPress={() => {
                          deleteFlow(flow.id)
                          setDeleteConfirmFlowId(null)
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </CardHeader>
              <CardBody className="pt-0">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Chip 
                      color="primary" 
                      variant="flat" 
                      size="sm"
                    >
                      {flow.items.length} items
                    </Chip>
                    <Chip 
                      color="secondary" 
                      variant="flat" 
                      size="sm"
                    >
                      {flow.nodes.length} nodes
                    </Chip>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Chip 
                      color="success" 
                      variant="flat" 
                      size="sm"
                    >
                      Created: {flow.createdAt ? new Date(flow.createdAt).toLocaleDateString() : 'N/A'}
                    </Chip>
                    <Chip 
                      color="warning" 
                      variant="flat" 
                      size="sm"
                    >
                      Updated: {flow.updatedAt ? new Date(flow.updatedAt).toLocaleDateString() : 'N/A'}
                    </Chip>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>

        {flows.length === 0 && (
          <div className="text-center py-12">
            <div className="text-default-400 mb-4">
              <Plus className="w-16 h-16 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">No flows yet</h3>
            <p className="text-default-500 mb-4">Create your first workflow to get started</p>
            <Button color="primary" onPress={() => setIsCreateDialogOpen(true)}>
              Create Your First Flow
            </Button>
          </div>
        )}

        {/* Create Flow Modal */}
        <Modal isOpen={isCreateDialogOpen} onClose={() => setIsCreateDialogOpen(false)}>
          <ModalContent>
            <ModalHeader>
              <div className="flex flex-col">
                <h2>{t('flows.createFlow')}</h2>
                <p className="text-sm text-default-500 font-normal">{t('flows.description')}</p>
              </div>
            </ModalHeader>
            <ModalBody className="pb-6">
              <div className="space-y-4">
                <Input
                  label={t('flows.flowName')}
                  value={newFlowName}
                  onValueChange={setNewFlowName}
                  placeholder={t('flows.flowName')}
                />
                <Textarea
                  label={t('flows.flowDescription')}
                  value={newFlowDescription}
                  onValueChange={setNewFlowDescription}
                  placeholder={t('flows.flowDescription')}
                />
                <Button onPress={createFlow} color="primary" className="w-full">
                  {t('flows.createFlow')}
                </Button>
              </div>
            </ModalBody>
          </ModalContent>
        </Modal>

        {/* Group Management Modal */}
        <GroupManagement
          isOpen={isGroupManagementOpen}
          onClose={() => setIsGroupManagementOpen(false)}
        />
      </div>
    </div>
  )
}

export default function Dashboard() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 border-4 border-default-200 border-t-primary rounded-full animate-spin" />
          <div className="text-default-600">Loading…</div>
        </div>
      </div>
    }>
      <DashboardInner />
    </Suspense>
  )
}
