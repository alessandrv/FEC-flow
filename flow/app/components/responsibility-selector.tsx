"use client"

import { useState } from "react"
import { Users, ChevronDown } from "lucide-react"
import { Button } from "@heroui/react"
import { useGroups } from "../providers"

interface ResponsibilitySelectorProps {
  value: string
  onChange: (value: string) => void
  required?: boolean
}

export default function ResponsibilitySelector({ value, onChange, required = false }: ResponsibilitySelectorProps) {
  const { groups, loading: isLoading } = useGroups()
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  const selectGroup = (groupId: string) => {
    onChange(groupId)
    setIsDropdownOpen(false)
  }

  const selectedGroup = groups.find((g) => g.id === value)

  if (isLoading) {
    return <div className="text-sm text-default-500">Loading groups...</div>
  }

  return (
    <div className="w-full space-y-2">
      <div className="text-xs text-default-400">
        Available groups: {groups.length}, Selected: {selectedGroup?.name || "None"}
      </div>

      <div className="relative">
        {/* Custom Dropdown */}
        <Button
          variant="bordered"
          className="w-full justify-between"
          onPress={() => setIsDropdownOpen(!isDropdownOpen)}
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            {selectedGroup ? (
              <>
                <span>{selectedGroup.name}</span>
                <span className="text-xs text-default-500">({selectedGroup.members.length} members)</span>
              </>
            ) : (
              <span>Select responsible group</span>
            )}
          </div>
          <ChevronDown className={`w-4 h-4 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`} />
        </Button>

        {/* Dropdown Menu */}
        {isDropdownOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-content1 border border-default-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
            {groups.map((group) => (
              <button
                key={group.id}
                className="w-full px-3 py-2 text-left hover:bg-default-100 transition-colors first:rounded-t-lg last:rounded-b-lg"
                onClick={() => selectGroup(group.id)}
              >
                <div className="flex items-center gap-2">
                  <Users className="w-3 h-3" />
                  <span>{group.name}</span>
                  <span className="text-xs text-default-500">({group.members.length} members)</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Click outside to close dropdown */}
        {isDropdownOpen && <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />}
      </div>

      {required && !value && <p className="text-xs text-danger mt-1">Please select a responsible group</p>}

      {groups.length === 0 && (
        <div className="p-3 bg-warning-50 rounded-lg">
          <p className="text-xs text-warning-700 font-medium">No groups available</p>
          <p className="text-xs text-warning-600">Create groups first in the Group Management section</p>
        </div>
      )}
    </div>
  )
}
