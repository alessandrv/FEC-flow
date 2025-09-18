"use client"
import { useEffect, useState } from 'react'
import { Button, Card, CardBody, CardHeader, Chip, Skeleton, Divider } from '@heroui/react'
import { Settings, Users, Calendar, Archive, CheckCircle2, AlertCircle } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'
import { useTeamsAuth } from '../providers/teams-auth'
import type { FlowSettingsChange } from './flow-settings-panel'
import { PlannerDestinationModal } from './planner-destination-modal'

interface PlannerDestinationPanelProps {
	plannerTeamId: string | null
	plannerPlanId: string | null
	plannerBucketId: string | null
	onChange: (changes: Partial<FlowSettingsChange>) => void
}

export function PlannerDestinationPanel(props: PlannerDestinationPanelProps){
	const { t } = useTranslation()
	const { getUserTeams, getTeamChannels, getPlannerPlansForGroup, getPlannerBuckets, isLoggedIn } = useTeamsAuth()
	const { plannerTeamId, plannerPlanId, plannerBucketId } = props
	const [names, setNames] = useState({ team:'', plan:'', bucket:'' })
	const [loading, setLoading] = useState(true)
	const [modalOpen, setModalOpen] = useState(false)

	// Lazy load names just for summary display
	useEffect(()=>{(async ()=>{
		setLoading(true)
		// Reset names when IDs change
		setNames({ team:'', plan:'', bucket:'' })
		try {
			if(isLoggedIn && plannerTeamId){ const list = await getUserTeams(); const f=list.find((t:any)=>t.id===plannerTeamId); if(f) setNames(n=>({...n,team:f.displayName})) }
			if(plannerTeamId && plannerPlanId){ const list = await getPlannerPlansForGroup(plannerTeamId); const f=list.find((p:any)=>p.id===plannerPlanId); if(f) setNames(n=>({...n,plan:f.title})) }
			if(plannerPlanId && plannerBucketId){ const list = await getPlannerBuckets(plannerPlanId); const f=list.find((b:any)=>b.id===plannerBucketId); if(f) setNames(n=>({...n,bucket:f.name})) }
		}catch{}
		finally { setLoading(false) }
	})()}, [plannerTeamId, plannerPlanId, plannerBucketId, isLoggedIn])

	const isComplete = plannerTeamId && plannerPlanId && plannerBucketId
	const getDisplayName = (name: string, id: string | null) => {
		if (!id) return '—'
		return name || `${id.slice(0,8)}...`
	}

	return (
		<Card className="w-full">
			<CardHeader className="pb-2">
				<div className="flex items-center justify-between w-full">
					<div className="flex items-center gap-2">
						<Calendar className="w-4 h-4 text-primary-500" />
						<h4 className="text-sm font-semibold text-foreground">{t('planner.destination')}</h4>
						
					</div>
					<Button 
						size="sm" 
						color="primary"
						variant="flat"
						startContent={<Settings className="w-3 h-3" />}
						onPress={()=>setModalOpen(true)}
					>
						{t('planner.manageDestination')||'Configure'}
					</Button>
				</div>
			</CardHeader>
			<Divider />
			<CardBody className="pt-3">
				{loading ? (
					<div className="space-y-3">
						<Skeleton className="h-4 w-full rounded" />
						<Skeleton className="h-4 w-3/4 rounded" />
						<Skeleton className="h-4 w-2/3 rounded" />
						<Skeleton className="h-4 w-1/2 rounded" />
					</div>
				) : (
					<div className="space-y-3">
						<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
							<div className="flex items-center gap-2 p-2 rounded-lg bg-default-50 border border-default-200">
								<Users className="w-4 h-4 text-blue-500 flex-shrink-0" />
								<div className="min-w-0 flex-1">
									<div className="text-xs font-medium text-default-600">{t('planner.team')}</div>
									<div className="text-sm text-foreground truncate">{getDisplayName(names.team, plannerTeamId)}</div>
								</div>
							</div>
							<div className="flex items-center gap-2 p-2 rounded-lg bg-default-50 border border-default-200">
								<Calendar className="w-4 h-4 text-green-500 flex-shrink-0" />
								<div className="min-w-0 flex-1">
									<div className="text-xs font-medium text-default-600">{t('planner.plan')}</div>
									<div className="text-sm text-foreground truncate">{getDisplayName(names.plan, plannerPlanId)}</div>
								</div>
							</div>
							<div className="flex items-center gap-2 p-2 rounded-lg bg-default-50 border border-default-200">
								<Archive className="w-4 h-4 text-orange-500 flex-shrink-0" />
								<div className="min-w-0 flex-1">
									<div className="text-xs font-medium text-default-600">{t('planner.bucket')}</div>
									<div className="text-sm text-foreground truncate">{getDisplayName(names.bucket, plannerBucketId)}</div>
								</div>
							</div>
						</div>
						{!plannerBucketId && (
							<div className="flex items-center gap-2 p-3 rounded-lg bg-warning-50 border border-warning-200">
								<AlertCircle className="w-4 h-4 text-warning-600 flex-shrink-0" />
								<div className="text-sm text-warning-700">{t('planner.bucketRequired')}</div>
							</div>
						)}
					</div>
				)}
			</CardBody>
			<PlannerDestinationModal
				isOpen={modalOpen}
				onClose={()=>setModalOpen(false)}
				initialTeamId={plannerTeamId}
				initialPlanId={plannerPlanId}
				initialBucketId={plannerBucketId}
				onApply={props.onChange}
			/>
		</Card>
	)
}
