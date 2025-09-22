"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { ArrowLeft, CheckCircle, Clock, GitBranch, X } from 'lucide-react'
import { ReactFlow, type Node, type Edge, type ReactFlowInstance, Background } from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { Button, Card, CardBody, CardHeader, Input, Textarea, Select, SelectItem, Checkbox, Modal, ModalContent, ModalHeader, ModalBody } from "@heroui/react"
import CustomNode from "./custom-node"
import MultiResponsibilitySelector from "./multi-responsibility-selector"
import { UserSearch } from "./user-search"
import { useMediaQuery } from "../hooks/use-media-query"
import { useTranslation } from "../hooks/useTranslation"
// New: Teams and Groups
import { useTeamsAuth } from "../providers/teams-auth"
import { useGroups } from "../providers"
import { apiService, type Group } from "../services/api"

const nodeTypes = {
  initial: CustomNode,
  serial: CustomNode,
  parallel: CustomNode,
  conditional: CustomNode,
  convergence: CustomNode,
  final: CustomNode,
}

interface ItemInteractionProps {
  item: any
  flow: any
  onBack: () => void
  onUpdateItem: (item: any) => Promise<void>
  deepLinkNodeId?: string
  deepLinked?: boolean
}

export default function ItemInteraction({ item, flow, onBack, onUpdateItem, deepLinkNodeId, deepLinked }: ItemInteractionProps) {
  const { t } = useTranslation()
  const reactFlowInstance = useRef<any>(null)
  const [formData, setFormData] = useState<Record<string, string | boolean>>({})
  const [selectedPath, setSelectedPath] = useState<string>("")
  const [isNodeModalOpen, setIsNodeModalOpen] = useState(false)
  const [isAssignResponsibleModalOpen, setIsAssignResponsibleModalOpen] = useState(false)
  const [nodesAwaitingAssignment, setNodesAwaitingAssignment] = useState<any[]>([])
  const assignmentResumeRef = useRef<any>(null)
  const [selectedNodeForModal, setSelectedNodeForModal] = useState<any>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isCompletingNode, setIsCompletingNode] = useState(false)
  const [toastMessage, setToastMessage] = useState<string>("")
  const [toastType, setToastType] = useState<"success" | "danger" | "warning" | "info">("success")
  const [toastVisible, setToastVisible] = useState(false)
  const isMobile = useMediaQuery("(max-width: 1024px)")
  const currentNode = flow.nodes.find((node: any) => node.id === item.currentNodeId)
  // New: teams/groups hooks
  const { isLoggedIn, sendFlowStepAdaptiveCard, sendAdaptiveCardMessage, searchUsers, currentUser, createPlannerTask, completePlannerTask, sendChannelMessage } = useTeamsAuth()
  const { groups } = useGroups()
  const rebasedRef = useRef<any | null>(null)
  const skipNotifyRef = useRef<boolean>(false)

  // Determine if current user can act on a given node
  const userCanActOnNode = useCallback((node: any): boolean => {
    try {
      if (!currentUser) return false
      const candidates = [currentUser.mail, currentUser.userPrincipalName]
        .filter(Boolean)
        .map(v => String(v).trim().toLowerCase()) as string[]
      if (candidates.length === 0) return false

      // If any group has accept_any=true and contains current user, allow
      const anyGroup = (groups || []).some((g: any) => {
        const matchMember = Array.isArray(g.members) && g.members.some((m: any) => {
          const em = String(m.email || '').trim().toLowerCase()
          return em && candidates.includes(em)
        })
        return !!g.accept_any && matchMember
      })
      if (anyGroup) return true

      // Otherwise, user must belong to at least one responsibility group for this node
      const respIds: string[] = node?.data?.responsibilities || (node?.data?.responsibility ? [node.data.responsibility] : [])
      if (!respIds || respIds.length === 0) return false
      const ok = respIds.some(gid => {
        const gidStr = String(gid)
        const g = (groups || []).find((gr: any) => String(gr.id) === gidStr)
        if (!g) return false
        return Array.isArray(g.members) && g.members.some((m: any) => {
          const em = String(m.email || '').trim().toLowerCase()
          return em && candidates.includes(em)
        })
      })
      return ok
    } catch { return false }
  }, [currentUser, groups])

  // (moved) deep-link focus effect placed after visualNodes declaration

  // (effect moved below visualNodes)
  // Track whether we should prioritize focusing the deep-linked node
  const deepLinkFocusRef = useRef<boolean>(false)
  useEffect(() => {
    if (deepLinkNodeId) {
      deepLinkFocusRef.current = true
    }
  }, [deepLinkNodeId])

  // Track if we've already auto-opened the deep-linked modal to avoid re-opening after user closes it
  const deepLinkModalOpenedRef = useRef<boolean>(false)
  useEffect(() => {
    // Reset the gate when the deep link target changes
    deepLinkModalOpenedRef.current = false
  }, [deepLinkNodeId])

  // Helper function to get the next actual nodes (skipping convergence nodes)
  function getNextActualNodes(currentNodeId: string, edges: Edge[], nodes: Node[]): any[] {
    const outgoingEdges = edges.filter((edge) => edge.source === currentNodeId)
    const nextNodes: any[] = []
    const sourceNode: any = nodes.find((n: any) => n.id === currentNodeId)
    const sourceEdges: any[] | undefined = sourceNode?.data?.edges as any[] | undefined

    for (const edge of outgoingEdges) {
      const targetNode: any = nodes.find((node: any) => node.id === edge.target)
      if (!targetNode) continue

      const edgeTitle = sourceEdges?.find((e: any) => e.id === edge.id)?.title || `${targetNode?.data?.label}`

      if (targetNode.type === "convergence") {
        const convergenceChildren = getNextActualNodes(targetNode.id, edges, nodes)
        nextNodes.push(
          ...convergenceChildren.map((child: any) => ({
            ...child,
            edgeId: edge.id,
            edgeTitle,
          }))
        )
      } else {
        nextNodes.push({
          ...targetNode,
          edgeId: edge.id,
          edgeTitle,
        })
      }
    }

    return nextNodes
  }

  const nextNodes = getNextActualNodes(item.currentNodeId, flow.edges, flow.nodes)

  const canAccessConvergenceNode = (nodeId: string) => {
    const node = flow.nodes.find((n: any) => n.id === nodeId)
    if (node?.type !== "convergence") return true
    const incomingEdges = flow.edges.filter((edge: any) => edge.target === nodeId)
    return incomingEdges.every((edge: any) => item.history.includes(edge.source))
  }

  const findNextAccessibleNode = (nodeId: string): string | null => {
    const node = flow.nodes.find((n: any) => n.id === nodeId)
    if (!node) return null

    if (node.type === "convergence") {
      if (canAccessConvergenceNode(nodeId)) {
        const outgoingEdges = flow.edges.filter((edge: any) => edge.source === nodeId)
        for (const edge of outgoingEdges) {
          const nextAccessible = findNextAccessibleNode(edge.target)
          if (nextAccessible) return nextAccessible
        }
      }
      return null
    }

    return nodeId
  }

  // New: recompute active nodes for a given item state (used after updates for notifications)
  const getAllActiveNodesFor = (targetItem: any) => {
    const activeNodes: any[] = []

    for (const node of flow.nodes) {
      if (node.type === "convergence") continue
      if (targetItem.history.includes(node.id)) continue

      const incomingEdges = flow.edges.filter((edge: any) => edge.target === node.id)

      const canAccessConvergenceNodeFor = (nid: string) => {
        const n = flow.nodes.find((nn: any) => nn.id === nid)
        if (n?.type !== "convergence") return true
        const inEdges = flow.edges.filter((e: any) => e.target === nid)
        return inEdges.every((e: any) => targetItem.history.includes(e.source))
      }

      if (incomingEdges.length === 0) {
        activeNodes.push(node)
      } else if (incomingEdges.length === 1) {
        const edge = incomingEdges[0]
        const parentNode = flow.nodes.find((n: any) => n.id === edge.source)

        if (parentNode?.type === "convergence") {
          if (canAccessConvergenceNodeFor(parentNode.id)) {
            activeNodes.push(node)
          }
        } else {
          const parentCompleted = targetItem.history.includes(edge.source)

          if (parentNode?.type === "conditional" && parentCompleted) {
            if (targetItem.pathTaken && targetItem.pathTaken.includes(edge.id)) {
              activeNodes.push(node)
            }
          } else if (parentNode?.type === "parallel" && parentCompleted) {
            if (targetItem.pathTaken && targetItem.pathTaken.includes(edge.id)) {
              activeNodes.push(node)
            }
          } else if (parentCompleted) {
            activeNodes.push(node)
          }
        }
      } else {
        const hasValidPath = incomingEdges.some((edge: any) => {
          const parentNode = flow.nodes.find((n: any) => n.id === edge.source)

          if (parentNode?.type === "convergence") {
            return canAccessConvergenceNodeFor(parentNode.id)
          } else {
            return targetItem.pathTaken && targetItem.pathTaken.includes(edge.id) && targetItem.history.includes(edge.source)
          }
        })

        if (hasValidPath) {
          activeNodes.push(node)
        }
      }
    }

    return activeNodes
  }

  // New: resolve Graph userId by email if needed
  const emailToUserIdCache = useRef<Map<string, string>>(new Map())
  // De-dupe channel posts per flow/item/node during this session
  const channelPostSentRef = useRef<Set<string>>(new Set())
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
      console.warn('Failed to resolve user by email:', email, e)
      return null
    }
  }

  // New: send Teams notifications for next active nodes
  // Private user notifications disabled: planner tasks only
  const notifyNextResponsibleGroups = async (_updatedItemState: any, _justCompletedNode: any) => {
    if (process && process.env.NODE_ENV !== 'production') {
      console.log('[Notifications] Skipped sending private messages (disabled)')
    }
    return {}
  }

  // Create Planner task(s) for each next actionable node if plan/bucket configured on flow
  // Returns a mapping of nodeId -> created taskId for persistence on the item
  const createPlannerTaskForNext = async (updatedItemState: any, justCompletedNode: any): Promise<Record<string, string>> => {
    try {
  const planId = (flow as any)?.plannerPlanId
  const bucketId = (flow as any)?.plannerBucketId
  
  // Debug logging
  if (process && process.env.NODE_ENV !== 'production') {
    console.log('[Planner] createPlannerTaskForNext called', {
      isLoggedIn,
      planId,
      bucketId,
      itemId: updatedItemState?.id,
      completedNode: justCompletedNode?.id
    })
  }
  
  if (!isLoggedIn) {
    console.log('[Planner] User not logged in, skipping task creation')
    return {}
  }
      if (!planId || !bucketId) {
        // Informative toast to configure Planner destination
        console.log('[Planner] Missing plan or bucket configuration')
        setToastMessage(t('items.plannerNotConfigured') || 'Planner destination not configured for this flow. Open Settings > Planner Destination to pick a Plan and Bucket.')
        setToastType('info')
        setToastVisible(true)
        window.setTimeout(() => setToastVisible(false), 3000)
  return {}
      }

      // Determine next active nodes and create a task for EACH actionable one
      const nextActiveNodes = getAllActiveNodesFor(updatedItemState)
      let actionableNodes = (nextActiveNodes || []).filter((n: any) => n.type !== 'convergence')

      // Debug logging
      if (process && process.env.NODE_ENV !== 'production') {
        console.log('[Planner] Active nodes found:', {
          totalActiveNodes: nextActiveNodes?.length || 0,
          actionableNodes: actionableNodes.length,
          nodeIds: actionableNodes.map((n: any) => n.id)
        })
      }

      // Duplicate prevention: filter out nodes that already have a planner task mapping
      const existingMap = (updatedItemState?.data?.plannerTasks) || {}
      const beforeCount = actionableNodes.length
      actionableNodes = actionableNodes.filter((n: any) => !existingMap[n.id])
      const afterCount = actionableNodes.length
      if (process && process.env.NODE_ENV !== 'production') {
        console.log('[Planner] Duplicate prevention', { beforeCount, afterCount, skipped: beforeCount - afterCount, existingMap })
      }
  if (!actionableNodes || actionableNodes.length === 0) {
    if (process && process.env.NODE_ENV !== 'production') {
      console.log('[Planner] No actionable nodes left after filtering')
    }
    return {}
  }

      // Ensure groups are loaded once
      let localGroups: Group[] = Array.isArray(groups) ? groups : []
      if (localGroups.length === 0) {
        try { localGroups = await apiService.getGroups() } catch {}
      }

      const teamId = (flow as any)?.plannerTeamId
      const channelId = (flow as any)?.plannerChannelId

  const results = await Promise.allSettled(actionableNodes.map(async (targetNode: any) => {
        // Resolve assignees per node
  // Prefer per-item assigned responsibilities (set at runtime on the item) over node-level defaults
  const perItemAssignments: Record<string, any> = (updatedItemState?.data?.assignedResponsibilities) || (updatedItemState?.data?.assignedResponsibles) || {}
  const perItemUserIds: string[] = perItemAssignments[targetNode.id] || []
  const nodeGroupIds: string[] = targetNode.data?.responsibilities || (targetNode.data?.responsibility ? [targetNode.data.responsibility] : [])
  
        // Debug logging for assignee resolution
        if (process && process.env.NODE_ENV !== 'production') {
          console.log('[Planner] Resolving assignees for node', targetNode.id, {
            perItemUserIds,
            nodeGroupIds,
            hasPerItemAssignments: perItemUserIds.length > 0
          })
        }

        const assigneeIds: string[] = []
        
        if (perItemUserIds.length > 0) {
          // Use per-item user IDs directly (these are already Teams user IDs)
          assigneeIds.push(...perItemUserIds.slice(0, 10))
          if (process && process.env.NODE_ENV !== 'production') {
            console.log('[Planner] Using per-item user IDs:', assigneeIds)
          }
        } else if (nodeGroupIds.length > 0) {
          // Fall back to resolving from groups
          const assigneeEmails = (localGroups || [])
            .filter((g: any) => nodeGroupIds.map(String).includes(String(g.id)))
            .flatMap((g: any) => g.members?.map((m: any) => String(m.email || '').trim()).filter(Boolean) || [])
          const uniqueEmails = Array.from(new Set(assigneeEmails)).slice(0, 10)

          if (process && process.env.NODE_ENV !== 'production') {
            console.log('[Planner] Group-based email resolution for node', targetNode.id, {
              matchingGroups: localGroups.filter((g: any) => nodeGroupIds.map(String).includes(String(g.id))).length,
              totalEmails: assigneeEmails.length,
              uniqueEmails: uniqueEmails.length
            })
          }

          for (const em of uniqueEmails) {
            const uid = await resolveUserIdByEmail(em)
            if (uid) assigneeIds.push(uid)
          }
        }

        // Title prefix taken from initial node first input value, else item id
        let titlePrefix = ''
        try {
          const initialNodeRef = flow.nodes.find((n: any) => n.type === 'initial')
          const firstInitInputLabel = initialNodeRef?.data?.inputs?.[0]?.label
          if (firstInitInputLabel) {
            const val = updatedItemState?.data?.[firstInitInputLabel]
            if (val !== undefined && val !== null && String(val).trim() !== '') {
              titlePrefix = String(val).trim()
            }
          }
        } catch {}
        if (!titlePrefix) titlePrefix = updatedItemState?.id
        const baseNodeTitle = `${targetNode?.data?.label || targetNode.id}`
        const title = `${titlePrefix} – ${baseNodeTitle}`
        // New deadline rules for subsequent tasks:
        // universal -> base = item.createdAt, add days
        // else match date inputs on THIS node; if found and value present, base=value + configured days
        const deadlinesObj: Record<string, number> | null = (flow as any)?.deadlines || null
        const computeDueDate = (): string | undefined => {
          if (!deadlinesObj || typeof deadlinesObj !== 'object') return undefined
          
          // Handle new deadline format: {field: "fieldname", days: number}
          if (deadlinesObj.field && deadlinesObj.days) {
            const fieldName = String(deadlinesObj.field);
            const days = Number(deadlinesObj.days);
            
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
                      if (composite === fieldName) return true;
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
              const resolveDateByDeadlineKey = (key: string): string | undefined => {
                const dataObj = updatedItemState?.data || {}
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
              
              const rawVal = resolveDateByDeadlineKey(fieldName);
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
              // Prefer earliest explicit initial date input if available
              let baseDateStr: string | undefined
              try {
                const initNode = flow.nodes.find((n: any) => n.type === 'initial')
                const firstDateInput = initNode?.data?.inputs?.find((inp: any) => inp.type === 'date')
                if (firstDateInput) {
                  const v = updatedItemState?.data?.[firstDateInput.label]
                  if (v) baseDateStr = v
                }
              } catch {}
              const base = baseDateStr ? new Date(baseDateStr) : new Date(updatedItemState.createdAt || new Date().toISOString())
              const d = new Date(base)
              d.setDate(d.getDate() + days)
              d.setUTCHours(23, 59, 59, 0)
              return d.toISOString()
            }
            return undefined
          }
          // Non-universal: reuse table column resolution semantics.
          const resolveDateByDeadlineKey = (key: string): string | undefined => {
            const dataObj = updatedItemState?.data || {}
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
          if (process && process.env.NODE_ENV !== 'production') {
            console.log('[Planner][DueLookup] Data keys:', Object.keys(updatedItemState?.data || {}))
            console.log('[Planner][DueLookup] Deadlines entries:', deadlinesObj)
          }
          for (const [label, days] of Object.entries(deadlinesObj)) {
            if (label === 'universal') continue
            if (typeof days !== 'number' || days <= 0) continue
            const rawVal = resolveDateByDeadlineKey(label)
            if (process && process.env.NODE_ENV !== 'production') {
              console.log('[Planner][DueLookup] Try label', label, 'found value?', !!rawVal, 'value:', rawVal)
            }
            if (!rawVal) continue
            const parsed = new Date(rawVal)
            if (isNaN(parsed.getTime())) continue
            const d = new Date(parsed)
            d.setDate(d.getDate() + days)
            d.setUTCHours(23, 59, 59, 0)
            if (process && process.env.NODE_ENV !== 'production') {
              console.log('[Planner][DueLookup] Matched label', label, 'days', days, 'due', d.toISOString())
            }
            return d.toISOString()
          }
          return undefined
        }
        const due = computeDueDate()
        if (!due && process && process.env.NODE_ENV !== 'production') {
          console.log('[Planner][DueLookup] No due date resolved for node', targetNode.id, '(creating task without deadline)')
        }
        if (process && process.env.NODE_ENV !== 'production') {
          console.log('[Planner] Task due computation', { node: targetNode.id, due, deadlinesObj })
        }
        const description = `${t('items.createdByFlow', { defaultValue: 'Created by Flow Creator' })}\nFlow: ${flow?.name}\nItem: ${updatedItemState?.id}\nCompleted: ${justCompletedNode?.data?.label || justCompletedNode?.id}`
        const openUrl = (typeof window !== 'undefined')
          ? await (window as any)?.teamsAuthService?.getFlowDeepLink?.(
              flow.id,
              updatedItemState.id,
              targetNode.id,
              (flow as any)?.plannerTeamId,
              (flow as any)?.plannerChannelId,
            ) || ''
          : ''
        const startDateTime = new Date().toISOString()
        if (process && process.env.NODE_ENV !== 'production') {
          console.log('[Planner] Creating task', { title, startDateTime, due, assigneeIds })
        }
        const task = await createPlannerTask(planId, bucketId, title, assigneeIds, due, { description, openUrl, openUrlAlias: 'Apri il nodo' }, startDateTime)
        if (process && process.env.NODE_ENV !== 'production') {
          console.log('[Planner] Created task response', { id: task?.id, planId, bucketId })
        }

        // Optional channel message per node
        if (teamId && channelId) {
          try {
            const postKey = `${flow.id}:${updatedItemState.id}:${targetNode.id}`
            if (!channelPostSentRef.current.has(postKey)) {
              await sendChannelMessage(
                teamId,
                channelId,
                `${title} — ${t('items.plannerTaskCreated') || 'Planner task created'}`,
                'Flow Creator',
                flow.id,
                updatedItemState.id,
                targetNode.id
              )
              channelPostSentRef.current.add(postKey)
            }
          } catch (e) {
            console.warn('Failed to post channel message for planner task:', e)
          }
        }
        // Return nodeId -> taskId for mapping
        return { nodeId: targetNode.id, taskId: task?.id as string }
      }))

      const taskMap: Record<string, string> = {}
      let successCount = 0
      for (const r of results) {
        if (r.status === 'fulfilled') {
          successCount++
          const val = r.value as any
          if (val && val.nodeId && val.taskId) taskMap[val.nodeId] = val.taskId
        }
      }
      if (successCount > 0) {
        setToastMessage(t('items.plannerTaskCreated') || 'Planner task created')
        setToastType('success')
        setToastVisible(true)
        window.setTimeout(() => setToastVisible(false), 2500)
      }
      return taskMap
    } catch (e) {
      console.warn('Planner task creation skipped/failed:', e)
  const errMsg = e instanceof Error ? e.message : (typeof e === 'string' ? e : 'Unknown error')
  setToastMessage(t('items.plannerTaskFailed', { error: errMsg }) || `Planner task failed: ${errMsg}`)
      setToastType('danger')
      setToastVisible(true)
      window.setTimeout(() => setToastVisible(false), 3500)
      return {}
    }
  }

  // Complete Planner task for a specific node if a mapping exists in the item
  const completePlannerTaskForNode = async (itemState: any, nodeId: string) => {
    try {
      const taskId = itemState?.data?.plannerTasks?.[nodeId]
      if (!taskId) {
        if (process && process.env.NODE_ENV !== 'production') {
          console.log('[Planner] No task mapping found for node', nodeId)
        }
        return
      }
      if (process && process.env.NODE_ENV !== 'production') {
        console.log('[Planner] Completing task for node', { nodeId, taskId })
      }
      await completePlannerTask(taskId)
      if (process && process.env.NODE_ENV !== 'production') {
        console.log('[Planner] Completed task for node', nodeId)
      }
    } catch (e) {
      console.warn('Failed to complete Planner task for node', nodeId, e)
    }
  }

  const [currentNodeCompleted, setCurrentNodeCompleted] = useState(() => {
    if (!item.history.includes(item.currentNodeId)) {
      return false
    }

    if (currentNode?.type === "final") {
      return false
    }

    const hasNextSteps = nextNodes.length > 0
    const hasParallelPaths =
      item.parallelPaths &&
      Object.keys(item.parallelPaths).some((parallelNodeId) => {
        const pathArray = item.parallelPaths[parallelNodeId] as any[]
        return pathArray.some((path: any) => !path.completed)
      })

    return hasNextSteps || hasParallelPaths
  })

  // Center view on current/active nodes, but prefer deep-linked node once if provided
  useEffect(() => {
    focusOnActiveNodes()
  }, [item.currentNodeId, flow.nodes, flow.edges])



  const getAllActiveNodes = () => {
    const activeNodes = []

    for (const node of flow.nodes) {
      if (node.type === "convergence") continue
      if (item.history.includes(node.id)) continue

      const incomingEdges = flow.edges.filter((edge: any) => edge.target === node.id)

      if (incomingEdges.length === 0) {
        activeNodes.push(node)
      } else if (incomingEdges.length === 1) {
        const edge = incomingEdges[0]
        const parentNode = flow.nodes.find((n: any) => n.id === edge.source)

        if (parentNode?.type === "convergence") {
          if (canAccessConvergenceNode(parentNode.id)) {
            activeNodes.push(node)
          }
        } else {
          const parentCompleted = item.history.includes(edge.source)

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
        const hasValidPath = incomingEdges.some((edge: any) => {
          const parentNode = flow.nodes.find((n: any) => n.id === edge.source)

          if (parentNode?.type === "convergence") {
            return canAccessConvergenceNode(parentNode.id)
          } else {
            return item.pathTaken && item.pathTaken.includes(edge.id) && item.history.includes(edge.source)
          }
        })

        if (hasValidPath) {
          activeNodes.push(node)
        }
      }
    }

    return activeNodes
  }

  const allActiveNodes = getAllActiveNodes()

  // Function to center nodes based on their actual dimensions for better visual alignment
  const centerNodesForProgress = useCallback((nodes: any[]) => {
    return nodes.map((node: any) => {
      // For flow progress, we want nodes to be visually centered
      // This ensures consistent alignment regardless of input field values
      
      // Estimate node width based on type and content for better centering
      let estimatedWidth = 200 // Default width
      
      // Adjust width based on node type
      if (node.type === 'conditional' && node.data.edges && node.data.edges.length > 0) {
        estimatedWidth = 280 // Conditional nodes with multiple paths are wider
      } else if (node.type === 'parallel') {
        estimatedWidth = 240 // Parallel nodes are slightly wider
      } else if (node.type === 'convergence') {
        estimatedWidth = 180 // Convergence nodes are narrower
      }
      
      // Adjust width based on content
      if (node.data.inputs && node.data.inputs.length > 2) {
        estimatedWidth += 40 // Add width for multiple inputs
      }
      if (node.data.responsibilities && node.data.responsibilities.length > 1) {
        estimatedWidth += 30 // Add width for multiple responsibilities
      }
      
      // Calculate the center point of the node
      const nodeCenterX = node.position.x + (estimatedWidth / 2)
      const nodeCenterY = node.position.y + 50 // Assume 100px height, center at 50px
      
      // Snap the center point to a 20px grid for consistency
      const snappedCenterX = Math.round(nodeCenterX / 20) * 20
      const snappedCenterY = Math.round(nodeCenterY / 20) * 20
      
      // Calculate the new top-left position based on the snapped center
      const centeredPosition = {
        x: snappedCenterX - (estimatedWidth / 2),
        y: snappedCenterY - 50
      }
      
      return {
        ...node,
        position: centeredPosition
      }
    })
  }, [])

  const visualNodes = centerNodesForProgress(
    flow.nodes
      .filter((node: any) => node.type !== "convergence")
      .map((node: any) => {
        let isActive = node.id === item.currentNodeId || allActiveNodes.some((activeNode: any) => activeNode.id === node.id)
        const isCompleted = item.history.includes(node.id)
  const isDeepLinked = !!deepLinkNodeId && node.id === deepLinkNodeId
        
        // Additional check for nodes after convergence nodes
        let isClickable = allActiveNodes.some((activeNode: any) => activeNode.id === node.id) || isCompleted
        
        // If this node comes after a convergence node, check if the convergence node is accessible
        const incomingEdges = flow.edges.filter((edge: any) => edge.target === node.id)
        const convergenceParent = incomingEdges.find((edge: any) => {
          const parentNode = flow.nodes.find((n: any) => n.id === edge.source)
          return parentNode?.type === "convergence"
        })
        
        if (convergenceParent) {
          const convergenceNode = flow.nodes.find((n: any) => n.id === convergenceParent.source)
          if (convergenceNode && !canAccessConvergenceNode(convergenceNode.id)) {
            isClickable = false
            // IMPORTANT: If we can't access the convergence node, the node after it should NOT be active either
            isActive = false
          }
        }

        const nodeData = {
          ...node.data,
          isActive,
          isCompleted,
          isDisabled: !isClickable && !isActive && !isCompleted,
          isClickable,
          isDeepLinked,
          isFlowDesigner: false, // Explicitly set to false for item interaction (not designer)
          itemData: item.data,
          onNodeClick: (nodeId: string) => {
              const clickedNode = flow.nodes.find((n: any) => n.id === nodeId)
              if (clickedNode && (item.history.includes(nodeId) || allActiveNodes.some((activeNode: any) => activeNode.id === nodeId))) {
                setSelectedNodeForModal(clickedNode)
                setIsNodeModalOpen(true)
                return
              }
            

            if (item.history.includes(nodeId)) {
              const updatedItem = {
                ...item,
                currentNodeId: nodeId,
              }
              onUpdateItem(updatedItem)
              setCurrentNodeCompleted(false)
              setFormData({})
              setSelectedPath("")
              return
            }

            const isNodeActive = allActiveNodes.some((activeNode: any) => activeNode.id === nodeId)
            if (!isNodeActive) return

            const updatedItem = {
              ...item,
              currentNodeId: nodeId,
            }

            onUpdateItem(updatedItem)
            setCurrentNodeCompleted(false)
            setFormData({})
            setSelectedPath("")
          },
        }

        if (node.type === "conditional" && isCompleted && item.pathTaken) {
          const takenEdge = flow.edges.find((edge: any) => edge.source === node.id && item.pathTaken.includes(edge.id))

          if (takenEdge) {
            const edgeTitle = node.data.edges?.find((e: any) => e.id === takenEdge.id)?.title
            const targetNode = flow.nodes.find((n: any) => n.id === takenEdge.target)
            const chosenPath = edgeTitle || `${targetNode?.data?.label || takenEdge.target}`

            nodeData.chosenPath = chosenPath
          }
        }

        if (node.type === "parallel" && item.parallelPaths) {
          const parallelPaths = item.parallelPaths[node.id] || []
          nodeData.parallelPaths = parallelPaths
        }

        return {
          ...node,
          data: nodeData,
        }
      })
  )

  // Auto-open deep-linked node modal (only when nodeId is present)
  useEffect(() => {
    if (!deepLinkNodeId) return
    if (deepLinkModalOpenedRef.current) return
    const node = flow.nodes.find((n: any) => n.id === deepLinkNodeId)
    if (!node) return

    setSelectedNodeForModal(node)
    setIsNodeModalOpen(true)
    deepLinkModalOpenedRef.current = true
  }, [deepLinkNodeId, flow.nodes])

  const createVisualEdges = () => {
    const visualEdges = []

    for (const edge of flow.edges) {
      const sourceNode = flow.nodes.find((n: any) => n.id === edge.source)
      const targetNode = flow.nodes.find((n: any) => n.id === edge.target)

      if (!sourceNode || !targetNode) continue

      if (sourceNode.type === "convergence") continue

      if (targetNode.type === "convergence") {
        const convergenceOutgoingEdges = flow.edges.filter((e: any) => e.source === targetNode.id)

        for (const convergenceEdge of convergenceOutgoingEdges) {
          const finalTarget = flow.nodes.find((n: any) => n.id === convergenceEdge.target)
          if (finalTarget && finalTarget.type !== "convergence") {
            visualEdges.push({
              ...edge,
              target: finalTarget.id,
              id: `${edge.id}-skip-convergence`,
              type: edge.type || edge.data?.type, // Preserve edge type
            })
          }
        }
        continue
      }

      // Preserve edge type for all edges
      visualEdges.push({
        ...edge,
        type: edge.type || edge.data?.type, // Ensure edge type is at top level
      })
    }

    return visualEdges
  }

  const baseVisualEdges = createVisualEdges()

  const visualEdges = baseVisualEdges.map((edge: any) => {
    const isSourceCompleted = item.history.includes(edge.source)
    const isTargetCompleted = item.history.includes(edge.target)
    const isCurrentNodeSource = edge.source === item.currentNodeId
    const isCurrentNodeTarget = edge.target === item.currentNodeId

    const isActualPathTaken = () => {
      if (item.pathTaken && item.pathTaken.includes(edge.id)) {
        return true
      }

      const targetNode = flow.nodes.find((n: any) => n.id === edge.target)
      if (targetNode) {
        const incomingEdges = flow.edges.filter((e: any) => e.target === edge.target)
        if (incomingEdges.length === 1 && isSourceCompleted && isTargetCompleted) {
          return true
        }
      }

      return false
    }

    const shouldShowAsActive = () => {
      if (isTargetCompleted) return false

      const isTargetActive = allActiveNodes.some((activeNode: any) => activeNode.id === edge.target)

      // Special handling for skip-convergence edges (edges that bypass convergence nodes visually)
      if (edge.id.includes('skip-convergence')) {
        // For skip-convergence edges, we need to find the original convergence node and check if it's accessible
        const originalEdgeId = edge.id.replace('-skip-convergence', '')
        const originalEdge = flow.edges.find((e: any) => e.id === originalEdgeId)
        
        if (originalEdge) {
          const convergenceNode = flow.nodes.find((n: any) => n.id === originalEdge.target)
          if (convergenceNode && convergenceNode.type === "convergence") {
            // Only show skip-convergence edge as active if the convergence node is accessible
            return isSourceCompleted && isTargetActive && canAccessConvergenceNode(convergenceNode.id)
          }
        }
        
        return false
      }

      if (isSourceCompleted && isTargetActive) {
        const sourceNode = flow.nodes.find((n: any) => n.id === edge.source)
        if (sourceNode?.type === "conditional") {
          return item.pathTaken && item.pathTaken.includes(edge.id)
        }
        
        // Special handling for edges going to nodes after convergence nodes
        const targetNode = flow.nodes.find((n: any) => n.id === edge.target)
        if (targetNode) {
          const incomingEdges = flow.edges.filter((e: any) => e.target === edge.target)
          const convergenceParent = incomingEdges.find((e: any) => {
            const parentNode = flow.nodes.find((n: any) => n.id === e.source)
            return parentNode?.type === "convergence"
          })
          
          if (convergenceParent) {
            const convergenceNode = flow.nodes.find((n: any) => n.id === convergenceParent.source)
            if (convergenceNode) {
              // Only show as active if the convergence node is accessible
              return canAccessConvergenceNode(convergenceNode.id)
            }
          }
        }
        
        return true
      }

      if (currentNode?.type === "conditional" && selectedPath && currentNodeCompleted) {
        return edge.id === selectedPath
      }

      if (isCurrentNodeTarget && isSourceCompleted) {
        return true
      }

      return false
    }

    const isActive = shouldShowAsActive()
    const isCompleted = isActualPathTaken() && isSourceCompleted && isTargetCompleted

    let edgeStyle = {
      stroke: "#94a3b8",
      strokeWidth: 2,
    }

    if (isCompleted) {
      edgeStyle = {
        stroke: "#22c55e",
        strokeWidth: 3,
      }
    } else if (isActive) {
      edgeStyle = {
        stroke: "#3b82f6",
        strokeWidth: 3,
      }
    } else if (currentNode?.type === "conditional" && selectedPath && edge.source === item.currentNodeId) {
      if (edge.id !== selectedPath) {
        edgeStyle = {
          stroke: "#d1d5db",
          strokeWidth: 1,
        }
      }
    } else {
      edgeStyle = {
        stroke: "#cbd5e1",
        strokeWidth: 1.5,
      }
    }

    // Determine label styling based on edge state
    let labelStyle = {
      fill: "#94a3b8", // Default gray
      fontSize: 12,
      fontWeight: 400,
      backgroundColor: "rgba(184, 148, 148, 0.1)", // Light gray background
    }

    if (isCompleted) {
      labelStyle = {
        fill: "#22c55e", // Green for completed
        fontSize: 12,
        fontWeight: 600,
        backgroundColor: "rgba(34, 197, 94, 0.1)", // Light green background
      }
    } else if (isActive) {
      labelStyle = {
        fill: "#3b82f6", // Blue for active
        fontSize: 12,
        fontWeight: 600,
        backgroundColor: "rgba(59, 130, 246, 0.1)", // Light blue background
      }
    } else if (currentNode?.type === "conditional" && selectedPath && edge.source === item.currentNodeId) {
      if (edge.id !== selectedPath) {
        labelStyle = {
          fill: "#d1d5db", // Light gray for unselected conditional paths
          fontSize: 11,
          fontWeight: 400,
          backgroundColor: "rgba(209, 213, 219, 0.05)", // Very light gray background
        }
      }
    } else {
      labelStyle = {
        fill: "#cbd5e1", // Light gray for inactive
        fontSize: 11,
        fontWeight: 400,
        backgroundColor: "rgba(184, 148, 148, 0.1)", // Very light gray background
      }
    }

    return {
      ...edge,
      style: edgeStyle,
      animated: isActive,
      label: edge.label || "",
      labelStyle: labelStyle,
    }
  })

  const handleNodeClick = useCallback(
    (event: any, node: any) => {
      event.stopPropagation()
      event.preventDefault()

    },
    [item, isMobile, allActiveNodes, flow.edges, visualNodes, isNodeModalOpen, isUpdating],
  )

  const handleInputChange = (inputLabel: string, value: string | boolean) => {
    setFormData((prev) => ({
      ...prev,
      [inputLabel]: value,
    }))
  }

  const completeNode = async (nodeId: string) => {
    const nodeToComplete = flow.nodes.find((n: any) => n.id === nodeId)
    if (!nodeToComplete || isUpdating || isCompletingNode) return

    const requiredInputs = nodeToComplete.data.inputs?.filter((input: any) => input.required) || []
    const missingInputs = requiredInputs.filter((input: any) => {
      const value = formData[input.label]
      if (input.type === "checkbox") {
        return value === undefined || value === null
      }
      return !value || (typeof value === "string" && !value.trim())
    })

    if (missingInputs.length > 0) {
      setToastMessage(
        t("validation.fillRequiredFields", { fields: missingInputs.map((input: any) => input.label).join(", ") })
      )
      setToastType('danger')
      setToastVisible(true)
      window.setTimeout(() => setToastVisible(false), 3000)
      return
    }

    // Fetch latest flow state first to make decisions based on freshest data
    let latestFlow: any = flow
    try {
      latestFlow = await apiService.getFlow(flow.id)
    } catch (e) {
      // ignore and continue with current flow if fetch fails
      console.warn('Failed to fetch latest flow for completion checks, using local flow snapshot', e)
      latestFlow = flow
    }

    const nodeNextNodes = getNextActualNodes(nodeId, latestFlow.edges, latestFlow.nodes)
    
    // For conditional nodes, check if path is selected first
    if (nodeToComplete.type === "conditional" && nodeNextNodes.length > 1 && !selectedPath) {
      setToastMessage(t("validation.selectPath"))
      setToastType('danger')
      setToastVisible(true)
      window.setTimeout(() => setToastVisible(false), 3000)
      return
    }

    // Filter nodes to check for responsibilities based on node type and selected path
    let nodesToCheck = nodeNextNodes
    if (nodeToComplete.type === "conditional" && selectedPath) {
      // For conditional nodes with a selected path, only check nodes on that path
      nodesToCheck = nodeNextNodes.filter((nextNode: any) => nextNode.edgeId === selectedPath)
    }

    // If any next node has no responsible, prompt for assignment
    const nextNodesNeedingResponsible = nodesToCheck.filter((nextNode: any) => {
      // Check per-item assignments first, then node-level responsibilities
      const perItemAssignments = (item?.data?.assignedResponsibilities) || {}
      const perItemResp = perItemAssignments[nextNode.id]
      const nodeResp = nextNode.data?.responsibilities || (nextNode.data?.responsibility ? [nextNode.data.responsibility] : [])
      
      // Debug logging
      if (process && process.env.NODE_ENV !== 'production') {
        console.log('[Assignment Check] Node', nextNode.id, {
          perItemResp,
          nodeResp,
          hasPerItem: perItemResp && perItemResp.length > 0,
          hasNodeLevel: nodeResp && nodeResp.length > 0,
          needsAssignment: (!perItemResp || perItemResp.length === 0) && (!nodeResp || nodeResp.length === 0)
        })
      }
      
      if (perItemResp && perItemResp.length > 0) {
        return false // Node already has per-item assignment
      }
      
      // Fall back to node-level responsibilities
      return (!nodeResp || nodeResp.length === 0)
    })
    
    if (process && process.env.NODE_ENV !== 'production') {
      console.log('[Assignment Check] Nodes needing assignment:', nextNodesNeedingResponsible.map(n => n.id))
      console.log('[Assignment Check] Is resuming from assignment?', !!assignmentResumeRef.current)
    }
    
    // Only show modal if we're not currently in a resume flow
    if (nextNodesNeedingResponsible.length > 0) {
      // Open modal to assign responsible group(s) for the next nodes.
      setNodesAwaitingAssignment(nextNodesNeedingResponsible)
      setIsAssignResponsibleModalOpen(true)
      // Store the node being completed so we can resume after assignment
      assignmentResumeRef.current = { nodeId, formData: { ...formData }, selectedPath }
      
      // Debug feedback
      setToastMessage(`Assignment needed for ${nextNodesNeedingResponsible.length} node(s): ${nextNodesNeedingResponsible.map(n => n.data?.label || n.id).join(', ')}`)
      setToastType('info')
      setToastVisible(true)
      window.setTimeout(() => setToastVisible(false), 4000)
      
      return
    }

    setIsCompletingNode(true)
    setIsUpdating(true)
        // Concurrency guard: fetch latest item state before proceeding
        try {
          const latestItem = latestFlow.items.find((i: any) => i.id === item.id)
          if (latestItem) {
            // If the node is already completed or current node moved, refresh and abort
            const nodeAlreadyCompleted = Array.isArray(latestItem.history) && latestItem.history.includes(nodeId)
            const nodeNotCurrentAnymore = latestItem.currentNodeId !== item.currentNodeId
            // If already completed elsewhere, refresh and stop
            if (nodeAlreadyCompleted) {
              try { await onUpdateItem(latestItem) } catch {}
              setToastMessage(t('flows.flowUpdated'))
              setToastType('info')
              setToastVisible(true)
              window.setTimeout(() => setToastVisible(false), 2000)
              setIsUpdating(false)
              setIsCompletingNode(false)
              return
            }
            // If state moved forward, rebase on latest and continue (no notify)
            if (nodeNotCurrentAnymore) {
              (rebasedRef as any).current = latestItem
              (skipNotifyRef as any).current = true
              try { await onUpdateItem(latestItem) } catch {}
            }
          }
        } catch (e) {
          // If refresh fails, continue optimistically
          console.warn('Failed to refresh before completing node:', e)
        }

  // Use latest state if we rebased
  const baseItem = (rebasedRef as any)?.current || item
  const updatedData = { ...baseItem.data }
    Object.entries(formData).forEach(([key, value]) => {
      // Store plain key for backward compatibility
      updatedData[key] = value
      // Also store composite key to disambiguate same-labeled inputs across nodes
      try {
        const compositeKey = `${nodeToComplete.id}::${key}`
        updatedData[compositeKey] = value
      } catch {}
    })

  let updatedPathTaken = baseItem.pathTaken || []

    if (nodeToComplete.type === "conditional" && selectedPath) {
      updatedPathTaken = [...updatedPathTaken, selectedPath]
    } else if (nodeNextNodes.length > 0) {
      const nextEdges = nodeNextNodes.map((node: any) => node.edgeId)
      updatedPathTaken = [...updatedPathTaken, ...nextEdges]
    }

    const updatedItem = {
      ...baseItem,
      data: updatedData,
      history: baseItem.history.includes(nodeId) ? baseItem.history : [...baseItem.history, nodeId],
      pathTaken: updatedPathTaken,
    }

      if (nodeToComplete.type === "final") {
      const finalUpdatedItem = {
        ...updatedItem,
        status: "completed",
      }
      try {
        // Complete planner task for this node if any
        await completePlannerTaskForNode(baseItem, nodeId)
        await onUpdateItem(finalUpdatedItem)
        setCurrentNodeCompleted(false)
        
        setToastMessage(t("items.flowCompletedSuccess"))
        setToastType('success')
        setToastVisible(true)
        window.setTimeout(() => setToastVisible(false), 2500)
        
        setTimeout(() => {
          setIsNodeModalOpen(false)
        }, 1500)
        
      } catch (error) {
        console.error('Failed to complete flow:', error)
        setToastMessage(t("items.completeFlowFailed", { error: error instanceof Error ? error.message : 'Unknown error' }))
        setToastType('danger')
        setToastVisible(true)
        window.setTimeout(() => setToastVisible(false), 3000)
      } finally {
        setIsUpdating(false)
        setIsCompletingNode(false)
      }
      return
    }

  if (nodeToComplete.type === "parallel") {
      if (!updatedItem.parallelPaths) {
        updatedItem.parallelPaths = {}
      }

      const parallelEdges = flow.edges.filter((edge: any) => edge.source === nodeId)
      
      const parallelPaths = parallelEdges.map((edge: any, index: number) => ({
        pathId: edge.id,
        completed: false,
        currentNode: edge.target,
        pathIndex: index,
      }))

      updatedItem.parallelPaths[nodeId] = parallelPaths

      const parallelEdgeIds = parallelEdges.map((edge: any) => edge.id)
      updatedItem.pathTaken = [...updatedPathTaken, ...parallelEdgeIds]

      try {
        // Auto-complete planner task for the parallel node itself if exists
        await completePlannerTaskForNode(baseItem, nodeId)
        // Create tasks for next nodes and notify BEFORE saving item; store task IDs (duplicates skipped inside helper)
        const taskMap = await createPlannerTaskForNext(updatedItem, nodeToComplete)
        if (Object.keys(taskMap).length > 0) {
          updatedItem.data = {
            ...updatedItem.data,
            plannerTasks: { ...(updatedItem.data?.plannerTasks || {}), ...taskMap },
          }
        }
        await notifyNextResponsibleGroups(updatedItem, nodeToComplete)
        await onUpdateItem(updatedItem)
        setCurrentNodeCompleted(false)
        setFormData({})
        setSelectedPath("")
        
        setToastMessage(t("items.parallelEnabledSuccess", { node: nodeToComplete.data.label }))
        setToastType('success')
        setToastVisible(true)
        window.setTimeout(() => setToastVisible(false), 2500)
        
        setTimeout(() => {
          setIsNodeModalOpen(false)
        }, 1500)
        
      } catch (error) {
        console.error('Failed to enable parallel paths:', error)
        setToastMessage(t("items.parallelEnableFailed", { error: error instanceof Error ? error.message : 'Unknown error' }))
        setToastType('danger')
        setToastVisible(true)
        window.setTimeout(() => setToastVisible(false), 3000)
      } finally {
        setIsUpdating(false)
        setIsCompletingNode(false)
      }
      return
    }

    if (baseItem.parallelPaths) {
      for (const [parallelNodeId, paths] of Object.entries(baseItem.parallelPaths)) {
        const pathArray = paths as any[]
        const currentPath = pathArray.find((path: any) => path.currentNode === baseItem.currentNodeId && !path.completed)

        if (currentPath) {
          const nextNodeInPath = flow.edges.find((edge: any) => edge.source === baseItem.currentNodeId)

          if (nextNodeInPath) {
            const targetNode = flow.nodes.find((n: any) => n.id === nextNodeInPath.target)
            
            // If the next node is a convergence node, check if all parallel paths have reached it
            if (targetNode?.type === "convergence") {
              // Move current path to the convergence node first
              const updatedPaths = pathArray.map((path: any) =>
                path.pathId === currentPath.pathId ? { ...path, currentNode: nextNodeInPath.target } : path,
              )
              updatedItem.parallelPaths[parallelNodeId] = updatedPaths
              
              // Now check if all parallel paths have reached the convergence node
              const allPathsAtConvergence = updatedPaths.every((path: any) => 
                path.currentNode === targetNode.id || path.completed
              )
              
              if (allPathsAtConvergence) {
                // All paths have reached convergence, now we can move beyond the convergence node
                const nextNodeAfterConvergence = flow.edges.find((edge: any) => edge.source === targetNode.id)
                if (nextNodeAfterConvergence) {
                  // Move all paths to the next node after convergence
                  const finalUpdatedPaths = updatedPaths.map((path: any) => {
                    if (path.currentNode === targetNode.id) {
                      return { ...path, currentNode: nextNodeAfterConvergence.target }
                    }
                    return path
                  })
                  updatedItem.parallelPaths[parallelNodeId] = finalUpdatedPaths
                } else {
                  // No node after convergence, mark all paths as completed
                  const finalUpdatedPaths = updatedPaths.map((path: any) => {
                    if (path.currentNode === targetNode.id) {
                      return { ...path, completed: true }
                    }
                    return path
                  })
                  updatedItem.parallelPaths[parallelNodeId] = finalUpdatedPaths
                }
              }
            } else {
              // Normal node, just move to the next node
              const updatedPaths = pathArray.map((path: any) =>
                path.pathId === currentPath.pathId ? { ...path, currentNode: nextNodeInPath.target } : path,
              )
              updatedItem.parallelPaths[parallelNodeId] = updatedPaths
            }
          } else {
            const updatedPaths = pathArray.map((path: any) =>
              path.pathId === currentPath.pathId ? { ...path, completed: true } : path,
            )
            updatedItem.parallelPaths[parallelNodeId] = updatedPaths
          }

          try {
            // Complete planner task for this node if any (avoid duplicate completion by referencing original mapping)
            await completePlannerTaskForNode(baseItem, baseItem.currentNodeId)
            // Create tasks for next nodes (duplicates skipped) and notify BEFORE saving item; store task IDs
            if (!(skipNotifyRef as any).current) {
              const taskMap = await createPlannerTaskForNext(updatedItem, nodeToComplete)
              if (Object.keys(taskMap).length > 0) {
                updatedItem.data = {
                  ...updatedItem.data,
                  plannerTasks: { ...(updatedItem.data?.plannerTasks || {}), ...taskMap },
                }
              }
              await notifyNextResponsibleGroups(updatedItem, nodeToComplete)
            }
            await onUpdateItem(updatedItem)
            setCurrentNodeCompleted(true)
            setFormData({})
            setSelectedPath("")
            
            setToastMessage(t("items.parallelPathCompletedSuccess"))
            setToastType('success')
            setToastVisible(true)
            window.setTimeout(() => setToastVisible(false), 2500)
            
            setTimeout(() => {
              setIsNodeModalOpen(false)
            }, 1500)
            
          } catch (error) {
            console.error('Failed to complete parallel path:', error)
            setToastMessage(t("items.parallelPathFailed", { error: error instanceof Error ? error.message : 'Unknown error' }))
            setToastType('danger')
            setToastVisible(true)
            window.setTimeout(() => setToastVisible(false), 3000)
          } finally {
            setIsUpdating(false)
            setIsCompletingNode(false)
          }
          return
        }
      }
    }

    if (nodeNextNodes.length === 1) {
      const nextNodeId = findNextAccessibleNode(nodeNextNodes[0].id)
      if (nextNodeId) {
        updatedItem.currentNodeId = nextNodeId
      }
    } else if (nodeToComplete.type === "conditional" && selectedPath) {
      const selectedNextNode = nodeNextNodes.find((n: any) => n.edgeId === selectedPath)
      if (selectedNextNode) {
        const nextNodeId = findNextAccessibleNode(selectedNextNode.id)
        if (nextNodeId) {
          updatedItem.currentNodeId = nextNodeId
        }
      }
    }

    try {
      // Complete planner task for this node if any
      await completePlannerTaskForNode(baseItem, nodeId)
      // Create tasks for next nodes and notify BEFORE saving item; store task IDs
      if (!(skipNotifyRef as any).current) {
        const taskMap = await createPlannerTaskForNext(updatedItem, nodeToComplete)
        if (Object.keys(taskMap).length > 0) {
          updatedItem.data = {
            ...updatedItem.data,
            plannerTasks: { ...(updatedItem.data?.plannerTasks || {}), ...taskMap },
          }
        }
        await notifyNextResponsibleGroups(updatedItem, nodeToComplete)
      }
  await onUpdateItem(updatedItem)
      setCurrentNodeCompleted(false)
      setFormData({})
      setSelectedPath("")
      
      // Show success notification
    setToastMessage(t("items.nodeCompletedSuccess", { node: nodeToComplete.data.label }))
        setToastType('success')
        setToastVisible(true)
        window.setTimeout(() => setToastVisible(false), 2500)
        
        // Close modal after successful completion
        setTimeout(() => {
          setIsNodeModalOpen(false)
        }, 1500)
        
      } catch (error) {
        console.error('Failed to complete node:', error)
        setToastMessage(t("items.completeNodeFailed", { error: error instanceof Error ? error.message : 'Unknown error' }))
        setToastType('danger')
        setToastVisible(true)
        window.setTimeout(() => setToastVisible(false), 3000)
      } finally {
        setIsUpdating(false)
        setIsCompletingNode(false)
      }
    
    // Focus on active nodes after completion
    
  }

  const completeCurrentNode = () => {
    completeNode(item.currentNodeId)
  }

  const renderInputField = (input: any) => {
    const value = formData[input.label] !== undefined ? formData[input.label] : item.data[input.label] || ""

    switch (input.type) {
      case "textarea":
        return (
          <Textarea
            value={value}
            onValueChange={(val) => handleInputChange(input.label, val)}
            placeholder={`Enter ${input.label}`}
            isRequired={input.required}
          />
        )
      case "number":
        return (
          <Input
            type="number"
            value={value}
            onValueChange={(val) => handleInputChange(input.label, val)}
            placeholder={`Enter ${input.label}`}
            isRequired={input.required}
          />
        )
      case "email":
        return (
          <Input
            type="email"
            value={value}
            onValueChange={(val) => handleInputChange(input.label, val)}
            placeholder={`Enter ${input.label}`}
            isRequired={input.required}
          />
        )
      case "date":
        return (
          <Input
            type="date"
            value={value}
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
            {input.label}{input.required && <span className="text-danger ml-1">*</span>}
          </Checkbox>
        )
      default:
        return (
          <Input
            type="text"
            value={value}
            onValueChange={(val) => handleInputChange(input.label, val)}
            placeholder={`Enter ${input.label}`}
            isRequired={input.required}
          />
        )
    }
  }

  const getAvailableActiveNodes = () => {
    return allActiveNodes.filter((node: any) => !item.history.includes(node.id))
  }

  const availableActiveNodes = getAvailableActiveNodes()

  // Focus around a specific node: the node itself, its immediate parents (resolving convergence), and its next actual nodes
  const focusAroundNode = useCallback((targetNodeId: string) => {
    if (!reactFlowInstance.current) return
    const node = flow.nodes.find((n: any) => n.id === targetNodeId)
    if (!node) return

    // Parents: include non-convergence parents; if parent is a convergence node, include its parents instead
    const incomingEdges = flow.edges.filter((e: any) => e.target === node.id)
    const parentIds = new Set<string>()
    for (const e of incomingEdges) {
      const parent = flow.nodes.find((n: any) => n.id === e.source)
      if (!parent) continue
      if (parent.type === 'convergence') {
        // Include parents of the convergence
        const convParents = flow.edges.filter((ce: any) => ce.target === parent.id)
        convParents.forEach((ce: any) => parentIds.add(ce.source))
      } else {
        parentIds.add(parent.id)
      }
    }

    // Children: next actual nodes skipping convergence via helper
    const nextActual = getNextActualNodes(node.id, flow.edges as any, flow.nodes as any)
    const childIds = nextActual.map((n: any) => n.id)

    const idsToFocus = new Set<string>([node.id, ...Array.from(parentIds), ...childIds])
    const nodesToFit = visualNodes.filter((vn: any) => idsToFocus.has(vn.id))
    if (nodesToFit.length > 0) {
      reactFlowInstance.current.fitView({ nodes: nodesToFit, padding: 0.3, includeHiddenNodes: false, duration: 0 })
    }
  }, [flow.nodes, flow.edges, visualNodes])

  // Function to focus on active nodes and their COMPLETED parents only (not incomplete ones)
  const focusOnActiveNodes = useCallback(() => {
    if (!reactFlowInstance.current) return

    // Prefer focusing the deep-linked node one time
    if (deepLinkNodeId && deepLinkFocusRef.current) {
      focusAroundNode(deepLinkNodeId)
      deepLinkFocusRef.current = false
      return
    }

    const activeNodeIds = allActiveNodes.map((node: any) => node.id)
    const completedParentNodeIds = new Set<string>()
    const childNodeIds = new Set<string>()

  // Get COMPLETED parents and children of active nodes, handling convergence nodes
  // Only include direct completed parents (no grandparents)
    allActiveNodes.forEach((activeNode: any) => {
      // Get parents with enhanced convergence handling - ONLY if they're completed
      const incomingEdges = flow.edges.filter((edge: any) => edge.target === activeNode.id)
      incomingEdges.forEach((edge: any) => {
        const parentNode = flow.nodes.find((n: any) => n.id === edge.source)
        
        // Only include parent if it's completed (in item.history)
        if (item.history.includes(edge.source)) {
      // Only add non-convergence parent if it's completed
      completedParentNodeIds.add(edge.source)
        }else if (parentNode?.type === "convergence") {
            // For convergence nodes, get ALL their COMPLETED parents to show the complete parallel paths
            const convergenceParents = flow.edges.filter((e: any) => e.target === parentNode.id)
            convergenceParents.forEach((e: any) => {
              // Only add if the convergence parent is completed
              if (item.history.includes(e.source)) {
                completedParentNodeIds.add(e.source)
              }
            })
          }
      })

      // Get children (these are the next steps in the workflow, so include them for context)
      const outgoingEdges = flow.edges.filter((edge: any) => edge.source === activeNode.id)
      outgoingEdges.forEach((edge: any) => {
        const childNode = flow.nodes.find((n: any) => n.id === edge.target)
        if (childNode?.type === "convergence") {
          // For convergence nodes, get their children instead
          const convergenceChildren = flow.edges.filter((e: any) => e.source === childNode.id)
          convergenceChildren.forEach((e: any) => {
            childNodeIds.add(e.target)
          })
        } else {
          childNodeIds.add(edge.target)
        }
      })
    })

    // Combine active nodes, their COMPLETED parents, and their children
    const nodesToFocus = [...activeNodeIds, ...Array.from(completedParentNodeIds), ...Array.from(childNodeIds)]
    
    if (nodesToFocus.length > 0) {
      const nodesToFit = visualNodes.filter((node: any) => nodesToFocus.includes(node.id))
      if (nodesToFit.length > 0) {
        console.log('Focusing on nodes:', nodesToFit.map((n: any) => n.data.label))
        console.log('Active nodes:', activeNodeIds)
        console.log('Completed parent nodes:', Array.from(completedParentNodeIds))
        console.log('Child nodes:', Array.from(childNodeIds))
        reactFlowInstance.current.fitView({
          nodes: nodesToFit,
          padding: 0.3,
          includeHiddenNodes: false,
          minZoom: 0.3,
          maxZoom: 1.5,
          duration: 0, // Remove animation
        })
      }
    } else {
      console.log('No active nodes found, fitting all nodes')
      // Fallback: fit all nodes if no active nodes
      reactFlowInstance.current.fitView({
        padding: 0.2,
        includeHiddenNodes: false,
        minZoom: 0.3,
        maxZoom: 1.5,
        duration: 0, // Remove animation
      })
    }
  }, [allActiveNodes, flow.edges, visualNodes, flow.nodes, item.history, deepLinkNodeId, focusAroundNode])



  // Handle modal node interaction
  const handleModalNodeInteraction = async (nodeId: string) => {
    // Prevent rapid updates
    if (isUpdating) return

    // Only update if we're actually switching to a different node
    if (nodeId === item.currentNodeId) {
      setIsNodeModalOpen(false)
      return
    }

    setIsUpdating(true)

    try {
      if (item.history.includes(nodeId)) {
        const updatedItem = {
          ...item,
          currentNodeId: nodeId,
        }
        await onUpdateItem(updatedItem)
        setCurrentNodeCompleted(false)
        setFormData({})
        setSelectedPath("")
        setIsNodeModalOpen(false)
        return
      }

      const isNodeActive = allActiveNodes.some((activeNode: any) => activeNode.id === nodeId)
      if (!isNodeActive) {
        return
      }

      const updatedItem = {
        ...item,
        currentNodeId: nodeId,
      }

      await onUpdateItem(updatedItem)
      setCurrentNodeCompleted(false)
      setFormData({})
      setSelectedPath("")
      setIsNodeModalOpen(false)
    } catch (error) {
      console.error('Failed to switch node:', error)
  setToastMessage(t("items.switchNodeFailed", { error: error instanceof Error ? error.message : 'Unknown error' }))
      setToastType('danger')
      setToastVisible(true)
      window.setTimeout(() => setToastVisible(false), 3000)
    } finally {
      setIsUpdating(false)
    }
  }

  const renderNodeInteractionContent = (node: any) => {
    const isCompleted = item.history.includes(node.id)
    let isActive = node.id === item.currentNodeId || allActiveNodes.some((activeNode: any) => activeNode.id === node.id)
    let isClickable = allActiveNodes.some((activeNode: any) => activeNode.id === node.id) || isCompleted
    
    // Check if this node comes after a convergence node
    const incomingEdges = flow.edges.filter((edge: any) => edge.target === node.id)
    const convergenceParent = incomingEdges.find((edge: any) => {
      const parentNode = flow.nodes.find((n: any) => n.id === edge.source)
      return parentNode?.type === "convergence"
    })
    
    if (convergenceParent) {
      const convergenceNode = flow.nodes.find((n: any) => n.id === convergenceParent.source)
      if (convergenceNode && !canAccessConvergenceNode(convergenceNode.id)) {
        isClickable = false
        isActive = false
      }
    }
    const nodeNextNodes = getNextActualNodes(node.id, flow.edges, flow.nodes)

  const canAct = userCanActOnNode(node)
  return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mt-2">
          {isCompleted ? (
            <CheckCircle className="w-5 h-5 text-success" />
          ) : isActive ? (
            <Clock className="w-5 h-5 text-primary" />
          ) : (
            <Clock className="w-5 h-5 text-default-400" />
          )}
          <div>
            <h3 className="text-lg font-semibold">{node.data?.label || t('items.unknownNode')}</h3>
          </div>
        </div>

        {isCompleted && (
          <div className="space-y-3">
            {/* Completed state: entire container is green; no inner banner needed */}
            
            {/* Show submitted input data for completed nodes */}
            {node.data?.inputs?.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-default-700">{t('nodes.submittedData')}:</h4>
                <div className="space-y-2">
                  {node.data.inputs.map((input: any, index: number) => {
                    const submittedValue = item.data?.[input.label]
                    
                    return (
                      <div key={index} className="">
                        <div className="flex justify-between items-start mb-1">
                          <label className="text-sm font-medium text-default-700">
                            {input.label}
                            {input.required && <span className="text-danger ml-1">*</span>}
                          </label>
                         
                        </div>
                        
                        <div className="text-sm text-default-600">
                          {input.type === "checkbox" ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={submittedValue === true}
                                disabled
                                className="rounded"
                              />
                              <span>{submittedValue === true ? t('common.yes') : t('common.no')}</span>
                            </div>
                          ) : input.type === "textarea" ? (
                            <div className="whitespace-pre-wrap bg-default-50 p-2 rounded border min-h-[60px]">
                              {submittedValue || <span className="text-default-400 italic">{t('nodes.noDataSubmitted')}</span>}
                            </div>
                          ) : (
                            <div className="bg-default-50 p-2 rounded border"> 
                              {submittedValue || <span className="text-default-400 italic">{t('nodes.noDataSubmitted')}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            
            
            
            {/* Show selected path for completed conditional nodes */}
      {node.type === "conditional" && (
              <div className="space-y-3">
        <h4 className="text-sm font-medium text-default-700">{t('items.selectedPath')}:</h4>
                <div className="p-3 bg-warning-50 rounded-lg border border-warning-200">
                  {(() => {
                    // Find the selected path from pathTaken
                    const nodeEdges = flow.edges.filter((edge: any) => edge.source === node.id)
                    const selectedEdgeId = item.pathTaken?.find((pathId: string) => 
                      nodeEdges.some((edge: any) => edge.id === pathId)
                    )
                    
                    if (selectedEdgeId) {
                      const selectedEdge = flow.edges.find((edge: any) => edge.id === selectedEdgeId)
                      const targetNode = flow.nodes.find((n: any) => n.id === selectedEdge?.target)
                      
                      // Get the choice text the same way it's shown in the selection UI
                      // This matches the logic in getNextActualNodes function
                      const choiceText = node.data?.edges?.find((e: any) => e.id === selectedEdgeId)?.title || 
                                        (targetNode?.data?.label ? `${targetNode.data.label}` : selectedEdge?.target)
                      
                      return (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <GitBranch className="w-4 h-4 text-warning-600" />
                            <span className="text-sm font-medium text-warning-800">
                              {choiceText}
                            </span>
                          </div>
                         
                         
                        </div>
                      )
                    } else {
                      return (
                        <div className="text-sm text-warning-700">
                          <span className="italic">{t('nodes.pathSelectionUnavailable')}</span>
                        </div>
                      )
                    }
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

       

       

        

        {/* Show node inputs for active node */}
  {isActive && !isCompleted && node.data?.inputs?.length > 0 && (
          <div className="space-y-4 border-t pt-4">
      <label className="text-sm font-medium">{t('items.completeNodeInputs')}</label>
            {node.data.inputs.map((input: any, index: number) => (
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
          </div>
        )}

        {/* Conditional Path Selection for active conditional nodes */}
  {isActive && !isCompleted && node.type === "conditional" && nodeNextNodes.length > 1 && (
          <div className="space-y-2 border-t pt-4">
            <label className="text-sm font-medium">{t('items.choosePath')}</label>
            <Select
              selectedKeys={selectedPath ? [selectedPath] : []}
              onSelectionChange={(keys) => {
                const selectedKey = Array.from(keys)[0] as string
                setSelectedPath(selectedKey || "")
              }}
              placeholder={t('items.selectPathToContinue')}
            >
              {nodeNextNodes.map((nextNode: any) => (
                <SelectItem key={nextNode.edgeId}>
                  {nextNode.edgeTitle}
                </SelectItem>
              ))}
            </Select>
           
          </div>
        )}

       

        {/* Show node inputs if available (for reference) */}
       

        {/* Show item data for this node */}




        {/* Action buttons */}
        <div className="flex flex-col gap-2 pt-4 ">
          {isActive && !isCompleted ? (
            // Complete node button for active nodes
            <Button
              onPress={() => completeNode(node.id)}
              color="primary"
              className="w-full"
              isDisabled={isCompletingNode || !canAct}
              isLoading={isCompletingNode}
              startContent={
                !isCompletingNode ? (
                  node.type === "parallel" ? (
                    <GitBranch className="w-4 h-4" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )
                ) : undefined
              }
            >
              {(!canAct && !isCompletingNode)
                ? t('items.notAuthorizedToComplete')
                : isCompletingNode 
                ? t('items.completing')
                : node.type === "parallel"
                  ? t('items.completeAndEnableParallelPaths')
                  : node.type === "final"
                    ? t('items.completeFlow')
                    : t('items.completeNode')}
            </Button>
          ) : null}
          
          <Button
            variant="ghost"
            color="danger"
            onPress={() => setIsNodeModalOpen(false)}
            className="w-full"
          >
            {t('common.close')}
          </Button>
        </div>

        
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-background overflow-hidden">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 bg-content1/90 backdrop-blur-sm border-b p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="light" onPress={onBack} startContent={<ArrowLeft className="w-4 h-4" />}>
              {t('items.backToTable')}
            </Button>
            <div>
              <h2 className="text-lg font-semibold">{t('items.flowProgress')}</h2>
              <p className="text-sm text-default-600">{t('items.itemIdLabel', { id: item.id.slice(-6) })}</p>
            </div>
          </div>
          {currentNodeCompleted && (
            <div className="text-sm text-success font-medium">✓ {t('items.clickNextNodeToProceed')}</div>
          )}
        </div>
        

      </div>

      {/* Full Screen Flow Canvas */}
      <div className="h-full w-full pt-16">
        <ReactFlow
          nodes={visualNodes}
          edges={visualEdges}
          nodeTypes={nodeTypes}
          onNodeClick={handleNodeClick}
          onInit={(instance) => {
            reactFlowInstance.current = instance
            
              focusOnActiveNodes()
          }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          zoomOnDoubleClick={false}
          panOnDrag={true}
          panOnScroll={false}
          zoomOnScroll={true}
          zoomOnPinch={true}
          className="bg-default-50"
        >
              <Background gap={12} size={1} />
              <div className="absolute top-20 left-4  backdrop-blur-sm p-3 rounded shadow text-xs z-10">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 bg-success-100 border-2 border-success-500 rounded"></div>
                  <span>{t('items.legend.completedClickable')}</span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 bg-primary-100 border-2 border-primary-400 rounded"></div>
                  <span>{t('items.legend.activeReady')}</span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 bg-default-100 border-2 border-default-300 rounded opacity-50"></div>
                  <span>{t('items.legend.pending')}</span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-4 h-1 bg-success-500 rounded"></div>
                  <span>{t('items.legend.pathTaken')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-1 bg-primary-500 rounded dash-animation"></div>
                  <span>{t('items.legend.activePath')}</span>
                </div>
                {isMobile && (
                  <div className="mt-2 pt-2 border-t text-xs text-primary">
                    <p>{t('items.hints.tapToInteract')}</p>
                    <p>{t('items.hints.pinchDrag')}</p>
                  </div>
                )}
                <div className="mt-2 pt-2  border-t">
                  <Button
                    size="sm"
                    onPress={focusOnActiveNodes}
                    className="w-full text-xs bg-primary-50"
                  >
                    {t('items.focusActiveAndCompleted')}
                  </Button>
                </div>
              </div>
            </ReactFlow>
          </div>

      {/* Mobile Node Interaction Modal */}
      <Modal 
        isOpen={isNodeModalOpen} 
        onClose={() => setIsNodeModalOpen(false)}
        size="lg"
        scrollBehavior="inside"
      >
        <ModalContent
          className={`${selectedNodeForModal && item.history.includes(selectedNodeForModal.id) ? 'bg-success-50 border border-success-200' : ''} rounded-xl overflow-hidden`}
        >
          
          <ModalBody 
            className={`pb-6`}
          >
            {selectedNodeForModal && renderNodeInteractionContent(selectedNodeForModal)}
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* Assign Responsible Modal */}
      <Modal
        isOpen={isAssignResponsibleModalOpen}
        onClose={() => { setIsAssignResponsibleModalOpen(false); setNodesAwaitingAssignment([]); assignmentResumeRef.current = null }}
        size="lg"
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalHeader>
            <h3>{t('items.assignResponsibleTitle') || 'Assign responsible for next steps'}</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              {nodesAwaitingAssignment.map((n: any) => (
                <div key={n.id} className="p-3 border rounded">
                  <div className="font-medium mb-2">{n.data?.label || n.id}</div>
                  <div className="text-sm text-default-600 mb-3">
                    Search and select users to assign responsibility for this step:
                  </div>
                  <UserSearch
                    onUserSelect={(user) => {
                      // Store selected users for this node
                      const currentUsers = n._newAssignedUsers || []
                      const isAlreadyAdded = currentUsers.some((u: any) => u.id === user.id)
                      if (!isAlreadyAdded) {
                        const updatedUsers = [...currentUsers, user]
                        setNodesAwaitingAssignment((prev) => 
                          prev.map(p => p.id === n.id ? { ...p, _newAssignedUsers: updatedUsers } : p)
                        )
                      }
                    }}
                    selectedUsers={n._newAssignedUsers || []}
                    placeholder="Search for users to assign..."
                  />
                  {/* Display selected users */}
                  {n._newAssignedUsers && n._newAssignedUsers.length > 0 && (
                    <div className="mt-3">
                      <div className="text-sm font-medium mb-2">Selected users:</div>
                      <div className="space-y-1">
                        {n._newAssignedUsers.map((user: any, idx: number) => (
                          <div key={user.id} className="flex items-center justify-between p-2 bg-default-50 rounded text-sm">
                            <span>{user.displayName} ({user.mail || user.userPrincipalName})</span>
                            <Button
                              isIconOnly
                              size="sm"
                              variant="light"
                              color="danger"
                              onPress={() => {
                                const updatedUsers = n._newAssignedUsers.filter((_: any, i: number) => i !== idx)
                                setNodesAwaitingAssignment((prev) => 
                                  prev.map(p => p.id === n.id ? { ...p, _newAssignedUsers: updatedUsers } : p)
                                )
                              }}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              <div className="flex gap-2 pt-4">
                <Button color="primary" onPress={async () => {
                  try {
                    // Validate that all nodes have at least one user assigned
                    const missingAssignments = nodesAwaitingAssignment.filter(n => 
                      !n._newAssignedUsers || n._newAssignedUsers.length === 0
                    )
                    
                    if (missingAssignments.length > 0) {
                      setToastMessage('Please assign at least one user to each step')
                      setToastType('danger')
                      setToastVisible(true)
                      window.setTimeout(() => setToastVisible(false), 3000)
                      return
                    }

                    // Persist assignments to the specific item (per-item assignments)
                    const latestFlow = await apiService.getFlow(flow.id)
                    const updatedItems = (latestFlow.items || []).map((it: any) => {
                      if (String(it.id) !== String(item.id)) return it
                      const existing = (it.data && it.data.assignedResponsibilities) ? { ...it.data.assignedResponsibilities } : {}
                      for (const a of nodesAwaitingAssignment) {
                        if (a._newAssignedUsers && a._newAssignedUsers.length > 0) {
                          // Store user IDs for this node
                          existing[a.id] = a._newAssignedUsers.map((u: any) => u.id)
                        }
                      }
                      return { ...it, data: { ...(it.data || {}), assignedResponsibilities: existing } }
                    })

                    const updatedFlow = { ...latestFlow, items: updatedItems }
                    await apiService.updateFlow(flow.id, {
                      name: updatedFlow.name,
                      description: updatedFlow.description,
                      columns: updatedFlow.columns,
                      nodes: updatedFlow.nodes,
                      edges: updatedFlow.edges,
                      items: updatedFlow.items,
                      plannerTeamId: updatedFlow.plannerTeamId,
                      plannerChannelId: updatedFlow.plannerChannelId,
                      plannerPlanId: updatedFlow.plannerPlanId,
                      plannerBucketId: updatedFlow.plannerBucketId,
                      deadlines: updatedFlow.deadlines || null,
                    })

                    // Close modal and resume completion if any
                    setIsAssignResponsibleModalOpen(false)
                    setNodesAwaitingAssignment([])
                    const resume = assignmentResumeRef.current
                    assignmentResumeRef.current = null // Clear this immediately to prevent loops
                    
                    if (resume) {
                      console.log('[Assignment] Saved assignments, resuming completion...')
                      
                      // Update the local item state with the assignments we just saved
                      const updatedItem = updatedItems.find((it: any) => String(it.id) === String(item.id))
                      if (updatedItem) {
                        // Update the item reference directly
                        Object.assign(item, updatedItem)
                        console.log('[Assignment] Updated local item with assignments:', updatedItem.data?.assignedResponsibilities)
                      }
                      
                      // restore form data and continue completion
                      setFormData(resume.formData || {})
                      setSelectedPath(resume.selectedPath || "")
                      
                      // Continue with completion - the updated assignments should prevent the modal from reopening
                      setTimeout(() => { 
                        completeNode(resume.nodeId)
                      }, 100) // Shorter delay
                    }
                  } catch (e) {
                    console.error('Failed to save responsibilities:', e)
                    setToastMessage(t('items.saveResponsibilitiesFailed') || 'Failed to save responsibilities')
                    setToastType('danger')
                    setToastVisible(true)
                    window.setTimeout(() => setToastVisible(false), 3000)
                  }
                }}>
                  {t('common.save') || 'Save'}
                </Button>
                <Button variant="bordered" onPress={() => { setIsAssignResponsibleModalOpen(false); setNodesAwaitingAssignment([]); assignmentResumeRef.current = null }}>Cancel</Button>
              </div>
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>

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
      
    </div>
  )
}
