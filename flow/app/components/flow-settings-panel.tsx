"use client"
import { useEffect, useState } from 'react'
import { Button, Input, Spinner, Chip, Accordion, AccordionItem, Tooltip } from '@heroui/react'
import { useTranslation } from '../hooks/useTranslation'
import { useTeamsAuth } from '../providers/teams-auth'

interface FlowSettingsPanelProps {
  flow: any
  plannerTeamId: string | null
  plannerChannelId: string | null
  plannerPlanId: string | null
  plannerBucketId: string | null
  universalDeadlineDays: number | ''
  onChange: (changes: Partial<FlowSettingsChange>) => void
  onCreatePlan: (teamId: string, title: string) => Promise<any>
  onCreateBucket: (planId: string, title: string) => Promise<any>
}

export interface FlowSettingsChange {
  plannerTeamId: string | null
  plannerChannelId: string | null
  plannerPlanId: string | null
  plannerBucketId: string | null
  universalDeadlineDays: number | ''
  deadlineInputField: string | null
}

export default function FlowSettingsPanel(props: FlowSettingsPanelProps) {
  const { t } = useTranslation()
  const { getUserTeams, getTeamChannels, getPlannerPlansForGroup, getPlannerBuckets, isLoggedIn } = useTeamsAuth()
  const { plannerTeamId, plannerChannelId, plannerPlanId, plannerBucketId, universalDeadlineDays } = props
  const [teams, setTeams] = useState<any[]>([])
  const [channels, setChannels] = useState<any[]>([])
  const [plans, setPlans] = useState<any[]>([])
  const [buckets, setBuckets] = useState<any[]>([])
  const [loading, setLoading] = useState({ teams: false, channels: false, plans: false, buckets: false })
  const [teamQuery, setTeamQuery] = useState('')
  const [channelQuery, setChannelQuery] = useState('')
  const [planQuery, setPlanQuery] = useState('')
  const [bucketQuery, setBucketQuery] = useState('')

  // Load lists when IDs change
  useEffect(() => { (async () => {
    if (!isLoggedIn) return
    if (plannerTeamId && teams.length === 0) {
      setLoading(l => ({ ...l, teams: true }));
      try { const list = await getUserTeams(); setTeams(list.map((t:any)=>({id:t.id, name:t.displayName}))) } finally { setLoading(l => ({ ...l, teams: false })) }
    }
    if (plannerTeamId && plannerChannelId && channels.length === 0) {
      setLoading(l => ({ ...l, channels: true }));
      try { const list = await getTeamChannels(plannerTeamId); setChannels(list.map((c:any)=>({id:c.id, name:c.displayName}))) } finally { setLoading(l => ({ ...l, channels: false })) }
    }
    if (plannerTeamId && plans.length === 0) {
      setLoading(l => ({ ...l, plans: true }));
      try { const list = await getPlannerPlansForGroup(plannerTeamId); setPlans(list.map((p:any)=>({id:p.id, name:p.title}))) } finally { setLoading(l => ({ ...l, plans: false })) }
    }
    if (plannerPlanId && buckets.length === 0) {
      setLoading(l => ({ ...l, buckets: true }));
      try { const list = await getPlannerBuckets(plannerPlanId); setBuckets(list.map((b:any)=>({id:b.id, name:b.name}))) } finally { setLoading(l => ({ ...l, buckets: false })) }
    }
  })() }, [plannerTeamId, plannerChannelId, plannerPlanId])

  const update = (changes: Partial<FlowSettingsChange>) => props.onChange(changes)

  const clearTeam = () => update({ plannerTeamId: null, plannerChannelId: null, plannerPlanId: null, plannerBucketId: null })
  const clearPlan = () => update({ plannerPlanId: null, plannerBucketId: null })
  const clearBucket = () => update({ plannerBucketId: null })
  const clearChannel = () => update({ plannerChannelId: null })

  const loadTeams = async () => { if (!isLoggedIn) return; setLoading(l => ({...l, teams:true})); try { const list = await getUserTeams(); setTeams(list.map((t:any)=>({id:t.id, name:t.displayName}))) } finally { setLoading(l => ({...l, teams:false})) } }
  const loadChannels = async () => { if (!plannerTeamId) return; setLoading(l => ({...l, channels:true})); try { const list = await getTeamChannels(plannerTeamId); setChannels(list.map((c:any)=>({id:c.id, name:c.displayName}))) } finally { setLoading(l => ({...l, channels:false})) } }
  const loadPlans = async () => { if (!plannerTeamId) return; setLoading(l => ({...l, plans:true})); try { const list = await getPlannerPlansForGroup(plannerTeamId); setPlans(list.map((p:any)=>({id:p.id, name:p.title}))) } finally { setLoading(l => ({...l, plans:false})) } }
  const loadBuckets = async () => { if (!plannerPlanId) return; setLoading(l => ({...l, buckets:true})); try { const list = await getPlannerBuckets(plannerPlanId); setBuckets(list.map((b:any)=>({id:b.id, name:b.name}))) } finally { setLoading(l => ({...l, buckets:false})) } }

  const filteredTeams = teamQuery ? teams.filter(t=> t.name.toLowerCase().includes(teamQuery.toLowerCase())) : teams
  const filteredChannels = channelQuery ? channels.filter(c=> c.name.toLowerCase().includes(channelQuery.toLowerCase())) : channels
  const filteredPlans = planQuery ? plans.filter(p=> p.name.toLowerCase().includes(planQuery.toLowerCase())) : plans
  const filteredBuckets = bucketQuery ? buckets.filter(b=> b.name.toLowerCase().includes(bucketQuery.toLowerCase())) : buckets
  const plannerComplete = !!(plannerTeamId && plannerChannelId && plannerPlanId && plannerBucketId)

  const [expanded, setExpanded] = useState<string[]>(['team'])
  // Auto-expand next section when a selection is made
  useEffect(()=>{
    setExpanded(prev => {
      const set = new Set(prev)
      if (plannerTeamId) set.add('channel')
      if (plannerChannelId) set.add('plan')
      if (plannerPlanId) set.add('bucket')
      if (plannerBucketId) set.add('deadline')
      return Array.from(set)
    })
  }, [plannerTeamId, plannerChannelId, plannerPlanId, plannerBucketId])

  return (
    <div className="w-80 p-3 space-y-5">
      {/* Summary Header */}
      <div className="border border-default-200 rounded-md p-3 bg-content2/30 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold tracking-wide uppercase text-default-600">{t('planner.destination') || 'Planner Destination'}</h3>
          {plannerComplete && <Chip size="sm" color="success" variant="flat">OK</Chip>}
        </div>
        <div className="flex flex-wrap gap-1 mb-2">
          <Tooltip content={t('planner.selectTeam')}><Chip size="sm" color={plannerTeamId ? 'success':'default'} variant="flat">Team</Chip></Tooltip>
          <Tooltip content={t('planner.selectChannel')}><Chip size="sm" color={plannerChannelId ? 'success':'default'} variant="flat">Channel</Chip></Tooltip>
          <Tooltip content={t('planner.selectPlan')}><Chip size="sm" color={plannerPlanId ? 'success':'default'} variant="flat">Plan</Chip></Tooltip>
          <Tooltip content={t('planner.selectBucket')}><Chip size="sm" color={plannerBucketId ? 'success':'warning'} variant="flat">Bucket</Chip></Tooltip>
          <Tooltip content={t('flowEditor.universalDeadline') || 'Deadline'}>
            <Chip size="sm" color={universalDeadlineDays !== '' ? 'primary':'default'} variant="flat">{universalDeadlineDays !== '' ? `D+${universalDeadlineDays}` : 'Deadline'}</Chip>
          </Tooltip>
        </div>
        {!plannerComplete && <p className="text-[11px] text-warning-600 flex items-center gap-1">{t('planner.validationIncomplete') || 'Incomplete configuration'}</p>}
      </div>

      <Accordion
        selectedKeys={new Set(expanded)}
        onSelectionChange={(keys)=> setExpanded(Array.from(keys as Set<string>))}
        variant="splitted"
        itemClasses={{
          base: 'border border-default-200 shadow-none',
          title: 'text-sm font-medium',
          content: 'pt-3'
        }}
      >
        {/* TEAM */}
        <AccordionItem key="team" aria-label="team" title={t('planner.selectTeam')} subtitle={plannerTeamId ? (teams.find(t=>t.id===plannerTeamId)?.name || ''): undefined}>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 justify-between" variant="bordered" onPress={loadTeams}>
                {plannerTeamId ? (teams.find(t=>t.id===plannerTeamId)?.name || 'Team selected') : t('planner.selectTeam')}
              </Button>
              {plannerTeamId && <Button isIconOnly size="sm" variant="light" onPress={clearTeam}>✕</Button>}
            </div>
            {teams.length>0 && <Input size="sm" value={teamQuery} onValueChange={setTeamQuery} placeholder={(t('common.search')||'Search')+ ' team'} className="text-xs" />}
            {loading.teams && <Spinner size="sm" />}
            {filteredTeams.length>0 && (
              <div className="max-h-52 overflow-y-auto border rounded-md divide-y divide-default-100">
                {filteredTeams.map(team=> {
                  const active = plannerTeamId===team.id
                  return (
                    <button key={team.id} className={`w-full text-left px-3 py-2 text-xs flex justify-between items-center hover:bg-default-100 transition-colors ${active?'bg-primary-50':''}`} onClick={()=>{update({plannerTeamId:team.id, plannerChannelId:null, plannerPlanId:null, plannerBucketId:null}); setChannels([]); setPlans([]); setBuckets([]);}}>
                      <span className="truncate pr-2">{team.name}</span>{active && <span className="text-[10px] text-primary-500">✓</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </AccordionItem>
        {/* CHANNEL */}
        <AccordionItem key="channel" aria-label="channel" title={t('planner.selectChannel')} isDisabled={!plannerTeamId} subtitle={plannerChannelId ? (channels.find(c=>c.id===plannerChannelId)?.name || ''): undefined}>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 justify-between" variant="bordered" onPress={loadChannels}>
                {plannerChannelId ? (channels.find(c=>c.id===plannerChannelId)?.name || 'Channel selected') : t('planner.selectChannel')}
              </Button>
              {plannerChannelId && <Button isIconOnly size="sm" variant="light" onPress={clearChannel}>✕</Button>}
            </div>
            {channels.length>0 && <Input size="sm" value={channelQuery} onValueChange={setChannelQuery} placeholder={(t('common.search')||'Search')+ ' channel'} className="text-xs" />}
            {loading.channels && <Spinner size="sm" />}
            {filteredChannels.length>0 && (
              <div className="max-h-52 overflow-y-auto border rounded-md divide-y divide-default-100">
                {filteredChannels.map(ch=>{
                  const active = plannerChannelId===ch.id
                  return (
                    <button key={ch.id} className={`w-full text-left px-3 py-2 hover:bg-default-100 transition-colors text-xs flex justify-between items-center ${active?'bg-primary-50':''}`} onClick={()=>update({plannerChannelId:ch.id})}>
                      <span className="truncate pr-2">{ch.name}</span>{active && <span className="text-[10px] text-primary-500">✓</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </AccordionItem>
        {/* PLAN */}
        <AccordionItem key="plan" aria-label="plan" title={t('planner.selectPlan')} isDisabled={!plannerChannelId} subtitle={plannerPlanId ? (plans.find(p=>p.id===plannerPlanId)?.name || ''): undefined}>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 justify-between" variant="bordered" onPress={loadPlans}>
                {plannerPlanId ? (plans.find(p=>p.id===plannerPlanId)?.name || 'Plan selected') : t('planner.selectPlan')}
              </Button>
              <Button size="sm" variant="light" onPress={async ()=>{ if(!plannerTeamId) return; const title=prompt(t('planner.newPlan')); if(!title) return; const plan= await props.onCreatePlan(plannerTeamId,title); setPlans(p=>[{id:plan.id,name:plan.title},...p]); update({plannerPlanId:plan.id}); }}>+ Plan</Button>
              {plannerPlanId && <Button isIconOnly size="sm" variant="light" onPress={clearPlan}>✕</Button>}
            </div>
            {plans.length>0 && <Input size="sm" value={planQuery} onValueChange={setPlanQuery} placeholder={(t('common.search')||'Search')+ ' plan'} className="text-xs" />}
            {loading.plans && <Spinner size="sm" />}
            {filteredPlans.length>0 && (
              <div className="max-h-52 overflow-y-auto border rounded-md divide-y divide-default-100">
                {filteredPlans.map(pl=>{
                  const active = plannerPlanId===pl.id
                  return (
                    <button key={pl.id} className={`w-full text-left px-3 py-2 hover:bg-default-100 transition-colors text-xs flex justify-between items-center ${active?'bg-primary-50':''}`} onClick={async ()=>{update({plannerPlanId:pl.id, plannerBucketId:null}); setBuckets([]);}}>
                      <span className="truncate pr-2">{pl.name}</span>{active && <span className="text-[10px] text-primary-500">✓</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </AccordionItem>
        {/* BUCKET */}
        <AccordionItem key="bucket" aria-label="bucket" title={t('planner.selectBucket')} isDisabled={!plannerPlanId} subtitle={plannerBucketId ? (buckets.find(b=>b.id===plannerBucketId)?.name || ''): undefined}>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 justify-between" variant="bordered" onPress={loadBuckets}>
                {plannerBucketId ? (buckets.find(b=>b.id===plannerBucketId)?.name || 'Bucket selected') : t('planner.selectBucket')}
              </Button>
              <Button size="sm" variant="light" onPress={async ()=>{ if(!plannerPlanId) return; const nm=prompt(t('planner.newBucket')); if(!nm) return; const b= await props.onCreateBucket(plannerPlanId,nm); setBuckets(bs=>[{id:b.id,name:b.name},...bs]); update({plannerBucketId:b.id}); }}>+ Bucket</Button>
              {plannerBucketId && <Button isIconOnly size="sm" variant="light" onPress={clearBucket}>✕</Button>}
            </div>
            {buckets.length>0 && <Input size="sm" value={bucketQuery} onValueChange={setBucketQuery} placeholder={(t('common.search')||'Search')+ ' bucket'} className="text-xs" />}
            {loading.buckets && <Spinner size="sm" />}
            {filteredBuckets.length>0 && (
              <div className="max-h-52 overflow-y-auto border rounded-md divide-y divide-default-100">
                {filteredBuckets.map(b=>{
                  const active = plannerBucketId===b.id
                  return (
                    <button key={b.id} className={`w-full text-left px-3 py-2 hover:bg-default-100 transition-colors text-xs flex justify-between items-center ${active?'bg-primary-50':''}`} onClick={()=>update({plannerBucketId:b.id})}>
                      <span className="truncate pr-2">{b.name}</span>{active && <span className="text-[10px] text-primary-500">✓</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </AccordionItem>
        {/* DEADLINE */}
        <AccordionItem key="deadline" aria-label="deadline" title={t('flowEditor.universalDeadline') || 'Deadline'} subtitle={universalDeadlineDays !== '' ? `D+${universalDeadlineDays}`: undefined}>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-default-600">{t('flowEditor.universalDeadline') || 'Universal deadline (days)'}</label>
              <Input size="sm" type="number" min={1} value={(universalDeadlineDays as any) === '' ? '' : String(universalDeadlineDays)}
                onValueChange={(v)=>{ if(v===''){update({universalDeadlineDays:''});return;} const n=parseInt(v,10); if(!isNaN(n)&&n>0) update({universalDeadlineDays:n}) }} placeholder={t('flowEditor.deadlinePlaceholder')||'e.g.30'} />
              {universalDeadlineDays!=='' && (
                <Button size="sm" variant="light" onPress={()=>update({universalDeadlineDays:''})}>Clear</Button>
              )}
            </div>
            <p className="text-[11px] text-default-500 leading-relaxed">{t('flowEditor.deadlineHelp') || 'If set, tasks without a per-label deadline use creation date + these days.'}</p>
          </div>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
