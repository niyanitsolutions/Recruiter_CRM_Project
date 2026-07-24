/**
 * useTelephonyCall — focused view over TelephonyContext for components that
 * only care about the current in-progress call (softphone in-call view,
 * outgoing call state, header status widget) without pulling in favorites/
 * dial actions they don't need.
 */
import { useTelephony } from '../context/TelephonyContext'

export function useTelephonyCall() {
  const { activeCall, incomingCall, elapsedSeconds, capabilities, callControl, transferActive } = useTelephony()

  return {
    activeCall,
    incomingCall,
    elapsedSeconds,
    capabilities,
    hangup: (extra) => callControl('hangup', extra),
    hold: (extra) => callControl('hold', extra),
    resume: (extra) => callControl('resume', extra),
    mute: (extra) => callControl('mute', extra),
    unmute: (extra) => callControl('unmute', extra),
    transfer: transferActive,
  }
}

export default useTelephonyCall
