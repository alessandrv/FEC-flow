"use client"

import type React from "react"

import { useState, useCallback, useEffect, useRef } from "react"
import { ArrowLeft, Save, Users, ChevronDown, Settings } from "lucide-react"
import {
  ReactFlow,
  addEdge,
  type Connection,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  MiniMap,
  type ReactFlowInstance,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { Button, Modal, ModalContent, ModalHeader, ModalBody, Input, Popover, PopoverTrigger, PopoverContent, Card, CardBody, CardHeader, Divider } from "@heroui/react"
import CustomNode from "./custom-node"
import GroupManagement from "./group-management"
import NodePalette from "./node-palette"
import { apiService } from "../services/api"
import { useTranslation } from "../hooks/useTranslation"
import { useGroups } from "../providers"
import { useTeamsAuth } from "../providers/teams-auth"
// import FlowSettingsPanel, { FlowSettingsChange } from "./flow-settings-panel" // legacy (temporarily commented)
import type { FlowSettingsChange } from './flow-settings-panel'
import { PlannerDestinationPanel } from './planner-destination-panel'
import { DeadlinePanel } from './deadline-panel'

const nodeTypes = {
  initial: CustomNode,
  serial: CustomNode,
  parallel: CustomNode,
  conditional: CustomNode,
  convergence: CustomNode,
  final: CustomNode,
}

interface Flow {
  id: string
  name: string
  description: string
  columns: string[]
  nodes: any[]
  edges: any[]
  items: any[]
  createdAt: string
  updatedAt: string
}

interface FlowEditorProps {
  flow: Flow
  onBack: () => void
  onUpdateFlow: (flow: Flow) => Promise<void>
  onDeleteFlow?: (flowId: string) => Promise<void>
}

export default function FlowEditor({ flow, onBack, onUpdateFlow, onDeleteFlow }: FlowEditorProps) {
  const { t } = useTranslation()
  const [toastMessage, setToastMessage] = useState<string>("")
  const [toastType, setToastType] = useState<"success" | "danger" | "warning" | "info">("success")
  const [toastVisible, setToastVisible] = useState(false)
  const [hasBeenSavedWithPlanner, setHasBeenSavedWithPlanner] = useState<boolean>(() => {
    // Check if flow already has planner configuration
    return !!(flow as any).plannerPlanId && !!(flow as any).plannerBucketId
  })
  const [showDeleteWarning, setShowDeleteWarning] = useState(false)
  // Ensure edge types are at the top level when initializing
  const processedEdges = flow.edges.map((edge) => {
    const edgeType = edge.type || edge.data?.type;
    return {
      ...edge,
      type: edgeType || undefined,
      data: {
        ...edge.data,
        type: undefined, // Remove type from data to avoid duplication
      },
    };
  });

  const [nodes, setNodes, onNodesChange] = useNodesState(flow.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(processedEdges)
  const [isEdgeEditDialogOpen, setIsEdgeEditDialogOpen] = useState(false)
  const [selectedEdge, setSelectedEdge] = useState<any>(null)
  const [edgeStyle, setEdgeStyle] = useState<string>("default")
  const [edgeLabel, setEdgeLabel] = useState<string>("")
  const { groups } = useGroups()
  const [isGroupManagementOpen, setIsGroupManagementOpen] = useState(false)
  const [draggedNodeType, setDraggedNodeType] = useState<string | null>(null)
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null)
  const [isEdgeStyleDropdownOpen, setIsEdgeStyleDropdownOpen] = useState(false)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 })
  const edgeStyleTriggerRef = useRef<HTMLButtonElement>(null)
  const importFileInputRef = useRef<HTMLInputElement>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [gridSnap, setGridSnap] = useState(true)
  const [gridSize, setGridSize] = useState(20)
  const { isLoggedIn } = useTeamsAuth()
  const [plannerTeamId, setPlannerTeamId] = useState<string | null>((flow as any).plannerTeamId || null)
  const [plannerPlanId, setPlannerPlanId] = useState<string | null>((flow as any).plannerPlanId || null)
  const [plannerBucketId, setPlannerBucketId] = useState<string | null>((flow as any).plannerBucketId || null)
  
  // Universal deadline system - single deadline configuration
  const [universalDeadlineDays, setUniversalDeadlineDays] = useState<number | ''>(() => {
    try {
      const anyFlow: any = flow
      // Try new format first: deadlines: { field: string, days: number }
      if (anyFlow?.deadlines?.days && typeof anyFlow.deadlines.days === 'number') {
        return anyFlow.deadlines.days
      }
      // Fallback to old format: deadlines: { universal: number }  
      if (anyFlow?.deadlines?.universal && typeof anyFlow.deadlines.universal === 'number') {
        return anyFlow.deadlines.universal
      }
      // Fallback to direct property
      return anyFlow?.universalDeadlineDays || ''
    } catch { return '' }
  })
  const [deadlineInputField, setDeadlineInputField] = useState<string | null>(() => {
    try {
      const anyFlow: any = flow
      // Try new format first: deadlines: { field: string, days: number }
      if (anyFlow?.deadlines?.field && typeof anyFlow.deadlines.field === 'string') {
        return anyFlow.deadlines.field
      }
      // Fallback to direct property
      return anyFlow?.deadlineInputField || null
    } catch { return null }
  })

  const handleSettingsChange = async (changes: Partial<FlowSettingsChange>) => {
    console.log('handleSettingsChange called with:', changes)
    
    // Update state first
    if (Object.prototype.hasOwnProperty.call(changes, 'plannerTeamId')) setPlannerTeamId(changes.plannerTeamId ?? null)
    if (Object.prototype.hasOwnProperty.call(changes, 'plannerPlanId')) setPlannerPlanId(changes.plannerPlanId ?? null)
    if (Object.prototype.hasOwnProperty.call(changes, 'plannerBucketId')) setPlannerBucketId(changes.plannerBucketId ?? null)
    if (Object.prototype.hasOwnProperty.call(changes, 'universalDeadlineDays')) setUniversalDeadlineDays(changes.universalDeadlineDays as any)
    if (Object.prototype.hasOwnProperty.call(changes, 'deadlineInputField')) setDeadlineInputField(changes.deadlineInputField ?? null)
    
    // Auto-save when planner configuration is complete (team, plan, and bucket are all set)
    const updatedTeamId = changes.plannerTeamId !== undefined ? changes.plannerTeamId : plannerTeamId
    const updatedPlanId = changes.plannerPlanId !== undefined ? changes.plannerPlanId : plannerPlanId
    const updatedBucketId = changes.plannerBucketId !== undefined ? changes.plannerBucketId : plannerBucketId
    
    if (updatedTeamId && updatedPlanId && updatedBucketId) {
      console.log('Auto-saving planner configuration since all fields are set')
      // Delay slightly to ensure state updates are complete
      setTimeout(() => {
        saveSettings(changes)
      }, 100)
    }
  }

  const saveSettings = async (settingsChanges?: Partial<FlowSettingsChange>) => {
    try {
      // Store deadline configuration in the deadlines column as JSON  
      const deadlinesConfig = {
        field: deadlineInputField,
        days: universalDeadlineDays
      }
      
      console.log('Creating deadlines config:', {
        deadlineInputField,
        universalDeadlineDays,
        deadlinesConfig,
        deadlineInputFieldType: typeof deadlineInputField,
        universalDeadlineDaysType: typeof universalDeadlineDays
      })
      
      // Create updated flow with current settings - keep existing nodes/edges
      const updatedFlow: any = {
        ...flow,
        plannerTeamId,
        plannerPlanId,
        plannerBucketId,
        deadlineInputField,
        universalDeadlineDays,
        deadlines: deadlinesConfig
      }
      
      console.log('Saving flow with deadline settings:', {
        deadlineInputField,
        universalDeadlineDays,
        deadlineInputFieldTruthy: !!deadlineInputField,
        universalDeadlineDaysTruthy: !!universalDeadlineDays,
        universalDeadlineDaysType: typeof universalDeadlineDays,
        willSaveDeadlines: (deadlineInputField && universalDeadlineDays !== '' && universalDeadlineDays !== null && universalDeadlineDays !== undefined),
        deadlinesObject: updatedFlow.deadlines,
        fullFlow: updatedFlow
      })
      
      // Use the onUpdateFlow prop which handles both draft and existing flows
      await onUpdateFlow(updatedFlow)
      
      setToastMessage(t('settings.saved') || 'Settings saved successfully')
      setToastType('success')
      setToastVisible(true)
      window.setTimeout(() => setToastVisible(false), 2500)
    } catch (e) {
      console.error('Failed to save settings:', e)
      setToastMessage(t('settings.saveFailed') || 'Failed to save settings')
      setToastType('danger')
      setToastVisible(true)
      window.setTimeout(() => setToastVisible(false), 3000)
      
      // Show detailed error to user
      const errorMessage = e instanceof Error ? e.message : 'Unknown error occurred'
      alert(`Failed to save settings: ${errorMessage}\n\nPlease try again.`)
    }
  }

  const edgeStyles = [
    { key: "default", label: t('flowEditor.edgeStyles.default') },
    { key: "smoothstep", label: t('flowEditor.edgeStyles.smoothstep') },
    { key: "step", label: t('flowEditor.edgeStyles.step') },
    { key: "straight", label: t('flowEditor.edgeStyles.straight') },
  ]

  // Function to snap coordinates to grid
  const snapToGrid = (value: number): number => {
    if (!gridSnap) return value
    return Math.round(value / gridSize) * gridSize
  }

  // Function to snap position to grid (for top-left positioning)
  const snapPositionToGrid = (position: { x: number; y: number }) => {
    return {
      x: snapToGrid(position.x),
      y: snapToGrid(position.y)
    }
  }

  // Function to snap node top handle to grid using actual dimensions
  const snapNodeTopHandleToGrid = (position: { x: number; y: number }, nodeWidth: number) => {
    if (!gridSnap) return position
    
    // The top handle is at the center of the node horizontally, and at the top edge
    // So we snap the horizontal center and the top edge
    const handleX = position.x + (nodeWidth / 2)  // Center horizontally
    const handleY = position.y                     // Top edge
    
    // Snap the handle position to the grid
    const snappedHandleX = snapToGrid(handleX)
    const snappedHandleY = snapToGrid(handleY)
    
    // Calculate the new top-left position based on the snapped handle
    const newX = snappedHandleX - (nodeWidth / 2)
    const newY = snappedHandleY
    
    return { x: newX, y: newY }
  }

  // Function to get actual node dimensions from DOM
  const getActualNodeDimensions = (nodeId: string): { width: number; height: number } | null => {
    if (!reactFlowInstance) return null
    
    // Find the node element in the DOM using React Flow's data-id attribute
    const nodeElement = document.querySelector(`[data-id="${nodeId}"]`)
    if (!nodeElement) return null
    
    // Get the actual rendered dimensions
    const rect = nodeElement.getBoundingClientRect()
    
    // Convert screen coordinates to flow coordinates for accurate measurement
    const flowOrigin = reactFlowInstance.screenToFlowPosition({ x: 0, y: 0 })
    const flowDimensions = reactFlowInstance.screenToFlowPosition({ x: rect.width, y: rect.height })
    
    return {
      width: flowDimensions.x - flowOrigin.x,
      height: flowDimensions.y - flowOrigin.y
    }
  }

  useEffect(() => {
    if (isEdgeStyleDropdownOpen && edgeStyleTriggerRef.current) {
      const rect = edgeStyleTriggerRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const dropdownHeight = Math.min(edgeStyles.length * 40 + 16, 240) // Estimate dropdown height

      let top = rect.bottom + 4

      // If dropdown would go below viewport, position it above the trigger
      if (top + dropdownHeight > viewportHeight - 20) {
        top = rect.top - dropdownHeight - 4
      }

      // Ensure dropdown doesn't go above viewport
      if (top < 20) {
        top = 20
      }

      setDropdownPosition({
        top,
        left: rect.left,
        width: rect.width,
      })
    }
  }, [isEdgeStyleDropdownOpen, edgeStyles.length])

  const updateNodeData = useCallback(
    (nodeId: string, newData: any) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: { ...node.data, ...newData },
            }
          }
          return node
        }),
      )
    },
    [setNodes],
  )



  // Update conditional nodes with edge information
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.data.nodeType === "conditional") {
          const nodeEdges = edges
            .filter((edge) => edge.source === node.id)
            .map((edge) => {
              const targetNode = nds.find((n) => n.id === edge.target)
              const existingEdge = node.data.edges?.find((e: any) => e.id === edge.id)
              return {
                id: edge.id,
                target: targetNode?.data?.label || edge.target,
                title: existingEdge?.title || "",
              }
            })

          return {
            ...node,
            data: {
              ...node.data,
              edges: nodeEdges,
              onUpdate: updateNodeData,
              isFlowDesigner: true,
            },
          }
        }
        return {
          ...node,
          data: {
            ...node.data,
            onUpdate: updateNodeData,
            isFlowDesigner: true,
          },
        }
      }),
    )
  }, [edges])

  // Keyboard shortcuts for grid snapping and settings drawer
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl/Cmd + G to toggle grid snapping
      if ((event.ctrlKey || event.metaKey) && event.key === 'g') {
        event.preventDefault()
        setGridSnap(prev => !prev)
      }
      // Ctrl/Cmd + Shift + G to cycle through grid sizes
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'G') {
        event.preventDefault()
        setGridSize(prev => {
          const sizes = [10, 15, 20, 25, 30, 35, 40, 45, 50]
          const currentIndex = sizes.indexOf(prev)
          const nextIndex = (currentIndex + 1) % sizes.length
          return sizes[nextIndex]
        })
      }
      // Ctrl/Cmd + Shift + S to toggle settings drawer
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 's' || event.key === 'S')) {
        event.preventDefault()
        setIsDrawerOpen(o => !o)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Refine positions of newly created nodes after they're rendered
  useEffect(() => {
    if (!gridSnap || !reactFlowInstance) return

    // Wait for nodes to render, then refine their positions using actual dimensions
    const timer = setTimeout(() => {
      nodes.forEach(node => {
        const actualDimensions = getActualNodeDimensions(node.id)
        if (actualDimensions) {
          // Calculate the ideal position based on actual dimensions
          const idealPosition = snapNodeTopHandleToGrid(node.position, actualDimensions.width)
          
          // Only update if the position needs significant refinement (more than 1px)
          if (Math.abs(idealPosition.x - node.position.x) > 1 || Math.abs(idealPosition.y - node.position.y) > 1) {
            setNodes(nds =>
              nds.map(n =>
                n.id === node.id ? { ...n, position: idealPosition } : n
              )
            )
          }
        }
      })
    }, 150) // Small delay to ensure nodes are fully rendered

    return () => clearTimeout(timer)
  }, [nodes.length, gridSnap, reactFlowInstance]) // Only run when node count changes



  // Validate connection - enforce single output for non-parallel nodes
  const isValidConnection = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((node) => node.id === connection.source)
      if (!sourceNode) return false

      // Allow parallel nodes to have multiple outputs
      if (sourceNode.data.nodeType === "parallel" || sourceNode.data.nodeType === "conditional") return true

      // For all other nodes, check if they already have an outgoing edge
      const existingOutgoingEdges = edges.filter((edge) => edge.source === connection.source)
      return existingOutgoingEdges.length === 0
    },
    [nodes, edges],
  )

  const onConnect = useCallback(
    (params: Connection) => {
      if (isValidConnection(params)) {
        setEdges((eds) => addEdge(params, eds))
      } else {
        alert("Only parallel nodes can have multiple output connections!")
      }
    },
    [setEdges, isValidConnection],
  )

  const onEdgeClick = useCallback((event: any, edge: any) => {
    event.stopPropagation()
    console.log('Edge clicked:', edge.id, 'Current type:', edge.type, 'Data type:', edge.data?.type)
    setSelectedEdge(edge)
    const currentType = edge.type || edge.data?.type || "default"
    console.log('Setting edge style to:', currentType)
    setEdgeStyle(currentType)
    setEdgeLabel(edge.label || "")
    setIsEdgeEditDialogOpen(true)
  }, [])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect()
      const type = event.dataTransfer.getData("application/reactflow")

      if (typeof type === "undefined" || !type || !reactFlowInstance || !reactFlowBounds) {
        return
      }

      const rawPosition = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      // For new nodes, use a reasonable default width initially
      // The actual width will be measured and position refined after rendering
      const estimatedNodeWidth = 200  // Default width

      // Snap node top handle to grid if grid snapping is enabled
      const position = gridSnap 
        ? snapNodeTopHandleToGrid(rawPosition, estimatedNodeWidth)
        : rawPosition

      const newNode = {
        id: Date.now().toString(),
        type,
        position,
        data: {
          label: `${type.charAt(0).toUpperCase() + type.slice(1)} Node`,
          inputs: [],
          nodeType: type,
          onUpdate: updateNodeData,
          isFlowDesigner: true,
        },
      }

      setNodes((nds) => nds.concat(newNode))
    },
    [reactFlowInstance, setNodes],
  )

  const updateEdge = () => {
    if (!selectedEdge) return

    setEdges((eds) =>
      eds.map((edge) => {
        if (edge.id === selectedEdge.id) {
          return {
            ...edge,
            type: edgeStyle === "default" ? undefined : edgeStyle,
            label: edgeLabel || undefined,
          }
        }
        return edge
      }),
    )

    setIsEdgeEditDialogOpen(false)
    setSelectedEdge(null)
    setEdgeLabel("")
  }

  const handleBack = () => {
    // If this flow hasn't been saved with planner configuration, warn the user
    if (!hasBeenSavedWithPlanner && (!plannerPlanId || !plannerBucketId)) {
      setShowDeleteWarning(true)
      return
    }
    
    // Otherwise, proceed with normal back action
    onBack()
  }

  const handleDeleteFlowAndBack = async () => {
    try {
      if (onDeleteFlow) {
        // Use the passed delete function (handles both draft and regular flows)
        await onDeleteFlow(flow.id)
      } else {
        // Fallback to direct API call for backward compatibility
        await apiService.deleteFlow(flow.id)
      }
      setShowDeleteWarning(false)
      onBack()
    } catch (error) {
      console.error('Failed to delete flow:', error)
      setToastMessage(t('flows.deleteFailed') || 'Failed to delete flow. Please try again.')
      setToastType('danger')
      setToastVisible(true)
      window.setTimeout(() => setToastVisible(false), 3000)
    }
  }

  const saveFlow = async () => {
    // Validate that planner is configured
    if (!plannerPlanId || !plannerBucketId) {
      setToastMessage(t('flowEditor.plannerRequired') || 'Planner destination must be configured before saving the flow. Please open Settings and configure a Microsoft Planner plan and bucket.')
      setToastType('warning')
      setToastVisible(true)
      window.setTimeout(() => setToastVisible(false), 5000)
      
      // Automatically open the settings drawer to help user configure planner
      setIsDrawerOpen(true)
      return
    }

    // Validate that all non-convergence nodes have responsibility assigned
    const nodesWithoutResponsibility = nodes.filter((node) => {
      if (node.type === "initial" || node.type === "convergence") return false

      const hasOldResponsibility = node.data.responsibility
      const hasNewResponsibilities = node.data.responsibilities && node.data.responsibilities.length > 0

      return !hasOldResponsibility && !hasNewResponsibilities
    })

    if (nodesWithoutResponsibility.length > 0) {
      alert(
        `Please assign responsibility to all nodes (except convergence nodes). Missing: ${nodesWithoutResponsibility.map((n) => n.data.label).join(", ")}`,
      )
      return
    }

    const cleanNodes = nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        onUpdate: undefined,
      },
    }))

    // Move edge type into data field for database storage
    const cleanEdges = edges.map((edge) => {
      const { type, ...edgeWithoutType } = edge;
      return {
        ...edgeWithoutType,
        data: {
          ...edge.data,
          type: type || undefined, // Store type in data field
        },
      };
    });

  const updatedFlow: any = {
      ...flow,
      nodes: cleanNodes,
      edges: cleanEdges,
  plannerTeamId,
  plannerPlanId,
  plannerBucketId,
  deadlineInputField,
  universalDeadlineDays,
  deadlines: {
    field: deadlineInputField,
    days: universalDeadlineDays
  }
    }
    try {
      await onUpdateFlow(updatedFlow)
      // Mark flow as properly saved with planner configuration
      setHasBeenSavedWithPlanner(true)
      setToastMessage(t('flows.flowUpdated'))
      setToastType('success')
      setToastVisible(true)
      window.setTimeout(() => setToastVisible(false), 2500)
    } catch (e) {
      console.error('Failed to save flow:', e)
      setToastMessage(t('flows.flowUpdateFailed'))
      setToastType('danger')
      setToastVisible(true)
      window.setTimeout(() => setToastVisible(false), 3000)
      
      // Show detailed error to user
      const errorMessage = e instanceof Error ? e.message : 'Unknown error occurred'
      alert(`Failed to save flow: ${errorMessage}\n\nYour changes have been preserved. Please try again.`)
    }
  }

  const selectedEdgeStyle = edgeStyles.find((style) => style.key === edgeStyle)

  // Export current flow (designer state) to JSON
  const exportFlowToJson = () => {
    // Remove editor-only fields and move edge type into data
    const cleanNodes = nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        onUpdate: undefined,
      },
    }))

    const cleanEdges = edges.map((edge) => {
      const { type, ...edgeWithoutType } = edge as any
      return {
        ...edgeWithoutType,
        data: {
          ...(edge as any).data,
          type: type || (edge as any).data?.type || undefined,
        },
      }
    })

    const exportPayload = {
      id: flow.id,
      name: flow.name,
      description: flow.description,
      columns: flow.columns,
      nodes: cleanNodes,
      edges: cleanEdges,
    }

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${flow.name || "flow"}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const openImportDialog = () => {
    importFileInputRef.current?.click()
  }

  const handleImportFile: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      if (!Array.isArray(json.nodes) || !Array.isArray(json.edges)) {
        alert("Invalid flow file: missing nodes/edges")
        return
      }

      // Promote edge type to top-level like editor expects
      const importedEdges = json.edges.map((edge: any) => ({
        ...edge,
        type: edge.type || edge.data?.type || undefined,
        data: { ...edge.data, type: undefined },
      }))

      // Ensure designer flags on nodes
      const importedNodes = json.nodes.map((node: any) => ({
        ...node,
        data: {
          ...node.data,
          isFlowDesigner: true,
        },
      }))

      setEdges(importedEdges)
      setNodes((_) => importedNodes.map((n: any) => ({
        ...n,
        data: { ...n.data, onUpdate: updateNodeData },
      })))
      alert("Flow imported. Review and Save Flow to persist changes.")
    } catch (err) {
      console.error("Failed to import flow:", err)
      alert("Failed to import flow. Ensure it's a valid exported JSON.")
    } finally {
      // Reset input to allow re-importing same file if needed
      if (importFileInputRef.current) importFileInputRef.current.value = ""
    }
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-content1 border-b gap-4">
        <div className="flex items-center gap-4">
          <Button variant="light" onPress={handleBack} startContent={<ArrowLeft className="w-4 h-4" />}>
            {t('common.back')}
          </Button>
          <div>
                {/* Planner Destination Settings */}
            <p className="text-sm text-default-600">{t('flowEditor.description')}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto ">
          <Button isIconOnly variant="bordered" aria-label="Settings" className="w-full sm:w-auto" onPress={()=>setIsDrawerOpen(true)}>
            <Settings className="w-4 h-4" />
          </Button>

          <Button
            onPress={saveFlow}
            color="primary"
            startContent={<Save className="w-4 h-4" />}
            className="w-full sm:w-auto"
          >
            {t('flowEditor.saveFlow')}
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Node Palette */}
        <div className="p-4 bg-content1 border-b lg:border-b-0 lg:border-r">
          <NodePalette onDragStart={setDraggedNodeType} />
        </div>

        {/* Flow Canvas */}
        <div className="flex-1" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgeClick={onEdgeClick}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeDragStop={(event, node) => {
              if (!gridSnap) return
              
              // Get actual node dimensions from DOM for precise snapping
              const actualDimensions = getActualNodeDimensions(node.id)
              
              if (actualDimensions) {
                // Use actual dimensions for precise top handle snapping
                const snappedPosition = snapNodeTopHandleToGrid(node.position, actualDimensions.width)
                
                if (snappedPosition.x !== node.position.x || snappedPosition.y !== node.position.y) {
                  setNodes((nds) =>
                    nds.map((n) =>
                      n.id === node.id
                        ? { ...n, position: snappedPosition }
                        : n
                    )
                  )
                }
              }
            }}
            nodeTypes={nodeTypes}
            fitView
            className="bg-default-50"
          >
            <Controls />
            <MiniMap />
            <Background 
              gap={gridSnap ? gridSize : 12} 
              size={1} 
              color={gridSnap ? "rgb(148 163 184)" : "rgb(203 213 225)"}
              className={gridSnap ? "opacity-100" : "opacity-50"}
            />
          </ReactFlow>
        </div>
      </div>

      

      {/* Edge Edit Modal */}
      <Modal isOpen={isEdgeEditDialogOpen} onClose={() => setIsEdgeEditDialogOpen(false)}>
        <ModalContent>
          <ModalHeader>
            <div className="flex flex-col">
              <h2>{t('flowEditor.edgeEdit')}</h2>
              <p className="text-sm text-default-500 font-normal">{t('flowEditor.edgeEditDescription')}</p>
            </div>
          </ModalHeader>
          <ModalBody className="pb-6">
            <div className="space-y-4">
              <Input
                label={t('flowEditor.edgeLabel')}
                value={edgeLabel}
                onValueChange={setEdgeLabel}
                placeholder={t('flowEditor.edgeLabelPlaceholder')}
              />

              <div className="space-y-1">
                <label className="text-sm font-medium">{t('flowEditor.edgeStyle')}</label>
                <div className="relative">
                  <Button
                    ref={edgeStyleTriggerRef}
                    variant="bordered"
                    className="w-full justify-between"
                    onPress={() => setIsEdgeStyleDropdownOpen(!isEdgeStyleDropdownOpen)}
                  >
                    {selectedEdgeStyle?.label || t('flowEditor.selectStyle')}
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${isEdgeStyleDropdownOpen ? "rotate-180" : ""}`}
                    />
                  </Button>

                  {isEdgeStyleDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-[9999] bg-transparent"
                        onClick={() => setIsEdgeStyleDropdownOpen(false)}
                      />
                      <div
                        className="fixed z-[10000] bg-content1 border border-default-200 rounded-lg shadow-xl max-h-60 overflow-y-auto"
                        style={{
                          top: `${dropdownPosition.top}px`,
                          left: `${dropdownPosition.left}px`,
                          width: `${dropdownPosition.width}px`,
                        }}
                      >
                        <div className="p-1">
                          {edgeStyles.map((style) => (
                            <button
                              key={style.key}
                              className="w-full px-3 py-2 text-left hover:bg-default-100 transition-colors rounded-md text-sm"
                              onClick={() => {
                                setEdgeStyle(style.key)
                                setIsEdgeStyleDropdownOpen(false)
                              }}
                            >
                              {style.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Button onPress={updateEdge} color="primary" className="flex-1">
                  Apply Changes
                </Button>
                <Button variant="bordered" onPress={() => setIsEdgeEditDialogOpen(false)} className="flex-1">
                  Cancel
                </Button>
              </div>
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* Group Management Modal */}
      <GroupManagement
        isOpen={isGroupManagementOpen}
        onClose={() => setIsGroupManagementOpen(false)}
      />

      {/* Hidden file input for import */}
      <input
        ref={importFileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImportFile}
      />

      {/* Inline Toast */}
      {toastVisible && (
        <div
          className={`fixed bottom-4 right-4 z-[11000] px-4 py-3 rounded shadow-lg text-sm 
            ${toastType === 'success' ? 'bg-success-600 text-white' : ''}
            ${toastType === 'danger' ? 'bg-danger-600 text-white' : ''}
            ${toastType === 'warning' ? 'bg-warning-600 text-foreground' : ''}
            ${toastType === 'info' ? 'bg-primary-600 text-white' : ''}
          `}
        >
          {toastMessage}
        </div>
      )}
      {/* Settings Drawer (unified comprehensive panel) */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-[10500] flex">
          <div className="flex-1 bg-black/30" onClick={()=>setIsDrawerOpen(false)} />
          <div className="w-[800px] max-w-full h-full bg-content1 border-l border-default-200 flex flex-col shadow-xl animate-slide-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-default-200">
              <h2 className="text-lg font-semibold">{t('navigation.settings')}</h2>
              <Button size="sm" variant="light" onPress={()=>setIsDrawerOpen(false)}>✕</Button>
            </div>
            
            {/* Unified Settings Panel */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Planner Destination Section */}
                
                  <PlannerDestinationPanel
                    plannerTeamId={plannerTeamId}
                    plannerPlanId={plannerPlanId}
                    plannerBucketId={plannerBucketId}
                    onChange={handleSettingsChange}
                  />
              
              <Divider />
              
              {/* Deadlines Section */}
              <Card className="w-full">
                <CardHeader className="pb-3">
                  <h3 className="text-medium font-semibold">{t('flowEditor.universalDeadline') || 'Universal Deadline'}</h3>
                </CardHeader>
                <CardBody className="pt-0">
                  <DeadlinePanel
                    universalDeadlineDays={universalDeadlineDays}
                    deadlineInputField={deadlineInputField}
                    flow={flow}
                    onChange={handleSettingsChange}
                  />
                </CardBody>
              </Card>
              
              <Divider />
              
              {/* Canvas Settings Section */}
              <Card className="w-full">
                <CardHeader className="pb-3">
                  <h3 className="text-medium font-semibold">{t('flowEditor.canvas') || 'Canvas'}</h3>
                </CardHeader>
                <CardBody className="pt-0">
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium text-default-700 mb-3">{t('flowEditor.grid') || 'Grid'}</h4>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <input 
                            type="checkbox" 
                            id="gridSnap_drawer" 
                            checked={gridSnap} 
                            onChange={(e)=>setGridSnap(e.target.checked)} 
                            className="w-4 h-4" 
                          />
                          <label htmlFor="gridSnap_drawer" className="text-sm text-default-700">
                            {t('flowEditor.snapToGrid') || 'Snap to grid'}
                          </label>
                        </div>
                        <div className="flex items-center gap-3">
                          <label htmlFor="gridSize_drawer" className="text-sm text-default-700 min-w-12">
                            {t('flowEditor.gridSize') || 'Size'}
                          </label>
                          <input 
                            type="range" 
                            id="gridSize_drawer" 
                            min="10" 
                            max="50" 
                            step="5" 
                            value={gridSize} 
                            onChange={(e)=>setGridSize(Number(e.target.value))} 
                            className="flex-1" 
                          />
                          <span className="text-sm text-default-600 min-w-12 text-right">{gridSize}px</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>
              
              <Divider />
              
              {/* Data Management Section */}
              <Card className="w-full">
                <CardHeader className="pb-3">
                  <h3 className="text-medium font-semibold">{t('flowEditor.data') || 'Data Management'}</h3>
                </CardHeader>
                <CardBody className="pt-0">
                  <div className="flex gap-3">
                    <Button 
                      size="md" 
                      variant="bordered" 
                      className="flex-1" 
                      onPress={()=>{openImportDialog()}}
                    >
                      {t('flowEditor.import')}
                    </Button>
                    <Button 
                      size="md" 
                      variant="bordered" 
                      className="flex-1" 
                      onPress={()=>{exportFlowToJson()}}
                    >
                      {t('flowEditor.export')}
                    </Button>
                  </div>
                </CardBody>
              </Card>
              
              <Divider />
              
              {/* Groups Management Section */}
              <Card className="w-full">
                <CardHeader className="pb-3">
                  <h3 className="text-medium font-semibold">{t('groups.title') || 'Groups'}</h3>
                </CardHeader>
                <CardBody className="pt-0">
                  <Button 
                    size="md" 
                    variant="bordered" 
                    startContent={<Users className="w-4 h-4" />} 
                    onPress={()=>{ setIsGroupManagementOpen(true) }}
                    className="w-full sm:w-auto"
                  >
                    {t('groups.manage') || 'Manage Groups'}
                  </Button>
                </CardBody>
              </Card>
              
            </div>
            
            {/* Footer Actions */}
            <div className="px-6 py-4 border-t border-default-200 flex gap-3">
              <Button size="md" className="flex-1" variant="light" onPress={()=>setIsDrawerOpen(false)}>
                {t('common.close') || 'Close'}
              </Button>
              <Button size="md" color="primary" className="flex-1" onPress={()=>{ saveSettings() }}>
                {t('settings.save') || 'Save Settings'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Flow Warning Modal */}
      <Modal isOpen={showDeleteWarning} onClose={() => setShowDeleteWarning(false)}>
        <ModalContent>
          <ModalHeader>
            <div className="flex flex-col">
              <h2>{t('flowEditor.deleteFlowWarning') || 'Delete Unsaved Flow?'}</h2>
              <p className="text-sm text-default-500 font-normal">
                {t('flowEditor.deleteFlowWarningMessage') || 'This flow has not been saved with planner configuration. Do you want to delete this flow or continue editing?'}
              </p>
            </div>
          </ModalHeader>
          <ModalBody className="pb-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <Button 
                variant="bordered" 
                onPress={() => setShowDeleteWarning(false)}
                className="flex-1"
              >
                {t('flowEditor.continueEditing') || 'Continue Editing'}
              </Button>
              <Button 
                color="danger" 
                onPress={handleDeleteFlowAndBack}
                className="flex-1"
              >
                {t('flowEditor.deleteFlow') || 'Delete Flow'}
              </Button>
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>
    </div>
  )
}
