"use client"
import { Input, Button, Divider, Card, CardBody, CardHeader, Select, SelectItem } from '@heroui/react'
import { useTranslation } from '../hooks/useTranslation'

interface DeadlinePanelProps {
	universalDeadlineDays: number | ''
	deadlineInputField: string | null
	flow: any
	onChange: (changes: any) => Promise<void>
}

export function DeadlinePanel({ universalDeadlineDays, deadlineInputField, flow, onChange }: DeadlinePanelProps){
	const { t } = useTranslation()
	
	const DEADLINE_DEFAULT_DAYS = 30
	
	// Get all date input fields from the flow (regardless of table columns)
	const getDateColumns = () => {
		const dateColumns: Array<{ key: string; label: string; type: 'built-in' | 'initial-input' | 'node-input' }> = []
		
		// Built-in date columns (always available)
		dateColumns.push(
			{ key: 'created', label: t('common.created') || 'Created', type: 'built-in' },
			{ key: 'lastUpdate', label: t('common.lastUpdate') || 'Last Update', type: 'built-in' }
		)
		
		// Get all date inputs from initial node
		const initialNode = flow.nodes.find((node: any) => node.type === "initial")
		if (initialNode?.data?.inputs) {
			initialNode.data.inputs.forEach((input: any) => {
				if (input.type === 'date') {
					dateColumns.push({
						key: input.label,
						label: input.label,
						type: 'initial-input'
					})
				}
			})
		}
		
		// Get all date inputs from all other nodes
		flow.nodes.forEach((node: any) => {
			if (node.type !== "initial" && node.data?.inputs) {
				node.data.inputs.forEach((input: any) => {
					if (input.type === 'date') {
						// Use the format "NodeName: InputName" for node inputs
						const key = `${node.data.label}: ${input.label}`
						const label = `${node.data.label}: ${input.label}`
						dateColumns.push({
							key,
							label,
							type: 'node-input'
						})
					}
				})
			}
		})
		
		return dateColumns
	}
	
	const dateColumns = getDateColumns()
	
	// Get the currently selected deadline field and days
	const selectedField = deadlineInputField
	const selectedDays = typeof universalDeadlineDays === 'number' ? universalDeadlineDays : DEADLINE_DEFAULT_DAYS
	
	console.log('DeadlinePanel render:', { 
		deadlineInputField, 
		universalDeadlineDays, 
		selectedField, 
		selectedDays,
		dateColumns: dateColumns.length,
		availableKeys: dateColumns.map(c => c.key),
		selectedKeys: selectedField ? [selectedField] : [],
		keyExists: selectedField ? dateColumns.some(c => c.key === selectedField) : false
	})

	return (
		<div className="space-y-4">
			<div className="space-y-3">
				<h4 className="text-sm font-medium text-default-700">{t('deadlines.title')}</h4>
				<p className="text-xs text-default-500">
					{t('deadlines.singleHelp') || 'Choose one date column and set how many days after that date the deadline should be.'}
				</p>
			</div>
			
			{dateColumns.length === 0 ? (
				<div className="p-4 border border-dashed border-default-300 rounded-lg text-center">
					<p className="text-sm text-default-500">
						{t('deadlines.noDateColumns')}
					</p>
				</div>
			) : (
				<div className="space-y-4">
					{/* Select date column */}
					<div>
						<Select
							key={`deadline-select-${selectedField || 'none'}`}
							label={t('deadlines.selectColumn') || 'Select Date Column'}
							placeholder={t('deadlines.selectColumnPlaceholder') || 'Choose a date column for deadlines'}
							selectedKeys={selectedField ? [selectedField] : []}
							selectionMode="single"
							onSelectionChange={(keys) => {
								const selectedKey = Array.from(keys)[0] as string
								console.log('Deadline field selection changed:', { 
									keys: Array.from(keys), 
									selectedKey,
									typeof: typeof selectedKey,
									currentSelectedField: selectedField,
									allKeys: dateColumns.map(c => c.key)
								})
								const changeObject = {
									deadlineInputField: selectedKey || null
								}
								console.log('Calling onChange with:', changeObject)
								onChange(changeObject)
							}}
							className="w-full"
							disallowEmptySelection={false}
						>
							{dateColumns.map((column) => (
								<SelectItem key={column.key}>
									{column.label}
								</SelectItem>
							))}
						</Select>
						
						{/* Debug info - remove when working */}
						<div className="text-xs text-default-500 p-2 bg-default-50 rounded">
							Debug: selectedField="{selectedField}", availableKeys=[{dateColumns.map(c => c.key).join(', ')}], 
							keyExists={selectedField ? dateColumns.some(c => c.key === selectedField) : false}
						</div>
					</div>
					
					{/* Days input - only show if a column is selected */}
					{selectedField && (
						<div>
							<Input
								type="number"
								label={t('deadlines.daysLabel') || 'Days After Date'}
								placeholder={t('deadlines.daysPlaceholder') || 'Enter number of days'}
								value={String(selectedDays)}
								onValueChange={(val) => {
									const days = Math.max(1, parseInt(val || '1', 10) || DEADLINE_DEFAULT_DAYS)
									console.log('Deadline days changed to:', days)
									onChange({
										universalDeadlineDays: days
									})
								}}
								min={1}
								max={365}
								className="w-full"
								description={t('deadlines.daysDescription') || 'Items will be due this many days after the date in the selected column'}
							/>
						</div>
					)}
					
					{/* Summary */}
					{selectedField && (
						<div className="p-3 bg-default-100 rounded-lg">
							<p className="text-sm text-default-700">
								<strong>{t('deadlines.summary') || 'Summary'}:</strong>{' '}
								{t('deadlines.summaryText', { 
									days: selectedDays, 
									column: dateColumns.find(col => col.key === selectedField)?.label || selectedField 
								}) || `Deadlines will be set to ${selectedDays} days after the date in "${dateColumns.find(col => col.key === selectedField)?.label || selectedField}"`}
							</p>
						</div>
					)}
				</div>
			)}
		</div>
	)
}
