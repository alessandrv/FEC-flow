"use client"

import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { X, Users, Plus, ChevronDown } from "lucide-react"
import { Button, Chip } from "@heroui/react"
import { useGroups } from "../providers"

interface MultiResponsibilitySelectorProps {
  value: string[]
  onChange: (value: string[]) => void
}

export default function MultiResponsibilitySelector({ value, onChange }: MultiResponsibilitySelectorProps) {
  const { groups, loading: isLoading } = useGroups()
  const [selectedGroup, setSelectedGroup] = useState<string>("")
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties | null>(null)

  const updateDropdownPosition = () => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const maxHeight = 240 // 60 * 4
    const spaceBelow = window.innerHeight - rect.bottom - 8
    const spaceAbove = rect.top - 8
    let top = rect.bottom + 4
    let height: number | undefined
    if (spaceBelow < 160 && spaceAbove > spaceBelow) {
      // Open upwards if not enough space below
      const possibleHeight = Math.min(maxHeight, spaceAbove)
      height = possibleHeight
      top = rect.top - possibleHeight - 4
    } else if (spaceBelow < maxHeight) {
      height = Math.min(maxHeight, spaceBelow)
    } else {
      height = maxHeight
    }
    setDropdownStyle({
      position: 'fixed',
      top,
      left: rect.left,
      width: rect.width,
      maxHeight: height,
      zIndex: 1000,
    })
  }

  useEffect(() => {
    if (isDropdownOpen) {
      updateDropdownPosition()
      window.addEventListener('resize', updateDropdownPosition)
      window.addEventListener('scroll', updateDropdownPosition, true)
      return () => {
        window.removeEventListener('resize', updateDropdownPosition)
        window.removeEventListener('scroll', updateDropdownPosition, true)
      }
    }
  }, [isDropdownOpen])

  const addResponsibility = () => {
    if (selectedGroup && !value.includes(selectedGroup)) {
      onChange([...value, selectedGroup])
      setSelectedGroup("")
      setIsDropdownOpen(false)
    }
  }

  const removeResponsibility = (groupId: string) => {
    onChange(value.filter((id) => id !== groupId))
  }

  const selectGroup = (groupId: string) => {
    setSelectedGroup(groupId)
    setIsDropdownOpen(false)
  }

  const availableGroups = groups.filter((group) => !value.includes(group.id))
  const selectedGroupData = groups.find((g) => g.id === selectedGroup)

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
            <div className="flex-1 relative">
              {/* Custom Dropdown */}
              <Button
                ref={triggerRef as any}
                variant="bordered"
                className="w-full justify-between"
                onPress={() => setIsDropdownOpen(!isDropdownOpen)}
              >
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  {selectedGroupData ? (
                    <>
                      <span>{selectedGroupData.name}</span>
                      <span className="text-xs text-default-500">({selectedGroupData.members.length} members)</span>
                    </>
                  ) : (
                    <span>Select a group to add</span>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`} />
              </Button>

              {/* Dropdown Menu */}
              {isDropdownOpen && dropdownStyle && typeof window !== 'undefined' && createPortal(
                <div
                  className="bg-content1 border border-default-200 rounded-lg shadow-lg overflow-y-auto backdrop-blur-sm"
                  style={dropdownStyle}
                  // Stop propagation in capture phase so parent modal doesn't see this as outside click
                  onMouseDownCapture={(e) => { e.stopPropagation() }}
                  onPointerDownCapture={(e) => { e.stopPropagation() }}
                  onClickCapture={(e) => { e.stopPropagation() }}
                  role="dialog"
                  aria-modal="true"
                  data-portal-dropdown
                >
                  {availableGroups.map((group) => (
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
                </div>,
                document.body
              )}
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

      {/* Click outside to close dropdown */}
      {isDropdownOpen && <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />}

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
