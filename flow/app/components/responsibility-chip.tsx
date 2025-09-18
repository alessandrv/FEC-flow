"use client"

import { Chip } from "@heroui/react"
import { Users } from "lucide-react"
import { useGroups } from "../providers"

interface ResponsibilityChipProps {
  groupId: string
}

export default function ResponsibilityChip({ groupId }: ResponsibilityChipProps) {
  const { groups, loading } = useGroups()
  const group = groups.find((g) => g.id === groupId)

  if (!group) {
    return (
      <Chip variant="flat" color="default" size="sm" startContent={<Users className="w-3 h-3" />} className="text-xs">
        Unknown Group
      </Chip>
    )
  }

  // Map group colors to Hero UI chip colors with proper typing
  const getChipColor = (color: string): "default" | "primary" | "secondary" | "success" | "warning" | "danger" => {
    switch (color) {
      case "primary":
        return "primary"
      case "success":
        return "success"
      case "secondary":
        return "secondary"
      case "danger":
        return "danger"
      case "warning":
        return "warning"
      default:
        return "default"
    }
  }

  // Check if it's a custom color that needs special handling
  const isCustomColor = ["yellow", "pink", "indigo", "emerald", "rose", "cyan"].includes(group.color)

  if (isCustomColor) {
    return (
      <Chip
        size="sm"
        variant="solid"
        startContent={<Users className="w-3 h-3" />}
        title={`Responsible: ${group.members.map((m) => m.name).join(", ")}`}
        className={`text-xs font-medium ${
          group.color === "yellow" ? "bg-yellow-400 text-yellow-900" :
          group.color === "pink" ? "bg-pink-400 text-pink-900" :
          group.color === "indigo" ? "bg-indigo-400 text-indigo-900" :
          group.color === "emerald" ? "bg-emerald-400 text-emerald-900" :
          group.color === "rose" ? "bg-rose-400 text-rose-900" :
          "bg-cyan-400 text-cyan-900"
        }`}
      >
        {group.name}
      </Chip>
    )
  }

  return (
    <Chip
      color={getChipColor(group.color)}
      size="sm"
      variant="solid"
      startContent={<Users className="w-3 h-3" />}
      title={`Responsible: ${group.members.map((m) => m.name).join(", ")}`}
      className="text-xs text-white font-medium"
    >
      {group.name}
    </Chip>
  )
}
