"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { ArrowLeft, Edit, Plus, Eye, ChevronDown, Trash2, MoreVertical, X, Search, Calendar, GitBranch, Settings } from "lucide-react"
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
  Checkbox,
  Chip,
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@heroui/react"
import ItemInteraction from "./item-interaction"
import ResponsibilityChip from "./responsibility-chip"
import { useTranslation } from "../hooks/useTranslation"
import { useRouter } from "next/navigation"
import { useTeamsAuth } from "../providers/teams-auth"
import { useGroups } from "../providers"

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

interface FlowTableProps {
  flow: Flow
  onBack: () => void
  onEditFlow: () => void
  onUpdateFlow: (flow: Flow) => Promise<void>
  openItemId?: string
  openNodeId?: string
}

interface DateFilter {
  from?: string
  to?: string
}

interface FilterState {
  [key: string]: {
    type: "checkbox" | "text" | "date" | "select"
    values?: string[]
    text?: string
    date?: DateFilter
  }
}

export default function FlowTable({ flow, onBack, onEditFlow, onUpdateFlow, openItemId, openNodeId }: FlowTableProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const { currentUser, createPlannerTask, isLoggedIn, searchUsers } = useTeamsAuth()
  // Cache for resolving Graph userIds from email (mirrors logic in item-interaction)
  const emailToUserIdCache = useRef<Map<string, string>>(new Map())
  const resolveUserIdByEmail = async (email: string): Promise<string | null> => {
    if (!email) return null
    const cached = emailToUserIdCache.current.get(email)
    if (cached) return cached
    try {
      const results = await searchUsers(email)
      const exact = results.find(u => (u.mail || u.userPrincipalName)?.toLowerCase() === email.toLowerCase())
      const user = exact || results[0]
      if (user?.id) {
        emailToUserIdCache.current.set(email, user.id)
        return user.id
      }
      return null
    } catch (e) {
      console.warn('[Planner] Failed to resolve user by email', email, e)
      return null
    }
  }
  const { groups } = useGroups()
  const [isAddItemDialogOpen, setIsAddItemDialogOpen] = useState(false)
  const [isCreatingItem, setIsCreatingItem] = useState(false)
  const [isColumnsModalOpen, setIsColumnsModalOpen] = useState(false)
  const [selectedNodeInput, setSelectedNodeInput] = useState<string>("")
  const [isNodeInputDropdownOpen, setIsNodeInputDropdownOpen] = useState(false)
  const [newItemData, setNewItemData] = useState<Record<string, string | boolean>>({})
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [view, setView] = useState<"table" | "item">("table")
  const [deleteConfirmItemId, setDeleteConfirmItemId] = useState<string | null>(null)
  const [deepLinked, setDeepLinked] = useState<boolean>(false)

  const [filters, setFilters] = useState<FilterState>({})
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState<Record<string, boolean>>({})
  const [filterDropdownPos, setFilterDropdownPos] = useState<Record<string, { left: number; top: number }>>({})
  const filterAnchorsRef = useRef<Record<string, HTMLSpanElement | null>>({})
  const [sortByLastUpdate, setSortByLastUpdate] = useState<boolean>(true)

  const initialNode = flow.nodes.find((node) => node.type === "initial")

  // Get all available node inputs that aren't already columns
  const getAvailableNodeInputs = (): Array<{ nodeId: string; nodeName: string; inputLabel: string; inputType: string; key: string }> => {
    const allInputs: Array<{ nodeId: string; nodeName: string; inputLabel: string; inputType: string; key: string }> = []

  flow.nodes.forEach((node) => {
      if (node.data.inputs && node.data.inputs.length > 0) {
        node.data.inputs.forEach((input: any) => {
          const key = `${node.id}-${input.label}`
          const displayKey = `${node.data.label}: ${input.label}`

          // Check if this input is already a column
          if (!flow.columns.includes(key) && !flow.columns.includes(displayKey)) {
            allInputs.push({
              nodeId: node.id,
              nodeName: node.data.label || `${node.type} Node`,
              inputLabel: input.label,
              inputType: input.type,
              key: displayKey,
            })
          }
        })
      }
    })
    return allInputs
  }

  const availableNodeInputs = getAvailableNodeInputs()
  const selectedInput = availableNodeInputs.find((input) => input.key === selectedNodeInput)

  // Get the filter type for a column
  const getColumnFilterType = (columnKey: string): "checkbox" | "text" | "date" | "select" => {
    // Handle special columns
    if (["status", "responsibility", "currentNode"].includes(columnKey)) {
      return "select"
    }

    if (columnKey === "created") {
      return "date"
    }
    if (columnKey === "lastUpdate") {
      return "date"
    }

    // Handle initial node inputs
    if (initialNode?.data?.inputs) {
      const input = initialNode.data.inputs.find((inp: any) => inp.label === columnKey)
      if (input) {
        switch (input.type) {
          case "checkbox":
            return "checkbox"
          case "date":
            return "date"
          case "number":
          case "email":
          case "text":
          case "textarea":
            return "text"
          default:
            return "text"
        }
      }
    }

    // Handle custom columns (node input fields)
    if (columnKey.includes(": ")) {
      const [nodeName, inputName] = columnKey.split(": ")
      const node = flow.nodes.find((n) => n.data.label === nodeName)
      if (node && node.data.inputs) {
        const input = node.data.inputs.find((inp: any) => inp.label === inputName)
        if (input) {
          switch (input.type) {
            case "checkbox":
              return "checkbox"
            case "date":
              return "date"
            case "number":
            case "email":
            case "text":
            case "textarea":
              return "text"
            default:
              return "text"
          }
        }
      }
    }

    return "text"
  }

  // Toggle a filter dropdown and compute its fixed position anchored to the filter button
  const toggleFilterDropdown = (columnKey: string) => {
    const el = filterAnchorsRef.current[columnKey]
    const rect = el?.getBoundingClientRect()
    const nextOpen = !isFilterDropdownOpen[columnKey]
    // Close all then open the requested one
    setIsFilterDropdownOpen((_) => ({ [columnKey]: nextOpen }))
    if (rect && nextOpen) {
      const viewportLeft = Math.max(8, Math.min(rect.left, (typeof window !== 'undefined' ? window.innerWidth : rect.left + 320) - 320 - 8))
      const viewportTop = rect.bottom + 6
      setFilterDropdownPos((prev) => ({ ...prev, [columnKey]: { left: viewportLeft, top: viewportTop } }))
    }
  }

  // Helper: compute if current user can act on this item (belongs to any active node responsibility or to an accept_any group)
  const getUserEmails = useMemo(() => {
    const emails: string[] = []
    if (currentUser?.mail) emails.push(String(currentUser.mail))
    if (currentUser?.userPrincipalName) emails.push(String(currentUser.userPrincipalName))
    return emails.map(e => e.trim().toLowerCase()).filter(Boolean)
  }, [currentUser])

  const isUserInGroup = (group: any): boolean => {
    if (!group || !Array.isArray(group.members) || getUserEmails.length === 0) return false
    return group.members.some((m: any) => {
      const em = String(m?.email || "").trim().toLowerCase()
      return em && getUserEmails.includes(em)
    })
  }

  const userCanActOnItem = (item: any): boolean => {
    try {
      if (!currentUser) return false
      const gs = Array.isArray(groups) ? groups : []
      // Accept-any groups take precedence
      const anyGroup = gs.some((g: any) => !!g?.accept_any && isUserInGroup(g))
      if (anyGroup) return true

      // Gather responsibilities from current active nodes
      const info = getCurrentNodesAndResponsibilities(item)
      const respIds = new Set<string>()
      info.forEach(i => (i.responsibilities || []).forEach((rid: string) => rid && respIds.add(rid)))
      if (respIds.size === 0) return false
      // Check membership in any of those groups
      for (const rid of Array.from(respIds)) {
        const g = gs.find((gr: any) => gr.id === rid)
        if (g && isUserInGroup(g)) return true
      }
      return false
    } catch {
      return false
    }
  }

  // --- Date helper for rendering date columns ---
  const toMillis = (val: any): number => {
    if (!val) return 0
    if (val instanceof Date) return val.getTime()
    if (typeof val === 'number') return val
    if (typeof val === 'string') {
      const s = val.includes('T') ? val : val.replace(' ', 'T')
      const t = Date.parse(s)
      return isNaN(t) ? 0 : t
    }
    return 0
  }

  const getDateValueForColumn = (item: any, columnKey: string): string | null => {
    if (columnKey === "created") return item.createdAt || null
  if (columnKey === "lastUpdate") return item.updatedAt || (item as any).updated_at || item.createdAt || null
    // Initial node inputs
    if (initialNode?.data?.inputs?.some((input: any) => input.label === columnKey)) {
      return item.data?.[columnKey] || null
    }
    // Custom columns in format "NodeName: InputName"
    if (columnKey.includes(": ")) {
      const [nodeName, inputName] = columnKey.split(": ")
      const node = flow.nodes.find((n: any) => n.data.label === nodeName)
      if (node) {
        const compositeKey = `${node.id}::${inputName}`
        if (item.data && Object.prototype.hasOwnProperty.call(item.data, compositeKey)) {
          return item.data[compositeKey] || null
        }
      }
      return null
    }
    return item.data?.[columnKey] || null
  }

  const renderDateValue = (value: string | null) => {
    if (!value) return <span className="text-default-400">-</span>
    const dt = new Date(value)
    const display = isNaN(dt.getTime()) ? String(value) : dt.toLocaleDateString()
    return <span>{display}</span>
  }

  const addColumn = async () => {
    if (!selectedNodeInput.trim()) return

    const updatedFlow = {
      ...flow,
      columns: [...flow.columns, selectedNodeInput],
    }
    
    try {
      await onUpdateFlow(updatedFlow)
      // Only clear form and close dialog if update succeeds
      setSelectedNodeInput("")
      setIsNodeInputDropdownOpen(false)
  // no view switch needed anymore (single modal)
    } catch (error) {
      console.error('Failed to add column:', error)
      alert(`Failed to add column: ${error instanceof Error ? error.message : 'Unknown error'}\n\nYour changes have been preserved. Please try again.`)
    }
  }

  const deleteColumn = async (columnToDelete: string) => {
    const updatedFlow = {
      ...flow,
      columns: flow.columns.filter((column) => column !== columnToDelete),
    }
    
    try {
      await onUpdateFlow(updatedFlow)
    } catch (error) {
      console.error('Failed to delete column:', error)
      alert(`Failed to delete column: ${error instanceof Error ? error.message : 'Unknown error'}\n\nYour changes have been preserved. Please try again.`)
    }
  }

  const deleteItem = async (itemId: string) => {
    const updatedFlow = {
      ...flow,
      items: flow.items.filter((item) => item.id !== itemId),
    }
    
    try {
      await onUpdateFlow(updatedFlow)
    } catch (error) {
      console.error('Failed to delete item:', error)
      alert(`Failed to delete item: ${error instanceof Error ? error.message : 'Unknown error'}\n\nYour changes have been preserved. Please try again.`)
    }
  }

  const getNextNode = (currentNodeId: string): any => {
    const outgoingEdges = flow.edges.filter((edge) => edge.source === currentNodeId)
    if (outgoingEdges.length === 0) return null

    // If there's only one outgoing edge, get the target node
    if (outgoingEdges.length === 1) {
      const targetNode = flow.nodes.find((node) => node.id === outgoingEdges[0].target)
      if (!targetNode) return null

      // If the target is a convergence node, find the next actual node
      if (targetNode.type === "convergence") {
        return getNextNode(targetNode.id)
      }

      return targetNode
    }

    // If there are multiple edges, return the first non-convergence node
    for (const edge of outgoingEdges) {
      const targetNode = flow.nodes.find((node) => node.id === edge.target)
      if (targetNode && targetNode.type !== "convergence") {
        return targetNode
      }
    }

    // If all targets are convergence nodes, recursively find the next node
    for (const edge of outgoingEdges) {
      const nextNode = getNextNode(edge.target)
      if (nextNode) {
        return nextNode
      }
    }

    return null
  }

  const addItem = async () => {
  if (isCreatingItem) return
  setIsCreatingItem(true)
    if (!initialNode) return

    const requiredInputs = initialNode.data.inputs?.filter((input: any) => input.required) || []
    const missingInputs = requiredInputs.filter((input: any) => {
      const value = newItemData[input.label]
      if (input.type === "checkbox") {
        return value === undefined || value === null
      }
      return !value || (typeof value === "string" && !value.trim())
    })

    if (missingInputs.length > 0) {
      alert(`Please fill in required fields: ${missingInputs.map((input: any) => input.label).join(", ")}`)
      return
    }
    // Determine first actionable node
    const nextNode = getNextNode(initialNode.id)
    const currentNodeId = nextNode ? nextNode.id : initialNode.id
    const itemId = Date.now().toString()
    const newItem = {
      id: itemId,
      data: { ...newItemData },
      currentNodeId: currentNodeId,
      status: nextNode ? "active" : "completed",
      history: [initialNode.id],
      createdAt: new Date().toISOString(),
    }
        // Attempt initial Planner task creation for ALL first actionable nodes BEFORE persisting item
        try {
          const planId = (flow as any)?.plannerPlanId
          const bucketId = (flow as any)?.plannerBucketId
          if (isLoggedIn && planId && bucketId) {
            // Determine next active nodes (similar to item-interaction logic)
            const firstNode = flow.nodes.find((n: any) => n.id === currentNodeId)
            const initialTargets: any[] = []
            if (firstNode && firstNode.type !== 'convergence' && currentNodeId !== initialNode.id) {
              initialTargets.push(firstNode)
            }
            // (Could extend for parallel start scenarios if needed later)
            if (initialTargets.length > 0) {
              let localGroups: any[] = Array.isArray(groups) ? groups : []
              const deadlinesObj: Record<string, number> | null = (flow as any)?.deadlines || null
              const resolveDateByDeadlineKey = (key: string): string | undefined => {
                const dataObj = (newItem as any).data || {}
                if (!dataObj || typeof dataObj !== 'object') return undefined
                const trimmed = key.trim()
                if (dataObj[trimmed]) return dataObj[trimmed] as string
                if (trimmed.includes(': ')) {
                  const [nodeName, inputName] = trimmed.split(': ')
                  const node = flow.nodes.find((n: any) => n.data?.label === nodeName)
                  if (node) {
                    const composite = `${node.id}::${inputName}`
                    if (Object.prototype.hasOwnProperty.call(dataObj, composite)) return dataObj[composite] as string
                  }
                }
                const candidate = trimmed.includes(': ') ? trimmed.split(': ').slice(-1)[0] : trimmed
                for (const k of Object.keys(dataObj)) {
                  if (k.endsWith(`::${candidate}`)) return dataObj[k] as string
                }
                return undefined
              }
              const computeDueDate = (): string | undefined => {
                if (!deadlinesObj || typeof deadlinesObj !== 'object') return undefined
                
                // Handle new deadline format: {field: "fieldname", days: number}
                if (deadlinesObj.field && deadlinesObj.days) {
                  const fieldName = deadlinesObj.field;
                  const days = deadlinesObj.days;
                  
                  if (typeof days === 'number' && days > 0) {
                    // First check if the field actually exists in the flow nodes
                    const fieldExists = (() => {
                      // Check if field exists in any node's inputs
                      for (const node of flow.nodes) {
                        const inputs = node.data?.inputs || [];
                        for (const input of inputs) {
                          if (input.type === 'date') {
                            // Check direct label match
                            if (input.label === fieldName) return true;
                            // Check composite format "NodeName: InputName"
                            const composite = `${node.data?.label}: ${input.label}`;
//                            if (composite === fieldName) return true;
                          }
                        }
                      }
                      return false;
                    })();
                    
                    if (!fieldExists) {
                      if (process && process.env.NODE_ENV !== 'production') {
                        console.log('[Planner][NewFormat] Field not found in flow nodes:', fieldName, '- skipping deadline');
                      }
                      return undefined;
                    }
                    
                    // Try to resolve the field value from the item data
                    const rawVal = resolveDateByDeadlineKey(String(fieldName));
                    if (rawVal) {
                      const parsed = new Date(rawVal);
                      if (!isNaN(parsed.getTime())) {
                        const d = new Date(parsed);
                        d.setDate(d.getDate() + days);
                        d.setUTCHours(23, 59, 59, 0);
                        if (process && process.env.NODE_ENV !== 'production') {
                          console.log('[Planner][NewFormat] Using field', fieldName, 'days', days, 'due', d.toISOString());
                        }
                        return d.toISOString();
                      }
                    }
                    
                    if (process && process.env.NODE_ENV !== 'production') {
                      console.log('[Planner][NewFormat] Field exists but no value found:', fieldName, '- skipping deadline');
                    }
                    return undefined;
                  }
                  return undefined;
                }
                
                // Legacy format handling for backward compatibility
                if (Object.prototype.hasOwnProperty.call(deadlinesObj, 'universal')) {
                  const days = deadlinesObj['universal']
                  if (typeof days === 'number' && days > 0) {
                    let baseDateStr: string | undefined
                    try {
                      const initInputs = initialNode?.data?.inputs || []
                      const firstDateInput = initInputs.find((inp: any) => inp.type === 'date')
                      if (firstDateInput) {
                        const v = (newItem as any).data?.[firstDateInput.label]
                        if (v) baseDateStr = v
                      }
                    } catch {}
                    const d = baseDateStr ? new Date(baseDateStr) : new Date(newItem.createdAt)
                    d.setDate(d.getDate() + days)
                    d.setUTCHours(23, 59, 59, 0)
                    return d.toISOString()
                  }
                  return undefined
                }
                if (process && process.env.NODE_ENV !== 'production') {
                  console.log('[Planner][InitialDueLookup] Data keys:', Object.keys((newItem as any).data || {}))
                  console.log('[Planner][InitialDueLookup] Deadlines entries:', deadlinesObj)
                }
                for (const [label, days] of Object.entries(deadlinesObj)) {
                  if (label === 'universal') continue
                  if (typeof days !== 'number' || days <= 0) continue
                  const rawVal = resolveDateByDeadlineKey(label)
                  if (process && process.env.NODE_ENV !== 'production') {
                    console.log('[Planner][InitialDueLookup] Try label', label, 'found value?', !!rawVal, 'value:', rawVal)
                  }
                  if (!rawVal) continue
                  const parsed = new Date(rawVal)
                  if (isNaN(parsed.getTime())) continue
                  const d = new Date(parsed)
                  d.setDate(d.getDate() + days)
                  d.setUTCHours(23, 59, 59, 0)
                  if (process && process.env.NODE_ENV !== 'production') {
                    console.log('[Planner][InitialDueLookup] Matched label', label, 'days', days, 'due', d.toISOString())
                  }
                  return d.toISOString()
                }
                return undefined
              }
              const mapping: Record<string, string> = {}
              for (const targetNode of initialTargets) {
                // Resolve assignees
                const respIds: string[] = targetNode.data?.responsibilities || (targetNode.data?.responsibility ? [targetNode.data.responsibility] : [] )
                const assigneeEmails = (localGroups || [])
                  .filter((g: any) => respIds.map(String).includes(String(g.id)))
                  .flatMap((g: any) => g.members?.map((m: any) => String(m.email || '').trim()).filter(Boolean) || [])
                const uniqueEmails = Array.from(new Set(assigneeEmails)).slice(0, 10)
                const assigneeIds: string[] = []
                for (const em of uniqueEmails) {
                  const uid = await resolveUserIdByEmail(em)
                  if (uid) assigneeIds.push(uid)
                }
                let titlePrefix = ''
                const firstInitInputLabel = initialNode?.data?.inputs?.[0]?.label
                if (firstInitInputLabel) {
                  const val = newItem.data?.[firstInitInputLabel]
                  if (val !== undefined && val !== null && String(val).trim() !== '') titlePrefix = String(val).trim()
                }
                if (!titlePrefix) titlePrefix = newItem.id
                const baseNodeTitle = targetNode?.data?.label || targetNode.id
                const fullTitle = `${titlePrefix} – ${baseNodeTitle}`
                const due = computeDueDate()
                if (!due && process && process.env.NODE_ENV !== 'production') {
                  console.log('[Planner][InitialDueLookup] No due date resolved (creating task without deadline)')
                }
                if (process && process.env.NODE_ENV !== 'production') {
                  console.log('[Planner][DebugFlow] Flow planner config:', {
                    plannerTeamId: (flow as any)?.plannerTeamId,
                    plannerChannelId: (flow as any)?.plannerChannelId,
                    plannerPlanId: (flow as any)?.plannerPlanId,
                    plannerBucketId: (flow as any)?.plannerBucketId
                  });
                }
                const openUrl = (typeof window !== 'undefined')
                  ? await (window as any)?.teamsAuthService?.getFlowDeepLink?.(flow.id, newItem.id, targetNode.id, (flow as any)?.plannerTeamId, (flow as any)?.plannerChannelId) || ''
                  : ''
                const description = `Created by Flow Creator\nFlow: ${flow?.name}\nItem: ${newItem.id}`
                const startDateTime = new Date().toISOString()
                try {
                  const task = await createPlannerTask(planId, bucketId, fullTitle, assigneeIds, due, { description, openUrl, openUrlAlias: 'Apri il nodo' }, startDateTime)
                  if (task?.id) {
                    mapping[targetNode.id] = task.id
                  }
                } catch (e) {
                  console.warn('[Planner] Initial task creation failed for node', targetNode.id, e)
                }
              }
              if (Object.keys(mapping).length > 0) {
                const existing = (newItem as any).data?.plannerTasks || {}
                ;(newItem as any).data = { ...(newItem as any).data, plannerTasks: { ...existing, ...mapping } }
              }
            }
          }
        } catch (plannerOuter) {
          console.warn('[Planner] Skipped initial multi-node planner task logic due to error:', plannerOuter)
    }

    const updatedFlow = {
      ...flow,
      items: [...flow.items, newItem],
    }

    try {
      await onUpdateFlow(updatedFlow)
      setNewItemData({})
      setIsAddItemDialogOpen(false)
    } catch (error) {
      console.error('Failed to add item:', error)
      alert(`Failed to add item: ${error instanceof Error ? error.message : 'Unknown error'}\n\nYour item has been preserved. Please try again.`)
    } finally {
      setIsCreatingItem(false)
    }
  }

  const updateItem = async (updatedItem: any) => {
    const updatedFlow = {
      ...flow,
      items: flow.items.map((item) => (item.id === updatedItem.id ? updatedItem : item)),
    }
    
    try {
      await onUpdateFlow(updatedFlow)
      // Only update selected item if update succeeds
      setSelectedItem(updatedItem)
    } catch (error) {
      console.error('Failed to update item:', error)
      alert(`Failed to update item: ${error instanceof Error ? error.message : 'Unknown error'}\n\nYour changes have been preserved. Please try again.`)
    }
  }

  const handleInputChange = (inputLabel: string, value: string | boolean) => {
    setNewItemData((prev) => ({
      ...prev,
      [inputLabel]: value,
    }))
  }

  const renderInputField = (input: any) => {
    const value = newItemData[input.label] !== undefined ? newItemData[input.label] : ""

    switch (input.type) {
      case "textarea":
        return (
          <Textarea
            value={value as string}
            onValueChange={(val) => handleInputChange(input.label, val)}
            placeholder={`Enter ${input.label}`}
            isRequired={input.required}
          />
        )
      case "number":
        return (
          <Input
            type="number"
            value={value as string}
            onValueChange={(val) => handleInputChange(input.label, val)}
            placeholder={`Enter ${input.label}`}
            isRequired={input.required}
          />
        )
      case "email":
        return (
          <Input
            type="email"
            value={value as string}
            onValueChange={(val) => handleInputChange(input.label, val)}
            placeholder={`Enter ${input.label}`}
            isRequired={input.required}
          />
        )
      case "date":
        return (
          <Input
            type="date"
            value={value as string}
            onValueChange={(val) => handleInputChange(input.label, val)}
            isRequired={input.required}
          />
        )
      case "checkbox":
        return (
          <Checkbox
            isSelected={value === true || value === "true"}
            onValueChange={(checked) => handleInputChange(input.label, checked)}
          >
            {input.label}
          </Checkbox>
        )
      default:
        return (
          <Input
            type="text"
            value={value as string}
            onValueChange={(val) => handleInputChange(input.label, val)}
            placeholder={`Enter ${input.label}`}
            isRequired={input.required}
          />
        )
    }
  }

  // Helper: can the item access the given convergence node (all its parents completed)?
  const canAccessConvergenceNodeForItem = (nodeId: string, item: any) => {
    const node = flow.nodes.find((n: any) => n.id === nodeId)
    if (node?.type !== "convergence") return true
    const incomingEdges = flow.edges.filter((edge: any) => edge.target === nodeId)
    return incomingEdges.every((edge: any) => item.history?.includes(edge.source))
  }

  // Helper: compute all active nodes for an item based on history, pathTaken, and convergence rules
  const getAllActiveNodesForItem = (item: any) => {
    const activeNodes: any[] = []

    for (const node of flow.nodes) {
      if (node.type === "convergence") continue
      if (item.history?.includes(node.id)) continue

      const incomingEdges = flow.edges.filter((edge: any) => edge.target === node.id)

      if (incomingEdges.length === 0) {
        // Roots are active if not in history and not the initial node already done
        activeNodes.push(node)
      } else if (incomingEdges.length === 1) {
        const edge = incomingEdges[0]
        const parentNode = flow.nodes.find((n: any) => n.id === edge.source)

        if (parentNode?.type === "convergence") {
          if (canAccessConvergenceNodeForItem(parentNode.id, item)) {
            activeNodes.push(node)
          }
        } else {
          const parentCompleted = item.history?.includes(edge.source)
          if (parentNode?.type === "conditional" && parentCompleted) {
            if (item.pathTaken && item.pathTaken.includes(edge.id)) {
              activeNodes.push(node)
            }
          } else if (parentNode?.type === "parallel" && parentCompleted) {
            if (item.pathTaken && item.pathTaken.includes(edge.id)) {
              activeNodes.push(node)
            }
          } else if (parentCompleted) {
            activeNodes.push(node)
          }
        }
      } else {
        // Multiple parents
        const hasValidPath = incomingEdges.some((edge: any) => {
          const parentNode = flow.nodes.find((n: any) => n.id === edge.source)
          if (parentNode?.type === "convergence") {
            return canAccessConvergenceNodeForItem(parentNode.id, item)
          } else {
            return item.pathTaken && item.pathTaken.includes(edge.id) && item.history?.includes(edge.source)
          }
        })
        if (hasValidPath) activeNodes.push(node)
      }
    }

    return activeNodes
  }

  const getCurrentNodesAndResponsibilities = (item: any) => {
    const results: Array<{
      nodeId: string
      nodeName: string
      responsibilities: string[]
      pathInfo: string | null
    }> = []

    // If the flow is completed, return empty results (no responsibility)
    if (item.status === "completed") {
      return results
    }

    if (item.parallelPaths) {
      for (const [parallelNodeId, paths] of Object.entries(item.parallelPaths)) {
        const pathArray = paths as any[]
        // Filter out completed paths AND paths where the current node is already completed
        const activePaths = pathArray.filter((path: any) => {
          if (path.completed) return false
          
          // Also check if the current node of this path is already in the history (completed)
          if (path.currentNode && item.history.includes(path.currentNode)) {
            return false
          }
          
          return true
        })

        for (const path of activePaths) {
          const currentNode = flow.nodes.find((node) => node.id === path.currentNode)
          if (currentNode && currentNode.type !== "convergence") {
            const allResponsibilities = [
              ...(currentNode.data?.responsibilities || []),
              ...(currentNode.data?.responsibility ? [currentNode.data.responsibility] : []),
            ].filter((resp, index, arr) => arr.indexOf(resp) === index)

            results.push({
              nodeId: currentNode.id,
              nodeName: currentNode.data?.label || t('common.unknown'),
              responsibilities: allResponsibilities,
              pathInfo: null,
            })
          }
        }
      }
    }

    if (results.length === 0) {
      // For non-parallel flows, get the actual current node
      let currentNodeId = item.currentNodeId
      
      // If the current node is a convergence node, find the next actual node
      const currentNode = flow.nodes.find((node) => node.id === currentNodeId)
      if (currentNode?.type === "convergence") {
        // Find the next node after convergence
        const outgoingEdges = flow.edges.filter((edge) => edge.source === currentNodeId)
        if (outgoingEdges.length > 0) {
          const nextNode = flow.nodes.find((node) => node.id === outgoingEdges[0].target)
          if (nextNode && nextNode.type !== "convergence") {
            currentNodeId = nextNode.id
          }
        }
      }
      
      const finalCurrentNode = flow.nodes.find((node) => node.id === currentNodeId)
      if (finalCurrentNode && finalCurrentNode.type !== "convergence") {
        const allResponsibilities = [
          ...(finalCurrentNode.data?.responsibilities || []),
          ...(finalCurrentNode.data?.responsibility ? [finalCurrentNode.data.responsibility] : []),
        ].filter((resp, index, arr) => arr.indexOf(resp) === index)

        results.push({
          nodeId: finalCurrentNode.id,
          nodeName: finalCurrentNode.data?.label || t('common.unknown'),
          responsibilities: allResponsibilities,
          pathInfo: null,
        })
      }
      
      // If still no results and the item is active, compute active nodes precisely (not the first by chance)
      if (results.length === 0 && item.status === "active") {
        const activeNodes = getAllActiveNodesForItem(item)
        if (activeNodes.length > 0) {
          activeNodes.forEach((activeNode: any) => {
            const allResponsibilities = [
              ...(activeNode.data?.responsibilities || []),
              ...(activeNode.data?.responsibility ? [activeNode.data.responsibility] : []),
            ].filter((resp: any, index: number, arr: any[]) => arr.indexOf(resp) === index)

            results.push({
              nodeId: activeNode.id,
              nodeName: activeNode.data?.label || t('common.unknown'),
              responsibilities: allResponsibilities,
              pathInfo: null,
            })
          })
        }
      }
    }

    return results
  }

  // Get unique values for select-type filters
  const getUniqueColumnValues = (columnKey: string) => {
    const values = new Set<string>()

    flow.items.forEach((item) => {
      let value: string | null = null

      switch (columnKey) {
        case "status":
          value = item.status || "active"
          break
        case "responsibility":
          {
            const currentNodesInfo = getCurrentNodesAndResponsibilities(item)
            const gs = Array.isArray(groups) ? groups : []
            currentNodesInfo.forEach((nodeInfo) => {
              nodeInfo.responsibilities.forEach((respId: string) => {
                const group = gs.find((g: any) => g.id === respId)
                if (group?.name) {
                  values.add(String(group.name))
                } else {
                  // Fallback to ID if name missing
                  if (respId) values.add(respId)
                }
              })
            })
            return Array.from(values).sort()
          }
        case "currentNode":
          const nodeInfo = getCurrentNodesAndResponsibilities(item)
          nodeInfo.forEach((info) => values.add(info.nodeName))
          break
        default:
          // Handle initial node inputs and custom columns
          if (initialNode?.data?.inputs?.some((input: any) => input.label === columnKey)) {
            const inputValue = item.data[columnKey]
            if (inputValue !== undefined && inputValue !== null && inputValue !== "") {
              if (typeof inputValue === "boolean") {
                value = inputValue ? t('common.yes') : t('common.no')
              } else {
                value = String(inputValue)
              }
              values.add(value)
            }
          } else if (columnKey.includes(": ")) {
            // Handle node input columns
            const columnValue = getColumnValue(item, columnKey)
            if (columnValue !== "-") {
              values.add(columnValue)
            }
          }
          break
      }

  if (value && value !== "-") {
        values.add(value)
      }
    })

    return Array.from(values).sort()
  }

  // Get raw value for filtering
  const getRawColumnValue = (item: any, columnKey: string) => {
    switch (columnKey) {
      case "status":
        return item.status || "active"
      case "responsibility":
        {
          const currentNodesInfo = getCurrentNodesAndResponsibilities(item)
          const gs = Array.isArray(groups) ? groups : []
          const responsibilityNames: string[] = []
          currentNodesInfo.forEach((nodeInfo) => {
            nodeInfo.responsibilities.forEach((respId: string) => {
              const group = gs.find((g: any) => g.id === respId)
              if (group?.name) responsibilityNames.push(String(group.name))
              else if (respId) responsibilityNames.push(respId)
            })
          })
          return responsibilityNames
        }
      case "currentNode":
        const nodeInfo = getCurrentNodesAndResponsibilities(item)
        return nodeInfo.map((info) => info.nodeName)
      case "created":
        return item.createdAt
      case "lastUpdate":
        return item.updatedAt || (item as any).updated_at || item.createdAt
      default:
        // Handle initial node inputs
        if (initialNode?.data?.inputs?.some((input: any) => input.label === columnKey)) {
          return item.data[columnKey]
        }
        // Handle custom columns
        if (columnKey.includes(": ")) {
          const [nodeName, inputName] = columnKey.split(": ")
          const node = flow.nodes.find((n) => n.data.label === nodeName)
          if (node) {
            const compositeKey = `${node.id}::${inputName}`
            if (Object.prototype.hasOwnProperty.call(item.data || {}, compositeKey)) {
              return item.data[compositeKey]
            }
            return undefined
          }
        }
        return item.data[columnKey]
    }
  }

  // Filter items based on active filters
  const getFilteredItems = () => {
    return flow.items.filter((item) => {
      return Object.entries(filters).every(([columnKey, filterConfig]) => {
        const rawValue = getRawColumnValue(item, columnKey)

        switch (filterConfig.type) {
          case "select":
            if (!filterConfig.values || filterConfig.values.length === 0) return true
            if (Array.isArray(rawValue)) {
              return rawValue.some((val) => filterConfig.values!.includes(val))
            }
            return filterConfig.values.includes(String(rawValue))

          case "checkbox":
            if (!filterConfig.values || filterConfig.values.length === 0) return true
            const boolValue = rawValue === true || rawValue === "true"
            const displayValue = boolValue ? t('common.yes') : t('common.no')
            return filterConfig.values.includes(displayValue)

          case "text":
            if (!filterConfig.text || filterConfig.text.trim() === "") return true
            const searchText = filterConfig.text.toLowerCase()
            const itemText = String(rawValue || "").toLowerCase()
            return itemText.includes(searchText)

          case "date":
            if (!filterConfig.date || (!filterConfig.date.from && !filterConfig.date.to)) return true
            if (!rawValue) return true // Skip items without date values
            
            const itemDate = new Date(rawValue as string)
            if (isNaN(itemDate.getTime())) return true // Skip invalid dates
            
            const fromDate = filterConfig.date.from ? new Date(filterConfig.date.from) : null
            const toDate = filterConfig.date.to ? new Date(filterConfig.date.to) : null

            if (fromDate && !isNaN(fromDate.getTime()) && itemDate < fromDate) return false
            if (toDate && !isNaN(toDate.getTime()) && itemDate > toDate) return false
            return true

          default:
            return true
        }
      })
    })
  }

  const updateFilter = (columnKey: string, filterType: "checkbox" | "text" | "date" | "select", update: any) => {
    setFilters((prev) => ({
      ...prev,
      [columnKey]: {
        ...prev[columnKey],
        ...update,
        type: filterType,
      },
    }))
  }

  const toggleSelectFilter = (columnKey: string, value: string) => {
    const currentFilter = filters[columnKey]
    const currentValues = currentFilter?.values || []
    const newValues = currentValues.includes(value)
      ? currentValues.filter((v) => v !== value)
      : [...currentValues, value]

    updateFilter(columnKey, "select", { values: newValues })
  }

  const clearAllFilters = () => {
    setFilters({})
  }

  const getActiveFilterCount = () => {
    return Object.values(filters).reduce((count, filter) => {
      switch (filter.type) {
        case "select":
        case "checkbox":
          return count + (filter.values?.length || 0)
        case "text":
          return count + (filter.text ? 1 : 0)
        case "date":
          return count + (filter.date?.from || filter.date?.to ? 1 : 0)
        default:
          return count
      }
    }, 0)
  }

  // Function to get the value for a column from item data
  const getColumnValue = (item: any, column: string) => {
    // Check if it's a node input column (format: "NodeName: InputName")
    if (column.includes(": ")) {
      const [nodeName, inputName] = column.split(": ")
      const node = flow.nodes.find((n) => n.data.label === nodeName)

      if (node && node.data.inputs) {
        const input = node.data.inputs.find((inp: any) => inp.label === inputName)
        const compositeKey = `${node.id}::${inputName}`
        const hasComposite = Object.prototype.hasOwnProperty.call(item.data || {}, compositeKey)
        const value = hasComposite ? item.data[compositeKey] : undefined

        if (input?.type === "checkbox") {
          return value === true || value === "true" ? "✓" : hasComposite ? "✗" : "-"
        }
        return value !== undefined && value !== null && String(value) !== '' ? value : "-"
      }
    }

    // Regular column
    return item.data[column] || "-"
  }

  const renderFilterDropdown = (columnKey: string, header: string) => {
    const filterType = getColumnFilterType(columnKey)
    const currentFilter = filters[columnKey]

    switch (filterType) {
      case "select":
        const uniqueValues = getUniqueColumnValues(columnKey)
        return (
          <div className="p-2">
            <div className="text-xs text-default-500 p-2 border-b mb-2">
              {t('items.filterBy', { field: header })}
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {uniqueValues.map((value) => (
                <label key={value} className="flex items-center gap-2 p-2 hover:bg-default-100 rounded cursor-pointer">
                  <Checkbox
                    size="sm"
                    isSelected={currentFilter?.values?.includes(value) || false}
                    onValueChange={() => toggleSelectFilter(columnKey, value)}
                  />
                  <span className="text-sm flex-1">{value}</span>
                </label>
              ))}
            </div>
            {(currentFilter?.values?.length ?? 0) > 0 && (
              <div className="border-t mt-2 pt-2">
                <Button
                  size="sm"
                  variant="light"
                  color="danger"
                  className="w-full"
                  onPress={() => updateFilter(columnKey, "select", { values: [] })}
                >
                  {t('items.clearFilter', { field: header })}
                </Button>
              </div>
            )}
          </div>
        )

      case "checkbox":
        return (
          <div className="p-2">
            <div className="text-xs text-default-500 p-2 border-b mb-2">Filter by {header}</div>
            <div className="space-y-1">
              {[t('common.yes'), t('common.no')].map((value) => (
                <label key={value} className="flex items-center gap-2 p-2 hover:bg-default-100 rounded cursor-pointer">
                  <Checkbox
                    size="sm"
                    isSelected={currentFilter?.values?.includes(value) || false}
                    onValueChange={() => {
                      const currentValues = currentFilter?.values || []
                      const newValues = currentValues.includes(value)
                        ? currentValues.filter((v) => v !== value)
                        : [...currentValues, value]
                      updateFilter(columnKey, "checkbox", { values: newValues })
                    }}
                  />
                  <span className="text-sm flex-1">{value}</span>
                </label>
              ))}
            </div>
            {(currentFilter?.values?.length ?? 0) > 0 && (
              <div className="border-t mt-2 pt-2">
                <Button
                  size="sm"
                  variant="light"
                  color="danger"
                  className="w-full"
                  onPress={() => updateFilter(columnKey, "checkbox", { values: [] })}
                >
                  {t('items.clearFilter', { field: header })}
                </Button>
              </div>
            )}
          </div>
        )

      case "text":
        return (
          <div className="p-3">
            <div className="text-xs text-default-500 mb-2">{t('items.searchIn', { field: header })}</div>
            <Input
              size="sm"
              placeholder={t('items.searchPlaceholder', { field: header.toLowerCase() })}
              value={currentFilter?.text || ""}
              onValueChange={(value) => updateFilter(columnKey, "text", { text: value })}
              startContent={<Search className="w-3 h-3 text-default-400" />}
            />
            {currentFilter?.text && (
              <div className="mt-2">
                <Button
                  size="sm"
                  variant="light"
                  color="danger"
                  className="w-full"
                  onPress={() => updateFilter(columnKey, "text", { text: "" })}
                >
                  {t('items.clearSearch')}
                </Button>
              </div>
            )}
          </div>
        )

      case "date":
        return (
          <div className="p-3">
            <div className="text-xs text-default-500 mb-2">{t('items.filterByRange', { field: header })}</div>
            <div className="space-y-2">
              <Input
                size="sm"
                type="date"
                label={t('common.from')}
                value={currentFilter?.date?.from || ""}
                onValueChange={(value) =>
                  updateFilter(columnKey, "date", {
                    date: { ...currentFilter?.date, from: value },
                  })
                }
                startContent={<Calendar className="w-3 h-3 text-default-400" />}
              />
              <Input
                size="sm"
                type="date"
                label={t('common.to')}
                value={currentFilter?.date?.to || ""}
                onValueChange={(value) =>
                  updateFilter(columnKey, "date", {
                    date: { ...currentFilter?.date, to: value },
                  })
                }
                startContent={<Calendar className="w-3 h-3 text-default-400" />}
              />
            </div>
            {(currentFilter?.date?.from || currentFilter?.date?.to) && (
              <div className="mt-2">
                <Button
                  size="sm"
                  variant="light"
                  color="danger"
                  className="w-full"
                  onPress={() => updateFilter(columnKey, "date", { date: {} })}
                >
                  {t('items.clearDateFilter')}
                </Button>
              </div>
            )}
          </div>
        )

      default:
        return null
    }
  }

  // If openItemId is provided, open that item automatically
  useEffect(() => {
    if (openItemId && view === 'table') {
      const it = flow.items.find(i => i.id === openItemId)
      if (it) {
        setSelectedItem(it)
        setView('item')
  setDeepLinked(true)
      }
    }
  }, [openItemId])

  if (view === "item" && selectedItem) {
    return (
      <ItemInteraction
        item={selectedItem}
        flow={flow}
        onBack={() => {
          setView("table")
          setDeepLinked(false)
        }}
        onUpdateItem={async (updatedItem) => {
          const updatedFlow = {
            ...flow,
            items: flow.items.map((i) => (i.id === updatedItem.id ? updatedItem : i)),
          }
          await onUpdateFlow(updatedFlow)
          setSelectedItem(updatedItem)
        }}
        // Pass node deep link if provided
        deepLinkNodeId={deepLinked ? openNodeId : undefined}
  deepLinked={deepLinked}
      />
    )
  }

  // Create column headers
  const headers = [
    t('items.status'),
    ...(initialNode?.data?.inputs?.map((input: any) => input.label) || []),
    t('items.currentNodes'),
    t('items.responsibility'),
    t('items.assignedUsers') || 'Assigned Users',
    ...flow.columns,
    t('common.created'),
  t('common.lastUpdate'),
    t('common.actions'),
  ]

  return (
    <div className="min-h-screen bg-background p-3 sm:p-6">
      <div className="max-w-9xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
          <Button variant="light" onPress={onBack} startContent={<ArrowLeft className="w-4 h-4" />}>
            {t('common.back')}
          </Button>
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-bold">{flow.name}</h1>
            <p className="text-default-600">{flow.description}</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 w-full">
              <h2 className="text-lg font-semibold">{t('items.title')}</h2>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto items-stretch">
                <Popover placement="bottom-end">
                  <PopoverTrigger>
                    <Button
                      isIconOnly
                      variant="bordered"
                      aria-label={t('common.settings') || 'Settings'}
                      className="min-w-10"
                    >
                      <Settings className="w-4 h-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-2 ">
                    <div className="flex flex-col gap-1">
                      <Button
                        variant="light"
                        size="sm"
                        className="justify-start"
                        startContent={<Edit className="w-3 h-3" />}
                        onPress={() => {
                          onEditFlow()
                        }}
                      >
                        {t('flows.editFlow')}
                      </Button>
                      <Button
                        variant="light"
                        size="sm"
                        className="justify-start"
                        onPress={() => setIsColumnsModalOpen(true)}
                      >
                        {t('items.manageColumns')}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                <Button
                  color="primary"
                  onPress={() => setIsAddItemDialogOpen(true)}
                  startContent={<Plus className="w-4 h-4" />}
                  className="w-full sm:w-auto"
                >
                  {t('items.createItem')}
                </Button>
                
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <div className="overflow-x-auto">
              {/* Custom Table Implementation */}
              <div className="min-w-full">
                {/* Filter Summary and Clear Button */}
                

                {/* Column Headers with Filter Dropdowns */}
                <div
                  className="grid gap-4 p-4 bg-default-100 rounded-t-lg font-semibold text-sm"
                  style={{ gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))` }}
                >
                  {headers.map((header, index) => {
                    const columnKey =
                      header === t('items.status')
                        ? "status"
                        : header === t('items.currentNodes')
                          ? "currentNode"
                          : header === t('items.responsibility')
                            ? "responsibility"
                            : header === (t('items.assignedUsers') || 'Assigned Users')
                              ? "assignedUsers"
                            : header === t('common.created')
                              ? "created"
                              : header === t('common.lastUpdate')
                                ? "lastUpdate"
                              : header === t('common.actions')
                                ? "actions"
                                : header

                    const isFilterable = ![t('common.actions'), t('items.assignedUsers') || 'Assigned Users'].includes(header)
                    const filterType = getColumnFilterType(columnKey)
                    const currentFilter = filters[columnKey]
                    const hasFilters =
                      currentFilter &&
                      ((currentFilter.values && currentFilter.values.length > 0) ||
                        (currentFilter.text && currentFilter.text.trim() !== "") ||
                        (currentFilter.date && (currentFilter.date.from || currentFilter.date.to)))

                    return (
                      <div key={index} className="relative">
                        <div className="flex items-center gap-2">
                          <span>{header}</span>
                          {isFilterable && (
                            <div className="relative flex items-center gap-1">
                              <Button
                                isIconOnly
                                size="sm"
                                variant="light"
                                className={`min-w-6 w-6 h-6 ${hasFilters ? "text-primary bg-primary-100" : "text-default-500"}`}
                                onPress={() => toggleFilterDropdown(columnKey)}
                              >
                                {filterType === "text" ? (
                                  <Search className="w-3 h-3" />
                                ) : filterType === "date" ? (
                                  <Calendar className="w-3 h-3" />
                                ) : (
                                  <ChevronDown className="w-3 h-3" />
                                )}
                              </Button>
                              {/* Invisible anchor to compute viewport coordinates */}
                              <span
                                ref={(el) => {
                                  filterAnchorsRef.current[columnKey] = el
                                }}
                                className="absolute -top-2 left-0 w-0 h-0 opacity-0 pointer-events-none"
                                aria-hidden
                              />

                              {isFilterDropdownOpen[columnKey] && (
                                <>
                                  {/* Backdrop to close */}
                                  <div
                                    className="fixed inset-0 z-[9998] bg-transparent"
                                    onClick={() => setIsFilterDropdownOpen({})}
                                  />
                                  {/* Fixed-position dropdown rendered at viewport level */}
                                  <div
                                    className="fixed bg-content1 border border-default-200 rounded-lg shadow-xl z-[9999] min-w-64 max-w-[90vw]"
                                    style={{
                                      left: filterDropdownPos[columnKey]?.left ?? 12,
                                      top: filterDropdownPos[columnKey]?.top ?? 56,
                                    }}
                                  >
                                    {renderFilterDropdown(columnKey, header)}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                          {/* deadline editing moved to columns modal */}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Table Body */}
                <div className="divide-y divide-default-200">
                  {getFilteredItems().length === 0 ? (
                    <div className="text-center py-12">
                      {flow.items.length === 0 ? (
                        <>
                          <p className="text-default-500 mb-4">{t('items.noItems')}</p>
                          <Button color="primary" onPress={() => setIsAddItemDialogOpen(true)}>
                            {t('items.addFirstItem')}
                          </Button>
                        </>
                      ) : (
                        <>
                          <p className="text-default-500 mb-4">{t('items.noMatchingItems')}</p>
                          <Button variant="bordered" onPress={clearAllFilters}>
                            {t('items.clearAllFilters')}
                          </Button>
                        </>
                      )}
                    </div>
                  ) : (
                    (sortByLastUpdate
                      ? [...getFilteredItems()].sort((a, b) => {
                          const ad = toMillis(a.updatedAt || (a as any).updated_at || a.createdAt)
                          const bd = toMillis(b.updatedAt || (b as any).updated_at || b.createdAt)
                          return bd - ad
                        })
                      : getFilteredItems()
                    ).map((item) => {
                      const currentNodesInfo = getCurrentNodesAndResponsibilities(item)
                      const canAct = userCanActOnItem(item)
                      const rowClass = canAct ? "hover:bg-default-50" : "opacity-60"

                      return (
                        <div
                          key={item.id}
                          className={`grid gap-4 p-4 transition-colors ${rowClass}`}
                          style={{ gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))` }}
                        >
                          {/* Status */}
                          <div>
                            <Chip
                              color={
                                item.status === "active"
                                  ? "success"
                                  : item.status === "completed"
                                    ? "primary"
                                    : "default"
                              }
                              size="sm"
                              variant="flat"
                            >
                              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                            </Chip>
                          </div>

                          {/* Initial Node Inputs - moved here */}
                          {initialNode?.data?.inputs?.map((input: any) => (
                            <div key={`initial-${input.label}`}>
                              {input.type === "checkbox"
                                ? item.data[input.label] === true || item.data[input.label] === "true"
                                  ? "✓"
                                  : "✗"
                                : input.type === "date"
                                  ? renderDateValue(item.data[input.label] || null)
                                  : item.data[input.label] || "-"}
                            </div>
                          ))}

                          {/* Current Nodes */}
                          <div>
                            <div className="space-y-1">
                              {item.status === "completed" ? (
                                <span className="text-xs">-</span>
                              ) : currentNodesInfo.length > 0 ? (
                                currentNodesInfo.map((nodeInfo, index) => (
                                  <div key={index} className="text-sm">
                                    {nodeInfo.nodeName}
                                    {nodeInfo.pathInfo && (
                                      <span className="text-xs text-default-500 ml-1">({nodeInfo.pathInfo})</span>
                                    )}
                                  </div>
                                ))
                              ) : (
                                <span className="text-default-400 text-xs">{t('items.noActiveNodes')}</span>
                              )}
                            </div>
                          </div>

                          {/* Responsibility */}
                          <div>
                            <div className="space-y-1">
                              {item.status === "completed" ? (
                                <span className="text-xs">-</span>
                              ) : currentNodesInfo.length > 0 ? (
                                currentNodesInfo.map((nodeInfo, nodeIndex) => (
                                  <div key={nodeIndex} className="flex flex-wrap gap-1">
                                    {nodeInfo.responsibilities.map((respId: string, respIndex: number) => (
                                      <ResponsibilityChip key={`${nodeIndex}-${respIndex}`} groupId={respId} />
                                    ))}
                                    {nodeInfo.responsibilities.length === 0 && (
                                      <span className="text-default-400 text-xs">{t('items.notAssigned')}</span>
                                    )}
                                  </div>
                                ))
                              ) : (
                                <span className="text-default-400 text-xs">{t('items.noActiveNodes')}</span>
                              )}
                            </div>
                          </div>

                          {/* Assigned Users */}
                          <div>
                            <div className="space-y-1">
                              {(() => {
                                const assignedUsers = item.data?.assignedResponsibilities
                                if (!assignedUsers || Object.keys(assignedUsers).length === 0) {
                                  return <span className="text-default-400 text-xs">No runtime assignments</span>
                                }
                                
                                return (
                                  <div className="space-y-1">
                                    {Object.entries(assignedUsers).map(([nodeId, userIds]) => {
                                      const node = flow.nodes.find(n => n.id === nodeId)
                                      const nodeName = node?.data?.label || nodeId
                                      return (
                                        <div key={nodeId} className="text-xs">
                                          <div className="font-medium text-default-600">{nodeName}:</div>
                                          <div className="pl-2 text-default-500">
                                            {Array.isArray(userIds) ? `${userIds.length} user(s)` : 'Invalid data'}
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )
                              })()}
                            </div>
                          </div>

                          {/* Custom Columns (Node Input Fields) */}
                          {flow.columns.map((column) => (
                            <div key={column}>
                              {getColumnFilterType(column) === "date"
                                ? renderDateValue(getDateValueForColumn(item, column))
                                : getColumnValue(item, column)}
                            </div>
                          ))}

                          {/* Created Date */}
                          <div>
                            {item.createdAt
                              ? renderDateValue(item.createdAt)
                              : t('common.notAvailable')}
                          </div>

                          {/* Last Update */}
                          <div>
                            {(() => {
                              const last = item.updatedAt || (item as any).updated_at || item.createdAt
                              return last
                                ? renderDateValue(last)
                                : t('common.notAvailable')
                            })()}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1">
                            <Button
                              variant="light"
                              size="sm"
                              onPress={() => {
                                setSelectedItem(item)
                                setView("item")
                                const params = new URLSearchParams()
                                params.set('flowId', flow.id)
                                params.set('itemId', item.id)
                                if (openNodeId) params.set('nodeId', openNodeId)
                                router.push(`/?${params.toString()}`)
                              }}
                              startContent={<GitBranch className="w-3 h-3" />}
                            />

                            {/* Direct delete icon with confirm popover */}
                            <Popover
                              placement="bottom-end"
                              backdrop="opaque"
                              isOpen={deleteConfirmItemId === item.id}
                              onOpenChange={(open) => setDeleteConfirmItemId(open ? item.id : null)}
                            >
                              <PopoverTrigger>
                                <Button
                                  isIconOnly
                                  variant="light"
                                  color="danger"
                                  size="sm"
                                  aria-label={t('items.deleteItem')}
                                  isDisabled={!canAct}
                                  onPress={() => setDeleteConfirmItemId(item.id)}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="p-3 max-w-xs">
                                <div className="text-sm text-default-700">
                                  {t('items.deleteConfirm', { id: item.id.slice(-6) })}
                                </div>
                                <div className="flex gap-2 mt-3">
                                  <Button size="sm" variant="light" className="flex-1" onPress={() => setDeleteConfirmItemId(null)}>
                                    {t('items.cancel')}
                                  </Button>
                                  <Button
                                    size="sm"
                                    color="danger"
                                    className="flex-1"
                                    isDisabled={!canAct}
                                    onPress={() => {
                                      deleteItem(item.id)
                                      setDeleteConfirmItemId(null)
                                    }}
                                  >
                                    {t('items.deleteItem')}
                                  </Button>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Columns Modal (Manage + Add + Deadlines) */}
        <Modal isOpen={isColumnsModalOpen} onClose={() => setIsColumnsModalOpen(false)} size="lg">
          <ModalContent>
            <ModalHeader>
              <h2>{t('items.manageColumns')}</h2>
            </ModalHeader>
            <ModalBody className="pb-6 space-y-6">
              <div className="space-y-3">
                <label className="text-sm font-medium">{t('items.currentColumns') || 'Current Columns'}</label>
                {flow.columns.length > 0 ? (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {flow.columns.map((column, index) => {
                      const isDate = getColumnFilterType(column) === 'date'
                      return (
                        <div key={index} className="flex items-start gap-3 p-3 bg-default-50 rounded-lg">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm break-all">{column}</span>
                              <span className="text-[10px] uppercase tracking-wide text-default-500 bg-default-100 px-1.5 py-0.5 rounded">
                                {getColumnFilterType(column)}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 items-end">
                            <Button
                              isIconOnly
                              variant="light"
                              color="danger"
                              size="sm"
                              onPress={() => deleteColumn(column)}
                              title={`Delete column: ${column}`}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-default-500 text-sm py-4 text-center border border-dashed rounded-md">
                    {t('items.noCustomColumns') || 'No custom columns'}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t space-y-3">
                <label className="text-sm font-medium">{t('items.addNewColumn') || 'Add New Column'}</label>
                {getAvailableNodeInputs().length > 0 ? (
                  <div className="space-y-3">
                    <div className="relative">
                      <Button
                        variant="bordered"
                        className="w-full justify-between"
                        onPress={() => setIsNodeInputDropdownOpen(!isNodeInputDropdownOpen)}
                      >
                        <div className="flex items-center gap-2">
                          {selectedInput ? (
                            <>
                              <span>
                                {selectedInput.nodeName}: {selectedInput.inputLabel}
                              </span>
                              <span className="text-xs text-default-500">({selectedInput.inputType})</span>
                            </>
                          ) : (
                            <span>{t('items.selectNodeInputFieldPlaceholder') || 'Select a node input field'}</span>
                          )}
                        </div>
                        <ChevronDown className={`w-4 h-4 transition-transform ${isNodeInputDropdownOpen ? 'rotate-180' : ''}`} />
                      </Button>
                      {isNodeInputDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-[9999] bg-transparent" onClick={() => setIsNodeInputDropdownOpen(false)} />
                          <div
                            className="fixed z-[10000] bg-content1 border border-default-200 rounded-lg shadow-xl max-h-60 overflow-y-auto "
                            style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', maxWidth: '30vw' }}
                          >
                            <div className="p-2">
                              <div className="text-xs text-default-500 p-2 border-b">
                                {t('items.availableNodeInputs', { count: getAvailableNodeInputs().length }) || `Available Node Input Fields (${getAvailableNodeInputs().length})`}
                              </div>
                              {getAvailableNodeInputs().map((input) => (
                                <Button
                                  key={input.key}
                                  variant="light"
                                  className="w-full px-3 py-3 text-left hover:bg-default-100 transition-colors rounded-md"
                                  onClick={() => {
                                    setSelectedNodeInput(input.key)
                                    setIsNodeInputDropdownOpen(false)
                                  }}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                      <div className="font-medium text-sm">
                                        {input.nodeName}: {input.inputLabel}
                                      </div>
                                      <div className="text-xs text-default-500 mt-1">
                                        {t('items.typeAndNode', { type: input.inputType, node: input.nodeName }) || `Type: ${input.inputType} • Node: ${input.nodeName}`}
                                      </div>
                                    </div>
                                    {selectedNodeInput === input.key && <div className="text-primary text-sm">✓</div>}
                                  </div>
                                </Button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    <Button
                      onPress={addColumn}
                      color="primary"
                      className="w-full"
                      isDisabled={!selectedNodeInput}
                    >
                      {t('items.addColumn')}
                    </Button>
                  </div>
                ) : (
                  <div className="text-default-500 text-xs">
                    {t('items.noNodeInputs') || 'No node input fields available'}
                  </div>
                )}
              </div>
            </ModalBody>
          </ModalContent>
        </Modal>

        {/* Add Item Modal */}
        <Modal
          isOpen={isAddItemDialogOpen}
          isDismissable={!isCreatingItem}
          onClose={() => { if (!isCreatingItem) setIsAddItemDialogOpen(false) }}
          hideCloseButton={isCreatingItem}
        >
          <ModalContent>
            <ModalHeader>
              <div className="flex flex-col">
                <h2>Add New Item</h2>
                <p className="text-sm text-default-500 font-normal">Create a new item to start the flow</p>
              </div>
            </ModalHeader>
            <ModalBody className="pb-6">
              <div className="space-y-4">
                {initialNode?.data?.inputs?.map((input: any, index: number) => (
                  <div key={index}>
                    {input.type !== "checkbox" && (
                      <label className="text-sm font-medium flex items-center gap-1 mb-1">
                        {input.label}
                        {input.required && <span className="text-danger">*</span>}
                      </label>
                    )}
                    {renderInputField(input)}
                  </div>
                ))}
                <Button onPress={addItem} color="primary" className="w-full" isDisabled={isCreatingItem} isLoading={isCreatingItem}>
                  {isCreatingItem ? t('common.loading') || 'Creating...' : t('items.createItem')}
                </Button>
              </div>
            </ModalBody>
          </ModalContent>
        </Modal>
      </div>
    </div>
  )
}
