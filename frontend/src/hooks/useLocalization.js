import { useSelector } from 'react-redux'
import { selectLocalization } from '../store/localizationSlice'
import { formatDate, formatDateTime, formatTime } from '../utils/dateFormatter'

/**
 * Returns tenant-aware formatting helpers bound to the current Redux
 * localization settings.  Use in any component that needs to display dates.
 *
 * Usage:
 *   const { fmtDate, fmtDateTime, fmtTime, settings } = useLocalization()
 *   fmtDate(someIsoString)   // "20/06/2026"  (respects tenant date_format)
 *   fmtDateTime(someIsoString) // "20/06/2026 02:30 PM"
 */
export function useLocalization() {
  const settings = useSelector(selectLocalization)

  return {
    settings,
    fmtDate:     (v) => formatDate(v, settings),
    fmtDateTime: (v) => formatDateTime(v, settings),
    fmtTime:     (v) => formatTime(v, settings),
  }
}

export default useLocalization
