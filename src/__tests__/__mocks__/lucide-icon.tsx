import { forwardRef } from 'react'

const LucideIcon = forwardRef<SVGSVGElement, React.SVGAttributes<SVGSVGElement>>(
  (props, ref) => <svg ref={ref} {...props} />
)
LucideIcon.displayName = 'LucideIcon'

export default LucideIcon
