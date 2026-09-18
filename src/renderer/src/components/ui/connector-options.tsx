import {
  ArrowRight,
  ArrowRightLeft,
  CornerDownRight,
  Minus,
  Spline,
  TrendingUp
} from 'lucide-react'
import type { ArrowHead, ConnectorRoute } from '@shared/canvas/element-types'
import type { UiStringKey } from '@/i18n/ui-strings'

/** The route and arrowhead choices, shared by the tool flyout and the properties panel. */
export type ConnectorOption<T> = { value: T; label: UiStringKey; icon: typeof TrendingUp }

export const connectorRouteOptions: readonly ConnectorOption<ConnectorRoute>[] = [
  { value: 'straight', label: 'connector.route.straight', icon: TrendingUp },
  { value: 'orthogonal', label: 'connector.route.orthogonal', icon: CornerDownRight },
  { value: 'curved', label: 'connector.route.curved', icon: Spline }
]

export const connectorHeadOptions: readonly ConnectorOption<[ArrowHead, ArrowHead]>[] = [
  { value: ['none', 'none'], label: 'connector.ends.line', icon: Minus },
  { value: ['none', 'arrow'], label: 'connector.ends.arrow', icon: ArrowRight },
  { value: ['arrow', 'arrow'], label: 'connector.ends.doubleArrow', icon: ArrowRightLeft }
]
