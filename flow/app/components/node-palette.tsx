"use client"

import type React from "react"

import { useState } from "react"
import { Play, ArrowRight, GitBranch, HelpCircle, Merge, Flag, ChevronRight, ChevronDown } from "lucide-react"
import { Card, CardBody, CardHeader, Button } from "@heroui/react"
import { useTranslation } from "../hooks/useTranslation"

interface NodePaletteProps {
  onDragStart: (nodeType: string) => void
}

const baseNodeTypes = [
  { type: "serial", icon: ArrowRight, color: "border-primary bg-primary-50 text-primary-700" },
  { type: "parallel", icon: GitBranch, color: "border-secondary bg-secondary-50 text-secondary-700" },
  { type: "convergence", icon: Merge, color: "border-danger bg-danger-50 text-danger-700" },
  { type: "conditional", icon: HelpCircle, color: "border-warning bg-warning-50 text-warning-700" },
  { type: "final", icon: Flag, color: "border-success bg-success-50 text-success-700" },
]

export default function NodePalette({ onDragStart }: NodePaletteProps) {
  const { t } = useTranslation()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const nodeTypes = baseNodeTypes.map(nt => ({
    ...nt,
    label: t(`flowEditor.paletteLabels.${nt.type}` as any) || t(`flowEditor.nodeTypes.${nt.type}` as any) || nt.type,
    description: t(`flowEditor.nodeTypeDescriptions.${nt.type}` as any) || ""
  }))

  const handleDragStart = (e: React.DragEvent, nodeType: string) => {
    e.dataTransfer.setData("application/reactflow", nodeType)
    e.dataTransfer.effectAllowed = "move"
    onDragStart(nodeType)
  }

  return (
    <Card className="w-64 shadow-lg border-2 border-default-200">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <Play className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">{t('flowEditor.nodePalette') || 'Node Palette'}</span>
          </div>
          <Button isIconOnly variant="light" size="sm" onPress={() => setIsCollapsed(!isCollapsed)}>
            {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
        </div>
  {!isCollapsed && <p className="text-xs text-default-600">{t('flowEditor.hints.dragNodes') || 'Drag nodes to the canvas to add them'}</p>}
      </CardHeader>

      {!isCollapsed && (
        <CardBody className="space-y-2">
          {nodeTypes.map((nodeType) => {
            const IconComponent = nodeType.icon
            return (
              <div
                key={nodeType.type}
                draggable
                onDragStart={(e) => handleDragStart(e, nodeType.type)}
                className={`
                  p-3 rounded-lg border-2 cursor-grab active:cursor-grabbing
                  hover:shadow-md transition-all duration-200 hover:scale-105
                  ${nodeType.color}
                `}
                title={nodeType.description}
              >
                <div className="flex items-center gap-2 mb-1">
                  <IconComponent className="w-4 h-4" />
                  <span className="text-sm font-medium">{nodeType.label}</span>
                </div>
                <p className="text-xs opacity-75">{nodeType.description}</p>
              </div>
            )
          })}

          
        </CardBody>
      )}
    </Card>
  )
}
