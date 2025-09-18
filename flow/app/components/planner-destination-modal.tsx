"use client"
import React, { useEffect, useState } from 'react'
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Spinner, Card, CardBody, Chip, Progress, Divider } from '@heroui/react'
import { Users, Archive, Calendar, CheckCircle2, Circle, Search, X, ArrowLeft, ArrowRight } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'
import { useTeamsAuth } from '../providers/teams-auth'
import type { FlowSettingsChange } from './flow-settings-panel'

interface PlannerDestinationModalProps {
  isOpen: boolean
  onClose: () => void
  initialTeamId: string | null
  initialPlanId: string | null
  initialBucketId: string | null
  onApply: (changes: Partial<FlowSettingsChange>) => void
}

type StepKey = 'team' | 'plan' | 'bucket' | 'summary';

  const steps = ['team', 'plan', 'bucket', 'summary'] as const;

export function PlannerDestinationModal(props: PlannerDestinationModalProps){
  const { t } = useTranslation()
  const { isLoggedIn, getUserTeams, getPlannerPlansForGroup, getPlannerBuckets } = useTeamsAuth()
  const { isOpen, onClose } = props

  const [activeStep, setActiveStep] = useState<StepKey>('team')
  const [teams, setTeams] = useState<any[]>([])
  const [plans, setPlans] = useState<any[]>([])
  const [buckets, setBuckets] = useState<any[]>([])
  const [loading, setLoading] = useState({teams:false, plans:false, buckets:false})
  const [queries, setQueries] = useState({team:'', plan:'', bucket:''})
  const [sel, setSel] = useState({
    teamId: props.initialTeamId,
    channelId: null, // Keep for backward compatibility but not used
    planId: props.initialPlanId,
    bucketId: props.initialBucketId
  })

  const resetFrom = (k: StepKey) => {
    if(k==='team') setSel({teamId:null, channelId:null, planId:null, bucketId:null})
    if(k==='plan') setSel(s=>({...s, planId:null, bucketId:null}))
    if(k==='bucket') setSel(s=>({...s, bucketId:null}))
  }

  const loadTeams = async () => { if(!isLoggedIn) return; setLoading(l=>({...l,teams:true})); try { const list = await getUserTeams(); setTeams(list.map((t:any)=>({id:t.id,name:t.displayName}))) } finally { setLoading(l=>({...l,teams:false})) } }
  const loadPlans = async () => { 
    if(!sel.teamId) return; 
    setLoading(l=>({...l,plans:true})); 
    try { 
      const list = await getPlannerPlansForGroup(sel.teamId); 
      setPlans(list.map((p:any)=>({id:p.id,name:p.title}))) 
    } finally { 
      setLoading(l=>({...l,plans:false})) 
    } 
  }
  const loadBuckets = async () => { if(!sel.planId) return; setLoading(l=>({...l,buckets:true})); try { const list = await getPlannerBuckets(sel.planId); setBuckets(list.map((b:any)=>({id:b.id,name:b.name}))) } finally { setLoading(l=>({...l,buckets:false})) } }

  // Auto load for persisted selections
  useEffect(()=>{ if(isOpen){ if(teams.length===0) loadTeams(); if(sel.teamId){ loadPlans(); } if(sel.planId){ loadBuckets(); } } }, [isOpen])

  // Reset modal state when opening
  useEffect(() => {
    if (isOpen) {
      // Reset to initial state on each open
      setActiveStep('team')
      setSel({
        teamId: props.initialTeamId,
        channelId: null,
        planId: props.initialPlanId,
        bucketId: props.initialBucketId
      })
      setQueries({team:'', plan:'', bucket:''})
      // Clear previous session data
      setPlans([])
      setBuckets([])
    }
  }, [isOpen, props.initialTeamId, props.initialPlanId, props.initialBucketId])

  // Auto load when selections change
  useEffect(() => {
    if(sel.teamId && plans.length === 0 && !loading.plans) {
      loadPlans()
    }
  }, [sel.teamId])

  useEffect(() => {
    if(sel.teamId && sel.channelId && plans.length === 0 && !loading.plans) {
      loadPlans()
    }
  }, [sel.teamId, sel.channelId])

  useEffect(() => {
    if(sel.planId && buckets.length === 0 && !loading.buckets) {
      loadBuckets()
    }
  }, [sel.planId])

  // Auto load when step changes and we have the prerequisite selection
  useEffect(() => {
    if(activeStep === 'plan' && sel.teamId && plans.length === 0 && !loading.plans) {
      loadPlans()
    }
    if(activeStep === 'bucket' && sel.planId && buckets.length === 0 && !loading.buckets) {
      loadBuckets()
    }
  }, [activeStep])

  // Step validation
  const canNext = () => {
    if(activeStep==='team') return !!sel.teamId
    if(activeStep==='plan') return !!sel.planId
    if(activeStep==='bucket') return !!sel.bucketId
    if(activeStep==='summary') return true // Summary is always ready
    return false
  }

  const goNext = () => {
    const idx = steps.indexOf(activeStep)
    if(idx < steps.length -1) setActiveStep(steps[idx+1])
  }
  const goPrev = () => {
    const idx = steps.indexOf(activeStep)
    if(idx>0) setActiveStep(steps[idx-1])
  }

  const apply = () => {
    console.log('Apply called with selections:', {
      plannerTeamId: sel.teamId || null,
      plannerChannelId: sel.channelId || null,
      plannerPlanId: sel.planId || null,
      plannerBucketId: sel.bucketId || null,
    })
    props.onApply({
      plannerTeamId: sel.teamId || null,
      plannerChannelId: sel.channelId || null,
      plannerPlanId: sel.planId || null,
      plannerBucketId: sel.bucketId || null,
    })
    // Close modal after applying settings
    onClose()
  }

  const filtered = (list:any[], q:string) => q? list.filter(i=>i.name.toLowerCase().includes(q.toLowerCase())): list

  const currentList = () => {
    if(activeStep==='team') return filtered(teams, queries.team)
    if(activeStep==='plan') return filtered(plans, queries.plan)
    if(activeStep==='bucket') return filtered(buckets, queries.bucket)
    return []
  }

  const stepTitle = (k:StepKey) => {
    if(k==='team') return t('planner.team') || 'Team'
    if(k==='plan') return t('planner.plan') || 'Plan'
    if(k==='bucket') return t('planner.bucket') || 'Bucket'
    return t('planner.summary') || 'Summary'
  }

  const stepIcon = (k:StepKey) => {
    if(k==='team') return Users
    if(k==='plan') return Calendar
    if(k==='bucket') return Archive
    return CheckCircle2
  }

  const stepColors = {
    team: 'text-blue-500',
    channel: 'text-purple-500', 
    plan: 'text-green-500',
    bucket: 'text-orange-500',
    summary: 'text-primary-500'
  }

  const currentStepIndex = steps.indexOf(activeStep)
  const progressPercentage = ((currentStepIndex + 1) / steps.length) * 100

  const globalLoading = loading.teams || (sel.teamId && loading.plans) || (sel.planId && loading.buckets)

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" hideCloseButton classNames={{wrapper:"z-[13000]", backdrop:"z-[12990]"}}>
      <ModalContent>
        <ModalHeader className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{t('planner.destinationModalTitle') || 'Select Planner Destination'}</h2>
              <p className="text-sm text-default-500 mt-1">Configure your Microsoft Planner integration settings</p>
            </div>
            <Button isIconOnly variant="light" onPress={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          
          {/* Progress Bar */}
          <div className="space-y-2">
            <Progress
              value={progressPercentage}
              color="primary"
              className="w-full"
              size="sm"
            />
            <div className="flex items-center justify-between text-xs text-default-500">
              <span>Step {currentStepIndex + 1} of {steps.length}</span>
              <span>{Math.round(progressPercentage)}% Complete</span>
            </div>
          </div>

       
        </ModalHeader>

        <ModalBody className="space-y-4 relative">
          {globalLoading && (
            <div className="absolute inset-0 bg-content1/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 rounded-lg">
              <Spinner size="lg" color="primary" />
              <p className="text-sm text-default-600 mt-2">Loading {stepTitle(activeStep).toLowerCase()}...</p>
            </div>
          )}

          {activeStep !== 'summary' ? (
            <>
              {/* Current Step Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {React.createElement(stepIcon(activeStep), { className: `w-5 h-5 ${stepColors[activeStep]}` })}
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{stepTitle(activeStep)}</h3>
                    <p className="text-xs text-default-500">
                      {activeStep === 'team' && 'Choose your Microsoft Teams team'}
                      {activeStep === 'plan' && 'Pick a Planner plan (showing all team plans)'}
                      {activeStep === 'bucket' && 'Choose a bucket for tasks'}
                    </p>
                  </div>
                </div>
                
                {/* Clear Selection Button */}
                {((activeStep==='team' && sel.teamId) || 
                  (activeStep==='plan' && sel.planId) || 
                  (activeStep==='bucket' && sel.bucketId)) && (
                  <Button size="sm" variant="flat" color="warning" onPress={() => resetFrom(activeStep)}>
                    <X className="w-3 h-3" />
                    Clear
                  </Button>
                )}
              </div>

              {/* Search Input */}
              <Input
                size="md"
                placeholder={`${t('common.search')||'Search'} ${stepTitle(activeStep).toLowerCase()}...`}
                value={queries[activeStep]}
                onValueChange={(v) => setQueries(q => ({...q, [activeStep]: v}))}
                startContent={<Search className="w-4 h-4 text-default-400" />}
                isClearable
                variant="bordered"
              />

              {/* Items List */}
              <Card className="flex-1">
                <CardBody className="p-0">
                  {currentList().length > 0 ? (
                    <div className="max-h-[320px] overflow-y-auto divide-y divide-default-100">{currentList().map(item => {
                        const isSelected = (activeStep==='team' && sel.teamId===item.id) || 
                                         (activeStep==='plan' && sel.planId===item.id) || 
                                         (activeStep==='bucket' && sel.bucketId===item.id)
                        
                        return (
                          <button
                            key={item.id}
                            className={`w-full text-left p-4 flex items-center justify-between hover:bg-default-50 transition-colors ${
                              isSelected ? 'bg-primary-50 border-l-4 border-l-primary-500' : ''
                            }`}
                            onClick={() => {
                              if(activeStep==='team'){ 
                                setSel({teamId:item.id, channelId:null, planId:null, bucketId:null}); 
                                setPlans([]); 
                                setBuckets([]);
                                // Auto-advance to next step
                                setTimeout(() => goNext(), 100);
                              }
                              if(activeStep==='plan'){ 
                                setSel(s=>({...s, planId:item.id, bucketId:null})); 
                                setBuckets([]);
                                // Auto-advance to next step
                                setTimeout(() => goNext(), 100);
                              }
                              if(activeStep==='bucket'){ 
                                setSel(s=>({...s, bucketId:item.id}));
                                // Auto-advance to next step (summary)
                                setTimeout(() => goNext(), 100);
                              }
                            }}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {React.createElement(stepIcon(activeStep), { className: `w-4 h-4 ${stepColors[activeStep]} flex-shrink-0` })}
                              <span className="text-sm font-medium truncate text-foreground">{item.name}</span>
                            </div>
                            {isSelected && (
                              <CheckCircle2 className="w-5 h-5 text-primary-500 flex-shrink-0" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      {loading[activeStep+'s' as keyof typeof loading] ? (
                        <>
                          <Spinner size="md" color="primary" />
                          <p className="text-sm text-default-500 mt-2">{t('common.loading')||'Loading...'}</p>
                        </>
                      ) : (
                        <>
                          <Circle className="w-12 h-12 text-default-300 mb-2" />
                          <p className="text-sm text-default-500">{t('planner.emptyList') || 'No entries found'}</p>
                          <p className="text-xs text-default-400 mt-1">Try adjusting your search</p>
                        </>
                      )}
                    </div>
                  )}
                </CardBody>
              </Card>
            </>
          ) : (
            <>
              {/* Summary Step */}
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-primary-100">
                  <CheckCircle2 className="w-5 h-5 text-primary-500" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Configuration Summary</h3>
                  <p className="text-xs text-default-500">Review your Microsoft Planner integration settings</p>
                </div>
              </div>

              <Card className="border border-default-200">
                <CardBody className="p-6 space-y-6">
                  <div className="grid grid-cols-1 gap-4">
                    {/* Team */}
                    <div className="flex items-center justify-between p-4 bg-default-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Users className="w-4 h-4 text-blue-500" />
                        <div>
                          <p className="text-sm font-medium text-foreground">Team</p>
                          <p className="text-xs text-default-500">{teams.find(t=>t.id===sel.teamId)?.name || 'Not selected'}</p>
                        </div>
                      </div>
                      <Chip size="sm" color={sel.teamId ? 'success' : 'default'} variant="flat">
                        {sel.teamId ? 'Selected' : 'Required'}
                      </Chip>
                    </div>

                    {/* Plan */}
                    <div className="flex items-center justify-between p-4 bg-default-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Calendar className="w-4 h-4 text-green-500" />
                        <div>
                          <p className="text-sm font-medium text-foreground">Planner Plan</p>
                          <p className="text-xs text-default-500">{plans.find(p=>p.id===sel.planId)?.name || 'Not selected'}</p>
                        </div>
                      </div>
                      <Chip size="sm" color={sel.planId ? 'success' : 'default'} variant="flat">
                        {sel.planId ? 'Selected' : 'Required'}
                      </Chip>
                    </div>

                    {/* Bucket */}
                    <div className="flex items-center justify-between p-4 bg-default-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Archive className="w-4 h-4 text-orange-500" />
                        <div>
                          <p className="text-sm font-medium text-foreground">Bucket</p>
                          <p className="text-xs text-default-500">{buckets.find(b=>b.id===sel.bucketId)?.name || 'Not selected'}</p>
                        </div>
                      </div>
                      <Chip size="sm" color={sel.bucketId ? 'success' : 'default'} variant="flat">
                        {sel.bucketId ? 'Selected' : 'Required'}
                      </Chip>
                    </div>
                  </div>

                  {(!sel.teamId || !sel.planId || !sel.bucketId) && (
                    <div className="flex items-center gap-2 p-3 bg-warning-50 border border-warning-200 rounded-lg">
                      <Circle className="w-4 h-4 text-warning-500 flex-shrink-0" />
                      <p className="text-xs text-warning-700">Please complete all required selections before applying</p>
                    </div>
                  )}
                </CardBody>
              </Card>
            </>
          )}
        </ModalBody>

        <ModalFooter>
          <div className="flex items-center justify-between w-full">
            <div className="flex gap-2">
              <Button variant="light" onPress={onClose}>
                {t('common.cancel')}
              </Button>
              <Button 
                variant="bordered" 
                onPress={goPrev} 
                isDisabled={activeStep==='team'}
                startContent={<ArrowLeft className="w-4 h-4" />}
              >
                {t('common.back')}
              </Button>
            </div>
            <div className="flex gap-2">
              {activeStep === 'summary' ? (
                <Button 
                  color="primary" 
                  isDisabled={!sel.teamId || !sel.planId || !sel.bucketId} 
                  onPress={apply}
                  startContent={<CheckCircle2 className="w-4 h-4" />}
                >
                  {t('planner.applyDestination') || 'Apply Selection'}
                </Button>
              ) : (
                <Button 
                  variant="bordered" 
                  onPress={goNext} 
                  isDisabled={!canNext()}
                  endContent={<ArrowRight className="w-4 h-4" />}
                >
                  {t('common.next')}
                </Button>
              )}
            </div>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
