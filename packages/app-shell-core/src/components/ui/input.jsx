import * as React from "react"

import { cn } from "../../lib/utils.js"
import { FIELD_HEIGHT, FIELD_PADDING } from "./formDensity.js"

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        `flex ${FIELD_HEIGHT} w-full rounded-lg border border-[#D1D4DB] bg-[#F5F7F9] ${FIELD_PADDING} text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-[#828FA3] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50`,
        className
      )}
      ref={ref}
      {...props} />
  );
})
Input.displayName = "Input"

export { Input }
