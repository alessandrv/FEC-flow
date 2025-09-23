"use client"

import { Chip } from "@heroui/react"
import { User } from "lucide-react"

interface UserChipProps {
  user: {
    id: string
    displayName: string
    givenName?: string
    surname?: string
  } | string // Support both user object and legacy user ID string
}

export default function UserChip({ user }: UserChipProps) {
  // Handle both user object and legacy string ID
  const userObj = typeof user === 'string' 
    ? { id: user, displayName: user } 
    : user

  const displayName = userObj.givenName && userObj.surname 
    ? `${userObj.givenName} ${userObj.surname}`
    : userObj.displayName

  return (
    <Chip
      variant="flat"
      color="secondary"
      size="sm"
      startContent={<User className="w-3 h-3" />}
      className="text-xs"
      title={`Assigned User: ${displayName}`}
    >
      {displayName}
    </Chip>
  )
}