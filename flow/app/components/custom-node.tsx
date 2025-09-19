"use client"

import { useState, memo, useRef, useEffect } from "react"
import { Handle, Position } from "@xyflow/react"
import { Settings, Plus, X, GitBranch, Merge, Play, ArrowRight, HelpCircle, Flag, Users, Edit2, ChevronDown } from 'lucide-react'
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
  Checkbox,
  Tabs,
  Tab,
} from "@heroui/react"
import ResponsibilityChip from "./responsibility-chip"
import MultiResponsibilitySelector from "./multi-responsibility-selector"

interface CustomNodeProps {
  data: {
    label: string
    inputs: Array<{ label: string; type: string; required: boolean }>
    nodeType: string
    responsibility?: string
    responsibilities?: string[]
    onUpdate?: (nodeId: string, newData: any) => void
    onNodeClick?: (nodeId: string) => void
    isActive?: boolean
    isCompleted?: boolean
    isDisabled?: boolean
    isClickable?: boolean
    edges?: Array<{ id: string; target: string; title: string }>
    selectedEdge?: string
    parallelPaths?: Array<{ pathId: string; completed: boolean; currentNode: string }>
    convergenceNode?: string
    convergenceInfo?: { completedParents: number; totalParents: number }
    itemData?: Record<string, any>
    isFlowDesigner?: boolean
    chosenPath?: string
    isDeepLinked?: boolean
    delegateUser?: { id: string; name: string }
  }
  id: string
}

