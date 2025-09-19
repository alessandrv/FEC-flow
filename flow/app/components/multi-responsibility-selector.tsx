"use client"

import { useState, useEffect, useRef } from "react"
import { X, Users, Plus } from "lucide-react"
import { Button, Chip, Select, SelectItem } from "@heroui/react"
import { useGroups } from "../providers"

interface MultiResponsibilitySelectorProps {
  value: string[]
  onChange: (value: string[]) => void
}

export default function MultiResponsibilitySelector({ value, onChange }: MultiResponsibilitySelectorProps) {
  const { groups, loading: isLoading } = useGroups()
  const [selectedGroup, setSelectedGroup] = useState<string>("")
  // No local dropdown portal needed when using HeroUI Select
  const [selectedGroupId, setSelectedGroupId] = useState<string>("")

  // HeroUI Select will handle dropdown placement and interactions inside a Modal

  const addResponsibility = () => {
    const toAdd = selectedGroupId || selectedGroup
    if (toAdd && !value.includes(toAdd)) {
      onChange([...value, toAdd])
      setSelectedGroup("")
      setSelectedGroupId("")
    }
  }

  const removeResponsibility = (groupId: string) => {
    onChange(value.filter((id) => id !== groupId))
  }

  const selectGroup = (groupId: string) => {
  setSelectedGroup(groupId)
  setSelectedGroupId(groupId)
  }

  const availableGroups = groups.filter((group) => !value.includes(group.id))
  const selectedGroupData = groups.find((g) => g.id === (selectedGroupId || selectedGroup))

  if (isLoading) {
    return <div className="text-sm text-default-500">Loading groups...</div>
  }

  return (
    <div className="space-y-3">
      {/* Debug Info */}
      <div className="text-xs text-default-400">
        Total groups: {groups.length}, Available: {availableGroups.length}, Selected: {value.length}
      </div>

      {/* Selected Responsibilities */}
      {value.length > 0 && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-default-700">Selected Groups:</label>
          <div className="flex flex-wrap gap-2">
            {value.map((groupId) => {
              const group = groups.find((g) => g.id === groupId)
              if (!group) return null

              // Check if it's a custom color that needs special handling
              const isCustomColor = ["yellow", "pink", "indigo", "emerald", "rose", "cyan"].includes(group.color)

              if (isCustomColor) {
                return (
                  <Chip
                    key={groupId}
                    size="sm"
                    startContent={<Users className="w-3 h-3" />}
                    endContent={
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        onPress={() => removeResponsibility(groupId)}
                        className="min-w-4 w-4 h-4"
                      >
                        <X className="w-2 h-2" />
                      </Button>
                    }
                    className={`${
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
                  key={groupId}
                  color={group.color as any}
                  size="sm"
                  startContent={<Users className="w-3 h-3" />}
                  endContent={
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      onPress={() => removeResponsibility(groupId)}
                      className="min-w-4 w-4 h-4"
                    >
                      <X className="w-2 h-2" />
                    </Button>
                  }
                >
                  {group.name}
                </Chip>
              )
            })}
          </div>
        </div>
      )}

      {/* Add New Responsibility */}
      {availableGroups.length > 0 ? (
        <div className="space-y-2">
          <label className="text-xs font-medium text-default-700">Add Group:</label>
          <div className="flex gap-2">
              <div className="flex-1">
                <Select
                  selectedKeys={selectedGroupId ? [selectedGroupId] : []}
                  onSelectionChange={(keys) => {
                    const k = Array.from(keys)[0] as string
                    setSelectedGroupId(k || "")
                    setSelectedGroup(k || "")
                  }}
                  placeholder="Select a group to add"
                >
                  {availableGroups.map((group) => (
                    <SelectItem key={group.id}>
                      <div className="flex items-center gap-2">
                        <Users className="w-3 h-3" />
                        <span>{group.name}</span>
                        <span className="text-xs text-default-500">({group.members.length} members)</span>
                      </div>
                    </SelectItem>
                  ))}
                </Select>
              </div>
            <Button
              onPress={addResponsibility}
              isDisabled={!selectedGroup}
              size="sm"
              color="primary"
              startContent={<Plus className="w-3 h-3" />}
            >
              Add
            </Button>
          </div>
        </div>
      ) : (
        <div className="text-sm text-default-500">
          {groups.length === 0 ? "No groups available" : "All groups are already selected"}
        </div>
      )}

  {/* HeroUI Select handles its own overlay/interaction */}

      {/* Validation Message */}
      {value.length === 0 && <p className="text-xs text-danger">At least one responsible group is required</p>}

      {groups.length === 0 && (
        <div className="p-3 bg-warning-50 rounded-lg">
          <p className="text-xs text-warning-700 font-medium">No groups available</p>
          <p className="text-xs text-warning-600">Create groups first in the Group Management section</p>
        </div>
      )}
    </div>
  )
}
