import { forwardRef } from 'react'
import { Link as RouterLink, type LinkProps as RouterLinkProps } from 'react-router-dom'

type RouterLinkAdapterProps = Omit<RouterLinkProps, 'to'> & { href?: string }

export const RouterLinkAdapter = forwardRef<HTMLAnchorElement, RouterLinkAdapterProps>(
  ({ href, ...props }, ref) => <RouterLink ref={ref} to={href ?? '#'} {...props} />,
)
RouterLinkAdapter.displayName = 'RouterLinkAdapter'
