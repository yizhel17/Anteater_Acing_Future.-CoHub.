interface CourseChipProps {
  code: string
  name: string
  checked: boolean
  onToggle: () => void
}

export function CourseChip({ code, name, checked, onToggle }: CourseChipProps) {
  return (
    <label className={`course-chip${checked ? ' selected' : ''}`}>
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <span className="chip-inner">
        <strong>{code}</strong> {name}
      </span>
    </label>
  )
}