const CustomNode = memo(({ data, id }: CustomNodeProps) => {
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<"general" | "inputs" | "conditional" | "responsibilities">("general")
  const [uiEpoch, setUiEpoch] = useState<number>(0)
  const [inputs, setInputs] = useState(data.inputs || [])
  const [edges, setEdges] = useState(data.edges || [])
  const [newInputLabel, setNewInputLabel] = useState("")
  const [newInputType, setNewInputType] = useState("text")
  const [newInputRequired, setNewInputRequired] = useState(false)
  const [responsibilities, setResponsibilities] = useState(
    data.responsibilities || (data.responsibility ? [data.responsibility] : []),
  )
  const [nodeLabel, setNodeLabel] = useState(data.label || "")
  const [isInputTypeDropdownOpen, setIsInputTypeDropdownOpen] = useState(false)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 })
  const dropdownTriggerRef = useRef<HTMLButtonElement>(null)
  const [isResponsibilitiesDropdownOpen, setIsResponsibilitiesDropdownOpen] = useState(false)


  const inputTypes = [
    { key: "text", label: "Text" },
    { key: "number", label: "Number" },
    { key: "email", label: "Email" },
    { key: "date", label: "Date" },
    { key: "textarea", label: "Textarea" },
    { key: "checkbox", label: "Checkbox" },
  ]

  // For delegation node: Teams user search (real API)
  const [delegateUser, setDelegateUser] = useState<any>(data.delegateUser || null)
  const [teamsUserQuery, setTeamsUserQuery] = useState("")
  const [teamsUserResults, setTeamsUserResults] = useState<any[]>([])
  const [isTeamsUserLoading, setIsTeamsUserLoading] = useState(false)
  const { searchUsers, isLoggedIn } = useTeamsAuth();
  import { useTeamsAuth } from "../providers/teams-auth.tsx"
  // Fetch Teams users when query changes (debounced)
  useEffect(() => {
    let active = true;
    if (data.nodeType === "delegation" && teamsUserQuery.trim() && isLoggedIn) {
      setIsTeamsUserLoading(true);
      searchUsers(teamsUserQuery)
        .then(results => {
          if (active) {
            setTeamsUserResults(
              (results || []).map((u: any) => ({
                id: u.id,
                name: u.displayName || u.name || u.mail || u.userPrincipalName || "Unknown"
              }))
            );
          }
        })
        .catch(() => {
          if (active) setTeamsUserResults([]);
        })
        .finally(() => {
          if (active) setIsTeamsUserLoading(false);
        });
    } else {
      setTeamsUserResults([]);
    }
    return () => { active = false; };
  }, [teamsUserQuery, data.nodeType, isLoggedIn, searchUsers]);

  useEffect(() => {
    if (isInputTypeDropdownOpen && dropdownTriggerRef.current) {
      const rect = dropdownTriggerRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const dropdownHeight = Math.min(inputTypes.length * 40 + 16, 240) // Estimate dropdown height

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
  }, [isInputTypeDropdownOpen, inputTypes.length])

  // Ensure state resets when modal closes, even after tab changes
  useEffect(() => {
    if (!isConfigDialogOpen) {
      setActiveTab("general")
      setIsInputTypeDropdownOpen(false)
      setUiEpoch((v) => v + 1)
      setIsResponsibilitiesDropdownOpen(false)
    }
  }, [isConfigDialogOpen])



  const getNodeColor = (nodeType: string) => {
    const baseClasses = "border-2 transition-all duration-300"
    .then((results: any[]) => {
    const disabledClasses = data.isDisabled ? "opacity-50" : ""

    // Priority: Completed > Active > Normal
    if (data.isCompleted) {
      // Completed nodes: green border and ring, no matter the node type
      return `bg-success-50 border-success-500 ring-2 ring-success-300 ${baseClasses} ${clickableClasses} ${disabledClasses}`
    } else if (data.isActive) {
      // Active nodes: blue ring on top of node type color
      switch (nodeType) {
        case "initial":
          return `bg-success-50 border-success-300 ring-2 ring-primary shadow-lg ${baseClasses} ${clickableClasses} ${disabledClasses}`
        case "serial":
          return `bg-primary-50 border-primary-300 ring-2 ring-primary shadow-lg ${baseClasses} ${clickableClasses} ${disabledClasses}`
        case "parallel":
          return `bg-secondary-50 border-secondary-300 ring-2 ring-primary shadow-lg ${baseClasses} ${clickableClasses} ${disabledClasses}`
        case "conditional":
          return `bg-warning-50 border-warning-300 ring-2 ring-primary shadow-lg ${baseClasses} ${clickableClasses} ${disabledClasses}`
        case "final":
          return `bg-success-50 border-success-300 ring-2 ring-primary shadow-lg ${baseClasses} ${clickableClasses} ${disabledClasses}`
        case "convergence":
          return `bg-danger-50 border-danger-300 ring-2 ring-primary shadow-lg ${baseClasses} ${clickableClasses} ${disabledClasses}`
        default:
          return `bg-default-50 border-default-300 ring-2 ring-primary shadow-lg ${baseClasses} ${clickableClasses} ${disabledClasses}`
      }
    } else {
      // Normal nodes: just the node type color
      switch (nodeType) {
        case "initial":
          return `bg-success-50 border-success-300 ${baseClasses} ${clickableClasses} ${disabledClasses}`
        case "serial":
          return `bg-primary-50 border-primary-300 ${baseClasses} ${clickableClasses} ${disabledClasses}`
        case "parallel":
          return `bg-secondary-50 border-secondary-300 ${baseClasses} ${clickableClasses} ${disabledClasses}`
        case "conditional":
          return `bg-warning-50 border-warning-300 ${baseClasses} ${clickableClasses} ${disabledClasses}`
        case "final":
          return `bg-success-50 border-success-300 ${baseClasses} ${clickableClasses} ${disabledClasses}`
        case "convergence":
          return `bg-danger-50 border-danger-300 ${baseClasses} ${clickableClasses} ${disabledClasses}`
        default:
          return `bg-default-50 border-default-300 ${baseClasses} ${clickableClasses} ${disabledClasses}`
      }
    }
  }

  const getNodeIcon = (nodeType: string) => {
    switch (nodeType) {
      case "initial":
        return <Play className="w-3 h-3 text-success-600" />
      case "serial":
        return <ArrowRight className="w-3 h-3 text-primary-600" />
      case "parallel":
        return <GitBranch className="w-3 h-3 text-secondary-600" />
      case "conditional":
        return <HelpCircle className="w-3 h-3 text-warning-600" />
      case "final":
        return <Flag className="w-3 h-3 text-success-600" />
      case "convergence":
        return <Merge className="w-3 h-3 text-danger-600" />
      case "delegation":
        return <Users className="w-3 h-3 text-primary-600" />
      default:
        return null
    }
  }

  const handleNodeClick = () => {
    if (data.isClickable && data.onNodeClick) {
      data.onNodeClick(id)
    }
  }

  const addInput = () => {
    if (!newInputLabel.trim()) return

    const newInput = {
      label: newInputLabel,
      type: newInputType,
      required: newInputRequired,
    }

    const updatedInputs = [...inputs, newInput]
    setInputs(updatedInputs)
    setNewInputLabel("")
    setNewInputType("text")
    setNewInputRequired(false)
  }

  const removeInput = (index: number) => {
    const updatedInputs = inputs.filter((_, i) => i !== index)
    setInputs(updatedInputs)
  }

  const updateEdgeTitle = (edgeIndex: number, title: string) => {
    const updatedEdges = [...edges]
    updatedEdges[edgeIndex] = { ...updatedEdges[edgeIndex], title }
    setEdges(updatedEdges)
  }

  const saveConfiguration = () => {
    if (data.onUpdate) {
      data.onUpdate(id, {
        label: nodeLabel,
        inputs,
        edges: data.nodeType === "conditional" ? edges : undefined,
        responsibilities,
        responsibility: undefined,
        delegateUser: data.nodeType === "delegation" ? delegateUser : undefined,
      })
    }
    setIsConfigDialogOpen(false)
  }

  const formatValue = (value: any, inputType: string) => {
    if (value === null || value === undefined || value === "") return "-"

    if (inputType === "checkbox") {
      return value === true || value === "true" ? "✓" : "✗"
    }

    if (typeof value === "string" && value.length > 20) {
      return value.substring(0, 20) + "..."
    }

    return String(value)
  }

  const shouldShowConfig = data.nodeType !== "convergence" && data.nodeType !== "initial"

  const getNodeHeight = () => {
    let baseHeight = 80

    // Always account for input rows in flow designer for accurate sizing
    if (inputs.length > 0) {
      baseHeight += inputs.length * 20
    }

    if (data.nodeType === "conditional" && data.isCompleted && data.chosenPath) {
      baseHeight += 40
    }

    

    if (data.nodeType === "convergence" && data.convergenceInfo) {
      baseHeight += 40
    }

    const currentResponsibilities = data.responsibilities || (data.responsibility ? [data.responsibility] : [])
    if (currentResponsibilities.length > 0 && data.nodeType !== "convergence") {
      const chipsPerRow = 2
      const chipRows = Math.ceil(currentResponsibilities.length / chipsPerRow)
      baseHeight += chipRows * 28
    }

    return Math.max(baseHeight, 120)
  }

  const selectedInputType = inputTypes.find((type) => type.key === newInputType)

  return (
    <>
      {data.nodeType !== "initial" && (
        <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-default-400 border-2 border-white" />
      )}

      <Card
        className={`shadow-md ${getNodeColor(data.nodeType)} flex flex-col items-center ${data.isDeepLinked ? 'deeplink-flash-border' : ''}`}
        isPressable={data.isClickable}
        onPress={handleNodeClick}
        style={{ 
          minHeight: `${getNodeHeight()}px`,
          minWidth: '12rem',
          width: 'auto'
        }}
      >
        <CardHeader className="pb-2 w-full">
          <div className="flex justify-between items-center w-full">
            <div className="flex items-center gap-1">
              {getNodeIcon(data.nodeType)}
              <span className="text-sm font-medium">{data.label}</span>
            </div>
            {data.isFlowDesigner && shouldShowConfig && (
              <Button
                isIconOnly
                variant="light"
                size="sm"
                onPress={() => {
                  setActiveTab("general")
                  setIsConfigDialogOpen(true)
                }}
              >
                <Settings className="w-3 h-3" />
              </Button>
            )}
            {data.isFlowDesigner && data.nodeType === "convergence" && (
              <div className="h-6 w-6 flex items-center justify-center">
                <Merge
                  className="w-3 h-3 text-danger-600"
                />
              </div>
            )}
          </div>
          
        </CardHeader>
        {data.nodeType !== "convergence" && (
            <div className="m-2 mt-0 w-full">
              <div className="flex flex-wrap gap-1 justify-center">
                {(data.responsibilities || (data.responsibility ? [data.responsibility] : [])).map(
                  (respId: string, index: number) => (
                    <ResponsibilityChip key={`${data.nodeType}-${id}-${index}-${respId}`} groupId={respId} />
                  ),
                )}
              </div>
            </div>
          )}
        <CardBody className="pt-0 w-full">
          
          {/* Show input fields - always show individual rows in flow designer for accurate sizing */}
          {inputs.length > 0 && (
            <div className="space-y-1 w-full">
              {inputs.map((input, index) => (
                <div key={index} className="text-xs flex justify-between items-center whitespace-nowrap">
                  <span className="text-default-600">{input.label}:</span>
                  <span className="font-medium text-default-800 ml-2">
                    {data.itemData ? formatValue(data.itemData?.[input.label], input.type) : `[${input.type}]`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Show convergence node info */}
          {data.nodeType === "convergence" && !data.itemData && (
            <div className="text-xs text-danger-600 text-center">Merges multiple paths</div>
          )}

          {/* Show chosen condition for completed conditional nodes */}
          {data.nodeType === "conditional" && data.isCompleted && data.chosenPath && (
            <div className="mt-2 p-2 bg-success-50 rounded border border-success-200 text-center">
              <div className="text-xs text-success-700 font-medium">Esito</div>
              <div className="text-xs text-success-800">{data.chosenPath}</div>
            </div>
          )}

          

         

          {/* Convergence node status */}
          {data.nodeType === "convergence" && data.convergenceInfo && (
            <div className="mt-2 space-y-1 text-center">
              <div className="text-xs text-danger-600">
                {data.convergenceInfo.completedParents}/{data.convergenceInfo.totalParents} parents ready
              </div>
              <div className="w-full bg-danger-200 rounded-full h-1">
                <div
                  className="bg-danger-500 h-1 rounded-full transition-all duration-300"
                  style={{
                    width: `${(data.convergenceInfo.completedParents / data.convergenceInfo.totalParents) * 100}%`,
                  }}
                ></div>
              </div>
            </div>
          )}

          {/* Multiple Responsibility Chips - Only for non-convergence nodes */}
          
        </CardBody>
      </Card>

      {data.nodeType !== "final" && (
        <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-default-400 border-2 border-white" />
      )}

      {/* Configuration Modal */}
      {isConfigDialogOpen && (
        <Modal
          isOpen={isConfigDialogOpen}
          onClose={() => {
            setIsInputTypeDropdownOpen(false)
            setUiEpoch((v) => v + 1)
            setIsConfigDialogOpen(false)
            setIsResponsibilitiesDropdownOpen(false)
          }}
          size="2xl"
          scrollBehavior="inside"
          // Disable outside click (backdrop) & ESC dismissal to prevent accidental closure while editing
          isDismissable={false}
        >
          <ModalContent>
            <ModalHeader className="flex items-start justify-between">
              <div className="flex flex-col pr-4">
                <h2>Configure Node: {data.label}</h2>
                <p className="text-sm text-default-500 font-normal">Configure node settings and input fields</p>
              </div>
              
            </ModalHeader>
            <ModalBody className="pb-6">
              <Tabs
                key={uiEpoch}
                selectedKey={activeTab}
                onSelectionChange={(key) => {
                  setIsInputTypeDropdownOpen(false)
                  setUiEpoch((v) => v + 1)
                  setActiveTab(key as any)
                }}
                aria-label="Node configuration tabs"
              >
                <Tab key="general" title="General">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <Edit2 className="w-4 h-4" />
                        Node Label
                      </label>
                      <Input value={nodeLabel} onValueChange={setNodeLabel} placeholder="Enter node label" />
                    </div>
                  </div>
                </Tab>

                <Tab key="inputs" title="Inputs">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Current Inputs</label>
                      {inputs.map((input, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-default-50 rounded">
                          <div className="flex-1">
                            <span className="text-sm font-medium">{input.label}</span>
                            <span className="text-xs text-default-500 ml-2">({input.type})</span>
                            {input.required && <span className="text-xs text-danger ml-1">*</span>}
                          </div>
                          <Button isIconOnly variant="light" size="sm" color="danger" onPress={() => removeInput(index)}>
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>

                    <div className="border-t pt-4 space-y-3">
                      <label className="text-sm font-medium">Add New Input</label>
                      <Input
                        label="Label"
                        value={newInputLabel}
                        onValueChange={setNewInputLabel}
                        placeholder="Input label"
                        size="sm"
                      />

                      <div className="space-y-1">
                        <label className="text-sm font-medium">Type</label>
                        <div className="relative">
                          <Button
                            ref={dropdownTriggerRef}
                            variant="bordered"
                            className="w-full justify-between"
                            onPress={() => setIsInputTypeDropdownOpen(!isInputTypeDropdownOpen)}
                          >
                            {selectedInputType?.label || "Select type"}
                            <ChevronDown
                              className={`w-4 h-4 transition-transform ${isInputTypeDropdownOpen ? "rotate-180" : ""}`}
                            />
                          </Button>

                        {isInputTypeDropdownOpen && (
                            <>
                              <div
                              className="fixed inset-0 z-[9999] bg-transparent"
                              data-overlay="input-type-overlay"
                                onClick={() => setIsInputTypeDropdownOpen(false)}
                              />
                              <div
                              className="fixed z-[10000] bg-content1 border border-default-200 rounded-lg shadow-xl max-h-60 overflow-y-auto"
                              data-portal="input-type-dropdown"
                                style={{
                                  top: `${dropdownPosition.top}px`,
                                  left: `${dropdownPosition.left}px`,
                                  width: `${dropdownPosition.width}px`,
                                }}
                              >
                                <div className="p-1">
                                  {inputTypes.map((type) => (
                                    <button
                                      key={type.key}
                                      className="w-full px-3 py-2 text-left hover:bg-default-100 transition-colors rounded-md text-sm"
                                      onClick={() => {
                                        setNewInputType(type.key)
                                        setIsInputTypeDropdownOpen(false)
                                      }}
                                    >
                                      {type.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox isSelected={newInputRequired} onValueChange={setNewInputRequired}>
                          Required
                        </Checkbox>
                      </div>
                      <Button
                        onPress={addInput}
                        size="sm"
                        color="primary"
                        startContent={<Plus className="w-3 h-3" />}
                        className="w-full"
                      >
                        Add Input
                      </Button>
                    </div>
                  </div>
                </Tab>

                {data.nodeType === "conditional" && (
                  <Tab key="conditional" title="Conditional">
                    <div className="space-y-3">
                      <label className="text-sm font-medium">Edge Titles</label>
                      {edges.map((edge, index) => (
                        <div key={edge.id} className="flex items-center gap-2">
                          <Input
                            value={edge.title || ""}
                            onValueChange={(value) => updateEdgeTitle(index, value)}
                            placeholder={`Path ${index + 1} title`}
                            size="sm"
                          />
                          <span className="text-xs text-default-500">→ {edge.target}</span>
                        </div>
                      ))}
                      {edges.length === 0 && (
                        <p className="text-xs text-default-500">Connect this node to other nodes to add path titles</p>
                      )}
                    </div>
                  </Tab>
                )}

                {data.nodeType === "delegation" ? (
                  <Tab key="delegation" title="Delegation">
                    <div className="space-y-3">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Delegate to Teams User
                      </label>
                      <Input
                        label="Search Teams user"
                        value={teamsUserQuery}
                        onValueChange={setTeamsUserQuery}
                        placeholder="Type name..."
                        size="sm"
                        isDisabled={!isLoggedIn}
                      />
                      {isTeamsUserLoading && <div className="text-xs text-default-500">Loading...</div>}
                      <div className="space-y-1">
                        {teamsUserResults.map(user => (
                          <Button
                            key={user.id}
                            size="sm"
                            variant={delegateUser?.id === user.id ? "solid" : "light"}
                            color="primary"
                            className="w-full text-left"
                            onPress={() => setDelegateUser(user)}
                          >
                            {user.name}
                          </Button>
                        ))}
                        {teamsUserResults.length === 0 && !isTeamsUserLoading && teamsUserQuery.trim() && (
                          <div className="text-xs text-default-500">No users found</div>
                        )}
                      </div>
                      {delegateUser && (
                        <div className="mt-2 text-xs text-success-700">Selected: {delegateUser.name}</div>
                      )}
                    </div>
                  </Tab>
                ) : (
                  data.nodeType !== "convergence" && (
                    <Tab key="responsibilities" title="Responsibilities">
                      <div className="space-y-3">
                        <label className="text-sm font-medium flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          Responsabilità (Required)
                        </label>
                        <MultiResponsibilitySelector
                          value={responsibilities}
                          onChange={setResponsibilities}
                        />
                      </div>
                    </Tab>
                  )
                )}
              </Tabs>

              <div className="mt-4">
                <Button onPress={saveConfiguration} color="primary" className="w-full">
                  Save Configuration
                </Button>
              </div>
            </ModalBody>
          </ModalContent>
        </Modal>
      )}
    </>
  )
})

CustomNode.displayName = "CustomNode"

export default CustomNode
